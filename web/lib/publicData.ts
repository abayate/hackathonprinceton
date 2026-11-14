import type { Filters, Site } from "./sites";
import { band } from "./model";
import { parseAsOf, parseMaxWaterStress } from "./params";
import { parseModelCard } from "./modelCard";

type CsvRow = Record<string, string>;
export type PublicDataset = { sites: Site[]; trained: string; modelVersion: string };

/** RFC 4180 fields, including escaped quotes and line breaks inside quoted fields. */
export function parseCsv(input: string): CsvRow[] {
  const source = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (source[i + 1] === '"') { field += '"'; i++; }
      else { quoted = false; closedQuote = true; }
      continue;
    }
    if (char === "," || char === "\n" || char === "\r") {
      row = [...row, field]; field = ""; closedQuote = false;
      if (char !== ",") {
        rows.push(row); row = [];
        if (char === "\r" && source[i + 1] === "\n") i++;
      }
    } else if (char === '"' && field === "" && !closedQuote) quoted = true;
    else {
      if (char === '"' || closedQuote) throw new Error("Invalid CSV quote");
      field += char;
    }
  }
  if (quoted) throw new Error("Unterminated CSV quote");
  if (field || row.length || closedQuote) rows.push([...row, field]);
  const headers = rows[0];
  if (!headers?.length || headers.some((h) => !h.trim()) || new Set(headers).size !== headers.length) throw new Error("Invalid CSV headers");
  return rows.slice(1).map((values) => {
    if (values.length !== headers.length) throw new Error("CSV row has a different number of fields");
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}

function required(row: CsvRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Public data is missing ${key}`);
  return value;
}

function numeric(row: CsvRow, key: string, min = -Infinity, max = Infinity): number {
  const value = Number(required(row, key));
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Public data has invalid ${key}`);
  return value;
}

function optionalNumber(row: CsvRow, key: string): number | null {
  return row[key] === "" ? null : numeric(row, key, 0);
}

function yes(row: CsvRow, key: string): boolean | null {
  if (row[key] === "") return null;
  if (!["yes", "no"].includes(row[key])) throw new Error(`Public data has invalid ${key}`);
  return row[key] === "yes";
}

function uniqueRows(rows: CsvRow[]): Map<string, CsvRow> {
  const ids = rows.map((r) => required(r, "project_id"));
  if (new Set(ids).size !== ids.length) throw new Error("Public data contains duplicate project IDs");
  return new Map(rows.map((r) => [r.project_id, r]));
}

const FEATURES = ["in_city_limits", "in_urban_area", "log_county_density", "log_km_to_metro", "is_crypto", "log_county_projects"] as const;
type ScoringModel = { coefficients: number[]; intercept: number; means: number[]; stds: number[] };

function scoringModel(artifact: unknown, comparison: string): ScoringModel {
  // parseModelCard has checked the enclosing structure and finite named coefficients.
  const selected = (artifact as { comparisons: Record<string, Record<string, unknown>> }).comparisons[comparison];
  const coefficients = selected.coefficients as Record<string, number>;
  if (Object.keys(coefficients).join(",") !== FEATURES.join(",")) throw new Error("Public scoring feature order differs from the loader");
  const array = (value: unknown, positive: boolean): number[] => {
    if (!Array.isArray(value) || value.length !== FEATURES.length || value.some((v) => typeof v !== "number" || !Number.isFinite(v) || (positive && v <= 0))) throw new Error("Invalid public scoring parameters");
    return value;
  };
  const intercept = selected.intercept;
  if (typeof intercept !== "number" || !Number.isFinite(intercept)) throw new Error("Invalid public scoring intercept");
  return { coefficients: FEATURES.map((f) => coefficients[f]), intercept, means: array(selected.feature_mean, false), stds: array(selected.feature_std, true) };
}

function score(model: ScoringModel, f: CsvRow): number {
  const values = [
    yes(f, "in_city_limits") ? 1 : 0, yes(f, "in_urban_area") ? 1 : 0,
    Math.log10(numeric(f, "county_density_per_sqmi", 0) + 1),
    Math.log10(numeric(f, "km_to_nearest_metro", 0) + 1),
    yes(f, "is_crypto") ? 1 : 0, Math.log10(numeric(f, "county_tracked_projects", 1)),
  ];
  const z = values.reduce((sum, v, i) => sum + model.coefficients[i] * (v - model.means[i]) / model.stds[i], model.intercept);
  return Math.round((1 / (1 + Math.exp(-z))) * 10000) / 10000;
}

export function buildPublicDataset(projectCsv: string, featureCsv: string, artifact: unknown): PublicDataset {
  const card = parseModelCard(artifact);
  if (!parseAsOf(card.trained)) throw new Error("Public model trained date must be YYYY-MM-DD");
  const model = scoringModel(artifact, card.defaultModel);
  const projects = uniqueRows(parseCsv(projectCsv));
  const features = uniqueRows(parseCsv(featureCsv));
  if (projects.size !== features.size || [...projects.keys()].some((id) => !features.has(id))) throw new Error("Public CSVs must have matching project IDs");
  const modelVersion = `logreg-${card.defaultModel}-${card.trained}`;
  const sites = [...projects.values()].map((p): Site => {
    const f = features.get(p.project_id)!;
    const reliable = yes(f, "location_reliable") === true;
    const risk = reliable ? score(model, f) : null;
    return {
      project_id: p.project_id, name: required(p, "name"), company: p.company || null,
      county: required(p, "county"), lat: numeric(p, "lat", -90, 90), lng: numeric(p, "lng", -180, 180),
      coord_precision: required(p, "coord_precision"), capacity_mw: optionalNumber(p, "capacity_mw"), land_acres: optionalNumber(p, "land_acres"),
      tracker_status: required(p, "tracker_status"), label: required(p, "label"), stop_event_date: p.stop_event_date || null,
      primary_source_url: p.primary_source_url || null, primary_source_name: p.primary_source_name || null, tracker_url: required(p, "tracker_url"),
      city: f.city || null, in_city_limits: yes(f, "in_city_limits"), in_urban_area: yes(f, "in_urban_area"),
      county_density_per_sqmi: optionalNumber(f, "county_density_per_sqmi"), nearest_metro: required(f, "nearest_metro"),
      km_to_nearest_metro: numeric(f, "km_to_nearest_metro", 0), is_crypto: yes(f, "is_crypto") === true,
      county_tracked_projects: numeric(f, "county_tracked_projects", 1),
      water_stress_score: optionalNumber(f, "water_stress_score"), water_stress_label: f.water_stress_label || null,
      location_reliable: reliable, p_stopped: risk,
      in_training_set: reliable ? yes(p, "use_for_training") === true && (card.defaultModel !== "recent" || p.tracker_status !== "operational") : null,
      model_version: reliable ? modelVersion : null, scored_at: reliable ? `${card.trained}T00:00:00Z` : null, band: band(risk),
    };
  });
  return { sites, trained: card.trained, modelVersion };
}

export function filterPublicSites(sites: readonly Site[], filters: Filters): Site[] {
  const status = filters.status ?? "proposed";
  const label = status === "proposed" ? "unlabeled" : status === "built" || status === "stopped" ? status : undefined;
  const query = filters.q?.toLocaleLowerCase();
  const water = parseMaxWaterStress(filters.water);
  return sites.filter((s) => (!label || s.label === label)
    && (!query || [s.name, s.county, s.city ?? ""].some((v) => v.toLocaleLowerCase().includes(query)))
    && (!filters.band || s.band === filters.band)
    && (water === undefined || (s.water_stress_score !== null && s.water_stress_score <= water)))
    .sort((a, b) => (filters.sort === "name" ? 0 : (a.p_stopped ?? Infinity) - (b.p_stopped ?? Infinity)) || a.name.localeCompare(b.name));
}

function distanceKm(a: Site, b: Site): number {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLng = (b.lng - a.lng) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLng / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function nearbyPublicSites(sites: readonly Site[], id: string, limit = 3) {
  const current = sites.find((s) => s.project_id === id);
  if (!current || current.p_stopped === null) return [];
  return sites.filter((s) => s.project_id !== id && s.label !== "stopped" && s.p_stopped !== null && s.p_stopped < current.p_stopped!)
    .map((s) => ({ project_id: s.project_id, name: s.name, county: s.county, label: s.label, p_stopped: s.p_stopped!, band: s.band, km: distanceKm(current, s) }))
    .sort((a, b) => a.km - b.km || a.project_id.localeCompare(b.project_id))
    .slice(0, Math.max(0, limit))
    .map((s) => ({ ...s, km: Math.round(s.km * 10) / 10 }));
}

export function publicHistory(data: PublicDataset, id: string) {
  const site = data.sites.find((s) => s.project_id === id);
  return site?.p_stopped != null ? [{ at: data.trained, p_stopped: site.p_stopped, model_version: data.modelVersion }] : [];
}

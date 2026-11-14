import { checksFor } from "./checks";
import { band, displayScore } from "./model";
import { parseAsOf } from "./params";
import { signalAppliesTo, type Signal } from "./signals";
import type { Site } from "./sites";
import { WORKSPACE_MAX_TASKS, type Candidate, type Criterion, type DiligenceTask, type Shortlisted,
  type WorkspaceBrief, type WorkspaceState } from "./workspaceTypes";

export type { Candidate, Criterion, DiligenceTask, Shortlisted, WorkspaceBrief, WorkspaceState } from "./workspaceTypes";
export { WORKSPACE_MAX_TASKS } from "./workspaceTypes";

const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/;
const CHECK_IDS = new Set(["power", "water", "zoning", "opposition", "policy", "land", "labor"]);
const CRITERIA = new Set<Criterion>(["water_stress", "model_index", "metro_distance", "reported_mw"]);
const MAX_SAVED_PROJECTS = 500;

function finiteOrNull(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

function safeUrl(value: string | null | undefined): string | null {
  if (!value || value.length > 2048 || /[\x00-\x1f\x7f]/.test(value)) return null;
  if (value === "/evidence") return value;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? value : null;
  } catch { return null; }
}

export function toCandidate(site: Site, signals: Signal[]): Candidate {
  if (![site.lat, site.lng].every(Number.isFinite)) throw new Error("Candidate has invalid coordinates");
  const kmToMetro = finiteOrNull(site.km_to_nearest_metro);
  const pStopped = site.location_reliable && kmToMetro !== null && site.p_stopped != null
    && Number.isFinite(site.p_stopped) && site.p_stopped >= 0 && site.p_stopped <= 1 ? site.p_stopped : null;
  const waterStressScore = finiteOrNull(site.water_stress_score);
  const normalized: Site = { ...site, p_stopped: pStopped,
    water_stress_score: waterStressScore, water_stress_label: waterStressScore === null ? null : site.water_stress_label };
  const checks = checksFor(normalized, signals);
  const matching = signals.filter((signal) => signalAppliesTo(signal, site.project_id, {
    county: site.county, state: "TX", city: site.city, inCityLimits: site.in_city_limits,
  }));
  const sources = [
    { label: site.primary_source_name || "Primary source", url: site.primary_source_url },
    { label: "Project tracker", url: site.tracker_url },
    ...checks.flatMap((check) => check.sources.map((source) => ({ label: source.label, url: source.url }))),
    ...matching.map((signal) => ({ label: signal.source_name, url: signal.source_url })),
  ].flatMap(({ label, url }) => {
    const safe = safeUrl(url);
    return safe ? [{ label, url: safe }] : [];
  }).filter((source, index, all) => all.findIndex((item) => item.url === source.url) === index);
  const datedRecords = matching.flatMap((signal) => {
    const url = safeUrl(signal.source_url);
    return url ? [{ scope: signal.scope, label: signal.source_name, url,
      publishedAt: signal.published_at, summary: signal.summary }] : [];
  });
  return {
    id: site.project_id, name: site.name, company: site.company, city: site.city, county: site.county,
    nearestMetro: site.nearest_metro, kmToMetro, capacityMw: finiteOrNull(site.capacity_mw),
    landAcres: finiteOrNull(site.land_acres), waterStressScore,
    waterStressLabel: waterStressScore === null ? null : site.water_stress_label,
    pStopped, band: band(pStopped), locationReliable: site.location_reliable,
    lat: site.lat, lng: site.lng, coordPrecision: site.coord_precision, trackerStatus: site.tracker_status,
    checks, recordCount: matching.length, sources, datedRecords,
  };
}

function criterionValue(candidate: Candidate, brief: WorkspaceBrief): number | null {
  if (brief.criterion === "water_stress") return finiteOrNull(candidate.waterStressScore);
  if (brief.criterion === "model_index") return finiteOrNull(candidate.pStopped);
  if (brief.criterion === "metro_distance") return brief.metro !== null && candidate.nearestMetro === brief.metro
    ? finiteOrNull(candidate.kmToMetro) : null;
  return candidate.capacityMw !== null && candidate.capacityMw >= brief.mw ? finiteOrNull(candidate.capacityMw) : null;
}

function shortlistRow(candidate: Candidate, brief: WorkspaceBrief): Shortlisted {
  const included: string[] = [`Tracker status: ${candidate.trackerStatus}`];
  if (brief.county !== null) included.push(`County: ${candidate.county}`);
  if (brief.metro !== null) included.push(`Nearest metro: ${candidate.nearestMetro}`);
  const sortValue = criterionValue(candidate, brief);
  if (brief.criterion === "water_stress" && sortValue !== null) {
    included.push(`Basin water stress: ${sortValue}${candidate.waterStressLabel ? ` (${candidate.waterStressLabel})` : ""}`);
  } else if (brief.criterion === "model_index" && sortValue !== null) {
    included.push(`Model index: ${displayScore(sortValue)}/100`);
  } else if (brief.criterion === "metro_distance" && sortValue !== null) {
    included.push(`Distance to ${candidate.nearestMetro}: ${sortValue} km`);
  } else if (brief.criterion === "reported_mw" && sortValue !== null) {
    included.push(`Reported capacity: ${sortValue} MW meets ${brief.mw} MW target`);
  }
  const missing = [
    ...(candidate.capacityMw === null ? ["Reported capacity unknown"] : []),
    ...(!candidate.locationReliable ? ["Location unreliable"] : []),
    ...candidate.checks.filter((check) => check.status === "unknown")
      .map((check) => `${check.title}: ${check.detail}`),
  ];
  if (sortValue === null) missing.push(`No data for ${brief.criterion.replaceAll("_", " ")} criterion`);
  return { candidate, included, missing, sortValue };
}

export function shortlist(all: Candidate[], brief: WorkspaceBrief): Shortlisted[] {
  if (brief.criterion === "metro_distance" && brief.metro === null) return [];
  return all.filter((candidate) => (brief.county === null || candidate.county === brief.county)
    && (brief.metro === null || candidate.nearestMetro === brief.metro)
    && (brief.criterion !== "reported_mw" || candidate.capacityMw === null || candidate.capacityMw >= brief.mw))
    .map((candidate) => shortlistRow(candidate, brief))
    .sort((a, b) => (a.sortValue === null && b.sortValue === null ? 0
      : a.sortValue === null ? 1 : b.sortValue === null ? -1 : a.sortValue - b.sortValue)
      || a.candidate.name.localeCompare(b.candidate.name) || a.candidate.id.localeCompare(b.candidate.id));
}

export function tasksFor(candidate: Candidate): DiligenceTask[] {
  const task = (suffix: string, checkId: string | null, text: string,
    origin: DiligenceTask["origin"]): DiligenceTask => ({
    id: `${candidate.id}:${suffix}`, projectId: candidate.id, checkId, text, origin, done: false,
  });
  return [
    ...candidate.checks.filter((check) => check.status === "unknown")
      .map((check) => task(`check:${check.id}`, check.id,
        `Resolve ${check.title}: ${check.detail}`, "unknown_check")),
    ...(candidate.capacityMw === null ? [task("field:capacity", null, "Confirm the project's capacity in MW.", "missing_field")] : []),
    ...(!candidate.locationReliable ? [task("field:location", null, "Confirm the project's location and county.", "missing_field")] : []),
    ...(candidate.recordCount > 0 ? [task("records:review", null,
      `Review ${candidate.recordCount} dated evidence ${candidate.recordCount === 1 ? "record" : "records"} and its source before relying on it.`, "dated_record")] : []),
    task("verify:power-capacity", "power", "Confirm grid capacity and time to connect at this project.", "missing_field"),
    task("verify:water-supply", "water", "Confirm water supply and rights at this project; basin stress alone does not establish availability.", "missing_field"),
    task("verify:flood-terrain", "land", "Confirm reported land acreage, flood zone and terrain for this project.", "missing_field"),
    task("verify:zoning-approval", "zoning", "Verify zoning and permit approval for this project; jurisdiction alone does not confirm approval.", "missing_field"),
  ];
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const found = Object.keys(value);
  return found.length === keys.length && found.every((key) => keys.includes(key));
}

function validPlace(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 100
    && value === value.trim() && !/[\x00-\x1f\x7f]/.test(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40
    && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(value)
    && !!parseAsOf(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}

function validBrief(value: unknown): value is WorkspaceBrief {
  if (!plainObject(value) || !exactKeys(value, ["metro", "county", "mw", "criterion"])) return false;
  const metro = value.metro === null || validPlace(value.metro);
  const county = value.county === null || validPlace(value.county);
  return metro && county && !(value.metro !== null && value.county !== null)
    && typeof value.mw === "number" && Number.isFinite(value.mw) && value.mw >= 1 && value.mw <= 10000
    && CRITERIA.has(value.criterion as Criterion)
    && (value.criterion !== "metro_distance" || value.metro !== null);
}

function validRecord(value: unknown, kind: "decision" | "note"): value is Record<string, string> {
  if (!plainObject(value) || Object.keys(value).length > MAX_SAVED_PROJECTS) return false;
  return Object.entries(value).every(([id, entry]) => UUID.test(id) &&
    (kind === "decision" ? ["pursue", "hold", "drop"].includes(entry as string)
      : typeof entry === "string" && entry.length <= 4000));
}

function validTask(value: unknown): value is DiligenceTask {
  if (!plainObject(value) || !exactKeys(value, ["id", "projectId", "checkId", "text", "origin", "done"])) return false;
  return typeof value.id === "string" && TASK_ID.test(value.id)
    && typeof value.projectId === "string" && UUID.test(value.projectId)
    && (value.checkId === null || (typeof value.checkId === "string" && CHECK_IDS.has(value.checkId)))
    && typeof value.text === "string" && value.text.trim().length > 0 && value.text.length <= 500
    && ["unknown_check", "missing_field", "dated_record", "user"].includes(value.origin as string)
    && typeof value.done === "boolean";
}

/** Parse saved browser state without trusting its shape or retaining its prototype. */
export function parseState(raw: unknown): WorkspaceState | null {
  if (!plainObject(raw) || !exactKeys(raw,
    ["version", "brief", "selectedIds", "decisions", "notes", "tasks", "updatedAt"])) return null;
  if (raw.version !== 1 || !validBrief(raw.brief) || !Array.isArray(raw.selectedIds)
    || raw.selectedIds.length > 4 || !raw.selectedIds.every((id) => typeof id === "string" && UUID.test(id))
    || new Set(raw.selectedIds).size !== raw.selectedIds.length
    || !validRecord(raw.decisions, "decision") || !validRecord(raw.notes, "note")
    || !Array.isArray(raw.tasks) || raw.tasks.length > WORKSPACE_MAX_TASKS || !raw.tasks.every(validTask)
    || new Set(raw.tasks.map((task: DiligenceTask) => task.id)).size !== raw.tasks.length
    || !validTimestamp(raw.updatedAt)) return null;
  return {
    version: 1, brief: { ...raw.brief }, selectedIds: [...raw.selectedIds],
    decisions: Object.fromEntries(Object.entries(raw.decisions)) as WorkspaceState["decisions"],
    notes: Object.fromEntries(Object.entries(raw.notes)),
    tasks: raw.tasks.map((task: DiligenceTask) => ({ ...task })), updatedAt: raw.updatedAt,
  };
}

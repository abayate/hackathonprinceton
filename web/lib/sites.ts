import "server-only";
import { pool } from "./db";
import { band, type Band } from "./model";
import { isPublicDataMode } from "./dataMode";
import { isClientId, parseMaxWaterStress } from "./params";

export type Site = {
  project_id: string;
  name: string;
  company: string | null;
  county: string;
  lat: number;
  lng: number;
  coord_precision: string;
  capacity_mw: number | null;
  land_acres: number | null;
  tracker_status: string;
  label: string;
  stop_event_date: string | null;
  primary_source_url: string | null;
  primary_source_name: string | null;
  tracker_url: string;
  city: string | null;
  in_city_limits: boolean | null;
  in_urban_area: boolean | null;
  county_density_per_sqmi: number | null;
  nearest_metro: string;
  km_to_nearest_metro: number;
  is_crypto: boolean;
  county_tracked_projects: number;
  water_stress_score: number | null;
  water_stress_label: string | null;
  location_reliable: boolean;
  p_stopped: number | null;
  in_training_set: boolean | null;
  model_version: string | null;
  scored_at: string | null;
  band: Band | null;
};

export type Filters = {
  status?: string; // proposed | built | stopped | all
  q?: string;
  band?: string; // green | watch | red
  water?: string; // max water stress score
  sort?: string; // risk | name
};

const BASE = `
  WITH latest AS (
    SELECT DISTINCT ON (project_id) project_id, p_stopped, in_training_set, model_version, scored_at
    FROM risk_scores ORDER BY project_id, scored_at DESC
  )
  SELECT p.project_id, p.name, p.company, p.county, p.lat, p.lng, p.coord_precision,
         p.capacity_mw, p.land_acres, p.tracker_status, p.label,
         to_char(p.stop_event_date, 'YYYY-MM-DD') AS stop_event_date,
         p.primary_source_url, p.primary_source_name, p.tracker_url,
         f.city, f.in_city_limits, f.in_urban_area, f.county_density_per_sqmi,
         f.nearest_metro, f.km_to_nearest_metro, f.is_crypto, f.county_tracked_projects,
         f.water_stress_score, f.water_stress_label, f.location_reliable,
         l.p_stopped, l.in_training_set, l.model_version, l.scored_at
  FROM tx_projects p
  JOIN tx_project_features f USING (project_id)
  LEFT JOIN latest l USING (project_id)
`;

function withBand(r: Omit<Site, "band">): Site {
  return { ...r, band: band(r.p_stopped) };
}

export async function listSites(f: Filters): Promise<Site[]> {
  if (isPublicDataMode()) return (await import("./publicStore")).listPublicSites(f);
  const where: string[] = [];
  const args: unknown[] = [];
  const status = f.status ?? "proposed";
  if (status === "proposed") where.push(`p.label = 'unlabeled'`);
  else if (status === "built") where.push(`p.label = 'built'`);
  else if (status === "stopped") where.push(`p.label = 'stopped'`);
  if (f.q) {
    args.push(`%${f.q}%`);
    where.push(`(p.name ILIKE $${args.length} OR p.county ILIKE $${args.length} OR f.city ILIKE $${args.length})`);
  }
  const maxWaterStress = parseMaxWaterStress(f.water);
  if (maxWaterStress !== undefined) {
    args.push(maxWaterStress);
    where.push(`f.water_stress_score <= $${args.length}`);
  }
  const sql =
    BASE +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    (f.sort === "name" ? " ORDER BY p.name" : " ORDER BY l.p_stopped ASC NULLS LAST, p.name");
  const { rows } = await pool.query(sql, args);
  let sites = rows.map(withBand);
  if (f.band) sites = sites.filter((s) => s.band === f.band);
  return sites;
}

export async function getSite(id: string): Promise<Site | null> {
  if (isPublicDataMode()) return (await import("./publicStore")).getPublicSite(id);
  const { rows } = await pool.query(BASE + " WHERE p.project_id = $1", [id]);
  return rows[0] ? withBand(rows[0]) : null;
}

export async function getSites(ids: string[]): Promise<Site[]> {
  if (isPublicDataMode()) return (await import("./publicStore")).getPublicSites(ids);
  if (!ids.length) return [];
  const { rows } = await pool.query(BASE + " WHERE p.project_id = ANY($1)", [ids]);
  const byId = new Map(rows.map((r) => [r.project_id, withBand(r)]));
  return ids.map((id) => byId.get(id)).filter((s): s is Site => !!s);
}

export async function scoreHistory(id: string) {
  if (isPublicDataMode()) return (await import("./publicStore")).publicScoreHistory(id);
  const { rows } = await pool.query(
    `SELECT to_char(scored_at, 'YYYY-MM-DD HH24:MI') AS at, p_stopped, model_version
     FROM risk_scores WHERE project_id = $1 ORDER BY scored_at`,
    [id],
  );
  return rows as { at: string; p_stopped: number; model_version: string }[];
}

// Nearby sites (PostGIS) with a lower risk score than this one.
export async function saferNearby(id: string, limit = 3) {
  if (isPublicDataMode()) return (await import("./publicStore")).saferPublicNearby(id, limit);
  const { rows } = await pool.query(
    `WITH latest AS (
       SELECT DISTINCT ON (project_id) project_id, p_stopped
       FROM risk_scores ORDER BY project_id, scored_at DESC
     ), me AS (
       SELECT p.geom, l.p_stopped FROM tx_projects p JOIN latest l USING (project_id) WHERE p.project_id = $1
     )
     SELECT p.project_id, p.name, p.county, p.label, l.p_stopped,
            round((ST_Distance(p.geom, me.geom) / 1000)::numeric, 1)::float AS km
     FROM tx_projects p JOIN latest l USING (project_id), me
     WHERE p.project_id <> $1 AND l.p_stopped < me.p_stopped AND p.label <> 'stopped'
     ORDER BY p.geom <-> me.geom
     LIMIT $2`,
    [id, limit],
  );
  return rows.map((r) => ({ ...r, band: band(r.p_stopped) })) as {
    project_id: string; name: string; county: string; label: string; p_stopped: number; km: number; band: Band | null;
  }[];
}

export async function watchlistIds(clientId: string): Promise<string[]> {
  const publicMode = isPublicDataMode();
  if (!isClientId(clientId)) return [];
  if (publicMode) return (await import("./publicStore")).publicWatchlistIds(clientId);
  return (await watchlistEntries(clientId)).map((entry) => entry.project_id);
}

export async function watchlistEntries(clientId: string): Promise<{ project_id: string; added_at: string }[]> {
  const publicMode = isPublicDataMode();
  if (!isClientId(clientId)) return [];
  if (publicMode) return (await import("./publicStore")).publicWatchlistEntries(clientId);
  const { rows } = await pool.query(
    "SELECT project_id, added_at FROM site_watchlist WHERE client_id = $1 ORDER BY added_at DESC",
    [clientId],
  );
  return rows.map((row: { project_id: string; added_at: Date | string }) => ({
    project_id: row.project_id,
    added_at: row.added_at instanceof Date ? row.added_at.toISOString() : new Date(row.added_at).toISOString(),
  }));
}

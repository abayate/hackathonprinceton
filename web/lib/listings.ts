import "server-only";
import { pool } from "./db";
import { band, type Band } from "./model";
import { parseMinAcres } from "./params";

export type Listing = {
  site_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  county: string | null;
  lat: number;
  lng: number;
  property_type: string;
  lot_acres: number | null;
  building_sf: number | null;
  ceiling_ft: number | null;
  column_width_ft: number | null;
  heavy_power: boolean | null;
  year_built: number | null;
  zoning: string | null;
  asking_price: number | null;
  matterport_model_id: string | null;
  place: string | null;
  in_city_limits: boolean | null;
  in_urban_area: boolean | null;
  county_density: number | null;
  nearest_metro: string;
  km_to_metro: number;
  county_tracked_projects: number;
  water_stress_score: number | null;
  water_stress_label: string | null;
  p_stopped: number | null;
  model_note: string | null;
  band: Band | null;
};

export type ListingFilters = {
  market?: string; // houston | la | all
  type?: string; // Industrial | Flex | Land
  acres?: string; // min acres
  power?: string; // "1" = heavy power only
  band?: string;
  q?: string;
};

const COLS = `site_id, name, address, city, state, county, lat, lng, property_type, lot_acres, building_sf,
  ceiling_ft, column_width_ft, heavy_power, year_built, zoning, asking_price, matterport_model_id, place,
  in_city_limits, in_urban_area, county_density, nearest_metro, km_to_metro, county_tracked_projects,
  water_stress_score, water_stress_label, p_stopped, model_note`;

const withBand = (r: Omit<Listing, "band">): Listing => ({ ...r, band: band(r.p_stopped) });

export async function listListings(f: ListingFilters): Promise<Listing[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  const market = f.market ?? "houston";
  if (market === "houston") where.push(`state = 'TX'`);
  if (market === "la") where.push(`state = 'CA'`);
  if (f.type) {
    args.push(f.type);
    where.push(`property_type = $${args.length}`);
  }
  const minAcres = parseMinAcres(f.acres);
  if (minAcres !== undefined) {
    args.push(minAcres);
    where.push(`lot_acres >= $${args.length}`);
  }
  if (f.power === "1") where.push(`heavy_power IS TRUE`);
  if (f.q) {
    args.push(`%${f.q}%`);
    where.push(`(name ILIKE $${args.length} OR address ILIKE $${args.length} OR city ILIKE $${args.length})`);
  }
  // Biggest, best-powered sites first: they're the ones a data center could use.
  const sql = `SELECT ${COLS} FROM sites ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY heavy_power IS TRUE DESC, lot_acres DESC NULLS LAST, building_sf DESC NULLS LAST`;
  const { rows } = await pool.query(sql, args);
  let out = rows.map(withBand);
  if (f.band) out = out.filter((l) => l.band === f.band);
  return out;
}

export async function getListing(id: string): Promise<Listing | null> {
  const { rows } = await pool.query(`SELECT ${COLS} FROM sites WHERE site_id = $1`, [id]);
  return rows[0] ? withBand(rows[0]) : null;
}

export async function getListings(ids: string[]): Promise<Listing[]> {
  if (!ids.length) return [];
  const { rows } = await pool.query(`SELECT ${COLS} FROM sites WHERE site_id = ANY($1)`, [ids]);
  return rows.map(withBand);
}

export async function listingPoint(id: string): Promise<{ lat: number; lng: number; lot_acres: number | null } | null> {
  const { rows } = await pool.query("SELECT lat, lng, lot_acres FROM sites WHERE site_id = $1", [id]);
  return rows[0] ?? null;
}

// Nearby listings with lower modeled risk.
export async function saferListingsNearby(id: string, limit = 4) {
  const { rows } = await pool.query(
    `SELECT s.site_id, s.name, s.city, s.property_type, s.lot_acres, s.p_stopped,
            round((ST_Distance(s.geom, me.geom) / 1000)::numeric, 1)::float AS km
     FROM sites s, (SELECT geom, p_stopped FROM sites WHERE site_id = $1) me
     WHERE s.site_id <> $1 AND me.p_stopped IS NOT NULL AND s.p_stopped < me.p_stopped
     ORDER BY s.geom <-> me.geom LIMIT $2`,
    [id, limit],
  );
  return rows.map((r) => ({ ...r, band: band(r.p_stopped) })) as {
    site_id: string; name: string; city: string; property_type: string; lot_acres: number | null;
    p_stopped: number; km: number; band: Band | null;
  }[];
}

// Real Texas projects near a listing: the evidence behind its score.
export async function projectsNearby(id: string, limit = 5) {
  const { rows } = await pool.query(
    `SELECT p.project_id, p.name, p.label, p.tracker_status, p.primary_source_url, p.primary_source_name,
            round((ST_Distance(p.geom, s.geom) / 1000)::numeric, 1)::float AS km
     FROM tx_projects p, (SELECT geom FROM sites WHERE site_id = $1) s
     ORDER BY p.geom <-> s.geom LIMIT $2`,
    [id, limit],
  );
  return rows as {
    project_id: string; name: string; label: string; tracker_status: string;
    primary_source_url: string | null; primary_source_name: string | null; km: number;
  }[];
}

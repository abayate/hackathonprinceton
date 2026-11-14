/**
 * Entirely invented database rows for offline render tests. Names, IDs, coordinates,
 * and prices are synthetic; no sponsor, credential, live database, or private data
 * was inspected or adapted to build these fixtures.
 */
import type { Listing } from "../lib/listings";
import type { Site } from "../lib/sites";

export const SYNTHETIC_CLIENT_ID = "90000000-0000-4000-8000-000000000099";

export type SyntheticListingRow = Omit<Listing, "band">;
export type SyntheticProjectRow = Omit<Site, "band" | "scored_at"> & { scored_at: Date | null };
export type SyntheticHistoryRow = { project_id: string; at: string; p_stopped: number; model_version: string };
export type SyntheticWatchlistRow = { client_id: string; project_id: string; added_at: Date };

export const syntheticListings: SyntheticListingRow[] = [
  {
    site_id: "costar-900001", name: "Synthetic Listing A", address: "100 Test Way", city: "Fictional Houston",
    state: "TX", county: "Synthetic County", lat: 30, lng: -95, property_type: "Industrial",
    lot_acres: 8, building_sf: 120000, ceiling_ft: 30, column_width_ft: 40, heavy_power: true,
    year_built: 2020, zoning: "Synthetic Industrial", asking_price: 12000000, matterport_model_id: null,
    place: "Fictional Houston", in_city_limits: true, in_urban_area: true, county_density: 900,
    nearest_metro: "Houston", km_to_metro: 20, county_tracked_projects: 2, water_stress_score: 2,
    water_stress_label: "Low", p_stopped: 0.3999, model_note: null,
  },
  {
    site_id: "costar-900002", name: "Synthetic Listing B", address: "200 Test Way", city: "Fictional Houston",
    state: "TX", county: "Synthetic County", lat: 30, lng: -96, property_type: "Flex",
    lot_acres: 3, building_sf: 40000, ceiling_ft: null, column_width_ft: null, heavy_power: null,
    year_built: null, zoning: null, asking_price: null, matterport_model_id: null,
    place: null, in_city_limits: null, in_urban_area: null, county_density: null,
    nearest_metro: "Houston", km_to_metro: 60, county_tracked_projects: 1, water_stress_score: null,
    water_stress_label: null, p_stopped: 0.5999, model_note: null,
  },
  {
    site_id: "costar-900003", name: "Synthetic Listing C", address: "300 Test Way", city: "Fictional Houston",
    state: "TX", county: "Synthetic County", lat: 31, lng: -95, property_type: "Land",
    lot_acres: 15, building_sf: null, ceiling_ft: null, column_width_ft: null, heavy_power: false,
    year_built: null, zoning: null, asking_price: null, matterport_model_id: null,
    place: null, in_city_limits: false, in_urban_area: false, county_density: null,
    nearest_metro: "Houston", km_to_metro: 90, county_tracked_projects: 0, water_stress_score: null,
    water_stress_label: null, p_stopped: 0.6, model_note: null,
  },
  {
    site_id: "costar-900004", name: "Synthetic Listing California", address: "400 Test Way", city: "Fictional Los Angeles",
    state: "CA", county: null, lat: 34, lng: -118, property_type: "Industrial",
    lot_acres: null, building_sf: null, ceiling_ft: null, column_width_ft: null, heavy_power: null,
    year_built: null, zoning: null, asking_price: null, matterport_model_id: null,
    place: null, in_city_limits: null, in_urban_area: null, county_density: null,
    nearest_metro: "Los Angeles", km_to_metro: 0, county_tracked_projects: 0, water_stress_score: null,
    water_stress_label: null, p_stopped: null, model_note: "Synthetic California site is outside the Texas model.",
  },
];

export const syntheticProjects: SyntheticProjectRow[] = [
  {
    project_id: "90000000-0000-4000-8000-000000000001", name: "Synthetic Project Stopped", company: null,
    county: "Hays County", lat: 30, lng: -98, coord_precision: "town", capacity_mw: null,
    land_acres: null, tracker_status: "defeated", label: "stopped", stop_event_date: "2026-10-01",
    primary_source_url: null, primary_source_name: null, tracker_url: "https://example.invalid/synthetic/stopped",
    city: null, in_city_limits: null, in_urban_area: null, county_density_per_sqmi: null,
    nearest_metro: "Austin", km_to_nearest_metro: 50, is_crypto: false, county_tracked_projects: 1,
    water_stress_score: null, water_stress_label: null, location_reliable: true,
    p_stopped: 0.5999, in_training_set: true, model_version: "synthetic-v2", scored_at: new Date("2026-10-02T12:00:00Z"),
  },
  {
    project_id: "90000000-0000-4000-8000-000000000002", name: "Synthetic Project Proposed", company: "Invented Company",
    county: "Hays County", lat: 30, lng: -97, coord_precision: "site", capacity_mw: 100,
    land_acres: 10, tracker_status: "proposed", label: "unlabeled", stop_event_date: null,
    primary_source_url: null, primary_source_name: null, tracker_url: "https://example.invalid/synthetic/proposed",
    city: "Synthetic Town", in_city_limits: false, in_urban_area: false, county_density_per_sqmi: 100,
    nearest_metro: "Austin", km_to_nearest_metro: 20, is_crypto: false, county_tracked_projects: 2,
    water_stress_score: 1, water_stress_label: "Low", location_reliable: true,
    p_stopped: 0.3999, in_training_set: false, model_version: "synthetic-v2", scored_at: new Date("2026-10-02T12:00:00Z"),
  },
  {
    project_id: "90000000-0000-4000-8000-000000000003", name: "Synthetic Project Built", company: null,
    county: "Synthetic County", lat: 31, lng: -96, coord_precision: "town", capacity_mw: null,
    land_acres: null, tracker_status: "under_construction", label: "built", stop_event_date: null,
    primary_source_url: null, primary_source_name: null, tracker_url: "https://example.invalid/synthetic/built",
    city: null, in_city_limits: null, in_urban_area: null, county_density_per_sqmi: null,
    nearest_metro: "Houston", km_to_nearest_metro: 80, is_crypto: false, county_tracked_projects: 0,
    water_stress_score: null, water_stress_label: null, location_reliable: true,
    p_stopped: 0.6, in_training_set: true, model_version: "synthetic-v2", scored_at: new Date("2026-10-02T12:00:00Z"),
  },
  {
    project_id: "90000000-0000-4000-8000-000000000004", name: "Synthetic Project Unscored", company: null,
    county: "Synthetic County", lat: 32, lng: -97, coord_precision: "town", capacity_mw: null,
    land_acres: null, tracker_status: "proposed", label: "unlabeled", stop_event_date: null,
    primary_source_url: null, primary_source_name: null, tracker_url: "https://example.invalid/synthetic/unscored",
    city: null, in_city_limits: null, in_urban_area: null, county_density_per_sqmi: null,
    nearest_metro: "Synthetic Metro", km_to_nearest_metro: 100, is_crypto: false, county_tracked_projects: 0,
    water_stress_score: null, water_stress_label: null, location_reliable: false,
    p_stopped: null, in_training_set: null, model_version: null, scored_at: null,
  },
];

export const syntheticHistory: SyntheticHistoryRow[] = [
  { project_id: syntheticProjects[0].project_id, at: "2026-09-01 10:00", p_stopped: 0.3999, model_version: "synthetic-v1" },
  { project_id: syntheticProjects[0].project_id, at: "2026-10-02 12:00", p_stopped: 0.5999, model_version: "synthetic-v2" },
];

export const syntheticWatchlist: SyntheticWatchlistRow[] = [
  { client_id: SYNTHETIC_CLIENT_ID, project_id: syntheticListings[0].site_id, added_at: new Date("2026-10-01T12:00:00Z") },
  { client_id: SYNTHETIC_CLIENT_ID, project_id: syntheticProjects[0].project_id, added_at: new Date("2026-10-02T12:00:00Z") },
];

export type DbQueryOptions = {
  listings?: readonly SyntheticListingRow[];
  projects?: readonly SyntheticProjectRow[];
  history?: readonly SyntheticHistoryRow[];
  watchlist?: readonly SyntheticWatchlistRow[];
  reject?: Error;
};

// Keep these projections explicit so a page cannot pass by receiving a field its
// SQL no longer selects. This verifies the tested query contract, not SQL engine behavior.
const LISTING_PROJECTION = `site_id, name, address, city, state, county, lat, lng, property_type, lot_acres, building_sf,
  ceiling_ft, column_width_ft, heavy_power, year_built, zoning, asking_price, matterport_model_id, place,
  in_city_limits, in_urban_area, county_density, nearest_metro, km_to_metro, county_tracked_projects,
  water_stress_score, water_stress_label, p_stopped, model_note`.replace(/\s+/g, " ").trim();
const PROJECT_PROJECTION = `p.project_id, p.name, p.company, p.county, p.lat, p.lng, p.coord_precision,
  p.capacity_mw, p.land_acres, p.tracker_status, p.label,
  to_char(p.stop_event_date, 'YYYY-MM-DD') AS stop_event_date,
  p.primary_source_url, p.primary_source_name, p.tracker_url,
  f.city, f.in_city_limits, f.in_urban_area, f.county_density_per_sqmi,
  f.nearest_metro, f.km_to_nearest_metro, f.is_crypto, f.county_tracked_projects,
  f.water_stress_score, f.water_stress_label, f.location_reliable,
  l.p_stopped, l.in_training_set, l.model_version, l.scored_at`.replace(/\s+/g, " ").trim();
const SAFER_LISTING_PROJECTION = `s.site_id, s.name, s.city, s.property_type, s.lot_acres, s.p_stopped,
  round((ST_Distance(s.geom, me.geom) / 1000)::numeric, 1)::float AS km`.replace(/\s+/g, " ").trim();
const NEARBY_PROJECT_PROJECTION = `p.project_id, p.name, p.label, p.tracker_status, p.primary_source_url, p.primary_source_name,
  round((ST_Distance(p.geom, s.geom) / 1000)::numeric, 1)::float AS km`.replace(/\s+/g, " ").trim();
const SAFER_PROJECT_PROJECTION = `p.project_id, p.name, p.county, p.label, l.p_stopped,
  round((ST_Distance(p.geom, me.geom) / 1000)::numeric, 1)::float AS km`.replace(/\s+/g, " ").trim();
const HISTORY_PROJECTION = "to_char(scored_at, 'YYYY-MM-DD HH24:MI') AS at, p_stopped, model_version";

function requireProjection(sql: string, pattern: RegExp, expected: string) {
  const projection = sql.match(pattern)?.[1]?.replace(/\s+/g, " ").trim();
  if (projection !== expected) throw new Error("Unexpected synthetic DB selected columns");
}

const checkListingProjection = (sql: string) => requireProjection(sql, /SELECT\s+([\s\S]*?)\s+FROM sites\b/, LISTING_PROJECTION);
const checkProjectProjection = (sql: string) => requireProjection(sql,
  /\)\s+SELECT\s+([\s\S]*?)\s+FROM tx_projects p\s+JOIN tx_project_features f/, PROJECT_PROJECTION);

/** Strict SQL-shape responder: any unrecognized query fails rather than yielding plausible empty data. */
export function createDbQuery(options: DbQueryOptions = {}) {
  const listings = options.listings ?? syntheticListings;
  const projects = options.projects ?? syntheticProjects;
  const history = options.history ?? syntheticHistory;
  const watchlist = options.watchlist ?? syntheticWatchlist;
  return async (sql: string, args: readonly unknown[] = []): Promise<{ rows: Record<string, unknown>[] }> => {
    if (options.reject) throw options.reject;
    if (typeof sql !== "string" || !Array.isArray(args)) throw new Error("Synthetic DB expected text SQL and array parameters");
    const rows = (items: readonly object[]) => ({ rows: items.map((item) => ({ ...item })) });
    const arg = (index: number) => args[index - 1];
    const param = (pattern: RegExp) => {
      const match = sql.match(pattern);
      return match ? Number(match[1]) : undefined;
    };

    if (/SELECT project_id, added_at FROM site_watchlist WHERE client_id = \$1/.test(sql)) {
      return rows(watchlist.filter((entry) => entry.client_id === arg(1)).sort((a, b) => b.added_at.getTime() - a.added_at.getTime())
        .map(({ project_id, added_at }) => ({ project_id, added_at })));
    }

    if (/SELECT lat, lng, lot_acres FROM sites WHERE site_id = \$1/.test(sql)) {
      return rows(listings.filter((listing) => listing.site_id === arg(1)).map(({ lat, lng, lot_acres }) => ({ lat, lng, lot_acres })));
    }
    if (/FROM sites s, \(SELECT geom, p_stopped FROM sites WHERE site_id = \$1\) me/.test(sql)) {
      requireProjection(sql, /SELECT\s+([\s\S]*?)\s+FROM sites s, \(SELECT geom, p_stopped/, SAFER_LISTING_PROJECTION);
      const current = listings.find((listing) => listing.site_id === arg(1));
      const score = current?.p_stopped;
      const nearest = score == null ? [] : listings.filter((listing) => listing.site_id !== arg(1)
        && listing.p_stopped != null && listing.p_stopped < score);
      return rows(nearest.slice(0, Number(arg(2))).map((listing, i) => ({
        site_id: listing.site_id, name: listing.name, city: listing.city, property_type: listing.property_type,
        lot_acres: listing.lot_acres, p_stopped: listing.p_stopped, km: i + 1,
      })));
    }
    if (/FROM tx_projects p, \(SELECT geom FROM sites WHERE site_id = \$1\) s/.test(sql)) {
      requireProjection(sql, /SELECT\s+([\s\S]*?)\s+FROM tx_projects p, \(SELECT geom FROM sites/, NEARBY_PROJECT_PROJECTION);
      return rows(projects.slice(0, Number(arg(2))).map((project, i) => ({
        project_id: project.project_id, name: project.name, label: project.label, tracker_status: project.tracker_status,
        primary_source_url: project.primary_source_url, primary_source_name: project.primary_source_name, km: i + 1,
      })));
    }
    if (/FROM sites WHERE site_id = ANY\(\$1\)/.test(sql)) {
      checkListingProjection(sql);
      const ids = arg(1);
      if (!Array.isArray(ids)) throw new Error("Synthetic DB expected listing IDs array");
      return rows(listings.filter((listing) => ids.includes(listing.site_id)));
    }
    if (/FROM sites WHERE site_id = \$1/.test(sql)) {
      checkListingProjection(sql);
      return rows(listings.filter((listing) => listing.site_id === arg(1)));
    }
    if (/FROM sites\b/.test(sql) && /ORDER BY heavy_power IS TRUE/.test(sql)) {
      checkListingProjection(sql);
      let found = [...listings];
      if (/state = 'TX'/.test(sql)) found = found.filter((listing) => listing.state === "TX");
      if (/state = 'CA'/.test(sql)) found = found.filter((listing) => listing.state === "CA");
      const typeIndex = param(/property_type = \$(\d+)/);
      if (typeIndex) found = found.filter((listing) => listing.property_type === arg(typeIndex));
      const acresIndex = param(/lot_acres >= \$(\d+)/);
      if (acresIndex) found = found.filter((listing) => listing.lot_acres != null && listing.lot_acres >= Number(arg(acresIndex)));
      if (/heavy_power IS TRUE/.test(sql.split("ORDER BY")[0])) found = found.filter((listing) => listing.heavy_power === true);
      const searchIndex = param(/name ILIKE \$(\d+)/);
      if (searchIndex) {
        const needle = String(arg(searchIndex)).replace(/^%|%$/g, "").toLowerCase();
        found = found.filter((listing) => [listing.name, listing.address, listing.city].some((value) => value.toLowerCase().includes(needle)));
      }
      return rows(found);
    }

    if (/SELECT to_char\(scored_at, 'YYYY-MM-DD HH24:MI'\) AS at/.test(sql)) {
      requireProjection(sql, /SELECT\s+([\s\S]*?)\s+FROM risk_scores WHERE project_id = \$1/, HISTORY_PROJECTION);
      return rows(history.filter((item) => item.project_id === arg(1)).map(({ at, p_stopped, model_version }) => ({ at, p_stopped, model_version })));
    }
    if (/SELECT p\.project_id, p\.name, p\.county, p\.label, l\.p_stopped/.test(sql)) {
      requireProjection(sql, /\)\s+SELECT\s+([\s\S]*?)\s+FROM tx_projects p JOIN latest/, SAFER_PROJECT_PROJECTION);
      const current = projects.find((project) => project.project_id === arg(1));
      const score = current?.p_stopped;
      const nearest = score == null ? [] : projects.filter((project) => project.project_id !== arg(1)
        && project.p_stopped != null && project.p_stopped < score && project.label !== "stopped");
      return rows(nearest.slice(0, Number(arg(2))).map((project, i) => ({
        project_id: project.project_id, name: project.name, county: project.county, label: project.label,
        p_stopped: project.p_stopped, km: i + 1,
      })));
    }
    if (/FROM tx_projects p\s+JOIN tx_project_features f USING \(project_id\)/.test(sql)) {
      checkProjectProjection(sql);
      let found = [...projects];
      if (/WHERE p\.project_id = ANY\(\$1\)/.test(sql)) {
        const ids = arg(1);
        if (!Array.isArray(ids)) throw new Error("Synthetic DB expected project IDs array");
        found = found.filter((project) => ids.includes(project.project_id));
      } else if (/WHERE p\.project_id = \$1/.test(sql)) found = found.filter((project) => project.project_id === arg(1));
      else {
        for (const [label, pattern] of [["unlabeled", /p\.label = 'unlabeled'/], ["built", /p\.label = 'built'/], ["stopped", /p\.label = 'stopped'/]] as const) {
          if (pattern.test(sql)) found = found.filter((project) => project.label === label);
        }
        const searchIndex = param(/p\.name ILIKE \$(\d+)/);
        if (searchIndex) {
          const needle = String(arg(searchIndex)).replace(/^%|%$/g, "").toLowerCase();
          found = found.filter((project) => [project.name, project.county, project.city ?? ""].some((value) => value.toLowerCase().includes(needle)));
        }
        const waterIndex = param(/f\.water_stress_score <= \$(\d+)/);
        if (waterIndex) found = found.filter((project) => project.water_stress_score != null
          && project.water_stress_score <= Number(arg(waterIndex)));
      }
      return rows(found);
    }

    throw new Error(`Unexpected synthetic DB query shape: ${sql.replace(/\s+/g, " ").slice(0, 180)}`);
  };
}

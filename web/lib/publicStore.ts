import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Filters, Site } from "./sites";
import { buildPublicDataset, filterPublicSites, nearbyPublicSites, publicHistory, type PublicDataset } from "./publicData";

let dataset: PublicDataset | undefined;
function load(): PublicDataset {
  if (!dataset) {
    const root = path.resolve(process.cwd(), "..", "data");
    dataset = buildPublicDataset(
      fs.readFileSync(path.join(root, "labels", "tx_projects.csv"), "utf8"),
      fs.readFileSync(path.join(root, "features", "tx_project_features.csv"), "utf8"),
      JSON.parse(fs.readFileSync(path.join(root, "model", "risk_model.json"), "utf8")),
    );
  }
  return dataset;
}

export async function listPublicSites(filters: Filters): Promise<Site[]> {
  return filterPublicSites(load().sites, filters);
}

export async function getPublicSite(id: string): Promise<Site | null> {
  return load().sites.find((s) => s.project_id === id) ?? null;
}

export async function getPublicSites(ids: string[]): Promise<Site[]> {
  const byId = new Map(load().sites.map((s) => [s.project_id, s]));
  return ids.map((id) => byId.get(id)).filter((s): s is Site => s !== undefined);
}

export async function publicScoreHistory(id: string) {
  return publicHistory(load(), id);
}

export async function saferPublicNearby(id: string, limit = 3) {
  return nearbyPublicSites(load().sites, id, limit);
}

// Process memory only: cleared on restart; isolated by the visitor cookie.
export const PUBLIC_SESSION_LIMIT = 200;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
type WatchlistEntry = { project_id: string; added_at: string };
type SavedSession = { entries: readonly WatchlistEntry[]; expiresAt: number };
const session = globalThis as typeof globalThis & { groundworkPublicWatchlist?: Map<string, SavedSession> };

export async function publicWatchlistIds(clientId: string): Promise<string[]> {
  return (await publicWatchlistEntries(clientId)).map((entry) => entry.project_id);
}

export async function publicWatchlistEntries(clientId: string): Promise<WatchlistEntry[]> {
  const entry = session.groundworkPublicWatchlist?.get(clientId);
  return entry && entry.expiresAt > Date.now() ? entry.entries.map((saved) => ({ ...saved })) : [];
}

export async function setPublicWatchlist(clientId: string, projectId: string, saved: boolean): Promise<boolean> {
  if (!load().sites.some((s) => s.project_id === projectId)) return false;
  const now = Date.now();
  const current = session.groundworkPublicWatchlist?.get(clientId);
  const previous = current && current.expiresAt > now ? current.entries : [];
  const entries = saved
    ? previous.some((entry) => entry.project_id === projectId) ? previous : [{ project_id: projectId, added_at: new Date(now).toISOString() }, ...previous]
    : previous.filter((entry) => entry.project_id !== projectId);
  const active = [...(session.groundworkPublicWatchlist ?? [])].filter(([key, value]) => key !== clientId && value.expiresAt > now);
  // Refuse new sessions at capacity instead of silently discarding another visitor's saved list.
  if (entries.length && active.length >= PUBLIC_SESSION_LIMIT) throw new Error("Public watchlist session capacity reached");
  session.groundworkPublicWatchlist = new Map([...active, ...(entries.length ? [[clientId, { entries, expiresAt: now + SESSION_TTL_MS }] as const] : [])]);
  return true;
}

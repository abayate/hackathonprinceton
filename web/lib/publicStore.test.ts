import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getPublicSite, getPublicSites, listPublicSites, PUBLIC_SESSION_LIMIT, publicScoreHistory, publicWatchlistEntries, publicWatchlistIds, saferPublicNearby, setPublicWatchlist } from "./publicStore";

const id = "1c23acb7-4ec3-459b-aa99-1bd3104a4fb9";

describe("public store with committed files and no database", () => {
  it("supports reads, ordered multi-get, history and nearby projects", async () => {
    const all = await listPublicSites({ status: "all" });
    expect(all).toHaveLength(349);
    expect(await getPublicSite(id)).toMatchObject({ project_id: id, county: "Hays County" });
    expect(await getPublicSite("missing")).toBeNull();
    expect((await getPublicSites([id, "missing", all[0].project_id])).map((s) => s.project_id)).toEqual([id, all[0].project_id]);
    expect(await publicScoreHistory(id)).toHaveLength(1);
    expect(await saferPublicNearby(id)).toHaveLength(3);
    expect(await saferPublicNearby(id, 1)).toHaveLength(1);
  });

  it("isolates visitors, preserves recency, rejects unknown IDs and does not expose mutable arrays", async () => {
    const client = crypto.randomUUID();
    const other = crypto.randomUUID();
    const second = (await listPublicSites({ status: "proposed" }))[0].project_id;
    expect(await publicWatchlistIds(client)).toEqual([]);
    expect(await setPublicWatchlist(client, "costar-123", true)).toBe(false);
    expect(await setPublicWatchlist(client, id, true)).toBe(true);
    expect(await setPublicWatchlist(client, second, true)).toBe(true);
    expect(await setPublicWatchlist(client, id, true)).toBe(true);
    expect(await publicWatchlistIds(client)).toEqual([second, id]);
    expect(await publicWatchlistIds(other)).toEqual([]);
    const copy = await publicWatchlistIds(client);
    copy.length = 0;
    expect(await publicWatchlistIds(client)).toHaveLength(2);
    expect(await setPublicWatchlist(client, id, false)).toBe(true);
    expect(await publicWatchlistIds(client)).toEqual([second]);
    await setPublicWatchlist(client, second, false);
    expect(await publicWatchlistIds(client)).toEqual([]);
  });

  it("keeps the first saved timestamp, then gives a re-saved project a new timestamp", async () => {
    const client = crypto.randomUUID();
    const other = crypto.randomUUID();
    const second = (await listPublicSites({ status: "proposed" }))[0].project_id;
    const clock = vi.spyOn(Date, "now");
    try {
      clock.mockReturnValue(Date.parse("2025-08-01T12:00:00.000Z"));
      await setPublicWatchlist(client, id, true);
      clock.mockReturnValue(Date.parse("2025-08-01T13:00:00.000Z"));
      await setPublicWatchlist(client, id, true);
      await setPublicWatchlist(client, second, true);
      expect(await publicWatchlistEntries(client)).toEqual([
        { project_id: second, added_at: "2025-08-01T13:00:00.000Z" },
        { project_id: id, added_at: "2025-08-01T12:00:00.000Z" },
      ]);
      expect(await publicWatchlistIds(client)).toEqual([second, id]);
      expect(await publicWatchlistEntries(other)).toEqual([]);
      const copy = await publicWatchlistEntries(client);
      copy[0].added_at = "changed";
      expect((await publicWatchlistEntries(client))[0].added_at).toBe("2025-08-01T13:00:00.000Z");

      await setPublicWatchlist(client, id, false);
      clock.mockReturnValue(Date.parse("2025-08-01T14:00:00.000Z"));
      await setPublicWatchlist(client, id, true);
      expect(await publicWatchlistEntries(client)).toEqual([
        { project_id: id, added_at: "2025-08-01T14:00:00.000Z" },
        { project_id: second, added_at: "2025-08-01T13:00:00.000Z" },
      ]);
      await setPublicWatchlist(client, id, false);
      await setPublicWatchlist(client, second, false);
    } finally { clock.mockRestore(); }
  });

  it("bounds temporary visitor memory and expires saved sessions", async () => {
    const clients = Array.from({ length: PUBLIC_SESSION_LIMIT }, () => crypto.randomUUID());
    for (const client of clients) await setPublicWatchlist(client, id, true);
    await expect(setPublicWatchlist(crypto.randomUUID(), id, true)).rejects.toThrow(/capacity/);
    expect(await publicWatchlistIds(clients[0])).toEqual([id]);
    expect(await publicWatchlistIds(clients.at(-1)!)).toEqual([id]);
    const newest = clients.at(-1)!;
    // Removing an unsaved item for an unknown visitor must not evict a real session.
    for (let i = 0; i < PUBLIC_SESSION_LIMIT; i++) await setPublicWatchlist(crypto.randomUUID(), id, false);
    expect(await publicWatchlistIds(newest)).toEqual([id]);
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 24 * 60 * 60 * 1000);
    try {
      expect(await publicWatchlistIds(newest)).toEqual([]);
      expect(await publicWatchlistEntries(newest)).toEqual([]);
      await setPublicWatchlist(newest, id, true);
      expect(await publicWatchlistIds(newest)).toEqual([id]);
    } finally { clock.mockRestore(); }
  });
});

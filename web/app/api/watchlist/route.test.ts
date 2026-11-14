import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { query, cookieGet, setPublicWatchlist } = vi.hoisted(() => ({ query: vi.fn(), cookieGet: vi.fn(), setPublicWatchlist: vi.fn() }));
vi.mock("@/lib/db", () => ({ pool: { query } }));
vi.mock("@/lib/publicStore", () => ({ setPublicWatchlist }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookieGet }) }));
import { DELETE, POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue({ rows: [] });
  cookieGet.mockReturnValue(undefined);
  setPublicWatchlist.mockResolvedValue(true);
  vi.stubEnv("DATA_MODE", undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe.each([["POST", POST, true], ["DELETE", DELETE, false]] as const)("%s watchlist", (method, handler, saved) => {
  const request = (body: string) => new Request("http://localhost/api/watchlist", { method, body, headers: { "Content-Type": "application/json" } });

  it.each(["https://other.example", "http://localhost:4000", "null", "invalid origin", "ftp://localhost", ""])(
    "refuses an invalid or foreign Origin %s before accessing the visitor or storage", async (origin) => {
      const response = await handler(new Request("http://localhost/api/watchlist", {
        method, body: JSON.stringify({ project_id: "costar-123" }),
        headers: { "Content-Type": "application/json", Origin: origin },
      }));
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ detail: "Update your watchlist from this site." });
      expect(cookieGet).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
      expect(setPublicWatchlist).not.toHaveBeenCalled();
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );

  it.each([
    { url: "http://localhost/api/watchlist", origin: "http://localhost", host: undefined },
    { url: "http://internal:3000/api/watchlist", origin: "https://demo.example", host: "demo.example" },
    { url: "http://internal:3000/api/watchlist", origin: "http://localhost:4000", host: "localhost:4000" },
  ])("accepts a matching browser host with or without a proxy ($origin)", async ({ url, origin, host }) => {
    const headers = new Headers({ "Content-Type": "application/json", Origin: origin });
    if (host) headers.set("Host", host);
    const response = await handler(new Request(url, { method, body: JSON.stringify({ project_id: "costar-123" }), headers }));
    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledOnce();
  });

  it("enforces the Origin check in public mode too", async () => {
    vi.stubEnv("DATA_MODE", "public");
    const response = await handler(new Request("http://localhost/api/watchlist", {
      method, body: JSON.stringify({ project_id: "public-project" }),
      headers: { "Content-Type": "application/json", Origin: "https://other.example" },
    }));
    expect(response.status).toBe(422);
    expect(setPublicWatchlist).not.toHaveBeenCalled();
    expect(cookieGet).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it.each(["{", "null", "[]", '"abc"', "{}", '{"project_id":null}', '{"project_id":1}', '{"project_id":""}', '{"project_id":"a/b"}', JSON.stringify({ project_id: "x".repeat(101) })])(
    "rejects invalid body %s without touching the database", async (body) => {
      const response = await handler(request(body));
      expect(response.status).toBe(422);
      expect(await response.json()).toHaveProperty("detail");
      expect(query).not.toHaveBeenCalled();
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );

  it.each([undefined, "text/plain", "application/jsonx"])(
    "refuses missing or non-JSON Content-Type %s before cookie or storage", async (contentType) => {
      const headers = new Headers();
      if (contentType) headers.set("Content-Type", contentType);
      const response = await handler(new Request("http://localhost/api/watchlist", {
        method, body: JSON.stringify({ project_id: "costar-123" }), headers,
      }));
      expect(response.status).toBe(422);
      expect(cookieGet).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
      expect(setPublicWatchlist).not.toHaveBeenCalled();
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );

  it("refuses an oversized streamed JSON body without Content-Length before cookie or storage", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ project_id: "costar-123", padding: "x".repeat(1100) }));
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 600));
        controller.enqueue(bytes.slice(600));
        setTimeout(() => { try { controller.close(); } catch { /* cancelled after the limit */ } }, 25);
      },
      cancel() { cancelled = true; },
    });
    const response = await handler(new Request("http://localhost/api/watchlist", {
      method, body: stream, headers: { "Content-Type": "application/json" }, duplex: "half",
    } as RequestInit & { duplex: "half" }));
    expect(response.status).toBe(422);
    expect(cancelled).toBe(true);
    expect(cookieGet).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(setPublicWatchlist).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("refuses malformed JSON and declared oversize before cookie or storage", async () => {
    const invalid = [request("{"), new Request("http://localhost/api/watchlist", {
      method, body: JSON.stringify({ project_id: "costar-123" }),
      headers: { "Content-Type": "application/json", "Content-Length": "1025" },
    })];
    for (const req of invalid) {
      const response = await handler(req);
      expect(response.status).toBe(422);
      expect(cookieGet).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
      expect(setPublicWatchlist).not.toHaveBeenCalled();
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("sets a private visitor cookie and uses SQL parameters", async () => {
    const response = await handler(request(JSON.stringify({ project_id: "costar-123" })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved });
    expect(query).toHaveBeenCalledWith(expect.stringContaining(saved ? "INSERT INTO" : "DELETE FROM"), [expect.stringMatching(/^[\da-f-]{36}$/), "costar-123"]);
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Path=/");
  });

  it("reuses an existing visitor and supports historical project IDs", async () => {
    const id = "04c5d573-d357-476f-9ef7-99980f476023";
    const existing = "36793d56-a761-4cc0-9348-23a4470cad5b";
    cookieGet.mockReturnValue({ value: existing });
    const response = await handler(request(JSON.stringify({ project_id: id })));
    expect(query).toHaveBeenCalledWith(expect.any(String), [existing, id]);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rotates an invalid visitor cookie before writing in either mode", async () => {
    cookieGet.mockReturnValue({ value: "not-a-uuid" });
    if (saved) vi.stubEnv("DATA_MODE", "public");
    const response = await handler(request(JSON.stringify({ project_id: "1c23acb7-4ec3-459b-aa99-1bd3104a4fb9" })));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toMatch(/client_id=[\da-f-]{36}/);
    if (saved) {
      expect(setPublicWatchlist).toHaveBeenCalledWith(expect.stringMatching(/^[\da-f-]{36}$/), expect.any(String), true);
      expect(query).not.toHaveBeenCalled();
    } else {
      expect(query).toHaveBeenCalledWith(expect.any(String), [expect.stringMatching(/^[\da-f-]{36}$/), expect.any(String)]);
    }
  });

  it("returns a controlled failure without database details or a new cookie", async () => {
    query.mockRejectedValue(new Error("private database credentials and SQL"));
    const response = await handler(request(JSON.stringify({ project_id: "costar-123" })));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ detail: "Watchlist is temporarily unavailable. Please try again." });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("uses only the public session store in public mode", async () => {
    vi.stubEnv("DATA_MODE", "public");
    const response = await handler(request(JSON.stringify({ project_id: "public-project" })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved });
    expect(setPublicWatchlist).toHaveBeenCalledWith(expect.stringMatching(/^[\da-f-]{36}$/), "public-project", saved);
    expect(query).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("returns 404 without a cookie for a nonexistent public project", async () => {
    vi.stubEnv("DATA_MODE", "public");
    setPublicWatchlist.mockResolvedValue(false);
    const response = await handler(request(JSON.stringify({ project_id: "missing-project" })));
    expect(response.status).toBe(404);
    expect(query).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

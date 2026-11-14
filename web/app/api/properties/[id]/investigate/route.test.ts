import { beforeEach, describe, expect, it, vi } from "vitest";

const { afterTasks, getListing, write } = vi.hoisted(() => ({
  afterTasks: [] as (() => Promise<void>)[], getListing: vi.fn(), write: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<void>) => { afterTasks.push(task); },
}));
vi.mock("@/lib/listings", () => ({ getListing }));
vi.mock("@/lib/geminiClient", () => ({ isGeminiConfigured: () => true, createGeminiMemoWriter: () => ({ write }) }));

const listing = {
  site_id: "costar-900001", name: "Synthetic Yard", address: "100 Test Way", city: "Houston", state: "TX", county: "Harris",
  property_type: "Land", lot_acres: 40, building_sf: null, zoning: null, heavy_power: true, year_built: null, asking_price: 8_000_000,
};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/properties/costar-900001/investigate", { method: "POST", headers: { host: "localhost", ...headers } });

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  afterTasks.length = 0;
  delete (globalThis as { groundworkStore?: unknown }).groundworkStore;
  vi.stubEnv("ENABLE_PROPERTY_INVESTIGATOR", "true");
  vi.stubEnv("DATA_MODE", undefined);
  vi.stubEnv("GW_STORE", "memory");
  getListing.mockResolvedValue(listing);
  write.mockResolvedValue({
    summary: "Asking $200,000/acre.", sections: [{ id: "land", body_md: "40 acres.", source_ids: ["costar"] }],
    deal_risks: [], open_questions: [], web_sources: [],
  });
});

describe("POST /api/properties/[id]/investigate", () => {
  it("is hidden unless enabled and refuses public mode, bad ids and cross-site posts", async () => {
    vi.stubEnv("ENABLE_PROPERTY_INVESTIGATOR", undefined);
    let { POST } = await import("./route");
    expect((await POST(post(), ctx("costar-900001"))).status).toBe(404);
    vi.stubEnv("ENABLE_PROPERTY_INVESTIGATOR", "true");
    vi.resetModules();
    ({ POST } = await import("./route"));
    expect((await POST(post(), ctx("../etc"))).status).toBe(404);
    expect((await POST(post({ origin: "https://evil.example" }), ctx("costar-900001"))).status).toBe(422);
    vi.stubEnv("DATA_MODE", "public");
    expect((await POST(post(), ctx("costar-900001"))).status).toBe(501);
  });

  it("starts a run, reuses it while running, and the run GET returns the finished memo", async () => {
    const { POST } = await import("./route");
    const first = await POST(post(), ctx("costar-900001"));
    expect(first.status).toBe(202);
    const { run_id } = await first.json();
    expect(run_id).toMatch(/^run_/);
    const again = await POST(post(), ctx("costar-900001"));
    expect(await again.json()).toEqual({ run_id });

    const { GET } = await import("@/app/api/runs/[id]/route");
    const running = await (await GET(new Request("http://localhost"), ctx(run_id))).json();
    expect(running).toMatchObject({ status: "running", memo: null, parcel_id: "costar-900001" });

    await Promise.all(afterTasks.map((task) => task()));
    const done = await (await GET(new Request("http://localhost"), ctx(run_id))).json();
    expect(done.status).toBe("done");
    expect(done.memo).toMatchObject({ parcel_id: "costar-900001", recommendation: "maybe", live: true });
    expect(done.memo.max_price_usd_per_acre).toEqual({ value: null, unit: "USD/acre", kind: "sample", source_id: null });
    expect(done).not.toHaveProperty("memo_id");
  });

  it("returns 404 for unknown listings and 503 when the database fails", async () => {
    const { POST } = await import("./route");
    getListing.mockResolvedValueOnce(null);
    expect((await POST(post(), ctx("costar-900001"))).status).toBe(404);
    getListing.mockRejectedValueOnce(new Error("connection refused"));
    expect((await POST(post(), ctx("costar-900001"))).status).toBe(503);
  });
});

describe("GET /api/runs/[id]", () => {
  it("404s malformed and unknown run ids", async () => {
    const { GET } = await import("@/app/api/runs/[id]/route");
    expect((await GET(new Request("http://localhost"), ctx("nope"))).status).toBe(404);
    expect((await GET(new Request("http://localhost"), ctx("run_00000000-0000-4000-8000-000000000000"))).status).toBe(404);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { createMemoryStore, createPostgresStore, STALE_RUN_MS, storeKind, StoreWriteError } from "./gwStore";
import { emptyPropertyReview } from "./propertyReview";
import type { RunRecord } from "./runTypes";

const run = (overrides: Partial<RunRecord> = {}): RunRecord => ({
  run_id: "run_1", parcel_id: "costar-1", status: "running", started_at: new Date(1_000_000).toISOString(),
  finished_at: null, error: null, steps: [], memo_id: null, ...overrides,
});

afterEach(() => vi.unstubAllEnvs());

describe("memory store", () => {
  it("finds a running run until it goes stale, then finishes it", async () => {
    let now = 1_000_000;
    const store = createMemoryStore(() => now);
    await store.saveRun(run());
    expect(await store.runningRunFor("costar-1")).toBe("run_1");
    now += STALE_RUN_MS + 1;
    expect(await store.runningRunFor("costar-1")).toBeNull();
    await store.finishRun("run_1", "done", "memo_1", null);
    expect(await store.loadRun("run_1")).toMatchObject({ status: "done", memo_id: "memo_1" });
    await expect(store.updateRunSteps("missing", [])).rejects.toBeInstanceOf(StoreWriteError);
  });

  it("keeps reviews per client and returns copies", async () => {
    const store = createMemoryStore();
    const review = { ...emptyPropertyReview("costar-1"), notes: "call broker" };
    await store.savePropertyReview("client-a", review);
    review.notes = "mutated";
    expect((await store.loadPropertyReview("client-a", "costar-1"))!.notes).toBe("call broker");
    expect(await store.loadPropertyReview("client-b", "costar-1")).toBeNull();
  });
});

describe("postgres store", () => {
  it("throws StoreWriteError when a write does not change exactly one row", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const store = createPostgresStore({ query } as never);
    await expect(store.finishRun("run_1", "done", null, null)).rejects.toBeInstanceOf(StoreWriteError);
    query.mockResolvedValue({ rowCount: 1, rows: [] });
    await expect(store.saveRun(run())).resolves.toBeUndefined();
    expect(query.mock.calls.at(-1)![0]).toContain("gw_dev_runs");
  });

  it("maps rows back to the contract shape", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [{
      run_id: "run_1", property_id: "costar-1", status: "done", started_at: new Date(0), finished_at: new Date(1000),
      error: null, steps: [], memo_id: "memo_1",
    }] });
    const store = createPostgresStore({ query } as never);
    expect(await store.loadRun("run_1")).toEqual(run({
      status: "done", started_at: "1970-01-01T00:00:00.000Z", finished_at: "1970-01-01T00:00:01.000Z", memo_id: "memo_1",
    }));
    query.mockResolvedValue({ rowCount: 0, rows: [] });
    expect(await store.loadMemo("x")).toBeNull();
    expect(await store.runningRunFor("costar-1")).toBeNull();
  });
});

describe("storeKind", () => {
  it("defaults to memory and rejects typos", () => {
    vi.stubEnv("GW_STORE", undefined);
    expect(storeKind()).toBe("memory");
    vi.stubEnv("GW_STORE", "postgres");
    expect(storeKind()).toBe("postgres");
    vi.stubEnv("GW_STORE", "postgress");
    expect(() => storeKind()).toThrow("Unsupported GW_STORE");
  });
});

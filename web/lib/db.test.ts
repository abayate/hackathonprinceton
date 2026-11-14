import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { poolConstructor, query, envLookup, poolInstances } = vi.hoisted(() => ({
  poolConstructor: vi.fn(), query: vi.fn(), envLookup: vi.fn(), poolInstances: [] as unknown[],
}));
vi.mock("server-only", () => ({}));
vi.mock("pg", () => ({ Pool: class {
  constructor(options: unknown) { poolConstructor(options); poolInstances.push(this); }
  query = query;
  totalCount = 7;
  connect() { return this; }
  end() { return Promise.resolve(this); }
} }));
vi.mock("./env", () => ({ env: envLookup }));

const globalForTest = globalThis as typeof globalThis & { pool?: unknown };
const originalGlobalPool = globalForTest.pool;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  poolInstances.length = 0;
  delete globalForTest.pool;
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DATA_MODE", undefined);
  envLookup.mockImplementation(() => { throw new Error("DATABASE_URL is not set"); });
});
afterEach(() => {
  vi.unstubAllEnvs();
  if (originalGlobalPool === undefined) delete globalForTest.pool;
  else globalForTest.pool = originalGlobalPool;
});

describe("lazy database pool", () => {
  it("imports without looking up credentials or constructing a pool", async () => {
    const { pool } = await import("./db");
    expect(pool).toBeDefined();
    expect(envLookup).not.toHaveBeenCalled();
    expect(poolConstructor).not.toHaveBeenCalled();
  });

  it("never looks up credentials in public mode", async () => {
    vi.stubEnv("DATA_MODE", "public");
    globalForTest.pool = { query: vi.fn() };
    const { pool } = await import("./db");
    await expect(pool.query("select 1")).rejects.toThrow("public data mode");
    expect(envLookup).not.toHaveBeenCalled();
    expect(poolConstructor).not.toHaveBeenCalled();
    expect((globalForTest.pool as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
  });

  it("does not silently fall back to public data when database credentials are missing", async () => {
    const { pool } = await import("./db");
    await expect(pool.query("select 1")).rejects.toThrow("DATABASE_URL is not set");
    expect(envLookup).toHaveBeenCalledWith("DATABASE_URL");
    expect(poolConstructor).not.toHaveBeenCalled();
  });

  it("creates one pool on first database query and preserves query arguments", async () => {
    envLookup.mockReturnValue("postgres://placeholder.invalid/db");
    query.mockResolvedValue({ rows: [] });
    const { pool } = await import("./db");
    await pool.query("select $1", [1]);
    await pool.query("select $1", [2]);
    expect(poolConstructor).toHaveBeenCalledTimes(1);
    expect(poolConstructor).toHaveBeenCalledWith({ connectionString: "postgres://placeholder.invalid/db", max: 5 });
    expect(query).toHaveBeenNthCalledWith(1, "select $1", [1]);
    expect(query).toHaveBeenNthCalledWith(2, "select $1", [2]);
  });

  it("binds delegated methods to the real pool and reads its properties lazily", async () => {
    envLookup.mockReturnValue("postgres://placeholder.invalid/db");
    const { pool } = await import("./db");
    expect(poolConstructor).not.toHaveBeenCalled();
    expect(pool.totalCount).toBe(7);
    const actual = poolInstances[0];
    expect(pool.connect()).toBe(actual);
    expect(await pool.end()).toBe(actual);
    expect(poolConstructor).toHaveBeenCalledTimes(1);
  });

  it("reuses the development pool across module reloads without another credential lookup", async () => {
    vi.stubEnv("NODE_ENV", "development");
    envLookup.mockReturnValue("postgres://placeholder.invalid/db");
    query.mockResolvedValue({ rows: [] });
    const first = await import("./db");
    await first.pool.query("select 1");
    const actual = poolInstances[0];
    expect(globalForTest.pool).toBe(actual);

    vi.resetModules();
    const second = await import("./db");
    await second.pool.query("select 2");
    expect(poolConstructor).toHaveBeenCalledTimes(1);
    expect(envLookup).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(2);
  });
});

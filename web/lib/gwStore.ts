import "server-only";
import type { Pool } from "pg";
import type { PropertyReview } from "./propertyReview";
import type { Memo, RunRecord, RunStatus, RunStep } from "./runTypes";

/**
 * Groundwork storage: agent runs, memos and property reviews.
 * (Saved properties already persist through /api/watchlist into site_watchlist.)
 *
 * Two implementations behind one interface:
 * - memory (default): per-process, lost on restart. Fine for local dev; NOT for Vercel, where
 *   the investigate POST and the run GET can land on different instances.
 * - postgres (GW_STORE=postgres): non-production tables prefixed gw_dev_ in the DATABASE_URL database.
 *   Create them with `npm run db:setup`, which also proves that writes land.
 */
export interface GroundworkStore {
  readonly kind: "memory" | "postgres";
  saveRun(run: RunRecord): Promise<void>;
  updateRunSteps(runId: string, steps: RunStep[]): Promise<void>;
  finishRun(runId: string, status: Exclude<RunStatus, "running">, memoId: string | null, error: string | null): Promise<void>;
  loadRun(runId: string): Promise<RunRecord | null>;
  /** A run still marked running but older than STALE_RUN_MS is treated as dead (its function instance ended). */
  runningRunFor(propertyId: string): Promise<string | null>;
  saveMemo(memo: Memo): Promise<void>;
  loadMemo(memoId: string): Promise<Memo | null>;
  loadLatestMemo(propertyId: string): Promise<Memo | null>;
  savePropertyReview(clientId: string, review: PropertyReview): Promise<void>;
  loadPropertyReview(clientId: string, propertyId: string): Promise<PropertyReview | null>;
}

export const STALE_RUN_MS = 3 * 60_000;

/** Thrown when a write did not change exactly the expected rows. Callers map it to 503. */
export class StoreWriteError extends Error {
  constructor(readonly operation: string) {
    super(`Storage write did not land: ${operation}`);
    this.name = "StoreWriteError";
  }
}

const clone = <T>(value: T): T => structuredClone(value);
const isStale = (run: RunRecord, now: number) => now - Date.parse(run.started_at) > STALE_RUN_MS;

export function createMemoryStore(now: () => number = Date.now): GroundworkStore {
  const runs = new Map<string, RunRecord>();
  const memos = new Map<string, Memo>();
  const reviews = new Map<string, PropertyReview>();
  const runFor = (runId: string, operation: string) => {
    const run = runs.get(runId);
    if (!run) throw new StoreWriteError(operation);
    return run;
  };
  return {
    kind: "memory",
    async saveRun(run) { runs.set(run.run_id, clone(run)); },
    async updateRunSteps(runId, steps) { runFor(runId, "update_run_steps").steps = clone(steps); },
    async finishRun(runId, status, memoId, error) {
      const run = runFor(runId, "finish_run");
      Object.assign(run, { status, memo_id: memoId, error, finished_at: new Date(now()).toISOString() });
    },
    async loadRun(runId) { const run = runs.get(runId); return run ? clone(run) : null; },
    async runningRunFor(propertyId) {
      for (const run of runs.values()) {
        if (run.parcel_id === propertyId && run.status === "running" && !isStale(run, now())) return run.run_id;
      }
      return null;
    },
    async saveMemo(memo) { memos.set(memo.memo_id, clone(memo)); },
    async loadMemo(memoId) { const memo = memos.get(memoId); return memo ? clone(memo) : null; },
    async loadLatestMemo(propertyId) {
      const latest = [...memos.values()].filter((memo) => memo.parcel_id === propertyId)
        .sort((a, b) => b.generated_at.localeCompare(a.generated_at))[0];
      return latest ? clone(latest) : null;
    },
    async savePropertyReview(clientId, review) { reviews.set(`${clientId}:${review.propertyId}`, clone(review)); },
    async loadPropertyReview(clientId, propertyId) {
      const review = reviews.get(`${clientId}:${propertyId}`);
      return review ? clone(review) : null;
    },
  };
}

type Queryable = Pick<Pool, "query">;
const iso = (value: unknown): string | null => value == null ? null : new Date(value as string | Date).toISOString();

function runFromRow(row: Record<string, unknown>): RunRecord {
  return {
    run_id: String(row.run_id), parcel_id: String(row.property_id), status: row.status as RunStatus,
    started_at: iso(row.started_at)!, finished_at: iso(row.finished_at), error: (row.error as string | null) ?? null,
    steps: row.steps as RunStep[], memo_id: (row.memo_id as string | null) ?? null,
  };
}

export function createPostgresStore(db: Queryable): GroundworkStore {
  const write = async (operation: string, sql: string, args: unknown[]) => {
    const result = await db.query(sql, args);
    if (result.rowCount !== 1) throw new StoreWriteError(operation);
  };
  return {
    kind: "postgres",
    async saveRun(run) {
      await write("save_run", `INSERT INTO gw_dev_runs (run_id, property_id, status, started_at, finished_at, error, steps, memo_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [run.run_id, run.parcel_id, run.status, run.started_at, run.finished_at, run.error, JSON.stringify(run.steps), run.memo_id]);
    },
    async updateRunSteps(runId, steps) {
      await write("update_run_steps", "UPDATE gw_dev_runs SET steps = $2::jsonb WHERE run_id = $1", [runId, JSON.stringify(steps)]);
    },
    async finishRun(runId, status, memoId, error) {
      await write("finish_run", "UPDATE gw_dev_runs SET status = $2, memo_id = $3, error = $4, finished_at = now() WHERE run_id = $1",
        [runId, status, memoId, error]);
    },
    async loadRun(runId) {
      const { rows } = await db.query("SELECT * FROM gw_dev_runs WHERE run_id = $1", [runId]);
      return rows[0] ? runFromRow(rows[0]) : null;
    },
    async runningRunFor(propertyId) {
      const { rows } = await db.query(
        `SELECT run_id FROM gw_dev_runs WHERE property_id = $1 AND status = 'running'
           AND started_at > now() - ($2::int * interval '1 millisecond') ORDER BY started_at DESC LIMIT 1`,
        [propertyId, STALE_RUN_MS]);
      return rows[0]?.run_id ?? null;
    },
    async saveMemo(memo) {
      await write("save_memo", `INSERT INTO gw_dev_memos (memo_id, property_id, generated_at, digest_sha256, body)
        VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [memo.memo_id, memo.parcel_id, memo.generated_at, memo.digest_sha256, JSON.stringify(memo)]);
    },
    async loadMemo(memoId) {
      const { rows } = await db.query("SELECT body FROM gw_dev_memos WHERE memo_id = $1", [memoId]);
      return (rows[0]?.body as Memo | undefined) ?? null;
    },
    async loadLatestMemo(propertyId) {
      const { rows } = await db.query(
        "SELECT body FROM gw_dev_memos WHERE property_id = $1 ORDER BY generated_at DESC LIMIT 1", [propertyId]);
      return (rows[0]?.body as Memo | undefined) ?? null;
    },
    async savePropertyReview(clientId, review) {
      await write("save_property_review", `INSERT INTO gw_dev_property_reviews (client_id, property_id, review, updated_at)
        VALUES ($1, $2, $3::jsonb, now())
        ON CONFLICT (client_id, property_id) DO UPDATE SET review = EXCLUDED.review, updated_at = now()`,
      [clientId, review.propertyId, JSON.stringify(review)]);
    },
    async loadPropertyReview(clientId, propertyId) {
      const { rows } = await db.query(
        "SELECT review FROM gw_dev_property_reviews WHERE client_id = $1 AND property_id = $2", [clientId, propertyId]);
      return (rows[0]?.review as PropertyReview | undefined) ?? null;
    },
  };
}

/** Explicit, like DATA_MODE: a typo never silently falls back to memory in production. */
export function storeKind(): "memory" | "postgres" {
  const value = process.env.GW_STORE;
  if (value === undefined || value === "" || value === "memory") return "memory";
  if (value === "postgres") return "postgres";
  throw new Error(`Unsupported GW_STORE: ${value}`);
}

const globalStore = globalThis as unknown as { groundworkStore?: GroundworkStore };

export async function getStore(): Promise<GroundworkStore> {
  if (globalStore.groundworkStore) return globalStore.groundworkStore;
  if (storeKind() === "postgres") {
    const { pool } = await import("./db");
    globalStore.groundworkStore = createPostgresStore(pool);
  } else {
    globalStore.groundworkStore = createMemoryStore();
  }
  return globalStore.groundworkStore;
}

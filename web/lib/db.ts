import "server-only";
import { Pool } from "pg";
import { env } from "./env";
import { isPublicDataMode } from "./dataMode";

const globalForPool = globalThis as unknown as { pool?: Pool };
let localPool: Pool | undefined;

function getPool(): Pool {
  if (isPublicDataMode()) throw new Error("Database is unavailable in public data mode");
  if (localPool) return localPool;
  localPool = globalForPool.pool ?? new Pool({ connectionString: env("DATABASE_URL"), max: 5 });
  if (process.env.NODE_ENV !== "production") globalForPool.pool = localPool;
  return localPool;
}

// Keep the existing pool.query surface while deferring both env lookup and connection setup.
export const pool: Pool = new Proxy({} as Pool, {
  get(_target, property) {
    if (property === "query") {
      return (...args: unknown[]) => Promise.resolve().then(() => {
        const actual = getPool();
        return Reflect.apply(actual.query, actual, args);
      });
    }
    const actual = getPool();
    const value = Reflect.get(actual, property, actual);
    return typeof value === "function" ? value.bind(actual) : value;
  },
});

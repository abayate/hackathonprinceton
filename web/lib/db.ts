import "server-only";
import { Pool } from "pg";
import { env } from "./env";

const globalForPool = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForPool.pool ?? new Pool({ connectionString: env("DATABASE_URL"), max: 5 });

if (process.env.NODE_ENV !== "production") globalForPool.pool = pool;

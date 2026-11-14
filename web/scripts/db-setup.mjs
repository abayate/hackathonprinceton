// Creates the gw_dev_* tables and proves that writes land (insert -> read back -> delete) in each table
// the app writes to, including site_watchlist. Run from web/: `npm run db:setup`.
// Reads DATABASE_URL from the environment or the repo-root .env. Never prints the URL.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const file = path.resolve(process.cwd(), "..", ".env");
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
      if (match) return match[1];
    }
  }
  console.error("DATABASE_URL is not set (environment or repo-root .env).");
  process.exit(2);
}

const client = new pg.Client({ connectionString: databaseUrl() });
const results = [];
async function check(name, fn) {
  try { await fn(); results.push([name, "ok"]); }
  catch (error) { results.push([name, `FAILED: ${error.message}`]); }
}
const expectOne = (result, what) => { if (result.rowCount !== 1) throw new Error(`${what} changed ${result.rowCount} rows`); };

await client.connect();
try {
  await client.query(fs.readFileSync(new URL("../db/gw_dev.sql", import.meta.url), "utf8"));
  results.push(["schema gw_dev_*", "ok"]);

  const tag = `selftest_${randomUUID()}`;
  await check("gw_dev_runs write", async () => {
    expectOne(await client.query(
      "INSERT INTO gw_dev_runs (run_id, property_id, status, started_at, steps) VALUES ($1, 'costar-selftest', 'running', now(), '[]')", [tag]), "insert");
    expectOne(await client.query("UPDATE gw_dev_runs SET status = 'done', finished_at = now() WHERE run_id = $1", [tag]), "update");
    const { rows } = await client.query("SELECT status FROM gw_dev_runs WHERE run_id = $1", [tag]);
    if (rows[0]?.status !== "done") throw new Error("read-back mismatch");
    expectOne(await client.query("DELETE FROM gw_dev_runs WHERE run_id = $1", [tag]), "delete");
  });
  await check("gw_dev_memos write", async () => {
    expectOne(await client.query(
      "INSERT INTO gw_dev_memos (memo_id, property_id, generated_at, digest_sha256, body) VALUES ($1, 'costar-selftest', now(), 'x', $2)",
      [tag, JSON.stringify({ memo_id: tag })]), "insert");
    const { rows } = await client.query("SELECT body FROM gw_dev_memos WHERE memo_id = $1", [tag]);
    if (rows[0]?.body?.memo_id !== tag) throw new Error("read-back mismatch");
    expectOne(await client.query("DELETE FROM gw_dev_memos WHERE memo_id = $1", [tag]), "delete");
  });
  await check("gw_dev_property_reviews write", async () => {
    expectOne(await client.query(
      "INSERT INTO gw_dev_property_reviews (client_id, property_id, review) VALUES ($1, 'costar-selftest', '{}')", [tag]), "insert");
    expectOne(await client.query("DELETE FROM gw_dev_property_reviews WHERE client_id = $1", [tag]), "delete");
  });
  await check("site_watchlist write", async () => {
    const clientId = randomUUID();
    expectOne(await client.query("INSERT INTO site_watchlist (client_id, project_id) VALUES ($1, 'costar-selftest')", [clientId]), "insert");
    expectOne(await client.query("DELETE FROM site_watchlist WHERE client_id = $1", [clientId]), "delete");
  });
} finally {
  await client.end();
}

for (const [name, status] of results) console.log(`${status === "ok" ? "PASS" : "FAIL"}  ${name}${status === "ok" ? "" : `  ${status}`}`);
process.exit(results.every(([, status]) => status === "ok") ? 0 : 1);

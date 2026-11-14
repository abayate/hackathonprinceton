// One real Gemini call against one Houston property, using the same request shape as lib/geminiClient.ts.
// Run from web/:  npm run gemini:smoke             (reads a Houston listing from Tiger if DATABASE_URL is set)
//                 npm run gemini:smoke -- --facts '{"name":"...","address":"...","city":"Houston","state":"TX"}'
// Env: GEMINI_API_KEY (required), GEMINI_MODEL (optional, default gemini-4-carbon).
// Prints shapes and statuses only. The key is never printed; response text is redacted if it contains it.
import fs from "node:fs";
import path from "node:path";

function fromEnvFile(name) {
  if (process.env[name]) return process.env[name];
  const file = path.resolve(process.cwd(), "..", ".env");
  if (!fs.existsSync(file)) return undefined;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`).exec(line);
    if (match) return match[1];
  }
  return undefined;
}

const key = fromEnvFile("GEMINI_API_KEY")?.trim();
if (!key) { console.error("GEMINI_API_KEY is not set (environment or repo-root .env)."); process.exit(2); }
const model = fromEnvFile("GEMINI_MODEL")?.trim() || "gemini-4-carbon";
const redact = (text) => String(text).split(key).join("<redacted>");
const BASE = "https://generativelanguage.googleapis.com/v1beta";

async function houstonFacts() {
  const i = process.argv.indexOf("--facts");
  if (i > 0) return JSON.parse(process.argv[i + 1]);
  const url = fromEnvFile("DATABASE_URL");
  if (!url) {
    console.error("No --facts given and no DATABASE_URL to read a Houston listing from.");
    process.exit(2);
  }
  const pg = (await import("pg")).default;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query(`SELECT site_id, name, address, city, state, county, property_type, lot_acres, zoning, asking_price
      FROM sites WHERE state = 'TX' AND asking_price > 0 AND lot_acres > 0 ORDER BY lot_acres DESC LIMIT 1`);
    if (!rows[0]) throw new Error("No Houston listing with price and acreage in sites.");
    return rows[0];
  } finally { await client.end(); }
}

// 1. Which models can this key use? Settles the model-name question.
const list = await fetch(`${BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
console.log(`GET /models -> ${list.status}`);
if (list.ok) {
  const names = ((await list.json()).models ?? []).map((m) => m.name.replace(/^models\//, "")).filter((n) => n.startsWith("gemini"));
  console.log(`  gemini models: ${names.join(", ") || "(none)"}`);
  console.log(`  configured model "${model}" ${names.includes(model) ? "IS" : "is NOT"} in the list`);
}

// 2. The real call, same body shape as createGeminiMemoWriter().
const facts = await houstonFacts();
console.log(`Property: ${facts.site_id ?? "(from --facts)"} in ${facts.city}, ${facts.state}`);
const schema = {
  type: "object", additionalProperties: false,
  properties: {
    summary: { type: "string" },
    web_sources: { type: "array", maxItems: 4, items: { type: "object", additionalProperties: false,
      properties: { source_id: { type: "string" }, title: { type: "string" }, url: { type: "string" } }, required: ["source_id", "title", "url"] } },
  },
  required: ["summary", "web_sources"],
};
const input = `Use Google Search for local power, water, zoning and community context for a possible data center at this property. `
  + `Facts: ${JSON.stringify({ name: facts.name, address: facts.address, city: facts.city, state: facts.state, county: facts.county })}. `
  + `Write a two-sentence summary and cite up to 4 HTTPS pages with ids like "web-1". Do not state any dollar figures.`;
const started = Date.now();
const res = await fetch(`${BASE}/interactions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-goog-api-key": key, "Api-Revision": "2026-05-20" },
  body: JSON.stringify({
    model, input, tools: [{ type: "google_search" }],
    response_format: { type: "text", mime_type: "application/json", schema },
    generation_config: { max_output_tokens: 4096 }, store: false,
  }),
});
const raw = await res.text();
console.log(`POST /interactions -> ${res.status} in ${Date.now() - started} ms, content-type ${res.headers.get("content-type")}`);
let body;
try { body = JSON.parse(raw); } catch { console.log(`  not JSON: ${redact(raw.slice(0, 400))}`); process.exit(1); }
if (!res.ok) { console.log(`  error: ${redact(JSON.stringify(body.error ?? body).slice(0, 600))}`); process.exit(1); }

// 3. Check each assumption parseOutput() makes, so a mismatch points at the exact line to fix.
const checks = [];
const ok = (label, pass, detail = "") => { checks.push(pass); console.log(`  ${pass ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`); };
console.log(`  top-level keys: ${Object.keys(body).join(", ")}`);
ok('status === "completed"', body.status === "completed", `got ${JSON.stringify(body.status)}`);
ok("steps is an array", Array.isArray(body.steps));
const steps = Array.isArray(body.steps) ? body.steps : [];
console.log(`  step types: ${steps.map((s) => s?.type).join(", ")}`);
const outputs = steps.filter((s) => s?.type === "model_output");
ok("exactly one model_output step", outputs.length === 1, `got ${outputs.length}`);
const content = outputs[0]?.content;
ok("model_output has exactly one content item", Array.isArray(content) && content.length === 1,
  Array.isArray(content) ? `${content.length} items of type ${content.map((c) => c?.type).join("/")}` : typeof content);
const text = Array.isArray(content) ? content.find((c) => c?.type === "text")?.text : undefined;
let parsed;
try { parsed = JSON.parse(text); } catch { /* reported below */ }
ok("text parses as JSON matching the schema", Boolean(parsed?.summary && Array.isArray(parsed?.web_sources)));
if (parsed) {
  console.log(`  summary: ${redact(parsed.summary).slice(0, 300)}`);
  for (const s of parsed.web_sources) console.log(`  source ${s.source_id}: ${redact(s.url)}`);
}
console.log(checks.every(Boolean) ? "Adapter assumptions hold." : "Adapter needs fixing: see FAIL lines and lib/geminiClient.ts parseOutput().");
process.exit(checks.every(Boolean) ? 0 : 1);

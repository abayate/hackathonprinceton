#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("../", import.meta.url));
const data = path.resolve(web, "..", "data");
const next = path.join(web, "node_modules", "next", "dist", "bin", "next");
let tempHome;
const childEnv = () => ({
  PATH: process.env.PATH ?? "/usr/bin:/bin",
  DATA_MODE: "public",
  ENABLE_EVIDENCE_INTAKE: "false",
  ENABLE_INVESTIGATOR: "false",
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_ENV: "production",
  CI: "1",
  HOME: tempHome,
});
let active;
let stopping = false;
let childOutput = "";
let childError;

function csvRows(text) {
  const lines = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && !field) quoted = true;
    else if (c === "," || c === "\n" || c === "\r") {
      row.push(field); field = "";
      if (c !== ",") {
        if (row.some(Boolean)) lines.push(row);
        row = [];
        if (c === "\r" && text[i + 1] === "\n") i++;
      }
    } else field += c;
  }
  if (quoted) throw new Error("Unterminated public CSV field");
  if (field || row.length) lines.push([...row, field]);
  const [header, ...values] = lines;
  assert(header?.includes("project_id"), "Public CSV headers are missing");
  return values.map((record) => Object.fromEntries(header.map((key, i) => [key, record[i]])));
}

const projects = csvRows(fs.readFileSync(path.join(data, "labels", "tx_projects.csv"), "utf8"));
const features = new Map(csvRows(fs.readFileSync(path.join(data, "features", "tx_project_features.csv"), "utf8"))
  .map((row) => [row.project_id, row]));
const artifact = JSON.parse(fs.readFileSync(path.join(data, "model", "risk_model.json"), "utf8"));
const signals = JSON.parse(fs.readFileSync(path.join(data, "signals", "risk_signals.json"), "utf8"));
const labelReviews = JSON.parse(fs.readFileSync(path.join(data, "signals", "label_review.json"), "utf8"));
const model = artifact.comparisons[artifact.default_model];
const sanMarcos = projects.find((project) => project.name === "Highlander SM One LLC (San Marcos)");
const tomahawk = projects.find((project) => project.name.startsWith("Project Tomahawk"));
const sabey = projects.find((project) => project.name.startsWith("Sabey/Carson Select San Marcos"));
const athens = projects.find((project) => project.name === "Data Factory Athens Data Center");
const diode = projects.find((project) => project.name === "Diode Ventures Henderson County Data Center");
assert(sanMarcos && tomahawk && sabey && athens && diode, "Smoke fixture projects are missing");

function chicagoDay(value, precision = "minute") {
  if (precision === "day") return value.slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function previousDay(day) {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

function projectSignals(id) {
  return signals.filter((signal) => signal.scope === "project" && signal.entity_id === id);
}

function firstRaiseDay(id) {
  return projectSignals(id).filter((signal) => signal.effect === "raise")
    .map((signal) => chicagoDay(signal.published_at, signal.published_precision)).sort()[0];
}

function firstOutcomePublicationDay(id) {
  return projectSignals(id).filter((signal) => signal.effect === "outcome")
    .map((signal) => chicagoDay(signal.published_at, signal.published_precision)).sort()[0];
}

const normalized = (value) => value?.trim().toLocaleLowerCase();
function applies(signal, project) {
  if (signal.scope === "project") return signal.entity_id === project.project_id;
  if (normalized(signal.county) !== normalized(project.county) || normalized(signal.state) !== "tx") return false;
  if (signal.scope === "county") return true;
  const feature = features.get(project.project_id);
  return signal.scope === "city" && feature?.in_city_limits === "yes"
    && normalized(signal.city) === normalized(feature.city);
}
function signalsFor(project) { return signals.filter((signal) => applies(signal, project)); }
function visibleSignalCount(project, day) {
  return signalsFor(project).filter((signal) => chicagoDay(signal.published_at, signal.published_precision) <= day).length;
}

function score(project) {
  const f = features.get(project.project_id);
  assert(f?.location_reliable === "yes", `Project ${project.project_id} is not scored`);
  const values = [
    Number(f.in_city_limits === "yes"), Number(f.in_urban_area === "yes"),
    Math.log10(Number(f.county_density_per_sqmi) + 1),
    Math.log10(Number(f.km_to_nearest_metro) + 1),
    Number(f.is_crypto === "yes"), Math.log10(Number(f.county_tracked_projects)),
  ];
  const names = ["in_city_limits", "in_urban_area", "log_county_density", "log_km_to_metro", "is_crypto", "log_county_projects"];
  const z = values.reduce((sum, value, i) => sum + model.coefficients[names[i]]
    * (value - model.feature_mean[i]) / model.feature_std[i], model.intercept);
  return Math.round(10000 / (1 + Math.exp(-z))) / 10000;
}

function expectedScenario(project) {
  const risk = score(project);
  const band = risk >= 0.6 ? "red" : risk >= 0.4 ? "watch" : "green";
  const rate = model.metrics.band_outcomes_oof.bands[band].rate;
  const dollars = rate * 12 * 100_000 * 170;
  const money = dollars >= 1e9 ? `$${(dollars / 1e9).toFixed(1)}B`
    : dollars >= 1e6 ? `$${(dollars / 1e6).toFixed(0)}M`
      : dollars >= 1e3 ? `$${(dollars / 1e3).toFixed(0)}K` : `$${dollars.toFixed(0)}`;
  return { risk, band, money };
}

function expectedCaseIds() {
  return projects.filter((project) => signals.some((signal) => signal.verification.method === "manual_review"
    && signal.verification.publication_date_basis === "source_page" && applies(signal, project)))
    .map((project) => project.project_id);
}

function log(label, route) { console.log(`ok ${label} ${route}`); }
function visibleText(body) {
  return body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => {
      if (entity[0] === "#") return String.fromCodePoint(Number.parseInt(entity.slice(entity[1]?.toLowerCase() === "x" ? 2 : 1), entity[1]?.toLowerCase() === "x" ? 16 : 10));
      return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[entity.toLowerCase()];
    }).replace(/\s+/g, " ").trim();
}
function requireText(body, expected, route) {
  if (!visibleText(body).includes(expected)) throw new Error(`${route}: visible page text missing ${JSON.stringify(expected)}`);
}
function requireMarkup(body, expected, route) {
  if (!body.includes(expected)) throw new Error(`${route}: HTML missing ${JSON.stringify(expected)}`);
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function start(args, env) {
  const child = spawn(process.execPath, [next, ...args], {
    cwd: web, env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32",
  });
  childOutput = "";
  childError = undefined;
  child.on("error", (error) => { childError = error; });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => {
    childOutput = (childOutput + chunk.toString()).slice(-6000);
  });
  active = child;
  return child;
}

async function stop() {
  if (stopping) return;
  stopping = true;
  const child = active;
  try {
    if (child && child.exitCode === null && child.signalCode === null) {
      try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGTERM"); } catch { /* already exited */ }
      await waitForClose(child, 5000);
      if (child.exitCode === null && child.signalCode === null) {
        try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL"); } catch { /* already exited */ }
        await waitForClose(child, 5000);
      }
    }
    if (child && child.exitCode === null && child.signalCode === null)
      throw new Error("Smoke child process did not exit after shutdown");
  } finally {
    if (tempHome) fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

function waitForClose(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => { child.off("close", done); resolve(); }, timeoutMs);
    timer.unref();
    function done() { clearTimeout(timer); resolve(); }
    child.once("close", done);
  });
}

for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) process.once(signal, () => {
  void stop().catch((error) => console.error(`SMOKE FAIL cleanup: ${error.message}`))
    .finally(() => { process.exit(code); });
});

async function build() {
  const child = start(["build", "--turbopack"], childEnv());
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("next build timed out")), 180_000);
    timer.unref();
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
  });
  if (result.code !== 0) throw new Error(`next build exited ${result.code ?? result.signal}\n${childOutput}`);
  active = undefined;
  log("production build", "next build");
}

async function waitReady(origin, child) {
  const end = Date.now() + 30_000;
  while (Date.now() < end) {
    if (childError) throw new Error(`next start failed: ${childError.message}`);
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`next start exited ${child.exitCode ?? child.signalCode}\n${childOutput}`);
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(1500), redirect: "manual" });
      await response.body?.cancel();
      return;
    } catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  throw new Error(`next start readiness timed out\n${childOutput}`);
}

async function request(origin, route, options = {}) {
  const url = new URL(route, origin);
  assert.equal(url.origin, origin, "Smoke HTTP client may call only its loopback server");
  assert.equal(url.protocol, "http:", "Smoke HTTP client may use HTTP only");
  const response = await fetch(url, { ...options, redirect: "manual", signal: AbortSignal.timeout(15_000) });
  const body = await response.text();
  const plainSlashes = body.replace(/\\\//g, "/");
  const localRoots = [web, data, tempHome, os.tmpdir(), "/Users/", "/home/", "/var/folders/",
    "/tmp/", "/private/tmp/", "/opt/", "/workspace/"].filter(Boolean);
  if (localRoots.some((root) => plainSlashes.includes(root))
    || /file:\/\/\//.test(plainSlashes)
    || /(?:Error|TypeError|ReferenceError):.{0,200}(?:\n|\\n)\s*at\s/.test(body)) {
    throw new Error(`${route}: response leaked a local path or stack trace`);
  }
  return { status: response.status, body, headers: response.headers };
}

function status(result, expected, route) {
  if (result.status !== expected) throw new Error(`${route}: expected HTTP ${expected}, got ${result.status}`);
}

async function check(origin, label, route, expectedStatus, verify, options) {
  const result = await request(origin, route, options);
  status(result, expectedStatus, route);
  verify?.(result);
  log(label, route);
  return result;
}

async function run() {
  if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Smoke requires Node 24 or newer");
  if (!fs.existsSync(next)) throw new Error("Install web dependencies before running smoke");
  const localEnvFiles = fs.readdirSync(web).filter((name) => name !== ".env.example" && /^\.env(?:\.|$)/.test(name));
  if (localEnvFiles.length || fs.existsSync(path.resolve(web, "..", ".env")))
    throw new Error("Move local .env files out of the worktree before the credential-free smoke run");
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "groundwork-smoke-"));
  await build();
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = start(["start", "-H", "127.0.0.1", "-p", String(port)], { ...childEnv(), PORT: String(port) });
  await waitReady(origin, server);
  log("production server ready", origin);

  await check(origin, "property home without database", "/", 200, ({ body }) => {
    requireMarkup(body, "/projects", "/");
    assert(!body.includes("data-project-id="), "Public home must not display projects as properties");
  });
  await check(origin, "project research", "/projects", 200, ({ body }) => {
    requireText(body, "Public data mode: Texas tracked projects only.", "/projects");
    requireText(body, `${projects.filter((project) => project.label === "unlabeled").length} projects`, "/");
    requireText(body, "Tracker label:", "/");
  });
  await check(origin, "San Marcos search", "/projects?status=all&q=San%20Marcos", 200, ({ body }) => {
    const matches = projects.filter((project) => [project.name, project.county, features.get(project.project_id)?.city ?? ""]
      .some((value) => value.toLocaleLowerCase().includes("san marcos")));
    assert.equal(matches.length, 3, "Public CSV should contain three San Marcos search matches");
    requireText(body, `${matches.length} projects`, "/projects?status=all&q=San%20Marcos");
    for (const project of matches)
      requireText(body, project.name, "/projects?status=all&q=San%20Marcos");
  });
  const scenario = expectedScenario(sanMarcos);
  await check(origin, "San Marcos score and scenario", `/sites/${sanMarcos.project_id}`, 200, ({ body }) => {
    requireText(body, `Risk score ${Math.floor(scenario.risk * 100)}/100`, "San Marcos page");
    requireText(body, { green: "Low risk", watch: "Watch", red: "High risk" }[scenario.band], "San Marcos page");
    requireText(body, `Delay exposure scenario: ${scenario.money} at 100 MW`, "San Marcos page");
  });
  const sanRaise = firstRaiseDay(sanMarcos.project_id);
  assert(sanRaise, "San Marcos raise record is missing");
  assert.equal(visibleSignalCount(sanMarcos, previousDay(sanRaise)), 0,
    "San Marcos fixture should have no record before the first raise");
  const sanBeforeRoute = `/sites/${sanMarcos.project_id}?asof=${previousDay(sanRaise)}`;
  await check(origin, "San Marcos before raise", sanBeforeRoute, 200, ({ body }) => {
    requireText(body, `Showing ${visibleSignalCount(sanMarcos, previousDay(sanRaise))} of ${signalsFor(sanMarcos).length} records`, sanBeforeRoute);
    requireText(body, "No known raising signal", sanBeforeRoute);
  });
  const sanRaiseRoute = `/sites/${sanMarcos.project_id}?asof=${sanRaise}`;
  await check(origin, "San Marcos raise day", sanRaiseRoute, 200, ({ body }) => {
    requireText(body, `Showing ${visibleSignalCount(sanMarcos, sanRaise)} of ${signalsFor(sanMarcos).length} records`, sanRaiseRoute);
    requireText(body, "Approval failed", sanRaiseRoute);
    requireText(body, "Raises evidence level one step", sanRaiseRoute);
  });
  const tomRaise = firstRaiseDay(tomahawk.project_id);
  const tomOutcome = firstOutcomePublicationDay(tomahawk.project_id);
  assert(tomRaise && tomOutcome, "Tomahawk raise or outcome record is missing");
  assert.equal(visibleSignalCount(tomahawk, previousDay(tomRaise)), 0,
    "Tomahawk fixture should have no record before the first raise");
  const tomBeforeRoute = `/sites/${tomahawk.project_id}?asof=${previousDay(tomRaise)}`;
  await check(origin, "Tomahawk before raise", tomBeforeRoute, 200, ({ body }) => {
    requireText(body, `Showing ${visibleSignalCount(tomahawk, previousDay(tomRaise))} of ${signalsFor(tomahawk).length} records`, tomBeforeRoute);
    requireText(body, "No known raising signal", tomBeforeRoute);
  });
  const tomRaiseRoute = `/sites/${tomahawk.project_id}?asof=${tomRaise}`;
  await check(origin, "Tomahawk raise day", tomRaiseRoute, 200, ({ body }) => {
    requireText(body, `Showing ${visibleSignalCount(tomahawk, tomRaise)} of ${signalsFor(tomahawk).length} records`, tomRaiseRoute);
    requireText(body, "Approval failed", tomRaiseRoute);
  });
  const tomOutcomeRoute = `/sites/${tomahawk.project_id}?asof=${tomOutcome}`;
  await check(origin, "Tomahawk outcome day", tomOutcomeRoute, 200, ({ body }) => {
    requireText(body, `Showing ${visibleSignalCount(tomahawk, tomOutcome)} of ${signalsFor(tomahawk).length} records`, tomOutcomeRoute);
    requireText(body, "Outcome: withdrawn", tomOutcomeRoute);
  });
  const county = signals.find((signal) => signal.scope === "county" && signal.county === sabey.county);
  assert(county, "Hays County context signal is missing");
  const countyDay = chicagoDay(county.published_at, county.published_precision);
  assert.equal(signalsFor(sabey).length, 1, "Sabey should have one county context record");
  const countyRoute = `/sites/${sabey.project_id}?asof=${countyDay}`;
  await check(origin, "Sabey county context", countyRoute, 200, ({ body }) => {
    requireText(body, `Showing ${visibleSignalCount(sabey, countyDay)} of ${signalsFor(sabey).length} records`, countyRoute);
    requireText(body, "County-wide: Hays County", countyRoute);
    requireText(body, "No known raising signal", countyRoute);
  });
  const city = signals.find((signal) => signal.scope === "city" && signal.signal_type === "ordinance_enacted"
    && normalized(signal.city) === "athens city" && normalized(signal.county) === "henderson county");
  assert(city, "Athens city ordinance fixture is missing");
  const cityDay = chicagoDay(city.published_at, city.published_precision);
  for (const [project, label] of [[athens, "Athens city context"], [diode, "Diode city context"]]) {
    const feature = features.get(project.project_id);
    assert(feature?.in_city_limits === "yes" && normalized(feature.city) === "athens city",
      `${project.name}: expected Athens city-limits feature`);
    const route = `/sites/${project.project_id}?asof=${cityDay}`;
    await check(origin, label, route, 200, ({ body }) => {
      requireText(body, `Showing ${visibleSignalCount(project, cityDay)} of ${signalsFor(project).length} records`, route);
      requireText(body, "City-wide: Athens", route);
      requireText(body, "No known raising signal", route);
      requireMarkup(body, city.source_url, route);
    });
  }
  for (const review of labelReviews) {
    const route = `/sites/${review.project_id}`;
    await check(origin, "tracker label review", route, 200, ({ body }) => {
      const start = body.indexOf('id="tracker-status"');
      const panel = body.slice(start, body.indexOf("</section>", start));
      assert(start >= 0 && panel, `${route}: tracker status panel missing`);
      requireText(panel, "Tracker status", route);
      requireText(panel, `The tracker lists this project as ${review.tracker_status} (${review.tracker_stop_date}).`, route);
      requireText(panel, "This is the tracker's label and has not been independently verified.", route);
      requireText(panel, "Our review", route);
      requireText(panel, review.note, route);
      requireText(panel, `Kind: ${review.kind_finding.replaceAll("_", " ")}`, route);
      requireText(panel, `Date: ${review.date_finding.replaceAll("_", " ")}`, route);
      requireMarkup(panel, "#evidence-timeline", route);
      assert(!visibleText(body).includes("This project was "), `${route}: old unattributed tracker claim remains`);
    });
  }
  await check(origin, "evidence table", "/evidence", 200, ({ body }) => {
    requireText(body, `${model.metrics.roc_auc_mean.toFixed(2)} ± ${model.metrics.roc_auc_std.toFixed(2)}`, "/evidence");
    const reviewStart = body.indexOf('id="training-label-check"');
    const reviewSection = body.slice(reviewStart, body.indexOf("</section>", reviewStart));
    assert(reviewStart >= 0 && reviewSection, "/evidence: training label check is missing");
    requireText(reviewSection, "Training label check", "/evidence");
    requireText(reviewSection, `${labelReviews.length} of ${model.metrics.n_stopped} stopped training labels`, "/evidence");
    requireText(reviewSection, `${labelReviews.filter((entry) => entry.kind_finding === "consistent").length} consistent in outcome kind`, "/evidence");
    requireText(reviewSection, `${labelReviews.filter((entry) => entry.date_finding === "consistent").length} consistent in date`, "/evidence");
    requireText(reviewSection, "not an audit", "/evidence");
    const start = body.indexOf('id="recorded-cases"');
    const table = body.slice(start, body.indexOf("</table>", start));
    const rows = table.slice(table.indexOf("<tbody"), table.indexOf("</tbody>"));
    const ids = expectedCaseIds();
    assert.equal(ids.length, 7, "Fixture should yield seven public case-study rows");
    assert(start >= 0 && rows, "/evidence: case table is missing");
    const count = (rows.match(/<tr\b/g) ?? []).length;
    if (count !== ids.length) throw new Error(`/evidence: expected ${ids.length} case rows, got ${count}`);
    for (const id of ids) requireMarkup(rows, `/sites/${id}`, "/evidence case table");
    const tomRow = rows.split(/(?=<tr\b)/).find((row) => row.includes(`/sites/${tomahawk.project_id}`));
    assert(tomRow, "/evidence: Tomahawk case row is missing");
    const withdrawal = projectSignals(tomahawk.project_id).find((signal) => signal.signal_type === "outcome_withdrawn");
    assert(withdrawal, "Tomahawk withdrawal fixture is missing");
    const outcomeDay = withdrawal.event_at && withdrawal.event_precision !== "unknown"
      ? chicagoDay(withdrawal.event_at, withdrawal.event_precision)
      : chicagoDay(withdrawal.published_at, withdrawal.published_precision);
    const leadDays = (Date.parse(`${outcomeDay}T00:00:00Z`) - Date.parse(`${tomRaise}T00:00:00Z`)) / 86_400_000;
    assert.equal(leadDays, 6, "Tomahawk case should have a six-day lead");
    requireText(tomRow, `${leadDays} days`, "/evidence Tomahawk row");
    requireText(tomRow, withdrawal.event_at && withdrawal.event_precision !== "unknown"
      ? "Event day" : "Publication day; event day unknown", "/evidence Tomahawk row");
  });
  const saveRoute = "/api/watchlist";
  const saved = await check(origin, "save to watchlist", saveRoute, 200, ({ body }) => {
    assert.equal(JSON.parse(body).saved, true, `${saveRoute}: save response`);
  }, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: sanMarcos.project_id }) });
  const cookie = saved.headers.get("set-cookie")?.split(";")[0];
  assert(cookie?.startsWith("client_id="), `${saveRoute}: missing client_id cookie`);
  await check(origin, "watchlist session", "/watchlist", 200, ({ body }) => {
    requireText(body, sanMarcos.name, "/watchlist");
  }, { headers: { Cookie: cookie } });
  const replayRoute = "/watchlist?since=2025-08-01";
  await check(origin, "four-record replay", replayRoute, 200, ({ body }) => {
    requireText(body, "Replay of retrospectively assembled records", replayRoute);
    const sectionStart = body.indexOf(">What changed</h2>");
    const section = body.slice(sectionStart, body.indexOf("</section>", sectionStart));
    assert(sectionStart >= 0 && section, `${replayRoute}: change feed missing`);
    const count = (section.match(/<li\b/g) ?? []).length;
    const expected = signalsFor(sanMarcos).filter((signal) => chicagoDay(signal.published_at, signal.published_precision) > "2025-08-01").length;
    assert.equal(expected, 4, "San Marcos fixture should have four replay records");
    if (count !== expected) throw new Error(`${replayRoute}: expected ${expected} replay entries, got ${count}`);
  }, { headers: { Cookie: cookie } });
  for (const [label, route, options] of [
    ["evidence intake closed", "/api/evidence", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }],
    ["investigator closed", "/api/investigate", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }],
    ["listing closed", "/listings/costar-1", {}],
    ["Vexcel image closed", "/api/vexcel/image/costar-1", {}],
    ["Vexcel 3D closed", "/api/vexcel/3d/tileset", {}],
  ]) await check(origin, label, route, 404, undefined, options);
  const malformedRoute = `/sites/${sanMarcos.project_id}?asof=not-a-date`;
  await check(origin, "malformed date safe", malformedRoute, 200, ({ body }) => {
    requireText(body, sanMarcos.name, malformedRoute);
  });
  const hugeMwRoute = `/sites/${sanMarcos.project_id}?mw=999999999`;
  await check(origin, "huge capacity clamped", hugeMwRoute, 200, ({ body }) => {
    requireText(body, "Cost at 5000 MW", hugeMwRoute);
  });
  await check(origin, "unknown project safe", "/sites/unknown-project-id", 404);
  log("no response leaks", "all HTTP responses");
}

try {
  await run();
} catch (error) {
  console.error(`SMOKE FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await stop();
}

import "server-only";
import { cache } from "react";
import fs from "node:fs";
import path from "node:path";
import { parseSignals } from "./signals";

/** Public, retrospectively assembled fixture; no live ingestion or database write. */
export const getSignals = cache(async () => {
  const file = path.resolve(process.cwd(), "..", "data", "signals", "risk_signals.json");
  return parseSignals(JSON.parse(fs.readFileSync(file, "utf8")));
});

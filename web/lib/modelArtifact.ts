import "server-only";

import { cache } from "react";
import fs from "node:fs";
import path from "node:path";
import { parseModelCard } from "./modelCard";

/** Load the local model artifact once per server render request. */
export const getModelArtifact = cache(async () => {
  const file = path.resolve(process.cwd(), "..", "data", "model", "risk_model.json");
  return parseModelCard(JSON.parse(fs.readFileSync(file, "utf8")));
});

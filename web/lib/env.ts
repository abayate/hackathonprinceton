import "server-only";
import fs from "node:fs";
import path from "node:path";

let fileEnv: Record<string, string> | null = null;

// Reads a secret from the environment, or from the repo-root .env in local dev.
export function env(name: string): string {
  if (process.env[name]) return process.env[name] as string;
  if (!fileEnv) {
    fileEnv = {};
    const f = path.resolve(process.cwd(), "..", ".env");
    if (fs.existsSync(f)) {
      for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
        const i = line.indexOf("=");
        if (i > 0 && !line.startsWith("#")) fileEnv[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      }
    }
  }
  const v = fileEnv[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

// Where server-side caches live (sponsor imagery stays out of git).
export function cacheDir(...parts: string[]): string {
  const base = process.env.CACHE_DIR ?? path.resolve(process.cwd(), "..", "data", "private", "cache");
  const dir = path.join(base, ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

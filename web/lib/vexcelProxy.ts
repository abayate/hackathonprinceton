import "server-only";

const API_ORIGIN = "https://api.vexcelgroup.com";
const DEFAULT_REQUESTS_PER_MINUTE = 600;
const MAX_REQUESTS_PER_MINUTE = 10_000;
const MINUTE_MS = 60_000;
const MAX_QUERY_LENGTH = 2_048;
const MAX_PARAMETERS = 16;
const MAX_VALUE_LENGTH = 256;
const MAX_REDIRECTS = 2;
const REQUEST_TIMEOUT_MS = 30_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const FAILURE_DETAIL = "Imagery provider request failed";
const REDIRECT_DETAIL = "Imagery provider redirected to an unapproved host";

/** Generic bounds, not a verified schema for Vexcel's child tile requests. */
export function validVexcelQuery(search: string): boolean {
  if (search.length > MAX_QUERY_LENGTH) return false;
  const entries = [...new URLSearchParams(search)];
  if (entries.length > MAX_PARAMETERS) return false;
  if (entries.some(([name, value]) => !/^[A-Za-z0-9_-]+$/.test(name)
    || value.length > MAX_VALUE_LENGTH || !/^[A-Za-z0-9._~!$&'()*+,;=:@%/?+-]*$/.test(value))) return false;
  const coordinates = entries.filter(([name]) => ["zoom", "tile-x", "tile-y"].includes(name));
  if (coordinates.some(([, value]) => !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) return false;
  const zooms = coordinates.filter(([name]) => name === "zoom").map(([, value]) => Number(value));
  // Keep arithmetic exact. At zoom53 every valid tile coordinate is a safe integer.
  if (zooms.some((zoom) => zoom > 53)) return false;
  const limit = zooms.length ? 2 ** Math.min(...zooms) : undefined;
  return limit === undefined || coordinates.every(([name, value]) => name === "zoom" || Number(value) < limit);
}

export function validVexcelFetchSite(value: string | null): boolean {
  return value === null || value === "same-origin" || value === "none";
}

let windowState: { startedAt: number; count: number } | undefined;

/** Per Node process only; synchronous reservation precedes key access and fetch. */
export function reserveVexcelRequest(now = Date.now()): boolean {
  const raw = process.env.VEXCEL_REQUESTS_PER_MINUTE ?? "";
  const parsed = /^\d+$/.test(raw) ? Number(raw) : NaN;
  const limit = Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= MAX_REQUESTS_PER_MINUTE
    ? parsed : DEFAULT_REQUESTS_PER_MINUTE;
  const current = !windowState || now - windowState.startedAt >= MINUTE_MS
    ? { startedAt: now, count: 0 } : windowState;
  if (current.count >= limit) return false;
  windowState = { ...current, count: current.count + 1 };
  return true;
}

class VexcelProxyError extends Error {
  constructor(readonly reason: "redirect" | "failed") {
    super(reason === "redirect" ? REDIRECT_DETAIL : FAILURE_DETAIL);
  }
}

export function vexcelErrorDetail(error: unknown): string {
  return error instanceof VexcelProxyError ? error.message : FAILURE_DETAIL;
}

function permittedTarget(url: URL): boolean {
  return url.origin === API_ORIGIN && !url.username && !url.password;
}

function refuseRedirect(url: URL | undefined, apiKey: string): never {
  const hostname = url?.hostname;
  // Log only a parsed hostname, never a location URL or credential-bearing text.
  const safeHost = hostname && /^[a-z0-9.-]{1,253}$/i.test(hostname)
    && !hostname.toLowerCase().includes(apiKey.toLowerCase()) ? hostname : "[redacted]";
  console.warn("Vexcel redirect refused:", safeHost);
  throw new VexcelProxyError("redirect");
}

/** No cross-origin escape hatch until a provider redirect contract is confirmed. */
export async function fetchVexcel(input: URL | string, apiKey: string): Promise<Response> {
  try {
    let url = new URL(input);
    if (!permittedTarget(url)) throw new VexcelProxyError("failed");
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    for (let hops = 0; ; hops++) {
      const response = await fetch(url, {
        headers: { "X-API-KEY": apiKey }, cache: "no-store", redirect: "manual", signal,
      });
      if (!REDIRECT_STATUSES.has(response.status)) return response;
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (hops >= MAX_REDIRECTS || !location) throw new VexcelProxyError("failed");
      let target: URL;
      try { target = new URL(location, url); } catch { refuseRedirect(undefined, apiKey); }
      if (!permittedTarget(target)) refuseRedirect(target, apiKey);
      url = target;
    }
  } catch (error) {
    throw error instanceof VexcelProxyError ? error : new VexcelProxyError("failed");
  }
}

import "server-only";
import { lookup } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";

export type SafeFetchCode = "invalid_url" | "blocked_address" | "fetch_failed";
export class SafeFetchError extends Error {
  constructor(public readonly code: SafeFetchCode, message: string, public readonly status?: number) {
    super(message);
    this.name = "SafeFetchError";
  }
}

type Address = { address: string; family: 4 | 6 };
type ResponseHead = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
  close: () => void;
};
export type SafeFetchDeps = {
  resolve?: (hostname: string, signal: AbortSignal) => Promise<readonly Address[]>;
  transport?: (url: URL, address: Address, signal: AbortSignal) => Promise<ResponseHead>;
  /** Test only: production callers use the fixed five-second ceiling. */
  timeoutMs?: number;
};

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function v4Number(address: string): number {
  return address.split(".").reduce((value, part) => value * 256 + Number(part), 0);
}

function v4InCidr(address: string, base: string, bits: number): boolean {
  const divisor = 2 ** (32 - bits);
  return Math.floor(v4Number(address) / divisor) === Math.floor(v4Number(base) / divisor);
}

const RESERVED_V4: readonly [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["168.63.129.16", 32], // Azure platform virtual IP.
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
];

function v6Number(address: string): bigint {
  const [left, right = ""] = address.toLowerCase().split("::");
  const front = left ? left.split(":") : [];
  const back = right ? right.split(":") : [];
  const parts = [...front, ...Array(8 - front.length - back.length).fill("0"), ...back];
  return parts.reduce((value, part) => (value << BigInt(16)) | BigInt(parseInt(part, 16)), BigInt(0));
}

function v6InCidr(address: string, base: string, bits: number): boolean {
  const shift = BigInt(128 - bits);
  return (v6Number(address) >> shift) === (v6Number(base) >> shift);
}

/** Conservatively allow public unicast only; block reserved and translation ranges. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !RESERVED_V4.some(([base, bits]) => v4InCidr(address, base, bits));
  if (family !== 6 || address.includes(".") || address.includes("%")) return false;
  if (!v6InCidr(address, "2000::", 3)) return false;
  return ![["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]].some(
    ([base, bits]) => v6InCidr(address, base as string, bits as number),
  );
}

function checkedUrl(raw: string, base?: URL): URL {
  let url: URL;
  try { url = new URL(raw, base); } catch { throw new SafeFetchError("invalid_url", "Invalid source URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new SafeFetchError("invalid_url", "Source URL must use HTTPS without credentials or a custom port");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new SafeFetchError("blocked_address", "Source host is not public");
  }
  return url;
}

function header(headers: ResponseHead["headers"], name: string): string | undefined {
  const value = headers[name];
  return typeof value === "string" ? value : undefined;
}

async function withDeadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new SafeFetchError("fetch_failed", "Source fetch timed out");
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(new SafeFetchError("fetch_failed", "Source fetch timed out"));
    signal.addEventListener("abort", aborted, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

async function defaultResolve(hostname: string): Promise<readonly Address[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records as Address[];
}

function defaultTransport(url: URL, address: Address, signal: AbortSignal): Promise<ResponseHead> {
  return new Promise((resolve, reject) => {
    // A validated DNS answer is pinned for the connection, avoiding a separate check/connect lookup.
    // Host and (for DNS names) SNI still use the original name. A public host can itself proxy content; callers must
    // control access and rate limits at the application boundary.
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const req = https.request(url, {
      method: "GET", signal, servername: isIP(hostname) ? undefined : hostname,
      headers: { Accept: "text/html,text/plain" },
      lookup: (_hostname, options, callback) => callback(null,
        options.all ? [address] : address.address, options.all ? undefined : address.family),
    }, (res) => resolve({
      status: res.statusCode ?? 0,
      headers: res.headers,
      body: res,
      close: () => res.destroy(),
    }));
    req.on("error", reject);
    req.end();
  });
}

function checkedAddresses(records: readonly Address[]): Address {
  if (!records.length || records.some(({ address, family }) => isIP(address) !== family || !isPublicAddress(address))) {
    throw new SafeFetchError("blocked_address", "Source host did not resolve only to public addresses");
  }
  return records[0];
}

async function readBody(response: ResponseHead, signal: AbortSignal): Promise<string> {
  const length = Number(header(response.headers, "content-length"));
  if (Number.isFinite(length) && length > MAX_BYTES) throw new SafeFetchError("fetch_failed", "Source page is too large");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const iterator = response.body[Symbol.asyncIterator]();
  while (true) {
    const next = await withDeadline(iterator.next(), signal);
    if (next.done) break;
    size += next.value.byteLength;
    if (size > MAX_BYTES) throw new SafeFetchError("fetch_failed", "Source page is too large");
    chunks.push(next.value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function fetchPublicText(rawUrl: string, deps: SafeFetchDeps = {}): Promise<{
  text: string; contentType: string; finalUrl: string; status: number;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, Math.min(deps.timeoutMs ?? 5_000, 5_000)));
  try {
    let current = checkedUrl(rawUrl);
    for (let redirects = 0; ; redirects++) {
      const hostname = current.hostname.replace(/^\[|\]$/g, "");
      const records = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) as 4 | 6 }]
        : await withDeadline((deps.resolve ?? defaultResolve)(hostname, controller.signal), controller.signal);
      const address = checkedAddresses(records);
      const response = await withDeadline((deps.transport ?? defaultTransport)(current, address, controller.signal), controller.signal);
      try {
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = header(response.headers, "location");
          if (!location || redirects >= MAX_REDIRECTS) throw new SafeFetchError("fetch_failed", "Source redirected too many times");
          current = checkedUrl(location, current);
          continue;
        }
        if (response.status < 200 || response.status >= 300) throw new SafeFetchError("fetch_failed", "Source page returned an error", response.status);
        const contentType = header(response.headers, "content-type")?.split(";", 1)[0].trim().toLowerCase();
        if (contentType !== "text/html" && contentType !== "text/plain") {
          throw new SafeFetchError("fetch_failed", "Source page must be text or HTML", response.status);
        }
        return { text: await readBody(response, controller.signal), contentType, finalUrl: current.toString(), status: response.status };
      } finally { response.close(); }
    }
  } catch (error) {
    if (error instanceof SafeFetchError) throw error;
    throw new SafeFetchError("fetch_failed", "Source page could not be fetched");
  } finally { clearTimeout(timeout); }
}

import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
const { dnsLookup, httpsRequest } = vi.hoisted(() => ({ dnsLookup: vi.fn(), httpsRequest: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({ lookup: dnsLookup }));
vi.mock("node:https", () => ({ default: { request: httpsRequest } }));
import { fetchPublicText, isPublicAddress, SafeFetchError } from "./safeFetch";

const bytes = (text: string) => new TextEncoder().encode(text);
const response = (status: number, contentType: string, chunks: string[], location?: string) => ({
  status,
  headers: { "content-type": contentType, ...(location ? { location } : {}) },
  body: (async function* () { for (const chunk of chunks) yield bytes(chunk); })(),
  close: vi.fn(),
});
const publicDns = vi.fn(async () => [{ address: "93.184.216.34", family: 4 as const }]);

describe("guarded public text fetch", () => {
  it.each([
    ["8.8.8.8", true], ["93.184.216.34", true], ["2001:4860:4860::8888", true],
    ["0.0.0.0", false], ["100.100.100.200", false], ["168.63.129.16", false], ["172.16.1.1", false],
    ["192.168.1.1", false], ["198.18.0.1", false], ["224.0.0.1", false],
    ["fd00:ec2::254", false], ["fe80::1", false], ["2001:db8::1", false],
    ["2002::1", false], ["3fff::1", false], ["::ffff:7f00:1", false],
    ["2001:4860:4860::8888%eth0", false],
  ] as const)("classifies %s as public=%s", (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });

  it.each([
    "http://example.com", "https://user:pass@example.com", "https://example.com:8443",
    "https://localhost", "https://sub.localhost", "https://127.0.0.1", "https://10.0.0.1",
    "https://169.254.169.254", "https://168.63.129.16", "https://[::1]", "https://[fc00::1]", "https://[3fff::1]",
    "https://[::ffff:127.0.0.1]", "https://203.0.113.1",
  ])("rejects %s before transport", async (url) => {
    const transport = vi.fn();
    await expect(fetchPublicText(url, { resolve: publicDns, transport })).rejects.toBeInstanceOf(SafeFetchError);
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects an entire DNS answer set if one address is private", async () => {
    const transport = vi.fn();
    const resolve = vi.fn(async () => [
      { address: "93.184.216.34", family: 4 as const },
      { address: "10.0.0.1", family: 4 as const },
    ]);
    await expect(fetchPublicText("https://example.com/a", { resolve, transport })).rejects.toMatchObject({ code: "blocked_address" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("pins one validated DNS answer and returns bounded HTML", async () => {
    const transport = vi.fn(async () => response(200, "text/html; charset=utf-8", ["<p>Hello</p>"]));
    const result = await fetchPublicText("https://example.com/a", { resolve: publicDns, transport });
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ hostname: "example.com" }), { address: "93.184.216.34", family: 4 }, expect.anything());
    expect(result).toEqual({ text: "<p>Hello</p>", contentType: "text/html", finalUrl: "https://example.com/a", status: 200 });
  });

  it("rechecks DNS after each relative redirect", async () => {
    const resolve = vi.fn(async (hostname: string) => hostname === "example.com"
      ? [{ address: "93.184.216.34", family: 4 as const }]
      : [{ address: "192.168.1.1", family: 4 as const }]);
    const transport = vi.fn(async () => response(302, "text/plain", [], "https://internal.example/private"));
    await expect(fetchPublicText("https://example.com/start", { resolve, transport })).rejects.toMatchObject({ code: "blocked_address" });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("permits three redirects but refuses a fourth", async () => {
    const transport = vi.fn(async (url: URL) => response(302, "text/plain", [], `/hop${Number(url.pathname.slice(4) || 0) + 1}`));
    await expect(fetchPublicText("https://example.com/hop0", { resolve: publicDns, transport })).rejects.toMatchObject({ code: "fetch_failed" });
    expect(transport).toHaveBeenCalledTimes(4);
  });

  it("refuses non-text and non-success responses", async () => {
    const transport = vi.fn(async () => response(200, "application/pdf", ["pdf"]));
    await expect(fetchPublicText("https://example.com/a", { resolve: publicDns, transport })).rejects.toMatchObject({ code: "fetch_failed" });
    transport.mockImplementation(async () => response(404, "text/plain", ["not found"]));
    await expect(fetchPublicText("https://example.com/a", { resolve: publicDns, transport })).rejects.toMatchObject({ code: "fetch_failed", status: 404 });
  });

  it("stops a streamed body after two megabytes", async () => {
    const large = new Uint8Array(2 * 1024 * 1024);
    const close = vi.fn();
    const transport = vi.fn(async () => ({
      status: 200, headers: { "content-type": "text/plain" },
      body: (async function* () { yield large; yield bytes("x"); })(), close,
    }));
    await expect(fetchPublicText("https://example.com/a", { resolve: publicDns, transport })).rejects.toMatchObject({ code: "fetch_failed" });
    expect(close).toHaveBeenCalled();
  });

  it("applies the same total deadline to DNS and body reads", async () => {
    const transport = vi.fn();
    await expect(fetchPublicText("https://example.com/a", { resolve: () => new Promise(() => {}), transport, timeoutMs: 20 })).rejects.toMatchObject({ code: "fetch_failed" });
    expect(transport).not.toHaveBeenCalled();
    const slowBody = vi.fn(async () => ({
      status: 200, headers: { "content-type": "text/plain" },
      body: { [Symbol.asyncIterator]() { return { next: () => new Promise<IteratorResult<Uint8Array>>(() => {}) }; } }, close: vi.fn(),
    }));
    await expect(fetchPublicText("https://example.com/a", { resolve: publicDns, transport: slowBody, timeoutMs: 20 })).rejects.toMatchObject({ code: "fetch_failed" });
  });

  it("pins the checked address in the default HTTPS transport without changing Host or SNI", async () => {
    dnsLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    httpsRequest.mockImplementation((_url, options, onResponse) => {
      const req = new EventEmitter() as EventEmitter & { end: () => void };
      req.end = () => {
        const res = Object.assign(Readable.from([bytes("verified page")]), {
          statusCode: 200, headers: { "content-type": "text/plain" },
        });
        onResponse(res);
      };
      expect(options.servername).toBe("example.com");
      options.lookup("example.com", { all: false }, (error: Error | null, address: string, family: number) => {
        expect(error).toBeNull();
        expect(address).toBe("93.184.216.34");
        expect(family).toBe(4);
      });
      return req;
    });
    const result = await fetchPublicText("https://example.com/article");
    expect(result.text).toBe("verified page");
    expect(result.finalUrl).toBe("https://example.com/article");
    expect(dnsLookup).toHaveBeenCalledWith("example.com", { all: true, verbatim: true });
    expect(httpsRequest).toHaveBeenCalledTimes(1);
    httpsRequest.mockReset();
    dnsLookup.mockReset();
  });

  it("converts transport failures to a bounded error without exposing the URL", async () => {
    const transport = vi.fn(async () => { throw new Error("request failed for https://example.com/private?token=secret"); });
    try {
      await fetchPublicText("https://example.com/private?token=secret", { resolve: publicDns, transport });
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toMatchObject({ code: "fetch_failed", message: "Source page could not be fetched" });
      expect(String(error)).not.toContain("secret");
    }
  });
});

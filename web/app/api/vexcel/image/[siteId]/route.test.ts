import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: vi.fn(), cacheDir: vi.fn(), listingPoint: vi.fn(), fetchVexcel: vi.fn(), vexcelErrorDetail: vi.fn(),
  existsSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn(), renameSync: vi.fn(), unlinkSync: vi.fn(),
}));
vi.mock("node:fs", () => ({ default: {
  existsSync: mocks.existsSync, readFileSync: mocks.readFileSync, writeFileSync: mocks.writeFileSync,
  renameSync: mocks.renameSync, unlinkSync: mocks.unlinkSync,
} }));
vi.mock("@/lib/env", () => ({ env: mocks.env, cacheDir: mocks.cacheDir }));
vi.mock("@/lib/listings", () => ({ listingPoint: mocks.listingPoint }));
vi.mock("@/lib/vexcelProxy", () => ({ fetchVexcel: mocks.fetchVexcel, vexcelErrorDetail: mocks.vexcelErrorDetail }));
let GET: typeof import("./route").GET;

const imageBytes = Buffer.from("mock jpeg bytes");
const get = (siteId: string, query = "") => GET(
  new Request(`http://localhost/api/vexcel/image/${encodeURIComponent(siteId)}${query}`),
  { params: Promise.resolve({ siteId }) },
);

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("DATA_MODE", undefined);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("No provider calls permitted")));
  mocks.env.mockReturnValue("mock-private-key");
  mocks.cacheDir.mockReturnValue("/mock-cache");
  mocks.listingPoint.mockResolvedValue({ lat: 30.123, lng: -97.456, lot_acres: null });
  mocks.existsSync.mockReturnValue(false);
  mocks.readFileSync.mockReturnValue(imageBytes);
  mocks.fetchVexcel.mockResolvedValue(new Response(imageBytes, { status: 200, headers: { "content-type": "image/jpeg" } }));
  mocks.vexcelErrorDetail.mockReturnValue("Imagery provider request failed");
  GET = (await import("./route")).GET;
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("returns 404 before params, lookup, cache, key, or provider in public mode", async () => {
  vi.stubEnv("DATA_MODE", "public");
  const params = { then: vi.fn() } as unknown as Promise<{ siteId: string }>;
  const response = await GET(new Request("http://localhost/api/vexcel/image/costar-1"), { params });
  expect(response.status).toBe(404);
  expect(params.then).not.toHaveBeenCalled();
  expect(mocks.listingPoint).not.toHaveBeenCalled();
  expect(mocks.cacheDir).not.toHaveBeenCalled();
  expect(mocks.existsSync).not.toHaveBeenCalled();
  expect(mocks.env).not.toHaveBeenCalled();
  expect(mocks.fetchVexcel).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["costar-123!", "Costar-123", "costar-abc", "costar-123/other", "123", ""])(
  "rejects noncanonical site ID %j before lookup or cache", async (siteId) => {
    mocks.existsSync.mockReturnValue(true);
    expect((await get(siteId)).status).toBe(404);
    expect(mocks.listingPoint).not.toHaveBeenCalled();
    expect(mocks.cacheDir).not.toHaveBeenCalled();
    expect(mocks.existsSync).not.toHaveBeenCalled();
    expect(mocks.env).not.toHaveBeenCalled();
    expect(mocks.fetchVexcel).not.toHaveBeenCalled();
  },
);

it("rejects an absent exact ID even when a cache file exists", async () => {
  mocks.listingPoint.mockResolvedValue(null);
  mocks.existsSync.mockReturnValue(true);
  const response = await get("costar-999");
  expect(response.status).toBe(404);
  expect(mocks.listingPoint).toHaveBeenCalledExactlyOnceWith("costar-999");
  expect(mocks.cacheDir).not.toHaveBeenCalled();
  expect(mocks.existsSync).not.toHaveBeenCalled();
  expect(mocks.readFileSync).not.toHaveBeenCalled();
  expect(mocks.env).not.toHaveBeenCalled();
  expect(mocks.fetchVexcel).not.toHaveBeenCalled();
});

it("looks up the exact ID before serving a cached image", async () => {
  mocks.existsSync.mockReturnValue(true);
  const response = await get("costar-123");
  expect(response.status).toBe(200);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(imageBytes);
  expect(mocks.listingPoint).toHaveBeenCalledExactlyOnceWith("costar-123");
  expect(mocks.existsSync).toHaveBeenCalledExactlyOnceWith("/mock-cache/costar-123_ortho_thumb.jpg");
  expect(mocks.readFileSync).toHaveBeenCalledExactlyOnceWith("/mock-cache/costar-123_ortho_thumb.jpg");
  expect(mocks.listingPoint.mock.invocationCallOrder[0]).toBeLessThan(mocks.existsSync.mock.invocationCallOrder[0]);
  expect(mocks.env).not.toHaveBeenCalled();
  expect(mocks.fetchVexcel).not.toHaveBeenCalled();
});

it("reuses a recent exact-ID validation for a second cached image without another database query", async () => {
  mocks.existsSync.mockReturnValue(true);
  expect((await get("costar-123")).status).toBe(200);
  expect((await get("costar-123")).status).toBe(200);
  expect(mocks.listingPoint).toHaveBeenCalledExactlyOnceWith("costar-123");
  expect(mocks.readFileSync).toHaveBeenCalledTimes(2);
  expect(mocks.fetchVexcel).not.toHaveBeenCalled();
});

it("still checks canonical IDs first and never reuses validation for an absent ID", async () => {
  mocks.existsSync.mockReturnValue(true);
  expect((await get("costar-123")).status).toBe(200);
  mocks.listingPoint.mockResolvedValue(null);
  expect((await get("costar-123!")).status).toBe(404);
  expect((await get("costar-999")).status).toBe(404);
  expect((await get("costar-999")).status).toBe(404);
  expect(mocks.listingPoint.mock.calls.map(([id]) => id)).toEqual(["costar-123", "costar-999", "costar-999"]);
  expect(mocks.readFileSync).toHaveBeenCalledOnce();
});

it("rechecks an exact ID after its 60-second validation expires", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
  mocks.existsSync.mockReturnValue(true);
  expect((await get("costar-123")).status).toBe(200);
  now.mockReturnValue(60_999);
  expect((await get("costar-123")).status).toBe(200);
  now.mockReturnValue(61_000);
  mocks.listingPoint.mockResolvedValueOnce(null);
  expect((await get("costar-123")).status).toBe(404);
  expect(mocks.listingPoint).toHaveBeenCalledTimes(2);
  expect(mocks.readFileSync).toHaveBeenCalledTimes(2);
});

it("evicts the least recently used validation after 200 IDs", async () => {
  mocks.existsSync.mockReturnValue(true);
  for (let id = 1; id <= 200; id++) expect((await get(`costar-${id}`)).status).toBe(200);
  expect((await get("costar-1")).status).toBe(200);
  expect((await get("costar-201")).status).toBe(200);
  expect((await get("costar-2")).status).toBe(200);
  expect(mocks.listingPoint).toHaveBeenCalledTimes(202);
  expect(mocks.listingPoint.mock.calls.filter(([id]) => id === "costar-1")).toHaveLength(1);
  expect(mocks.listingPoint.mock.calls.filter(([id]) => id === "costar-2")).toHaveLength(2);
});

it("does not cache a failed database lookup", async () => {
  mocks.existsSync.mockReturnValue(true);
  mocks.listingPoint.mockRejectedValueOnce(new Error("private database failure"));
  expect((await get("costar-123")).status).toBe(502);
  expect((await get("costar-123")).status).toBe(200);
  expect(mocks.listingPoint).toHaveBeenCalledTimes(2);
  expect(mocks.readFileSync).toHaveBeenCalledOnce();
});

it("uses a recently verified point on a different uncached view", async () => {
  mocks.existsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);
  expect((await get("costar-123")).status).toBe(200);
  expect((await get("costar-123", "?view=north")).status).toBe(200);
  expect(mocks.listingPoint).toHaveBeenCalledOnce();
  const url = new URL(String(mocks.fetchVexcel.mock.calls[0][0]));
  expect(url.searchParams.get("wkt")).toBe("POINT(-97.456 30.123)");
});

it("builds the uncached provider request from database coordinates and atomically caches the image", async () => {
  const response = await get("costar-123", "?view=north&size=full&lat=0&lng=0");
  expect(response.status).toBe(200);
  expect(mocks.fetchVexcel).toHaveBeenCalledOnce();
  const [requestUrl, apiKey] = mocks.fetchVexcel.mock.calls[0] as [URL | string, string];
  const url = new URL(String(requestUrl));
  expect(url.origin + url.pathname).toBe("https://api.vexcelgroup.com/v2/oriented/extract");
  expect(url.searchParams.get("wkt")).toBe("POINT(-97.456 30.123)");
  expect(url.searchParams.get("bbox-dimensions")).toBe("220,165");
  expect(url.searchParams.get("destination-dimensions")).toBe("1600,1200,fill");
  expect(url.searchParams.get("product-type")).toBe("oblique-north");
  expect(apiKey).toBe("mock-private-key");
  expect(mocks.writeFileSync).toHaveBeenCalledOnce();
  const [temporaryFile, bytes] = mocks.writeFileSync.mock.calls[0] as [string, Buffer];
  expect(temporaryFile).toMatch(/^\/mock-cache\/costar-123_north_full\.jpg\.[a-f0-9-]+\.tmp$/);
  expect(bytes).toEqual(imageBytes);
  expect(mocks.renameSync).toHaveBeenCalledExactlyOnceWith(temporaryFile, "/mock-cache/costar-123_north_full.jpg");
  expect(mocks.writeFileSync.mock.invocationCallOrder[0]).toBeLessThan(mocks.renameSync.mock.invocationCallOrder[0]);
  expect(mocks.unlinkSync).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["constructor", "toString"])("defaults unknown prototype-name view and size %s", async (name) => {
  const response = await get("costar-123", `?view=${name}&size=${name}`);
  expect(response.status).toBe(200);
  expect(mocks.existsSync).toHaveBeenCalledExactlyOnceWith("/mock-cache/costar-123_ortho_thumb.jpg");
  const url = new URL(String(mocks.fetchVexcel.mock.calls[0][0]));
  expect(url.pathname).toBe("/v2/ortho/extract");
  expect(url.searchParams.get("destination-dimensions")).toBe("640,480,fill");
});

it.each(["write", "rename"])("cleans the temporary file and returns a safe error if cache %s fails", async (step) => {
  mocks[step === "write" ? "writeFileSync" : "renameSync"].mockImplementation(() => { throw new Error("mock-private-key filesystem failure"); });
  const response = await get("costar-123");
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain("mock-private-key");
  const temporaryFile = mocks.writeFileSync.mock.calls[0][0] as string;
  expect(mocks.unlinkSync).toHaveBeenCalledExactlyOnceWith(temporaryFile);
  expect(mocks.writeFileSync.mock.calls[0][0]).not.toBe("/mock-cache/costar-123_ortho_thumb.jpg");
  if (step === "write") expect(mocks.renameSync).not.toHaveBeenCalled();
});

it("returns fixed safe responses for upstream errors and transport failures", async () => {
  mocks.fetchVexcel.mockResolvedValueOnce(new Response("mock-private-key upstream body", { status: 403 }));
  const denied = await get("costar-123");
  expect(denied.status).toBe(404);
  expect(await denied.text()).not.toContain("mock-private-key");
  mocks.fetchVexcel.mockResolvedValueOnce(new Response("mock-private-key upstream body", { status: 500 }));
  const failed = await get("costar-123");
  expect(failed.status).toBe(502);
  expect(await failed.text()).not.toContain("mock-private-key");
  mocks.fetchVexcel.mockRejectedValueOnce(new Error("mock-private-key transport failure"));
  const transport = await get("costar-123");
  expect(transport.status).toBe(502);
  expect(await transport.text()).not.toContain("mock-private-key");
  expect(mocks.writeFileSync).not.toHaveBeenCalled();
});

it("does not read cache or key when the exact database lookup fails", async () => {
  mocks.listingPoint.mockRejectedValue(new Error("mock-private-key database failure"));
  const response = await get("costar-123");
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain("mock-private-key");
  expect(mocks.cacheDir).not.toHaveBeenCalled();
  expect(mocks.env).not.toHaveBeenCalled();
  expect(mocks.fetchVexcel).not.toHaveBeenCalled();
});

it("returns a safe error if a cached image cannot be read", async () => {
  mocks.existsSync.mockReturnValue(true);
  mocks.readFileSync.mockImplementation(() => { throw new Error("mock-private-key cache failure"); });
  const response = await get("costar-123");
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain("mock-private-key");
  expect(mocks.env).not.toHaveBeenCalled();
  expect(mocks.fetchVexcel).not.toHaveBeenCalled();
});

it.each([{status:403,type:"image/jpeg"},{status:200,type:"text/html"}])(
  "cancels rejected upstream bodies ($status, $type)", async ({status,type}) => {
    const upstream=new Response("discarded provider data",{status,headers:{"content-type":type}});
    const cancel=vi.spyOn(upstream.body!,"cancel");
    mocks.fetchVexcel.mockResolvedValueOnce(upstream);
    const response=await get("costar-123");
    expect(response.status).toBe(status===403?404:502);
    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  },
);

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const API = "https://api.vexcelgroup.com/v2/3d/tileset";
const TEST_KEY = "test-only-vexcel-key";
let proxy: typeof import("./vexcelProxy");
beforeEach(async () => {
  vi.resetModules(); vi.stubGlobal("fetch", vi.fn());
  vi.stubEnv("VEXCEL_REQUESTS_PER_MINUTE", "");
  proxy = await import("./vexcelProxy");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("generic Vexcel query boundary", () => {
  it.each([
    "?zoom=13&tile-x=1844&tile-y=3372&layer=3d-cities",
    "?unknown_child=part%2F12%2C4.bin&token=ab%2Bcd%3D%3D&tag=a&tag=b",
    "?zoom=13&zoom=13&tile-x=2&tile-x=3&tile-y=4",
    "?lod=4&node_id=branch-12&empty=", "",
  ])("preserves unfamiliar names and repeated parameters: %s", (query) => {
    expect(proxy.validVexcelQuery(query)).toBe(true);
  });
  it.each([
    `?${Array.from({length:17},(_,i)=>`p${i}=1`).join("&")}`,
    `?a=${"x".repeat(257)}`, `?${"a".repeat(2048)}`,
    "?bad.name=1", "?=1", "?bad%20name=1", "?a=%0A", "?a=%00", "?a=%E2%98%83",
    "?a=%3Cscript%3E", "?a=%5Cpath", "?zoom=-1", "?zoom=1.5", "?zoom=1e2",
    "?zoom=9999999999", "?zoom=", "?zoom=3&tile-x=8", "?zoom=3&tile-y=8",
    "?zoom=3&tile-x=-1", "?zoom=3&tile-y=1.5", "?tile-x=NaN", "?tile-y=9007199254740992",
    "?zoom=3&zoom=4&tile-x=9", "?zoom=3&tile-x=1&tile-x=8",
  ])("refuses malformed or excessive queries: %s", (query) => {
    expect(proxy.validVexcelQuery(query)).toBe(false);
  });
  it.each([null,"same-origin","none"])("accepts fetch-site %s", value => expect(proxy.validVexcelFetchSite(value)).toBe(true));
  it.each(["cross-site","same-site","","Same-Origin"])("rejects fetch-site %s", value => expect(proxy.validVexcelFetchSite(value)).toBe(false));
});

describe("process request ceiling", () => {
  it("refuses excess calls in a minute and resets at the boundary", () => {
    vi.stubEnv("VEXCEL_REQUESTS_PER_MINUTE","2");
    expect(proxy.reserveVexcelRequest(1_000)).toBe(true);
    expect(proxy.reserveVexcelRequest(1_001)).toBe(true);
    expect(proxy.reserveVexcelRequest(60_999)).toBe(false);
    expect(proxy.reserveVexcelRequest(61_000)).toBe(true);
  });
  it.each(["", "0", "-1", "2.5", "garbage", "10001", "Infinity"])("uses the bounded default for invalid configuration %s", value => {
    vi.stubEnv("VEXCEL_REQUESTS_PER_MINUTE",value);
    for(let i=0;i<600;i++) expect(proxy.reserveVexcelRequest(1_000)).toBe(true);
    expect(proxy.reserveVexcelRequest(1_000)).toBe(false);
  });
});

describe("credentialed upstream transport", () => {
  it("fetches the fixed API origin manually with a key header and no-store", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("tile"));
    const result=await proxy.fetchVexcel(`${API}?tile=1`,TEST_KEY);
    expect(await result.text()).toBe("tile");
    expect(fetch).toHaveBeenCalledWith(new URL(`${API}?tile=1`),expect.objectContaining({redirect:"manual",cache:"no-store",headers:{"X-API-KEY":TEST_KEY},signal:expect.any(AbortSignal)}));
  });
  it("follows at most two same-origin hops and cancels redirect bodies", async () => {
    const first = new Response("first",{status:302,headers:{location:"./tile?child=1"}});
    const second = new Response("second",{status:307,headers:{location:"https://api.vexcelgroup.com/v2/3d/tile?child=2"}});
    const cancel1=vi.spyOn(first.body!,"cancel"),cancel2=vi.spyOn(second.body!,"cancel");
    vi.mocked(fetch).mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValueOnce(new Response("binary"));
    expect(await (await proxy.fetchVexcel(API,TEST_KEY)).text()).toBe("binary");
    expect(fetch).toHaveBeenCalledTimes(3);
    for(const [,options] of vi.mocked(fetch).mock.calls) expect(options?.headers).toEqual({"X-API-KEY":TEST_KEY});
    expect(cancel1).toHaveBeenCalledOnce();expect(cancel2).toHaveBeenCalledOnce();
  });
  it.each(["https://other.example/tile", "https://127.0.0.1/tile", "http://api.vexcelgroup.com/tile", "https://api.vexcelgroup.com:8443/tile", "https://user:pass@api.vexcelgroup.com/tile", "https://api.vexcelgroup.com.evil.example/tile", "https://[::1]/tile"])("rejects unsafe redirect without a second request: %s",async target => {
    const response=new Response("private details",{status:302,headers:{location:target}});
    const cancel=vi.spyOn(response.body!,"cancel");vi.mocked(fetch).mockResolvedValue(response);
    await expect(proxy.fetchVexcel(API,TEST_KEY)).rejects.toThrow("Imagery provider redirected to an unapproved host");
    expect(fetch).toHaveBeenCalledOnce();expect(cancel).toHaveBeenCalledOnce();
  });
  it("refuses a third redirect and missing location",async () => {
    vi.mocked(fetch).mockImplementation(async()=>new Response(null,{status:301,headers:{location:API}}));
    await expect(proxy.fetchVexcel(API,TEST_KEY)).rejects.toThrow("Imagery provider request failed");expect(fetch).toHaveBeenCalledTimes(3);
    vi.mocked(fetch).mockReset().mockResolvedValue(new Response(null,{status:302}));
    await expect(proxy.fetchVexcel(API,TEST_KEY)).rejects.toThrow("Imagery provider request failed");expect(fetch).toHaveBeenCalledOnce();
  });
  it("refuses unsafe initial URLs before fetching",async()=>{
    await expect(proxy.fetchVexcel("https://other.example/",TEST_KEY)).rejects.toThrow("Imagery provider request failed");
    await expect(proxy.fetchVexcel("not a URL",TEST_KEY)).rejects.toThrow("Imagery provider request failed");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never returns raw upstream transport errors",async()=>{
    vi.mocked(fetch).mockRejectedValue(new Error(`private ${TEST_KEY}`));
    await expect(proxy.fetchVexcel(API,TEST_KEY)).rejects.toThrow(/^Imagery provider request failed$/);
  });
});

it("returns only recognized safe error details",()=>{
 expect(proxy.vexcelErrorDetail(new Error(TEST_KEY))).toBe("Imagery provider request failed");
});
it("logs only the hostname for a refused redirect and redacts a key echo",async()=>{
 vi.mocked(fetch).mockResolvedValue(new Response(null,{status:302,headers:{location:"https://other.example/private?secret=value"}}));
 await expect(proxy.fetchVexcel(API,TEST_KEY)).rejects.toThrow("unapproved host");
 expect(console.warn).toHaveBeenLastCalledWith("Vexcel redirect refused:","other.example");
 vi.mocked(fetch).mockResolvedValue(new Response(null,{status:302,headers:{location:`https://${TEST_KEY}.example/private`}}));
 await expect(proxy.fetchVexcel(API,TEST_KEY)).rejects.toThrow("unapproved host");
 expect(console.warn).toHaveBeenLastCalledWith("Vexcel redirect refused:","[redacted]");
});

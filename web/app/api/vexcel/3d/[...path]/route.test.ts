import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { env } = vi.hoisted(() => ({ env: vi.fn() }));
vi.mock("@/lib/env", () => ({ env }));
let GET: typeof import("./route").GET;
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubEnv("DATA_MODE", undefined);vi.stubEnv("VEXCEL_REQUESTS_PER_MINUTE", "600");
  env.mockReturnValue("synthetic-provider-key");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("tile data",{headers:{"content-type":"application/octet-stream"}})));
  vi.spyOn(console,"warn").mockImplementation(()=>{});
  GET = (await import("./route")).GET;
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals();vi.restoreAllMocks(); });
const routeParams = (path=["tileset"]) => ({params:Promise.resolve({path})});
const request = (query="?zoom=13&tile-x=1844&tile-y=3372&layer=3d-cities",headers?:HeadersInit)=>new Request(`http://localhost/api/vexcel/3d/tileset${query}`,{headers});

it("returns 404 before reading route params or contacting Vexcel in public mode", async () => {
  vi.stubEnv("DATA_MODE","public");
  const params = { then: vi.fn() } as unknown as Promise<{ path: string[] }>;
  const response = await GET(request(), { params });
  expect(response.status).toBe(404);expect(params.then).not.toHaveBeenCalled();
  expect(env).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
it("forwards the viewer root query unchanged in meaning with manual redirects",async()=>{
  const response=await GET(request(),routeParams());
  expect(response.status).toBe(200);expect(await response.text()).toBe("tile data");
  const [url,options]=vi.mocked(fetch).mock.calls[0];
  expect(String(url)).toBe("https://api.vexcelgroup.com/v2/3d/tileset?zoom=13&tile-x=1844&tile-y=3372&layer=3d-cities");
  expect(options).toEqual(expect.objectContaining({redirect:"manual",headers:{"X-API-KEY":"synthetic-provider-key"}}));
});
it("preserves unknown child parameters and repeats",async()=>{
  const response=await GET(request("?node=part%2F9.bin&lod=4&tag=a&tag=b"),routeParams(["tile"]));
  expect(response.status).toBe(200);
  const url=new URL(String(vi.mocked(fetch).mock.calls[0][0]));
  expect(url.pathname).toBe("/v2/3d/tile");expect(url.searchParams.getAll("tag")).toEqual(["a","b"]);
});
it.each(["?unknown.name=1","?zoom=13&tile-x=8192",`?node=${"a".repeat(257)}`,`?${"a".repeat(2048)}`,`?${Array.from({length:17},(_,i)=>`p${i}=1`).join("&")}`])("rejects unsafe query before key access: %s",async query=>{
  expect((await GET(request(query),routeParams())).status).toBe(400);
  expect(env).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
it.each([[],["other"],["tileset","child"]].map(path=>({path})))("rejects disallowed paths $path before key access",async ({path})=>{
  expect((await GET(request(),routeParams(path))).status).toBe(404);
  expect(env).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
it.each(["cross-site","same-site"])("rejects Sec-Fetch-Site %s before key access",async site=>{
  expect((await GET(request("",{"Sec-Fetch-Site":site}),routeParams())).status).toBe(403);
  expect(env).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
it.each(["same-origin","none"])("permits Sec-Fetch-Site %s",async site=>{
  expect((await GET(request("",{"Sec-Fetch-Site":site}),routeParams())).status).toBe(200);
});
it("returns429 after the configured ceiling without further key or fetch calls",async()=>{
  vi.stubEnv("VEXCEL_REQUESTS_PER_MINUTE","1");
  expect((await GET(request(),routeParams())).status).toBe(200);
  expect((await GET(request(),routeParams())).status).toBe(429);
  expect(env).toHaveBeenCalledOnce();expect(fetch).toHaveBeenCalledOnce();
});
it("does not spend the request allowance on invalid queries",async()=>{
  vi.stubEnv("VEXCEL_REQUESTS_PER_MINUTE","1");
  expect((await GET(request("?zoom=-1"),routeParams())).status).toBe(400);
  expect((await GET(request(),routeParams())).status).toBe(200);
});
it.each([403,500,304])("redacts an upstream%s body and cancels it",async status=>{
  const upstream=new Response(status===304?null:"private upstream details",{status});
  const cancel=upstream.body?vi.spyOn(upstream.body,"cancel"):null;
  vi.mocked(fetch).mockResolvedValue(upstream);
  const response=await GET(request(),routeParams());
  expect(response.status).toBe(status>=400?status:502);
  expect(await response.json()).toEqual({detail:"Imagery provider request failed"});
  if(cancel)expect(cancel).toHaveBeenCalledOnce();
});
it("returns fixed502 for a cross-origin redirect with no second fetch",async()=>{
  vi.mocked(fetch).mockResolvedValue(new Response(null,{status:302,headers:{location:"https://127.0.0.1/private"}}));
  const response=await GET(request(),routeParams());
  expect(response.status).toBe(502);expect(await response.json()).toEqual({detail:"Imagery provider redirected to an unapproved host"});
  expect(fetch).toHaveBeenCalledOnce();
});
it("returns a safe error for missing configuration or transport failure",async()=>{
  env.mockImplementationOnce(()=>{throw new Error("private configuration")});
  let response=await GET(request(),routeParams());expect(response.status).toBe(502);expect(await response.text()).not.toContain("private");expect(fetch).not.toHaveBeenCalled();
  vi.mocked(fetch).mockRejectedValueOnce(new Error("secret transport details"));
  response=await GET(request(),routeParams());expect(response.status).toBe(502);expect(await response.json()).toEqual({detail:"Imagery provider request failed"});
});

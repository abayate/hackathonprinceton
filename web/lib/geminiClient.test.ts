import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createGeminiClient, GeminiClientError, isGeminiConfigured } from "./geminiClient";
import type { InvestigationPlan } from "./investigator";

const KEY = "test-private-gemini-key-987654321";
const plan: InvestigationPlan = {
  projectId: "project-1",
  projectName: "Northfield Data Center",
  facts: { name: "Northfield Data Center", company: "Example Co", city: "Austin", county: "Travis" },
  queries: ["Northfield Data Center Austin zoning", "Example Co Travis opposition"],
};
const candidate = {
  source_url: "https://example.org/meeting", quote: "The council discussed the proposed data center at its meeting.",
  publication_date: "2025-01-01", signal_type: "moratorium_proposed", summary: "Council discussion.",
};
const interaction = (output: unknown, status = "completed") => ({
  status, steps: [{ type: "google_search_call", arguments: { queries: ["test"] } },
    { type: "model_output", content: [{ type: "text", text: typeof output === "string" ? output : JSON.stringify(output) }] }],
});
const jsonResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json" },
});

beforeEach(() => { vi.stubEnv("GEMINI_API_KEY", KEY); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Gemini REST research client", () => {
  it("reports missing or blank keys and makes no outbound call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const key of [undefined, "", "   "]) {
      vi.stubEnv("GEMINI_API_KEY", key);
      expect(isGeminiConfigured()).toBe(false);
      expect(() => createGeminiClient()).toThrow(GeminiClientError);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends one stateless grounded structured REST request without putting the key in URL or body", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(interaction({ candidates: [candidate] })));
    vi.stubGlobal("fetch", fetchMock);
    expect(isGeminiConfigured()).toBe(true);
    const result = await createGeminiClient().research({ ...plan, facts: { ...plan.facts, sourceText: "hostile page" } } as InvestigationPlan, new AbortController().signal);
    expect(result).toEqual({ candidates: [candidate] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect(url).not.toContain(KEY);
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe(KEY);
    expect(new Headers(init.headers).get("Api-Revision")).toBe("2026-05-20");
    const bodyText = String(init.body);
    expect(bodyText).not.toContain(KEY);
    expect(bodyText).not.toContain("sourceText");
    expect(bodyText).not.toContain("hostile page");
    expect(init.redirect).toBe("error");
    const body = JSON.parse(bodyText);
    expect(body.model).toBe("gemini-4-carbon");
    expect(body.store).toBe(false);
    expect(body.tools).toEqual([{ type: "google_search" }]);
    expect(body.generation_config.max_output_tokens).toBe(16_384);
    expect(body.response_format.mime_type).toBe("application/json");
    expect(body.response_format.schema.properties.candidates.maxItems).toBe(8);
    expect(body.response_format.schema.properties.candidates.items.properties.summary.maxLength).toBe(300);
    expect(body.input).toContain("summary of at most 300 characters");
    expect(body.input).toContain(plan.facts.name);
    expect(body.input).toContain(plan.queries[0]);
  });

  it("does not expose the key in upstream HTTP or network errors", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(`bad ${KEY}`, { status: 500 }))
      .mockRejectedValueOnce(new Error(`network failed ${KEY}`));
    vi.stubGlobal("fetch", fetchMock);
    const client = createGeminiClient();
    for (let i = 0; i < 2; i++) {
      try { await client.research(plan, new AbortController().signal); throw new Error("expected failure"); }
      catch (error) {
        expect(error).toBeInstanceOf(GeminiClientError);
        expect(String(error)).not.toContain(KEY);
        expect(JSON.stringify(error)).not.toContain(KEY);
      }
    }
  });

  it("rejects a completed response that echoes the key, including escaped JSON text", async () => {
    const text = JSON.stringify({ candidates: [{ ...candidate, summary: KEY }] }).replaceAll("e", "\\u0065");
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(interaction(text))));
    await expect(createGeminiClient().research(plan, new AbortController().signal))
      .rejects.toMatchObject({ code: "invalid_response" });
  });

  it.each([
    interaction({ candidates: [] }, "incomplete"), interaction({ candidates: [] }, "requires_continuation"),
    { status: "completed", steps: [] },
    { status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "{}" }] },
      { type: "model_output", content: [{ type: "text", text: "{}" }] }] },
    interaction("not json"), interaction({ candidates: Array.from({ length: 9 }, () => candidate) }),
  ])("fails closed on incomplete, absent, ambiguous, malformed or excess model output", async (upstream) => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(upstream)));
    await expect(createGeminiClient().research(plan, new AbortController().signal))
      .rejects.toBeInstanceOf(GeminiClientError);
  });

  it("enforces the streamed response cap even without Content-Length", async () => {
    const bytes = new Uint8Array(130 * 1024);
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream, { headers: { "content-type": "application/json" } })));
    await expect(createGeminiClient().research(plan, new AbortController().signal))
      .rejects.toMatchObject({ code: "response_too_large" });
  });

  it.each([
    [500, { "content-type": "application/json" }, "upstream_failed"],
    [200, { "content-type": "application/json", "content-length": "131073" }, "response_too_large"],
    [200, { "content-type": "text/plain" }, "invalid_response"],
  ])("cancels unused bodies after an HTTP or header rejection", async (status, headers, code) => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream, { status, headers })));
    await expect(createGeminiClient().research(plan, new AbortController().signal))
      .rejects.toMatchObject({ code });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("uses the shared abort signal and refuses late data", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
      expect(init.method).toBe("POST");
      return new Promise<Response>((resolve) => { resolveFetch = resolve; });
    });
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const pending = createGeminiClient().research(plan, controller.signal);
    controller.abort();
    resolveFetch(jsonResponse(interaction({ candidates: [candidate] })));
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });

  it("makes no request when already aborted or when the plan contains the key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(createGeminiClient().research(plan, controller.signal)).rejects.toMatchObject({ code: "aborted" });
    await expect(createGeminiClient().research({ ...plan, queries: [KEY] }, new AbortController().signal))
      .rejects.toMatchObject({ code: "invalid_request" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses even a short key that would appear in the fixed request body", async () => {
    vi.stubEnv("GEMINI_API_KEY", "Search");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createGeminiClient().research(plan, new AbortController().signal))
      .rejects.toMatchObject({ code: "invalid_request" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

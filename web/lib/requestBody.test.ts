import { describe, expect, it } from "vitest";
import { readJsonBody } from "./requestBody";

const request = (body: string, headers: Record<string, string> = { "Content-Type": "application/json" }) =>
  new Request("http://localhost/api/test", { method: "POST", body, headers });

describe("bounded JSON request reader", () => {
  it("accepts JSON and an optional charset at the exact byte ceiling", async () => {
    const body = JSON.stringify({ id: "synthetic" });
    expect(await readJsonBody(request(body, { "Content-Type": "application/json; charset=utf-8" }), Buffer.byteLength(body)))
      .toEqual({ ok: true, value: { id: "synthetic" } });
  });

  it.each([undefined, "text/plain", "application/jsonx", "application/jsonp"])(
    "rejects a missing or non-JSON media type %s", async (contentType) => {
      const headers: Record<string, string> = contentType ? { "Content-Type": contentType } : {};
      expect(await readJsonBody(request("{}", headers), 1024)).toEqual({ ok: false, code: "invalid_content_type" });
    },
  );

  it("rejects a declared oversized body without opening its stream", async () => {
    expect(await readJsonBody(request("{}", { "Content-Type": "application/json", "Content-Length": "1025" }), 1024))
      .toEqual({ ok: false, code: "declared_too_large" });
  });

  it("rejects a missing body and malformed JSON without exposing parser text", async () => {
    const missing = new Request("http://localhost/api/test", { method: "POST", headers: { "Content-Type": "application/json" } });
    expect(await readJsonBody(missing, 1024)).toEqual({ ok: false, code: "missing_body" });
    expect(await readJsonBody(request("{"), 1024)).toEqual({ ok: false, code: "invalid_json" });
  });

  it("cancels an oversized stream without Content-Length, before waiting for EOF", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(600));
        controller.enqueue(new Uint8Array(600));
      },
      cancel() { cancelled = true; },
    });
    const req = new Request("http://localhost/api/test", {
      method: "POST", body: stream, headers: { "Content-Type": "application/json" }, duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect(req.headers.get("content-length")).toBeNull();
    expect(await readJsonBody(req, 1024)).toEqual({ ok: false, code: "too_large" });
    expect(cancelled).toBe(true);
  });

  it("returns a typed safe failure when the stream raises a private error", async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error("private upstream detail")); } });
    const req = new Request("http://localhost/api/test", {
      method: "POST", body: stream, headers: { "Content-Type": "application/json" }, duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect(await readJsonBody(req, 1024)).toEqual({ ok: false, code: "read_failed" });
  });

  it("returns a typed safe failure if another consumer already locked the body", async () => {
    const req = request("{}");
    const lock = req.body?.getReader();
    expect(await readJsonBody(req, 1024)).toEqual({ ok: false, code: "read_failed" });
    lock?.releaseLock();
  });

  it("keeps an oversized result safe even when cancelling the source fails", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(1025)); },
      cancel() { throw new Error("private cancellation detail"); },
    });
    const req = new Request("http://localhost/api/test", {
      method: "POST", body: stream, headers: { "Content-Type": "application/json" }, duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect(await readJsonBody(req, 1024)).toEqual({ ok: false, code: "too_large" });
  });
});

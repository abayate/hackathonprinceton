export type JsonBodyFailureCode = "invalid_content_type" | "declared_too_large" | "missing_body"
  | "too_large" | "invalid_json" | "read_failed";
export type JsonBodyResult = { ok: true; value: unknown } | { ok: false; code: JsonBodyFailureCode };

/** Read a JSON request with a strict media type and a streaming byte ceiling. */
export async function readJsonBody(req: Request, maxBytes: number): Promise<JsonBodyResult> {
  const contentType = req.headers.get("content-type");
  if (!contentType || !/^application\/json(?:\s*;|\s*$)/i.test(contentType))
    return { ok: false, code: "invalid_content_type" };
  if (Number(req.headers.get("content-length")) > maxBytes)
    return { ok: false, code: "declared_too_large" };
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try { reader = req.body?.getReader(); } catch { return { ok: false, code: "read_failed" }; }
  if (!reader) return { ok: false, code: "missing_body" };
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        try { await reader.cancel(); } catch { /* no upstream detail escapes */ }
        return { ok: false, code: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, code: "read_failed" };
  } finally {
    reader.releaseLock();
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown };
  } catch {
    return { ok: false, code: "invalid_json" };
  }
}

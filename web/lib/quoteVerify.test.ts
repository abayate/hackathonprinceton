import { describe, expect, it } from "vitest";
import { normalizeQuote, verifyQuote } from "./quoteVerify";

const quote = "The city council voted to deny this application after public testimony.";

describe("verbatim source quote verification", () => {
  it("matches plain text after punctuation and whitespace normalization", () => {
    expect(verifyQuote(quote, `Before.\n${quote}\nAfter.`, "text/plain; charset=utf-8")).toBe(true);
    expect(normalizeQuote("“A—B” &amp; C\u00a0D")).toBe('"A-B" & C D');
    expect(verifyQuote("The city council voted to deny this application after public testimony.",
      "The city council voted to deny this application after public\n  testimony.", "text/plain")).toBe(true);
  });

  it("treats HTML entity syntax as literal text in text/plain sources", () => {
    const literal = "The source literally spells &amp; and the line continues with more words.";
    const decoded = "The source literally spells & and the line continues with more words.";
    expect(verifyQuote(literal, literal, "text/plain")).toBe(true);
    expect(verifyQuote(decoded, literal, "text/plain")).toBe(false);
    expect(verifyQuote(literal, decoded, "text/plain")).toBe(false);
  });

  it("extracts visible HTML text and ignores markup, attributes, comments, script, style, and head", () => {
    expect(verifyQuote(quote, `<html><head><title>${quote}</title></head><body><p>The city council voted to deny this application</p><p>after public testimony.</p></body></html>`, "text/html")).toBe(true);
    for (const body of [
      `<div data-note="${quote}">Elsewhere</div>`,
      `<!-- ${quote} --><p>Elsewhere</p>`,
      `<script>const note = ${JSON.stringify(quote)}</script><p>Elsewhere</p>`,
      `<style>/* ${quote} */</style><p>Elsewhere</p>`,
      `<template>${quote}</template><p>Elsewhere</p>`,
    ]) expect(verifyQuote(quote, body, "text/html")).toBe(false);
  });

  it("preserves literal text across inline tags while separating block text", () => {
    const sentence = "The public hearing starts at 6:00 p.m. on Tuesday, January 13, 2026, in City Council Chambers.";
    expect(verifyQuote(sentence,
      "<p>The public hearing starts at 6:00 <strong>p.m</strong>. on Tuesday, January 13, 2026, in City Council Chambers.</p>",
      "text/html")).toBe(true);
    expect(verifyQuote("The public hearing starts at six o'clock in City Council Chambers.",
      "<p>The public hearing starts at six o'<em>clock</em> in City Council Chambers.</p>",
      "text/html")).toBe(true);
    expect(verifyQuote("The council held a hearing at the civic center and discussed the proposal.",
      "<p>The council held a hearing</p><p>at the civic center and discussed the proposal.</p>",
      "text/html")).toBe(true);
    expect(verifyQuote("The council held a hearingat the civic center and discussed the proposal.",
      "<p>The council held a hearing</p><p>at the civic center and discussed the proposal.</p>",
      "text/html")).toBe(false);
  });

  it("decodes numeric and common named HTML entities without fuzzy matching", () => {
    const source = "The council said &ldquo;no&rdquo; to the proposal &mdash; residents applauded.";
    expect(verifyQuote('The council said "no" to the proposal - residents applauded.', source, "text/html")).toBe(true);
    expect(verifyQuote("The council said no to the proposal - residents applauded.", source, "text/html")).toBe(false);
    expect(verifyQuote("The council said “no” to the proposal — residents applauded.",
      "The council said &#x201C;no&#x201D; to the proposal &#8212; residents applauded.", "text/html")).toBe(true);
  });

  it("rejects short/long quotes, unsupported MIME, and paraphrases", () => {
    expect(verifyQuote("short", quote, "text/plain")).toBe(false);
    expect(verifyQuote(`x${" ".repeat(39)}`, "x", "text/plain")).toBe(false);
    expect(verifyQuote("&amp;".repeat(8), "&&&&&&&&", "text/html")).toBe(false);
    expect(verifyQuote("x".repeat(301), quote, "text/plain")).toBe(false);
    expect(verifyQuote(quote, quote, "application/pdf")).toBe(false);
    expect(verifyQuote(quote.replace("deny", "approve"), quote, "text/plain")).toBe(false);
  });

  it("fails closed on malformed HTML and unknown entities without discarding unrelated visible text", () => {
    expect(verifyQuote(quote, `<!-- unfinished ${quote}`, "text/html")).toBe(false);
    expect(verifyQuote(quote, `<script>${quote}`, "text/html")).toBe(false);
    expect(verifyQuote(quote, `<div title="unclosed > ${quote}`, "text/html")).toBe(false);
    expect(verifyQuote(`&madeup; ${quote}`, `&madeup; ${quote}`, "text/html")).toBe(false);
    expect(verifyQuote(quote, `<div>&madeup;</div><p>${quote}</p>`, "text/html")).toBe(true);
    expect(verifyQuote(quote, `<!DOCTYPE html><p>${quote}</p>`, "text/html")).toBe(true);
    expect(verifyQuote(quote, `<p>2 < 3 and ${quote}</p>`, "text/html")).toBe(true);
    expect(verifyQuote(quote, `<p data-note='x > y'>${quote}</p>`, "text/html")).toBe(true);
  });
});

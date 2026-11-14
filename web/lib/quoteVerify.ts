/** Conservative text extraction for the two MIME types accepted by evidence intake. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", apos: "'", quot: '"', lt: "<", gt: ">", nbsp: " ",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  ndash: "–", mdash: "—", hellip: "…",
};

const ENTITY = /&(#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);/gi;
const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "body", "br", "dd", "div", "dl", "dt",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hr", "html", "li", "main", "nav", "ol", "p", "pre", "section", "table",
  "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
]);
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr"]);

function decodeEntities(value: string, unknown: string): string {
  return value.replace(ENTITY, (original, name: string) => {
    if (name.startsWith("#")) {
      const hex = name[1]?.toLowerCase() === "x";
      const point = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point) : unknown;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? unknown;
  });
}

function normalize(value: string, htmlEntities: boolean): string {
  return (htmlEntities ? decodeEntities(value, "\ufffd") : value)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Canonical quote form for duplicate detection across submitted and fixture records. */
export function normalizeQuote(value: string): string {
  return normalize(value, true);
}

function tagEnd(source: string, start: number): number {
  let quote: string | null = null;
  for (let i = start + 1; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === ">") return i;
  }
  return -1;
}

function skipElement(source: string, cursor: number, name: string): number | null {
  let depth = 1;
  while (cursor < source.length) {
    const start = source.indexOf("<", cursor);
    if (start < 0) return null;
    const end = tagEnd(source, start);
    if (end < 0) return null;
    const matched = /^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9:-]*)\b/.exec(source.slice(start));
    if (matched?.[2].toLowerCase() === name) {
      if (matched[1]) depth--;
      else if (!/\/\s*>$/.test(source.slice(start, end + 1))) depth++;
      if (depth === 0) return end + 1;
    }
    cursor = end + 1;
  }
  return null;
}

function htmlText(source: string, blockSeparator = " ", skipHidden = false): string | null {
  let text = "";
  let cursor = 0;
  while (cursor < source.length) {
    const tagStart = source.indexOf("<", cursor);
    if (tagStart < 0) return text + source.slice(cursor);
    text += source.slice(cursor, tagStart);
    if (source.startsWith("<!--", tagStart)) {
      const commentEnd = source.indexOf("-->", tagStart + 4);
      if (commentEnd < 0) return null;
      cursor = commentEnd + 3;
      continue;
    }
    const matched = /^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9:-]*)\b/.exec(source.slice(tagStart));
    if (!matched) {
      // A literal less-than in page text is visible; declarations are markup.
      if (/^<[!?]/.test(source.slice(tagStart, tagStart + 2))) {
        const end = tagEnd(source, tagStart);
        if (end < 0) return null;
        cursor = end + 1;
      } else {
        text += "<";
        cursor = tagStart + 1;
      }
      continue;
    }
    const end = tagEnd(source, tagStart);
    if (end < 0) return null;
    const name = matched[2].toLowerCase();
    const tag = source.slice(tagStart, end + 1);
    cursor = end + 1;
    if (skipHidden && !matched[1] && (/[\s]hidden(?:\s|=|\/|>)/i.test(tag)
      || /\baria-hidden\s*=\s*['"]?true\b/i.test(tag)
      || /\bstyle\s*=\s*['"][^'"]*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(tag)
      || ["svg", "iframe", "canvas", "object"].includes(name))) {
      const skipped = VOID_TAGS.has(name) || /\/\s*>$/.test(tag) ? cursor : skipElement(source, cursor, name);
      if (skipped === null) return null;
      cursor = skipped;
      text += blockSeparator;
      continue;
    }
    // Inline tags preserve adjacent text: <strong>p.m</strong>. renders as p.m.
    if (BLOCK_TAGS.has(name)) text += blockSeparator;
    if (matched[1] || !["script", "style", "head", "template", "noscript"].includes(name)) continue;
    const close = new RegExp(`<\\/\\s*${name}\\s*>`, "gi");
    close.lastIndex = cursor;
    const closing = close.exec(source);
    if (!closing) return null;
    cursor = closing.index + closing[0].length;
  }
  return text;
}

/** Visible source text with paragraph boundaries for source monitoring. */
export function extractVisibleText(body: string, contentType: string): string | null {
  if (typeof body !== "string" || typeof contentType !== "string") return null;
  const mime = contentType.split(";", 1)[0].trim().toLowerCase();
  if (mime === "text/plain") return body;
  if (mime !== "text/html") return null;
  const visible = htmlText(body, "\n\n", true);
  return visible === null ? null : decodeEntities(visible, "\ufffd");
}

/** Match a raw 40–300 character quote in extracted page text, without fuzzy edits. */
export function verifyQuote(quote: string, body: string, contentType: string): boolean {
  if (typeof quote !== "string" || quote.length < 40 || quote.length > 300 || typeof body !== "string") return false;
  const mime = contentType.split(";", 1)[0].trim().toLowerCase();
  if (mime !== "text/plain" && mime !== "text/html") return false;
  const visible = mime === "text/html" ? htmlText(body) : body;
  if (visible === null) return false;
  const htmlEntities = mime === "text/html";
  const candidate = normalize(quote, htmlEntities);
  // Unknown entities cannot be treated as a verified match without an HTML5 decoder.
  if (candidate.length < 40 || candidate.length > 300 || (htmlEntities && candidate.includes("\ufffd"))) return false;
  return normalize(visible, htmlEntities).includes(candidate);
}

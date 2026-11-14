import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "./page";
import ErrorPage from "./error";
import { createDbQuery, SYNTHETIC_CLIENT_ID } from "@/test/dbFixtures";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  cookies: vi.fn(),
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}));

vi.mock("server-only", () => ({}));
vi.mock("./prospects.css", () => ({}));
vi.mock("@/lib/db", () => ({ pool: { query: mocks.query } }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  useRouter: mocks.useRouter,
}));
vi.mock("next/link", async () => {
  const React = await import("react");
  return { default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement("a", { href, ...props }, children) };
});
vi.mock("next/dynamic", () => ({ default: () => () => null }));

async function renderHome(searchParams: Record<string, string> = {}): Promise<string> {
  const page = await Home({ searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(page);
}

function cardFor(html: string, id: string): string {
  const card = html.match(new RegExp(`<article data-id="${id}"[^>]*>[\\s\\S]*?<\\/article>`));
  expect(card, `expected rendered card ${id}`).toBeTruthy();
  return card?.[0] ?? "";
}

describe("database-mode home page", () => {
  beforeEach(() => {
    vi.stubEnv("DATA_MODE", undefined);
    mocks.query.mockReset().mockImplementation(createDbQuery());
    mocks.cookies.mockResolvedValue({
      get: (name: string) => name === "client_id" ? { value: SYNTHETIC_CLIENT_ID } : undefined,
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("renders synthetic Texas cards with in-band scores, band-share copy, and market switches", async () => {
    const html = await renderHome();

    expect(html).toContain("Synthetic Listing A");
    expect(html).toContain("Synthetic Listing B");
    expect(html).toContain("Synthetic Listing C");
    expect(html).not.toContain("Synthetic Listing California");
    const listingA = cardFor(html, "costar-900001");
    const listingB = cardFor(html, "costar-900002");
    const listingC = cardFor(html, "costar-900003");
    expect(listingA).toContain("Risk score 39/100");
    expect(listingA).toContain("Low risk");
    expect(listingA).toContain("of tracked Texas data center projects scored in this band were stopped");
    expect(listingB).toContain("Risk score 59/100");
    expect(listingB).toContain("Watch");
    expect(listingB).toContain("of tracked Texas data center projects scored in this band were stopped");
    expect(listingC).toContain("Risk score 60/100");
    expect(listingC).toContain("High risk");
    expect(listingC).toContain("of tracked Texas data center projects scored in this band were stopped");
    expect(html).toContain('href="/?market=houston"');
    expect(html).toContain('href="/?market=la"');
  });

  it("makes property facts and the recorded asking price primary with an explicit workload submit", async () => {
    const html = await renderHome({ mw: "175", type: "Industrial", acres: "5", power: "1" });
    const listingA = cardFor(html, "costar-900001");

    expect(html).toContain("Property prospects");
    expect(listingA).toContain("Asking price");
    expect(listingA).toContain("$12,000,000");
    expect(listingA).toContain("120,000");
    expect(html).toContain('name="mw"');
    expect(html).toContain('value="175"');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Apply search<\/button>/);
    expect(html).toContain('href="/listings/costar-900001?mw=175"');
    expect(html).not.toContain("real aerials by Vexcel");
    expect(html).not.toContain("Synthetic Listing B");
    expect(html).not.toContain("Synthetic Listing C");
    const linkedContent = [...listingA.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(([match]) => match);
    expect(linkedContent.every((link) => !link.includes("<button"))).toBe(true);
    expect(listingA).toContain('aria-label="Remove from watchlist"');
  });

  it("offers a useful reset when filters match no properties", async () => {
    const html = await renderHome({ q: "no-synthetic-property-has-this-name" });
    expect(html).toContain("No properties match this search");
    expect(html).toContain("Clear property filters");
    expect(html).not.toContain("Buy up to");
  });

  it("labels every card verdict and price ceiling as sample output", async () => {
    const html = await renderHome({});
    expect(html).toContain("Sample inputs");
    const listingA = cardFor(html, "costar-900001");
    expect(listingA).toMatch(/>(Buy|Maybe|Pass)<small[^>]*>Sample<\/small>/);
    expect(listingA).toContain("Ten-year cost");
    expect(html).toContain('name="ready"');
    expect(html).toContain('name="sort"');
  });

  it("renders the California market with its unscored notice and no numeric score or dollar scenario", async () => {
    const html = await renderHome({ market: "la" });
    const california = cardFor(html, "costar-900004");

    expect(california).toContain("Synthetic Listing California");
    expect(html).toContain("LA sites are unscored");
    expect(california).toContain("No band outcome estimate for this site.");
    expect(california).not.toMatch(/Risk score \d+\/100/);
    expect(california).not.toContain("delay exposure scenario");
    expect(california).toContain("Sample");
    expect(html).not.toContain("Synthetic Listing A");
  });

  it("explains California scoring limits while showing properties from both markets", async () => {
    const html = await renderHome({ market: "all" });
    expect(html).toContain("Synthetic Listing A");
    expect(html).toContain("Synthetic Listing California");
    expect(html).toContain("LA sites are unscored");
    expect(html).toContain("Selecting a screening band includes scored Texas properties only");
  });

  it("discloses why a screening-band filter excludes California in both markets", async () => {
    const html = await renderHome({ market: "all", band: "green" });
    expect(html).toContain("Synthetic Listing A");
    expect(html).not.toContain("Synthetic Listing California");
    expect(html).not.toContain("Synthetic Listing B");
    expect(html).toContain("LA sites are unscored");
    expect(html).toContain("Selecting a screening band includes scored Texas properties only");
    expect(html).toContain('aria-describedby="screening-band-help"');
  });

  it("keeps search text and client IDs in SQL arguments rather than query text", async () => {
    const needle = "synthetic' OR 1=1 --";
    await renderHome({ market: "houston", q: needle });

    const calls = mocks.query.mock.calls as unknown as [string, unknown[]][];
    expect(calls.some(([, args]) => args.includes(`%${needle}%`))).toBe(true);
    expect(calls.some(([sql, args]) => sql.includes("site_watchlist") && args.includes(SYNTHETIC_CLIENT_ID))).toBe(true);
    expect(calls.every(([sql]) => !sql.includes(needle) && !sql.includes(SYNTHETIC_CLIENT_ID))).toBe(true);
  });

  it("keeps rejected pool details out of the safe fallback rendered separately from Next boundary navigation", async () => {
    const secret = "DATABASE_URL=synthetic-secret-value";
    mocks.query.mockImplementation(createDbQuery({ reject: new Error(secret) }));

    await expect(renderHome()).rejects.toThrow(secret);

    const error = new Error(secret);
    const reset = vi.fn();
    const fallbackElement = ErrorPage({ error, reset });
    const html = renderToStaticMarkup(fallbackElement);
    expect(html).toContain("Data is temporarily unavailable. Please try again.");
    expect(html).not.toContain(secret);
    expect(html).not.toContain("DATABASE_URL");

    const button = Children.toArray(fallbackElement.props.children).find((child) =>
      isValidElement(child) && child.type === "button");
    expect(button && isValidElement(button)).toBe(true);
    if (button && isValidElement(button)) {
      (button.props as { onClick: () => void }).onClick();
    }
    expect(reset).toHaveBeenCalledOnce();
  });
});

describe("public-mode property catalog boundary", () => {
  beforeEach(() => {
    vi.stubEnv("DATA_MODE", "public");
    mocks.query.mockReset().mockRejectedValue(new Error("Database must not be queried"));
    mocks.cookies.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("explains unavailable properties without substituting public project records or touching the database", async () => {
    const html = await renderHome({ market: "la", status: "all" });
    expect(html).toContain("Property catalog unavailable");
    expect(html).toContain("Houston");
    expect(html).toContain("Los Angeles");
    expect(html).toContain('href="/projects"');
    expect(html).toContain('href="/workspace"');
    expect(html).not.toContain("Risk score");
    expect(html).not.toContain("/api/vexcel/");
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.cookies).not.toHaveBeenCalled();
  });
});

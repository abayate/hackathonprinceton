import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Projects from "./page";
import { createDbQuery, SYNTHETIC_CLIENT_ID } from "@/test/dbFixtures";

const mocks = vi.hoisted(() => ({ query: vi.fn(), cookies: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ pool: { query: mocks.query } }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/link", async () => {
  const React = await import("react");
  return { default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => React.createElement("a", { href, ...props }, children) };
});
vi.mock("next/dynamic", () => ({ default: () => () => null }));

async function renderProjects(searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(await Projects({ searchParams: Promise.resolve(searchParams) }));
}

describe("project research route", () => {
  beforeEach(() => {
    vi.stubEnv("DATA_MODE", undefined);
    mocks.query.mockReset().mockImplementation(createDbQuery());
    mocks.cookies.mockResolvedValue({ get: (name: string) => name === "client_id" ? { value: SYNTHETIC_CLIENT_ID } : undefined });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("reads tracked projects in database mode and keeps research separate from property listings", async () => {
    const html = await renderProjects();
    expect(html).toContain("Tracked Texas projects");
    expect(html).toContain("Synthetic Project Proposed");
    expect(html).not.toContain("Synthetic Project Stopped");
    expect(html).not.toContain("Synthetic Listing A");
    expect(html).not.toContain("Public data mode");
    expect(html).toContain("Research workspace");
    expect(html).toContain('href="/workspace"');
    expect(html).toContain("not property listings");
    expect(html).toContain('action="/projects"');
    expect(html).toContain('href="/projects?status=stopped"');
  });

  it("keeps status, score-band and escaped search filters on the project route", async () => {
    const html = await renderProjects({ status: "stopped", band: "watch", q: "Synthetic" });
    expect(html).toContain("Synthetic Project Stopped");
    expect(html).not.toContain("Synthetic Project Proposed");
    expect(html).toContain('href="/projects?status=built&amp;band=watch&amp;q=Synthetic"');
    expect(html).not.toContain('href="/?status=');
  });

  it("uses the checked-in project data in public mode without querying the database", async () => {
    vi.stubEnv("DATA_MODE", "public");
    mocks.query.mockRejectedValue(new Error("Database must not be queried"));
    mocks.cookies.mockResolvedValue({ get: () => undefined });
    const html = await renderProjects({ status: "proposed" });
    expect(html).toContain("Tracked Texas projects");
    expect(html).toContain("Public data mode");
    expect(html).toContain("Saved for this local session only.");
    expect(html).toContain('href="/workspace"');
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

import { afterEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { BandRates, Candidate } from "@/lib/workspaceTypes";
import type { WatchedSource } from "@/lib/sourceMonitorTypes";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ pool: { query: db.query } }));
vi.mock("./WorkspaceShell", () => ({ default: () => null }));

import WorkspacePage from "./page";

type ShellProps = { candidates: Candidate[]; watched: WatchedSource[]; bandRates: BandRates };

afterEach(() => { vi.unstubAllEnvs(); db.query.mockClear(); });

it.each(["public", "database"])("uses the checked-in Texas projects in %s mode without a database query", async (mode) => {
  if (mode === "public") vi.stubEnv("DATA_MODE", "public");
  else vi.stubEnv("DATA_MODE", undefined);

  const page = await WorkspacePage() as ReactElement<ShellProps>;
  const { candidates, watched, bandRates } = page.props;
  expect(candidates.length).toBeGreaterThan(2);
  expect(candidates).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "9e0c6d73-37c3-4037-81d1-f96bf6821442", name: "Inner Loop Exchange Data Center (Georgetown)" }),
  ]));
  expect(candidates.every((candidate) => candidate.id.match(/^[a-f0-9-]{36}$/))).toBe(true);
  expect(watched.length).toBeGreaterThan(0);
  expect(watched.every((source) => candidates.some((candidate) => candidate.id === source.projectId))).toBe(true);
  expect(Object.values(bandRates).every((rate) => rate !== null && rate >= 0 && rate <= 1)).toBe(true);
  expect(db.query).not.toHaveBeenCalled();
});

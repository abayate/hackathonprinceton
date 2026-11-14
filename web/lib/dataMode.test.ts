import { afterEach, describe, expect, it, vi } from "vitest";
import { isPublicDataMode } from "./dataMode";

afterEach(() => vi.unstubAllEnvs());

describe("DATA_MODE", () => {
  it("uses the database when unset", () => {
    vi.stubEnv("DATA_MODE", undefined);
    expect(isPublicDataMode()).toBe(false);
  });

  it("uses committed public data only for the exact public value", () => {
    vi.stubEnv("DATA_MODE", "public");
    expect(isPublicDataMode()).toBe(true);
  });

  it.each(["database", "PUBLIC", " public ", "", "auto"])("rejects unsupported value %j", (value) => {
    vi.stubEnv("DATA_MODE", value);
    expect(() => isPublicDataMode()).toThrow("DATA_MODE");
  });
});

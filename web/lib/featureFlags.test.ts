import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { isEvidenceIntakeEnabled, isInvestigatorEnabled } from "./featureFlags";

afterEach(() => vi.unstubAllEnvs());

it("enables evidence intake only for the exact true value", () => {
  for (const value of [undefined, "", "false", "TRUE", " true ", "1"]) {
    vi.stubEnv("ENABLE_EVIDENCE_INTAKE", value);
    expect(isEvidenceIntakeEnabled()).toBe(false);
  }
  vi.stubEnv("ENABLE_EVIDENCE_INTAKE", "true");
  expect(isEvidenceIntakeEnabled()).toBe(true);
});

it("enables the investigator independently and only for the exact true value", () => {
  vi.stubEnv("ENABLE_EVIDENCE_INTAKE", "true");
  for (const value of [undefined, "", "false", "TRUE", " true ", "1"]) {
    vi.stubEnv("ENABLE_INVESTIGATOR", value); expect(isInvestigatorEnabled()).toBe(false);
  }
  vi.stubEnv("ENABLE_INVESTIGATOR", "true"); vi.stubEnv("ENABLE_EVIDENCE_INTAKE", undefined);
  expect(isInvestigatorEnabled()).toBe(true); expect(isEvidenceIntakeEnabled()).toBe(false);
});

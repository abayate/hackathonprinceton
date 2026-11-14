import { describe, expect, it, vi } from "vitest";
import { economics, stoppedShareForBand } from "./model";
import { getModelArtifact } from "./modelArtifact";

vi.mock("server-only", () => ({}));

describe("generated model artifact presentation rates", () => {
  it("uses the artifact's default band rates for the 100 MW exposure scenarios", async () => {
    const card = await getModelArtifact();
    const outcomes = card.metrics.band_outcomes_oof;
    expect(outcomes.bands.green.rate).toBeCloseTo(0.059172, 6);
    expect(outcomes.bands.watch.rate).toBeCloseTo(0.175365, 6);
    expect(outcomes.bands.red.rate).toBeCloseTo(0.321755, 6);

    expect(economics(stoppedShareForBand("green", outcomes), 100).expectedDelayCost).toBe(12_071_088);
    expect(economics(stoppedShareForBand("watch", outcomes), 100).expectedDelayCost).toBe(35_774_460);
    expect(economics(stoppedShareForBand("red", outcomes), 100).expectedDelayCost).toBe(65_638_020);
  });
});

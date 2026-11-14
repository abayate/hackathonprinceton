import { listPublicSites } from "@/lib/publicStore";
import { getSignals } from "@/lib/signalStore";
import { getModelArtifact } from "@/lib/modelArtifact";
import { toCandidate } from "@/lib/workspace";
import { watchedSourcesFor } from "@/lib/sourceMonitor";
import type { BandRates } from "@/lib/workspaceTypes";
import WorkspaceShell from "./WorkspaceShell";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const [sites, signals, model] = await Promise.all([
    listPublicSites({ status: "proposed" }), getSignals(), getModelArtifact(),
  ]);
  const bandRates: BandRates = {
    green: model.metrics.band_outcomes_oof.bands.green.rate,
    watch: model.metrics.band_outcomes_oof.bands.watch.rate,
    red: model.metrics.band_outcomes_oof.bands.red.rate,
  };
  return <WorkspaceShell candidates={sites.map((site) => toCandidate(site, signals))}
    watched={sites.flatMap((site) => watchedSourcesFor(site, signals))} bandRates={bandRates} />;
}

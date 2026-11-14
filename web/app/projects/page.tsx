import { cookies } from "next/headers";
import { listSites, watchlistIds } from "@/lib/sites";
import { getModelArtifact } from "@/lib/modelArtifact";
import { isPublicDataMode } from "@/lib/dataMode";
import type { Band } from "@/lib/model";
import PublicProjectIndex from "../components/PublicProjectIndex";

export const dynamic = "force-dynamic";
type SearchParams = { status?: string; band?: string; q?: string };

export default async function Projects({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const publicMode = isPublicDataMode();
  const status = (["all", "proposed", "built", "stopped"].includes(sp.status ?? "") ? sp.status : "proposed") as "all" | "proposed" | "built" | "stopped";
  const band = (["green", "watch", "red"].includes(sp.band ?? "") ? sp.band : undefined) as Band | undefined;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : undefined;
  const [projects, modelArtifact] = await Promise.all([listSites({ status, band, q }), getModelArtifact()]);
  const clientId = (await cookies()).get("client_id")?.value;
  const savedIds = clientId ? await watchlistIds(clientId) : [];
  return PublicProjectIndex({ projects, status, band, q, savedIds, modelName: modelArtifact.defaultModel, publicMode });
}

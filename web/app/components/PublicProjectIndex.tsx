import Link from "next/link";
import type { Site } from "@/lib/sites";
import type { Band } from "@/lib/model";
import PublicModeBanner from "./PublicModeBanner";
import PublicProjectMap from "./PublicProjectMap";
import { getSignals } from "@/lib/signalStore";
import { signalAppliesTo } from "@/lib/signals";

type Status = "all" | "proposed" | "built" | "stopped";
type Props = {
  projects: Site[];
  status: Status;
  band?: Band;
  q?: string;
  savedIds: string[];
  modelName: string;
  publicMode: boolean;
};

function filterHref(status: Status, band?: Band, q?: string) {
  const params = new URLSearchParams();
  params.set("status", status);
  if (band) params.set("band", band);
  if (q) params.set("q", q);
  return `/projects?${params.toString()}`;
}

export default async function PublicProjectIndex({ projects, status, band, q, savedIds, modelName, publicMode }: Props) {
  const signals = await getSignals();
  const signalCounts = Object.fromEntries(projects.map((project) => [
    project.project_id,
    signals.filter((signal) => signalAppliesTo(signal, project.project_id, {
      county: project.county, state: "TX", city: project.city, inCityLimits: project.in_city_limits,
    })).length,
  ]));
  const statuses: [Status, string][] = [["all", "All"], ["proposed", "Proposed"], ["built", "Built"], ["stopped", "Stopped"]];
  const bands: [Band | undefined, string][] = [[undefined, "All bands"], ["green", "Green"], ["watch", "Watch"], ["red", "Red"]];

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
      {publicMode && <PublicModeBanner savedLocalSession />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Tracked Texas projects</h1>
          <p className="mt-1 text-sm text-slate-600">Public project records with {modelName} model scores and risk bands.</p>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">These are tracked development projects, not property listings. Use their sources and outcomes to support your research.</p>
          <Link href="/workspace" className="mt-3 inline-block text-sm font-semibold text-[#245c49] underline underline-offset-4">Research workspace <span aria-hidden="true">→</span></Link>
        </div>
        <form method="get" action="/projects" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="status" value={status} />
          {band && <input type="hidden" name="band" value={band} />}
          <label className="text-xs font-medium text-slate-600">Search projects
            <input name="q" defaultValue={q ?? ""} placeholder="Name, city or county" className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Search</button>
        </form>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" aria-label="Filter by status">
        {statuses.map(([value, label]) => <Link key={value} href={filterHref(value, band, q)} aria-current={status === value ? "page" : undefined} className={`rounded-full border px-4 py-1.5 text-sm font-medium ${status === value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{label}</Link>)}
      </div>
      <p className="mt-1 text-xs text-slate-500">Status filters and card labels reflect the tracker&apos;s classifications, not independently verified outcomes.</p>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Filter by risk band">
        {bands.map(([value, label]) => <Link key={value ?? "all"} href={filterHref(status, value, q)} aria-current={band === value ? "page" : undefined} className={`rounded-full border px-4 py-1.5 text-sm font-medium ${band === value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{label}</Link>)}
      </div>

      <p className="mt-4 text-sm text-slate-500">{projects.length} projects</p>
      <PublicProjectMap projects={projects} savedIds={savedIds} signalCounts={signalCounts} />
    </main>
  );
}

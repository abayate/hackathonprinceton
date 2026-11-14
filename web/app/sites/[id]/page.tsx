import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getSite, saferNearby, scoreHistory, watchlistIds } from "@/lib/sites";
import { checksFor, type CheckStatus } from "@/lib/checks";
import { CONSTANTS, economics, money } from "@/lib/model";
import BandBadge from "@/app/components/BandBadge";
import HeartButton from "@/app/components/HeartButton";
import SiteMap from "@/app/components/SiteMap";
import { BAND_COLOR } from "@/app/components/BandBadge";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<CheckStatus, string> = {
  pass: "bg-emerald-100 text-emerald-800",
  watch: "bg-amber-100 text-amber-800",
  fail: "bg-rose-100 text-rose-800",
  unknown: "bg-slate-100 text-slate-600",
};

const LABEL_TEXT: Record<string, string> = {
  unlabeled: "Proposed",
  built: "Built or under construction",
  stopped: "Stopped",
};

export default async function SitePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mw?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const mw = Math.max(1, Number(sp.mw) || 100);
  const site = await getSite(id);
  if (!site) notFound();

  const [nearby, history] = await Promise.all([saferNearby(id), scoreHistory(id)]);
  const clientId = (await cookies()).get("client_id")?.value;
  const saved = clientId ? (await watchlistIds(clientId)).includes(id) : false;
  const e = economics(site.p_stopped, mw);
  const checks = checksFor(site);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <Link href={`/?mw=${mw}`} className="text-sm text-slate-500 hover:text-slate-900">← Back to search</Link>

      <div className="mt-3 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <BandBadge band={site.band} />
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{LABEL_TEXT[site.label] ?? site.label}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{site.name}</h1>
          <p className="text-sm text-slate-600">
            {site.city ? `${site.city}, ` : ""}{site.county}, Texas{site.company ? ` · ${site.company}` : ""}
          </p>
          <p className="mt-3 text-lg font-semibold text-slate-900">
            {e.expectedDelayMonths == null
              ? "No risk score for this site"
              : `Expected ${e.expectedDelayMonths.toFixed(1)} months of delay · ${money(e.expectedDelayCost)} expected delay cost`}
            <span className="ml-2 text-sm font-normal text-slate-500">at {mw} MW</span>
          </p>
        </div>
        <HeartButton projectId={site.project_id} saved={saved} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <div className="h-64 overflow-hidden rounded-2xl ring-1 ring-slate-200">
            <SiteMap points={[{ id: site.project_id, name: site.name, lat: site.lat, lng: site.lng, color: BAND_COLOR[site.band ?? "none"], label: site.band ?? "unscored" }]} />
          </div>
          {site.coord_precision === "town" && (
            <p className="-mt-4 text-xs text-slate-500">Location is approximate (town level in the source).</p>
          )}

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Buildability checks</h2>
            <ul className="mt-3 divide-y divide-slate-200 rounded-2xl bg-white ring-1 ring-slate-200">
              {checks.map((c) => (
                <li key={c.id}>
                  <details className="group p-4">
                    <summary className="flex cursor-pointer list-none items-center gap-3">
                      <span className={`w-16 rounded-full px-2 py-0.5 text-center text-xs font-semibold uppercase ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                      <span className="font-medium text-slate-900">{c.title}</span>
                      <span className="ml-auto text-slate-400 transition group-open:rotate-90">›</span>
                    </summary>
                    <div className="mt-2 space-y-1 pl-[4.75rem] text-sm text-slate-600">
                      <p>{c.detail}</p>
                      <p className="text-xs text-slate-500">How we decide: {c.basis}</p>
                      {c.sources.length > 0 && (
                        <p className="text-xs">
                          Sources:{" "}
                          {c.sources.map((s, i) => (
                            <span key={s.label}>
                              {i > 0 && " · "}
                              {s.url ? <a className="text-sky-700 underline" href={s.url} target="_blank" rel="noreferrer">{s.label}</a> : s.label}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </section>

          {site.label === "stopped" && (
            <section className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
              <h2 className="font-semibold text-rose-900">What happened</h2>
              <p className="mt-1 text-sm text-rose-900">
                This project was {site.tracker_status}{site.stop_event_date ? ` (${site.stop_event_date})` : ""}.
                {site.primary_source_url && (
                  <> Source: <a className="underline" href={site.primary_source_url} target="_blank" rel="noreferrer">{site.primary_source_name ?? "article"}</a>.</>
                )}
              </p>
              {site.in_training_set && <p className="mt-1 text-xs text-rose-800">The model trained on this project, so its score here is in-sample.</p>}
            </section>
          )}

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Similar sites nearby with lower risk</h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-3">
              {nearby.map((n) => (
                <li key={n.project_id}>
                  <Link href={`/sites/${n.project_id}?mw=${mw}`} className="block rounded-xl bg-white p-3 ring-1 ring-slate-200 hover:shadow-md">
                    <BandBadge band={n.band} />
                    <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-900">{n.name}</p>
                    <p className="text-xs text-slate-500">{n.km} km away · {Math.round(n.p_stopped * 100)}% risk · {LABEL_TEXT[n.label] ?? n.label}</p>
                  </Link>
                </li>
              ))}
              {!nearby.length && <li className="text-sm text-slate-500">No lower-risk sites found nearby.</li>}
            </ul>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="font-semibold text-slate-900">Cost at {mw} MW</h2>
            <form method="get" className="mt-2 flex items-center gap-2">
              <input name="mw" type="number" min={1} defaultValue={mw} className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
              <span className="text-sm text-slate-500">MW</span>
              <button className="ml-auto rounded-lg bg-slate-900 px-3 py-1 text-sm font-semibold text-white">Update</button>
            </form>
            <dl className="mt-4 space-y-2 text-sm">
              <Row label="Build cost" value={money(e.buildCost)} tag="reported" note={CONSTANTS.buildCostUsdPerW.note} />
              <Row label="Power per year" value={money(e.annualPower)} tag="modeled" note={`${CONSTANTS.electricityUsdPerKwh.note}; PUE ${CONSTANTS.pue.value}, ${CONSTANTS.avgLoad.value * 100}% load (assumed)`} />
              <Row label="Lease revenue per month" value={money(e.monthlyLease)} tag="reported" note={CONSTANTS.leaseUsdPerKwMonth.note} />
              <div className="border-t border-slate-200 pt-2" />
              <Row label="Chance blocked or delayed" value={site.p_stopped == null ? "Unknown" : `${Math.round(site.p_stopped * 100)}%`} tag="modeled" note="Logistic regression on real Texas outcomes" />
              <Row label="Expected delay" value={e.expectedDelayMonths == null ? "Unknown" : `${e.expectedDelayMonths.toFixed(1)} months`} tag="modeled" note={`Chance × ${CONSTANTS.typicalDelayMonths.value} months typical delay (assumed)`} />
              <Row label="Expected delay cost" value={money(e.expectedDelayCost)} tag="modeled" note="Expected delay × monthly lease revenue" strong />
            </dl>
            <p className="mt-3 text-xs text-slate-500">Build cost excludes land, utility works, IT equipment and fees.</p>
          </div>

          <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="font-semibold text-slate-900">Score history</h2>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {history.map((h) => (
                <li key={h.at + h.model_version} className="flex justify-between gap-2">
                  <span>{h.at}</span>
                  <span className="font-medium text-slate-900">{Math.round(h.p_stopped * 100)}%</span>
                </li>
              ))}
              {!history.length && <li>No scores yet.</li>}
            </ul>
            <p className="mt-2 text-xs text-slate-500">Stored in Tiger Data (hypertable <code>risk_scores</code>).</p>
          </div>

          <div className="rounded-2xl bg-white p-5 text-sm ring-1 ring-slate-200">
            <h2 className="font-semibold text-slate-900">Record</h2>
            <p className="mt-1 text-slate-600">Status in tracker: {site.tracker_status.replace("_", " ")}</p>
            {site.capacity_mw && <p className="text-slate-600">Reported capacity: {site.capacity_mw} MW</p>}
            <p className="mt-1">
              <a className="text-sky-700 underline" href={site.tracker_url} target="_blank" rel="noreferrer">Tracker entry</a>
              {site.primary_source_url && (
                <> · <a className="text-sky-700 underline" href={site.primary_source_url} target="_blank" rel="noreferrer">{site.primary_source_name ?? "Primary source"}</a></>
              )}
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function Row({ label, value, tag, note, strong }: { label: string; value: string; tag: string; note: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3" title={note}>
      <dt className="text-slate-600">
        {label} <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] uppercase text-slate-500">{tag}</span>
      </dt>
      <dd className={strong ? "font-bold text-slate-900" : "font-medium text-slate-900"}>{value}</dd>
    </div>
  );
}

import { isClientId, parseAsOf, parseMw } from "@/lib/params";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getSite, saferNearby, scoreHistory, watchlistIds } from "@/lib/sites";
import { checksFor, type CheckStatus } from "@/lib/checks";
import { band, displayScore, CONSTANTS, economics, money, stoppedShareForBand } from "@/lib/model";
import BandBadge from "@/app/components/BandBadge";
import HeartButton from "@/app/components/HeartButton";
import SiteMap from "@/app/components/SiteMap";
import { BAND_COLOR } from "@/app/components/BandBadge";
import { getModelArtifact } from "@/lib/modelArtifact";
import { buildTimeline, evidenceBaseline, type Signal } from "@/lib/signals";
import { getSignals } from "@/lib/signalStore";
import { getLabelReviews, type ReviewFinding } from "@/lib/labelReview";
import SignalTimeline from "@/app/components/SignalTimeline";
import { isPublicDataMode } from "@/lib/dataMode";
import PublicModeBanner from "@/app/components/PublicModeBanner";
import EvidenceIntakeForm from "@/app/components/EvidenceIntakeForm";
import { isEvidenceIntakeEnabled } from "@/lib/featureFlags";
import { getIntakeSignals } from "@/lib/intakeStore";
import { buildInvestigationPlan } from "@/lib/investigator";
import { isInvestigatorEnabled } from "@/lib/featureFlags";
import { isGeminiConfigured } from "@/lib/geminiClient";
import InvestigatePanel from "@/app/components/InvestigatePanel";

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

const OUTCOME_TEXT: Partial<Record<Signal["signal_type"], string>> = {
  outcome_denied: "Denied",
  outcome_withdrawn: "Withdrawn",
  outcome_suspended: "Suspended (may resume)",
  outcome_approved: "Approved",
};

function findingText(finding: ReviewFinding): string {
  return finding.replaceAll("_", " ");
}

export default async function SitePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mw?: string; asof?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const mw = parseMw(sp.mw);
  const asOf = parseAsOf(sp.asof);
  const publicMode = isPublicDataMode();
  const intakeEnabled = publicMode && isEvidenceIntakeEnabled();
  const investigatorEnabled = publicMode && isInvestigatorEnabled();
  const clientId = (await cookies()).get("client_id")?.value;
  const [site, modelArtifact, publicSignals, sessionSignals, labelReviews] = await Promise.all([
    getSite(id), getModelArtifact(), getSignals(),
    (intakeEnabled || investigatorEnabled) && isClientId(clientId) ? getIntakeSignals(clientId) : Promise.resolve([]),
    getLabelReviews(),
  ]);
  if (!site) notFound();
  const signals = [...publicSignals, ...sessionSignals];
  const labelReview = labelReviews.find((review) => review.project_id === id);
  const reviewedOutcome = labelReview
    ? publicSignals.find((signal) => labelReview.signal_ids.includes(signal.signal_id) && signal.effect === "outcome")
    : undefined;

  const [nearby, history] = await Promise.all([saferNearby(id), scoreHistory(id)]);
  const saved = clientId ? (await watchlistIds(clientId)).includes(id) : false;
  const stoppedShare = stoppedShareForBand(site.band, modelArtifact.metrics.band_outcomes_oof);
  const e = economics(stoppedShare, mw);
  const investigationPlan = investigatorEnabled ? buildInvestigationPlan(site) : null;
  const holdoutDemo = modelArtifact.holdoutDemo?.projectId === id ? modelArtifact.holdoutDemo : null;
  const timelineBand = evidenceBaseline(id, site.band, holdoutDemo);
  const timeline = buildTimeline(signals, id, timelineBand, asOf, {
    county: site.county, state: "TX", city: site.city, inCityLimits: site.in_city_limits,
  });
  const checks = checksFor(site, timeline.known);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      {publicMode && <PublicModeBanner savedLocalSession />}
      <Link href="/projects" className="text-sm text-slate-500 hover:text-slate-900">← Back to project research</Link>
      {asOf && <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">The selected date filters the evidence timeline and dated-record counts only. Tracker labels, model output, and the rest of this page show the current dataset, including later outcomes.</p>}

      <div className="mt-3 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Tracker label: {LABEL_TEXT[site.label] ?? site.label}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{site.name}</h1>
          <p className="text-sm text-slate-600">
            {site.city ? `${site.city}, ` : ""}{site.county}, Texas{site.company ? ` · ${site.company}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-900">
            {site.p_stopped == null ? <span>No risk score for this site</span> : <span>Risk score {displayScore(site.p_stopped)}/100</span>}
            <BandBadge band={site.band} />
          </div>
          {stoppedShare == null && <p className="mt-1 text-sm text-slate-500">No cross-validation band outcome estimate.</p>}
          <p className="mt-1 text-sm text-slate-600">Delay exposure scenario: {money(e.expectedDelayCost)} at {mw} MW{e.expectedDelayMonths == null ? "" : ` · ${e.expectedDelayMonths.toFixed(1)} months of lease exposure`}</p>
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
                      {(c.datedRecordCount ?? 0) > 0 && (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800">
                          {c.datedRecordCount} dated {c.datedRecordCount === 1 ? "record" : "records"}
                        </span>
                      )}
                      <span className="ml-auto text-slate-400 transition group-open:rotate-90">›</span>
                    </summary>
                    <div className="mt-2 space-y-1 pl-[4.75rem] text-sm text-slate-600">
                      <p>{c.detail}</p>
                      {c.datedRecordCount != null && c.datedRecordCount > 0 && (
                        <p className="text-xs">
                          <Link className="text-sky-700 underline" href="#evidence-timeline">
                            {c.datedRecordCount} dated {c.datedRecordCount === 1 ? "record" : "records"} · view evidence timeline
                          </Link>
                        </p>
                      )}
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

          <SignalTimeline timeline={timeline} asOf={asOf} mw={mw} holdoutDemo={holdoutDemo} />
          {investigationPlan && <InvestigatePanel plan={investigationPlan} configured={isGeminiConfigured()} />}
          {intakeEnabled && <EvidenceIntakeForm projectId={id} />}

          {site.label === "stopped" && (
            <section id="tracker-status" className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
              <h2 className="font-semibold text-rose-900">Tracker status</h2>
              <p className="mt-1 text-sm text-rose-900">
                The tracker lists this project as {site.tracker_status.replaceAll("_", " ")}{site.stop_event_date ? ` (${site.stop_event_date})` : ""}. This is the tracker&apos;s label and has not been independently verified.
                {site.primary_source_url && (
                  <> <a className="underline" href={site.primary_source_url} target="_blank" rel="noreferrer">Tracker&apos;s cited source: {site.primary_source_name ?? "article"}</a>.</>
                )}
              </p>
              {site.tracker_url && <p className="mt-1 text-xs text-rose-800"><a className="underline" href={site.tracker_url} target="_blank" rel="noreferrer">Tracker entry</a></p>}
              {labelReview && (
                <div className="mt-3 rounded-xl bg-white/70 p-3 text-sm text-slate-800 ring-1 ring-rose-200">
                  <h3 className="font-semibold">Our review</h3>
                  <p className="mt-1">{labelReview.note}</p>
                  <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                    <div><dt className="inline font-semibold">Kind: </dt><dd className="inline">{findingText(labelReview.kind_finding)}</dd></div>
                    <div><dt className="inline font-semibold">Date: </dt><dd className="inline">{findingText(labelReview.date_finding)}</dd></div>
                  </dl>
                  {reviewedOutcome && (
                    <p className="mt-2 text-xs">Reviewed outcome: {OUTCOME_TEXT[reviewedOutcome.signal_type] ?? reviewedOutcome.signal_type}.</p>
                  )}
                  <Link href="#evidence-timeline" className="mt-2 inline-block text-sm text-sky-800 underline">View reviewed records in the evidence timeline</Link>
                </div>
              )}
              {site.in_training_set && <p className="mt-1 text-xs text-rose-800">The model trained on this project, so its score here is in-sample.</p>}
            </section>
          )}

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Similar sites nearby with lower risk</h2>
            <p className="mt-1 text-xs text-slate-500">Risk bands summarize a small cross-validation sample using today&apos;s features.</p>
            <ul className="mt-3 grid gap-3 sm:grid-cols-3">
              {nearby.map((n) => (
                <li key={n.project_id}>
                  <Link href={`/sites/${n.project_id}?mw=${mw}`} className="block rounded-xl bg-white p-3 ring-1 ring-slate-200 hover:shadow-md">
                    <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-900">{n.name}</p>
                    <p className="text-xs text-slate-500">{n.km} km away · Risk score {displayScore(n.p_stopped)}/100 · Tracker label: {LABEL_TEXT[n.label] ?? n.label}</p>
                    <BandBadge band={n.band} />
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
              {asOf && <input type="hidden" name="asof" value={asOf} />}
              <input name="mw" type="number" min={1} defaultValue={mw} className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
              <span className="text-sm text-slate-500">MW</span>
              <button className="ml-auto rounded-lg bg-slate-900 px-3 py-1 text-sm font-semibold text-white">Update</button>
            </form>
            <dl className="mt-4 space-y-2 text-sm">
              <Row label="Build cost" value={money(e.buildCost)} tag="reported" note={CONSTANTS.buildCostUsdPerW.note} />
              <Row label="Power per year" value={money(e.annualPower)} tag="modeled" note={`${CONSTANTS.electricityUsdPerKwh.note}; PUE ${CONSTANTS.pue.value}, ${CONSTANTS.avgLoad.value * 100}% load (assumed)`} />
              <Row label="Lease revenue per month" value={money(e.monthlyLease)} tag="reported" note={CONSTANTS.leaseUsdPerKwMonth.note} />
              <div className="border-t border-slate-200 pt-2" />
              <Row label="Risk score" value={site.p_stopped == null ? "Unknown" : `${displayScore(site.p_stopped)}/100`} tag="modeled" note="Class-weighted score, not a calibrated probability. See Evidence." />
              <Row label="Band's observed stopped share" value={stoppedShare == null ? "Unknown" : `${(stoppedShare * 100).toFixed(1)}%`} tag="cross-validated" note="Share of held-out tracked Texas data center project predictions in this band whose project was stopped." />
              <Row label="Lease exposure (months)" value={e.expectedDelayMonths == null ? "Unknown" : `${e.expectedDelayMonths.toFixed(1)} months`} tag="assumed" note="Band's stopped share × 12 months (assumed)" />
              <Row label="Delay exposure scenario" value={money(e.expectedDelayCost)} tag="modeled" note="Scenario duration × monthly lease revenue" strong />
            </dl>
            <p className="mt-3 text-xs text-slate-500">Build cost excludes land, utility works, IT equipment and fees.</p>
          </div>

          <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="font-semibold text-slate-900">Score history</h2>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {history.map((h) => (
                <li key={h.at + h.model_version} className="flex justify-between gap-2">
                  <span>{h.at}</span>
                  <span className="font-medium text-slate-900">Risk score {displayScore(h.p_stopped)}/100 <BandBadge band={band(h.p_stopped)} /></span>
                </li>
              ))}
              {!history.length && <li>No scores yet.</li>}
            </ul>
            <p className="mt-2 text-xs text-slate-500">Recorded scores from different model versions may not be directly comparable.</p>
          </div>

          <div className="rounded-2xl bg-white p-5 text-sm ring-1 ring-slate-200">
            <h2 className="font-semibold text-slate-900">Record</h2>
            <p className="mt-1 text-slate-600">Tracker label: {site.tracker_status.replaceAll("_", " ")}</p>
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

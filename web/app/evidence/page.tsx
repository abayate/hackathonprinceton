import Link from "next/link";
import { listSites } from "@/lib/sites";
import { BAND_COLOR } from "@/lib/model";
import { getModelArtifact } from "@/lib/modelArtifact";
import BandBadge from "@/app/components/BandBadge";
import EvidenceMap from "./EvidenceMap";
import { isPublicDataMode } from "@/lib/dataMode";
import PublicModeBanner from "@/app/components/PublicModeBanner";
import { signalAppliesTo, signalScopeLabel } from "@/lib/signals";
import { getSignals } from "@/lib/signalStore";
import { computeCaseStudies, summarizeCaseStudies, type CaseStudyRow } from "@/lib/caseStudies";
import { getLabelReviews, summarizeLabelReviews } from "@/lib/labelReview";

export const dynamic = "force-dynamic";

const FEATURE_TEXT: Record<string, string> = {
  in_city_limits: "Inside city limits",
  in_urban_area: "Inside an urban area",
  log_county_density: "County population density",
  log_km_to_metro: "Distance to the nearest big metro",
  is_crypto: "Crypto mine",
  log_county_projects: "Data centers already in the county",
};

const OUTCOME_LABELS: Record<string, string> = {
  outcome_denied: "Denied",
  outcome_withdrawn: "Withdrawn",
  outcome_suspended: "Suspended — may resume",
  outcome_approved: "Approved",
};

function leadText(row: CaseStudyRow): string {
  if (row.leadStatus === "positive_lead") return `${row.leadDays} days`;
  if (row.leadStatus === "no_project_record") return "No project record";
  if (row.leadStatus === "no_outcome_record") return "Not applicable — no outcome record";
  if (row.leadStatus === "no_raise_recorded") return "No raise recorded";
  return "No lead — raise on or after outcome day";
}

export default async function EvidencePage() {
  const model = await getModelArtifact();
  const m = model;
  const [stopped, all, signals, labelReviews] = await Promise.all([
    listSites({ status: "stopped" }), listSites({ status: "all" }), getSignals(), getLabelReviews(),
  ]);
  const labelReviewSummary = summarizeLabelReviews(labelReviews);
  const cases = computeCaseStudies(all.map((site) => ({
    projectId: site.project_id, name: site.name, county: site.county, state: "TX",
    city: site.city, inCityLimits: site.in_city_limits,
    modelBand: site.band, trackerStatus: site.tracker_status,
  })), signals);
  const caseSummary = summarizeCaseStudies(cases);
  const coefs = Object.entries(m.coefficients).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const maxAbs = Math.max(...coefs.map(([, v]) => Math.abs(v)));

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
      {isPublicDataMode() && <PublicModeBanner />}
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">The evidence behind every score</h1>
      <p className="mt-2 max-w-3xl text-slate-600">
        The default model was trained on {m.metrics.n_projects} Texas projects labeled by the tracker ({m.metrics.n_stopped} stopped and {m.metrics.n_built} under construction).
        The map shows {all.length} tracked projects across statuses. Project pages link to tracker-cited sources; citations are not independent verification of tracker labels.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-4">
        {[
          ["Stopped projects", String(m.metrics.n_stopped)],
          ["Built (comparison)", String(m.metrics.n_built)],
          ["ROC AUC (cross-validated)", `${m.metrics.roc_auc_mean.toFixed(2)} ± ${m.metrics.roc_auc_std.toFixed(2)}`],
          ["Stopped projects flagged at 0.5", `${Math.round(m.metrics.stopped_recall_at_0_5 * 100)}%`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl p-5 ring-1 ring-slate-200">
            <div className="text-xs uppercase tracking-wide text-slate-500">{k}</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{v}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {m.description}. 5-fold cross-validation repeated 20 times. The 0–100 risk score is class-weighted and is not a calibrated probability. Small sample with today&apos;s features: an early signal, not proof.
      </p>

      <section id="training-label-check" className="mt-5 rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200" aria-labelledby="training-label-heading">
        <h2 id="training-label-heading" className="font-semibold text-amber-950">Training label check</h2>
        <p className="mt-1 text-sm text-amber-950">
          {labelReviewSummary.reviewed} of {m.metrics.n_stopped} stopped training labels reviewed · {labelReviewSummary.consistentKind} consistent in outcome kind · {labelReviewSummary.consistentDate} consistent in date.
          The model is trained on the tracker&apos;s labels as given. This is a spot check of San Marcos and three additional cases chosen by the fixed research rule, not an audit.
          An unestablished finding means our sources could not confirm the tracker&apos;s label; it does not prove the label is wrong.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-slate-900">Observed outcomes by risk band</h2>
        <p className="mt-1 text-sm text-slate-600">
          These are stopped outcomes among pooled held-out predictions, not unique projects. {m.metrics.band_outcomes_oof.countBasis}
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-slate-200">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="p-3">Band</th><th className="p-3">Risk score</th><th className="p-3">Held-out predictions</th><th className="p-3">Stopped</th><th className="p-3">Stopped share</th><th className="p-3">Across-repeat range</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {(["green", "watch", "red"] as const).map((name) => {
                const outcome = m.metrics.band_outcomes_oof.bands[name];
                const ranges = outcome.repeatMin == null || outcome.repeatMax == null
                  ? "Not observed"
                  : `${(outcome.repeatMin * 100).toFixed(1)}–${(outcome.repeatMax * 100).toFixed(1)}%`;
                return (
                  <tr key={name}>
                    <td className="p-3 font-semibold capitalize">{name}</td>
                    <td className="p-3">{name === "green" ? "0–39" : name === "watch" ? "40–59" : "60–100"}</td>
                    <td className="p-3">{outcome.count.toLocaleString()}</td>
                    <td className="p-3">{outcome.stoppedCount.toLocaleString()}</td>
                    <td className="p-3">{outcome.rate == null ? "—" : `${(outcome.rate * 100).toFixed(1)}%`}</td>
                    <td className="p-3">{ranges}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Raw model scores perform worse than the base rate as probabilities (out-of-fold Brier score {m.metrics.brier_raw_oof.toFixed(3)} vs. {m.metrics.brier_base_rate_oof.toFixed(3)} for the base-rate guess).
        </p>
      </section>

      <section className="mt-10" aria-labelledby="recorded-cases">
        <h2 id="recorded-cases" className="scroll-mt-24 text-xl font-semibold text-slate-900">How the evidence rule behaved on recorded cases</h2>
        <p className="mt-2 max-w-4xl text-sm text-slate-600">
          Formal adverse approval votes or recommendations and enacted project moratoria raise the evidence level.
          Applications, proposed moratoria, opposition, and county or city ordinances are context only. Outcomes record what happened without raising the level.
          The model band stays unchanged and may be in-sample for training projects.
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-slate-200">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <caption className="sr-only">Retrospective project evidence, first recorded outcome and calendar-day lead</caption>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="p-3">Project / model band</th>
                <th scope="col" className="p-3">Reviewed records</th>
                <th scope="col" className="p-3">First raise published</th>
                <th scope="col" className="p-3">First recorded outcome</th>
                <th scope="col" className="p-3">Lead to outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {cases.map((row) => {
                const source = signals.find((signal) => signal.signal_id === row.outcome?.signalId);
                return (
                  <tr key={row.projectId} className="align-top">
                    <th scope="row" className="max-w-64 p-3 font-normal">
                      <Link href={`/sites/${row.projectId}#evidence-timeline`} className="font-semibold text-sky-800 underline">{row.name}</Link>
                      <div className="mt-2"><BandBadge band={row.modelBand} /></div>
                      <div className="mt-1 text-xs text-slate-500">Tracker reference: {row.trackerStatus.replaceAll("_", " ")}</div>
                    </th>
                    <td className="p-3">
                      <div>{row.directCount} project · {row.countyContextCount} county · {row.cityContextCount} city</div>
                      {row.cityContextCount > 0 && signals.filter((signal) => signal.scope === "city"
                        && signalAppliesTo(signal, row.projectId, {
                          county: row.county, state: row.state, city: row.city, inCityLimits: row.inCityLimits,
                        })).map((signal) => (
                        <div key={signal.signal_id} className="mt-1 text-xs text-slate-600">{signalScopeLabel(signal)} · context only</div>
                      ))}
                      {row.recordStatus === "area_context_only" && (
                        <div className="mt-1 text-xs text-slate-500">
                          {row.countyContextCount > 0 && row.cityContextCount > 0 ? "County and city context only"
                            : row.cityContextCount > 0 ? "City context only" : "County context only"}
                        </div>
                      )}
                    </td>
                    <td className="p-3">{row.firstRaiseDay
                      ? <Link className="text-sky-800 underline" href={`/sites/${row.projectId}?asof=${row.firstRaiseDay}#evidence-timeline`}>{row.firstRaiseDay}</Link>
                      : row.recordStatus === "area_context_only" ? "No project record" : "No raise recorded"}</td>
                    <td className="max-w-64 p-3">
                      {row.outcome ? <>
                        <div className="font-medium">{OUTCOME_LABELS[row.outcome.type]}</div>
                        {row.outcome.type !== "outcome_approved" && <div className="text-xs text-slate-500">Stop-type outcome recorded</div>}
                        <div className="mt-1">{row.outcome.day}</div>
                        <div className="text-xs text-slate-500">{row.outcome.basis === "event" ? "Event day" : "Publication day; event day unknown"} · source precision: {row.outcome.precision}</div>
                        {source && <a href={source.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sky-800 underline">{source.source_name}</a>}
                      </> : "No outcome record"}
                    </td>
                    <td className="max-w-48 p-3">{leadText(row)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-slate-700">
          {caseSummary.positiveLead} cases with positive lead · {caseSummary.noLead} with no lead (including outcomes with no raise) · {caseSummary.raiseWithoutRecordedStopOutcome} with a raise but no recorded stop-type outcome · {caseSummary.countyContextOnly} with county context only · {caseSummary.cityContextOnly} with city context only.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Lead compares the first raise&apos;s publication day with the first typed outcome&apos;s event day, or its publication day when the event day is unknown, in America/Chicago.
          Only strictly earlier days count; this is a calendar-day comparison, not a measured forecast horizon.
          Lead counts concern any typed outcome, including approvals; the raise-without-stop count is separate and can overlap.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Five additional projects were examined under a selection rule fixed before research: three stopped cases and their first two distinct nearest under-construction comparisons.
          All three stopped cases yielded usable records. The two comparisons yielded no records fitting the agreed types and are absent from this table.
          The table also includes the existing San Marcos case and two projects with Hays County context only.
          Athens has opposition but no qualifying project outcome; Sulphur Springs has a suspension but no qualifying raise.
          Diode appears because the Athens city-wide ordinance applies to its recorded inside-city-limits location; it was not researched and is not a comparison case.
          Of the four retrospectively researched stopped cases, two had a recorded qualifying raise before a stop-type outcome and two did not. Matrix has a stop-type outcome with no prior qualifying raise; Athens has no outcome record.
          City-wide context remains context under the evidence rule fixed before the research; treating an area-wide action as a project-specific warning after seeing these results would tune the rule to the outcome.
          These cases were assembled retrospectively. This is not a validation of the evidence rule, and missing records do not establish an absence of risk.
        </p>
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="text-xl font-semibold text-slate-900">What predicts a project getting stopped</h2>
          <ul className="mt-4 space-y-3">
            {coefs.map(([k, v]) => (
              <li key={k} className="text-sm">
                <div className="flex justify-between text-slate-700">
                  <span>{FEATURE_TEXT[k] ?? k}</span>
                  <span className={v > 0 ? "text-rose-700" : "text-emerald-700"}>{v > 0 ? "raises risk" : "lowers risk"}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full" style={{ width: `${maxAbs === 0 ? 0 : (Math.abs(v) / maxAbs) * 100}%`, background: v > 0 ? "#e11d48" : "#059669" }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">Standardized logistic regression coefficients. Trained {model.trained}.</p>
        </section>
        <section className="h-[380px] overflow-hidden rounded-2xl ring-1 ring-slate-200">
          <EvidenceMap
            points={all.map((s) => ({
              id: s.project_id, name: s.name, lat: s.lat, lng: s.lng,
              color: s.label === "stopped" ? "#e11d48" : s.label === "built" ? BAND_COLOR.green : "#94a3b8",
              text: "",
            }))}
          />
        </section>
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900">Projects the tracker lists as stopped</h2>
        <ul className="mt-4 divide-y divide-slate-200 rounded-2xl ring-1 ring-slate-200">
          {stopped.map((s) => (
            <li key={s.project_id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
              <BandBadge band={s.band} />
              <Link href={`/sites/${s.project_id}`} className="min-w-0 flex-1 font-medium text-slate-900 hover:underline">{s.name}</Link>
              <span className="text-slate-500">{s.county}</span>
              <span className="text-slate-500">Tracker label: {s.tracker_status.replaceAll("_", " ")}{s.stop_event_date ? ` · tracker date ${s.stop_event_date}` : ""}</span>
              {s.primary_source_url && (
                <a href={s.primary_source_url} target="_blank" rel="noreferrer" className="text-sky-700 underline">
                  {s.primary_source_name ?? "source"}
                </a>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">Badge = the model&apos;s score for that project (in-sample for training projects).</p>
      </section>
    </main>
  );
}

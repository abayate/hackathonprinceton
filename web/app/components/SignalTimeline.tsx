import { signalScopeLabel, type Timeline, type Signal } from "@/lib/signals";
import { displayScore } from "@/lib/model";
import BandBadge from "./BandBadge";
import type { HoldoutDemo } from "@/lib/modelCard";

const SIGNAL_LABEL: Record<Signal["signal_type"], string> = {
  approval_failed: "Approval failed",
  application_filed: "Application filed",
  moratorium_proposed: "Moratorium proposed",
  moratorium_enacted: "Moratorium enacted",
  ordinance_enacted: "Ordinance enacted",
  organized_opposition: "Organized opposition",
  outcome_denied: "Outcome: denied",
  outcome_approved: "Outcome: approved",
  outcome_suspended: "Outcome: suspended (may resume)",
  outcome_withdrawn: "Outcome: withdrawn",
};

function displayDate(value: string | null, precision: "minute" | "day" | "unknown"): string {
  if (!value || precision === "unknown") return "Date unknown";
  if (precision === "day") return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Chicago",
  }).format(date);
}

function effectLabel(effect: Signal["effect"]): string {
  if (effect === "raise") return "Raises evidence level one step under this rule";
  if (effect === "context") return "Context only; does not raise the evidence level";
  return "Outcome record; does not raise the evidence level";
}

export default function SignalTimeline({
  timeline,
  asOf,
  mw,
  holdoutDemo,
}: {
  timeline: Timeline;
  asOf?: string;
  mw: number;
  holdoutDemo?: HoldoutDemo | null;
}) {
  const hasKnownRaise = timeline.known.some((signal) => signal.effect === "raise");
  const evidenceRuleExplanation = !hasKnownRaise
    ? "No known raising signal; the evidence level matches the model band."
    : timeline.modelBand === null
      ? "A raising signal is known, but no model band is available to apply the evidence rule."
      : timeline.modelBand === "red"
        ? "A raising signal is known; the evidence rule is capped at High risk, so the level cannot move higher."
        : "Raised by evidence rule (our rule, not statistically validated).";
  const holdoutDisplayScore = holdoutDemo ? displayScore(holdoutDemo.score) : null;
  const modelLabel = holdoutDemo
    ? `Holdout score ${holdoutDisplayScore}/100 (trained without this project)`
    : "Stored model band";

  return (
    <section id="evidence-timeline" className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Evidence timeline</h2>
          <p className="mt-1 text-sm text-slate-600">Review dated source records and the simple evidence rule as of a selected date.</p>
        </div>
        <form method="get" className="flex items-end gap-2">
          <input type="hidden" name="mw" value={mw} />
          <label className="text-xs font-medium text-slate-600">
            Timeline as of
            <input name="asof" type="date" defaultValue={asOf ?? ""} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
          </label>
          <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white">Apply</button>
        </form>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{modelLabel}</p>
          <div className="mt-1"><BandBadge band={timeline.modelBand} /></div>
          {holdoutDemo && <p className="mt-2 text-xs text-slate-600">{holdoutDemo.name}; current feature snapshot, not a historical score.</p>}
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence level</p>
          <div className="mt-1"><BandBadge band={timeline.evidenceBand} /></div>
          <p className="mt-2 text-xs text-slate-600">
            {evidenceRuleExplanation}
          </p>
        </div>
      </div>

      {holdoutDemo && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
          This timeline uses the held-out example score to demonstrate the evidence rule. The stored risk score and delay exposure scenario above remain based on the project&apos;s stored model output.
        </p>
      )}

      {asOf ? (
        <p className="mt-3 text-xs text-slate-500">Showing {timeline.known.length} of {timeline.totalCount} records available by the end of {asOf} in America/Chicago (fixture records by publication date; session submissions by recorded date).</p>
      ) : (
        <p className="mt-3 text-xs text-slate-500">Showing all {timeline.totalCount} records currently in this dataset.</p>
      )}

      {timeline.laterCount > 0 && (
        <p className="mt-2 text-sm text-slate-600">{timeline.laterCount} later {timeline.laterCount === 1 ? "record is" : "records are"} hidden because {timeline.laterCount === 1 ? "its relevant publication or recorded date is" : "their relevant publication or recorded dates are"} after this date.</p>
      )}

      {timeline.known.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-600">
          No dated signals are recorded for this project in this dataset{asOf ? ` by ${asOf}` : ""}. That does not mean no relevant events occurred.
        </div>
      ) : (
        <ol className="mt-4 space-y-3">
          {timeline.known.map((signal) => (
            <li key={signal.signal_id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {signalScopeLabel(signal)}
                </span>
                <span className="font-semibold text-slate-900">
                  {signal.proposed_by === "investigator"
                    ? "Proposed by AI investigator; quote matched to page text; date and summary not verified: "
                    : signal.verification.method === "verbatim_match" ? "Submitter-selected type (unverified): " : ""}
                  {SIGNAL_LABEL[signal.signal_type]}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{effectLabel(signal.effect)}</span>
              </div>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
                <div><dt className="inline font-semibold">Event: </dt><dd className="inline">{displayDate(signal.event_at, signal.event_precision)}</dd></div>
                <div><dt className="inline font-semibold">Published: </dt><dd className="inline">{displayDate(signal.published_at, signal.published_precision)}</dd></div>
                <div><dt className="inline font-semibold">Check: </dt><dd className="inline">{signal.check_id.replaceAll("_", " ")}</dd></div>
                <div><dt className="inline font-semibold">{signal.verification.method === "verbatim_match" ? "Submitted: " : "Recorded: "}</dt><dd className="inline">{signal.recorded_at.slice(0, 10)}{signal.verification.method === "verbatim_match" ? " (this session)" : " (retrospective)"}</dd></div>
              </dl>
              <blockquote className="mt-3 border-l-2 border-slate-300 pl-3 text-sm italic text-slate-700">“{signal.quote}”</blockquote>
              <p className="mt-2 text-sm text-slate-600">
                {signal.proposed_by === "investigator"
                  ? "AI investigator summary (unverified): "
                  : signal.verification.method === "verbatim_match" ? "Submitter’s summary (unverified): " : ""}{signal.summary}
              </p>
              <p className="mt-2 text-xs text-slate-600">
                Verification: {signal.verification.method === "verbatim_match" ? "quote matched in extracted page text" : "manual review"} ({signal.verification.verified_at.slice(0, 10)}).
                {signal.verification.method === "verbatim_match" && <> <span className="font-semibold">Submitted in this session.</span></>}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {signal.verification.publication_date_basis === "investigator"
                  ? "Publication date proposed by the AI investigator, not verified."
                  : signal.verification.publication_date_basis === "submitter" ? "Publication date entered by submitter, not verified." : "Publication date based on the source page."}
              </p>
              <a className="mt-2 inline-block text-sm text-sky-700 underline" href={signal.source_url} target="_blank" rel="noreferrer">Source: {signal.source_name}</a>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Evidence rules only move the level up one step when a known signal is marked “raise”; context and outcome records do not raise it. This timeline never changes the static model score or band, the band&apos;s observed stopped share, or the dollar delay exposure scenario. Public fixture records were assembled retrospectively; verbatim-matched submissions are private to the submitting session. This is an illustration, not a historical backtest.
      </p>
    </section>
  );
}

import Link from "next/link";
import { signalScopeLabel, type ChangeEntry } from "@/lib/signals";
import BandBadge from "./BandBadge";

const SIGNAL_LABEL: Record<ChangeEntry["signal"]["signal_type"], string> = {
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

function dateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(date);
}

export default function ChangeFeed({ entries, since, mw, intakeEnabled = false }: { entries: ChangeEntry[]; since?: string; mw: number; intakeEnabled?: boolean }) {
  const replay = since !== undefined;
  return (
    <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">What changed</h2>
          {replay && <p className="mt-1 text-sm text-amber-900">Replay of retrospectively assembled records: what this feed would have shown after {since}. Not a live alert.</p>}
          {!replay && <p className="mt-1 text-sm text-slate-600">Newly recorded source signals for your saved projects.</p>}
          {intakeEnabled && <p className="mt-1 text-xs text-slate-600">Session submissions enter the live feed from their recorded date and are excluded from retrospective replay because their publication dates are unverified.</p>}
        </div>
        <form method="get" className="flex items-end gap-2">
          <input type="hidden" name="mw" value={mw} />
          <label className="text-xs font-medium text-slate-600">Replay after
            <input type="date" name="since" defaultValue={since ?? ""} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
          </label>
          <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white">Replay</button>
        </form>
      </div>

      {!entries.length ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-600">
          {replay ? `No records were published after ${since} for these saved projects.` : "No new records since you saved these sites. Try the replay date to review retrospectively assembled records."}
        </div>
      ) : (
        <ol className="mt-4 space-y-3">
          {entries.map((entry, index) => {
            const isListing = entry.entityId.startsWith("costar-");
            const entityHref = isListing
              ? `/listings/${encodeURIComponent(entry.entityId)}?mw=${mw}`
              : `/sites/${encodeURIComponent(entry.entityId)}?mw=${mw}&asof=${entry.timelineDay}`;
            return (
              <li key={`${entry.entityId}:${entry.signal.signal_id}:${index}`} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={entityHref} className="font-semibold text-slate-900 hover:underline">{entry.name}</Link>
                    <p className="mt-1 text-xs text-slate-500">{replay ? `Published ${entry.publicationDay}` : `Recorded ${dateTime(entry.signal.recorded_at)}`}</p>
                  </div>
                  {entry.transition && <div className="flex items-center gap-2 text-xs"><BandBadge band={entry.transition.from} /><span aria-hidden="true">→</span><BandBadge band={entry.transition.to} /><span className="text-slate-500">by evidence rule</span></div>}
                </div>
                <p className="mt-2 font-medium text-slate-900">
                  {entry.signal.proposed_by === "investigator"
                    ? "Proposed by AI investigator; quote matched to page text; date and summary not verified: "
                    : entry.signal.verification.method === "verbatim_match" ? "Submitter-selected type (unverified): " : ""}
                  {SIGNAL_LABEL[entry.signal.signal_type]}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-600">
                  {signalScopeLabel(entry.signal)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {entry.signal.proposed_by === "investigator"
                    ? "AI investigator summary (unverified): "
                    : entry.signal.verification.method === "verbatim_match" ? "Submitter’s summary (unverified): " : ""}{entry.signal.summary}
                </p>
                <blockquote className="mt-2 border-l-2 border-slate-300 pl-3 text-sm italic text-slate-700">“{entry.signal.quote}”</blockquote>
                <p className="mt-2 text-xs text-slate-600">
                  Verification: {entry.signal.verification.method === "verbatim_match" ? "quote matched in extracted page text" : "manual review"} ({entry.signal.verification.verified_at.slice(0, 10)}).
                  {entry.signal.verification.method === "verbatim_match" && <> <span className="font-semibold">Submitted in this session.</span></>}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {entry.signal.verification.publication_date_basis === "investigator"
                    ? "Publication date proposed by the AI investigator, not verified."
                    : entry.signal.verification.publication_date_basis === "submitter" ? "Publication date entered by submitter, not verified." : "Publication date based on the source page."}
                </p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <a className="text-sky-700 underline" href={entry.signal.source_url} target="_blank" rel="noreferrer">Source: {entry.signal.source_name}</a>
                  <Link className="text-sky-700 underline" href={entityHref}>{isListing ? "View listing" : `View timeline on ${entry.timelineDay}`}</Link>
                </div>
                {entry.signal.effect === "outcome" && <p className="mt-2 text-xs text-slate-500">Outcome record; it does not raise the evidence level.</p>}
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-4 text-xs text-slate-500">Changes describe recorded evidence only; they do not alter a project&apos;s model score, band share, or dollar scenario.</p>
    </section>
  );
}

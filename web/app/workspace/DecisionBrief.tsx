"use client";

import { economics, money } from "@/lib/model";
import type { BandRates, Candidate, WorkspaceState } from "@/lib/workspaceTypes";
import type { MonitorState, WatchedSource } from "@/lib/sourceMonitorTypes";
import { BriefSummary, DatedRecordSummary, DECISION_LABELS, ProjectLocation, STATUS_LABELS } from "./WorkspaceUI";
import { checkedDate } from "./SourcesPanel";

export default function DecisionBrief({ candidates, state, bandRates, visible, watched, snapshots }: { candidates: Candidate[]; state: WorkspaceState; bandRates: BandRates; visible: boolean; watched: WatchedSource[]; snapshots: MonitorState["snapshots"] }) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const fullUrl = (url: string) => url.startsWith("/") ? `${origin}${url}` : url;
  const sources = candidates.flatMap((candidate) => candidate.sources).filter((source, index, all) => all.findIndex((item) => item.url === source.url) === index);
  const sourceNumber = (url: string) => sources.findIndex((source) => source.url === url) + 1;

  return <section id="decision-brief" tabIndex={-1} className={`gw-decision-brief ${visible ? "gw-brief-visible" : ""}`} aria-label="Decision brief">
    <header className="gw-brief-header"><div><p className="gw-brief-brand">Groundwork</p><h2>Decision brief</h2><p>Last edited {new Date(state.updatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</p></div><button className="gw-button gw-primary gw-print-button" onClick={() => window.print()}>Print or save PDF</button></header>
    <BriefSummary brief={state.brief} />
    <div className="gw-brief-projects">{candidates.map((candidate) => {
      const tasks = state.tasks.filter((task) => task.projectId === candidate.id);
      const share = candidate.band ? bandRates[candidate.band] : null;
      const scenario = economics(share, state.brief.mw);
      return <article key={candidate.id} className="gw-brief-project"><header><div><h3>{candidate.name}</h3><p><ProjectLocation candidate={candidate} /></p></div><strong>{state.decisions[candidate.id] ? DECISION_LABELS[state.decisions[candidate.id]] : "Decision not recorded"}</strong></header>
        <p className="gw-brief-note">{state.notes[candidate.id] || "No rationale recorded yet."}</p>
        <dl className="gw-brief-facts"><div><dt>Reported project capacity</dt><dd>{candidate.capacityMw == null ? "Unknown" : `${candidate.capacityMw.toLocaleString()} MW`}</dd></div><div><dt>Land acreage</dt><dd>{candidate.landAcres == null ? "Unknown" : candidate.landAcres.toLocaleString()}</dd></div><div><dt>Dated evidence</dt><dd><DatedRecordSummary candidate={candidate} /></dd></div><div><dt>{state.brief.mw.toLocaleString()} MW delay scenario</dt><dd>{money(scenario.expectedDelayCost)}</dd></div></dl>
        <p className="gw-brief-scenario-note">{share == null ? "No cross-validation band estimate available." : `${(share * 100).toFixed(1)}% stopped share in the model’s cross-validation band; assumed 12-month delay and $170/kW/month.`} Reported capacity is total project capacity, not available utility power.</p>
        <h4>Screening checks</h4><ul className="gw-brief-checks">{candidate.checks.map((check) => <li key={check.id}><strong>{check.title}: {STATUS_LABELS[check.status]}</strong>{check.sources.some((source) => source.url && sourceNumber(source.url) > 0) && <span> [{check.sources.flatMap((source) => source.url && sourceNumber(source.url) > 0 ? sourceNumber(source.url) : []).join(", ")}]</span>}</li>)}</ul>
        <h4>Diligence tasks</h4><ul className="gw-brief-tasks">{tasks.map((task) => <li key={task.id}><span aria-hidden="true">{task.done ? "☑" : "☐"}</span><span>{task.text}{task.done ? " (marked complete by you)" : ""}</span></li>)}</ul>
        <p className="gw-brief-source-refs">Project sources: {candidate.sources.map((source) => `[${sourceNumber(source.url)}]`).join(" ")}</p>
        <div className="gw-brief-check-history"><h4>Sources last checked</h4>{watched.filter((source) => source.projectId === candidate.id).map((source) => {
          const snapshot = snapshots[source.id];
          return <p key={source.id}>{source.label}: {snapshot ? `${checkedDate(snapshot.lastCheckedAt)} — ${snapshot.lastOutcome === "ok" ? "read successfully" : snapshot.lastOutcome === "unreachable" ? "unreachable" : "not readable"}` : "Not checked"}{snapshot?.lastOutcome !== "ok" && snapshot?.lastOkAt ? `; last successful check ${checkedDate(snapshot.lastOkAt)}` : ""}.</p>;
        })}</div>
      </article>;
    })}</div>
    <section className="gw-brief-sources"><h3>Sources for follow-up</h3><ol>{sources.map((source) => <li key={source.url}><strong>{source.label}</strong><a href={source.url}>{fullUrl(source.url)}</a></li>)}</ol></section>
    <footer>Tracked proposals are not available land listings; locations may be approximate. This brief records screening evidence and your diligence plan, not a forecast or an investment recommendation.</footer>
  </section>;
}

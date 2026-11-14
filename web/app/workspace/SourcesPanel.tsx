"use client";

import type { WatchedSource } from "@/lib/sourceMonitorTypes";
import type { SourceMonitor } from "./useSourceMonitor";

export function checkedDate(value: string | null | undefined) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function sourceStatus(source: WatchedSource, monitor: SourceMonitor) {
  const snapshot = monitor.state.snapshots[source.id];
  const latest = monitor.latest[source.id];
  if (!snapshot) return "Not checked";
  if (snapshot.lastOutcome === "unreachable") return "Unreachable";
  if (snapshot.lastOutcome === "not_text") return "Not readable";
  if (snapshot.pending.length) return `${snapshot.pending.length} new text ${snapshot.pending.length === 1 ? "excerpt" : "excerpts"}`;
  if (latest?.status === "baseline") return "Baseline established";
  if (latest?.status === "new_text") return "New text reviewed";
  return "No new text to review";
}

export default function SourcesPanel({ projectId, sources, monitor }: { projectId: string; sources: WatchedSource[]; monitor: SourceMonitor }) {
  const checking = monitor.activeIds.includes(projectId);
  return <section className="gw-sources-panel" aria-label="Project source checks">
    <header><div><h4>Check the project’s sources</h4><p className="gw-help">Project pages and project-specific record sources. Area-wide datasets are excluded.</p></div><button className="gw-button" disabled={!monitor.ready || monitor.conflict || checking || !sources.length} onClick={() => void monitor.checkProject(projectId)}>{checking ? "Checking sources…" : "Check now"}</button></header>
    {monitor.messages[projectId] && <p className="gw-notice" role="status">{monitor.messages[projectId]}</p>}
    {!sources.length && <p className="gw-help">No project-scoped source pages are recorded for this proposal.</p>}
    <div className="gw-source-rows">{sources.map((source) => {
      const snapshot = monitor.state.snapshots[source.id];
      const latest = monitor.latest[source.id];
      const sample = latest?.readableCheck?.paragraphs.slice(0, 3) ?? [];
      const failed = snapshot && snapshot.lastOutcome !== "ok";
      const deferred = latest?.check.outcome === "ok" && snapshot
        ? latest.check.paragraphs.filter((paragraph) => !snapshot.seenHashes.includes(paragraph.hash)).length : 0;
      return <article className="gw-source-row" key={source.id}>
        <div className="gw-source-row-heading"><a href={source.url} target="_blank" rel="noreferrer">{source.label}<span className="gw-sr-only"> (opens in a new tab)</span></a><span className={failed ? "gw-source-outcome gw-source-failed" : "gw-source-outcome"}>{sourceStatus(source, monitor)}</span></div>
        <p className="gw-source-url">{source.url}</p>
        <dl className="gw-source-dates"><div><dt>Published in our record</dt><dd>{source.publishedAt ?? "Not recorded"}</dd></div><div><dt>Last checked</dt><dd>{checkedDate(snapshot?.lastCheckedAt)}</dd></div><div><dt>Latest text admitted for review</dt><dd>{checkedDate(snapshot?.lastChangedAt)}</dd></div></dl>
        {failed && <p className="gw-source-error">{snapshot.lastOutcome === "not_text" ? "This page did not return readable source paragraphs." : "This page could not be reached."} {snapshot.lastOkAt ? `Last successful check: ${checkedDate(snapshot.lastOkAt)}. Earlier history is kept.` : "No successful baseline yet."}</p>}
        {deferred > 0 && <p className="gw-notice" role="status">The inbox is full for this source. Earlier unread excerpts are kept. Review them, then check again to bring in more text.</p>}
        {!!sample.length && <details className="gw-source-sample"><summary>{failed ? "Last successful text" : latest?.status === "baseline" ? "Baseline text" : "Latest fetched text"}</summary><p className="gw-help">{failed ? `Earlier reading from ${checkedDate(latest?.readableCheck?.fetchedAt)}. The latest check did not return readable text.` : latest?.status === "baseline" ? "First successful reading. This establishes a baseline; these paragraphs are not a change alert." : "A sample from this successful check, separate from the review inbox."} Showing up to three excerpts.</p>{sample.map((paragraph) => <blockquote key={paragraph.hash}>{paragraph.text}</blockquote>)}</details>}
      </article>;
    })}</div>
  </section>;
}

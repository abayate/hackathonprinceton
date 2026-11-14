"use client";

import type { Candidate, DiligenceTask } from "@/lib/workspaceTypes";
import type { PendingText, WatchedSource } from "@/lib/sourceMonitorTypes";
import type { SourceMonitor } from "./useSourceMonitor";
import { checkedDate } from "./SourcesPanel";

export function sourceTaskId(source: WatchedSource, paragraph: PendingText) {
  return `${source.id}:source:${paragraph.hash}`;
}

export default function ReviewInbox({ candidates, watched, monitor, tasks, onAddTask, taskMessage }: { candidates: Candidate[]; watched: WatchedSource[]; monitor: SourceMonitor; tasks: DiligenceTask[]; onAddTask: (source: WatchedSource, paragraph: PendingText) => void; taskMessage: string }) {
  const selectedIds = new Set(candidates.map((candidate) => candidate.id));
  const pending = watched.filter((source) => selectedIds.has(source.projectId)).flatMap((source) => (monitor.state.snapshots[source.id]?.pending ?? []).map((paragraph) => ({ source, paragraph })));
  const busy = monitor.activeIds.length > 0;
  return <section className="gw-review-inbox" aria-labelledby="source-review-heading">
    <header><div><p className="gw-eyebrow">Keep an eye on the evidence</p><h3 id="source-review-heading">Source review</h3><p>Read new source text and turn a useful finding into a follow-up task.</p></div><button className="gw-button" onClick={() => void monitor.checkAll()} disabled={!monitor.ready || monitor.conflict || busy || !candidates.length}>{busy ? "Checking sources…" : "Check all selected"}</button></header>
    {monitor.storageMessage && <p className="gw-notice" role="alert">{monitor.storageMessage}</p>}
    {monitor.conflict && !monitor.storageMessage && <p className="gw-notice" role="alert">Source history changed in another tab. Reload this page before checking sources or adding passages as tasks.</p>}
    <p className="gw-inbox-state" aria-live="polite">{!monitor.ready ? "Opening saved source history…" : pending.length ? `${pending.length} ${pending.length === 1 ? "excerpt needs" : "excerpts need"} review` : "No new text waiting for review. A first successful check establishes a baseline."}</p>
    {taskMessage && <p className="gw-feedback" role="status">{taskMessage}</p>}
    <details className="gw-monitor-details"><summary><span>{pending.length ? `Read ${pending.length} new ${pending.length === 1 ? "excerpt" : "excerpts"}` : "Review activity & check settings"}</span><span>{monitor.state.autoRecheck ? "30-minute checks on" : "Manual checks"}</span></summary>
    <div className="gw-monitor-settings"><label><input type="checkbox" checked={monitor.state.autoRecheck} disabled={!monitor.ready || monitor.conflict} onChange={(event) => monitor.setAutoRecheck(event.target.checked)} /><span>Recheck every 30 minutes while this tab is open</span></label><p>Automatic checks pause while the tab is hidden. No background service or notifications.</p></div>
    <div className="gw-review-items">{pending.map(({ source, paragraph }) => {
      const candidate = candidates.find((candidate) => candidate.id === source.projectId);
      const added = tasks.some((task) => task.id === sourceTaskId(source, paragraph));
      return <article className="gw-review-item" key={`${source.id}:${paragraph.hash}`}>
        <div className="gw-review-item-heading"><div><strong>{candidate?.name}</strong><p>Source text changed · found {checkedDate(paragraph.foundAt)}</p></div><a href={source.url} target="_blank" rel="noreferrer">{source.label}<span className="gw-sr-only"> (opens in a new tab)</span></a></div>
        <blockquote>{paragraph.text}</blockquote>
        {!!paragraph.mentions.length && <p className="gw-literal-mentions">Literal mentions: {paragraph.mentions.join(", ")}</p>}
        <div className="gw-inline-actions"><button className="gw-button" disabled={monitor.conflict} onClick={() => monitor.markReviewed(source.id, paragraph.hash)}>Mark reviewed</button><button className="gw-text-button" onClick={() => onAddTask(source, paragraph)} disabled={added || monitor.conflict}>{added ? "Added to tasks" : "Add as task"}</button></div>
      </article>;
    })}</div>
    <p className="gw-monitor-limits">Keeps up to five pending excerpts per source, at most 600 characters each, using a bounded recent paragraph history. New text can include page edits or boilerplate; it does not change a screening check, model result or dollar scenario.</p>
    </details>
  </section>;
}

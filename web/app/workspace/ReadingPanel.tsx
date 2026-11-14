"use client";

import { useMemo, useState } from "react";
import { CHECK_TERMS, highlightPassage, passagesFor, type CheckId, type Passage } from "@/lib/sourceReading";
import { WORKSPACE_MAX_TASKS, type DiligenceTask } from "@/lib/workspaceTypes";
import type { PendingText, WatchedSource } from "@/lib/sourceMonitorTypes";
import type { SourceMonitor } from "./useSourceMonitor";
import { checkedDate } from "./SourcesPanel";
import { sourceTaskId } from "./ReviewInbox";

const TOPIC_LABELS: Record<CheckId, string> = {
  power: "Power", water: "Water", zoning: "Zoning and permits", opposition: "Community opposition",
  policy: "Policy and incentives", land: "Land and physical risk", labor: "Labor and construction",
};

function readingMessage(projectId: string, sources: WatchedSource[], monitor: SourceMonitor, readingCount: number, passageCount: number) {
  if (!monitor.ready) return "Opening source history…";
  if (!sources.length) return "No project source pages are recorded for this proposal.";
  if (monitor.activeIds.includes(projectId) && !readingCount) return "Checking the project’s sources. Readable passages will appear here when the check finishes.";
  if (!readingCount) {
    const snapshots = sources.map((source) => monitor.state.snapshots[source.id]).filter(Boolean);
    if (snapshots.some((snapshot) => snapshot.lastOutcome !== "ok")) return "No readable text is available in this visit. A recent source check failed or returned no readable text; see Sources for details and try Check now again.";
    if (snapshots.some((snapshot) => snapshot.lastOkAt)) return "Saved check history is available, but reading text only stays during the current visit. Use Check now to read the pages again.";
    return "Use Check now to read the project’s pages. The first successful baseline reading works here too.";
  }
  if (!passageCount) return "No passages contain these exact words in the available readings. A missing match is not a check result.";
  return `Reading ${readingCount} ${readingCount === 1 ? "source" : "sources"}. Open a topic to inspect its passages and turn a useful passage into a task.`;
}

function ReadingPassage({ passage, source, monitor, added, taskLimitReached, onAddTask }: { passage: Passage; source: WatchedSource; monitor: SourceMonitor; added: boolean; taskLimitReached: boolean; onAddTask: (source: WatchedSource, paragraph: PendingText) => void }) {
  const snapshot = monitor.state.snapshots[source.id];
  const previousReading = !!snapshot && snapshot.lastOutcome !== "ok";
  const pending: PendingText = { hash: passage.hash, text: passage.text, mentions: [], foundAt: passage.fetchedAt };
  return <article className="gw-reading-passage">
    <header><a href={source.url} target="_blank" rel="noreferrer">{source.label}<span className="gw-sr-only"> (opens in a new tab)</span></a><span>{previousReading ? "Previous reading" : "Reading"} from {checkedDate(passage.fetchedAt)}</span></header>
    {previousReading && <p className="gw-reading-previous">The latest check was {snapshot.lastOutcome === "unreachable" ? "unreachable" : "not readable"} at {checkedDate(snapshot.lastCheckedAt)}. This passage is from the earlier successful reading.</p>}
    <blockquote>{highlightPassage(passage.text, passage.terms).map((part, index) => part.matched ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>)}</blockquote>
    <div className="gw-reading-passage-footer"><p>Matched words: {passage.terms.join(", ")}</p><button type="button" className="gw-button" disabled={added || taskLimitReached || monitor.conflict} onClick={() => onAddTask(source, pending)}>{added ? "Added to tasks" : "Add as task"}</button></div>
  </article>;
}

export default function ReadingPanel({ projectId, sources, monitor, tasks, onAddTask }: { projectId: string; sources: WatchedSource[]; monitor: SourceMonitor; tasks: DiligenceTask[]; onAddTask: (source: WatchedSource, paragraph: PendingText) => void }) {
  const [activeTopic, setActiveTopic] = useState<CheckId>("power");
  const readableChecksFor = monitor.readableChecksFor;
  const readings = useMemo(() => readableChecksFor(projectId), [readableChecksFor, projectId]);
  const passages = useMemo(() => passagesFor(readings), [readings]);
  const taskIds = new Set(tasks.map((task) => task.id));
  const taskLimitReached = tasks.length >= WORKSPACE_MAX_TASKS;
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const failedSources = sources.filter((source) => {
    const snapshot = monitor.state.snapshots[source.id];
    return snapshot && snapshot.lastOutcome !== "ok";
  });
  const hasPreviousReading = readings.some((reading) => monitor.state.snapshots[reading.sourceId]?.lastOutcome !== "ok");

  return <section className="gw-reading-panel" aria-labelledby={`reading-heading-${projectId}`}>
    <header><div><h4 id={`reading-heading-${projectId}`}>What the sources say</h4><p>Passages containing these words. Not a finding, and not a check result.</p></div><button type="button" className="gw-button" disabled={!monitor.ready || monitor.conflict || monitor.activeIds.includes(projectId) || !sources.length} onClick={() => void monitor.checkProject(projectId)}>{monitor.activeIds.includes(projectId) ? "Checking sources…" : "Check now"}</button></header>
    {monitor.messages[projectId] && <p className="gw-notice" role="status">{monitor.messages[projectId]}</p>}
    <p className="gw-reading-state" aria-live="polite">{readingMessage(projectId, sources, monitor, readings.length, passages.length)}</p>
    {!!failedSources.length && <p className="gw-reading-caution" role="status">{failedSources.length} {failedSources.length === 1 ? "source did" : "sources did"} not return readable text on the latest attempt: {failedSources.map((source) => source.label).join(", ")}. Open Sources for details.</p>}
    {hasPreviousReading && <p className="gw-reading-caution">Some passages are from previous successful readings because a later check failed. Each passage shows the reading time.</p>}
    {monitor.conflict && <p className="gw-reading-caution" role="alert">Source history changed in another tab. Reload this page before adding passages as tasks.</p>}
    {taskLimitReached && <p className="gw-reading-caution" role="status">The workspace task limit has been reached. You can keep reading, but cannot add another task.</p>}
    <div className="gw-reading-layout">
    <nav className="gw-reading-nav" aria-label="Source reading topics"><span className="gw-eyebrow">Read by topic</span>{(Object.keys(CHECK_TERMS) as CheckId[]).map((checkId) => <button type="button" key={checkId} aria-pressed={activeTopic === checkId} aria-controls={`topic-${projectId}-${checkId}`} onClick={() => setActiveTopic(checkId)}><span>{TOPIC_LABELS[checkId]}</span><small>{passages.filter((passage) => passage.checkId === checkId && sourceMap.has(passage.sourceId)).length}<span className="gw-sr-only"> passages</span></small></button>)}</nav>
    <div className="gw-reading-topics">{(Object.keys(CHECK_TERMS) as CheckId[]).map((checkId) => {
      const group = passages.filter((passage) => passage.checkId === checkId && sourceMap.has(passage.sourceId));
      return <section className="gw-reading-topic" key={checkId} id={`topic-${projectId}-${checkId}`} aria-labelledby={`topic-heading-${projectId}-${checkId}`} hidden={activeTopic !== checkId}>
        <header><h5 className="gw-reading-topic-heading" id={`topic-heading-${projectId}-${checkId}`}><span>{TOPIC_LABELS[checkId]}</span><span>{group.length} {group.length === 1 ? "passage" : "passages"}</span></h5><p className="gw-reading-keywords">Words: {CHECK_TERMS[checkId].join(", ")}</p></header>
        {group.length ? group.map((passage) => {
          const source = sourceMap.get(passage.sourceId)!;
          const pending: PendingText = { hash: passage.hash, text: passage.text, mentions: [], foundAt: passage.fetchedAt };
          return <ReadingPassage key={`${passage.sourceId}:${passage.hash}`} passage={passage} source={source} monitor={monitor} added={taskIds.has(sourceTaskId(source, pending))} taskLimitReached={taskLimitReached} onAddTask={onAddTask} />;
        }) : <p className="gw-reading-no-match">{readings.length ? "No passages with these words in the fetched pages." : "No source reading is available yet."}</p>}
      </section>;
    })}</div></div>
    <p className="gw-reading-limits">Up to three passages per topic, drawn from the first 120 readable paragraphs per page, with excerpts capped at 600 characters. Matching is literal and ignores letter case. A passage may appear under more than one topic; adding it once creates one task. Readings stay in this visit only; added tasks follow the workspace’s browser-saving status.</p>
  </section>;
}

"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { WORKSPACE_MAX_TASKS, type Candidate, type Decision, type DiligenceTask, type WorkspaceState } from "@/lib/workspaceTypes";
import { DECISION_LABELS, ProjectLocation, SourceLinks } from "./WorkspaceUI";
import type { PendingText, WatchedSource } from "@/lib/sourceMonitorTypes";
import type { SourceMonitor } from "./useSourceMonitor";
import SourcesPanel from "./SourcesPanel";
import ReviewInbox from "./ReviewInbox";
import ReadingPanel from "./ReadingPanel";

function TaskRow({ task, onChange }: { task: DiligenceTask; onChange: (next: DiligenceTask) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.text);
  if (editing) return <li className="gw-task gw-task-edit"><label className="gw-field"><span>Edit diligence task</span><textarea rows={3} maxLength={500} value={draft} onChange={(event) => setDraft(event.target.value)} /></label><div className="gw-inline-actions"><button className="gw-button" onClick={() => { onChange({ ...task, text: draft.trim() }); setEditing(false); }} disabled={!draft.trim()}>Save task</button><button className="gw-text-button" onClick={() => { setDraft(task.text); setEditing(false); }}>Cancel</button></div></li>;
  return <li className={`gw-task ${task.done ? "gw-task-complete" : ""}`}><label><input type="checkbox" checked={task.done} onChange={(event) => onChange({ ...task, done: event.target.checked })} /><span>{task.text}{task.done && <small>Marked complete by you</small>}</span></label><button className="gw-text-button" onClick={() => { setDraft(task.text); setEditing(true); }} aria-label={`Edit task: ${task.text}`}>Edit</button></li>;
}

function ProjectDecision({ candidate, state, setState, watched, monitor, onAddSourceTask }: { candidate: Candidate; state: WorkspaceState; setState: Dispatch<SetStateAction<WorkspaceState>>; watched: WatchedSource[]; monitor: SourceMonitor; onAddSourceTask: (source: WatchedSource, paragraph: PendingText) => void }) {
  const [newTask, setNewTask] = useState("");
  const [view, setView] = useState<"plan" | "sources" | "reading">("plan");
  const projectTasks = state.tasks.filter((task) => task.projectId === candidate.id);
  const completed = projectTasks.filter((task) => task.done).length;
  const taskLimitReached = state.tasks.length >= WORKSPACE_MAX_TASKS;
  const projectSources = watched.filter((source) => source.projectId === candidate.id);

  function addTask() {
    if (!newTask.trim() || taskLimitReached) return;
    const task: DiligenceTask = { id: `${candidate.id}:user:${crypto.randomUUID()}`, projectId: candidate.id, checkId: null, text: newTask.trim(), origin: "user", done: false };
    setState((previous) => ({ ...previous, tasks: [...previous.tasks, task] }));
    setNewTask("");
  }

  return <article className="gw-decision-project">
    <header><div><p className="gw-project-location"><ProjectLocation candidate={candidate} /></p><h3>{candidate.name}</h3></div><span className="gw-task-count"><strong>{completed}<span>/{projectTasks.length}</span></strong> tasks complete</span></header>
    <nav className="gw-project-views" aria-label={`Views for ${candidate.name}`}>
      <button type="button" aria-pressed={view === "plan"} aria-controls={`plan-${candidate.id}`} onClick={() => setView("plan")}>Your plan</button>
      <button type="button" aria-pressed={view === "sources"} aria-controls={`sources-${candidate.id}`} onClick={() => setView("sources")}>Sources <span>{projectSources.length}</span></button>
      <button type="button" aria-pressed={view === "reading"} aria-controls={`reading-${candidate.id}`} onClick={() => setView("reading")}>Reading desk</button>
    </nav>
    <div id={`plan-${candidate.id}`} hidden={view !== "plan"}>
    <div className="gw-decision-grid"><div className="gw-decision-note">
      <fieldset><legend>Next move</legend><div className="gw-decision-options">{(Object.keys(DECISION_LABELS) as Decision[]).map((decision) => <label key={decision} className={state.decisions[candidate.id] === decision ? "gw-decision-chosen" : ""}><input type="radio" name={`decision-${candidate.id}`} value={decision} checked={state.decisions[candidate.id] === decision} onChange={() => setState((previous) => ({ ...previous, decisions: { ...previous.decisions, [candidate.id]: decision } }))} /><span>{DECISION_LABELS[decision]}</span></label>)}</div></fieldset>
      <label className="gw-field"><span>Your rationale</span><textarea rows={5} maxLength={4000} placeholder="What matters here? What would change your decision?" value={state.notes[candidate.id] ?? ""} onChange={(event) => setState((previous) => ({ ...previous, notes: { ...previous.notes, [candidate.id]: event.target.value } }))} /></label>
      <details className="gw-project-sources"><summary>Sources for follow-up</summary><SourceLinks sources={candidate.sources} /></details>
    </div><div className="gw-diligence-list"><h4>What needs an answer</h4><p className="gw-help">Generated from missing facts and screening checks. Edit these into the tasks your team needs.</p><ul>{projectTasks.map((task) => <TaskRow key={task.id} task={task} onChange={(next) => setState((previous) => ({ ...previous, tasks: previous.tasks.map((existing) => existing.id === next.id ? next : existing) }))} />)}</ul>
      <form className="gw-add-task" onSubmit={(event) => { event.preventDefault(); addTask(); }}><label className="gw-field"><span>Add your own task</span><input value={newTask} maxLength={500} placeholder="e.g. Ask the utility for connection timing" onChange={(event) => setNewTask(event.target.value)} /></label><button type="submit" className="gw-button" disabled={!newTask.trim() || taskLimitReached}>Add task</button></form>{taskLimitReached && <p className="gw-error">This workspace has reached its task limit. Existing tasks can still be edited.</p>}
    </div></div>
    </div>
    <div id={`sources-${candidate.id}`} hidden={view !== "sources"}><SourcesPanel projectId={candidate.id} sources={projectSources} monitor={monitor} /></div>
    <div id={`reading-${candidate.id}`} hidden={view !== "reading"}><ReadingPanel projectId={candidate.id} sources={projectSources} monitor={monitor} tasks={state.tasks} onAddTask={onAddSourceTask} /></div>
  </article>;
}

export default function DecideStep({ candidates, state, setState, onBack, onBrief, showBrief, watched, monitor, onAddSourceTask, taskMessage }: { candidates: Candidate[]; state: WorkspaceState; setState: Dispatch<SetStateAction<WorkspaceState>>; onBack: () => void; onBrief: () => void; showBrief: boolean; watched: WatchedSource[]; monitor: SourceMonitor; onAddSourceTask: (source: WatchedSource, paragraph: PendingText) => void; taskMessage: string }) {
  const [activeId, setActiveId] = useState(candidates[0]?.id ?? "");
  const visibleId = candidates.some((candidate) => candidate.id === activeId) ? activeId : candidates[0]?.id;
  return <section aria-labelledby="decide-title">
    <div className="gw-step-heading"><div><h2 id="decide-title">Leave with a plan</h2><p>Record your next move, capture the open questions, and prepare a brief for your team.</p></div><span className="gw-step-meta">Step 4 of 4</span></div>
    <p className="gw-context">Pursue means advance due diligence. Checking off a task records your progress; it does not change the evidence or screening status.</p>
    <ReviewInbox candidates={candidates} watched={watched} monitor={monitor} tasks={state.tasks} onAddTask={onAddSourceTask} taskMessage={taskMessage} />
    <div className="gw-decision-workbench">
      <nav className="gw-project-nav" aria-label="Projects in your diligence plan">
        <div className="gw-project-nav-heading"><span className="gw-eyebrow">Your shortlist</span><span>{candidates.length} projects</span></div>
        <div className="gw-project-nav-items">{candidates.map((candidate) => <button type="button" key={candidate.id} aria-pressed={visibleId === candidate.id} aria-controls={`project-plan-${candidate.id}`} onClick={() => setActiveId(candidate.id)}><span className="gw-project-nav-text"><strong>{candidate.name}</strong><span><ProjectLocation candidate={candidate} /></span><small>{state.decisions[candidate.id] ? DECISION_LABELS[state.decisions[candidate.id]] : "Choose a next move"}</small></span><span className="gw-project-nav-arrow" aria-hidden="true">›</span></button>)}</div>
        <p className="gw-project-nav-help">Work through one project at a time. Your notes and tasks stay with each proposal.</p>
      </nav>
      <div className="gw-decisions">{candidates.map((candidate) => <div key={candidate.id} id={`project-plan-${candidate.id}`} hidden={visibleId !== candidate.id}><ProjectDecision candidate={candidate} state={state} setState={setState} watched={watched} monitor={monitor} onAddSourceTask={onAddSourceTask} /></div>)}</div>
    </div>
    <div className="gw-step-actions"><button className="gw-button" onClick={onBack}>Back to comparison</button><button className="gw-button gw-primary" onClick={onBrief} aria-expanded={showBrief} aria-controls="decision-brief">{showBrief ? "Hide decision brief" : "Prepare decision brief"}</button></div>
  </section>;
}

"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { shortlist, tasksFor } from "@/lib/workspace";
import { WORKSPACE_MAX_TASKS, type BandRates, type Candidate, type WorkspaceBrief } from "@/lib/workspaceTypes";
import { useWorkspace } from "./useWorkspace";
import { useSourceMonitor } from "./useSourceMonitor";
import { sourceTaskId } from "./ReviewInbox";
import type { PendingText, WatchedSource } from "@/lib/sourceMonitorTypes";
import BriefStep from "./BriefStep";
import ShortlistStep from "./ShortlistStep";
import CompareStep from "./CompareStep";
import DecideStep from "./DecideStep";
import DecisionBrief from "./DecisionBrief";
import "./workspace.css";

const STEPS = ["Brief", "Shortlist", "Compare", "Decide"];
const STEP_DESCRIPTIONS = ["Set your search", "Choose proposals", "Read the evidence", "Plan the next move"];

export default function WorkspaceShell({ candidates, bandRates, watched }: { candidates: Candidate[]; bandRates: BandRates; watched: WatchedSource[] }) {
  const allowedIds = useMemo(() => candidates.map((candidate) => candidate.id), [candidates]);
  const { state, setState, ready, storageMessage, reset } = useWorkspace(allowedIds);
  const monitor = useSourceMonitor(candidates, watched, state.selectedIds);
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  const [taskMessage, setTaskMessage] = useState("");
  const stepHeading = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => shortlist(candidates, state.brief), [candidates, state.brief]);
  const selected = state.selectedIds.flatMap((id) => candidates.find((candidate) => candidate.id === id) ?? []);
  const canCompare = selected.length >= 2 && selected.length <= 4;

  function changeStep(next: number) {
    setStep(next);
    setShowBrief(false);
    requestAnimationFrame(() => {
      stepHeading.current?.focus({ preventScroll: true });
      stepHeading.current?.scrollIntoView({ block: "start", behavior: "instant" });
    });
  }

  function toggleBrief() {
    setShowBrief(!showBrief);
    if (!showBrief) requestAnimationFrame(() => {
      const brief = document.getElementById("decision-brief");
      brief?.focus({ preventScroll: true });
      brief?.scrollIntoView({ block: "start", behavior: "instant" });
    });
  }

  function applyBrief(brief: WorkspaceBrief) {
    const matchIds = new Set(shortlist(candidates, brief).map(({ candidate }) => candidate.id));
    const removed = state.selectedIds.filter((id) => !matchIds.has(id)).length;
    setState((previous) => ({ ...previous, brief, selectedIds: previous.selectedIds.filter((id) => matchIds.has(id)) }));
    setMessage(removed ? `${removed} ${removed === 1 ? "selection no longer matches" : "selections no longer match"} this brief and ${removed === 1 ? "was" : "were"} removed. Your notes, decisions and tasks are kept if you select ${removed === 1 ? "it" : "them"} again.` : "Brief applied. Choose two to four proposals to compare.");
    changeStep(1);
  }

  function toggleSelection(candidate: Candidate) {
    if (!state.selectedIds.includes(candidate.id) && state.selectedIds.length >= 4) {
      setMessage("Your comparison has four proposals. Remove one before adding another.");
      return;
    }
    const addedTasks = tasksFor(candidate).filter((task) => !state.tasks.some((existing) => existing.id === task.id));
    if (!state.selectedIds.includes(candidate.id) && state.tasks.length + addedTasks.length > WORKSPACE_MAX_TASKS) {
      setMessage("This workspace has reached its task limit, so this proposal was not added. Your existing selections and work are unchanged.");
      return;
    }
    setState((previous) => {
      if (previous.selectedIds.includes(candidate.id)) {
        return { ...previous, selectedIds: previous.selectedIds.filter((id) => id !== candidate.id) };
      }
      const existingIds = new Set(previous.tasks.map((task) => task.id));
      return { ...previous, selectedIds: [...previous.selectedIds, candidate.id], tasks: [...previous.tasks, ...tasksFor(candidate).filter((task) => !existingIds.has(task.id))] };
    });
    setMessage(state.selectedIds.includes(candidate.id) ? `${candidate.name} removed from comparison. Its notes and tasks are kept.` : `${candidate.name} added to comparison.`);
  }

  function startOver() {
    if (monitor.conflict) {
      setMessage("Source history changed in another tab. Reload this page before starting over so you can review the latest work.");
      return;
    }
    if (!reset()) {
      setMessage("The workspace could not be cleared from browser storage. Your current work is kept.");
      return;
    }
    const monitorCleared = monitor.reset();
    setConfirmReset(false);
    setTaskMessage("");
    setMessage(monitorCleared ? "Workspace and source history cleared. Start with a new brief." : "Workspace cleared, but source history could not be cleared from browser storage. That history is kept.");
    changeStep(0);
  }

  function addSourceTask(source: WatchedSource, paragraph: PendingText) {
    const id = sourceTaskId(source, paragraph);
    if (state.tasks.some((task) => task.id === id)) { setTaskMessage("This source excerpt is already in your tasks."); return; }
    if (state.tasks.length >= WORKSPACE_MAX_TASKS) { setTaskMessage("The workspace task limit has been reached. You can keep reading, but cannot add another task."); return; }
    const text = `Review source text from ${source.label.slice(0, 90)}: ${paragraph.text}`.slice(0, 500);
    setState((previous) => previous.tasks.some((task) => task.id === id) || previous.tasks.length >= WORKSPACE_MAX_TASKS ? previous : { ...previous, tasks: [...previous.tasks, { id, projectId: source.projectId, checkId: null, text, origin: "user", done: false }] });
    setTaskMessage(storageMessage ? "Task added in this tab. Browser storage needs attention, so it may not survive a reload. Source review status is unchanged." : "Task added. The source reading and review status are unchanged.");
  }

  return <main className="gw-workspace">
    <div className="gw-screen">
      <header className="gw-workspace-heading">
        <div><p className="gw-eyebrow">Public Texas project dataset</p><h1>Project research workspace</h1><p className="gw-heading-description">Compare tracked proposals, review public evidence, and plan your next diligence step.</p><p className="gw-heading-description"><Link href="/projects">Browse public projects</Link> · <Link href="/">Discover properties</Link></p></div>
        <div className="gw-session"><span className="gw-save-state">{!ready ? "Opening your workspace…" : storageMessage ? "Browser storage needs attention" : "Saved in this browser"}</span><button className="gw-text-button" onClick={() => setConfirmReset(!confirmReset)} disabled={!ready || !monitor.ready}>Start over</button></div>
      </header>
      {confirmReset && <div className="gw-reset" role="alert"><p>Clear this brief, selections, notes, tasks and source history from this browser?</p><div><button className="gw-button gw-danger" onClick={startOver}>Clear workspace</button><button className="gw-button" onClick={() => setConfirmReset(false)}>Keep my work</button></div></div>}
      <nav className="gw-steps" aria-label="Decision workspace steps">
        {STEPS.map((label, index) => <button key={label} onClick={() => changeStep(index)} aria-current={step === index ? "step" : undefined} disabled={!ready || (index >= 2 && !canCompare)}><span className="gw-step-number">0{index + 1}</span><span className="gw-step-label"><span>{label}</span><small>{STEP_DESCRIPTIONS[index]}</small></span><span className="gw-step-arrow" aria-hidden="true">→</span></button>)}
      </nav>
      <p className="gw-bounds">Explore {candidates.length} tracked Texas proposals. Locations may be approximate; these are not land listings. Use the evidence to plan diligence, not as a prediction of project success.</p>
      {storageMessage && <p className="gw-notice gw-notice-warning" role="alert">{storageMessage}</p>}
      {step !== 3 && monitor.storageMessage && <p className="gw-notice gw-notice-warning" role="alert">{monitor.storageMessage}</p>}
      <p className={`gw-feedback ${message ? "" : "gw-feedback-empty"}`} aria-live="polite">{message || "Your progress stays in this browser."}</p>
      <div ref={stepHeading} tabIndex={-1} className="gw-step-content">
        {!ready ? <div className="gw-loading" role="status">Loading your saved brief and notes…</div> : <>
          {step === 0 && <BriefStep key={JSON.stringify(state.brief)} candidates={candidates} brief={state.brief} onApply={applyBrief} />}
          {step === 1 && <ShortlistStep matches={matches} brief={state.brief} selectedIds={state.selectedIds} onToggle={toggleSelection} onEdit={() => changeStep(0)} onCompare={() => changeStep(2)} />}
          {step === 2 && <CompareStep candidates={selected} brief={state.brief} bandRates={bandRates} onBack={() => changeStep(1)} onNext={() => changeStep(3)} />}
          {step === 3 && <DecideStep candidates={selected} state={state} setState={setState} onBack={() => changeStep(2)} onBrief={toggleBrief} showBrief={showBrief} watched={watched} monitor={monitor} onAddSourceTask={addSourceTask} taskMessage={taskMessage} />}
        </>}
      </div>
    </div>
    {ready && selected.length > 0 && <DecisionBrief candidates={selected} state={state} bandRates={bandRates} visible={showBrief && step === 3} watched={watched} snapshots={monitor.state.snapshots} />}
  </main>;
}

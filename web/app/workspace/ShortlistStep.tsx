"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { displayScore } from "@/lib/model";
import type { Candidate, Shortlisted, WorkspaceBrief } from "@/lib/workspaceTypes";
import { BriefSummary, DatedRecordSummary, ProjectLocation } from "./WorkspaceUI";
import WorkspaceMap from "./WorkspaceMap";

function CriterionValue({ entry, brief }: { entry: Shortlisted; brief: WorkspaceBrief }) {
  if (entry.sortValue == null) return <span className="gw-muted">Criterion not known</span>;
  const candidate = entry.candidate;
  if (brief.criterion === "water_stress") return <>{candidate.waterStressLabel ?? `Basin stress ${candidate.waterStressScore}`}</>;
  if (brief.criterion === "model_index") return <>Model index {displayScore(candidate.pStopped)}/100</>;
  if (brief.criterion === "metro_distance") return <>{candidate.kmToMetro?.toFixed(0)} km from {brief.metro}</>;
  return <>{candidate.capacityMw?.toLocaleString()} MW reported project capacity</>;
}

export default function ShortlistStep({ matches, brief, selectedIds, onToggle, onEdit, onCompare }: { matches: Shortlisted[]; brief: WorkspaceBrief; selectedIds: string[]; onToggle: (candidate: Candidate) => void; onEdit: () => void; onCompare: () => void }) {
  const [focusedId, setFocusedId] = useState<string | null>(matches[0]?.candidate.id ?? null);
  const rows = useRef(new Map<string, HTMLElement>());
  const candidates = useMemo(() => matches.map(({ candidate }) => candidate), [matches]);
  const firstUnknown = matches.findIndex((entry) => entry.sortValue == null);
  const selected = candidates.filter((candidate) => selectedIds.includes(candidate.id));
  const focused = candidates.find((candidate) => candidate.id === focusedId);
  const compareReady = selectedIds.length >= 2 && selectedIds.length <= 4;

  function focusProject(id: string) {
    setFocusedId(id);
    rows.current.get(id)?.scrollIntoView({ behavior: "auto", block: "nearest" });
    rows.current.get(id)?.focus({ preventScroll: true });
  }

  return <section aria-labelledby="shortlist-title">
    <div className="gw-step-heading"><div><h2 id="shortlist-title">Build your comparison</h2><p>Choose two to four proposals. Read what puts each one here, and what still needs an answer.</p></div><button className="gw-button" onClick={onEdit}>Edit brief</button></div>
    <BriefSummary brief={brief} />
    {brief.criterion === "reported_mw" && <p className="gw-context">Reported MW describes total project capacity. It does not confirm spare power or a utility commitment.</p>}
    <div className="gw-shortlist-grid">
      <div className="gw-candidate-list">
        <div className="gw-list-heading"><strong>{matches.length} matching proposals</strong><span>Sorted by your criterion</span></div>
        {!matches.length && <div className="gw-empty"><h3>No proposals match this brief</h3><p>Try a different county, a wider area or another criterion. Your saved notes and tasks are still kept.</p><button className="gw-button" onClick={onEdit}>Adjust brief</button></div>}
        {matches.map((entry, index) => <div key={entry.candidate.id}>
          {index === firstUnknown && <div className="gw-data-divider"><strong>No data for this criterion</strong><span>These proposals need more information before they can be ordered.</span></div>}
          <article className={`gw-candidate ${selectedIds.includes(entry.candidate.id) ? "gw-candidate-selected" : ""} ${focusedId === entry.candidate.id ? "gw-candidate-focused" : ""}`} tabIndex={-1} ref={(element) => { if (element) rows.current.set(entry.candidate.id, element); else rows.current.delete(entry.candidate.id); }}>
            <div className="gw-candidate-top"><div><p className="gw-project-location"><ProjectLocation candidate={entry.candidate} /></p><h3>{entry.candidate.name}</h3>{entry.candidate.company && <p className="gw-company">{entry.candidate.company}</p>}</div><label className="gw-selection"><input type="checkbox" checked={selectedIds.includes(entry.candidate.id)} onChange={() => onToggle(entry.candidate)} aria-label={`Compare ${entry.candidate.name}`} /><span>{selectedIds.includes(entry.candidate.id) ? "Selected" : "Compare"}</span></label></div>
            <p className="gw-criterion-value"><CriterionValue entry={entry} brief={brief} /></p>
            <div className="gw-candidate-evidence"><div><h4>Why it’s here</h4><ul>{entry.included.map((reason) => <li key={reason}>{reason}</li>)}</ul></div><div><h4>Not known</h4>{entry.missing.length ? <ul>{entry.missing.map((missing) => <li key={missing}>{missing}</li>)}</ul> : <p>No missing fields in this screening.</p>}</div></div>
            <div className="gw-candidate-footer"><span><DatedRecordSummary candidate={entry.candidate} /></span><button className="gw-text-button" onClick={() => setFocusedId(entry.candidate.id)}>Locate on map</button><Link href={`/sites/${encodeURIComponent(entry.candidate.id)}?mw=${brief.mw}`} target="_blank">Open evidence<span className="gw-sr-only"> for {entry.candidate.name} in a new tab</span></Link></div>
          </article>
        </div>)}
      </div>
      <WorkspaceMap candidates={candidates} selectedId={focusedId} onSelect={focusProject} caption={focused?.name ?? "Select a location to find its proposal"} />
    </div>
    <div className="gw-selection-bar"><div><strong>{selectedIds.length} of 4 selected</strong><p>{selected.length ? selected.map((candidate) => candidate.name).join("; ") : "Add at least two proposals to compare their evidence."}</p></div><button className="gw-button gw-primary" disabled={!compareReady} onClick={onCompare}>Compare {selectedIds.length > 0 ? selectedIds.length : "proposals"}</button></div>
  </section>;
}

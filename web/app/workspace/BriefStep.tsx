"use client";

import { useMemo, useState } from "react";
import { CRITERION_LABELS, type Candidate, type Criterion, type WorkspaceBrief } from "@/lib/workspaceTypes";
import WorkspaceMap from "./WorkspaceMap";

export default function BriefStep({ candidates, brief, onApply }: { candidates: Candidate[]; brief: WorkspaceBrief; onApply: (brief: WorkspaceBrief) => void }) {
  const [locationType, setLocationType] = useState<"metro" | "county">(brief.county ? "county" : "metro");
  const [location, setLocation] = useState(brief.county ?? brief.metro ?? "");
  const [mw, setMw] = useState(String(brief.mw));
  const [criterion, setCriterion] = useState<Criterion>(brief.criterion);
  const values = useMemo(() => [...new Set(candidates.map((candidate) => locationType === "metro" ? candidate.nearestMetro : candidate.county))].filter(Boolean).sort(), [candidates, locationType]);
  const preview = candidates.filter((candidate) => !location || (locationType === "metro" ? candidate.nearestMetro : candidate.county) === location);
  const validMw = mw.trim() !== "" && Number.isFinite(Number(mw)) && Number(mw) >= 1 && Number(mw) <= 10000;
  const needsMetro = criterion === "metro_distance" && (locationType !== "metro" || !location);

  return <section aria-labelledby="brief-title">
    <div className="gw-step-heading"><div><h2 id="brief-title">Start with your brief</h2><p>A location, a working capacity and one way to order the evidence.</p></div><span className="gw-step-meta">Step 1 of 4</span></div>
    <div className="gw-brief-grid">
      <form className="gw-brief-form" onSubmit={(event) => { event.preventDefault(); if (validMw && !needsMetro) onApply({ metro: locationType === "metro" ? location || null : null, county: locationType === "county" ? location || null : null, mw: Number(mw), criterion }); }}>
        <p className="gw-eyebrow gw-form-eyebrow">Your search parameters</p>
        <fieldset><legend>Where are you looking?</legend><div className="gw-segmented">{(["metro", "county"] as const).map((value) => <button type="button" key={value} aria-pressed={value === locationType} onClick={() => { setLocationType(value); setLocation(""); }}>{value === "metro" ? "Nearest metro" : "County"}</button>)}</div>
          <label className="gw-field"><span>{locationType === "metro" ? "Nearest metro" : "County"}</span><select value={location} onChange={(event) => setLocation(event.target.value)}><option value="">All of Texas</option>{values.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <p className="gw-help">{locationType === "metro" ? "Groups proposals by their nearest metro, including projects outside the city." : "Uses the county recorded for each proposal."}</p>
        </fieldset>
        <label className="gw-field"><span>Working capacity <span className="gw-unit">MW</span></span><input type="number" min="1" max="10000" step="any" inputMode="decimal" value={mw} aria-invalid={!validMw} aria-describedby="mw-help" onChange={(event) => setMw(event.target.value)} /></label>
        <p id="mw-help" className={validMw ? "gw-help" : "gw-error"}>{validMw ? "Used for the dollar scenario. Only the reported-capacity criterion filters proposals by this target." : "Enter a capacity between 1 and 10,000 MW."}</p>
        <label className="gw-field"><span>What should come first?</span><select value={criterion} onChange={(event) => setCriterion(event.target.value as Criterion)}>{Object.entries(CRITERION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {needsMetro && <p className="gw-error" role="alert">Choose a nearest metro to compare distance, or choose another criterion.</p>}
        {criterion === "reported_mw" && <p className="gw-help">Reported MW is the total project capacity. It does not confirm spare power or a utility commitment.</p>}
        <p className="gw-help">One criterion at a time. Missing data is shown separately, so unknowns never look like a better result.</p>
        <div className="gw-form-bottom"><span>{preview.length} tracked proposals in this area</span><button className="gw-button gw-primary" type="submit" disabled={!validMw || needsMetro}>Build shortlist</button></div>
      </form>
      <WorkspaceMap candidates={preview} caption="Get oriented before choosing your shortlist" />
    </div>
  </section>;
}

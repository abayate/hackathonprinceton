"use client";

import Link from "next/link";
import { displayScore, economics, money } from "@/lib/model";
import type { BandRates, Candidate, WorkspaceBrief } from "@/lib/workspaceTypes";
import { tasksFor } from "@/lib/workspace";
import { BriefSummary, DatedRecordSummary, ProjectLocation, SourceLinks, StatusLabel } from "./WorkspaceUI";

export default function CompareStep({ candidates, brief, bandRates, onBack, onNext }: { candidates: Candidate[]; brief: WorkspaceBrief; bandRates: BandRates; onBack: () => void; onNext: () => void }) {
  const checks = candidates[0]?.checks ?? [];
  return <section aria-labelledby="compare-title">
    <div className="gw-step-heading"><div><h2 id="compare-title">Put the evidence side by side</h2><p>Seven screening checks, the source behind each one, and the questions to take forward.</p></div><span className="gw-step-meta">Step 3 of 4</span></div>
    <BriefSummary brief={brief} />
    <div className="gw-comparison-caption"><span className="gw-eyebrow">The comparison sheet</span><span>{candidates.length} proposals · Scroll across to read every column</span></div>
    <div className="gw-table-scroll" role="region" aria-label="Proposal comparison; scroll horizontally for all proposals" tabIndex={0}>
      <table className="gw-compare-table"><caption className="gw-sr-only">Comparison of selected tracked proposals</caption><thead><tr><th scope="col">Screening evidence</th>{candidates.map((candidate) => <th key={candidate.id} scope="col"><p className="gw-project-location"><ProjectLocation candidate={candidate} /></p><h3>{candidate.name}</h3><Link href={`/sites/${encodeURIComponent(candidate.id)}?mw=${brief.mw}`} target="_blank">Open project evidence<span className="gw-sr-only"> in a new tab</span></Link></th>)}</tr></thead>
        <tbody>
          <tr><th scope="row">Reported project capacity</th>{candidates.map((candidate) => <td key={candidate.id}><strong>{candidate.capacityMw == null ? "Unknown" : `${candidate.capacityMw.toLocaleString()} MW`}</strong><p className="gw-help">Total project capacity; utility capacity is unconfirmed.</p></td>)}</tr>
          {checks.map((check) => <tr key={check.id}><th scope="row">{check.title}</th>{candidates.map((candidate) => { const item = candidate.checks.find((item) => item.id === check.id); return <td key={candidate.id}>{item ? <><StatusLabel status={item.status} /><p className="gw-check-detail">{item.detail}</p><details className="gw-check-basis"><summary>Basis and sources</summary><p>{item.basis}</p><SourceLinks sources={item.sources} /></details></> : <StatusLabel status="unknown" />}</td>; })}</tr>)}
          <tr className="gw-scenario-row"><th scope="row">{brief.mw.toLocaleString()} MW scenario</th>{candidates.map((candidate) => { const share = candidate.band ? bandRates[candidate.band] : null; const scenario = economics(share, brief.mw); return <td key={candidate.id}><strong className="gw-scenario-value">{money(scenario.expectedDelayCost)}</strong><p>Delay exposure scenario</p><p className="gw-help">{scenario.expectedDelayMonths == null ? "No band outcome estimate." : `${scenario.expectedDelayMonths.toFixed(1)} weighted months from a 12-month delay assumption.`}</p><p className="gw-help">{share == null ? "Band share unknown" : `${(share * 100).toFixed(1)}% stopped in the model’s cross-validation band`}. {candidate.pStopped == null ? "Model index unavailable." : `Model index ${displayScore(candidate.pStopped)}/100.`}</p></td>; })}</tr>
          <tr><th scope="row">Dated evidence</th>{candidates.map((candidate) => <td key={candidate.id}><strong><DatedRecordSummary candidate={candidate} /></strong>{candidate.datedRecords.map((record, index) => <div className="gw-dated-record" key={`${record.url}-${index}`}><p className="gw-help">{record.scope === "project" ? "Project record" : `${record.scope === "county" ? "County" : "City"} context`} · {record.publishedAt}</p><p>{record.summary}</p><SourceLinks sources={[record]} /></div>)}</td>)}</tr>
          <tr><th scope="row">Questions to take forward</th>{candidates.map((candidate) => <td key={candidate.id}><ul className="gw-open-questions">{tasksFor(candidate).map((task) => <li key={task.id}>{task.text}</li>)}</ul></td>)}</tr>
        </tbody>
      </table>
    </div>
    <p className="gw-context">The dollar scenario uses an observed stopped share for a model band, $170/kW/month and an assumed 12-month delay. It is not a forecast for an individual proposal. <Link href="/evidence" target="_blank">Read the model and assumptions</Link>.</p>
    <div className="gw-step-actions"><button className="gw-button" onClick={onBack}>Back to shortlist</button><button className="gw-button gw-primary" onClick={onNext} disabled={candidates.length < 2}>Make a diligence plan</button></div>
  </section>;
}

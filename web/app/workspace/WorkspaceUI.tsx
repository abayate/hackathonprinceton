import type { CheckStatus } from "@/lib/checks";
import type { Candidate, WorkspaceBrief } from "@/lib/workspaceTypes";
import { CRITERION_LABELS } from "@/lib/workspaceTypes";

export const STATUS_LABELS: Record<CheckStatus, string> = { pass: "Pass", watch: "Watch", fail: "Fail", unknown: "Unknown" };
export const DECISION_LABELS = { pursue: "Pursue diligence", hold: "Hold", drop: "Drop from shortlist" };

function countyLabel(county: string) {
  const name = county.trim();
  return /\bcounty$/i.test(name) ? name : `${name} County`;
}

export function StatusLabel({ status }: { status: CheckStatus }) {
  return <span className={`gw-status gw-status-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function SourceLinks({ sources }: { sources: { label: string; url?: string }[] }) {
  if (!sources.length) return <span className="gw-muted">No source linked</span>;
  return <ul className="gw-source-links">{sources.map((source, index) => <li key={`${source.url}-${index}`}>{source.url && /^(https?:\/\/|\/(?!\/))/.test(source.url) ? <a href={source.url} target="_blank" rel="noreferrer">{source.label}<span className="gw-sr-only"> (opens in a new tab)</span></a> : <span>{source.label}</span>}</li>)}</ul>;
}

export function BriefSummary({ brief }: { brief: WorkspaceBrief }) {
  return <div className="gw-brief-summary" aria-label="Current brief"><span><small>Area</small>{brief.metro ? `Nearest metro: ${brief.metro}` : brief.county ? countyLabel(brief.county) : "All Texas"}</span><span><small>Working scenario</small>{brief.mw.toLocaleString()} MW</span><span><small>Ordered by</small>{CRITERION_LABELS[brief.criterion]}</span></div>;
}

export function ProjectLocation({ candidate }: { candidate: Candidate }) {
  // Remove the Census designation, preserving proper names such as Texas City.
  const city = candidate.city?.trim().replace(/ city$/, "");
  return <>{city ? `${city}, ` : ""}{countyLabel(candidate.county)}</>;
}

export function DatedRecordSummary({ candidate }: { candidate: Candidate }) {
  const counts = (["project", "county", "city"] as const).map((scope) => ({ scope, count: candidate.datedRecords.filter((record) => record.scope === scope).length })).filter(({ count }) => count > 0);
  if (!counts.length) return <>No dated records</>;
  return <>{counts.map(({ scope, count }) => `${count} ${scope === "project" ? `project ${count === 1 ? "record" : "records"}` : `${scope} context ${count === 1 ? "record" : "records"}`}`).join(", ")}</>;
}

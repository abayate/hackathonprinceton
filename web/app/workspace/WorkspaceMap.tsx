"use client";

import dynamic from "next/dynamic";
import type { Candidate } from "@/lib/workspaceTypes";

const SpatialMap = dynamic(() => import("./SpatialMap"), { ssr: false, loading: () => <div className="gw-map-loading">Loading project locations…</div> });

export default function WorkspaceMap({ candidates, selectedId, onSelect, caption }: { candidates: Candidate[]; selectedId?: string | null; onSelect?: (id: string) => void; caption: string }) {
  return <aside className="gw-map-panel" aria-label="Project location map">
    <div className="gw-map-heading"><span>Texas project map</span><span className="gw-map-count">{candidates.length} proposals</span></div>
    <div className="gw-map-canvas">{candidates.length ? <SpatialMap candidates={candidates} selectedId={selectedId} onSelect={onSelect} /> : <div className="gw-map-loading">No matching locations to display</div>}</div>
    <div className="gw-map-caption"><strong>{caption}</strong><p>Project locations are approximate, not verified parcel boundaries.</p></div>
  </aside>;
}

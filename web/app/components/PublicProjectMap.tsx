"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Site } from "@/lib/sites";
import { buildMapPins, getAvailableMapPinId } from "@/lib/mapPins";
import { displayScore } from "@/lib/model";
import BandBadge from "./BandBadge";
import HeartButton from "./HeartButton";

const PinMap = dynamic(() => import("./PinMap"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-slate-500">Loading map…</div>,
});

export default function PublicProjectMap({ projects, savedIds, signalCounts }: { projects: Site[]; savedIds: string[]; signalCounts: Record<string, number> }) {
  const pins = useMemo(() => buildMapPins(projects), [projects]);
  const pinIds = useMemo(() => new Set(pins.map((pin) => pin.id)), [pins]);
  const [selectedId, setSelectedId] = useState<string | null>(() => pins[0]?.id ?? null);
  const cardNodes = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => {
    setSelectedId((current) => getAvailableMapPinId(current, pins));
  }, [pins]);

  function selectProject(id: string) {
    if (!pinIds.has(id)) return;
    setSelectedId(id);
    cardNodes.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="max-h-[70vh] overflow-y-auto pr-1">
        {!projects.length ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">No tracked projects match these filters.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {projects.map((project) => {
              const selected = pinIds.has(project.project_id) && selectedId === project.project_id;
              const hasPin = pinIds.has(project.project_id);
              const score = displayScore(project.p_stopped);
              return (
                <li
                  key={project.project_id}
                  ref={(node) => {
                    if (node) cardNodes.current.set(project.project_id, node);
                    else cardNodes.current.delete(project.project_id);
                  }}
                  className={`rounded-xl bg-white p-4 ring-1 ring-offset-2 transition ${selected ? "ring-2 ring-slate-900" : "ring-slate-200"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/sites/${project.project_id}`} className="font-semibold text-slate-900 hover:underline">{project.name}</Link>
                    <HeartButton projectId={project.project_id} saved={savedIds.includes(project.project_id)} />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{project.city ? `${project.city}, ` : ""}{project.county}, Texas</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <BandBadge band={project.band} />
                    <span className="text-xs text-slate-600">{score === null ? "Unscored" : `Risk score ${score}/100`}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Tracker label: {project.label === "unlabeled" ? "Proposed" : project.label}</p>
                  {(signalCounts[project.project_id] ?? 0) > 0 && (
                    <Link className="mt-2 inline-block text-xs font-medium text-sky-700 underline" href={`/sites/${encodeURIComponent(project.project_id)}#evidence-timeline`}>
                      {signalCounts[project.project_id]} dated {signalCounts[project.project_id] === 1 ? "record" : "records"} · view timeline
                    </Link>
                  )}
                  {hasPin ? (
                    <button
                      type="button"
                      aria-pressed={selected}
                      aria-label={`Select ${project.name} on map`}
                      onClick={() => selectProject(project.project_id)}
                      className={`mt-3 rounded-lg px-3 py-1.5 text-xs font-semibold ${selected ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                    >
                      {selected ? "Selected on map" : "Select on map"}
                    </button>
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">No valid map coordinates</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div>
        <p className="mb-2 text-xs text-slate-500" aria-live="polite">
          Map covers {pins.length} of {projects.length} projects with valid coordinates.
        </p>
        <div className="relative h-[55vh] min-h-[360px] overflow-hidden rounded-2xl shadow-sm ring-1 ring-slate-200 lg:sticky lg:top-20 lg:h-[calc(100vh-10rem)]">
          <PinMap pins={pins} selectedId={selectedId} onSelect={selectProject} />
        </div>
      </div>
    </div>
  );
}

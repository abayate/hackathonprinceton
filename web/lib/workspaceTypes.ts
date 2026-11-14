import type { Check } from "./checks";
import type { Band } from "./model";

export type Criterion = "water_stress" | "model_index" | "metro_distance" | "reported_mw";
export type WorkspaceBrief = { metro: string | null; county: string | null; mw: number; criterion: Criterion };
export type Candidate = {
  id: string; name: string; company: string | null; city: string | null; county: string;
  nearestMetro: string; kmToMetro: number | null; capacityMw: number | null; landAcres: number | null;
  waterStressScore: number | null; waterStressLabel: string | null;
  pStopped: number | null; band: Band | null; locationReliable: boolean;
  lat: number; lng: number; coordPrecision: string; trackerStatus: string;
  checks: Check[]; recordCount: number; sources: { label: string; url: string }[];
  datedRecords: { scope: "project" | "county" | "city"; label: string; url: string; publishedAt: string; summary: string }[];
};
export type Shortlisted = { candidate: Candidate; included: string[]; missing: string[]; sortValue: number | null };
export type DiligenceTask = {
  id: string; projectId: string; checkId: string | null; text: string;
  origin: "unknown_check" | "missing_field" | "dated_record" | "user"; done: boolean;
};
export type Decision = "pursue" | "hold" | "drop";
export type WorkspaceState = {
  version: 1; brief: WorkspaceBrief; selectedIds: string[];
  decisions: Record<string, Decision>; notes: Record<string, string>;
  tasks: DiligenceTask[]; updatedAt: string;
};
export type BandRates = Record<Band, number | null>;
export const WORKSPACE_MAX_TASKS = 2000;
export const DEFAULT_BRIEF: WorkspaceBrief = { metro: null, county: null, mw: 100, criterion: "water_stress" };
export const CRITERION_LABELS: Record<Criterion, string> = {
  water_stress: "Lowest basin water stress",
  model_index: "Lowest model index",
  metro_distance: "Nearest to selected metro",
  reported_mw: "Reported project capacity meeting target",
};
export function emptyWorkspace(): WorkspaceState {
  return { version: 1, brief: { ...DEFAULT_BRIEF }, selectedIds: [], decisions: {}, notes: {}, tasks: [], updatedAt: new Date().toISOString() };
}

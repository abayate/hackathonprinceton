import "server-only";
import { cache } from "react";
import fs from "node:fs";
import path from "node:path";
import { parseAsOf } from "./params";

export type ReviewFinding = "consistent" | "differs" | "not_established";
export type LabelReview = {
  project_id: string;
  tracker_status: string;
  tracker_stop_date: string;
  kind_finding: ReviewFinding;
  date_finding: ReviewFinding;
  note: string;
  signal_ids: string[];
  source_ids: string[];
};
export type LabelReviewSummary = { reviewed: number; consistentKind: number; consistentDate: number };

const FIELDS = ["project_id", "tracker_status", "tracker_stop_date", "kind_finding", "date_finding",
  "note", "signal_ids", "source_ids"] as const;
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SOURCE_ID = /^R\d{2}$/;
const FINDINGS = new Set<ReviewFinding>(["consistent", "differs", "not_established"]);

function ids(value: unknown, pattern: RegExp): string[] {
  if (!Array.isArray(value) || value.length > 20 || value.some((id) => typeof id !== "string" || !pattern.test(id))
    || new Set(value).size !== value.length) throw new Error("Invalid label review citations");
  return [...value];
}

function parseRow(value: unknown): LabelReview {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid label review entry");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== FIELDS.length || FIELDS.some((field) => !Object.hasOwn(row, field)))
    throw new Error("Invalid label review fields");
  if (typeof row.project_id !== "string" || !UUID.test(row.project_id)
    || typeof row.tracker_status !== "string" || !/^[a-z][a-z_]{0,39}$/.test(row.tracker_status)
    || typeof row.tracker_stop_date !== "string" || parseAsOf(row.tracker_stop_date) !== row.tracker_stop_date
    || !FINDINGS.has(row.kind_finding as ReviewFinding) || !FINDINGS.has(row.date_finding as ReviewFinding)
    || typeof row.note !== "string" || row.note.length < 30 || row.note.length > 500
    || row.note.trim() !== row.note || /[\r\n\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(row.note)
    || !/[.!?]$/.test(row.note)) throw new Error("Invalid label review entry");
  const signalIds = ids(row.signal_ids, SLUG);
  const sourceIds = ids(row.source_ids, SOURCE_ID);
  if (!signalIds.length && !sourceIds.length) throw new Error("Invalid label review citations");
  return {
    project_id: row.project_id, tracker_status: row.tracker_status, tracker_stop_date: row.tracker_stop_date,
    kind_finding: row.kind_finding as ReviewFinding, date_finding: row.date_finding as ReviewFinding,
    note: row.note, signal_ids: signalIds, source_ids: sourceIds,
  };
}

/** Validate the public, retrospective spot-check fixture without reading external state. */
export function parseLabelReviews(value: unknown): LabelReview[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Invalid label review list");
  const reviews = value.map(parseRow);
  if (new Set(reviews.map((review) => review.project_id)).size !== reviews.length)
    throw new Error("Duplicate label review project");
  return reviews;
}

export function summarizeLabelReviews(reviews: readonly LabelReview[]): LabelReviewSummary {
  return {
    reviewed: reviews.length,
    consistentKind: reviews.filter((review) => review.kind_finding === "consistent").length,
    consistentDate: reviews.filter((review) => review.date_finding === "consistent").length,
  };
}

/** Read the checked-in spot check for public project pages; never exposes a local path in errors. */
export const getLabelReviews = cache(async (): Promise<LabelReview[]> => {
  try {
    const file = path.resolve(process.cwd(), "..", "data", "signals", "label_review.json");
    return parseLabelReviews(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    throw new Error("Unable to load label reviews");
  }
});

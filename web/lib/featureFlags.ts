import "server-only";

/** A missing or misspelled flag never enables server-side URL fetching. */
export function isEvidenceIntakeEnabled(): boolean {
  return process.env.ENABLE_EVIDENCE_INTAKE === "true";
}

export function isInvestigatorEnabled(): boolean {
  return process.env.ENABLE_INVESTIGATOR === "true";
}

/** Groundwork property memos (POST /api/properties/[id]/investigate). Off unless exactly true. */
export function isPropertyInvestigatorEnabled(): boolean {
  return process.env.ENABLE_PROPERTY_INVESTIGATOR === "true";
}

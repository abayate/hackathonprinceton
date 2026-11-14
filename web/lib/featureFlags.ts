import "server-only";

/** A missing or misspelled flag never enables server-side URL fetching. */
export function isEvidenceIntakeEnabled(): boolean {
  return process.env.ENABLE_EVIDENCE_INTAKE === "true";
}

export function isInvestigatorEnabled(): boolean {
  return process.env.ENABLE_INVESTIGATOR === "true";
}

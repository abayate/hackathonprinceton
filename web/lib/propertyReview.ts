/** Property reviews are separate from tracked-project evidence and model outputs. */
export const PROPERTY_REVIEW_NOTE_LIMIT = 4_000;
export const PROPERTY_DECISIONS = {
  unreviewed: "Not decided",
  investigate: "Continue diligence",
  hold: "On hold",
  pass: "Pass for now",
} as const;

export const PROPERTY_DILIGENCE_TASKS = [
  { id: "price", title: "Price and availability", action: "Confirm the asking price, sale terms and availability with the owner or broker." },
  { id: "power", title: "Utility capacity", action: "Request a utility capacity letter, connection date and service upgrade cost for your target load." },
  { id: "water", title: "Water and cooling", action: "Confirm the water allocation and a cooling design that fits local supply constraints." },
  { id: "zoning", title: "Use and permits", action: "Confirm data-center use, required approvals and the permitting timeline with the local authority." },
  { id: "opposition", title: "Community context", action: "Review nearby homes and local reporting; establish whether any concerns actually apply to this property." },
  { id: "policy", title: "Policy and incentives", action: "Check current restrictions and eligibility for incentives with the relevant authority." },
  { id: "land", title: "Physical feasibility", action: "Obtain parcel boundaries, flood and terrain assessments, access and a layout for the target capacity." },
  { id: "labor", title: "Build and operating costs", action: "Request engineering, construction and operating estimates before setting an acquisition price ceiling." },
] as const;

export type PropertyReview = {
  version: 1;
  propertyId: string;
  decision: keyof typeof PROPERTY_DECISIONS;
  notes: string;
  reviewed: string[];
};
type Store = Pick<Storage, "getItem" | "setItem">;
type LoadedReview = { status: "ready" | "invalid" | "unavailable"; review: PropertyReview | null; raw: string | null };
type SavedReview = { ok: true; raw: string } | { ok: false; reason: "conflict" | "unavailable" | "invalid" };

export function propertyReviewKey(id: string): string { return `groundwork.property.v1:${id}`; }
export function emptyPropertyReview(propertyId: string): PropertyReview {
  return { version: 1, propertyId, decision: "unreviewed", notes: "", reviewed: [] };
}

function isPropertyId(id: string): boolean { return /^costar-[A-Za-z0-9_-]{1,80}$/.test(id); }

function validReview(input: unknown, id: string): input is PropertyReview {
  if (!isPropertyId(id) || !input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  return value.version === 1 && value.propertyId === id
    && typeof value.decision === "string" && Object.hasOwn(PROPERTY_DECISIONS, value.decision)
    && typeof value.notes === "string" && value.notes.length <= PROPERTY_REVIEW_NOTE_LIMIT
    && Array.isArray(value.reviewed) && value.reviewed.length <= PROPERTY_DILIGENCE_TASKS.length
    && new Set(value.reviewed).size === value.reviewed.length
    && value.reviewed.every((task) => typeof task === "string" && PROPERTY_DILIGENCE_TASKS.some(({ id: taskId }) => taskId === task));
}

function parseReview(raw: string | null, id: string): PropertyReview | null {
  if (!isPropertyId(id)) return null;
  if (raw === null) return emptyPropertyReview(id);
  if (raw.length > 30_000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!validReview(value, id)) return null;
    return { version: 1, propertyId: id, decision: value.decision, notes: value.notes, reviewed: [...value.reviewed] };
  } catch { return null; }
}

export function loadPropertyReview(storage: Store, id: string): LoadedReview {
  try {
    const raw = storage.getItem(propertyReviewKey(id));
    const review = parseReview(raw, id);
    return { status: review ? "ready" : "invalid", review, raw };
  } catch { return { status: "unavailable", review: null, raw: null }; }
}

/** Best-effort conflict check; localStorage does not offer atomic transactions across tabs. */
export function savePropertyReview(storage: Store, id: string, expectedRaw: string | null, input: unknown): SavedReview {
  if (!validReview(input, id)) return { ok: false, reason: "invalid" };
  try {
    const current = storage.getItem(propertyReviewKey(id));
    if (current !== expectedRaw) return { ok: false, reason: "conflict" };
    if (!parseReview(current, id)) return { ok: false, reason: "invalid" };
    const raw = JSON.stringify({ version: 1, propertyId: id, decision: input.decision, notes: input.notes, reviewed: [...input.reviewed] });
    storage.setItem(propertyReviewKey(id), raw);
    return { ok: true, raw };
  } catch { return { ok: false, reason: "unavailable" }; }
}

export function askingPricePerAcre(price: number | null, acres: number | null): number | null {
  if (price === null || acres === null || !Number.isFinite(price) || !Number.isFinite(acres) || price <= 0 || acres <= 0) return null;
  const result = price / acres;
  return Number.isFinite(result) ? result : null;
}

/** Server-side validation for PUT /api/properties/[id]/review, using the same rules as local saves. */
export function isPropertyReview(input: unknown, id: string): input is PropertyReview { return validReview(input, id); }

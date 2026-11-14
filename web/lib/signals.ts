import { band, type Band } from "./model";
import type { HoldoutDemo } from "./modelCard";
import { parseAsOf } from "./params";

const CHECKS = ["power", "water", "zoning", "opposition", "policy", "land", "labor"] as const;
const TYPES = ["approval_failed", "application_filed", "moratorium_proposed", "moratorium_enacted", "organized_opposition",
  "ordinance_enacted", "outcome_denied", "outcome_approved", "outcome_suspended", "outcome_withdrawn"] as const;
const EFFECTS = ["raise", "context", "outcome"] as const;
type Precision = "minute" | "day";

type SignalFields = {
  signal_id: string;
  check_id: typeof CHECKS[number];
  signal_type: typeof TYPES[number];
  effect: typeof EFFECTS[number];
  event_at: string | null;
  event_precision: Precision | "unknown";
  published_at: string;
  published_precision: Precision;
  recorded_at: string;
  source_name: string;
  source_url: string;
  quote: string;
  summary: string;
  proposed_by?: "visitor" | "investigator";
  verification: {
    method: "manual_review" | "verbatim_match";
    verified_at: string;
    publication_date_basis: "source_page" | "submitter" | "investigator";
  };
};

export type Signal = SignalFields & (
  | { scope: "project"; entity_id: string; city?: never; county?: never; state?: never }
  | { scope: "county"; county: string; state: string; city?: never; entity_id?: never; effect: "context" }
  | { scope: "city"; city: string; county: string; state: string; entity_id?: never; effect: "context" }
);
export type SignalLocation = { county: string | null; state: string | null;
  city?: string | null; inCityLimits?: boolean | null };

export type Timeline = {
  modelBand: Band | null;
  evidenceBand: Band | null;
  raised: boolean;
  known: Signal[];
  laterCount: number;
  totalCount: number;
};

function text(value: unknown, label: string, limit = 2000): string {
  if (typeof value !== "string" || !value.trim() || value.length > limit) throw new Error(`Invalid signal ${label}`);
  return value;
}

function member<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (typeof value !== "string" || !options.includes(value as T)) throw new Error(`Invalid signal ${label}`);
  return value as T;
}

function timestamp(value: unknown, label: string): string {
  const raw = text(value, label, 40);
  const shape = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;
  if (raw !== raw.trim() || !shape.test(raw) || !parseAsOf(raw.slice(0, 10)) || !Number.isFinite(Date.parse(raw))) throw new Error(`Invalid signal ${label}`);
  return raw;
}

function dated(value: unknown, precision: Precision, label: string): string {
  if (precision === "minute") return timestamp(value, label);
  const day = parseAsOf(value);
  if (!day) throw new Error(`Invalid signal ${label}`);
  return day;
}

const chicagoDate = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" });

export function publicDay(signal: Pick<Signal, "published_at" | "published_precision">): string {
  if (signal.published_precision === "day") return signal.published_at;
  const parts = chicagoDate.formatToParts(new Date(signal.published_at));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function comparePublication(a: Signal, b: Signal): number {
  const dayOrder = publicDay(a).localeCompare(publicDay(b));
  if (dayOrder) return dayOrder;
  // An unknown publication hour sorts first within its day; this does not assert an earlier instant.
  if (a.published_precision !== b.published_precision) return a.published_precision === "day" ? -1 : 1;
  const instantOrder = a.published_precision === "minute" ? Date.parse(a.published_at) - Date.parse(b.published_at) : 0;
  return instantOrder || a.signal_id.localeCompare(b.signal_id);
}

function parseSignal(value: unknown): Signal {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid signal record");
  const raw = value as Record<string, unknown>;
  const signalId = text(raw.signal_id, "signal_id", 100);
  if (signalId !== signalId.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(signalId)) throw new Error("Invalid signal slug");
  const scope = member(raw.scope, ["project", "county", "city"] as const, "scope");
  let target: Pick<Signal, "scope"> & Record<string, string>;
  if (scope === "project") {
    if ("city" in raw || "county" in raw || "state" in raw) throw new Error("Project signals cannot carry an area target");
    const entityId = text(raw.entity_id, "entity_id", 100);
    if (entityId !== entityId.trim() || !/^(?:costar-[A-Za-z0-9_-]+|[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12})$/.test(entityId)) throw new Error("Invalid signal entity_id");
    target = { scope, entity_id: entityId };
  } else {
    if ("entity_id" in raw) throw new Error("Area signals cannot carry a project target");
    if (scope === "county" && "city" in raw) throw new Error("County signals cannot carry a city target");
    const county = text(raw.county, "county", 100).trim();
    const state = text(raw.state, "state", 20).trim().toUpperCase();
    if (/[\x00-\x1f\x7f]/.test(county) || !/^[A-Z]{2}$/.test(state)) throw new Error("Invalid signal county or state");
    if (scope === "city") {
      const city = text(raw.city, "city", 100).trim();
      if (/[\x00-\x1f\x7f]/.test(city)) throw new Error("Invalid signal city");
      target = { scope, city, county, state };
    } else target = { scope, county, state };
  }
  const check = member(raw.check_id, CHECKS, "check_id");
  const type = member(raw.signal_type, TYPES, "signal_type");
  const effect = member(raw.effect, EFFECTS, "effect");
  if (scope !== "project" && effect !== "context") throw new Error("Area signals must be contextual");
  if (type === "ordinance_enacted" && scope === "project") throw new Error("Ordinance signals must target a city or county");
  if (type.startsWith("outcome_") !== (effect === "outcome")) throw new Error("Outcome signals must use outcome effect only");
  if (["application_filed", "moratorium_proposed"].includes(type) && effect !== "context") throw new Error("Applications and proposals are contextual signals");
  const eventPrecision = member(raw.event_precision, ["minute", "day", "unknown"] as const, "event_precision");
  if (eventPrecision === "unknown" && raw.event_at !== null) throw new Error("Unknown event date must be null");
  const eventAt = eventPrecision === "unknown" ? null : dated(raw.event_at, eventPrecision, "event_at");
  const publishedPrecision = member(raw.published_precision, ["minute", "day"] as const, "published_precision");
  const publishedAt = dated(raw.published_at, publishedPrecision, "published_at");
  const recordedAt = timestamp(raw.recorded_at, "recorded_at");
  if (!raw.verification || typeof raw.verification !== "object" || Array.isArray(raw.verification)) throw new Error("Invalid signal verification");
  const verification = raw.verification as Record<string, unknown>;
  const method = member(verification.method, ["manual_review", "verbatim_match"] as const, "verification method");
  const basis = member(verification.publication_date_basis, ["source_page", "submitter", "investigator"] as const, "publication date basis");
  const proposedBy = raw.proposed_by === undefined ? undefined : member(raw.proposed_by, ["visitor", "investigator"] as const, "proposed_by");
  const verifiedAt = timestamp(verification.verified_at, "verified_at");
  if (scope !== "project" && (proposedBy !== undefined || method !== "manual_review" || basis !== "source_page")) {
    throw new Error("Area signals must be manually reviewed public context, not submitted evidence");
  }
  if ((proposedBy === "investigator" || basis === "investigator")
    && (proposedBy !== "investigator" || basis !== "investigator" || method !== "verbatim_match" || effect !== "context")) {
    throw new Error("Investigator proposals must be quote-matched context with an unverified investigator publication day");
  }
  if (method === "verbatim_match" && (effect !== "context" || !["submitter", "investigator"].includes(basis) || publishedPrecision !== "day")) {
    throw new Error("Submitted signals must be context with a submitter-entered publication day");
  }
  if (scope === "project" && method === "manual_review" && !type.startsWith("outcome_")) {
    const expected = type === "approval_failed" || type === "moratorium_enacted" ? "raise" : "context";
    if (effect !== expected) throw new Error("Manually reviewed project signal effect must follow its type");
  }
  const sourceUrl = text(raw.source_url, "source_url", 2048);
  const url = new URL(sourceUrl);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid signal source URL");
  return {
    signal_id: signalId, ...target, check_id: check, signal_type: type, effect,
    event_at: eventAt, event_precision: eventPrecision,
    published_at: publishedAt, published_precision: publishedPrecision, recorded_at: recordedAt,
    source_name: text(raw.source_name, "source_name", 200), source_url: sourceUrl,
    quote: text(raw.quote, "quote", 300), summary: text(raw.summary, "summary"),
    ...(proposedBy === undefined ? {} : { proposed_by: proposedBy }),
    verification: { method, verified_at: verifiedAt, publication_date_basis: basis },
  } as Signal;
}

export function parseSignals(value: unknown): Signal[] {
  if (!Array.isArray(value)) throw new Error("Signals must be an array");
  const signals = value.map(parseSignal);
  const ids = signals.map((s) => s.signal_id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate signal_id");
  return signals;
}

function normalizedPlace(value: string): string { return value.trim().toLocaleLowerCase("en-US"); }

export function signalAppliesTo(signal: Signal, entityId: string, location?: SignalLocation): boolean {
  if (signal.scope === "project") return signal.entity_id === entityId;
  const sameCountyAndState = !!location?.county && !!location.state
    && normalizedPlace(signal.county) === normalizedPlace(location.county)
    && normalizedPlace(signal.state) === normalizedPlace(location.state);
  if (signal.scope === "county") return sameCountyAndState;
  return sameCountyAndState && location?.inCityLimits === true && !!location.city
    && normalizedPlace(signal.city) === normalizedPlace(location.city);
}

export function signalScopeLabel(signal: Signal): string {
  if (signal.scope === "project") return "This project";
  if (signal.scope === "county") return `County-wide: ${signal.county}`;
  const displayCity = signal.city.endsWith(" city") ? signal.city.slice(0, -5) : signal.city;
  return `City-wide: ${displayCity}`;
}

export function buildTimeline(signals: readonly Signal[], entityId: string, modelBand: Band | null, asOf?: string,
  location?: SignalLocation): Timeline {
  if (asOf !== undefined && !parseAsOf(asOf)) throw new Error("Invalid as-of calendar date");
  const matching = signals.filter((s) => signalAppliesTo(s, entityId, location));
  const known = matching.filter((s) => asOf === undefined || (publicDay(s) <= asOf
    && (s.verification.method !== "verbatim_match" || publicDay({ published_at: s.recorded_at, published_precision: "minute" }) <= asOf)))
    .sort(comparePublication);
  const hasRaise = known.some((s) => s.scope === "project" && s.effect === "raise");
  const evidenceBand = !hasRaise || modelBand === null ? modelBand : modelBand === "green" ? "watch" : "red";
  return { modelBand, evidenceBand, raised: evidenceBand !== modelBand, known, laterCount: matching.length - known.length, totalCount: matching.length };
}

/** The held-out example belongs only to evidence illustrations, never the stored monetary scenario. */
export function evidenceBaseline(entityId: string, modelBand: Band | null, holdoutDemo: HoldoutDemo | null): Band | null {
  return holdoutDemo?.projectId === entityId ? band(holdoutDemo.score) : modelBand;
}

export type SavedEntity = { entityId: string; name: string; modelBand: Band | null; savedAt: string;
  county?: string | null; state?: string | null; city?: string | null; inCityLimits?: boolean | null };
export type ChangeEntry = {
  entityId: string;
  name: string;
  signal: Signal;
  publicationDay: string;
  timelineDay: string;
  transition: { from: Band; to: Band } | null;
};

/** Live order reflects when evidence was added; replay order reflects when it became public. */
export function buildChangeFeed(signals: readonly Signal[], saved: readonly SavedEntity[], holdoutDemo: HoldoutDemo | null, since?: string): ChangeEntry[] {
  if (since !== undefined && !parseAsOf(since)) throw new Error("Invalid replay calendar date");
  const compare = since === undefined
    ? (a: Signal, b: Signal) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at) || comparePublication(a, b)
    : comparePublication;
  return saved.flatMap((entity) => {
    const savedAt = Date.parse(entity.savedAt);
    if (since === undefined && !Number.isFinite(savedAt)) return [];
    const baseline = evidenceBaseline(entity.entityId, entity.modelBand, holdoutDemo);
    let level = baseline;
    let raised = false;
    // Submitter-entered dates are unverified and cannot populate historical replay.
    return signals.filter((s) => signalAppliesTo(s, entity.entityId, {
      county: entity.county ?? null, state: entity.state ?? null,
      city: entity.city ?? null, inCityLimits: entity.inCityLimits ?? null,
    })
      && (since === undefined || s.verification.method !== "verbatim_match")).sort(compare).flatMap((signal): ChangeEntry[] => {
      const before = level;
      if (signal.scope === "project" && signal.effect === "raise" && !raised) {
        level = baseline === null ? null : baseline === "green" ? "watch" : "red";
        raised = true;
      }
      const publicationDay = publicDay(signal);
      const include = since === undefined ? Date.parse(signal.recorded_at) > savedAt : publicationDay > since;
      if (!include) return [];
      const timelineDay = signal.verification.method === "verbatim_match"
        ? publicDay({ published_at: signal.recorded_at, published_precision: "minute" }) : publicationDay;
      return [{ entityId: entity.entityId, name: entity.name, signal, publicationDay, timelineDay,
        transition: before !== null && level !== null && before !== level ? { from: before, to: level } : null }];
    });
  }).sort((a, b) => compare(a.signal, b.signal) || a.entityId.localeCompare(b.entityId));
}

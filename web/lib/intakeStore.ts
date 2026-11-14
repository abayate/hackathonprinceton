import "server-only";
import { isClientId } from "./params";
import { normalizeQuote } from "./quoteVerify";
import { signalAppliesTo, type Signal, type SignalLocation } from "./signals";

const VISITOR_LIMIT = 200;
const RECORD_LIMIT = 20;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const VISITOR_ATTEMPTS = 5;
const GLOBAL_ATTEMPTS = 100;
const INVESTIGATION_ATTEMPTS = 8;
const INVESTIGATION_TTL_MS = 60 * 1000;

type IntakeSession = { signals: readonly Signal[]; expiresAt: number };
type IntakeMemory = {
  sessions: Map<string, IntakeSession>;
  attempts: Map<string, number[]>;
  globalAttempts: number[];
};

const globalMemory = globalThis as typeof globalThis & { groundworkEvidenceIntake?: IntakeMemory };
function memory(): IntakeMemory {
  return globalMemory.groundworkEvidenceIntake ??= {
    sessions: new Map(), attempts: new Map(), globalAttempts: [],
  };
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return value;
  }
}

/** Deduplicate against both the visitor's records and the public fixture. */
export function isDuplicateSignal(candidate: Signal, existing: readonly Signal[], location?: SignalLocation): boolean {
  const url = canonicalUrl(candidate.source_url);
  const quote = normalizeQuote(candidate.quote);
  return existing.some((signal) => (candidate.scope === "project"
    ? signalAppliesTo(signal, candidate.entity_id, location)
    : signal.scope === "county" && signalAppliesTo(signal, "", { county: candidate.county, state: candidate.state }))
    && canonicalUrl(signal.source_url) === url
    && normalizeQuote(signal.quote) === quote);
}

export function getIntakeSignals(clientId: string): Signal[] {
  if (!isClientId(clientId)) return [];
  const entry = memory().sessions.get(clientId);
  return entry && entry.expiresAt > Date.now() ? [...structuredClone(entry.signals)] : [];
}

/** Reserve before fetch; unsuccessful fetches and failed quote checks still consume quota. */
export function reserveIntakeAttempt(clientId: string, now = Date.now()): boolean {
  if (!isClientId(clientId) || !Number.isFinite(now)) return false;
  const state = memory();
  const recent = (times: readonly number[]) => times.filter((time) => time > now - RATE_WINDOW_MS && time <= now);
  state.globalAttempts = recent(state.globalAttempts);
  state.attempts = new Map([...state.attempts].map(([id, times]) => [id, recent(times)] as const)
    .filter(([, times]) => times.length));
  const personal = state.attempts.get(clientId) ?? [];
  if (personal.length >= VISITOR_ATTEMPTS || state.globalAttempts.length >= GLOBAL_ATTEMPTS) return false;
  state.attempts.set(clientId, [...personal, now]);
  state.globalAttempts = [...state.globalAttempts, now];
  return true;
}

type InvestigationRuns = { visitors: Map<string, number>; global: readonly number[] };
const runMemory = globalThis as typeof globalThis & { groundworkInvestigationRuns?: InvestigationRuns };
const investigationBrand: unique symbol = Symbol("investigation reservation");
export type InvestigationReservation = { readonly [investigationBrand]: true };
type ReservationState = { clientId: string; startedAt: number; attempts: number };
const reservations = new WeakMap<InvestigationReservation, ReservationState>();

/** Reserve once before research; unsuccessful runs also consume quota. Process-local only. */
export function reserveInvestigationRun(clientId: string, now = Date.now()): InvestigationReservation | null {
  if (!isClientId(clientId) || !Number.isFinite(now)) return null;
  if (memory().globalAttempts.filter((at) => at > now - RATE_WINDOW_MS && at <= now).length >= GLOBAL_ATTEMPTS) return null;
  const previous = runMemory.groundworkInvestigationRuns;
  const visitors = new Map([...(previous?.visitors ?? [])].filter(([, at]) => at > now - RATE_WINDOW_MS && at <= now));
  const global = (previous?.global ?? []).filter((at) => at > now - 60 * 60 * 1000 && at <= now);
  if (visitors.has(clientId) || global.length >= 10) return null;
  runMemory.groundworkInvestigationRuns = { visitors: new Map([...visitors, [clientId, now]]), global: [...global, now] };
  const reservation = Object.freeze({ [investigationBrand]: true }) as InvestigationReservation;
  reservations.set(reservation, { clientId, startedAt: now, attempts: 0 });
  return reservation;
}

export type InvestigationAttemptResult = "allowed" | "run_limit" | "global_limit" | "invalid";

/** A run token grants at most eight attempts; only the global cap is shared with manual intake. */
export function reserveInvestigationAttempt(clientId: string, reservation: InvestigationReservation | undefined,
  now = Date.now()): InvestigationAttemptResult {
  if (!isClientId(clientId) || !reservation || !Number.isFinite(now)) return "invalid";
  const run = reservations.get(reservation);
  if (!run || run.clientId !== clientId || now < run.startedAt || now >= run.startedAt + INVESTIGATION_TTL_MS) return "invalid";
  if (run.attempts >= INVESTIGATION_ATTEMPTS) return "run_limit";
  const state = memory();
  const global = state.globalAttempts.filter((at) => at > now - RATE_WINDOW_MS && at <= now);
  state.globalAttempts = global;
  if (global.length >= GLOBAL_ATTEMPTS) return "global_limit";
  state.globalAttempts = [...global, now];
  reservations.set(reservation, { ...run, attempts: run.attempts + 1 });
  return "allowed";
}

export type IntakeAddResult = "added" | "duplicate" | "store_full";

export function addIntakeSignal(clientId: string, signal: Signal, now = Date.now()): IntakeAddResult {
  if (!isClientId(clientId) || !Number.isFinite(now)) return "store_full";
  const state = memory();
  const active = new Map([...state.sessions].filter(([, entry]) => entry.expiresAt > now));
  const previous = active.get(clientId)?.signals ?? [];
  if (isDuplicateSignal(signal, previous)) return "duplicate";
  if (previous.length >= RECORD_LIMIT || (!active.has(clientId) && active.size >= VISITOR_LIMIT)) return "store_full";
  active.set(clientId, { signals: [structuredClone(signal), ...previous], expiresAt: now + SESSION_TTL_MS });
  state.sessions = active;
  return "added";
}

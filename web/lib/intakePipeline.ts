import "server-only";
import { isClientId, parseAsOf } from "./params";
import { getSignals } from "./signalStore";
import { getPublicSite } from "./publicStore";
import { parseSignals, type Signal } from "./signals";
import { fetchPublicText, SafeFetchError } from "./safeFetch";
import { normalizeQuote, verifyQuote } from "./quoteVerify";
import { addIntakeSignal, getIntakeSignals, isDuplicateSignal, reserveIntakeAttempt,
  reserveInvestigationAttempt, type InvestigationReservation } from "./intakeStore";

const CHECK_BY_TYPE = { approval_failed: "zoning", application_filed: "zoning", moratorium_proposed: "policy",
  moratorium_enacted: "policy", organized_opposition: "opposition" } as const;
type IntakeType = keyof typeof CHECK_BY_TYPE;
export type IntakeInput = { project_id: string; source_url: string; quote: string; publication_date: string; signal_type: IntakeType; summary: string };

export function parseIntakeInput(body: unknown): IntakeInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("A JSON object is required.");
  const raw = body as Record<string, unknown>;
  const fields = ["project_id", "source_url", "quote", "publication_date", "signal_type", "summary"];
  if (Object.keys(raw).some((key) => !fields.includes(key)) || fields.some((key) => typeof raw[key] !== "string")) throw new Error("Use the required evidence fields only.");
  const data = raw as unknown as IntakeInput;
  if (!isClientId(data.project_id)) throw new Error("Choose a tracked public project.");
  if (data.quote.length < 40 || data.quote.length > 300 || normalizeQuote(data.quote).length < 40) throw new Error("The quote must be 40–300 characters, excluding extra whitespace.");
  if (!data.summary.trim() || data.summary.length > 1000) throw new Error("The summary must be 1–1,000 characters.");
  if (!Object.hasOwn(CHECK_BY_TYPE, data.signal_type)) throw new Error("Choose a non-outcome signal type.");
  const day = parseAsOf(data.publication_date);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  if (!day || day > today) throw new Error("Enter a valid publication date that is not in the future in Central Time.");
  if (data.source_url.length > 2048) throw new Error("The source URL is too long.");
  let url: URL;
  try { url = new URL(data.source_url); } catch { throw new Error("Enter a valid HTTPS source URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("Use HTTPS with no credentials or custom port.");
  url.hash = "";
  return { ...data, source_url: url.href, summary: data.summary.trim() };
}

function makeSignal(data: IntakeInput, sourceUrl: string, proposedBy?: "investigator"): Signal {
  const now = new Date().toISOString();
  return parseSignals([{
    signal_id: `submitted-${crypto.randomUUID()}`, scope: "project", entity_id: data.project_id,
    check_id: CHECK_BY_TYPE[data.signal_type], signal_type: data.signal_type, effect: "context",
    event_at: null, event_precision: "unknown", published_at: data.publication_date, published_precision: "day",
    recorded_at: now, source_name: new URL(sourceUrl).hostname, source_url: sourceUrl,
    quote: data.quote, summary: data.summary,
    ...(proposedBy ? { proposed_by: proposedBy } : {}),
    verification: { method: "verbatim_match", verified_at: now, publication_date_basis: proposedBy ?? "submitter" },
  }])[0];
}

export type IntakeDecision = {
  decision: "accepted" | "quote_not_found" | "fetch_failed" | "blocked_address" | "duplicate" | "invalid" | "rate_limited" | "store_full" | "deadline";
  reason: string;
  signal?: Signal;
  source_status?: number;
  limit_scope?: "manual" | "investigation" | "global";
};
const duplicate = (): IntakeDecision => ({ decision: "duplicate", reason: "This quote and source are already recorded for this project." });
const deadline = (): IntakeDecision => ({ decision: "deadline", reason: "Investigation time limit reached. Nothing further was saved." });

/** Both entry points use this gate and global attempt cap, with separate visitor allowances and one private store. */
export async function verifyAndStoreIntake(data: IntakeInput, clientId: string,
  options: { proposedBy?: "investigator"; investigation?: InvestigationReservation; deadlineAt?: number } = {}): Promise<IntakeDecision> {
  const expired = () => options.deadlineAt !== undefined && Date.now() >= options.deadlineAt;
  try {
    if (expired()) return deadline();
    if (options.proposedBy !== "investigator" && options.investigation !== undefined) {
      return { decision: "invalid", reason: "Invalid investigation reservation." };
    }
    if (options.proposedBy === "investigator") {
      const attempt = reserveInvestigationAttempt(clientId, options.investigation);
      if (attempt === "invalid") return { decision: "invalid", reason: "Investigation reservation is missing or expired." };
      if (attempt === "run_limit") return { decision: "rate_limited", limit_scope: "investigation", reason: "Investigation verification limit reached." };
      if (attempt === "global_limit") return { decision: "rate_limited", limit_scope: "global", reason: "Global verification limit reached. Try again later." };
    } else if (!reserveIntakeAttempt(clientId)) {
      return { decision: "rate_limited", limit_scope: "manual", reason: "Submission limit reached. Try again later." };
    }
    const site = await getPublicSite(data.project_id);
    if (!site) return { decision: "invalid", reason: "Unknown public project." };
    // The committed public project dataset covers Texas; scope matching remains explicit in the signal library.
    const location = { city: site.city, county: site.county, state: "TX", inCityLimits: site.in_city_limits };
    const known = [...await getSignals(), ...getIntakeSignals(clientId)];
    if (expired()) return deadline();
    const candidate = makeSignal(data, data.source_url, options.proposedBy);
    if (isDuplicateSignal(candidate, known, location)) return duplicate();
    const page = options.deadlineAt === undefined ? await fetchPublicText(data.source_url)
      : await fetchPublicText(data.source_url, { timeoutMs: Math.min(5_000, options.deadlineAt - Date.now()) });
    // A caller may stop awaiting at its deadline; late work must never store a record.
    if (expired()) return deadline();
    if (!verifyQuote(data.quote, page.text, page.contentType)) return { decision: "quote_not_found", reason: "Quote not found verbatim in the source page text. Nothing was saved." };
    const signal = makeSignal(data, page.finalUrl, options.proposedBy);
    if (isDuplicateSignal(signal, known, location)) return duplicate();
    if (expired()) return deadline();
    const result = addIntakeSignal(clientId, signal);
    if (result === "duplicate") return duplicate();
    if (result === "store_full") return { decision: "store_full", reason: "Session evidence storage is full. Nothing was saved." };
    return { decision: "accepted", reason: "Quote matched to page text; date and summary not verified.", signal, source_status: page.status };
  } catch (error) {
    if (expired()) return deadline();
    if (error instanceof SafeFetchError && error.code !== "fetch_failed") return { decision: "blocked_address", reason: "The source must be a public HTTPS page; this address is not allowed." };
    return { decision: "fetch_failed", reason: "The source page could not be verified. Try another public text page." };
  }
}

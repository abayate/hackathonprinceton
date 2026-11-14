import type { Site } from "./sites";
import { parseIntakeInput, type IntakeDecision, type IntakeInput } from "./intakePipeline";
import type { Signal } from "./signals";

const MAX_CANDIDATES = 8;
const MAX_DURATION_MS = 60_000;
const CANDIDATE_FIELDS = ["source_url", "quote", "publication_date", "signal_type", "summary"] as const;

export type InvestigationPlan = {
  projectId: string;
  projectName: string;
  facts: { name: string; company: string; city: string; county: string };
  queries: string[];
};

export type ResearchClient = {
  research(plan: InvestigationPlan, signal: AbortSignal): Promise<unknown>;
};

export type CandidateDecision = {
  index: number;
  source_url: string | null;
  decision: IntakeDecision["decision"];
  reason: string;
  signal?: Signal;
  source_status?: number;
  limit_scope?: IntakeDecision["limit_scope"];
};

export type InvestigationReport = {
  status: "complete" | "invalid_response" | "research_failed" | "deadline";
  plan: InvestigationPlan;
  candidates: CandidateDecision[];
  truncatedCount: number;
  unknowns: string[];
  reason?: string;
};

type Candidate = Record<typeof CANDIDATE_FIELDS[number], string>;
type VerifyCandidate = (input: IntakeInput, deadlineAt: number) => Promise<IntakeDecision>;

const UNKNOWNS = [
  "Candidate publication dates and summaries are not independently verified.",
  "A matched quote does not independently establish that the described event occurred.",
  "This search may miss relevant public evidence.",
];

function fact(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
}

/** Construct only public, present-day search context. No fetched page text enters the plan. */
export function buildInvestigationPlan(site: Pick<Site, "project_id" | "name" | "company" | "city" | "county">): InvestigationPlan {
  const facts = { name: fact(site.name), company: fact(site.company), city: fact(site.city), county: fact(site.county) };
  const place = [facts.city, facts.county, "Texas"].filter(Boolean).join(" ");
  return {
    projectId: site.project_id,
    projectName: facts.name,
    facts,
    queries: [
      `"${facts.name}" ${place} data center zoning permit`,
      `"${facts.company || facts.name}" ${place} data center opposition water`,
      `"${facts.name}" ${place} city council application decision`,
    ],
  };
}

function parseCandidates(raw: unknown): Candidate[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid response");
  const root = raw as Record<string, unknown>;
  if (Object.keys(root).length !== 1 || !Object.hasOwn(root, "candidates") || !Array.isArray(root.candidates)) {
    throw new Error("Invalid response");
  }
  return root.candidates.map((value): Candidate => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid candidate");
    const item = value as Record<string, unknown>;
    if (Object.keys(item).length !== CANDIDATE_FIELDS.length
      || CANDIDATE_FIELDS.some((field) => typeof item[field] !== "string")
      || Object.keys(item).some((field) => !CANDIDATE_FIELDS.includes(field as typeof CANDIDATE_FIELDS[number]))) {
      throw new Error("Invalid candidate");
    }
    return item as Candidate;
  });
}

function safeHttpsUrl(value: string): string | null {
  if (value.length > 2048 || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function invalidReason(candidate: Candidate, safeUrl: string | null): string {
  if (candidate.signal_type.startsWith("outcome_")) return "Outcome records cannot be proposed by the investigator.";
  if (safeUrl === null) return "The source must be an HTTPS URL without credentials or a custom port.";
  if (candidate.quote.length < 40 || candidate.quote.length > 300) return "The quote must be 40–300 characters.";
  if (!candidate.summary.trim() || candidate.summary.length > 300) return "The summary must be 1–300 characters.";
  return "The candidate did not meet evidence intake rules.";
}

function report(plan: InvestigationPlan, status: InvestigationReport["status"], candidates: CandidateDecision[],
  truncatedCount: number, reason?: string): InvestigationReport {
  return { status, plan, candidates, truncatedCount, unknowns: [...UNKNOWNS], ...(reason ? { reason } : {}) };
}

/** Run once, serially, under a single absolute deadline shared with the intake gate. */
export async function runInvestigation(plan: InvestigationPlan, client: ResearchClient, verifyCandidate: VerifyCandidate,
  options: { now?: () => number; timeoutMs?: number } = {}): Promise<InvestigationReport> {
  const now = options.now ?? Date.now;
  const duration = Number.isFinite(options.timeoutMs) ? Math.max(0, Math.min(MAX_DURATION_MS, options.timeoutMs!)) : MAX_DURATION_MS;
  const deadlineAt = now() + duration;
  if (duration === 0) return report(plan, "deadline", [], 0, "Investigation deadline reached.");
  const controller = new AbortController();
  const deadlineMarker = Symbol("deadline");
  let wakeDeadline: (value: typeof deadlineMarker) => void = () => {};
  const deadline = new Promise<typeof deadlineMarker>((resolve) => { wakeDeadline = resolve; });
  const timer = setTimeout(() => { controller.abort(); wakeDeadline(deadlineMarker); }, duration);
  const timed = <T>(operation: Promise<T>): Promise<T | typeof deadlineMarker> => Promise.race([operation, deadline]);

  try {
    let raw: unknown;
    try {
      const result = await timed(Promise.resolve().then(() => client.research(plan, controller.signal)));
      if (result === deadlineMarker || now() >= deadlineAt) return report(plan, "deadline", [], 0, "Investigation deadline reached.");
      raw = result;
    } catch {
      if (controller.signal.aborted || now() >= deadlineAt) return report(plan, "deadline", [], 0, "Investigation deadline reached.");
      return report(plan, "research_failed", [], 0, "Research request failed.");
    }

    let all: Candidate[];
    try { all = parseCandidates(raw); }
    catch { return report(plan, "invalid_response", [], 0, "Research response did not match the required candidate structure."); }

    const decisions: CandidateDecision[] = [];
    const truncatedCount = Math.max(0, all.length - MAX_CANDIDATES);
    for (const [index, candidate] of all.slice(0, MAX_CANDIDATES).entries()) {
      if (controller.signal.aborted || now() >= deadlineAt) return report(plan, "deadline", decisions, truncatedCount, "Investigation deadline reached.");
      const source_url = safeHttpsUrl(candidate.source_url);
      let input: IntakeInput;
      try {
        if (candidate.summary.length > 300) throw new Error("Investigator summary too long");
        input = parseIntakeInput({ ...candidate, project_id: plan.projectId });
      }
      catch {
        decisions.push({ index, source_url, decision: "invalid", reason: invalidReason(candidate, source_url) });
        continue;
      }
      try {
        const result = await timed(Promise.resolve().then(() => verifyCandidate(input, deadlineAt)));
        if (result === deadlineMarker || now() >= deadlineAt) {
          decisions.push({ index, source_url, decision: "deadline", reason: "Investigation deadline reached." });
          return report(plan, "deadline", decisions, truncatedCount, "Investigation deadline reached.");
        }
        decisions.push({ index, source_url, decision: result.decision, reason: result.reason,
          ...(result.signal ? { signal: result.signal } : {}),
          ...(result.source_status === undefined ? {} : { source_status: result.source_status }),
          ...(result.limit_scope === undefined ? {} : { limit_scope: result.limit_scope }) });
        if (result.decision === "deadline") return report(plan, "deadline", decisions, truncatedCount, "Investigation deadline reached.");
      } catch {
        if (controller.signal.aborted || now() >= deadlineAt) {
          decisions.push({ index, source_url, decision: "deadline", reason: "Investigation deadline reached." });
          return report(plan, "deadline", decisions, truncatedCount, "Investigation deadline reached.");
        }
        decisions.push({ index, source_url, decision: "fetch_failed", reason: "Candidate verification failed." });
      }
    }
    return report(plan, "complete", decisions, truncatedCount);
  } finally {
    clearTimeout(timer);
  }
}

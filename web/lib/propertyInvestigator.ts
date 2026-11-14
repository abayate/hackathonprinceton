import { createHash, randomUUID } from "node:crypto";
import type { GroundworkStore } from "./gwStore";
import type { Memo, MemoSection, MemoSectionId, MemoSource, Num, RunRecord, RunStep, Verdict } from "./runTypes";

/**
 * Groundwork property investigator: one CoStar listing + the financial engine's numbers -> a sourced memo.
 * Separate from lib/investigator.ts (Texas tracked-project evidence). Rules enforced here, not in the prompt:
 * - verdict and max price come from the valuation, never from the model;
 * - every dollar figure in the prose must be one we supplied;
 * - every cited source must be one we supplied or an HTTPS page the model listed.
 */

const RUN_DEADLINE_MS = 55_000;

export type PropertyFacts = {
  property_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  county: string | null;
  property_type: string;
  lot_acres: number | null;
  building_sf: number | null;
  zoning: string | null;
  heavy_power: boolean | null;
  year_built: number | null;
  asking_price: number | null;
};

/**
 * The slice of Marvin's PropertyValuation (web/lib/valuationTypes.ts) the memo needs.
 * Kept narrow on purpose so this file does not depend on a type that is still changing.
 */
export type ValuationForMemo = {
  verdict: Verdict;
  reasons: string[];
  max_price_usd_per_acre: Num;
  ten_year_cost_usd: Num;
  missing_inputs: string[];
};

/** Placeholder until the financial engine is wired in. Values are null and tagged sample: nothing is invented. */
export function sampleValuationForMemo(): ValuationForMemo {
  return {
    verdict: "maybe",
    reasons: ["The financial engine is not connected yet, so no maximum price has been calculated."],
    max_price_usd_per_acre: { value: null, unit: "USD/acre", kind: "sample", source_id: null },
    ten_year_cost_usd: { value: null, unit: "USD", kind: "sample", source_id: null },
    missing_inputs: ["Maximum price per acre", "Ten-year cost"],
  };
}

export type Figure = { label: string; display: string; kind: Num["kind"]; source_id: string | null };
export type MemoWriterInput = {
  property: Omit<PropertyFacts, "property_id">;
  verdict: Verdict;
  verdict_reasons: string[];
  figures: Figure[];
  missing_inputs: string[];
  given_sources: { source_id: string; title: string }[];
};
export type MemoDraft = {
  summary: string;
  sections: { id: MemoSectionId; body_md: string; source_ids: string[] }[];
  deal_risks: string[];
  open_questions: string[];
  web_sources: { source_id: string; title: string; url: string }[];
};
export type MemoWriter = { write(input: MemoWriterInput, signal: AbortSignal): Promise<MemoDraft> };

const SECTION_TITLES: Record<MemoSectionId, string> = {
  land: "Land and building",
  power_water: "Power and water",
  community: "Community and opposition",
};
const GIVEN_SOURCES: MemoSource[] = [
  { source_id: "costar", title: "CoStar listing record", url: null },
  { source_id: "groundwork-model", title: "Groundwork financial model", url: null },
];

export function usd(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function askingPerAcre(facts: PropertyFacts): number | null {
  const { asking_price: price, lot_acres: acres } = facts;
  if (price === null || acres === null || !(price > 0) || !(acres > 0)) return null;
  const result = price / acres;
  return Number.isFinite(result) ? result : null;
}

export function figuresFor(facts: PropertyFacts, valuation: ValuationForMemo): Figure[] {
  const figures: Figure[] = [];
  if (facts.asking_price !== null && facts.asking_price > 0) {
    figures.push({ label: "Asking price", display: usd(facts.asking_price), kind: "reported", source_id: "costar" });
  }
  const perAcre = askingPerAcre(facts);
  if (perAcre !== null) figures.push({ label: "Asking price per acre", display: `${usd(perAcre)}/acre`, kind: "reported", source_id: "costar" });
  const num = (label: string, n: Num, suffix = "") => {
    if (n.value !== null && Number.isFinite(n.value)) figures.push({ label, display: `${usd(n.value)}${suffix}`, kind: n.kind, source_id: n.source_id });
  };
  num("Maximum price per acre", valuation.max_price_usd_per_acre, "/acre");
  num("Ten-year cost", valuation.ten_year_cost_usd);
  return figures;
}

/** Dollar amounts in prose, normalised so "$1,200" and "$1200" compare equal. */
function dollarTokens(text: string): string[] {
  return [...text.matchAll(/\$\s?\d[\d,]*(?:\.\d+)?/g)].map((match) => match[0].replace(/[\s,]/g, ""));
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

const str = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null;
const strList = (value: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(value) ? value.map((item) => str(item, maxLen)).filter((item): item is string => item !== null).slice(0, maxItems) : [];

export class MemoRejected extends Error {
  constructor(reason: string) { super(reason); this.name = "MemoRejected"; }
}

/** Validates model output and turns it into memo parts. Throws MemoRejected on anything unsafe. */
export function acceptDraft(raw: unknown, figures: Figure[]): Pick<Memo, "summary" | "sections" | "deal_risks" | "open_questions" | "sources"> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new MemoRejected("The memo writer returned no memo.");
  const draft = raw as Record<string, unknown>;
  const summary = str(draft.summary, 600);
  if (!summary) throw new MemoRejected("The memo had no summary.");

  const webSources: MemoSource[] = [];
  for (const item of Array.isArray(draft.web_sources) ? draft.web_sources.slice(0, 6) : []) {
    const source = item as Record<string, unknown>;
    const id = str(source?.source_id, 40);
    const url = httpsUrl(source?.url);
    const title = str(source?.title, 200);
    if (id && url && title && /^web-\d{1,2}$/.test(id) && !webSources.some((s) => s.source_id === id)) {
      webSources.push({ source_id: id, title, url });
    }
  }
  const known = new Set([...GIVEN_SOURCES, ...webSources].map((source) => source.source_id));

  const sections: MemoSection[] = [];
  for (const item of Array.isArray(draft.sections) ? draft.sections : []) {
    const section = item as Record<string, unknown>;
    const id = section?.id as MemoSectionId;
    const body = str(section?.body_md, 2000);
    if (!Object.hasOwn(SECTION_TITLES, id) || !body || sections.some((s) => s.id === id)) continue;
    const sourceIds = strList(section.source_ids, 8, 40).filter((sourceId) => known.has(sourceId));
    sections.push({ id, title: SECTION_TITLES[id], body_md: body, source_ids: [...new Set(sourceIds)] });
  }
  if (sections.length === 0) throw new MemoRejected("The memo had no usable sections.");

  const memoText = { summary, sections, deal_risks: strList(draft.deal_risks, 6, 300), open_questions: strList(draft.open_questions, 6, 300) };
  const allowed = new Set(figures.flatMap((figure) => dollarTokens(figure.display)));
  const text = [memoText.summary, ...sections.map((s) => s.body_md), ...memoText.deal_risks, ...memoText.open_questions].join("\n");
  const invented = dollarTokens(text).filter((token) => !allowed.has(token));
  if (invented.length) throw new MemoRejected("The memo quoted a dollar figure that did not come from the model.");

  const cited = new Set(sections.flatMap((s) => s.source_ids));
  const sources = [...GIVEN_SOURCES, ...webSources].filter((source) => cited.has(source.source_id) || source.url !== null);
  return { ...memoText, sources };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** SHA-256 over the memo content with sorted keys. Excludes the digest itself, attestation and the live flag. */
export function memoDigest(memo: Memo): string {
  const content: Partial<Memo> = { ...memo };
  delete content.digest_sha256; delete content.attestation; delete content.live;
  return createHash("sha256").update(canonical(content), "utf8").digest("hex");
}

export function verifyMemoDigest(memo: Memo): boolean {
  return memo.digest_sha256 === memoDigest(memo);
}

export function newRun(propertyId: string, now: () => number = Date.now): RunRecord {
  return {
    run_id: `run_${randomUUID()}`, parcel_id: propertyId, status: "running",
    started_at: new Date(now()).toISOString(), finished_at: null, error: null, memo_id: null,
    steps: [{ n: 1, agent: "lead", action: "plan", layer: null, summary: "Planned: listing record, model figures, local research, memo.", status: "done" }],
  };
}

function landSummary(facts: PropertyFacts): string {
  const parts = [
    facts.lot_acres !== null ? `${facts.lot_acres} acres` : "acreage unknown",
    facts.property_type,
    facts.zoning ? `zoned ${facts.zoning}` : "zoning unknown",
    facts.asking_price !== null && facts.asking_price > 0 ? `asking ${usd(facts.asking_price)}` : "asking price unknown",
  ];
  return parts.join(", ");
}

type InvestigateOptions = { now?: () => number; deadlineMs?: number };

/**
 * Runs one investigation to completion, writing each step to storage as it goes so GET /api/runs/[id] can poll.
 * Never throws: failures end the run with status "error" and a safe message.
 */
export async function runPropertyInvestigation(run: RunRecord, facts: PropertyFacts, valuation: ValuationForMemo,
  writer: MemoWriter, store: GroundworkStore, options: InvestigateOptions = {}): Promise<void> {
  const now = options.now ?? Date.now;
  const steps: RunStep[] = [...run.steps];
  const push = async (step: Omit<RunStep, "n">) => {
    steps.push({ ...step, n: steps.length + 1 });
    await store.updateRunSteps(run.run_id, steps);
  };
  const settle = async (status: RunStep["status"], summary?: string) => {
    const last = steps[steps.length - 1];
    steps[steps.length - 1] = { ...last, status, ...(summary === undefined ? {} : { summary }) };
    await store.updateRunSteps(run.run_id, steps);
  };
  const fail = async (message: string) => {
    try {
      if (steps.at(-1)?.status === "running") await settle("error");
      await store.finishRun(run.run_id, "error", null, message);
    } catch { /* Storage is down; the run goes stale and a new one can start. */ }
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.deadlineMs ?? RUN_DEADLINE_MS);
  try {
    await push({ agent: "land", action: "get_costar_record", layer: "costar", summary: landSummary(facts), status: "done" });
    const figures = figuresFor(facts, valuation);
    const max = valuation.max_price_usd_per_acre;
    await push({
      agent: "lead", action: "quote_valuation", layer: "model", status: "done",
      summary: `Verdict ${valuation.verdict}; max price ${max.value === null ? "unknown" : `${usd(max.value)}/acre`} (${max.kind}).`,
    });

    await push({ agent: "community", action: "research_and_write", layer: "web", summary: "Searching local power, water, zoning and community context.", status: "running" });
    let parts: ReturnType<typeof acceptDraft>;
    try {
      const property: Partial<PropertyFacts> = { ...facts };
      delete property.property_id;
      const draft = await writer.write({
        property: property as MemoWriterInput["property"], verdict: valuation.verdict, verdict_reasons: valuation.reasons.slice(0, 6), figures,
        missing_inputs: valuation.missing_inputs.slice(0, 10),
        given_sources: GIVEN_SOURCES.map(({ source_id, title }) => ({ source_id, title })),
      }, controller.signal);
      parts = acceptDraft(draft, figures);
    } catch (error) {
      await fail(error instanceof MemoRejected ? error.message
        : controller.signal.aborted ? "The investigation ran out of time." : "The memo writer is unavailable.");
      return;
    }
    await settle("done", `Wrote ${parts.sections.length} sections citing ${parts.sources.filter((s) => s.url).length} web sources.`);

    await push({ agent: "lead", action: "compose_memo", layer: null, summary: "Composed and hashed the memo.", status: "running" });
    const missing = valuation.missing_inputs.map((input) => `Missing input: ${input}.`);
    const memo: Memo = {
      memo_id: `memo_${randomUUID()}`, parcel_id: facts.property_id, generated_at: new Date(now()).toISOString(), live: true,
      recommendation: valuation.verdict, max_price_usd_per_acre: valuation.max_price_usd_per_acre,
      ...parts,
      open_questions: [...new Set([...missing, ...parts.open_questions])].slice(0, 12),
      what_changed: [],
      digest_sha256: "",
      // Solana attestation is a stretch goal; until it exists the honest status is unavailable.
      attestation: { status: "unavailable", signature: null, explorer_url: null, network: "devnet" },
    };
    memo.digest_sha256 = memoDigest(memo);
    await store.saveMemo(memo);
    await settle("done");
    await store.finishRun(run.run_id, "done", memo.memo_id, null);
  } catch {
    await fail("Saving the investigation failed.");
  } finally {
    clearTimeout(timer);
  }
}

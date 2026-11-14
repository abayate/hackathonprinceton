/** Agent run and memo shapes from plan/01-contract.md §6. Field names are snake_case to match the contract. */

export type NumKind = "reported" | "modeled" | "assumed" | "sample";
export type Num = { value: number | null; unit: string; kind: NumKind; source_id: string | null };

export type Verdict = "buy" | "maybe" | "pass";
export type StepStatus = "running" | "done" | "error";
export type RunStatus = "running" | "done" | "error";
export type StepAgent = "lead" | "land" | "power_water" | "community";
export type StepLayer = "costar" | "vexcel" | "matterport" | "model" | "web" | null;

export type RunStep = {
  n: number;
  agent: StepAgent;
  action: string;
  layer: StepLayer;
  summary: string;
  status: StepStatus;
};

export type MemoSectionId = "land" | "power_water" | "community";
export type MemoSection = { id: MemoSectionId; title: string; body_md: string; source_ids: string[] };
export type MemoSource = { source_id: string; title: string; url: string | null };

export type Attestation = {
  status: "not_attested" | "pending" | "confirmed" | "failed" | "unavailable";
  signature: string | null;
  explorer_url: string | null;
  network: "devnet";
};

export type Memo = {
  memo_id: string;
  parcel_id: string;
  generated_at: string;
  /** false whenever the memo was loaded from storage rather than just generated. */
  live: boolean;
  recommendation: Verdict;
  max_price_usd_per_acre: Num;
  summary: string;
  sections: MemoSection[];
  deal_risks: string[];
  open_questions: string[];
  what_changed: string[];
  sources: MemoSource[];
  digest_sha256: string;
  attestation: Attestation;
};

/** What storage keeps for a run. The memo is stored separately and joined on read. */
export type RunRecord = {
  run_id: string;
  parcel_id: string;
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  steps: RunStep[];
  memo_id: string | null;
};

export type Run = Omit<RunRecord, "memo_id"> & { memo: Memo | null };

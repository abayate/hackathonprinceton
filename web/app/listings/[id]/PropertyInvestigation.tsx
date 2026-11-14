"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Memo, Run, RunStep } from "@/lib/runTypes";
import { usd, VERDICT_STYLE } from "@/app/components/valuationView";

type SavedMemo = Memo & { digest_matches?: boolean };
type State =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "running"; runId: string; steps: RunStep[] }
  | { kind: "error"; message: string };

const POLL_MS = 2000;
const AGENT_LABEL: Record<RunStep["agent"], string> = { lead: "Lead", land: "Land", power_water: "Power & water", community: "Community" };

function errorFor(status: number, detail?: string): string {
  if (status === 404) return "The investigator isn't turned on for this site.";
  if (status === 429) return "Investigation limit reached. Try again later.";
  if (status === 503) return "The investigator is unavailable right now. Try again later.";
  return detail ?? "The investigation couldn't start.";
}

/** Starts a property investigation (Allen's /api/properties/[id]/investigate), polls the run, and shows the memo. */
export default function PropertyInvestigation({ propertyId, mw, enabled }: { propertyId: string; mw: number; enabled: boolean }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [memo, setMemo] = useState<SavedMemo | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/properties/${encodeURIComponent(propertyId)}/memo`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((saved: SavedMemo | null) => { if (!cancelled && saved) setMemo(saved); })
      .catch(() => {});
    return () => { cancelled = true; if (timer.current) clearTimeout(timer.current); };
  }, [propertyId]);

  const poll = useCallback((runId: string) => {
    fetch(`/api/runs/${encodeURIComponent(runId)}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(errorFor(res.status));
        const run = (await res.json()) as Run;
        if (run.status === "running") {
          setState({ kind: "running", runId, steps: run.steps });
          timer.current = setTimeout(() => poll(runId), POLL_MS);
        } else if (run.status === "done" && run.memo) {
          setMemo(run.memo);
          setState({ kind: "idle" });
        } else {
          setState({ kind: "error", message: run.error ?? "The investigation stopped before writing a memo." });
        }
      })
      .catch((error: Error) => setState({ kind: "error", message: error.message || "Lost contact with the investigation." }));
  }, []);

  async function start() {
    setState({ kind: "starting" });
    try {
      const res = await fetch(`/api/properties/${encodeURIComponent(propertyId)}/investigate`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mw }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.run_id !== "string") { setState({ kind: "error", message: errorFor(res.status, body.detail) }); return; }
      setState({ kind: "running", runId: body.run_id, steps: [] });
      poll(body.run_id);
    } catch {
      setState({ kind: "error", message: "The investigation couldn't start. Check your connection." });
    }
  }

  const busy = state.kind === "starting" || state.kind === "running";
  return (
    <section id="investigate" aria-labelledby="investigate-heading" className="rounded-2xl p-5 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 id="investigate-heading" className="text-xl font-semibold text-slate-900">Investigate this property</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">An agent checks the land, power and water, and the community around this property, then writes an investment memo with sources. The verdict and price ceiling in the memo come from the valuation above, never from the AI.</p>
        </div>
        <button type="button" onClick={start} disabled={!enabled || busy}
          className="rounded-lg bg-[#215f4c] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? "Investigating…" : memo ? "Run again" : "Investigate"}
        </button>
      </div>
      {!enabled && <p className="mt-3 text-sm text-slate-600">The investigator isn&apos;t configured on this site.{memo ? " The last saved memo is shown below." : ""}</p>}
      {state.kind === "error" && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{state.message}</p>}
      {(state.kind === "starting" || state.kind === "running") && (
        <ol className="mt-4 space-y-2" aria-live="polite">
          {state.kind === "starting" && <li className="text-sm text-slate-500">Starting…</li>}
          {state.kind === "running" && state.steps.length === 0 && <li className="text-sm text-slate-500">Planning the investigation…</li>}
          {state.kind === "running" && state.steps.map((step) => (
            <li key={step.n} className="flex gap-3 text-sm">
              <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${step.status === "done" ? "bg-emerald-100 text-emerald-700" : step.status === "error" ? "bg-rose-100 text-rose-700" : "animate-pulse bg-slate-200 text-slate-600"}`}>{step.status === "done" ? "✓" : step.status === "error" ? "!" : step.n}</span>
              <span><span className="font-medium text-slate-900">{AGENT_LABEL[step.agent]}</span> · {step.action}{step.layer ? <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] uppercase text-slate-500">{step.layer}</span> : null}<span className="block text-slate-600">{step.summary}</span></span>
            </li>
          ))}
        </ol>
      )}
      {memo && <MemoView memo={memo} />}
    </section>
  );
}

function MemoView({ memo }: { memo: SavedMemo }) {
  const style = VERDICT_STYLE[memo.recommendation];
  const max = memo.max_price_usd_per_acre;
  const sourceTitle = new Map(memo.sources.map((s) => [s.source_id, s]));
  return (
    <article className="mt-5 border-t border-slate-200 pt-5" aria-label="Investment memo">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className={`rounded-full px-2.5 py-0.5 font-bold text-white ${style.cls}`}>{style.label}</span>
        {max.value != null && <span className="font-semibold text-slate-800">Up to {usd(max.value)}/acre <span className="rounded bg-slate-100 px-1 text-[10px] uppercase text-slate-500">{max.kind}</span></span>}
        <span>{memo.live ? "Just generated" : "Saved memo"} · {new Date(memo.generated_at).toLocaleString()}</span>
      </div>
      <p className="mt-3 text-base leading-7 text-slate-800">{memo.summary}</p>
      {memo.sections.map((section) => (
        <div key={section.id} className="mt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{section.title}</h3>
          <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-700">{section.body_md}</p>
          {section.source_ids.length > 0 && <p className="mt-1 text-xs text-slate-500">Sources: {section.source_ids.map((id) => sourceTitle.get(id)?.title ?? id).join(" · ")}</p>}
        </div>
      ))}
      {memo.deal_risks.length > 0 && <List title="What could kill the deal" items={memo.deal_risks} />}
      {memo.open_questions.length > 0 && <List title="Open questions" items={memo.open_questions} />}
      {memo.sources.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Sources</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
            {memo.sources.map((s) => <li key={s.source_id}>{s.url ? <a className="text-sky-700 underline" href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}</li>)}
          </ol>
        </div>
      )}
      <p className="mt-4 break-all text-[11px] leading-5 text-slate-500">
        Memo fingerprint (SHA-256): {memo.digest_sha256}
        {memo.digest_matches === false ? " · does not match the saved text" : memo.digest_matches ? " · matches the saved text" : ""}
        {" · "}{memo.attestation.status === "confirmed" && memo.attestation.explorer_url ? <a className="underline" href={memo.attestation.explorer_url} target="_blank" rel="noreferrer">Verified on Solana {memo.attestation.network}</a> : "On-chain attestation unavailable"}
      </p>
    </article>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  );
}

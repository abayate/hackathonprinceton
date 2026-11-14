"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const TYPES = [
  ["approval_failed", "Approval failed"],
  ["application_filed", "Application filed"],
  ["moratorium_proposed", "Moratorium proposed"],
  ["moratorium_enacted", "Moratorium enacted"],
  ["organized_opposition", "Organized opposition"],
] as const;

export default function EvidenceIntakeForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    setError(false);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      project_id: projectId,
      source_url: String(form.get("source_url") ?? ""),
      quote: String(form.get("quote") ?? ""),
      publication_date: String(form.get("publication_date") ?? ""),
      signal_type: String(form.get("signal_type") ?? ""),
      summary: String(form.get("summary") ?? ""),
    };
    try {
      const response = await fetch("/api/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result: unknown = await response.json().catch(() => null);
      if (response.status === 201) {
        setMessage("Quote matched the fetched page and was saved in this session. It is now on the timeline.");
        formElement.reset();
        router.refresh();
      } else {
        const detail = result && typeof result === "object" && "detail" in result && typeof result.detail === "string"
          ? result.detail : "Submission refused.";
        setMessage(detail);
        setError(true);
      }
    } catch {
      setMessage("Could not submit this record. Check your connection and try again.");
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-semibold text-slate-900">Submit a source and quote</h3>
      <p className="mt-1 text-xs text-slate-600">Private to this session. A match verifies only that the quoted text appears in extracted page text; it does not verify the claim. The publication date is entered by you and is not verified. Session submissions enter the live timeline and feed from their recorded date and are excluded from retrospective replay.</p>
      <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <label className="text-xs font-medium text-slate-700">Source URL
          <input name="source_url" type="url" required maxLength={2048} placeholder="https://…" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-medium text-slate-700">Publication date (entered by submitter)
          <input name="publication_date" type="date" required className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-medium text-slate-700">Record type
          <select name="signal_type" required className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-700 sm:col-span-2">Verbatim quote (40–300 characters)
          <textarea name="quote" minLength={40} maxLength={300} required rows={3} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-medium text-slate-700 sm:col-span-2">Short summary
          <textarea name="summary" maxLength={1000} required rows={2} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        </label>
        <div className="sm:col-span-2">
          <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">{busy ? "Checking source…" : "Verify quote and save"}</button>
          {message && <p role={error ? "alert" : "status"} className={`mt-2 text-sm ${error ? "text-rose-700" : "text-emerald-800"}`}>{message}</p>}
        </div>
      </form>
    </section>
  );
}

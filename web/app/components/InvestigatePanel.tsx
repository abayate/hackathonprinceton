"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { InvestigationPlan, InvestigationReport } from "@/lib/investigator";

function isInvestigationReport(value: unknown): value is InvestigationReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Record<string, unknown>;
  const statuses = ["complete", "invalid_response", "research_failed", "deadline"];
  if (!statuses.includes(String(report.status)) || !Array.isArray(report.candidates) || !Array.isArray(report.unknowns)
    || !report.unknowns.every((item) => typeof item === "string") || !report.plan || typeof report.plan !== "object"
    || typeof report.truncatedCount !== "number") return false;
  return report.candidates.every((item) => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.index !== "number" || typeof candidate.decision !== "string" || typeof candidate.reason !== "string"
      || !(candidate.source_url === null || typeof candidate.source_url === "string")) return false;
    if (candidate.signal === undefined) return true;
    if (!candidate.signal || typeof candidate.signal !== "object") return false;
    const signal = candidate.signal as Record<string, unknown>;
    return typeof signal.quote === "string" && typeof signal.summary === "string";
  });
}

export default function InvestigatePanel({ plan, configured }: { plan: InvestigationPlan; configured: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<InvestigationReport | null>(null);
  const [error, setError] = useState("");

  async function investigate() {
    if (!configured || running) return;
    setRunning(true);
    setError("");
    setReport(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 65_000);
    try {
      const response = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: plan.projectId }),
        signal: controller.signal,
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok && !isInvestigationReport(body)) {
        const message = body && typeof body === "object" && "detail" in body && typeof body.detail === "string"
          ? body.detail
          : "Investigation could not be completed.";
        setError(message);
        return;
      }
      if (!isInvestigationReport(body)) {
        setError("The investigation service returned an invalid report.");
        return;
      }
      setReport(body);
      if (body.candidates.some((candidate) => candidate.decision === "accepted")) router.refresh();
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "AbortError"
        ? "The investigation request timed out. Try again later."
        : "Could not reach the investigation service. Try again later.");
    } finally {
      clearTimeout(timeout);
      setRunning(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200" aria-labelledby="investigator-heading">
      <h2 id="investigator-heading" className="text-xl font-semibold text-slate-900">AI investigator</h2>
      <p className="mt-1 text-sm text-slate-600">This proposed research plan is built from the project&apos;s public facts. It contains no model-generated scores or dollar estimates.</p>

      <div className="mt-4 rounded-xl bg-slate-50 p-4">
        <h3 className="font-semibold text-slate-900">Investigation plan for {plan.projectName}</h3>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm text-slate-600 sm:grid-cols-2">
          <div><dt className="inline font-semibold">Name: </dt><dd className="inline">{plan.facts.name}</dd></div>
          <div><dt className="inline font-semibold">Company: </dt><dd className="inline">{plan.facts.company || "Unknown"}</dd></div>
          <div><dt className="inline font-semibold">City: </dt><dd className="inline">{plan.facts.city || "Unknown"}</dd></div>
          <div><dt className="inline font-semibold">County: </dt><dd className="inline">{plan.facts.county}</dd></div>
        </dl>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {plan.queries.map((query) => <li key={query}>{query}</li>)}
        </ul>
      </div>

      {!configured && <p className="mt-4 text-sm text-slate-600">Investigator is not configured</p>}
      {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
      <button
        type="button"
        disabled={!configured || running}
        onClick={investigate}
        className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {running ? "Investigating…" : "Investigate"}
      </button>
      {running && <p role="status" className="mt-2 text-sm text-slate-600">Checking proposed sources and quotes. This may take up to 60 seconds.</p>}

      {report && (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <h3 className="font-semibold text-slate-900">Investigation report</h3>
          <p className="mt-1 text-sm text-slate-600">Status: {report.status.replaceAll("_", " ")}</p>
          {report.reason && <p className="mt-1 text-sm text-slate-600">{report.reason}</p>}
          {report.truncatedCount > 0 && <p className="mt-1 text-sm text-slate-600">{report.truncatedCount} additional candidates were not considered because of the run limit.</p>}
          <ul className="mt-3 space-y-3">
            {report.candidates.map((candidate) => (
              <li key={`${candidate.index}:${candidate.source_url ?? "invalid"}`} className="rounded-xl border border-slate-200 p-3">
                <p className="font-medium capitalize text-slate-900">Candidate {candidate.index + 1}: {candidate.decision.replaceAll("_", " ")}</p>
                <p className="mt-1 text-sm text-slate-600">{candidate.reason}</p>
                {candidate.source_url && <a className="mt-1 inline-block text-sm text-sky-700 underline" href={candidate.source_url} target="_blank" rel="noreferrer">{candidate.source_url}</a>}
                {candidate.signal && (
                  <div className="mt-2 text-sm text-slate-700">
                    <blockquote className="border-l-2 border-slate-300 pl-3 italic">“{candidate.signal.quote}”</blockquote>
                    <p className="mt-1">Quote matched to fetched page text; this match does not verify the claim.</p>
                    <p className="mt-1">Publication date proposed by AI investigator, not verified: {candidate.signal.published_at}</p>
                    <p className="mt-1">AI investigator summary (unverified): {candidate.signal.summary}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {report.unknowns.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-slate-800">Still unknown</h4>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
                {report.unknowns.map((unknown, index) => <li key={`${index}:${unknown}`}>{unknown}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

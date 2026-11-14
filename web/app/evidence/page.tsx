import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { listSites } from "@/lib/sites";
import { BAND_COLOR } from "@/lib/model";
import BandBadge from "@/app/components/BandBadge";
import EvidenceMap from "./EvidenceMap";

export const dynamic = "force-dynamic";

type ModelFile = {
  trained: string;
  default_model: string;
  comparisons: Record<string, {
    description: string;
    metrics: { n_stopped: number; n_built: number; roc_auc_mean: number; roc_auc_std: number; stopped_recall_at_0_5: number; stopped_precision_at_0_5: number };
    coefficients: Record<string, number>;
  }>;
};

const FEATURE_TEXT: Record<string, string> = {
  in_city_limits: "Inside city limits",
  in_urban_area: "Inside an urban area",
  log_county_density: "County population density",
  log_km_to_metro: "Distance to the nearest big metro",
  is_crypto: "Crypto mine",
  log_county_projects: "Data centers already in the county",
};

export default async function EvidencePage() {
  const model: ModelFile = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "..", "data", "model", "risk_model.json"), "utf8"),
  );
  const m = model.comparisons[model.default_model];
  const [stopped, all] = await Promise.all([listSites({ status: "stopped" }), listSites({ status: "all" })]);
  const coefs = Object.entries(m.coefficients).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const maxAbs = Math.max(...coefs.map(([, v]) => Math.abs(v)));

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">The evidence behind every score</h1>
      <p className="mt-2 max-w-3xl text-slate-600">
        We trained the risk model on {all.length} real Texas data center projects from public trackers: what got built, and what
        neighbors, councils and moratoriums stopped. Every project links to the news or filing that recorded its outcome.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-4">
        {[
          ["Stopped projects", String(m.metrics.n_stopped)],
          ["Built (comparison)", String(m.metrics.n_built)],
          ["ROC AUC (cross-validated)", `${m.metrics.roc_auc_mean.toFixed(2)} ± ${m.metrics.roc_auc_std.toFixed(2)}`],
          ["Stopped projects flagged", `${Math.round(m.metrics.stopped_recall_at_0_5 * 100)}%`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl p-5 ring-1 ring-slate-200">
            <div className="text-xs uppercase tracking-wide text-slate-500">{k}</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{v}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {m.description}. 5-fold cross-validation repeated 20 times. Small sample: an early signal, not proof.
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="text-xl font-semibold text-slate-900">What predicts a project getting stopped</h2>
          <ul className="mt-4 space-y-3">
            {coefs.map(([k, v]) => (
              <li key={k} className="text-sm">
                <div className="flex justify-between text-slate-700">
                  <span>{FEATURE_TEXT[k] ?? k}</span>
                  <span className={v > 0 ? "text-rose-700" : "text-emerald-700"}>{v > 0 ? "raises risk" : "lowers risk"}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full" style={{ width: `${(Math.abs(v) / maxAbs) * 100}%`, background: v > 0 ? "#e11d48" : "#059669" }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">Standardized logistic regression coefficients. Trained {model.trained}.</p>
        </section>
        <section className="h-[380px] overflow-hidden rounded-2xl ring-1 ring-slate-200">
          <EvidenceMap
            points={all.map((s) => ({
              id: s.project_id, name: s.name, lat: s.lat, lng: s.lng,
              color: s.label === "stopped" ? "#e11d48" : s.label === "built" ? BAND_COLOR.green : "#94a3b8",
              text: "",
            }))}
          />
        </section>
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900">Projects that were stopped</h2>
        <ul className="mt-4 divide-y divide-slate-200 rounded-2xl ring-1 ring-slate-200">
          {stopped.map((s) => (
            <li key={s.project_id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
              <BandBadge band={s.band} />
              <Link href={`/sites/${s.project_id}`} className="min-w-0 flex-1 font-medium text-slate-900 hover:underline">{s.name}</Link>
              <span className="text-slate-500">{s.county}</span>
              <span className="text-slate-500">{s.tracker_status}{s.stop_event_date ? ` · ${s.stop_event_date}` : ""}</span>
              {s.primary_source_url && (
                <a href={s.primary_source_url} target="_blank" rel="noreferrer" className="text-sky-700 underline">
                  {s.primary_source_name ?? "source"}
                </a>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">Badge = the model&apos;s score for that project (in-sample for training projects).</p>
      </section>
    </main>
  );
}

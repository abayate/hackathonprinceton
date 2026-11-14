"use client";

import { useState } from "react";
import { money } from "@/lib/model";
import type { CoolingId, Num, PropertyValuation } from "@/app/components/valuation";

const fmt = (value: number | null, unit: string) => {
  if (value == null || !Number.isFinite(value)) return "Unknown";
  if (unit === "USD") return money(value);
  if (unit === "USD/acre") return `${value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}/acre`;
  if (unit === "gal/yr") return `${(value / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}M gal/yr`;
  if (unit === "MWh/yr") return `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} MWh/yr`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
};

function Tag({ kind }: { kind: Num["kind"] }) {
  return <span className={`ml-1 rounded px-1 text-[10px] uppercase ${kind === "sample" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>{kind}</span>;
}

/** Ten-year cost breakdown with a cooling-design toggle. */
export default function ValuationPanel({ valuation }: { valuation: PropertyValuation }) {
  const [designId, setDesignId] = useState<CoolingId>(valuation.recommended_design);
  const design = valuation.designs.find((d) => d.design_id === designId) ?? valuation.designs[0];
  return (
    <section aria-labelledby="ten-year-cost">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="ten-year-cost" className="text-xl font-semibold text-slate-900">Ten-year cost</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Land, build, power and maintenance over ten years, discounted. Switch cooling to compare power and water.</p>
        </div>
        <div className="flex rounded-lg ring-1 ring-slate-300" role="group" aria-label="Cooling design">
          {valuation.designs.map((d) => (
            <button key={d.design_id} type="button" onClick={() => setDesignId(d.design_id)} aria-pressed={d.design_id === designId}
              className={`px-3 py-1.5 text-sm font-medium first:rounded-l-lg last:rounded-r-lg ${d.design_id === designId ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`}>
              {d.label}{d.design_id === valuation.recommended_design ? " · lowest cost" : ""}
            </button>
          ))}
        </div>
      </div>
      {valuation.is_sample && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">Sample output. The cooling figures, maintenance rate and price ceiling are placeholders until the valuation engine is connected.</p>}
      <dl className="mt-4 divide-y divide-slate-200 rounded-xl ring-1 ring-slate-200">
        {design.cost_lines.map((line) => (
          <div key={line.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm" title={line.amount.note}>
            <dt className="text-slate-600">{line.label}<Tag kind={line.amount.kind} /></dt>
            <dd className="font-medium text-slate-900">{fmt(line.amount.value, line.amount.unit)}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 bg-slate-50 px-4 py-3 text-sm" title={design.ten_year_cost_usd.note}>
          <dt className="font-semibold text-slate-900">Ten-year total<Tag kind={design.ten_year_cost_usd.kind} /></dt>
          <dd className="text-lg font-bold text-slate-900">{fmt(design.ten_year_cost_usd.value, "USD")}</dd>
        </div>
      </dl>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        {[["Facility PUE", design.pue], ["Energy per year", design.annual_energy_mwh], ["Water per year", design.annual_water_gallons]].map(([label, value]) => {
          const n = value as Num;
          return (
            <div key={label as string} className="rounded-xl p-3 ring-1 ring-slate-200" title={n.note}>
              <dt className="text-xs uppercase tracking-wide text-slate-500">{label as string}<Tag kind={n.kind} /></dt>
              <dd className="mt-1 text-lg font-semibold text-slate-900">{fmt(n.value, n.unit)}</dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-3 text-xs leading-5 text-slate-500">Hover a line for its basis. Build cost uses a Dallas benchmark and excludes utility works, IT equipment and fees. A land cost of &quot;Unknown&quot; means the total is unknown, not zero.</p>
    </section>
  );
}

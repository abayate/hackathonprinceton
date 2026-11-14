"use client";

import { useState } from "react";
import { money } from "@/lib/model";
import type { CoolingDesign, PropertyValuation, Tagged } from "@/lib/valuationTypes";
import { COOLING_LABEL, usd, VERDICT_STYLE } from "@/app/components/valuationView";

const GALLONS_PER_M3 = 264.172052;
const DESIGNS: CoolingDesign[] = ["evaporative", "dry"];

const fmt = (t: Tagged) => {
  const v = t.value;
  if (v == null || !Number.isFinite(v)) return "Unknown";
  if (t.unit === "USD") return money(v);
  if (t.unit === "USD/acre") return v < 0 ? "Below zero" : `${usd(v)}/acre`;
  if (t.unit === "USD/kWh") return `$${v.toFixed(3)}/kWh`;
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
};

function Tag({ t }: { t: Tagged }) {
  return <span className={`ml-1 rounded px-1 text-[10px] uppercase ${t.kind === "sample" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`} title={t.source}>{t.kind}</span>;
}

/** Ten-year cost breakdown with a cooling-design toggle and the engine's electricity sensitivity. */
export default function ValuationPanel({ valuation }: { valuation: PropertyValuation }) {
  const [design, setDesign] = useState<CoolingDesign>(valuation.recommendedCooling ?? "evaporative");
  const b = valuation.cooling[design];
  const pue = b.annualItKwh.value && b.annualFacilityKwh.value != null ? b.annualFacilityKwh.value / b.annualItKwh.value : null;
  const lines: [string, Tagged][] = [
    ["Land (asking price)", b.land],
    ["Build", b.build],
    ["Utility connection", b.utility],
    ["Power, 10 years", b.powerPv],
    ["Water, 10 years", b.waterPv],
    ["Maintenance, 10 years", b.maintenancePv],
  ];
  const stats: [string, string, Tagged][] = [
    ["Facility PUE", pue == null ? "Unknown" : pue.toFixed(2), b.annualFacilityKwh],
    ["Energy per year", b.annualFacilityKwh.value == null ? "Unknown" : `${Math.round(b.annualFacilityKwh.value / 1000).toLocaleString("en-US")} MWh`, b.annualFacilityKwh],
    ["Water per year", b.annualWaterM3.value == null ? "Unknown" : `${(b.annualWaterM3.value * GALLONS_PER_M3 / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 })}M gal`, b.annualWaterM3],
  ];
  const sens = valuation.sensitivities.electricity;
  return (
    <section aria-labelledby="ten-year-cost">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="ten-year-cost" className="text-xl font-semibold text-slate-900">Ten-year cost</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Land, build and utility up front; power, water and maintenance over ten years, discounted at {Math.round((valuation.discountRate.value ?? 0) * 100)}%. Switch cooling to compare.</p>
        </div>
        <div className="flex rounded-lg ring-1 ring-slate-300" role="group" aria-label="Cooling design">
          {DESIGNS.map((d) => (
            <button key={d} type="button" onClick={() => setDesign(d)} aria-pressed={d === design}
              className={`px-3 py-1.5 text-sm font-medium first:rounded-l-lg last:rounded-r-lg ${d === design ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`}>
              {COOLING_LABEL[d]}{d === valuation.recommendedCooling ? " · lowest cost" : ""}
            </button>
          ))}
        </div>
      </div>
      {valuation.sampleTainted && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">Some inputs below are sample placeholders (tagged <strong>sample</strong>) until sourced market inputs are connected.</p>}
      <dl className="mt-4 divide-y divide-slate-200 rounded-xl ring-1 ring-slate-200">
        {lines.map(([label, t]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm" title={t.note}>
            <dt className="text-slate-600">{label}<Tag t={t} /></dt>
            <dd className="font-medium text-slate-900">{fmt(t)}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 bg-slate-50 px-4 py-3 text-sm">
          <dt className="font-semibold text-slate-900">Ten-year total<Tag t={b.totalPv} /></dt>
          <dd className="text-lg font-bold text-slate-900">{fmt(b.totalPv)}</dd>
        </div>
      </dl>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        {stats.map(([label, value, t]) => (
          <div key={label} className="rounded-xl p-3 ring-1 ring-slate-200">
            <dt className="text-xs uppercase tracking-wide text-slate-500">{label}<Tag t={t} /></dt>
            <dd className="mt-1 text-lg font-semibold text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
      {sens.length > 0 && (
        <div className="mt-6">
          <h3 className="text-base font-semibold text-slate-900">If electricity costs more or less</h3>
          <p className="mt-1 text-xs text-slate-500">Uses the lowest-cost cooling design and the same comparison site.</p>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-1.5 font-medium">Electricity</th><th className="font-medium">Ten-year total</th><th className="font-medium">Price ceiling</th><th className="font-medium">Verdict</th></tr></thead>
            <tbody className="divide-y divide-slate-200">
              {sens.map((s) => (
                <tr key={s.electricityMultiplier.value ?? 0}>
                  <td className="py-2 text-slate-700">{Math.round((s.electricityMultiplier.value ?? 1) * 100 - 100) === 0 ? "As modeled" : `${(s.electricityMultiplier.value ?? 1) > 1 ? "+" : ""}${Math.round((s.electricityMultiplier.value ?? 1) * 100 - 100)}%`} <span className="text-slate-500">({fmt(s.electricityUsdPerKwh)})</span></td>
                  <td className="font-medium text-slate-900">{fmt(s.totalPv)}</td>
                  <td className="font-medium text-slate-900">{fmt(s.maxLandPricePerAcre)}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs font-bold text-white ${VERDICT_STYLE[s.verdict].cls}`}>{VERDICT_STYLE[s.verdict].label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs leading-5 text-slate-500">Hover a line for its basis. &quot;Unknown&quot; means the total is unknown, not zero.</p>
    </section>
  );
}

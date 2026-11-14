import { BAND_COLOR, type Band } from "@/lib/model";

const STYLE: Record<Band, { label: string; cls: string }> = {
  green: { label: "Low risk", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  watch: { label: "Watch", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  red: { label: "High risk", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
};

export default function BandBadge({ band }: { band: Band | null }) {
  if (!band) return <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">Unscored</span>;
  const s = STYLE[band];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${s.cls}`}>{s.label}</span>;
}

export { BAND_COLOR };

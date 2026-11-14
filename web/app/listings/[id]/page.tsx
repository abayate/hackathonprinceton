import { parseMw } from "@/lib/params";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getListing, projectsNearby, saferListingsNearby } from "@/lib/listings";
import { watchlistIds } from "@/lib/sites";
import { checksForListing, type CheckStatus } from "@/lib/checks";
import { BAND_COLOR, CONSTANTS, displayScore, economics, money, stoppedShareForBand } from "@/lib/model";
import HeartButton from "@/app/components/HeartButton";
import BandBadge from "@/app/components/BandBadge";
import { getModelArtifact } from "@/lib/modelArtifact";
import Site3D from "./Site3D";
import { isPublicDataMode } from "@/lib/dataMode";
import { askingPricePerAcre } from "@/lib/propertyReview";
import PropertyImage from "@/app/components/PropertyImage";
import PropertyDiligence from "./PropertyDiligence";

export const dynamic = "force-dynamic";

const STATUS: Record<CheckStatus, { icon: string; cls: string; label: string }> = {
  pass: { icon: "✓", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Pass" },
  watch: { icon: "!", cls: "bg-amber-50 text-amber-700 ring-amber-200", label: "Watch" },
  fail: { icon: "✕", cls: "bg-rose-50 text-rose-700 ring-rose-200", label: "Fail" },
  unknown: { icon: "?", cls: "bg-slate-50 text-slate-500 ring-slate-200", label: "Unknown" },
};

const VIEWS = [
  ["north", "From the south"],
  ["east", "From the west"],
  ["south", "From the north"],
  ["west", "From the east"],
] as const;

export default async function ListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mw?: string }>;
}) {
  if (isPublicDataMode()) notFound();
  const { id } = await params;
  const mw = parseMw((await searchParams).mw);
  const l = await getListing(id);
  if (!l) notFound();
  const [safer, evidence, modelArtifact] = await Promise.all([saferListingsNearby(id), projectsNearby(id), getModelArtifact()]);
  const clientId = (await cookies()).get("client_id")?.value;
  const saved = clientId ? (await watchlistIds(clientId)).includes(id) : false;
  const stoppedShare = stoppedShareForBand(l.band, modelArtifact.metrics.band_outcomes_oof);
  const e = economics(stoppedShare, mw);
  const checks = checksForListing(l);
  const img = (view: string, size = "full") => `/api/vexcel/image/${l.site_id}?view=${view}&size=${size}`;
  const color = BAND_COLOR[l.band ?? "none"];
  const pricePerAcre = askingPricePerAcre(l.asking_price, l.lot_acres);
  const recordedPrice = l.asking_price !== null && Number.isFinite(l.asking_price) && l.asking_price > 0 ? l.asking_price : null;
  const missingFacts = [
    recordedPrice === null ? "Asking price" : null,
    !l.lot_acres ? "Parcel acreage" : null,
    !l.zoning ? "Recorded zoning" : null,
    l.heavy_power === null ? "Recorded power service" : null,
    "Utility capacity and connection date", "Flood exposure and terrain", "Maximum purchase price and ten-year total cost",
  ].filter(Boolean);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <Link href={`/?mw=${mw}${l.state === "CA" ? "&market=la" : ""}`} className="text-sm font-medium text-slate-500 hover:text-slate-900">
        ← Browse prospects
      </Link>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{l.name}</h1>
          <p className="mt-1 text-slate-600">
            {l.address}, {l.city}, {l.state} · {l.property_type}
            {l.year_built ? ` · built ${l.year_built}` : ""}
          </p>
        </div>
        <HeartButton projectId={l.site_id} saved={saved} />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d5e1da] bg-[#f5f8f6] px-4 py-3">
        <p className="max-w-2xl text-sm leading-6 text-slate-600">CoStar property record. Confirm price, availability and suitability with the owner or broker before pursuing it.</p>
        <a href="#property-review" className="rounded-lg bg-[#215f4c] px-4 py-2 text-sm font-semibold text-white">Review this prospect</a>
      </div>

      {/* Gallery: Vexcel top-down + four oblique angles */}
      <div className="mt-5 grid h-[280px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-2xl sm:h-[420px]">
        <a href={img("ortho")} target="_blank" rel="noreferrer" className="col-span-2 row-span-2 bg-slate-200">
          <PropertyImage src={img("ortho")} alt="Top-down aerial" className="h-full w-full" fallbackLabel="Aerial imagery unavailable" />
        </a>
        {VIEWS.map(([v, label]) => (
          <a key={v} href={img(v)} target="_blank" rel="noreferrer" className="relative bg-slate-200">
            <PropertyImage src={img(v, "thumb")} alt={`Oblique view ${label.toLowerCase()}`} className="h-full w-full" fallbackLabel="View unavailable" />
            <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">{label}</span>
          </a>
        ))}
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">Vexcel imagery, when available. Aerials alone do not establish parcel boundaries, flood risk or terrain suitability.</p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-10">
          {/* Headline numbers */}
          <section className="flex flex-wrap gap-x-8 gap-y-3 border-b border-slate-200 pb-8">
            {[
              ["Lot", l.lot_acres ? `${l.lot_acres} acres` : "—"],
              ["Building", l.building_sf ? `${Math.round(l.building_sf).toLocaleString()} sf` : "—"],
              ["Clear height", l.ceiling_ft ? `${l.ceiling_ft} ft` : "—"],
              ["Power", l.heavy_power ? "Heavy power" : l.heavy_power === false ? "Standard" : "—"],
              ["Water stress", l.water_stress_label?.split(" (")[0] ?? "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-xs uppercase tracking-wide text-slate-500">{k}</div>
                <div className="text-lg font-semibold text-slate-900">{v}</div>
              </div>
            ))}
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">Resolve before an acquisition decision</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">These facts are missing or have not been verified for this property. A recorded heavy-power service or acreage does not establish capacity for your workload.</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {missingFacts.map((fact) => <li key={fact} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{fact}</li>)}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">Property screening checks</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Seven preliminary checks. A pass reflects the stated rule and recorded inputs, not verified development feasibility. Open a check for its basis and sources.</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {checks.map((c) => (
                <li key={c.id} className="rounded-xl ring-1 ring-slate-200">
                  <details className="group p-4">
                    <summary className="flex cursor-pointer list-none items-center gap-3">
                      <span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ring-1 ${STATUS[c.status].cls}`}>{STATUS[c.status].icon}</span>
                      <span className="font-medium text-slate-900">{c.title}</span>
                      <span className={`ml-auto text-xs font-semibold ${STATUS[c.status].cls.split(" ")[1]}`}>{STATUS[c.status].label}</span>
                    </summary>
                    <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                      <p>{c.detail}</p>
                      <p className="text-xs text-slate-500">How we decide: {c.basis}</p>
                      {c.sources.length > 0 && (
                        <p className="text-xs text-slate-500">
                          Sources:{" "}
                          {c.sources.map((s, i) => (
                            <span key={s.label}>
                              {i > 0 && " · "}
                              {s.url ? <a className="text-sky-700 underline" href={s.url} target="_blank" rel="noreferrer">{s.label}</a> : s.label}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </section>

          <PropertyDiligence key={l.site_id} propertyId={l.site_id} />

          <section>
            <h2 className="text-xl font-semibold text-slate-900">3D area view</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Vexcel 3D coverage requires a configured provider. When available, drag to orbit and scroll to zoom. Terrain analysis has not been verified.</p>
            <div className="mt-4 h-[420px] overflow-hidden rounded-2xl ring-1 ring-slate-200">
              <Site3D pin={{ id: l.site_id, name: l.name, lat: l.lat, lng: l.lng, color }} />
            </div>
          </section>

          {l.matterport_model_id && (
            <section>
              <h2 className="text-xl font-semibold text-slate-900">Linked building scan</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">Matterport scan linked in the record. Its match to this property has not been verified; do not use it to confirm dimensions or layout.</p>
              <div className="mt-4 aspect-video overflow-hidden rounded-2xl ring-1 ring-slate-200">
                <iframe
                  title="Matterport walkthrough"
                  src={`https://my.matterport.com/show/?m=${l.matterport_model_id}&play=1&qs=1&brand=0`}
                  className="h-full w-full"
                  allow="xr-spatial-tracking; fullscreen"
                  allowFullScreen
                />
              </div>
            </section>
          )}

          <section>
            <h2 className="text-xl font-semibold text-slate-900">Regional context, not evidence about this property</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">The closest projects in the Texas tracker are shown with their distance; they may be far from this prospect. Their news and outcomes do not establish conditions on this parcel, and these labels have not been independently verified.</p>
            <ul className="mt-4 divide-y divide-slate-200 rounded-xl ring-1 ring-slate-200">
              {evidence.map((p) => (
                <li key={p.project_id} className="flex items-center gap-3 p-3 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.label === "stopped" ? "bg-rose-50 text-rose-700" : p.label === "built" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    Tracker label: {p.label === "unlabeled" ? "proposed" : p.label}
                  </span>
                  <Link href={`/sites/${p.project_id}`} className="min-w-0 flex-1 truncate text-slate-900 hover:underline">{p.name}</Link>
                  <span className="shrink-0 text-slate-500">{p.km} km</span>
                </li>
              ))}
            </ul>
            <Link href="/projects" className="mt-3 inline-block text-sm font-medium text-[#215f4c] underline">Explore project research</Link>
          </section>

          {safer.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold text-slate-900">Nearby prospects with lower screening scores</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">Area-level Texas model context; a lower score does not establish property feasibility or investment value.</p>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {safer.map((s) => (
                  <li key={s.site_id}>
                    <Link href={`/listings/${s.site_id}?mw=${mw}`} className="group flex gap-3 rounded-xl p-2 ring-1 ring-slate-200 hover:shadow-md">
                      <PropertyImage src={`/api/vexcel/image/${s.site_id}?view=ortho&size=thumb`} alt={`Aerial view of ${s.name}`} className="h-20 w-24 shrink-0 rounded-lg" fallbackLabel="Image unavailable" />
                      <div className="min-w-0 text-sm">
                        <p className="truncate font-medium text-slate-900 group-hover:underline">{s.name}</p>
                        <p className="text-slate-500">{s.property_type}{s.lot_acres ? ` · ${s.lot_acres} ac` : ""}</p>
                        <p className="text-slate-500">Screening score {displayScore(s.p_stopped)}/100 · {s.km} km away</p>
                        <BandBadge band={s.band} />
                        {stoppedShareForBand(s.band, modelArtifact.metrics.band_outcomes_oof) != null && (
                          <p className="text-xs text-slate-500">{(stoppedShareForBand(s.band, modelArtifact.metrics.band_outcomes_oof)! * 100).toFixed(1)}% of tracked Texas data center projects in this band were stopped (cross-validation).</p>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Decision box */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl p-6 shadow-xl ring-1 ring-slate-200">
            <p className="text-sm font-medium text-slate-600">Recorded asking price</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-[#173831]">{recordedPrice === null ? "Not recorded" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(recordedPrice)}</p>
            <p className="mt-1 text-sm text-slate-600">{pricePerAcre === null ? "Asking price per acre unknown" : `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(pricePerAcre)} per acre · derived`}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">CoStar snapshot; price date and current availability are not verified. Price per acre divides the recorded asking price by recorded lot size.</p>
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-slate-600">Maximum purchase price</dt><dd className="font-medium text-slate-900">Not calculated</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-600">Ten-year total cost</dt><dd className="font-medium text-slate-900">Not calculated</dd></div>
            </dl>
            <a href="#property-review" className="mt-5 block rounded-lg bg-[#215f4c] px-4 py-3 text-center text-sm font-semibold text-white">Start property diligence</a>
            <h2 className="mt-6 border-t border-slate-200 pt-5 text-base font-semibold text-slate-900">Area screening and cost assumptions</h2>
            <p className="mb-3 mt-2 text-xs leading-5 text-slate-500">The location-context model was trained on tracked Texas projects. It is not a property outcome probability. The scenario below is not a land valuation.</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: color }} />
              {l.p_stopped == null ? <span className="text-sm font-semibold text-slate-700">Not scored</span> : (
                <>
                  <span className="text-sm font-semibold text-slate-700">Risk score {displayScore(l.p_stopped)}/100</span>
                  <BandBadge band={l.band} />
                </>
              )}
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-900">{money(e.expectedDelayCost)}</p>
            <p className="text-sm text-slate-500">
              delay exposure scenario at {mw} MW{e.expectedDelayMonths != null ? ` · ${e.expectedDelayMonths.toFixed(1)} months of lease exposure` : ""}
            </p>
            {stoppedShare == null ? (
              <p className="mt-2 text-xs text-slate-500">No cross-validation band outcome estimate for this site.</p>
            ) : (
              <p className="mt-2 text-xs text-slate-500">{(stoppedShare * 100).toFixed(1)}% of tracked Texas data center projects scored in this band were stopped (cross-validation). Small sample; today&apos;s features.</p>
            )}
            <form method="get" className="mt-5 flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2">
              <label htmlFor="mw" className="text-xs font-semibold uppercase text-slate-500">Load</label>
              <input id="mw" name="mw" type="number" min={1} defaultValue={mw} className="w-full text-sm text-slate-900 outline-none" />
              <span className="text-sm text-slate-500">MW</span>
              <button className="rounded-lg bg-slate-900 px-3 py-1 text-sm font-semibold text-white">Update</button>
            </form>
            <dl className="mt-5 space-y-2.5 text-sm">
              <Row label="Build cost" value={money(e.buildCost)} tag="modeled" note={CONSTANTS.buildCostUsdPerW.note} />
              <Row label="Power per year" value={money(e.annualPower)} tag="modeled" note={`${CONSTANTS.electricityUsdPerKwh.note}; PUE ${CONSTANTS.pue.value}, ${CONSTANTS.avgLoad.value * 100}% load (assumed)`} />
              <Row label="Lease revenue / month" value={money(e.monthlyLease)} tag="modeled" note={CONSTANTS.leaseUsdPerKwMonth.note} />
              <div className="border-t border-slate-200" />
              <Row label="Lease exposure (months)" value={e.expectedDelayMonths == null ? "—" : `${e.expectedDelayMonths.toFixed(1)} mo`} tag="assumed" note="Band's stopped share × 12 months (assumed)" />
              <Row label="Delay exposure scenario" value={money(e.expectedDelayCost)} tag="modeled" note="Scenario duration × monthly lease revenue" strong />
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              Build cost uses a Dallas benchmark; power uses a Texas price assumption, including for LA prospects. These are illustrative inputs, not local quotes. The scenario excludes land, utility work, IT equipment and fees. Hover a row for its source.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function Row({ label, value, tag, note, strong }: { label: string; value: string; tag: string; note?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3" title={note}>
      <dt className="text-slate-600">
        {label} <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] uppercase text-slate-500">{tag}</span>
      </dt>
      <dd className={strong ? "font-bold text-slate-900" : "font-medium text-slate-900"}>{value}</dd>
    </div>
  );
}

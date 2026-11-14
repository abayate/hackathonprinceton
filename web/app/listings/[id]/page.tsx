import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getListing, projectsNearby, saferListingsNearby } from "@/lib/listings";
import { watchlistIds } from "@/lib/sites";
import { checksForListing, type CheckStatus } from "@/lib/checks";
import { BAND_COLOR, CONSTANTS, economics, money } from "@/lib/model";
import HeartButton from "@/app/components/HeartButton";
import Site3D from "./Site3D";

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
  const { id } = await params;
  const mw = Math.max(1, Number((await searchParams).mw) || 100);
  const l = await getListing(id);
  if (!l) notFound();
  const [safer, evidence] = await Promise.all([saferListingsNearby(id), projectsNearby(id)]);
  const clientId = (await cookies()).get("client_id")?.value;
  const saved = clientId ? (await watchlistIds(clientId)).includes(id) : false;
  const e = economics(l.p_stopped, mw);
  const checks = checksForListing(l);
  const img = (view: string, size = "full") => `/api/vexcel/image/${l.site_id}?view=${view}&size=${size}`;
  const color = BAND_COLOR[l.band ?? "none"];

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <Link href={`/?mw=${mw}${l.state === "CA" ? "&market=la" : ""}`} className="text-sm font-medium text-slate-500 hover:text-slate-900">
        ← All sites
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

      {/* Gallery: Vexcel top-down + four oblique angles */}
      <div className="mt-5 grid h-[420px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-2xl">
        <a href={img("ortho")} target="_blank" rel="noreferrer" className="col-span-2 row-span-2 bg-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img("ortho")} alt="Top-down aerial" className="h-full w-full object-cover hover:opacity-95" />
        </a>
        {VIEWS.map(([v, label]) => (
          <a key={v} href={img(v)} target="_blank" rel="noreferrer" className="relative bg-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img(v, "thumb")} alt={`Oblique view ${label.toLowerCase()}`} loading="lazy" className="h-full w-full object-cover hover:opacity-95" />
            <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">{label}</span>
          </a>
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-400">Aerial and oblique imagery © Vexcel Imaging</p>

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
            <h2 className="text-xl font-semibold text-slate-900">Will it get built?</h2>
            <p className="mt-1 text-sm text-slate-500">Seven checks. Open one to see how it was decided and where the data came from.</p>
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

          <section>
            <h2 className="text-xl font-semibold text-slate-900">Fly around it in 3D</h2>
            <p className="mt-1 text-sm text-slate-500">Vexcel 3D city model. Drag to orbit, scroll to zoom.</p>
            <div className="mt-4 h-[420px] overflow-hidden rounded-2xl ring-1 ring-slate-200">
              <Site3D pin={{ id: l.site_id, name: l.name, lat: l.lat, lng: l.lng, color }} />
            </div>
          </section>

          {l.matterport_model_id && (
            <section>
              <h2 className="text-xl font-semibold text-slate-900">Walk the building</h2>
              <p className="mt-1 text-sm text-slate-500">Matterport 3D capture: check clear height, column spacing and room for electrical gear.</p>
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
            <h2 className="text-xl font-semibold text-slate-900">Real projects nearby</h2>
            <p className="mt-1 text-sm text-slate-500">Data center projects from the tracker closest to this site, with what happened to them.</p>
            <ul className="mt-4 divide-y divide-slate-200 rounded-xl ring-1 ring-slate-200">
              {evidence.map((p) => (
                <li key={p.project_id} className="flex items-center gap-3 p-3 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.label === "stopped" ? "bg-rose-50 text-rose-700" : p.label === "built" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {p.label === "unlabeled" ? "proposed" : p.label}
                  </span>
                  <Link href={`/sites/${p.project_id}`} className="min-w-0 flex-1 truncate text-slate-900 hover:underline">{p.name}</Link>
                  <span className="shrink-0 text-slate-500">{p.km} km</span>
                </li>
              ))}
            </ul>
          </section>

          {safer.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold text-slate-900">Lower-risk sites nearby</h2>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {safer.map((s) => (
                  <li key={s.site_id}>
                    <Link href={`/listings/${s.site_id}?mw=${mw}`} className="group flex gap-3 rounded-xl p-2 ring-1 ring-slate-200 hover:shadow-md">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/vexcel/image/${s.site_id}?view=ortho&size=thumb`} alt="" loading="lazy" className="h-20 w-24 rounded-lg object-cover" />
                      <div className="min-w-0 text-sm">
                        <p className="truncate font-medium text-slate-900 group-hover:underline">{s.name}</p>
                        <p className="text-slate-500">{s.property_type}{s.lot_acres ? ` · ${s.lot_acres} ac` : ""}</p>
                        <p className="text-slate-500">{Math.round(s.p_stopped * 100)}% risk · {s.km} km away</p>
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
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: color }} />
              <span className="text-sm font-semibold text-slate-700">
                {l.p_stopped == null ? "Not scored" : `${Math.round(l.p_stopped * 100)}% chance blocked or delayed`}
              </span>
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-900">{money(e.expectedDelayCost)}</p>
            <p className="text-sm text-slate-500">
              expected delay cost at {mw} MW{e.expectedDelayMonths != null ? ` · ${e.expectedDelayMonths.toFixed(1)} months` : ""}
            </p>
            <form method="get" className="mt-5 flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2">
              <label htmlFor="mw" className="text-xs font-semibold uppercase text-slate-500">Load</label>
              <input id="mw" name="mw" type="number" min={1} defaultValue={mw} className="w-full text-sm text-slate-900 outline-none" />
              <span className="text-sm text-slate-500">MW</span>
              <button className="rounded-lg bg-slate-900 px-3 py-1 text-sm font-semibold text-white">Update</button>
            </form>
            <dl className="mt-5 space-y-2.5 text-sm">
              <Row label="Asking price" value={l.asking_price ? money(l.asking_price) : "Not listed"} tag="CoStar" />
              <Row label="Build cost" value={money(e.buildCost)} tag="reported" note={CONSTANTS.buildCostUsdPerW.note} />
              <Row label="Power per year" value={money(e.annualPower)} tag="modeled" note={`${CONSTANTS.electricityUsdPerKwh.note}; PUE ${CONSTANTS.pue.value}, ${CONSTANTS.avgLoad.value * 100}% load (assumed)`} />
              <Row label="Lease revenue / month" value={money(e.monthlyLease)} tag="reported" note={CONSTANTS.leaseUsdPerKwMonth.note} />
              <div className="border-t border-slate-200" />
              <Row label="Expected delay" value={e.expectedDelayMonths == null ? "—" : `${e.expectedDelayMonths.toFixed(1)} mo`} tag="modeled" note={`Chance × ${CONSTANTS.typicalDelayMonths.value} months typical delay (assumed)`} />
              <Row label="Expected delay cost" value={money(e.expectedDelayCost)} tag="modeled" note="Expected delay × monthly lease revenue" strong />
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              Build cost uses the Dallas benchmark and excludes land, utility work, IT equipment and fees. Hover a row for its source.
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

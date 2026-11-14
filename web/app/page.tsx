import Link from "next/link";
import { cookies } from "next/headers";
import { listListings, type ListingFilters } from "@/lib/listings";
import { watchlistIds } from "@/lib/sites";
import Explore, { type Card } from "./components/Explore";

export const dynamic = "force-dynamic";

type SP = ListingFilters & { mw?: string };

function href(sp: SP, patch: Partial<SP>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) q.set(k, String(v));
  return `/?${q}`;
}

function Chip({ to, on, children }: { to: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={to}
      className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition ${
        on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-900"
      }`}
    >
      {children}
    </Link>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const market = sp.market ?? "houston";
  const mw = Math.max(1, Number(sp.mw) || 100);
  const listings = await listListings({ ...sp, market });
  const clientId = (await cookies()).get("client_id")?.value;
  const saved = clientId ? await watchlistIds(clientId) : [];

  const cards: Card[] = listings.map((l) => ({
    site_id: l.site_id, name: l.name, city: l.city, state: l.state, lat: l.lat, lng: l.lng,
    property_type: l.property_type, lot_acres: l.lot_acres, building_sf: l.building_sf, ceiling_ft: l.ceiling_ft,
    heavy_power: l.heavy_power, asking_price: l.asking_price, water_stress_label: l.water_stress_label,
    p_stopped: l.p_stopped, band: l.band,
  }));

  return (
    <main className="mx-auto max-w-[1600px] px-4 sm:px-6">
      <div className="sticky top-16 z-10 -mx-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-2 flex rounded-full bg-slate-100 p-1">
            {[["houston", "Houston"], ["la", "Los Angeles"]].map(([k, label]) => (
              <Link key={k} href={href(sp, { market: k })}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${market === k ? "bg-white text-slate-900 shadow" : "text-slate-600"}`}>
                {label}
              </Link>
            ))}
          </div>
          <Chip to={href(sp, { type: undefined })} on={!sp.type}>All types</Chip>
          {["Industrial", "Flex", "Land"].map((t) => (
            <Chip key={t} to={href(sp, { type: t })} on={sp.type === t}>{t}</Chip>
          ))}
          <span className="mx-1 h-6 w-px bg-slate-200" />
          <Chip to={href(sp, { power: sp.power === "1" ? undefined : "1" })} on={sp.power === "1"}>⚡ Heavy power</Chip>
          <Chip to={href(sp, { acres: sp.acres === "5" ? undefined : "5" })} on={sp.acres === "5"}>5+ acres</Chip>
          {market === "houston" && (
            <>
              <Chip to={href(sp, { band: sp.band === "green" ? undefined : "green" })} on={sp.band === "green"}>Low risk only</Chip>
            </>
          )}
          <form className="ml-auto flex items-center gap-2 text-sm text-slate-600" method="get">
            {Object.entries(sp).filter(([k]) => k !== "mw").map(([k, v]) => <input key={k} type="hidden" name={k} value={String(v)} />)}
            <label htmlFor="mw">Your load</label>
            <input id="mw" name="mw" type="number" min={1} defaultValue={mw} className="w-20 rounded-full border border-slate-300 px-3 py-1.5 text-slate-900" />
            <span>MW</span>
          </form>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          {listings.length} sites · real aerials by Vexcel · property data by CoStar
          {market === "la" && " · risk model is Texas-only, so LA sites are unscored"}
        </p>
      </div>
      <div className="py-5">
        <Explore cards={cards} mw={mw} saved={saved} />
      </div>
    </main>
  );
}

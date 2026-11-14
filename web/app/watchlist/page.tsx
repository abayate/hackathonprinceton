import Link from "next/link";
import { cookies } from "next/headers";
import { getSites, watchlistIds } from "@/lib/sites";
import { getListings } from "@/lib/listings";
import { economics, money } from "@/lib/model";
import BandBadge from "@/app/components/BandBadge";
import HeartButton from "@/app/components/HeartButton";

export const dynamic = "force-dynamic";

export default async function WatchlistPage({ searchParams }: { searchParams: Promise<{ mw?: string }> }) {
  const mw = Math.max(1, Number((await searchParams).mw) || 100);
  const clientId = (await cookies()).get("client_id")?.value;
  const ids = clientId ? await watchlistIds(clientId) : [];
  const [listings, projects] = await Promise.all([
    getListings(ids.filter((i) => i.startsWith("costar-"))),
    getSites(ids.filter((i) => !i.startsWith("costar-"))),
  ]);

  const rows = [
    ...listings.map((l) => ({
      id: l.site_id, href: `/listings/${l.site_id}?mw=${mw}`, name: l.name, place: `${l.city}, ${l.state}`,
      img: `/api/vexcel/image/${l.site_id}?view=ortho&size=thumb`, band: l.band, p: l.p_stopped,
      water: l.water_stress_label, zoning: l.in_city_limits == null ? "—" : l.in_city_limits ? "City vote" : "Unincorporated",
      acres: l.lot_acres, power: l.heavy_power ? "Heavy" : l.heavy_power === false ? "Standard" : "—", price: l.asking_price,
    })),
    ...projects.map((s) => ({
      id: s.project_id, href: `/sites/${s.project_id}?mw=${mw}`, name: s.name, place: s.city ?? s.county,
      img: null, band: s.band, p: s.p_stopped, water: s.water_stress_label,
      zoning: s.in_city_limits == null ? "—" : s.in_city_limits ? "City vote" : "Unincorporated",
      acres: s.land_acres, power: "—", price: null,
    })),
  ];

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Watchlist</h1>
      <p className="mt-1 text-slate-600">Your saved sites side by side at {mw} MW.</p>

      {!rows.length ? (
        <div className="mt-8 rounded-2xl p-10 text-center ring-1 ring-slate-200">
          <p className="text-slate-600">Nothing saved yet. Tap the heart on any site.</p>
          <Link href="/" className="mt-4 inline-block rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white">Find sites</Link>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl ring-1 ring-slate-200">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="p-3">Site</th><th className="p-3">Risk</th><th className="p-3">Chance blocked/delayed</th>
                <th className="p-3">Expected delay cost</th><th className="p-3">Asking</th><th className="p-3">Acres</th>
                <th className="p-3">Power</th><th className="p-3">Water stress</th><th className="p-3">Zoning</th><th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="p-3">
                    <Link href={r.href} className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {r.img ? <img src={r.img} alt="" className="h-12 w-16 rounded-lg object-cover" /> : <span className="h-12 w-16 rounded-lg bg-slate-100" />}
                      <span>
                        <span className="block font-medium text-slate-900 hover:underline">{r.name}</span>
                        <span className="text-xs text-slate-500">{r.place}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="p-3"><BandBadge band={r.band as never} /></td>
                  <td className="p-3">{r.p == null ? "—" : `${Math.round(r.p * 100)}%`}</td>
                  <td className="p-3 font-semibold">{money(economics(r.p, mw).expectedDelayCost)}</td>
                  <td className="p-3">{r.price ? money(r.price) : "—"}</td>
                  <td className="p-3">{r.acres ?? "—"}</td>
                  <td className="p-3">{r.power}</td>
                  <td className="p-3">{r.water?.split(" (")[0] ?? "—"}</td>
                  <td className="p-3">{r.zoning}</td>
                  <td className="p-3 text-right"><HeartButton projectId={r.id} saved /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

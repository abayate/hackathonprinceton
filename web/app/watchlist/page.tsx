import { isClientId, parseAsOf, parseMw } from "@/lib/params";
import Link from "next/link";
import { cookies } from "next/headers";
import { getSites, watchlistEntries } from "@/lib/sites";
import { getListings } from "@/lib/listings";
import { displayScore, economics, money, stoppedShareForBand, type Band } from "@/lib/model";
import { buildChangeFeed, buildTimeline, evidenceBaseline, type SavedEntity } from "@/lib/signals";
import { getSignals } from "@/lib/signalStore";
import BandBadge from "@/app/components/BandBadge";
import HeartButton from "@/app/components/HeartButton";
import PropertyImage from "@/app/components/PropertyImage";
import { getModelArtifact } from "@/lib/modelArtifact";
import { isPublicDataMode } from "@/lib/dataMode";
import PublicModeBanner from "@/app/components/PublicModeBanner";
import ChangeFeed from "@/app/components/ChangeFeed";
import { isEvidenceIntakeEnabled, isInvestigatorEnabled } from "@/lib/featureFlags";
import { getIntakeSignals } from "@/lib/intakeStore";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  href: string;
  name: string;
  place: string;
  img: string | null;
  band: Band | null;
  score: number | null;
  share: number | null;
  water: string | null;
  zoning: string;
  acres: number | null;
  power: string;
  price: number | null;
  county: string | null;
  state: string | null;
  city: string | null;
  inCityLimits: boolean | null;
};

export default async function WatchlistPage({ searchParams }: { searchParams: Promise<{ mw?: string; since?: string }> }) {
  const sp = await searchParams;
  const mw = parseMw(sp.mw);
  const since = parseAsOf(sp.since);
  const clientId = (await cookies()).get("client_id")?.value;
  const savedAt = clientId ? await watchlistEntries(clientId) : [];
  const ids = savedAt.map((entry) => entry.project_id);
  const publicMode = isPublicDataMode();
  const intakeEnabled = publicMode && (isEvidenceIntakeEnabled() || isInvestigatorEnabled());
  const [listings, projects, modelArtifact, storedSignals, intakeSignals] = await Promise.all([
    publicMode ? Promise.resolve([]) : getListings(ids.filter((id) => id.startsWith("costar-"))),
    getSites(ids.filter((id) => !id.startsWith("costar-"))),
    getModelArtifact(),
    getSignals(),
    intakeEnabled && isClientId(clientId) ? getIntakeSignals(clientId) : Promise.resolve([]),
  ]);
  const signals = [...storedSignals, ...intakeSignals];
  const rows: Row[] = [
    ...listings.map((l) => ({
      id: l.site_id, href: `/listings/${l.site_id}?mw=${mw}`, name: l.name, place: `${l.city}, ${l.state}`,
      county: l.county, state: l.state,
      city: l.city, inCityLimits: l.in_city_limits,
      img: `/api/vexcel/image/${l.site_id}?view=ortho&size=thumb`, band: l.band, score: l.p_stopped,
      share: stoppedShareForBand(l.band, modelArtifact.metrics.band_outcomes_oof),
      water: l.water_stress_label, zoning: l.in_city_limits == null ? "—" : l.in_city_limits ? "City vote" : "Unincorporated",
      acres: l.lot_acres, power: l.heavy_power ? "Heavy" : l.heavy_power === false ? "Standard" : "—", price: l.asking_price,
    })),
    ...projects.map((s) => ({
      id: s.project_id, href: `/sites/${s.project_id}?mw=${mw}`, name: s.name, place: s.city ?? s.county,
      county: s.county, state: "TX",
      city: s.city, inCityLimits: s.in_city_limits,
      img: null, band: s.band, score: s.p_stopped,
      share: stoppedShareForBand(s.band, modelArtifact.metrics.band_outcomes_oof), water: s.water_stress_label,
      zoning: s.in_city_limits == null ? "—" : s.in_city_limits ? "City vote" : "Unincorporated",
      acres: s.land_acres, power: "—", price: null,
    })),
  ];

  const entryById = new Map(savedAt.map((entry) => [entry.project_id, entry]));
  const savedEntities: SavedEntity[] = rows.flatMap((row) => {
    const saved = entryById.get(row.id);
    if (!saved || (since === undefined && !Number.isFinite(Date.parse(saved.added_at)))) return [];
    return [{
      entityId: row.id,
      name: row.name,
      modelBand: row.band,
      savedAt: saved.added_at,
      county: row.county,
      state: row.state,
      city: row.city,
      inCityLimits: row.inCityLimits,
    }];
  });
  const holdoutDemo = modelArtifact.holdoutDemo;
  const changeEntries = buildChangeFeed(signals, savedEntities, holdoutDemo, since);

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
      {publicMode && <PublicModeBanner savedLocalSession />}
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Watchlist</h1>
      <p className="mt-1 text-slate-600">Your saved sites side by side at {mw} MW.</p>
      <ChangeFeed entries={changeEntries} since={since} mw={mw} intakeEnabled={intakeEnabled} />

      {!rows.length ? (
        <div className="mt-8 rounded-2xl p-10 text-center ring-1 ring-slate-200">
          <p className="text-slate-600">Nothing saved yet. Tap the heart on any site.</p>
          <Link href={publicMode ? "/projects" : "/"} className="mt-4 inline-block rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white">{publicMode ? "Find projects" : "Find prospects"}</Link>
        </div>
      ) : (
        <>
          <p className="mt-2 text-xs text-slate-500 xl:hidden">Scroll horizontally to see every saved-site detail column.</p>
          <div className="mt-6 overflow-x-auto rounded-2xl ring-1 ring-slate-200">
            <table className="w-full min-w-[1120px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="p-3">Site</th><th className="p-3">Risk score</th><th className="p-3">Evidence level</th><th className="p-3">Observed stopped share (CV)</th>
                  <th className="p-3">Delay exposure scenario</th><th className="p-3">Asking</th><th className="p-3">Acres</th>
                  <th className="p-3">Power</th><th className="p-3">Water stress</th><th className="p-3">Zoning</th><th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((r) => {
                  const baseline = evidenceBaseline(r.id, r.band, holdoutDemo);
                  const timeline = buildTimeline(signals, r.id, baseline, undefined, {
                    county: r.county, state: r.state, city: r.city, inCityLimits: r.inCityLimits,
                  });
                  return (
                    <tr key={r.id}>
                      <td className="p-3">
                        <Link href={r.href} className="flex items-center gap-3">
                          {r.img ? <PropertyImage src={r.img} alt={`Aerial view of ${r.name}`} className="h-12 w-16 shrink-0 rounded-lg" fallbackLabel="Unavailable" /> : <span className="h-12 w-16 rounded-lg bg-slate-100" />}
                          <span>
                            <span className="block font-medium text-slate-900 hover:underline">{r.name}</span>
                            <span className="text-xs text-slate-500">{r.place}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="p-3">
                        {r.score == null ? "Unscored" : <><span className="font-semibold">{displayScore(r.score)}/100</span><div className="mt-1"><BandBadge band={r.band} /></div></>}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-1.5"><span className="text-xs text-slate-500">Model</span><BandBadge band={timeline.modelBand} />{holdoutDemo?.projectId === r.id && <span className="text-xs text-slate-500">held-out baseline</span>}</div>
                        {timeline.evidenceBand !== timeline.modelBand && <div className="mt-1 flex items-center gap-1.5 text-xs"><span aria-hidden="true">Rule →</span><BandBadge band={timeline.evidenceBand} /></div>}
                      </td>
                      <td className="p-3">{r.share == null ? "No band estimate" : `${(r.share * 100).toFixed(1)}%`}</td>
                      <td className="p-3 font-semibold">{money(economics(r.share, mw).expectedDelayCost)}</td>
                      <td className="p-3">{r.price ? money(r.price) : "—"}</td>
                      <td className="p-3">{r.acres ?? "—"}</td>
                      <td className="p-3">{r.power}</td>
                      <td className="p-3">{r.water?.split(" (")[0] ?? "—"}</td>
                      <td className="p-3">{r.zoning}</td>
                      <td className="p-3 text-right"><HeartButton projectId={r.id} saved /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">Stopped shares are cross-validation outcomes among held-out tracked Texas data center project predictions; small sample using today&apos;s features.</p>
        </>
      )}
    </main>
  );
}

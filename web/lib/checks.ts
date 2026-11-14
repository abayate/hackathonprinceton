import type { Site } from "./sites";
import type { Listing } from "./listings";
import { BANDS, CONSTANTS } from "./model";

export type CheckStatus = "pass" | "watch" | "fail" | "unknown";
export type Check = {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  basis: string; // how the status was decided
  sources: { label: string; url?: string }[];
};

const SRC = {
  eia: { label: "EIA electricity prices (S01)", url: "https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a" },
  aqueduct: { label: "WRI Aqueduct 4.0 (CC BY 4.0)", url: "https://www.wri.org/data/aqueduct-global-maps-40-data" },
  geocoder: { label: "Census Geocoder", url: "https://geocoding.geo.census.gov/geocoder/" },
  tracker: { label: "More Than Just Parks tracker", url: "https://morethanjustparks.com/data-center-tracker/state/texas" },
  audit: { label: "Texas Tribune, Aug 2026 audit freeze", url: "https://www.texastribune.org/2026/08/03/texas-data-center-project-audit-greg-abbott/" },
};

function waterStatus(label: string | null): CheckStatus {
  if (!label) return "unknown";
  if (label.startsWith("Extremely High") || label.startsWith("High")) return "fail";
  if (label.startsWith("Medium") || label.startsWith("Arid")) return "watch";
  return "pass";
}

export function checksFor(s: Site): Check[] {
  const p = s.p_stopped;
  return [
    {
      id: "power",
      title: "Power",
      status: "watch",
      detail: `Texas industrial power averages ${(CONSTANTS.electricityUsdPerKwh.value * 100).toFixed(2)}¢/kWh. Grid capacity and the time to connect at this site are not known.`,
      basis: "Price is reported; capacity is unknown, so this can't pass.",
      sources: [SRC.eia],
    },
    {
      id: "water",
      title: "Water",
      status: waterStatus(s.water_stress_label),
      detail: s.water_stress_label
        ? `Baseline water stress in this basin: ${s.water_stress_label}.`
        : "No water stress value for this basin.",
      basis: "Low or low-medium passes; medium-high or arid is watch; high or extremely high fails.",
      sources: [SRC.aqueduct],
    },
    {
      id: "zoning",
      title: "Zoning and permits",
      status: s.in_city_limits == null ? "unknown" : s.in_city_limits ? "watch" : "pass",
      detail:
        s.in_city_limits == null
          ? "Could not place this site in a city or county."
          : s.in_city_limits
            ? `Inside ${s.city} city limits: a rezoning or permit can go to a city council vote.`
            : "Unincorporated land: Texas counties have limited zoning power here.",
      basis: "Inside city limits is watch, because most Texas data center fights end in a council vote.",
      sources: [SRC.geocoder],
    },
    {
      id: "opposition",
      title: "Community opposition",
      status: p == null ? "unknown" : p >= BANDS.red ? "fail" : p >= BANDS.watch ? "watch" : "pass",
      detail:
        p == null
          ? "No model score (location not reliable)."
          : `Model says ${Math.round(p * 100)}% chance of being blocked or delayed, based on ${s.nearest_metro} distance (${s.km_to_nearest_metro.toFixed(0)} km), ${s.county_tracked_projects} tracked data centers in ${s.county}, county density and water stress.`,
      basis: `Trained on 16 stopped vs 86 under-construction Texas projects. Below ${BANDS.watch * 100}% passes, ${BANDS.red * 100}%+ fails.`,
      sources: [SRC.tracker],
    },
    {
      id: "policy",
      title: "Policy and incentives",
      status: "watch",
      detail: "Texas paused new data center approvals in August 2026 pending a state audit. Check its status before committing.",
      basis: "Applies to every Texas site until the audit ends.",
      sources: [SRC.audit],
    },
    {
      id: "land",
      title: "Land and physical risk",
      status: s.land_acres ? "pass" : "unknown",
      detail: s.land_acres ? `${s.land_acres} acres reported.` : "Parcel size, flood zone and terrain not checked for this site yet.",
      basis: "Only parcel size is available so far.",
      sources: [SRC.tracker],
    },
    {
      id: "labor",
      title: "Labor and construction",
      status: "unknown",
      detail: "Construction labor supply not checked yet.",
      basis: "No data source wired in.",
      sources: [],
    },
  ];
}

const COSTAR = { label: "CoStar property record" };
const VEXCEL = { label: "Vexcel aerial imagery" };

// Checks for a CoStar listing. Same seven checks; each says how it was decided.
export function checksForListing(l: Listing): Check[] {
  const p = l.p_stopped;
  const tx = l.state === "TX";
  return [
    {
      id: "power",
      title: "Power",
      status: l.heavy_power ? "pass" : l.heavy_power === false ? "watch" : "unknown",
      detail: l.heavy_power
        ? "CoStar records heavy power at this property. Utility capacity for a data center load still has to be confirmed."
        : l.heavy_power === false
          ? "CoStar records no heavy power. Expect new service and a long wait for capacity."
          : "Power service not recorded for this property.",
      basis: "Heavy power on record passes; none recorded is watch. No site has confirmed utility capacity.",
      sources: tx ? [COSTAR, SRC.eia] : [COSTAR],
    },
    {
      id: "water",
      title: "Water",
      status: waterStatus(l.water_stress_label),
      detail: l.water_stress_label ? `Baseline water stress in this basin: ${l.water_stress_label}.` : "No water stress value for this basin.",
      basis: "Low or low-medium passes; medium-high or arid is watch; high or extremely high fails.",
      sources: [SRC.aqueduct],
    },
    {
      id: "zoning",
      title: "Zoning and permits",
      status: l.in_city_limits == null ? "unknown" : l.in_city_limits ? "watch" : "pass",
      detail: [
        l.zoning ? `Zoned ${l.zoning}.` : "Zoning not recorded.",
        l.in_city_limits == null ? "" : l.in_city_limits ? `Inside ${l.place} limits, so a rezoning or permit can go to a council vote.` : "Unincorporated land.",
      ].join(" "),
      basis: "Inside city limits is watch, because most Texas data center fights end in a council vote.",
      sources: [COSTAR, SRC.geocoder],
    },
    {
      id: "opposition",
      title: "Community opposition",
      status: p == null ? "unknown" : p >= BANDS.red ? "fail" : p >= BANDS.watch ? "watch" : "pass",
      detail: p == null
        ? (l.model_note ?? "Not scored.")
        : `${Math.round(p * 100)}% chance of being blocked or delayed, from where it sits: ${l.km_to_metro.toFixed(0)} km from ${l.nearest_metro}, ${l.county_tracked_projects} tracked data centers in ${l.county}, county density ${Math.round(l.county_density ?? 0)}/sq mi.`,
      basis: `Logistic regression trained on 16 stopped vs 86 under-construction Texas projects (AUC 0.70). Below ${BANDS.watch * 100}% passes, ${BANDS.red * 100}%+ fails.`,
      sources: [SRC.tracker],
    },
    {
      id: "policy",
      title: "Policy and incentives",
      status: tx ? "watch" : "unknown",
      detail: tx ? "Texas paused new data center approvals in August 2026 pending a state audit. Check its status before committing." : "California policy not checked yet.",
      basis: tx ? "Applies to every Texas site until the audit ends." : "No source wired in.",
      sources: tx ? [SRC.audit] : [],
    },
    {
      id: "land",
      title: "Land and building",
      status: !l.lot_acres ? "unknown" : l.lot_acres >= 5 ? "pass" : "watch",
      detail: [
        l.lot_acres ? `${l.lot_acres} acres` : "Lot size not recorded",
        l.building_sf ? `${Math.round(l.building_sf).toLocaleString()} sf building` : null,
        l.ceiling_ft ? `${l.ceiling_ft} ft clear height` : null,
        l.column_width_ft ? `${l.column_width_ft} ft column spacing` : null,
      ].filter(Boolean).join(" · ") + ". Flood zone not checked.",
      basis: "5+ acres passes (room for a campus); under 5 acres is watch (conversion of the existing building only). Our rule.",
      sources: [COSTAR, VEXCEL],
    },
    {
      id: "labor",
      title: "Labor and construction",
      status: "unknown",
      detail: "Construction labor supply not checked yet.",
      basis: "No data source wired in.",
      sources: [],
    },
  ];
}

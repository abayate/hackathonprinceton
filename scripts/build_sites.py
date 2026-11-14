"""Build the listing sites (Houston + LA) from the CoStar kit and load them into Tiger Data.

Listings are CoStar industrial, flex and land properties: real buildings and lots that
Vexcel covers and Matterport has scanned. CoStar data is hackathon-use only, so this
script writes only to Tiger Data and data/private/, never to a committed file.

Inputs:  costar-hackathon-kit/ (gitignored), data/private/raw/ (Census + Aqueduct),
         data/labels/tx_projects.csv, data/model/risk_model.json
Output:  Tiger table `sites`, plus one scoring run per site in `risk_scores`
Run:     python scripts/build_sites.py
"""
import csv
import json
import math
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import httpx
import psycopg2
import pyogrio
import shapely
from psycopg2.extras import execute_values

import build_features as bf
from load_projects_tiger import database_url

ROOT = Path(__file__).resolve().parents[1]
KIT = ROOT / "costar-hackathon-kit"
CACHE = ROOT / "data/private/cache/geocode_sites.json"
MODEL = ROOT / "data/model/risk_model.json"
PROJECTS = ROOT / "data/labels/tx_projects.csv"

TYPES = {2: "Industrial", 3: "Land", 7: "Flex"}
SQFT_PER_ACRE = 43560


def flat(d, p=""):
    out = {}
    if isinstance(d, dict):
        for k, v in d.items():
            out.update(flat(v, f"{p}.{k}" if p else k))
    else:
        out[p] = d
    return out


def first(f, suffix):
    for k, v in f.items():
        if k.endswith(suffix) and v not in (None, "", 0):
            return v
    return None


def acres(r):
    lot, unit = r.get("lotSize"), r.get("lotSizeMeasurementType")
    if not lot:
        return None
    if unit == 2:
        return round(lot, 2)
    if unit == 1:
        return round(lot / SQFT_PER_ACRE, 2)
    if unit == 3:
        return round(lot * 10.7639 / SQFT_PER_ACRE, 2)
    return None


def load_candidates():
    matterport = {r["PropertyId"]: r["MatterportModelId"]
                  for r in csv.DictReader((KIT / "commercial-properties.csv").open(encoding="utf-8"))}
    prices = {}
    for line in (KIT / "data/commercial-listing-summary.jsonl").open(encoding="utf-8"):
        r = json.loads(line)
        fs = r.get("forSaleSummary") or {}
        price = fs.get("askingPriceHigh") or fs.get("askingPriceLow")
        if price:
            prices[str(r["propertyId"])] = price
    out = []
    for line in (KIT / "data/commercial-property.jsonl").open(encoding="utf-8"):
        r = json.loads(line)
        if r.get("propertyType") not in TYPES:
            continue
        a = r.get("primaryAddress") or {}
        if not a.get("latitude") or not a.get("longitude"):
            continue
        f = flat(r)
        years = [e.get("year") for e in r.get("constructionEvents") or [] if e.get("year")]
        pid = str(r["id"])
        street = " ".join(str(x) for x in (a.get("streetNumber"), a.get("streetName"), a.get("streetType")) if x)
        out.append({
            "site_id": f"costar-{pid}",
            "costar_property_id": int(pid),
            "name": r.get("buildingName") or street,
            "address": street,
            "city": a.get("city"),
            "state": a.get("state"),
            "lat": a["latitude"],
            "lng": a["longitude"],
            "property_type": TYPES[r["propertyType"]],
            "lot_acres": acres(r),
            "building_sf": r.get("grossBuildingAreaSquareFeet") or r.get("rentableBuildingAreaSquareFeet"),
            "ceiling_ft": first(f, "ceilingHeightFeet"),
            "column_width_ft": first(f, "columnWidthFeet"),
            "heavy_power": next((v for k, v in f.items() if k.endswith("hasHeavyPower") and v is not None), None),
            "year_built": max(years) if years else None,
            "zoning": r.get("zoningDescription"),
            "asking_price": prices.get(pid),
            "matterport_model_id": matterport.get(pid) or None,
        })
    return out


def water_lookup(points):
    gdb = next((ROOT / "data/private/raw/aqueduct").rglob("*.gdb"))
    lngs = [p[0] for p in points]
    lats = [p[1] for p in points]
    bbox = (min(lngs) - 0.5, min(lats) - 0.5, max(lngs) + 0.5, max(lats) + 0.5)
    meta, _f, wkb, data = pyogrio.raw.read(gdb, layer="baseline_annual", bbox=bbox,
                                           columns=["bws_score", "bws_label"])
    cols = dict(zip(meta["fields"], data))
    geoms = shapely.from_wkb(wkb)
    tree = shapely.STRtree(geoms)
    out = []
    for pt in points:
        hit = (None, None)
        for i in tree.query(shapely.Point(pt), predicate="intersects"):
            s = float(cols["bws_score"][i])
            if s >= 0:
                hit = (round(s, 2), cols["bws_label"][i])
                break
        out.append(hit)
    return out


def score(model, x):
    coef = list(model["coefficients"].values())
    z = model["intercept"] + sum(
        c * (v - m) / s for c, v, m, s in zip(coef, x, model["feature_mean"], model["feature_std"]))
    return 1 / (1 + math.exp(-z))


def main():
    sites = load_candidates()
    print(len(sites), "candidate sites", Counter((s["state"], s["property_type"]) for s in sites))

    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    todo = [s for s in sites if s["site_id"] not in cache]
    if todo:
        from concurrent.futures import ThreadPoolExecutor
        with httpx.Client() as client, ThreadPoolExecutor(max_workers=8) as pool:
            def job(s):
                try:
                    return s["site_id"], bf.geocode(client, s["lat"], s["lng"])
                except Exception as e:
                    return s["site_id"], {"error": str(e)[:200]}
            for sid, res in pool.map(job, todo):
                cache[sid] = res
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps(cache, indent=1))

    pop, area, _center = bf.county_tables()
    tracked = Counter(p["county"] for p in csv.DictReader(PROJECTS.open(encoding="utf-8")))
    water = water_lookup([(s["lng"], s["lat"]) for s in sites])
    saved = json.loads(MODEL.read_text())
    model = saved["comparisons"][saved["default_model"]]
    model_version = f"logreg-{saved['default_model']}-{saved['trained']}"

    for s, (ws, wl) in zip(sites, water):
        g = cache.get(s["site_id"], {})
        fips = g.get("county_fips", "")
        point = (s["lat"], s["lng"])
        nearest = min(bf.METROS, key=lambda m: bf.haversine_km(point, bf.METROS[m]))
        s.update({
            "county": g.get("county_name"),
            "place": g.get("place") or None,
            "in_city_limits": None if "error" in g else bool(g.get("place")),
            "in_urban_area": None if "error" in g else bool(g.get("urban_area")),
            "county_density": round(pop[fips] / area[fips], 1) if fips in pop and area.get(fips) else None,
            "nearest_metro": nearest,
            "km_to_metro": round(bf.haversine_km(point, bf.METROS[nearest]), 1),
            "county_tracked_projects": tracked.get(g.get("county_name"), 0),
            "water_stress_score": ws,
            "water_stress_label": wl,
            "p_stopped": None,
            "model_note": None,
        })
        if s["state"] != "TX":
            s["model_note"] = "Not scored: the risk model is trained on Texas projects only."
        elif s["county_density"] is None or s["in_city_limits"] is None:
            s["model_note"] = "Not scored: location could not be geocoded."
        else:
            x = [
                1.0 if s["in_city_limits"] else 0.0,
                1.0 if s["in_urban_area"] else 0.0,
                math.log10(s["county_density"] + 1),
                math.log10(s["km_to_metro"] + 1),
                0.0,
                math.log10(max(s["county_tracked_projects"], 1)),
            ]
            s["p_stopped"] = round(score(model, x), 4)

    cols = ["site_id", "costar_property_id", "name", "address", "city", "state", "county", "lat", "lng",
            "property_type", "lot_acres", "building_sf", "ceiling_ft", "column_width_ft", "heavy_power",
            "year_built", "zoning", "asking_price", "matterport_model_id", "place", "in_city_limits",
            "in_urban_area", "county_density", "nearest_metro", "km_to_metro", "county_tracked_projects",
            "water_stress_score", "water_stress_label", "p_stopped", "model_note"]

    conn = psycopg2.connect(database_url(), connect_timeout=15)
    cur = conn.cursor()
    cur.execute("DROP TABLE IF EXISTS sites")
    cur.execute("""
        CREATE TABLE sites (
            site_id text PRIMARY KEY, costar_property_id bigint, name text, address text, city text,
            state text, county text, lat double precision, lng double precision,
            geom geography(Point, 4326), property_type text, lot_acres double precision,
            building_sf double precision, ceiling_ft double precision, column_width_ft double precision,
            heavy_power boolean, year_built integer, zoning text, asking_price double precision,
            matterport_model_id text, place text, in_city_limits boolean, in_urban_area boolean,
            county_density double precision, nearest_metro text, km_to_metro double precision,
            county_tracked_projects integer, water_stress_score double precision, water_stress_label text,
            p_stopped double precision, model_note text
        )""")
    rows = []
    for s in sites:
        vals = [s[c] for c in cols]
        vals.insert(9, f"SRID=4326;POINT({s['lng']} {s['lat']})")
        rows.append(tuple(vals))
    execute_values(cur, f"INSERT INTO sites ({', '.join(cols[:9] + ['geom'] + cols[9:])}) VALUES %s", rows)
    cur.execute("CREATE INDEX ON sites USING gist (geom)")
    now = datetime.now(timezone.utc)
    execute_values(cur, "INSERT INTO risk_scores VALUES %s",
                   [(now, s["site_id"], model_version, s["p_stopped"], False) for s in sites if s["p_stopped"] is not None])
    conn.commit()
    cur.execute("SELECT state, count(*), count(p_stopped), round(avg(p_stopped)::numeric,3) FROM sites GROUP BY 1")
    print("sites by state (n, scored, mean p):", cur.fetchall())
    cur.execute("SELECT count(*) FILTER (WHERE asking_price IS NOT NULL), count(*) FILTER (WHERE heavy_power), count(*) FILTER (WHERE lot_acres >= 5) FROM sites")
    print("with price, heavy power, >=5 acres:", cur.fetchone())
    conn.close()


if __name__ == "__main__":
    main()

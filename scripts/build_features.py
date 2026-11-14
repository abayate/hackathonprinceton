"""Compute model features for every project in data/labels/tx_projects.csv.

Inputs (download once into data/private/raw/):
  co-est2024-alldata.csv   Census county population estimates
      https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/counties/totals/co-est2024-alldata.csv
  gaz_counties.zip         Census 2024 Gazetteer counties (land area)
      https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_counties_national.zip
Calls (cached in data/private/cache/geocode.json):
  Census Geocoder, coordinates -> county, incorporated place, urban area

Output: data/features/tx_project_features.csv (one row per project_id, features only)

Run: python scripts/build_features.py
"""
import csv
import io
import json
import math
import re
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
PROJECTS = ROOT / "data/labels/tx_projects.csv"
RAW = ROOT / "data/private/raw"
CACHE = ROOT / "data/private/cache/geocode.json"
OUT = ROOT / "data/features/tx_project_features.csv"

GEOCODER = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"

# City-hall coordinates of Texas's largest metros (rounded).
METROS = {
    "Houston": (29.760, -95.370),
    "Dallas": (32.777, -96.797),
    "Fort Worth": (32.755, -97.331),
    "San Antonio": (29.424, -98.494),
    "Austin": (30.267, -97.743),
    "El Paso": (31.762, -106.485),
}
MAX_KM_FROM_NAMED_COUNTY = 60
CRYPTO = re.compile(r"bitcoin|crypto|mining|miner|\bmine\b", re.I)


def haversine_km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def geocode(client, lat, lng):
    r = client.get(GEOCODER, params={
        "x": lng, "y": lat, "benchmark": "Public_AR_Current",
        "vintage": "Current_Current", "format": "json",
    }, timeout=30)
    r.raise_for_status()
    g = r.json()["result"]["geographies"]
    first = lambda k: (g.get(k) or [{}])[0]
    return {
        "county_fips": first("Counties").get("GEOID", ""),
        "county_name": first("Counties").get("NAME", ""),
        "place": first("Incorporated Places").get("NAME", ""),
        "urban_area": first("Urban Areas").get("NAME", ""),
    }


def county_tables():
    pop = {}
    with open(RAW / "co-est2024-alldata.csv", encoding="latin-1") as f:
        for r in csv.DictReader(f):
            if r["SUMLEV"] == "050":
                pop[r["STATE"] + r["COUNTY"]] = int(r["POPESTIMATE2024"])
    area, center = {}, {}
    with zipfile.ZipFile(RAW / "gaz_counties.zip") as z:
        name = next(n for n in z.namelist() if n.endswith(".txt"))
        text = z.read(name).decode("latin-1")
        rows = csv.reader(io.StringIO(text), delimiter="\t")
        header = [h.strip() for h in next(rows)]
        ix = {k: header.index(k) for k in ("USPS", "GEOID", "NAME", "ALAND_SQMI", "INTPTLAT", "INTPTLONG")}
        for r in rows:
            area[r[ix["GEOID"]].strip()] = float(r[ix["ALAND_SQMI"]])
            if r[ix["USPS"]] == "TX":
                center[r[ix["NAME"]].strip()] = (float(r[ix["INTPTLAT"]]), float(r[ix["INTPTLONG"]].strip()))
    return pop, area, center


def main():
    projects = [p for p in csv.DictReader(PROJECTS.open(encoding="utf-8")) if p["lat"]]
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}

    todo = [p for p in projects if p["project_id"] not in cache]
    if todo:
        with httpx.Client() as client, ThreadPoolExecutor(max_workers=8) as pool:
            def job(p):
                try:
                    return p["project_id"], geocode(client, p["lat"], p["lng"])
                except Exception as e:  # keep going; the row gets empty geo fields
                    return p["project_id"], {"error": str(e)[:200]}
            for pid, res in pool.map(job, todo):
                cache[pid] = res
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps(cache, indent=1))

    pop, area, center = county_tables()
    per_county = {}
    for p in projects:
        per_county[p["county"]] = per_county.get(p["county"], 0) + 1

    rows = []
    for p in projects:
        g = cache.get(p["project_id"], {})
        fips = g.get("county_fips", "")
        point = (float(p["lat"]), float(p["lng"]))
        nearest = min(METROS, key=lambda m: haversine_km(point, METROS[m]))
        mw = float(p["capacity_mw"]) if p["capacity_mw"] else None
        density = pop[fips] / area[fips] if fips in pop and area.get(fips) else None
        matches = bool(fips) and g.get("county_name") == p["county"]
        # A point far from the county the tracker names means the coordinates are wrong,
        # not just near a county line.
        km_off = haversine_km(point, center[p["county"]]) if p["county"] in center else None
        reliable = matches or (km_off is not None and km_off <= MAX_KM_FROM_NAMED_COUNTY)
        rows.append({
            "project_id": p["project_id"],
            "county_fips": fips,
            "county_matches_tracker": "" if not fips else ("yes" if matches else "no"),
            "location_reliable": "yes" if reliable else "no",
            "in_city_limits": "" if "error" in g else ("yes" if g.get("place") else "no"),
            "city": g.get("place", ""),
            "in_urban_area": "" if "error" in g else ("yes" if g.get("urban_area") else "no"),
            "county_population_2024": pop.get(fips, ""),
            "county_density_per_sqmi": round(density, 1) if density else "",
            "nearest_metro": nearest,
            "km_to_nearest_metro": round(haversine_km(point, METROS[nearest]), 1),
            "capacity_mw": mw if mw else "",
            "log_capacity_mw": round(math.log10(mw), 3) if mw else "",
            "is_crypto": "yes" if CRYPTO.search(p["name"] + " " + p["company"]) else "no",
            "county_tracked_projects": per_county[p["county"]],
            "geocode_error": g.get("error", ""),
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    print(f"{len(rows)} rows -> {OUT.relative_to(ROOT)}")
    print("geocode errors:", sum(1 for r in rows if r["geocode_error"]))
    print("county mismatches:", sum(1 for r in rows if r["county_matches_tracker"] == "no"))
    bad = [(p["name"], p["label"], p["county"], cache[p["project_id"]].get("county_name"))
           for p, r in zip(projects, rows) if r["location_reliable"] == "no"]
    print("unreliable locations:", len(bad))
    for b in bad:
        print("  ", b)


if __name__ == "__main__":
    main()

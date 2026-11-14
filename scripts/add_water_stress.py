"""Add WRI Aqueduct 4.0 baseline water stress to data/features/tx_project_features.csv.

Input: data/private/raw/aqueduct/.../Aq40_Y2023D07M05.gdb (unzipped from
       https://files.wri.org/aqueduct/aqueduct-4-0-water-risk-data.zip, CC BY 4.0)
Adds columns: water_stress_score (0-5), water_stress_label, water_stress_raw.
Missing basin values (Aqueduct uses -9999) stay empty.

Run after build_features.py: python scripts/add_water_stress.py
"""
import csv
from pathlib import Path

import pyogrio
import shapely

ROOT = Path(__file__).resolve().parents[1]
GDB = next((ROOT / "data/private/raw/aqueduct").rglob("*.gdb"))
PROJECTS = ROOT / "data/labels/tx_projects.csv"
FEATURES = ROOT / "data/features/tx_project_features.csv"
TEXAS_BBOX = (-106.7, 25.8, -93.5, 36.6)


def main():
    meta, _fids, wkb, field_data = pyogrio.raw.read(
        GDB, layer="baseline_annual", bbox=TEXAS_BBOX,
        columns=["bws_raw", "bws_score", "bws_label"],
    )
    geoms = shapely.from_wkb(wkb)
    cols = dict(zip(meta["fields"], field_data))
    tree = shapely.STRtree(geoms)

    coords = {p["project_id"]: (float(p["lng"]), float(p["lat"]))
              for p in csv.DictReader(PROJECTS.open(encoding="utf-8")) if p["lat"]}
    rows = list(csv.DictReader(FEATURES.open(encoding="utf-8")))
    hits = 0
    for r in rows:
        r.update({"water_stress_score": "", "water_stress_label": "", "water_stress_raw": ""})
        pt = shapely.Point(coords[r["project_id"]])
        for i in tree.query(pt, predicate="intersects"):
            score = float(cols["bws_score"][i])
            if score < 0:  # -9999 = no data
                continue
            r["water_stress_score"] = round(score, 2)
            r["water_stress_label"] = cols["bws_label"][i]
            r["water_stress_raw"] = round(float(cols["bws_raw"][i]), 4)
            hits += 1
            break

    with FEATURES.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    from collections import Counter
    print(f"water stress found for {hits}/{len(rows)} projects")
    print(Counter(r["water_stress_label"] for r in rows).most_common())


if __name__ == "__main__":
    main()

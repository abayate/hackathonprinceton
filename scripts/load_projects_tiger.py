"""Load labeled projects, features and model scores into Tiger Data.

Creates (or replaces) our own tables only:
  tx_projects          labels + location (PostGIS point)
  tx_project_features  model features per project
  risk_scores          hypertable: one row per project per scoring run

Reads DATABASE_URL from .env. Run after build_tx_projects, build_features, train_risk_model:
  python scripts/load_projects_tiger.py
"""
import csv
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

ROOT = Path(__file__).resolve().parents[1]
PROJECTS = ROOT / "data/labels/tx_projects.csv"
FEATURES = ROOT / "data/features/tx_project_features.csv"
MODEL = ROOT / "data/model/risk_model.json"


def database_url():
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("DATABASE_URL not set")


def none_if_empty(v):
    return None if v == "" else v


def yes(v):
    return None if v == "" else v == "yes"


def score(model, f):
    """p(stopped) from the saved logistic regression, same feature order as training."""
    x = [
        1.0 if f["in_city_limits"] == "yes" else 0.0,
        1.0 if f["in_urban_area"] == "yes" else 0.0,
        math.log10(float(f["county_density_per_sqmi"]) + 1),
        math.log10(float(f["km_to_nearest_metro"]) + 1),
        1.0 if f["is_crypto"] == "yes" else 0.0,
        math.log10(float(f["county_tracked_projects"])),
    ]
    coef = list(model["coefficients"].values())
    z = model["intercept"] + sum(
        c * (v - m) / s for c, v, m, s in zip(coef, x, model["feature_mean"], model["feature_std"])
    )
    return 1 / (1 + math.exp(-z))


def main():
    projects = list(csv.DictReader(PROJECTS.open(encoding="utf-8")))
    features = {f["project_id"]: f for f in csv.DictReader(FEATURES.open(encoding="utf-8"))}
    saved = json.loads(MODEL.read_text())
    comparison = saved["default_model"]
    model = saved["comparisons"][comparison]
    model_version = f"logreg-{comparison}-{saved['trained']}"

    conn = psycopg2.connect(database_url(), connect_timeout=15)
    cur = conn.cursor()
    cur.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    cur.execute("DROP TABLE IF EXISTS tx_project_features")
    cur.execute("DROP TABLE IF EXISTS tx_projects")
    cur.execute("""
        CREATE TABLE tx_projects (
            project_id text PRIMARY KEY,
            name text NOT NULL,
            company text,
            county text,
            lat double precision,
            lng double precision,
            geom geography(Point, 4326),
            coord_precision text,
            capacity_mw double precision,
            land_acres double precision,
            tracker_status text,
            label text,
            use_for_training boolean,
            exclude_reason text,
            stop_event_date date,
            stop_event_date_basis text,
            primary_source_url text,
            primary_source_name text,
            tracker_url text,
            source_id text
        )""")
    execute_values(cur, """
        INSERT INTO tx_projects VALUES %s""", [(
            p["project_id"], p["name"], none_if_empty(p["company"]), p["county"],
            float(p["lat"]), float(p["lng"]), f"SRID=4326;POINT({p['lng']} {p['lat']})",
            p["coord_precision"], none_if_empty(p["capacity_mw"]), none_if_empty(p["land_acres"]),
            p["tracker_status"], p["label"], p["use_for_training"] == "yes",
            none_if_empty(p["exclude_reason"]), none_if_empty(p["stop_event_date"]),
            none_if_empty(p["stop_event_date_basis"]), none_if_empty(p["primary_source_url"]),
            none_if_empty(p["primary_source_name"]), p["tracker_url"], p["source_id"],
        ) for p in projects])
    cur.execute("CREATE INDEX ON tx_projects USING gist (geom)")

    cur.execute("""
        CREATE TABLE tx_project_features (
            project_id text PRIMARY KEY REFERENCES tx_projects(project_id),
            county_fips text,
            county_matches_tracker boolean,
            location_reliable boolean,
            in_city_limits boolean,
            city text,
            in_urban_area boolean,
            county_population_2024 integer,
            county_density_per_sqmi double precision,
            nearest_metro text,
            km_to_nearest_metro double precision,
            is_crypto boolean,
            county_tracked_projects integer,
            water_stress_score double precision,
            water_stress_label text,
            water_stress_raw double precision
        )""")
    execute_values(cur, "INSERT INTO tx_project_features VALUES %s", [(
        f["project_id"], none_if_empty(f["county_fips"]), yes(f["county_matches_tracker"]),
        yes(f["location_reliable"]), yes(f["in_city_limits"]), none_if_empty(f["city"]),
        yes(f["in_urban_area"]), none_if_empty(f["county_population_2024"]),
        none_if_empty(f["county_density_per_sqmi"]), f["nearest_metro"],
        float(f["km_to_nearest_metro"]), yes(f["is_crypto"]), int(f["county_tracked_projects"]),
        none_if_empty(f["water_stress_score"]), none_if_empty(f["water_stress_label"]),
        none_if_empty(f["water_stress_raw"]),
    ) for f in features.values()])

    # Scores over time: a hypertable, so every rescoring run is kept.
    cur.execute("""
        CREATE TABLE IF NOT EXISTS risk_scores (
            scored_at timestamptz NOT NULL,
            project_id text NOT NULL,
            model_version text NOT NULL,
            p_stopped double precision NOT NULL,
            in_training_set boolean NOT NULL
        )""")
    cur.execute("SELECT create_hypertable('risk_scores', 'scored_at', if_not_exists => TRUE)")
    now = datetime.now(timezone.utc)
    rows = []
    for p in projects:
        f = features.get(p["project_id"])
        if not f or f["location_reliable"] != "yes":
            continue
        in_train = p["use_for_training"] == "yes" and (
            comparison != "recent" or p["tracker_status"] != "operational")
        rows.append((now, p["project_id"], model_version, round(score(model, f), 4), in_train))
    execute_values(cur, "INSERT INTO risk_scores VALUES %s", rows)

    conn.commit()
    cur.execute("SELECT label, count(*) FROM tx_projects GROUP BY 1 ORDER BY 1")
    print("tx_projects:", cur.fetchall())
    cur.execute("SELECT count(*) FROM tx_project_features")
    print("tx_project_features:", cur.fetchone()[0])
    cur.execute("SELECT count(*), count(DISTINCT scored_at) FROM risk_scores")
    print("risk_scores rows, runs:", cur.fetchone())
    cur.execute("""
        SELECT p.label, round(avg(s.p_stopped)::numeric, 3), count(*)
        FROM risk_scores s JOIN tx_projects p USING (project_id)
        WHERE s.scored_at = %s GROUP BY 1 ORDER BY 1""", (now,))
    print("mean p_stopped by label (this run):", cur.fetchall())
    conn.close()


if __name__ == "__main__":
    main()

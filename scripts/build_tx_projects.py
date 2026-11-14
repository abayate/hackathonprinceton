"""Build data/labels/tx_projects.csv from a saved More Than Just Parks Texas page.

Input:  data/private/raw/mtjp_texas.html
        (download https://morethanjustparks.com/data-center-tracker/state/texas)
Output: data/labels/tx_projects.csv

Only values the tracker states are kept. Unknown stays empty.
Run: python scripts/build_tx_projects.py
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/private/raw/mtjp_texas.html"
OUT = ROOT / "data/labels/tx_projects.csv"

UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
TRACKER = "https://morethanjustparks.com/data-center-tracker/"

STATUS_LABEL = {
    "operational": "built",
    "under_construction": "built",
    "proposed": "unlabeled",
    "withdrawn": "stopped",
    "defeated": "stopped",
    "moratorium": "stopped",
    "suspended": "stopped",
    "cancelled": "stopped",
}

# Stopped for reasons unrelated to local siting risk, per each project's own source.
EXCLUDE = {
    "Stargate Abilene 600MW Expansion": "business decision by the developer, not local opposition",
    "NFN8 Crystal City Bitcoin Mining": "developer bankruptcy after a fire",
    "Nscale Ward County Data Center Campus": "tenant (Microsoft) declined; not local opposition",
    "Fort Worth Data Center Moratorium": "city-wide moratorium, not a single project",
}


def next_payload(html: str) -> str:
    chunks = re.findall(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', html)
    return "".join(json.loads(c) for c in chunks)


def embedded_records(payload: str) -> dict:
    """Project records the map draws (id, coordinates, status, sources)."""
    records = {}
    for m in re.finditer(r'\{"id":"(' + UUID + r')","name":', payload):
        i, depth, in_str, esc = m.start(), 0, False, False
        for j in range(i, len(payload)):
            ch = payload[j]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
            elif ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    break
        try:
            rec = json.loads(payload[i : j + 1])
        except json.JSONDecodeError:
            continue
        if "lat" in rec and "status" in rec:
            records.setdefault(rec["id"], rec)
    return records


def precision(v) -> int:
    s = repr(v)
    return len(s.split(".")[1]) if "." in s else 0


def date_from_url(url: str) -> str:
    m = re.search(r"/(20\d\d)[/-](\d\d)[/-](\d\d)/", url or "")
    return "-".join(m.groups()) if m else ""


def main():
    html = RAW.read_text(encoding="utf-8")
    recs = embedded_records(next_payload(html))
    slug_of = {}
    for slug in re.findall(r'href="/data-center-tracker/([^"]+--' + UUID + r')"', html):
        slug_of[slug[-36:]] = slug

    rows = []
    for pid, r in recs.items():
        status = r["status"]
        label = STATUS_LABEL.get(status, "")
        exclude = next((why for k, why in EXCLUDE.items() if r["name"].startswith(k)), "")
        coarse = r.get("pin_town") or min(precision(r["lat"]), precision(r["lng"])) <= 2
        event_date, basis = "", ""
        if label == "stopped":
            if r.get("date_filed"):
                event_date, basis = r["date_filed"], "tracker_date_filed"
            elif date_from_url(r.get("source_url")):
                event_date, basis = date_from_url(r["source_url"]), "source_url_date"
        rows.append({
            "project_id": pid,
            "name": r["name"],
            "company": r.get("company") or "",
            "county": f"{r['county']} County" if r.get("county") else "",
            "lat": r["lat"],
            "lng": r["lng"],
            "coord_precision": "town" if coarse else "site",
            "capacity_mw": r["capacity_mw"] if r.get("capacity_mw") else "",
            "land_acres": r.get("land_use_acres") or "",
            "tracker_status": status,
            "label": label,
            "use_for_training": "no" if (exclude or label == "unlabeled") else "yes",
            "exclude_reason": exclude,
            "stop_event_date": event_date,
            "stop_event_date_basis": basis,
            "primary_source_url": r.get("source_url") or "",
            "primary_source_name": r.get("verification_source_name") or "",
            "tracker_url": TRACKER + slug_of.get(pid, ""),
            "source_id": "T01",
        })

    # The page also lists ~138 small sites it doesn't draw on the map. They have
    # no coordinates in the page data, so they're left out.
    rows.sort(key=lambda x: ({"stopped": 0, "built": 1, "unlabeled": 2}[x["label"]], x["county"], x["name"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    from collections import Counter
    print(f"{len(rows)} rows -> {OUT.relative_to(ROOT)}")
    print("labels:", Counter(r["label"] for r in rows))
    print("training rows:", Counter(r["label"] for r in rows if r["use_for_training"] == "yes"))
    print("precision (training):", Counter(r["coord_precision"] for r in rows if r["use_for_training"] == "yes"))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build the distance atlas and the facility-location quality audit.

Inputs
------
- data/dghs/index.json and data/dghs/profiles/*.json (committed DGHS snapshot)
- data/accessibility/baseline/*.csv (BBS pcodes and Census 2022 division totals)
- data/boundaries/bangladesh-country.geojson (OSM national outline, grid extent)
- geoBoundaries gbOpen BGD ADM2/ADM3/ADM4 simplified GeoJSON (--adm2/--adm3/--adm4).
  Source: Bangladesh Bureau of Statistics (BBS) and OCHA ROAP, CC BY 3.0 IGO.
  geoBoundaries tags boundaryYear 2020; the source dataset is HDX "as of 2015".

Location quality
----------------
A published DGHS coordinate is used for analysis only if:
1. it lies within 1 km of the district recorded in the same DGHS record
   (1 km allows for boundary simplification), and
2. it is not shared, to six decimals, with a facility recorded in another
   district or upazila (shared coordinates across areas are placeholders).
Flagged records stay in every count by recorded area; they are only left out
of point maps and distance calculations. data/atlas/flagged-locations.csv
lists each flagged record with its reason.

Levels
------
division (8, dissolved from the BBS districts so all levels nest), district
(64), upazila/thana (544, joined one-to-one to the study's BBS pcodes) and
union (ADM4, assigned to the upazila containing its representative point).

Distance
--------
Straight-line distance from every 1 km grid cell centre (UTM 46N) inside the
national outline to the nearest usable point of each facility class. Results
are shares of land area, not population, and are not travel times.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
# One hospital definition for the whole site (Statistics page).
from build_statistics import HOSPITAL_TYPES, PUBLIC as GOV_OWNERSHIP  # noqa: E402

GENERATED = datetime.now(timezone.utc).isoformat(timespec="seconds")
GRID_METRES = 1000.0
CURVE_MAX_KM = 40.0
CURVE_STEP_KM = 0.5
THRESHOLDS_KM = (2, 5, 10, 20)
DISTRICT_TOLERANCE_KM = 1.0
LOW_CELLS = 5

ADM_ALIASES = {
    "barisal": "barishal", "chittagong": "chattogram", "bogra": "bogura",
    "comilla": "cumilla", "jessore": "jashore", "jhalokati": "jhalokathi",
    "chapai nawabganj": "chapainawabganj", "khagrachhari": "khagrachari",
    "nawabganj": "chapainawabganj", "brahamanbaria": "brahmanbaria",
}
PRIMARY_TYPES = {
    "Community Clinic", "Union Health Center", "Union Health Sub Center",
    "Union Health & Family Welfare Center (UH&FWC)",
    "Maternal & Child Welfare Centre (MCWC)", "Urban Dispensary",
    "Urban Primary Health Care Center", "School Health Clinic",
    "Family Planning Clinic",
}
DISTANCE_CLASSES = ("public_hospital", "any_hospital", "private_ngo_hospital", "primary_care")
LEVELS = ("division", "district", "upazila", "union")


def norm(value) -> str:
    value = unicodedata.normalize("NFKC", str(value or "")).casefold()
    value = value.replace("-", " ").replace("'", "").replace("’", "")
    value = " ".join(value.split())
    return ADM_ALIASES.get(value, value)


def classify(record: dict) -> str:
    kind = record.get("facility_type_name") or ""
    if kind in HOSPITAL_TYPES:
        # Same rule as the Statistics page: government ownership decides, whatever the type label.
        if (record.get("facility_ownership_name") or "") in GOV_OWNERSHIP:
            return "public_hospital"
        return "private_ngo_hospital"
    if kind in PRIMARY_TYPES:
        return "primary_care"
    if kind == "Consultancy & Diagnostic Center":
        return "diagnostic"
    return "other"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_registry():
    index = json.loads((ROOT / "data/dghs/index.json").read_text(encoding="utf-8"))
    profiles = {}
    for chunk in sorted((ROOT / "data/dghs/profiles").glob("*.json")):
        profiles.update(json.loads(chunk.read_text(encoding="utf-8")))
    facilities = []
    for record in index["records"]:
        profile = profiles.get(str(record.get("id")), {})
        try:
            beds = max(0, int(profile.get("approved_bed_number") or 0))
        except (TypeError, ValueError):
            beds = 0
        facilities.append({
            "id": str(record.get("id")), "code": record.get("code") or "",
            "name": record.get("name") or "", "active": record.get("is_active") == "1",
            "type": record.get("facility_type_name") or "", "klass": classify(record),
            "division": record.get("division_name") or "", "district": record.get("district_name") or "",
            "upazila": record.get("upazila_name") or "", "ownership": record.get("facility_ownership_name") or "",
            "lat": record.get("lat"), "lon": record.get("lon"),
            "published": record.get("coordinateStatus") == "published",
            "status": record.get("coordinateStatus") or "", "beds": beds,
            "emergency": profile.get("has_emergency") or "", "ambulance": profile.get("has_ambulance") or "",
            "ipd": profile.get("has_ipd") or "", "year": (profile.get("establishment_year") or "").strip(),
        })
    return index, facilities


def read_features(path: Path, expected: int | None = None):
    from shapely.geometry import shape
    features = json.loads(path.read_text(encoding="utf-8"))["features"]
    if expected and len(features) != expected:
        raise SystemExit(f"{path}: expected {expected} features, found {len(features)}")
    return [{"shape_id": f["properties"]["shapeID"], "name": f["properties"]["shapeName"],
             "norm": norm(f["properties"]["shapeName"]), "geometry": shape(f["geometry"])}
            for f in features]


def nest(children, parents):
    """Assign each child polygon to the parent containing its representative point."""
    from shapely.strtree import STRtree
    tree = STRtree([p["geometry"] for p in parents])
    for child in children:
        point = child["geometry"].representative_point()
        hits = tree.query(point, predicate="within")
        if len(hits) != 1:
            hits = [min(range(len(parents)), key=lambda i: parents[i]["geometry"].distance(point))]
        child["parent"] = parents[int(hits[0])]


def attach_pcodes(districts, upazilas):
    with open(ROOT / "data/accessibility/baseline/district_availability.csv", encoding="utf-8-sig") as stream:
        rows = list(csv.DictReader(stream))
    district_codes = {norm(r["area_name"]): (r["ADM2_PCODE"], r["ADM1_PCODE"]) for r in rows}
    for d in districts:
        d["pcode"], d["division_pcode"] = district_codes[d["norm"]]
    with open(ROOT / "data/accessibility/baseline/upazila_thana_availability.csv", encoding="utf-8-sig") as stream:
        rows = list(csv.DictReader(stream))
    pairs = {(r["ADM2_PCODE"], norm(r["area_name"])): r["pcode"] for r in rows}
    for u in upazilas:
        u["pcode"] = pairs.get((u["parent"]["pcode"], u["norm"]))
        if not u["pcode"]:
            raise SystemExit(f"Upazila pcode missing: {u['name']}")
    if len({u["pcode"] for u in upazilas}) != 544:
        raise SystemExit("Upazila pcode crosswalk is not one-to-one")


def build_divisions(districts):
    from shapely.ops import unary_union
    names = {}
    with open(ROOT / "data/accessibility/baseline/division_availability.csv", encoding="utf-8-sig") as stream:
        for row in csv.DictReader(stream):
            names[row["ADM1_PCODE"]] = row
    grouped = defaultdict(list)
    for d in districts:
        grouped[d["division_pcode"]].append(d)
    divisions = []
    for pcode, members in sorted(grouped.items()):
        row = names[pcode]
        population = row.get("bbs_population_2022")
        divisions.append({
            "pcode": pcode, "name": row["area_name"], "norm": norm(row["area_name"]),
            "geometry": unary_union([m["geometry"] for m in members]).buffer(0),
            "population": int(population) if population else None,
        })
        for m in members:
            m["parent"] = divisions[-1]
    return divisions


def audit_locations(facilities, districts):
    """Flag published coordinates that cannot be trusted for spatial analysis."""
    from pyproj import Transformer
    from shapely.geometry import Point
    from shapely.ops import transform  # noqa: shapely 2 keeps this API
    utm = Transformer.from_crs("EPSG:4326", "EPSG:32646", always_xy=True).transform
    district_utm = {d["norm"]: transform(utm, d["geometry"]) for d in districts}
    district_wgs = [(d, d["geometry"]) for d in districts]

    stacks = defaultdict(list)
    for f in facilities:
        if f["active"] and f["published"]:
            stacks[(f["lat"], f["lon"])].append(f)
    shared = set()
    for members in stacks.values():
        if len({(norm(m["district"]), norm(m["upazila"])) for m in members}) >= 2:
            shared.update(m["id"] for m in members)

    flags = {}
    for f in facilities:
        if not (f["active"] and f["published"]):
            continue
        lon, lat = float(f["lon"]), float(f["lat"])
        reasons, detail = [], {}
        recorded = district_utm.get(norm(f["district"]))
        if recorded is None:
            reasons.append("recorded district not recognised")
        else:
            km = recorded.distance(transform(utm, Point(lon, lat))) / 1000.0
            if km > DISTRICT_TOLERANCE_KM:
                reasons.append("outside recorded district")
                detail["km_from_recorded_district"] = round(km, 1)
                point = Point(lon, lat)
                found = next((d["name"] for d, g in district_wgs if g.intersects(point)), "")
                detail["lies_in_district"] = found
        if f["id"] in shared:
            reasons.append("coordinate shared with facilities in other areas")
            detail["facilities_at_coordinate"] = len(stacks[(f["lat"], f["lon"])])
        if reasons:
            flags[f["id"]] = {"reasons": reasons, **detail}
    for f in facilities:
        f["usable"] = f["active"] and f["published"] and f["id"] not in flags
    return flags


def grid_cells(transform):
    from shapely import contains_xy
    from shapely.geometry import shape
    from shapely.ops import transform as shp_transform
    country = shape(json.loads((ROOT / "data/boundaries/bangladesh-country.geojson")
                               .read_text(encoding="utf-8"))["features"][0]["geometry"])
    country_utm = shp_transform(transform, country)
    minx, miny, maxx, maxy = country_utm.bounds
    xs = np.arange(minx + GRID_METRES / 2, maxx, GRID_METRES)
    ys = np.arange(miny + GRID_METRES / 2, maxy, GRID_METRES)
    gx, gy = (a.ravel() for a in np.meshgrid(xs, ys))
    inside = contains_xy(country_utm, gx, gy)
    return gx[inside], gy[inside]


def assign(gx, gy, areas, transform):
    from shapely import points
    from shapely.ops import transform as shp_transform
    from shapely.strtree import STRtree
    polys = [shp_transform(transform, a["geometry"]) for a in areas]
    tree = STRtree(polys)
    cells = points(gx, gy)
    result = np.full(gx.shape[0], -1, dtype=int)
    cell_idx, poly_idx = tree.query(cells, predicate="intersects")
    result[cell_idx[::-1]] = poly_idx[::-1]  # first match wins
    for i in np.flatnonzero(result == -1):
        nearest = tree.query_nearest(cells[i])
        result[i] = int(nearest[0])
    return result


def stats(values):
    if values.size == 0:
        return {"cells": 0}
    out = {"cells": int(values.size), "median_km": round(float(np.median(values)), 2),
           "p90_km": round(float(np.quantile(values, 0.9)), 2), "max_km": round(float(values.max()), 2)}
    out["within_km"] = {str(t): round(float((values <= t).mean()) * 100, 1) for t in THRESHOLDS_KM}
    return out


def curve(values):
    thresholds = np.arange(CURVE_STEP_KM, CURVE_MAX_KM + CURVE_STEP_KM / 2, CURVE_STEP_KM)
    return [[float(t), round(float((values <= t).mean()) * 100, 2)] for t in thresholds]


def rounded(geometry, precision=4):
    from shapely.geometry import mapping

    def walk(coords):
        if isinstance(coords[0], (int, float)):
            return [round(coords[0], precision), round(coords[1], precision)]
        return [walk(part) for part in coords]
    data = mapping(geometry)
    return {"type": data["type"], "coordinates": walk(data["coordinates"])}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--adm2", type=Path, required=True)
    parser.add_argument("--adm3", type=Path, required=True)
    parser.add_argument("--adm4", type=Path, required=True)
    parser.add_argument("--census", type=Path, help="data/population/bbs-census-2022.json: also build data/access/")
    parser.add_argument("--friction", type=Path, help="bd_friction_2019_1km.tif (Earth Engine export): travel time")
    parser.add_argument("--floods", type=Path, nargs="*", help="bd_floods_years.tif and/or bd_floods_events.tif (Earth Engine exports)")
    args = parser.parse_args()

    from pyproj import Transformer
    from scipy.spatial import cKDTree
    from shapely.geometry import Point
    from shapely.strtree import STRtree
    import topojson

    index, facilities = load_registry()
    districts = read_features(args.adm2, 64)
    upazilas = read_features(args.adm3, 544)
    unions = read_features(args.adm4)
    nest(upazilas, districts)
    attach_pcodes(districts, upazilas)
    divisions = build_divisions(districts)
    nest(unions, upazilas)

    registry_names = {}
    for f in facilities:
        for key in ("district", "division"):
            if f[key].strip():
                registry_names.setdefault(norm(f[key]), f[key].strip())
    for area in districts + divisions:
        area["name"] = registry_names.get(area["norm"], area["name"])

    per_upazila = defaultdict(list)
    for u in sorted(unions, key=lambda x: (x["parent"]["pcode"], x["norm"], x["shape_id"])):
        per_upazila[u["parent"]["pcode"]].append(u)
    for pcode, members in per_upazila.items():
        for i, u in enumerate(members, 1):
            u["pcode"] = f"{pcode}-U{i:03d}"

    to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32646", always_xy=True).transform
    from shapely.ops import transform as shp_transform
    for area in divisions + districts + upazilas + unions:
        area["area_km2"] = round(shp_transform(to_utm, area["geometry"]).area / 1e6, 2)

    flags = audit_locations(facilities, districts)

    # Usable points per class (UTM metres) and their union polygon.
    union_tree = STRtree([u["geometry"] for u in unions])
    points = defaultdict(list)
    area_points = {level: defaultdict(Counter) for level in LEVELS}
    area_beds = {level: defaultdict(int) for level in LEVELS}
    outside_unions = 0
    for f in facilities:
        if not f["usable"]:
            continue
        lon, lat = float(f["lon"]), float(f["lat"])
        x, y = to_utm(lon, lat)
        classes = [f["klass"]]
        if f["klass"] in ("public_hospital", "private_ngo_hospital"):
            classes.append("any_hospital")
        for c in classes:
            points[c].append((x, y))
        hits = union_tree.query(Point(lon, lat), predicate="intersects")
        if len(hits) == 0:
            outside_unions += 1
            continue
        union = unions[int(hits[0])]
        chain = {"union": union, "upazila": union["parent"], "district": union["parent"]["parent"],
                 "division": union["parent"]["parent"]["parent"]}
        for level, area in chain.items():
            for c in classes:
                area_points[level][area["pcode"]][c] += 1
            area_beds[level][area["pcode"]] += f["beds"]

    # Counts by recorded DGHS labels (all active records, coordinates not needed).
    label_counts = {"division": defaultdict(Counter), "district": defaultdict(Counter)}
    by_norm = {"division": {d["norm"]: d for d in divisions}, "district": {d["norm"]: d for d in districts}}
    for f in facilities:
        if not f["active"]:
            continue
        for level in ("division", "district"):
            area = by_norm[level].get(norm(f[level]))
            if area:
                counter = label_counts[level][area["pcode"]]
                counter["listings"] += 1
                counter[f["klass"]] += 1
                if f["published"]:
                    counter["published"] += 1
                if f["id"] in flags:
                    counter["flagged"] += 1
                if f["usable"]:
                    counter["usable"] += 1

    # Distance grid.
    gx, gy = grid_cells(to_utm)
    cells = np.column_stack([gx, gy])
    distances = {c: cKDTree(np.array(points[c])).query(cells, k=1)[0] / 1000.0 for c in DISTANCE_CLASSES}
    assignment = {"union": assign(gx, gy, unions, to_utm)}
    union_parent = np.array([upazilas.index(u["parent"]) for u in unions])
    upazila_parent = np.array([districts.index(u["parent"]) for u in upazilas])
    district_parent = np.array([divisions.index(d["parent"]) for d in districts])
    assignment["upazila"] = union_parent[assignment["union"]]
    assignment["district"] = upazila_parent[assignment["upazila"]]
    assignment["division"] = district_parent[assignment["district"]]

    areas_by_level = {"division": divisions, "district": districts, "upazila": upazilas, "union": unions}
    if args.census:
        import build_access
        access = build_access.build({"census": args.census, "divisions": divisions, "districts": districts,
                                     "upazilas": upazilas, "unions": unions, "facilities": facilities,
                                     "to_utm": to_utm, "gx": gx, "gy": gy, "union_of_cell": assignment["union"],
                                     "generated": GENERATED, "friction": args.friction, "floods": args.floods})
        print("access:", json.dumps(access["matching"]["union_population_share"]))
    atlas_dir = ROOT / "data/atlas"
    atlas_dir.mkdir(exist_ok=True)

    def dump(name, payload):
        (atlas_dir / name).write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
                                      encoding="utf-8")

    for level, areas in areas_by_level.items():
        rows = []
        order = np.argsort(assignment[level], kind="stable")
        sorted_ids = assignment[level][order]
        bounds = np.searchsorted(sorted_ids, np.arange(len(areas) + 1))
        for i, area in enumerate(areas):
            members = order[bounds[i]:bounds[i + 1]]
            if level == "union":
                # Compact rows: 5,160 unions are loaded by the browser.
                distance = {}
                for c in ("public_hospital", "any_hospital", "primary_care"):
                    full = stats(distances[c][members])
                    distance[c] = ({"cells": full["cells"], "median_km": full["median_km"],
                                    "within_km": {k: full["within_km"][k] for k in ("5", "10")}}
                                   if full["cells"] else {"cells": 0})
            else:
                distance = {c: stats(distances[c][members]) for c in DISTANCE_CLASSES}
            row = {"pcode": area["pcode"], "name": area["name"], "area_km2": area["area_km2"],
                   "points": dict(area_points[level][area["pcode"]]),
                   "beds": area_beds[level][area["pcode"]],
                   "distance": distance}
            if level != "division":
                parent = area["parent"]
                row["parent"] = parent["pcode"]
                row["parent_name"] = parent["name"]
            if level == "union":
                row["district"] = area["parent"]["parent"]["name"]
            if level in label_counts:
                row["registry"] = dict(label_counts[level][area["pcode"]])
            if level == "division" and area.get("population"):
                row["population_2022"] = area["population"]
            rows.append(row)
        dump(f"areas-{level}.json", {"generatedAt": GENERATED, "level": level, "count": len(rows), "areas": rows})

    dump("distance.json", {
        "generatedAt": GENERATED, "grid_metres": GRID_METRES, "cells": int(gx.shape[0]),
        "crs": "EPSG:32646", "points": {c: len(points[c]) for c in DISTANCE_CLASSES},
        "national": {c: {"curve": curve(distances[c]), **stats(distances[c])} for c in DISTANCE_CLASSES},
    })

    # Profiles: beds, services and establishment decades (all active records).
    by_division = defaultdict(lambda: defaultdict(Counter))
    growth = defaultdict(Counter)
    coverage = Counter()
    for f in facilities:
        if not f["active"]:
            continue
        group = "public" if f["ownership"] in GOV_OWNERSHIP else "private_ngo"
        division = registry_names.get(norm(f["division"]), f["division"] or "Unknown")
        by_division[division]["beds"][group] += f["beds"]
        for flag in ("emergency", "ambulance", "ipd"):
            if f[flag] in ("Yes", "No"):
                coverage[flag] += 1
        if f["year"].isdigit() and 1850 <= int(f["year"]) <= 2026:
            decade = int(f["year"]) // 10 * 10
            growth[decade][group] += 1
            growth[decade]["all"] += 1
            coverage["year"] += 1
    active = sum(1 for f in facilities if f["active"])
    dump("profile-aggregates.json", {
        "generatedAt": GENERATED,
        "coverage": {"facilities_total_active": active, "approved_beds_total": sum(f["beds"] for f in facilities if f["active"]),
                     "service_flags_reported": {k: coverage[k] for k in ("emergency", "ambulance", "ipd")},
                     "establishment_year_reported": coverage["year"]},
        "divisions": {name: {k: dict(v) for k, v in groups.items()} for name, groups in by_division.items()},
        "growth_by_decade": {str(d): dict(c) for d, c in sorted(growth.items())},
    })

    # Location audit outputs.
    published_active = [f for f in facilities if f["active"] and f["published"]]
    reason_counts = Counter(r for v in flags.values() for r in v["reasons"])
    hospitals = [f for f in published_active if f["type"] in HOSPITAL_TYPES]
    quality = {
        "generatedAt": GENERATED,
        "rules": {"district_tolerance_km": DISTRICT_TOLERANCE_KM,
                  "shared_coordinate": "identical to 6 decimals with a facility recorded in another district or upazila"},
        "active_records": active,
        "coordinate_status": dict(Counter(f["status"] for f in facilities if f["active"])),
        "published": len(published_active), "flagged": len(flags), "usable": len(published_active) - len(flags),
        "flag_reasons": dict(reason_counts),
        "hospitals": {"published": len(hospitals), "flagged": sum(1 for f in hospitals if f["id"] in flags),
                      "usable": sum(1 for f in hospitals if f["usable"])},
        "usable_outside_union_polygons": outside_unions,
        "flagged_ids": sorted(flags, key=int),
    }
    dump("location-quality.json", quality)
    with open(atlas_dir / "flagged-locations.csv", "w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(["dghs_id", "code", "name", "facility_type", "recorded_division", "recorded_district",
                         "recorded_upazila", "latitude", "longitude", "reasons", "km_from_recorded_district",
                         "lies_in_district", "facilities_at_coordinate"])
        lookup = {f["id"]: f for f in facilities}
        for fid in sorted(flags, key=int):
            f, v = lookup[fid], flags[fid]
            writer.writerow([fid, f["code"], f["name"], f["type"], f["division"], f["district"], f["upazila"],
                             f["lat"], f["lon"], "; ".join(v["reasons"]), v.get("km_from_recorded_district", ""),
                             v.get("lies_in_district", ""), v.get("facilities_at_coordinate", "")])

    # Boundaries for the web.
    boundaries = ROOT / "data/boundaries"
    (boundaries / "bangladesh-divisions.geojson").write_text(json.dumps({
        "type": "FeatureCollection", "name": "bangladesh-divisions",
        "features": [{"type": "Feature", "properties": {"shapeName": d["name"], "pcode": d["pcode"],
                                                        "area_km2": d["area_km2"]},
                      "geometry": rounded(d["geometry"])} for d in divisions]},
        ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for name, areas in (("districts", districts), ("upazilas", upazilas)):
        (boundaries / f"bangladesh-{name}.geojson").write_text(json.dumps({
            "type": "FeatureCollection", "name": f"bangladesh-{name}",
            "features": [{"type": "Feature", "properties": {"pcode": a["pcode"], "name": a["name"]},
                          "geometry": rounded(a["geometry"])} for a in areas]},
            ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    union_fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"pcode": u["pcode"], "name": u["name"]},
         "geometry": json.loads(json.dumps(rounded(u["geometry"], 5)))} for u in unions]}
    topo = topojson.Topology(union_fc, object_name="unions", prequantize=2e5, toposimplify=0.0006)
    (boundaries / "bangladesh-unions.topojson").write_text(topo.to_json(), encoding="utf-8")

    dump("manifest.json", {
        "generatedAt": GENERATED, "script": "scripts/build_atlas.py",
        "registry": {"sha256": sha256(ROOT / "data/dghs/index.json"), "count": index["count"],
                     "active": active,
                     "hospital_listings_active": sum(1 for f in facilities if f["active"] and f["type"] in HOSPITAL_TYPES),
                     "datasetUpdatedAt": index.get("reportExportedAt")},
        "levels": {level: len(areas) for level, areas in areas_by_level.items()},
        "boundaries": {"source": "Bangladesh Bureau of Statistics (BBS) and OCHA ROAP via geoBoundaries gbOpen BGD ADM2-ADM4",
                       "license": "CC BY 3.0 IGO", "geoboundaries_boundary_year": "2020",
                       "source_dataset": "HDX: Administrative boundaries of Bangladesh as of 2015",
                       "divisions": "dissolved from the 64 BBS districts",
                       "unions": "ADM4 polygons assigned to the upazila containing their representative point; IDs are <upazila pcode>-U<nnn>, not official BBS codes"},
        "classes": {"hospital_types": sorted(HOSPITAL_TYPES),
                    "public_hospital": "hospital type with government, autonomous or semi-autonomous ownership",
                    "private_ngo_hospital": "every other hospital-type record, including missing ownership",
                    "primary_care": sorted(PRIMARY_TYPES)},
        "method": {"grid_metres": GRID_METRES, "distance": "straight-line km from grid cell centres to the nearest usable point; shares of land area",
                   "low_confidence_cells": LOW_CELLS},
    })

    print(f"levels: {len(divisions)} divisions, {len(districts)} districts, {len(upazilas)} upazilas, {len(unions)} unions; {gx.shape[0]} cells")
    print(f"locations: {quality['published']} published, {quality['flagged']} flagged, {quality['usable']} usable; "
          f"hospitals {quality['hospitals']}; reasons {dict(reason_counts)}")
    for c in DISTANCE_CLASSES:
        n = stats(distances[c])
        print(f"  {c}: {len(points[c])} points; median {n['median_km']} km; within 10 km {n['within_km']['10']}%")
    return 0


if __name__ == "__main__":
    sys.exit(main())

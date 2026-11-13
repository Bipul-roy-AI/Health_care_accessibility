#!/usr/bin/env python3
"""Build the district/upazila atlas and distance datasets from committed inputs.

Inputs
------
- data/dghs/index.json and data/dghs/profiles/*.json (committed DGHS snapshot)
- data/accessibility/baseline/*.csv (committed name-join baseline and BBS pcodes)
- geoBoundaries gbOpen BGD ADM2/ADM3 simplified GeoJSON (downloaded; see
  --adm2/--adm3). Source lineage: Bangladesh Bureau of Statistics (BBS) /
  OCHA ROAP administrative boundaries, redistributed by
  geoBoundaries under CC BY 3.0 IGO (geoBoundaries tags boundaryYear 2020; the
  source dataset is HDX "as of 2015"). The ADM2 file is byte-identical to
  data/research/districts.geojson. The (district, upazila) name pairs match the
  study's audit pcodes 544/544.

Outputs (committed)
-------------------
- data/boundaries/bangladesh-districts.geojson   (display copy, 4-dp coords)
- data/boundaries/bangladesh-upazilas.geojson    (display copy, 4-dp coords)
- data/atlas/areas-adm2.json, areas-adm3.json    (per-area aggregates)
- data/atlas/distance.json                       (grid distance statistics)
- data/atlas/profile-aggregates.json             (beds, services, growth)
- data/atlas/manifest.json                       (method, sources, counts)

Method notes
------------
- Counts by "registry label" use the DGHS administrative fields and include
  facilities without usable coordinates. Counts by "mapped point" use only
  published coordinates assigned to polygons (point in polygon).
- Distances are straight-line kilometres on a 2 km national grid (UTM 46N),
  from each grid cell centre to the nearest facility point of a class. They
  describe land area, not population, and are not travel times.
- Hospital classes reuse HOSPITAL_TYPES from scripts/build_statistics.py, so
  they match the Statistics and Research pages. That list includes jail and
  military hospitals, whose public access is restricted. Administrative offices
  and training institutions are never counted as care facilities.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GENERATED = datetime.now(timezone.utc).isoformat(timespec="seconds")

ADM_ALIASES = {
    "barisal": "barishal", "chittagong": "chattogram", "bogra": "bogura",
    "comilla": "cumilla", "jessore": "jashore", "jhalokati": "jhalokathi",
    "chapai nawabganj": "chapainawabganj", "khagrachhari": "khagrachari",
    "nawabganj": "chapainawabganj", "brahamanbaria": "brahmanbaria",
}

sys.path.insert(0, str(Path(__file__).resolve().parent))
# One hospital definition for the whole site: reuse the statistics page's
# explicit type list and government-ownership set (scripts/build_statistics.py).
from build_statistics import HOSPITAL_TYPES, PUBLIC as GOV_OWNERSHIP  # noqa: E402

PRIVATE_NGO_TYPES = {"Private Hospital / Clinic", "NGO Hospital/Clinic"}
PRIMARY_TYPES = {
    "Community Clinic", "Union Health Center", "Union Health Sub Center",
    "Union Health & Family Welfare Center (UH&FWC)",
    "Maternal & Child Welfare Centre (MCWC)", "Urban Dispensary",
    "Urban Primary Health Care Center", "School Health Clinic",
    "Family Planning Clinic",
}
DIAGNOSTIC_TYPES = {"Consultancy & Diagnostic Center"}

GRID_METRES = 2000.0
CURVE_MAX_KM = 40.0
CURVE_STEP_KM = 0.5
THRESHOLDS_KM = (5.0, 10.0, 15.0, 20.0, 30.0)


def norm(value: str | None) -> str:
    value = unicodedata.normalize("NFKC", str(value or "")).casefold()
    value = value.replace("-", " ").replace("'", "").replace("’", "")
    value = " ".join(value.split())
    return ADM_ALIASES.get(value, value)


def classify(record: dict) -> str:
    kind = record.get("facility_type_name") or ""
    if kind in HOSPITAL_TYPES:
        # "public" = explicit government/autonomous ownership, as on the
        # statistics page; everything else of a hospital type is non-government
        # or has no reported ownership.
        if (kind not in PRIVATE_NGO_TYPES
                and (record.get("facility_ownership_name") or "") in GOV_OWNERSHIP):
            return "public_hospital"
        return "private_ngo_hospital"
    if kind in PRIMARY_TYPES:
        return "primary_care"
    if kind in DIAGNOSTIC_TYPES:
        return "diagnostic"
    return "other"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def load_registry() -> tuple[dict, list[dict]]:
    index = json.loads((ROOT / "data/dghs/index.json").read_text(encoding="utf-8"))
    profiles: dict[str, dict] = {}
    for chunk in sorted((ROOT / "data/dghs/profiles").glob("*.json")):
        profiles.update(json.loads(chunk.read_text(encoding="utf-8")))
    facilities = []
    for record in index["records"]:
        profile = profiles.get(str(record.get("id")), {})
        beds = 0
        for field in ("approved_bed_number",):
            try:
                beds = max(beds, int(profile.get(field) or 0))
            except (TypeError, ValueError):
                pass
        facilities.append({
            "id": str(record.get("id")),
            "active": record.get("is_active") == "1",
            "type": record.get("facility_type_name") or "",
            "klass": classify(record),
            "division": record.get("division_name") or "",
            "district": record.get("district_name") or "",
            "upazila": record.get("upazila_name") or "",
            "ownership": record.get("facility_ownership_name") or "",
            "lat": record.get("lat"),
            "lon": record.get("lon"),
            "mapped": record.get("coordinateStatus") == "published",
            "beds": beds,
            "emergency": profile.get("has_emergency") or "",
            "ambulance": profile.get("has_ambulance") or "",
            "ipd": profile.get("has_ipd") or "",
            "year": (profile.get("establishment_year") or "").strip(),
        })
    return index, facilities


def load_boundaries(adm2_path: Path, adm3_path: Path):
    from shapely.geometry import shape
    from shapely.strtree import STRtree

    adm2 = json.loads(adm2_path.read_text(encoding="utf-8"))["features"]
    adm3 = json.loads(adm3_path.read_text(encoding="utf-8"))["features"]
    if len(adm2) != 64 or len(adm3) != 544:
        raise SystemExit("Unexpected boundary feature counts; refusing to build")

    districts = []
    for feature in adm2:
        districts.append({
            "shape_id": feature["properties"]["shapeID"],
            "name": feature["properties"]["shapeName"],
            "norm": norm(feature["properties"]["shapeName"]),
            "geometry": shape(feature["geometry"]),
            "raw": feature,
        })
    tree = STRtree([d["geometry"] for d in districts])
    upazilas = []
    for feature in adm3:
        geometry = shape(feature["geometry"])
        point = geometry.representative_point()
        hits = tree.query(point, predicate="within")
        if len(hits) != 1:
            hits = [min(range(len(districts)),
                        key=lambda i: districts[i]["geometry"].distance(point))]
        parent = districts[int(hits[0])]
        upazilas.append({
            "shape_id": feature["properties"]["shapeID"],
            "name": feature["properties"]["shapeName"],
            "norm": norm(feature["properties"]["shapeName"]),
            "district": parent,
            "geometry": geometry,
            "raw": feature,
        })
    return districts, upazilas


def pcode_crosswalk(districts, upazilas):
    with open(ROOT / "data/accessibility/baseline/district_availability.csv",
              encoding="utf-8-sig") as stream:
        district_rows = list(csv.DictReader(stream))
    with open(ROOT / "data/accessibility/baseline/upazila_thana_availability.csv",
              encoding="utf-8-sig") as stream:
        upazila_rows = list(csv.DictReader(stream))

    district_pcodes = {}
    for row in district_rows:
        district_pcodes.setdefault(norm(row["area_name"]),
                                   (row["ADM2_PCODE"], row["ADM1_PCODE"]))
    for district in districts:
        pcode, parent = district_pcodes.get(district["norm"], ("", ""))
        if not pcode:
            raise SystemExit(f"District pcode missing: {district['name']}")
        district["pcode"], district["division_pcode"] = pcode, parent

    pair_pcodes, pair_rows = {}, defaultdict(dict)
    division_names = {}
    for row in upazila_rows:
        key = (row["ADM2_PCODE"], norm(row["area_name"]))
        pair_pcodes.setdefault(key, row["pcode"])
        pair_rows[row["pcode"]][row["tier"]] = row
    for row in district_rows:
        division_names.setdefault(row["ADM1_PCODE"], row.get("ADM1_PCODE"))
    for upazila in upazilas:
        key = (upazila["district"]["pcode"], upazila["norm"])
        pcode = pair_pcodes.get(key)
        if not pcode:
            raise SystemExit(f"Upazila pcode missing: {upazila['name']}")
        upazila["pcode"] = pcode
        upazila["baseline"] = pair_rows.get(pcode, {})
    if len({u["pcode"] for u in upazilas}) != 544:
        raise SystemExit("Upazila pcode crosswalk is not one-to-one")
    return pair_rows


def utm_transformer():
    from pyproj import Transformer
    return Transformer.from_crs("EPSG:4326", "EPSG:32646", always_xy=True)


def area_km2(geometry, transform) -> float:
    from shapely.ops import transform as shp_transform
    return shp_transform(transform, geometry).area / 1e6


def facility_points(facilities, transform):
    points = defaultdict(list)
    for facility in facilities:
        if not (facility["active"] and facility["mapped"]):
            continue
        try:
            lon, lat = float(facility["lon"]), float(facility["lat"])
        except (TypeError, ValueError):
            continue
        x, y = transform.transform(lon, lat)
        points[facility["klass"]].append((x, y))
        points["any_facility"].append((x, y))
        if facility["klass"] in ("public_hospital", "private_ngo_hospital"):
            points["any_hospital"].append((x, y))
    return points


def build_grid(country_geojson: Path, transform):
    import numpy as np
    from shapely.geometry import shape
    from shapely.ops import transform as shp_transform
    from shapely import contains_xy

    country = shape(json.loads(country_geojson.read_text(encoding="utf-8"))
                    ["features"][0]["geometry"])
    country_utm = shp_transform(transform.transform, country)
    minx, miny, maxx, maxy = country_utm.bounds
    xs = np.arange(minx + GRID_METRES / 2, maxx, GRID_METRES)
    ys = np.arange(miny + GRID_METRES / 2, maxy, GRID_METRES)
    gx, gy = np.meshgrid(xs, ys)
    gx, gy = gx.ravel(), gy.ravel()
    inside = contains_xy(country_utm, gx, gy)
    return gx[inside], gy[inside]


def assign_cells(gx, gy, polygons, transform):
    """Assign each grid cell to a polygon index via STRtree on UTM geometries."""
    import numpy as np
    from shapely.geometry import Point
    from shapely.ops import transform as shp_transform
    from shapely.strtree import STRtree

    utm_polys = [shp_transform(transform.transform, p["geometry"]) for p in polygons]
    tree = STRtree(utm_polys)
    assignment = np.full(gx.shape[0], -1, dtype=int)
    cell_points = [Point(x, y) for x, y in zip(gx, gy)]
    matches = tree.query(cell_points, predicate="intersects")
    for cell_index, poly_index in zip(matches[0], matches[1]):
        if assignment[cell_index] == -1:
            assignment[cell_index] = poly_index
    missing = np.flatnonzero(assignment == -1)
    for cell_index in missing:
        point = cell_points[cell_index]
        assignment[cell_index] = min(range(len(utm_polys)),
                                     key=lambda i: utm_polys[i].distance(point))
    return assignment


def distance_stats(points_by_class, gx, gy):
    import numpy as np
    from scipy.spatial import cKDTree

    distances = {}
    cells = np.column_stack([gx, gy])
    for klass in ("public_hospital", "private_ngo_hospital", "any_hospital"):
        tree = cKDTree(np.array(points_by_class[klass]))
        dist, _ = tree.query(cells, k=1)
        distances[klass] = dist / 1000.0
    return distances


def curve(values, limit=CURVE_MAX_KM, step=CURVE_STEP_KM):
    import numpy as np
    thresholds = np.arange(step, limit + step / 2, step)
    share = [(float(t), round(float((values <= t).mean()) * 100, 2))
             for t in thresholds]
    return share


def quantiles(values):
    import numpy as np
    if values.size == 0:
        return {"cells": 0}
    return {
        "cells": int(values.size),
        "mean_km": round(float(values.mean()), 2),
        "median_km": round(float(np.median(values)), 2),
        "p90_km": round(float(np.quantile(values, 0.9)), 2),
        "max_km": round(float(values.max()), 2),
    }


def rounded_feature(feature, properties, precision=4):
    def walk(coords):
        if isinstance(coords[0], (int, float)):
            return [round(coords[0], precision), round(coords[1], precision)]
        return [walk(part) for part in coords]
    return {"type": "Feature", "properties": properties,
            "geometry": {"type": feature["raw"]["geometry"]["type"],
                         "coordinates": walk(feature["raw"]["geometry"]["coordinates"])}}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adm2", type=Path, required=True,
                        help="geoBoundaries-BGD-ADM2_simplified.geojson")
    parser.add_argument("--adm3", type=Path, required=True,
                        help="geoBoundaries-BGD-ADM3_simplified.geojson")
    args = parser.parse_args()

    index, facilities = load_registry()
    districts, upazilas = load_boundaries(args.adm2, args.adm3)
    pcode_crosswalk(districts, upazilas)
    registry_names = {}
    for facility in facilities:
        name = (facility["district"] or "").strip()
        if name:
            registry_names.setdefault(norm(name), name)
    for district in districts:
        district["name"] = registry_names.get(district["norm"], district["name"])
    for upazila in upazilas:
        upazila["district"]["name"] = registry_names.get(
            upazila["district"]["norm"], upazila["district"]["name"])
    transform = utm_transformer()

    for area in districts + upazilas:
        area["area_km2"] = round(area_km2(area["geometry"], transform.transform), 1)

    # --- registry-label aggregation (all active records, coordinates not needed)
    district_by_norm = {d["norm"]: d for d in districts}
    division_pops = {}
    with open(ROOT / "data/accessibility/baseline/division_availability.csv",
              encoding="utf-8-sig") as stream:
        for row in csv.DictReader(stream):
            if row.get("bbs_population_2022"):
                division_pops[row["ADM1_PCODE"]] = int(row["bbs_population_2022"])

    label_counts = defaultdict(Counter)
    label_beds = defaultdict(Counter)
    unassigned_labels = 0
    for facility in facilities:
        if not facility["active"]:
            continue
        district = district_by_norm.get(norm(facility["district"]))
        if district is None:
            unassigned_labels += 1
            continue
        label_counts[district["pcode"]][facility["klass"]] += 1
        label_counts[district["pcode"]]["total"] += 1
        if facility["mapped"]:
            label_counts[district["pcode"]]["mapped"] += 1
        label_beds[district["pcode"]][facility["klass"]] += facility["beds"]
        label_beds[district["pcode"]]["total"] += facility["beds"]

    # --- point-in-polygon aggregation on upazila polygons
    from shapely.geometry import Point
    from shapely.strtree import STRtree
    upazila_tree = STRtree([u["geometry"] for u in upazilas])
    point_counts = defaultdict(Counter)
    point_beds = defaultdict(Counter)
    for facility in facilities:
        if not (facility["active"] and facility["mapped"]):
            continue
        try:
            point = Point(float(facility["lon"]), float(facility["lat"]))
        except (TypeError, ValueError):
            continue
        hits = upazila_tree.query(point, predicate="intersects")
        if len(hits) == 0:
            continue
        upazila = upazilas[int(hits[0])]
        point_counts[upazila["pcode"]][facility["klass"]] += 1
        point_counts[upazila["pcode"]]["total"] += 1
        point_beds[upazila["pcode"]][facility["klass"]] += facility["beds"]
        point_beds[upazila["pcode"]]["total"] += facility["beds"]

    # --- distance grid
    points = facility_points(facilities, transform)
    gx, gy = build_grid(ROOT / "data/boundaries/bangladesh-country.geojson", transform)
    distances = distance_stats(points, gx, gy)
    district_assignment = assign_cells(gx, gy, districts, transform)
    upazila_assignment = assign_cells(gx, gy, upazilas, transform)

    import numpy as np
    national = {klass: {"curve": curve(values), **quantiles(values),
                        "within_km": {str(int(t) if t == int(t) else t):
                                      round(float((values <= t).mean()) * 100, 2)
                                      for t in THRESHOLDS_KM}}
                for klass, values in distances.items()}

    per_district_distance, per_upazila_distance = {}, {}
    division_cells = {}
    for i, district in enumerate(districts):
        mask = district_assignment == i
        entry = {}
        for klass, values in distances.items():
            stats = quantiles(values[mask])
            stats["within_km"] = {str(int(t) if t == int(t) else t):
                                  round(float((values[mask] <= t).mean()) * 100, 2)
                                  for t in THRESHOLDS_KM} if mask.any() else {}
            entry[klass] = stats
        per_district_distance[district["pcode"]] = entry
        division_cells.setdefault(district["division_pcode"], []).append(mask)
    for i, upazila in enumerate(upazilas):
        mask = upazila_assignment == i
        entry = {}
        for klass, values in distances.items():
            entry[klass] = quantiles(values[mask])
        per_upazila_distance[upazila["pcode"]] = entry

    # --- divisions: population-adjusted rates (division level only)
    division_counts = defaultdict(Counter)
    for district in districts:
        for key, value in label_counts[district["pcode"]].items():
            division_counts[district["division_pcode"]][key] += value

    # --- profile aggregates (beds, services, growth)
    by_division = defaultdict(lambda: defaultdict(Counter))
    growth = defaultdict(Counter)
    service_cov = Counter()
    for facility in facilities:
        if not facility["active"]:
            continue
        division = facility["division"] or "Unknown"
        group = ("public" if facility["ownership"] in GOV_OWNERSHIP else "private_ngo")
        by_division[division]["beds"][group] += facility["beds"]
        by_division[division]["facilities"][group] += 1
        for flag in ("emergency", "ambulance", "ipd"):
            value = facility[flag]
            if value in ("Yes", "No"):
                by_division[division][flag][value] += 1
                service_cov[flag] += 1
        year = facility["year"]
        if year.isdigit() and 1850 <= int(year) <= 2026:
            decade = (int(year) // 10) * 10
            growth[decade][group] += 1
            growth[decade]["all"] += 1
            service_cov["establishment_year"] += 1

    # --- write outputs
    atlas_dir = ROOT / "data/atlas"
    atlas_dir.mkdir(exist_ok=True)

    def dump(name, payload):
        path = atlas_dir / name
        path.write_text(json.dumps(payload, ensure_ascii=False,
                                   separators=(",", ":")) + "\n", encoding="utf-8")
        return path

    adm2_payload = {"generatedAt": GENERATED, "areas": []}
    for district in districts:
        pcode = district["pcode"]
        adm2_payload["areas"].append({
            "pcode": pcode, "name": district["name"],
            "division_pcode": district["division_pcode"],
            "area_km2": district["area_km2"],
            "registry": dict(label_counts[pcode]),
            "beds_registry": dict(label_beds[pcode]),
            "distance": per_district_distance[pcode],
        })
    dump("areas-adm2.json", adm2_payload)

    adm3_payload = {"generatedAt": GENERATED, "areas": []}
    for upazila in upazilas:
        pcode = upazila["pcode"]
        baseline = {tier: {
            "active": int(row["active_listings_by_registry_name"] or 0),
            "points_inside": int(row["spatial_points_inside"] or 0)}
            for tier, row in upazila["baseline"].items()}
        adm3_payload["areas"].append({
            "pcode": pcode, "name": upazila["name"],
            "district_pcode": upazila["district"]["pcode"],
            "district_name": upazila["district"]["name"],
            "area_km2": upazila["area_km2"],
            "points": dict(point_counts[pcode]),
            "beds_points": dict(point_beds[pcode]),
            "baseline_tiers": baseline,
            "distance": per_upazila_distance[pcode],
        })
    dump("areas-adm3.json", adm3_payload)

    division_distance = {}
    division_labels = {d["division_pcode"]: d for d in districts}
    for division_pcode, masks in division_cells.items():
        mask = np.logical_or.reduce(masks)
        entry = {}
        for klass, values in distances.items():
            stats = quantiles(values[mask])
            stats["within_km"] = {str(int(t) if t == int(t) else t):
                                  round(float((values[mask] <= t).mean()) * 100, 2)
                                  for t in THRESHOLDS_KM} if mask.any() else {}
            entry[klass] = stats
        division_distance[division_pcode] = entry

    division_name_by_pcode = {}
    registry_division_names = {}
    for facility in facilities:
        name = (facility["division"] or "").strip()
        if name:
            registry_division_names.setdefault(norm(name), name)
    with open(ROOT / "data/accessibility/baseline/division_availability.csv",
              encoding="utf-8-sig") as stream:
        for row in csv.DictReader(stream):
            label = registry_division_names.get(norm(row["area_name"]),
                                                row["area_name"])
            division_name_by_pcode.setdefault(row["ADM1_PCODE"], label)

    dump("distance.json", {
        "generatedAt": GENERATED,
        "grid_metres": GRID_METRES, "cells": int(gx.shape[0]),
        "crs": "EPSG:32646 (UTM 46N)",
        "classes": {klass: len(points[klass]) for klass in
                    ("public_hospital", "private_ngo_hospital", "any_hospital")},
        "national": national,
        "divisions": {pcode: {"name": division_name_by_pcode.get(pcode, pcode),
                              **stats}
                      for pcode, stats in sorted(division_distance.items())},
    })

    divisions_payload = {}
    for division_pcode, counts in division_counts.items():
        population = division_pops.get(division_pcode)
        divisions_payload[division_pcode] = {
            "registry": dict(counts),
            "bbs_population_2022": population,
            "per_100000": {key: round(value / population * 100000, 2)
                           for key, value in counts.items()} if population else None,
        }
    dump("profile-aggregates.json", {
        "generatedAt": GENERATED,
        "coverage": {
            "facilities_total_active": sum(1 for f in facilities if f["active"]),
            "service_flags_reported": {k: service_cov[k] for k in
                                       ("emergency", "ambulance", "ipd")},
            "establishment_year_reported": service_cov["establishment_year"],
            "approved_beds_total": sum(f["beds"] for f in facilities if f["active"]),
        },
        "divisions": {division: {key: dict(counter) for key, counter in groups.items()}
                      for division, groups in by_division.items()},
        "division_rates": divisions_payload,
        "growth_by_decade": {str(decade): dict(counter)
                             for decade, counter in sorted(growth.items())},
    })

    boundaries_dir = ROOT / "data/boundaries"
    for name, areas, extra in (
        ("bangladesh-districts.geojson", districts,
         lambda a: {"division_pcode": a["division_pcode"]}),
        ("bangladesh-upazilas.geojson", upazilas,
         lambda a: {"district_pcode": a["district"]["pcode"],
                    "district_name": a["district"]["name"]}),
    ):
        collection = {"type": "FeatureCollection",
                      "name": name.replace(".geojson", ""),
                      "features": [rounded_feature(area, {
                          "pcode": area["pcode"], "name": area["name"],
                          "area_km2": area["area_km2"], **extra(area)})
                          for area in areas]}
        (boundaries_dir / name).write_text(
            json.dumps(collection, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8")

    dump("manifest.json", {
        "generatedAt": GENERATED,
        "script": "scripts/build_atlas.py",
        "registry": {"sha256": sha256(ROOT / "data/dghs/index.json"),
                     "count": index["count"],
                     "active": sum(1 for f in facilities if f["active"]),
                     "hospital_listings_active": sum(
                         1 for f in facilities
                         if f["active"] and f["type"] in HOSPITAL_TYPES),
                     "active_without_district_match": unassigned_labels,
                     "datasetUpdatedAt": index.get("reportExportedAt")},
        "boundaries": {
            "source": "Bangladesh Bureau of Statistics (BBS), OCHA ROAP; "
                      "redistributed by geoBoundaries (gbOpen BGD ADM2/ADM3)",
            "license": "CC BY 3.0 IGO",
            "geoboundaries_boundary_year": "2020",
            "source_dataset": "HDX 'Administrative boundaries of Bangladesh as of 2015'",
            "display_precision": "4 decimal places (~11 m)",
            "download": "https://github.com/wmgeolab/geoBoundaries 'releaseData/gbOpen/BGD'",
        },
        "classes": {
            "hospital_types": sorted(HOSPITAL_TYPES),
            "hospital_types_source": "scripts/build_statistics.py HOSPITAL_TYPES "
                                     "(same list as the Statistics and Research pages)",
            "public_hospital": "hospital type AND ownership in "
                               + ", ".join(sorted(GOV_OWNERSHIP)),
            "private_ngo_hospital": "every other hospital-type record, including "
                                    "missing ownership",
            "includes_restricted_access": ["Combined Military Hospital", "Jail Hospital"],
            "primary_care": sorted(PRIMARY_TYPES),
            "diagnostic": sorted(DIAGNOSTIC_TYPES),
        },
        "method": {
            "grid_metres": GRID_METRES,
            "distance": "straight-line km, grid cell centre to nearest mapped "
                        "facility point, UTM 46N; land area shares, not population",
            "registry_label_counts": "DGHS administrative fields; include "
                                     "records without usable coordinates",
            "point_counts": "published coordinates only, point in polygon on "
                            "simplified BBS/OCHA boundaries",
        },
    })

    print(f"atlas build complete: {len(districts)} districts, {len(upazilas)} upazilas, "
          f"{gx.shape[0]} grid cells")
    for klass in ("public_hospital", "private_ngo_hospital", "any_hospital"):
        print(f"  {klass}: {len(points[klass])} mapped points; "
              f"median {national[klass]['median_km']} km; "
              f"within 10 km {national[klass]['within_km']['10']}% of land area")
    return 0


if __name__ == "__main__":
    sys.exit(main())

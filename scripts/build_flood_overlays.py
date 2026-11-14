"""Web overlays of the satellite flood maps for the Access page flood map.

Reads the Earth Engine exports (scripts/gee/bangladesh_access_inputs.js) and writes
palette PNGs in Web Mercator (EPSG:3857), which Leaflet can place with L.imageOverlay,
plus data/floods/overlays.json with each layer's bounds and legend.

  python3 scripts/build_flood_overlays.py --years bd_floods_years.tif --events bd_floods_events.tif

Layers
  e_<event>  named flood, 200 m: 1 = flooded beyond normal monsoon water, 2 = normal monsoon
             water (flooded in >= 4 of the other 6 Sentinel-1 years; same rule as build_travel).
  y<year>    whole year, 250 m: 1 = flooded.
  frequency  2000-2025, 250 m: number of yearly maps flooded, in six classes.
Permanent water (JRC GSW, the perm_water band) and pixels outside Bangladesh are transparent.
Downsampling uses the modal class.

Connectivity (for the flood maps' facility and road layers)
  data/floods/facilities.json  for each layer, the rows of data/access/points.json whose own pixel
                               is flooded (events: beyond normal monsoon water), and for every point
                               the number of the 26 yearly maps it was flooded in.
  data/floods/roads.geojson    OSM main roads (motorway, trunk, primary, secondary and their links),
                               simplified, when --roads gives the Geofabrik roads shapefile.
  data/floods/roads/<layer>.geojson  the stretches of those roads under water in each layer:
                               roads are sampled every 100 m (events) or 250 m (years) and a run of
                               flooded samples becomes one flooded stretch.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_travel  # noqa: E402

OUT = ROOT / "data/floods"
EVENT_RES, YEAR_RES = 200, 250
FLOOD, NORMAL = "#08306b", "#4fb3bf"
FREQ_BINS = [(1, 1), (2, 3), (4, 6), (7, 12), (13, 19), (20, 26)]
FREQ_COLOURS = ["#c6dbef", "#9ecae1", "#6baed6", "#3182bd", "#08519c", "#08306b"]
ROAD_CLASSES = {"motorway": 1, "motorway_link": 1, "trunk": 1, "trunk_link": 1, "primary": 2, "primary_link": 2,
                "secondary": 3, "secondary_link": 3}
ROAD_NAMES = {1: "national highway (motorway or trunk)", 2: "primary road", 3: "secondary road"}
SIMPLIFY_M = 25


def to_mercator(classes, transform, res):
    """Reproject a small-integer class raster (0 = empty) to EPSG:3857 by modal class."""
    from rasterio.warp import Resampling, calculate_default_transform, reproject
    from rasterio.transform import array_bounds
    h, w = classes.shape
    bounds = array_bounds(h, w, transform)
    dst_t, dw, dh = calculate_default_transform("EPSG:32646", "EPSG:3857", w, h, *bounds, resolution=res)
    # 255 marks "no source data"; 0 must stay an ordinary class or the mode would skip dry pixels.
    out = np.full((dh, dw), 255, np.uint8)
    reproject(classes.astype(np.uint8), out, src_transform=transform, src_crs="EPSG:32646", dst_transform=dst_t,
              dst_crs="EPSG:3857", resampling=Resampling.mode, src_nodata=255, dst_nodata=255)
    out[out == 255] = 0
    return out, dst_t


def trim(arr, transform):
    """Crop to the non-empty extent so images stay small."""
    rows, cols = np.nonzero(arr)
    if rows.size == 0:
        return arr[:1, :1], transform
    r0, r1, c0, c1 = rows.min(), rows.max() + 1, cols.min(), cols.max() + 1
    return arr[r0:r1, c0:c1], transform * transform.translation(c0, r0)


def latlon_bounds(arr, transform):
    from rasterio.warp import transform as warp
    h, w = arr.shape
    west, north = transform * (0, 0)
    east, south = transform * (w, h)
    lons, lats = warp("EPSG:3857", "EPSG:4326", [west, east], [south, north])
    return [[round(lats[0], 6), round(lons[0], 6)], [round(lats[1], 6), round(lons[1], 6)]]


def write_png(arr, colours, path):
    from PIL import Image
    image = Image.fromarray(arr, "P")
    palette = [0, 0, 0]
    for c in colours:
        palette += [int(c[i:i + 2], 16) for i in (1, 3, 5)]
    image.putpalette(palette + [0] * (768 - len(palette)))
    image.save(path, "PNG", optimize=True, transparency=0)


def layer(arr, transform, res, colours, name):
    merc, t = to_mercator(arr, transform, res)
    merc, t = trim(merc, t)
    path = OUT / "overlays" / f"{name}.png"
    write_png(merc, colours, path)
    return {"file": f"overlays/{name}.png", "bounds": latlon_bounds(merc, t), "res_m": res, "bytes": path.stat().st_size}


def read(path):
    import rasterio
    with rasterio.open(path) as src:
        if src.crs is None or src.crs.to_epsg() != 32646:
            raise SystemExit(f"{path}: expected EPSG:32646, got {src.crs}")
        return {n: src.read(i + 1) for i, n in enumerate(src.descriptions)}, src.transform


def load_points():
    """Facility points of the Access page, projected to the flood rasters' CRS."""
    from pyproj import Transformer
    pts = json.loads((ROOT / "data/access/points.json").read_text(encoding="utf-8"))
    lon = np.array([r[0] for r in pts["rows"]]); lat = np.array([r[1] for r in pts["rows"]])
    x, y = Transformer.from_crs(4326, 32646, always_xy=True).transform(lon, lat)
    return pts, np.asarray(x), np.asarray(y)


def flooded_at(mask, transform, x, y):
    """True where a point falls on a flooded pixel of `mask`."""
    r, c = build_travel.cells_of(transform, mask.shape, x, y)
    out = np.zeros(len(x), bool)
    ok = r >= 0
    out[ok] = mask[r[ok], c[ok]]
    return out


def load_roads(path):
    """OSM main roads from the Geofabrik roads shapefile, in EPSG:32646, with class code and label."""
    import geopandas as gpd
    roads = gpd.read_file(path, columns=["fclass", "name", "ref"])
    roads = roads[roads["fclass"].isin(ROAD_CLASSES)].to_crs(32646)
    roads = roads[roads.geometry.notna() & ~roads.geometry.is_empty].explode(index_parts=False)
    roads["c"] = roads["fclass"].map(ROAD_CLASSES).astype(int)
    roads["n"] = [(r if isinstance(r, str) and r else "") or (n if isinstance(n, str) else "") for r, n in zip(roads["ref"], roads["name"])]
    return roads[["c", "n", "geometry"]].reset_index(drop=True)


def flooded_stretches(roads, mask, transform, step):
    """Sample each road every `step` metres; runs of flooded samples become flooded stretches.
    Returns (list of (class, LineString), km flooded by class)."""
    import shapely
    from shapely.ops import substring
    lines = roads.geometry.values
    lengths = shapely.length(lines)
    counts = np.maximum(2, np.ceil(lengths / step).astype(int) + 1)
    owner = np.repeat(np.arange(len(lines)), counts)
    starts = np.repeat(np.cumsum(counts) - counts, counts)
    frac = (np.arange(owner.size) - starts) / np.repeat(counts - 1, counts)
    dist = frac * lengths[owner]
    pts = shapely.line_interpolate_point(lines[owner], dist)
    wet = flooded_at(mask, transform, shapely.get_x(pts), shapely.get_y(pts))
    out, km = [], {}
    i = 0
    while i < owner.size:
        if not wet[i]:
            i += 1
            continue
        j = i
        while j + 1 < owner.size and owner[j + 1] == owner[i] and wet[j + 1]:
            j += 1
        k, half = owner[i], step / 2
        d0, d1 = max(0.0, dist[i] - half), min(lengths[k], dist[j] + half)
        piece = substring(lines[k], d0, d1)
        cls = int(roads["c"].iat[k])
        if piece.length > 0:
            out.append((cls, piece))
            km[cls] = km.get(cls, 0.0) + piece.length / 1000
        i = j + 1
    return out, {str(c): round(v, 1) for c, v in sorted(km.items())}


def to_lonlat_features(items, simplify=0):
    from pyproj import Transformer
    tr = Transformer.from_crs(32646, 4326, always_xy=True)
    feats = []
    for props, geom in items:
        if simplify:
            geom = geom.simplify(simplify, preserve_topology=False)
        coords = np.asarray(geom.coords)
        if len(coords) < 2:
            continue
        lon, lat = tr.transform(coords[:, 0], coords[:, 1])
        feats.append({"type": "Feature", "properties": props,
                      "geometry": {"type": "LineString", "coordinates": [[round(a, 5), round(b, 5)] for a, b in zip(lon, lat)]}})
    return {"type": "FeatureCollection", "features": feats}


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def build(years_path: Path, events_path: Path, roads_path: Path | None = None) -> dict:
    (OUT / "overlays").mkdir(parents=True, exist_ok=True)
    years, y_t = read(years_path)
    events, e_t = read(events_path)
    s1, s1_t = build_travel.sentinel_years([years_path])
    layers = {}
    pts, px, py = load_points()
    fac = {"generatedAt": None, "points": "data/access/points.json", "flooded": {}, "counts": {}}
    roads = load_roads(roads_path) if roads_path else None

    def connect(name, flooded, transform, step):
        hit = flooded_at(flooded, transform, px, py)
        fac["flooded"][name] = np.flatnonzero(hit).tolist()
        fac["counts"][name] = {k: int(sum(1 for i in np.flatnonzero(hit) if pts["rows"][i][2] & bit)) for k, bit in pts["bits"].items()}
        if roads is not None:
            parts, km = flooded_stretches(roads, flooded, transform, step)
            write_json(OUT / "roads" / f"{name}.geojson", to_lonlat_features([({"c": c}, g) for c, g in parts]))
            layers[name]["roads_flooded_km"] = km

    perm = events.get("perm_water", 0)
    for name in sorted(n for n in events if n.startswith("f") and n[1:5].isdigit()):
        flooded = (events[name] == 1) & (perm != 1)
        normal = build_travel.seasonal_water(s1, s1_t, int(name[1:5]), e_t, flooded.shape)
        classes = np.where(flooded & ~normal, 1, np.where(flooded & normal, 2, 0))
        layers[name] = {**layer(classes, e_t, EVENT_RES, [FLOOD, NORMAL], name), "kind": "event"}
        connect(name, classes == 1, e_t, 100)

    perm = years.get("perm_water", 0)
    count = np.zeros(perm.shape, np.uint8)
    for name in sorted(n for n in years if n.startswith("y") and n[1:5].isdigit()):
        flooded = (years[name] == 1) & (perm != 1)
        count += flooded
        layers[name] = {**layer(flooded.astype(np.uint8), y_t, YEAR_RES, [FLOOD], name), "kind": "year"}
        connect(name, flooded, y_t, 250)
    classes = np.zeros(count.shape, np.uint8)
    for i, (lo, hi) in enumerate(FREQ_BINS, start=1):
        classes[(count >= lo) & (count <= hi)] = i
    layers["frequency"] = {**layer(classes, y_t, YEAR_RES, FREQ_COLOURS, "frequency"), "kind": "frequency",
                           "years_mapped": sum(1 for n in years if n.startswith("y") and n[1:5].isdigit())}
    # Facilities: years flooded at each point; for the frequency layer, "flooded" means 5 or more years.
    r, c = build_travel.cells_of(y_t, count.shape, px, py)
    years_at = np.zeros(len(px), int)
    years_at[r >= 0] = count[r[r >= 0], c[r >= 0]]
    fac["years_flooded"] = years_at.tolist()
    often = years_at >= 5
    fac["flooded"]["frequency"] = np.flatnonzero(often).tolist()
    fac["counts"]["frequency"] = {k: int(sum(1 for i in np.flatnonzero(often) if pts["rows"][i][2] & bit)) for k, bit in pts["bits"].items()}
    if roads is not None:
        parts, km = flooded_stretches(roads, count >= 5, y_t, 250)
        write_json(OUT / "roads" / "frequency.geojson", to_lonlat_features([({"c": c}, g) for c, g in parts]))
        layers["frequency"]["roads_flooded_km"] = km
        total = {str(cl): round(float(roads.geometry[roads["c"] == cl].length.sum()) / 1000, 1) for cl in sorted(set(roads["c"]))}
        write_json(OUT / "roads.geojson", to_lonlat_features([({"c": int(cl), "n": n}, g) for cl, n, g in zip(roads["c"], roads["n"], roads.geometry)], simplify=SIMPLIFY_M))
    fac["generatedAt"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    write_json(OUT / "facilities.json", fac)

    manifest = {
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "crs": "EPSG:3857 images; bounds in latitude/longitude",
        "legend": {
            "event": [{"color": FLOOD, "en": "Flooded beyond normal monsoon water", "bn": "স্বাভাবিক বর্ষার বাইরে প্লাবিত"},
                      {"color": NORMAL, "en": "Normal monsoon water (flooded in 4+ of the other 6 radar years)", "bn": "স্বাভাবিক বর্ষার পানি (অন্য ৬টি রাডার বছরের ৪+টিতে প্লাবিত)"}],
            "year": [{"color": FLOOD, "en": "Flooded at some time in the year", "bn": "বছরের কোনো এক সময়ে প্লাবিত"}],
            "frequency": [{"color": c, "en": f"{lo}–{hi} years" if lo != hi else f"{lo} year", "bn": f"{lo}–{hi} বছর" if lo != hi else f"{lo} বছর"}
                          for c, (lo, hi) in zip(FREQ_COLOURS, FREQ_BINS)]},
        "notes": "Permanent water (JRC Global Surface Water, 10+ months a year) and areas outside Bangladesh are transparent. "
                 "Events at 200 m, years and frequency at 250 m; modal class when downsampling.",
        "roads": ({"source": "OpenStreetMap contributors (ODbL), Geofabrik Bangladesh extract", "classes": {str(k): v for k, v in ROAD_NAMES.items()},
                   "total_km": total, "sample_m": {"event": 100, "year": 250, "frequency": 250},
                   "frequency_rule": "for the frequency layer, a stretch counts when its pixels flooded in 5 or more of the 26 years"}
                  if roads is not None else None),
        "facilities": {"rule": "a facility counts as flooded when its own pixel is flooded (events: beyond normal monsoon water); for the frequency layer, in 5 or more of the 26 years"},
        "layers": layers}
    (OUT / "overlays.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--years", type=Path, required=True)
    ap.add_argument("--events", type=Path, required=True)
    ap.add_argument("--roads", type=Path, help="Geofabrik gis_osm_roads_free_1.shp (optional)")
    a = ap.parse_args()
    m = build(a.years, a.events, a.roads)
    total = sum(v["bytes"] for v in m["layers"].values())
    print(f"{len(m['layers'])} overlays, {total / 1e6:.1f} MB")

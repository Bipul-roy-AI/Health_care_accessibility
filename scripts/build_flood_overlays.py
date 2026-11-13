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


def build(years_path: Path, events_path: Path) -> dict:
    (OUT / "overlays").mkdir(parents=True, exist_ok=True)
    years, y_t = read(years_path)
    events, e_t = read(events_path)
    s1, s1_t = build_travel.sentinel_years([years_path])
    layers = {}

    perm = events.get("perm_water", 0)
    for name in sorted(n for n in events if n.startswith("f") and n[1:5].isdigit()):
        flooded = (events[name] == 1) & (perm != 1)
        normal = build_travel.seasonal_water(s1, s1_t, int(name[1:5]), e_t, flooded.shape)
        classes = np.where(flooded & ~normal, 1, np.where(flooded & normal, 2, 0))
        layers[name] = {**layer(classes, e_t, EVENT_RES, [FLOOD, NORMAL], name), "kind": "event"}

    perm = years.get("perm_water", 0)
    count = np.zeros(perm.shape, np.uint8)
    for name in sorted(n for n in years if n.startswith("y") and n[1:5].isdigit()):
        flooded = (years[name] == 1) & (perm != 1)
        count += flooded
        layers[name] = {**layer(flooded.astype(np.uint8), y_t, YEAR_RES, [FLOOD], name), "kind": "year"}
    classes = np.zeros(count.shape, np.uint8)
    for i, (lo, hi) in enumerate(FREQ_BINS, start=1):
        classes[(count >= lo) & (count <= hi)] = i
    layers["frequency"] = {**layer(classes, y_t, YEAR_RES, FREQ_COLOURS, "frequency"), "kind": "frequency",
                           "years_mapped": sum(1 for n in years if n.startswith("y") and n[1:5].isdigit())}

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
        "layers": layers}
    (OUT / "overlays.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--years", type=Path, required=True)
    ap.add_argument("--events", type=Path, required=True)
    a = ap.parse_args()
    m = build(a.years, a.events)
    total = sum(v["bytes"] for v in m["layers"].values())
    print(f"{len(m['layers'])} overlays, {total / 1e6:.1f} MB")

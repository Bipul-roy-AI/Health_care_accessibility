"""Travel time and flood-disrupted access (called from build_access.py when the
Earth Engine exports are supplied: scripts/gee/bangladesh_access_inputs.js).

Inputs
  friction: bd_friction_2019_1km.tif, bands motorized, walking (minutes per metre),
            EPSG:32646, 1 km (Malaria Atlas Project friction surface 2019, CC BY 4.0).
  floods:   bd_floods_years.tif (y2000..y2025: yearly maximum flood extent; 2000-2018 Global
            Flood Database MODIS, 2019-2025 Sentinel-1) and bd_floods_events.tif (one band per
            named event 2019-2025); values 1 flooded, 0 dry, 255 no data; perm_water; EPSG:32646.

Method
  Travel time: least-cost accumulation (skimage MCP_Geometric) from every usable
  DGHS facility of a class over the friction surface; the population grid of
  build_access (union census population spread over 1 km cells) is sampled at
  the travel-time raster. Motorized for hospitals, walking for primary care.

  Water: the friction surface has no value on wide rivers (Padma, Meghna, Jamuna reaches)
  and on the sea, which would leave Sandwip, Hatiya and other estuary islands with no
  route to the mainland. Cells with no value inside Bangladesh, and sea cells of the
  Meghna estuary within 10 km of land, take WATER_MIN_PER_M (about 10 km/h, no waiting
  time). Cells outside Bangladesh on land stay impassable.

  Flood scenario for each event: facilities whose own pixel is flooded are closed;
  land cells at least half flooded take WADE_MIN_PER_M (about 1.5 km/h: wading or
  a country boat) if that is slower than normal; travel time is recomputed.
  "Loses access" = within LIMIT minutes normally but not during the event. Yearly bands
  put a whole year's flooding on the map at once, so their losses are an upper bound.
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/access"
WADE_MIN_PER_M = 0.04          # minutes per metre, about 1.5 km/h
WATER_MIN_PER_M = 0.006        # minutes per metre, about 10 km/h: boat, trawler or ferry, no waiting time
COAST_BOX = (89.6, 21.0, 92.0, 23.3)   # lon/lat box of the estuary and offshore islands, clear of India and Myanmar
TRIPURA_CUT = (91.3, 22.85)            # inside the box, north-east of this corner is too close to Tripura (India)
COAST_REACH_CELLS = 10                 # sea cells used for crossings lie within 10 km of Bangladesh land
SEASONAL_YEARS = 4             # event pixels flooded in >= 4 of the other 6 Sentinel-1 years are normal monsoon water
SENTINEL_YEARS = range(2019, 2026)
FLOODED_SHARE = 0.5            # a 1 km cell counts as flooded at >= 50 % flooded area
MODES = {                      # class -> (friction band, limit in minutes)
    "any_hospital": ("motorized", 60),
    "public_hospital": ("motorized", 60),
    "uhc": ("motorized", 60),
    "blood_bank": ("motorized", 120),
    "primary_care": ("walking", 60),
}
THRESHOLDS = (30, 60, 120)
CURVE = np.arange(5, 241, 5)
EVENT_NOTES = {
    "f2019_07": ("Jul–Aug 2019", "Northern monsoon flood, 28 districts", "https://reliefweb.int/disaster/fl-2019-000079-bgd"),
    "f2020_07": ("Jun–Aug 2020", "Monsoon flood, north, north-east and south-east", "https://reliefweb.int/disaster/FL-2020-000161-BGD"),
    "f2022_05": ("May 2022", "Sylhet first flash flood", "https://www.downtoearth.org.in/news/four-million-people-affected-by-double-floods-within-a-month-in-bangladesh-s-sylhet-division-83351"),
    "f2022_06": ("Jun 2022", "Sylhet division flash flood, 9 districts", "https://bangladesh.un.org/bn/node/187390"),
    "f2024_06": ("Jun 2024", "Sylhet and haor flood", "https://floodobservatory.colorado.edu/Events/2024Events/2024Bangladesh.html"),
    "f2024_08": ("Aug 2024", "Eastern flash flood, 11 districts", "https://reliefweb.int/report/bangladesh/bangladesh-eastern-flash-flood-situation-report-no-01-25-august-2024"),
    "f2024_10": ("Oct 2024", "Sherpur, Mymensingh, Netrokona flash flood", "https://reliefweb.int/report/bangladesh/bangladesh-situation-overview-northcentral-flood-2024-potential-inundation-exposed-and-affected-population-version-1st-update-07-october-2024"),
    "f2025_06": ("May–Jun 2025", "Sylhet division, Netrokona, Noakhali, Bhola, CHT", "https://reliefweb.int/disaster/fl-2025-000076-bgd"),
}


def read_raster(path):
    import rasterio
    with rasterio.open(path) as src:
        if src.crs is None or src.crs.to_epsg() != 32646:
            raise SystemExit(f"{path}: expected EPSG:32646, got {src.crs}")
        return {"bands": {name or f"b{i + 1}": src.read(i + 1) for i, name in enumerate(src.descriptions)},
                "transform": src.transform, "shape": (src.height, src.width), "nodata": src.nodata}


def cells_of(transform, shape, x, y):
    """Row/col of UTM points; -1 where outside the raster."""
    inv = ~transform
    x, y = np.asarray(x, float), np.asarray(y, float)
    col = inv.a * x + inv.b * y + inv.c
    row = inv.d * x + inv.e * y + inv.f
    row, col = np.floor(row).astype(int), np.floor(col).astype(int)
    outside = (row < 0) | (col < 0) | (row >= shape[0]) | (col >= shape[1])
    row[outside], col[outside] = -1, -1
    return row, col


def snap_cells(valid, row, col, max_cells=2):
    """Move points on no-data cells (outside the boundary mask, coast edges) to the nearest valid cell
    within max_cells; points farther away get -1."""
    from scipy.ndimage import distance_transform_edt
    row, col = np.array(row, int), np.array(col, int)
    dist, (near_r, near_c) = distance_transform_edt(~valid, return_indices=True)
    ok = row >= 0
    bad = ok.copy()
    bad[ok] = ~valid[row[ok], col[ok]]
    idx = np.where(bad)[0]
    close = dist[row[idx], col[idx]] <= max_cells
    keep, drop = idx[close], idx[~close]
    row[keep], col[keep] = near_r[row[keep], col[keep]], near_c[row[keep], col[keep]]
    row[drop], col[drop] = -1, -1
    return row, col


def fill_water(band, transform, inside):
    """Give boat friction to no-data water cells: inside Bangladesh (rivers, lakes) and
    estuary sea cells within COAST_REACH_CELLS of land in the coastal box."""
    from rasterio.warp import transform as warp
    from scipy.ndimage import binary_dilation
    band = band.copy()
    nodata = ~(np.isfinite(band) & (band > 0))
    rows, cols = np.indices(band.shape)
    x, y = transform * (cols.ravel() + 0.5, rows.ravel() + 0.5)
    lon, lat = (np.asarray(v).reshape(band.shape) for v in warp("EPSG:32646", "EPSG:4326", x, y))
    lo0, la0, lo1, la1 = COAST_BOX
    box = (lon >= lo0) & (lon <= lo1) & (lat >= la0) & (lat <= la1) & ~((lon > TRIPURA_CUT[0]) & (lat > TRIPURA_CUT[1]))
    near_land = binary_dilation(~nodata, iterations=COAST_REACH_CELLS)
    water = nodata & (inside | (box & near_land))
    band[water] = WATER_MIN_PER_M
    return band, water


def travel_minutes(friction, starts, cell):
    """Minutes from every cell to the nearest start over a minutes-per-metre surface."""
    from skimage.graph import MCP_Geometric
    cost = np.where(np.isfinite(friction) & (friction > 0), friction, np.inf)
    starts = [(int(r), int(c)) for r, c in starts if r >= 0 and np.isfinite(cost[r, c])]
    if not starts:
        return np.full(cost.shape, np.inf)
    mcp = MCP_Geometric(cost, sampling=(cell, cell), fully_connected=True)
    minutes, _ = mcp.find_costs(starts)
    return minutes


def area_flood_fraction(flood_band, flood_transform, target_transform, target_shape):
    """Share of each 1 km friction cell that is flooded / observed (average resampling)."""
    from rasterio.warp import Resampling, reproject
    out = {}
    for key, values in (("flooded", (flood_band == 1).astype(np.float32)), ("observed", (flood_band != 255).astype(np.float32))):
        dest = np.zeros(target_shape, np.float32)
        reproject(values, dest, src_transform=flood_transform, src_crs="EPSG:32646",
                  dst_transform=target_transform, dst_crs="EPSG:32646", resampling=Resampling.average)
        out[key] = dest
    return out


def sentinel_years(flood_files):
    """Sentinel-1 yearly bands (y2019..y2025) from whichever flood file holds them, with their grid."""
    import rasterio
    for path in flood_files:
        with rasterio.open(path) as src:
            names = list(src.descriptions)
            if all(f"y{y}" in names for y in SENTINEL_YEARS):
                return {y: src.read(names.index(f"y{y}") + 1) == 1 for y in SENTINEL_YEARS}, src.transform
    return None, None


def seasonal_water(years, year_transform, year, target_transform, target_shape):
    """Pixels on the target grid flooded in >= SEASONAL_YEARS of the Sentinel-1 years other than `year`
    (leave-one-out), i.e. water that comes back most monsoons rather than this flood."""
    from rasterio.warp import Resampling, reproject
    count = sum(v.astype(np.uint8) for y, v in years.items() if y != year)
    dest = np.zeros(target_shape, np.uint8)
    reproject(count, dest, src_transform=year_transform, src_crs="EPSG:32646", dst_transform=target_transform,
              dst_crs="EPSG:32646", resampling=Resampling.nearest)
    return dest >= SEASONAL_YEARS


def build(ctx) -> dict:
    fr = read_raster(ctx["friction"])
    transform, shape = fr["transform"], fr["shape"]
    cell = abs(transform.a)
    bands = {k: v.astype(np.float64) for k, v in fr["bands"].items()}
    if fr["nodata"] is not None:
        for v in bands.values():
            v[v == fr["nodata"]] = np.nan
    if set(bands) < {"motorized", "walking"}:
        raise SystemExit(f"friction raster bands {list(bands)}; expected motorized, walking")

    area_of, levels = ctx["area_of"], ctx["levels"]
    xy, weight = ctx["xy"], ctx["weight"]
    in_bd = np.zeros(shape, bool)                      # cells holding population grid points
    r0, c0 = cells_of(transform, shape, xy[:, 0], xy[:, 1])
    in_bd[r0[r0 >= 0], c0[r0 >= 0]] = True
    water_cells = 0
    for name in ("motorized", "walking"):
        bands[name], water = fill_water(bands[name], transform, in_bd)
        water_cells = int(water.sum())
    valid = np.isfinite(bands["motorized"]) & (bands["motorized"] > 0)
    prow, pcol = snap_cells(valid, *cells_of(transform, shape, xy[:, 0], xy[:, 1]))
    inside = prow >= 0
    facility = {k: np.array(v) for k, v in ctx["class_points"].items() if k in MODES}
    fac_cells = {k: snap_cells(valid, *cells_of(transform, shape, v[:, 0], v[:, 1])) for k, v in facility.items()}

    def sample(minutes):
        out = np.full(len(weight), np.nan)
        out[inside] = minutes[prow[inside], pcol[inside]]
        out[~np.isfinite(out)] = np.nan
        return out

    baseline = {k: sample(travel_minutes(bands[MODES[k][0]], zip(*fac_cells[k]), cell)) for k in MODES}
    total = float(weight.sum())

    def shares(t, w, idx=None, n=None):
        ok = np.isfinite(t)
        if idx is None:
            return {str(h): round(100 * float(w[ok & (t <= h)].sum()) / float(w.sum()), 1) for h in THRESHOLDS}
        pop = np.bincount(idx, weights=w, minlength=n)
        res = {}
        for h in THRESHOLDS:
            within = np.bincount(idx, weights=w * (ok & (t <= h)), minlength=n)
            res[str(h)] = np.where(pop > 0, 100 * within / np.maximum(pop, 1e-9), np.nan)
        return res

    def weighted_median(t, w):
        ok = np.isfinite(t)
        order = np.argsort(t[ok])
        cum = np.cumsum(w[ok][order]) / w[ok].sum()
        return float(t[ok][order][np.searchsorted(cum, 0.5)])

    national = {k: {"mode": MODES[k][0], "limit_min": MODES[k][1], "within": shares(t, weight),
                    "median_min": round(weighted_median(t, weight), 1),
                    "curve": [[int(m), round(100 * float(weight[np.isfinite(t) & (t <= m)].sum()) / total, 2)] for m in CURVE],
                    "unreachable_people": round(float(weight[~np.isfinite(t)].sum()))}
                for k, t in baseline.items()}

    per_area = {}
    for level, areas in levels.items():
        idx, n = area_of[level], len(areas)
        pop = np.bincount(idx, weights=weight, minlength=n)
        rows = {}
        for k, t in baseline.items():
            s = shares(t, weight, idx, n)
            tt = np.where(np.isfinite(t), t, 0)
            mean = np.bincount(idx, weights=weight * tt, minlength=n) / np.maximum(pop, 1e-9)
            rows[k] = {"within": {h: [None if not np.isfinite(v) else round(float(v), 1) for v in s[h]] for h in s},
                       "mean_min": [round(float(v), 1) for v in mean]}
        per_area[level] = {"pcodes": [a["pcode"] for a in areas], "travel": rows}

    # ---------- Floods ----------
    floods = {"events": [], "years": [], "per_area": {}}
    flood_files = [Path(p) for p in (ctx.get("floods") or [])]
    if flood_files:
        import rasterio
        per_level = {lv: defaultdict(dict) for lv in levels}
        years_flooded = np.zeros(len(weight))
        years_seen = np.zeros(len(weight))
        s1_years, s1_transform = sentinel_years(flood_files)
        for path in flood_files:
            with rasterio.open(path) as src:
                if src.crs is None or src.crs.to_epsg() != 32646:
                    raise SystemExit(f"{path}: expected EPSG:32646, got {src.crs}")
                fl_transform, fl_shape = src.transform, (src.height, src.width)
                arrays = {name: src.read(i + 1) for i, name in enumerate(src.descriptions)}
            perm = arrays.get("perm_water", np.zeros(fl_shape, np.uint8))
            fac_flood_cells = {k: cells_of(fl_transform, fl_shape, v[:, 0], v[:, 1]) for k, v in facility.items()}
            for band_id in sorted(n for n in arrays if n and n[0] in "fy" and n[1:5].isdigit()):
                is_year = band_id.startswith("y")
                band = np.where(perm == 1, 0, arrays[band_id])
                surface_km2 = None
                if not is_year and s1_years is not None:
                    # Events: keep only water beyond the normal monsoon extent.
                    surface = area_flood_fraction(band, fl_transform, transform, shape)
                    surface_km2 = round(float(((surface["flooded"] >= FLOODED_SHARE) & in_bd).sum()) * cell * cell / 1e6)
                    band = np.where(seasonal_water(s1_years, s1_transform, int(band_id[1:5]), fl_transform, fl_shape), 0, band)
                frac = area_flood_fraction(band, fl_transform, transform, shape)
                flooded_cell = (frac["flooded"] >= FLOODED_SHARE) & in_bd   # land inside Bangladesh only
                observed_share = float(frac["observed"][in_bd].mean())
                people_flooded = sample(flooded_cell.astype(float)) == 1
                if is_year:
                    years_flooded += people_flooded
                    years_seen += sample((frac["observed"] >= 0.5).astype(float)) == 1
                closed, after = {}, {}
                for k in MODES:
                    r, c = fac_flood_cells[k]
                    ok = r >= 0
                    is_closed = np.zeros(len(r), bool)
                    is_closed[ok] = band[r[ok], c[ok]] == 1
                    closed[k] = int(is_closed.sum())
                    fric = bands[MODES[k][0]].copy()
                    fric[flooded_cell] = np.fmax(fric[flooded_cell], WADE_MIN_PER_M)
                    fr_r, fr_c = fac_cells[k]
                    after[k] = sample(travel_minutes(fric, zip(fr_r[~is_closed], fr_c[~is_closed]), cell))
                lost = {k: (baseline[k] <= MODES[k][1]) & ~(after[k] <= MODES[k][1]) for k in MODES}
                year = int(band_id[1:5])
                when, note, source = EVENT_NOTES.get(band_id, ("", "", ""))
                if is_year:
                    when = str(year)
                    note = "Yearly maximum flood extent, " + ("Global Flood Database (MODIS, mapped events)" if year <= 2018 else "Sentinel-1 radar, April-October")
                    source = ("https://developers.google.com/earth-engine/datasets/catalog/GLOBAL_FLOOD_DB_MODIS_EVENTS_V1" if year <= 2018
                              else "https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S1_GRD")
                record = {"id": band_id, "year": year, "when": when, "note": note, "source": source,
                          "sensor": "MODIS" if is_year and year <= 2018 else "Sentinel-1",
                          "coverage_pct": round(100 * observed_share, 1),
                          "flooded_km2": round(float(flooded_cell.sum()) * cell * cell / 1e6),
                          **({"surface_water_km2": surface_km2} if surface_km2 is not None else {}),
                          "people_in_flooded_cells": round(float(weight[people_flooded].sum())),
                          "facilities_flooded": closed,
                          "people_losing_access": {k: round(float(weight[lost[k]].sum())) for k in MODES},
                          "median_min_after": {k: round(weighted_median(after[k], weight), 1) for k in MODES}}
                floods["years" if is_year else "events"].append(record)
                for level, areas in levels.items():
                    idx, n = area_of[level], len(areas)
                    pop = np.maximum(np.bincount(idx, weights=weight, minlength=n), 1e-9)
                    entry = {"flooded_pct": [round(float(v), 1) for v in 100 * np.bincount(idx, weights=weight * people_flooded, minlength=n) / pop]}
                    if not (is_year and level == "union"):
                        entry["lost_hospital"] = [round(float(v)) for v in np.bincount(idx, weights=weight * lost["any_hospital"], minlength=n)]
                        entry["lost_primary"] = [round(float(v)) for v in np.bincount(idx, weights=weight * lost["primary_care"], minlength=n)]
                    per_level[level][band_id] = entry
        # Repeated flooding 2000-2025: how many yearly maps flooded each person's 1 km cell.
        if years_seen.any():
            for level, areas in levels.items():
                idx, n = area_of[level], len(areas)
                pop = np.maximum(np.bincount(idx, weights=weight, minlength=n), 1e-9)
                per_level[level]["years_flooded_mean"] = [round(float(v), 2) for v in np.bincount(idx, weights=weight * years_flooded, minlength=n) / pop]
                for k in (1, 5, 10):
                    per_level[level][f"flooded_ge{k}_pct"] = [round(float(v), 1) for v in 100 * np.bincount(idx, weights=weight * (years_flooded >= k), minlength=n) / pop]
            total_w = float(weight.sum())
            floods["frequency"] = {"years_mapped": len(floods["years"]),
                                   "people_flooded_ge": {str(k): round(100 * float(weight[years_flooded >= k].sum()) / total_w, 1) for k in (1, 5, 10)},
                                   "histogram": [round(100 * float(weight[years_flooded == k].sum()) / total_w, 2) for k in range(int(years_flooded.max()) + 1)]}
        floods["per_area"] = {lv: {"pcodes": [a["pcode"] for a in levels[lv]], **per_level[lv]} for lv in levels}
        floods["assumptions"] = {"flooded_cell_share": FLOODED_SHARE, "wade_min_per_m": WADE_MIN_PER_M,
                                 "closed_if": "facility's own flood pixel is flooded",
                                 "loses_access": "within the limit normally, beyond it during the flood",
                                 "year_losses": "a year's map combines all of that year's floods, so access losses are an upper bound",
                                 "events": "event maps compare the lowest radar backscatter in each event window with the January-March dry season; water that also appears in at least 4 of the other 6 Sentinel-1 years (normal monsoon water: haors, beels, floodplain) is removed, so events show water beyond the usual monsoon extent. surface_water_km2 is the area before that step",
                                 "years": "yearly maps keep all flood water, including normal monsoon inundation, so the haor basin counts as flooded almost every year",
                                 "wading": "everyone in a flooded cell is assumed to move at about 1.5 km/h; boats, raised roads and bridges are not modelled, so access losses are a stress test, not a count of people cut off",
                                 "eras": "2000-2018 MODIS (Global Flood Database, mapped events only) and 2019-2025 Sentinel-1 radar differ in resolution and detection; compare within an era"}

    OUT.mkdir(exist_ok=True)
    payload = {"generatedAt": ctx["generated"], "friction_source": "Malaria Atlas Project friction surface 2019 (Weiss et al., 2020), CC BY 4.0",
               "modes": {k: {"band": v[0], "limit_min": v[1]} for k, v in MODES.items()}, "national": national,
               "water": {"min_per_m": WATER_MIN_PER_M, "kmh": round(0.06 / WATER_MIN_PER_M, 1), "cells_filled": water_cells},
               "per_area": {lv: per_area[lv] for lv in ("division", "district", "upazila")}}
    (OUT / "travel.json").write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    (OUT / "travel-union.json").write_text(json.dumps({"generatedAt": ctx["generated"], **per_area["union"]}, separators=(",", ":")) + "\n", encoding="utf-8")
    if floods["events"] or floods["years"]:
        small = {"generatedAt": ctx["generated"], "events": floods["events"], "years": floods["years"],
                 "frequency": floods.get("frequency"), "assumptions": floods["assumptions"],
                 "per_area": {lv: floods["per_area"][lv] for lv in ("division", "district", "upazila")}}
        (OUT / "floods.json").write_text(json.dumps(small, separators=(",", ":")) + "\n", encoding="utf-8")
        (OUT / "floods-union.json").write_text(json.dumps({"generatedAt": ctx["generated"], **floods["per_area"]["union"]}, separators=(",", ":")) + "\n", encoding="utf-8")
    return {"national": national, "events": floods["events"], "years": floods["years"]}

"""Travel time and flood-disrupted access (called from build_access.py when the
Earth Engine exports are supplied: scripts/gee/bangladesh_access_inputs.js).

Inputs
  friction: bd_friction_2019_1km.tif, bands motorized, walking (minutes per metre),
            EPSG:32646, 1 km (Malaria Atlas Project friction surface 2019, CC BY 4.0).
  floods:   bd_floods.tif, one band per event (1 flooded, 0 dry, 255 no radar),
            gfd_events_2000_2018, perm_water; EPSG:32646, 100-200 m.

Method
  Travel time: least-cost accumulation (skimage MCP_Geometric) from every usable
  DGHS facility of a class over the friction surface; the population grid of
  build_access (union census population spread over 1 km cells) is sampled at
  the travel-time raster. Motorized for hospitals, walking for primary care.

  Flood scenario for each event: facilities whose own pixel is flooded are closed;
  land cells at least half flooded take WADE_MIN_PER_M (about 1.5 km/h: wading or
  a country boat) if that is slower than normal; travel time is recomputed.
  "Loses access" = within LIMIT minutes normally but not during the event.
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/access"
WADE_MIN_PER_M = 0.04          # minutes per metre, about 1.5 km/h
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
    "f2026_07": ("Jul 2026", "Chattogram division and CHT, then north-east", "https://bangladesh.un.org/sites/default/files/2026-07/SitRep_ICCG_Flash%20Flood%20%26%20Landslides_13July26.pdf"),
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

    xy, weight, area_of, levels = ctx["xy"], ctx["weight"], ctx["area_of"], ctx["levels"]
    prow, pcol = cells_of(transform, shape, xy[:, 0], xy[:, 1])
    inside = prow >= 0
    facility = {k: np.array(v) for k, v in ctx["class_points"].items() if k in MODES}
    fac_cells = {k: cells_of(transform, shape, v[:, 0], v[:, 1]) for k, v in facility.items()}

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
    floods = {"events": [], "per_area": {}}
    if ctx.get("floods"):
        import rasterio
        with rasterio.open(ctx["floods"]) as src:
            fl_transform, fl_shape = src.transform, (src.height, src.width)
            names = list(src.descriptions)
            arrays = {name: src.read(i + 1) for i, name in enumerate(names)}
        perm = arrays.get("perm_water", np.zeros(fl_shape, np.uint8))
        event_ids = [n for n in names if n.startswith("f")]
        fac_flood_cells = {k: cells_of(fl_transform, fl_shape, v[:, 0], v[:, 1]) for k, v in facility.items()}
        per_level = {lv: defaultdict(dict) for lv in levels}
        times_flooded_cells = np.zeros(len(weight))
        for eid in event_ids:
            band = np.where(perm == 1, 0, arrays[eid])
            frac = area_flood_fraction(band, fl_transform, transform, shape)
            flooded_cell = frac["flooded"] >= FLOODED_SHARE
            observed_share = float(frac["observed"][np.isfinite(bands["motorized"])].mean())
            people_flooded = sample(flooded_cell.astype(float)) == 1
            times_flooded_cells += people_flooded
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
                open_starts = zip(fr_r[~is_closed], fr_c[~is_closed])
                after[k] = sample(travel_minutes(fric, open_starts, cell))
            lost = {k: (baseline[k] <= MODES[k][1]) & ~(after[k] <= MODES[k][1]) for k in MODES}
            ev = {"id": eid, "when": EVENT_NOTES.get(eid, ("", "", ""))[0], "note": EVENT_NOTES.get(eid, ("", "", ""))[1],
                  "source": EVENT_NOTES.get(eid, ("", "", ""))[2], "radar_coverage_pct": round(100 * observed_share, 1),
                  "flooded_km2": round(float(flooded_cell.sum()) * cell * cell / 1e6),
                  "people_in_flooded_cells": round(float(weight[people_flooded].sum())),
                  "facilities_flooded": closed,
                  "people_losing_access": {k: round(float(weight[lost[k]].sum())) for k in MODES},
                  "median_min_after": {k: round(weighted_median(after[k], weight), 1) for k in MODES}}
            floods["events"].append(ev)
            for level, areas in levels.items():
                idx, n = area_of[level], len(areas)
                pop = np.bincount(idx, weights=weight, minlength=n)
                flooded_people = np.bincount(idx, weights=weight * people_flooded, minlength=n)
                lost_h = np.bincount(idx, weights=weight * lost["any_hospital"], minlength=n)
                lost_p = np.bincount(idx, weights=weight * lost["primary_care"], minlength=n)
                per_level[level][eid] = {
                    "flooded_pct": [round(float(v), 1) for v in 100 * flooded_people / np.maximum(pop, 1e-9)],
                    "lost_hospital": [round(float(v)) for v in lost_h],
                    "lost_primary": [round(float(v)) for v in lost_p]}
        # Exposure to repeated flooding: share of people whose cell flooded in >= 2 of the mapped events,
        # and the 2000-2018 Global Flood Database count.
        gfd = arrays.get("gfd_events_2000_2018")
        for level, areas in levels.items():
            idx, n = area_of[level], len(areas)
            pop = np.bincount(idx, weights=weight, minlength=n)
            repeat = np.bincount(idx, weights=weight * (times_flooded_cells >= 2), minlength=n)
            per_level[level]["repeat_pct"] = [round(float(v), 1) for v in 100 * repeat / np.maximum(pop, 1e-9)]
        if gfd is not None:
            from rasterio.warp import Resampling, reproject
            dest = np.zeros(shape, np.float32)
            reproject(np.where(perm == 1, 0, gfd).astype(np.float32), dest, src_transform=fl_transform, src_crs="EPSG:32646",
                      dst_transform=transform, dst_crs="EPSG:32646", resampling=Resampling.max)
            g = sample(dest)
            for level, areas in levels.items():
                idx, n = area_of[level], len(areas)
                pop = np.bincount(idx, weights=weight, minlength=n)
                ever = np.bincount(idx, weights=weight * (np.nan_to_num(g) >= 1), minlength=n)
                per_level[level]["gfd_ever_pct"] = [round(float(v), 1) for v in 100 * ever / np.maximum(pop, 1e-9)]
        floods["per_area"] = {lv: {"pcodes": [a["pcode"] for a in levels[lv]], **per_level[lv]} for lv in levels}
        floods["assumptions"] = {"flooded_cell_share": FLOODED_SHARE, "wade_min_per_m": WADE_MIN_PER_M,
                                 "closed_if": "facility's own flood pixel is flooded",
                                 "loses_access": "within the limit normally, beyond it during the event"}

    OUT.mkdir(exist_ok=True)
    payload = {"generatedAt": ctx["generated"], "friction_source": "Malaria Atlas Project friction surface 2019 (Weiss et al., 2020), CC BY 4.0",
               "modes": {k: {"band": v[0], "limit_min": v[1]} for k, v in MODES.items()}, "national": national,
               "per_area": {lv: per_area[lv] for lv in ("division", "district", "upazila")}}
    (OUT / "travel.json").write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    (OUT / "travel-union.json").write_text(json.dumps({"generatedAt": ctx["generated"], **per_area["union"]}, separators=(",", ":")) + "\n", encoding="utf-8")
    if floods["events"]:
        small = {"generatedAt": ctx["generated"], "events": floods["events"], "assumptions": floods["assumptions"],
                 "per_area": {lv: floods["per_area"][lv] for lv in ("division", "district", "upazila")}}
        (OUT / "floods.json").write_text(json.dumps(small, separators=(",", ":")) + "\n", encoding="utf-8")
        (OUT / "floods-union.json").write_text(json.dumps({"generatedAt": ctx["generated"], **floods["per_area"]["union"]}, separators=(",", ":")) + "\n", encoding="utf-8")
    return {"national": national, "events": floods["events"]}

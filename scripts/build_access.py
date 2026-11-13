"""Population-based access measures for the Access study page.

Called from build_atlas.py (with --census) after the 1 km distance grid is
built. Inputs: BBS Census 2022 (data/population/bbs-census-2022.json),
division post-enumeration-check (PEC) totals (data/statistics/sources.json),
the DGHS registry and the geoBoundaries areas.

Population on the grid: each union's population is spread evenly over the
1 km cells whose centre lies in that union (unions too small to hold a cell
get one point at their representative point). Areas are populated places
only at union resolution; within a union, people are assumed evenly spread.

Outputs in data/access/: areas-{division,district,upazila,union}.json,
summary.json, census-upazila-crosswalk.csv.
"""
from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from population import UpazilaMatcher, allocate_unions, district_key

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/access"
THRESHOLDS = (2, 5, 10, 20)
ACCESS_CLASSES = ("public_hospital", "any_hospital", "primary_care", "uhc", "blood_bank")
COUNT_TAGS = ("public_hospital", "private_ngo_hospital", "any_hospital", "primary_care",
              "community_clinic", "union_facility", "uhc", "blood_bank")
TYPE_TAGS = {
    "Community Clinic": "community_clinic",
    "Union Health Sub Center": "union_facility", "Union Health Center": "union_facility",
    "Union Health & Family Welfare Center (UH&FWC)": "union_facility",
    "Upazila Health Complex": "uhc", "Blood Bank": "blood_bank",
}
MASK_BITS = {"public_hospital": 1, "any_hospital": 2, "primary_care": 4, "uhc": 8, "blood_bank": 16,
             "community_clinic": 32, "union_facility": 64}
RATE_TAGS = ("public_hospital", "any_hospital", "primary_care", "community_clinic", "blood_bank")
SOCIO = ("literacy7", "female_literacy7", "basic_sanitation", "internet5", "mobile15_female")
MORAN_MEASURES = {
    "within5_public_hospital": "Share of people within 5 km of a public hospital",
    "within5_any_hospital": "Share of people within 5 km of any hospital",
    "rate_any_hospital": "Hospitals per 100,000 people",
    "rate_primary_care": "Primary-care facilities per 100,000 people",
}
PERMUTATIONS = 999
SEED = 20221


def tags(f):
    out = [f["klass"]] if f["klass"] in ("public_hospital", "private_ngo_hospital", "primary_care") else []
    if f["klass"] in ("public_hospital", "private_ngo_hospital"):
        out.append("any_hospital")
    if f["type"] in TYPE_TAGS:
        out.append(TYPE_TAGS[f["type"]])
    return out


def people_curve(distance, weight, step=0.5, limit=40.0):
    """Share of people within each distance (0.5 km steps to 40 km) and population-weighted median / P90."""
    order = np.argsort(distance)
    d, cum = distance[order], np.cumsum(weight[order]) / weight.sum()
    marks = np.arange(step, limit + step / 2, step)
    shares = np.interp(marks, d, cum, left=0.0, right=1.0)
    quantile = lambda q: float(d[np.searchsorted(cum, q)])  # noqa: E731
    return {"curve": [[round(float(m), 1), round(100 * float(v), 2)] for m, v in zip(marks, shares)],
            "median_km": round(quantile(0.5), 2), "p90_km": round(quantile(0.9), 2)}


def weighted_gini(values, weights):
    values, weights = np.asarray(values, float), np.asarray(weights, float)
    keep = np.isfinite(values) & (weights > 0)
    values, weights = values[keep], weights[keep]
    order = np.argsort(values)
    v, w = values[order], weights[order]
    cum_w = np.concatenate([[0], np.cumsum(w) / w.sum()])
    cum_vw = np.concatenate([[0], np.cumsum(v * w) / (v * w).sum()])
    gini = 1 - float(np.sum((cum_w[1:] - cum_w[:-1]) * (cum_vw[1:] + cum_vw[:-1])))
    # Population-quintile ratio: mean rate of the best-served 20% of people / worst-served 20%.
    def band(lo, hi):
        mid = (cum_w[1:] + cum_w[:-1]) / 2
        sel = (mid >= lo) & (mid < hi)
        return float((v[sel] * w[sel]).sum() / w[sel].sum()) if sel.any() else float("nan")
    q1, q5 = band(0, 0.2), band(0.8, 1.0001)
    step = max(1, len(v) // 100)
    lorenz = [[round(float(cum_w[i]) * 100, 2), round(float(cum_vw[i]) * 100, 2)]
              for i in list(range(0, len(cum_w), step)) + [len(cum_w) - 1]]
    return {"gini": round(gini, 3), "q1": round(q1, 2), "q5": round(q5, 2),
            "q5_q1": round(q5 / q1, 2) if q1 > 0 else None, "lorenz": lorenz}


def neighbours(geoms):
    """Queen-style contiguity (touching or within ~50 m); isolated areas get their nearest area."""
    from shapely.strtree import STRtree
    grown = [g.buffer(0.0005) for g in geoms]
    tree = STRtree(geoms)
    result = []
    for i, g in enumerate(grown):
        hits = [int(j) for j in tree.query(g, predicate="intersects") if int(j) != i]
        if not hits:
            hits = [min((j for j in range(len(geoms)) if j != i), key=lambda j: geoms[j].distance(geoms[i]))]
        result.append(sorted(set(hits)))
    return result


def moran(values, nbrs, rng):
    x = np.asarray(values, float)
    z = x - x.mean()
    m2 = (z ** 2).mean()
    lag = np.array([z[n].mean() for n in nbrs])
    observed = float((z * lag).sum() / (z ** 2).sum())
    sims = np.empty(PERMUTATIONS)
    for k in range(PERMUTATIONS):
        p = rng.permutation(z)
        sims[k] = (p * np.array([p[n].mean() for n in nbrs])).sum() / (p ** 2).sum()
    p_global = (1 + np.sum(np.abs(sims - sims.mean()) >= abs(observed - sims.mean()))) / (PERMUTATIONS + 1)
    local = z * lag / m2
    # Conditional permutation: hold i fixed, draw its neighbours from the other areas.
    n = len(z)
    p_local = np.empty(n)
    for i in range(n):
        k = len(nbrs[i])
        others = np.delete(z, i)
        draws = np.array([others[rng.choice(n - 1, k, replace=False)].mean() for _ in range(PERMUTATIONS)])
        sim = z[i] * draws / m2
        extreme = np.sum(sim >= local[i]) if local[i] >= np.median(sim) else np.sum(sim <= local[i])
        p_local[i] = (extreme + 1) / (PERMUTATIONS + 1)
    labels = []
    for i in range(n):
        if p_local[i] >= 0.05:
            labels.append("ns")
        else:
            labels.append(("H" if z[i] > 0 else "L") + ("H" if lag[i] > 0 else "L"))
    return {"I": round(observed, 3), "p": round(float(p_global), 3),
            "expected": round(-1 / (n - 1), 4), "counts": dict(Counter(labels))}, labels


def build(ctx) -> dict:
    from scipy.spatial import cKDTree
    from scipy.stats import spearmanr
    from shapely.geometry import Point
    from shapely.strtree import STRtree

    census = json.loads(Path(ctx["census"]).read_text(encoding="utf-8"))
    sources = json.loads((ROOT / "data/statistics/sources.json").read_text(encoding="utf-8"))
    divisions, districts, upazilas, unions = (ctx[k] for k in ("divisions", "districts", "upazilas", "unions"))
    facilities, to_utm = ctx["facilities"], ctx["to_utm"]

    # --- Districts by BBS geocode (pcode BDxxNN -> NN).
    cen_district = {d["id"]: d for d in census["districts"]}
    district_pop = {}
    for d in districts:
        row = cen_district[int(d["pcode"][-2:])]
        if district_key(row["name"]) != district_key(d["name"]):
            raise SystemExit(f"District code mismatch: {d['name']} vs census {row['name']}")
        district_pop[d["pcode"]] = row

    # --- Upazilas/thanas to 2015 upazilas.
    matcher = UpazilaMatcher([{"pcode": u["pcode"], "name": u["name"], "district": u["parent"]["name"]} for u in upazilas])
    up_by_pcode = {u["pcode"]: u for u in upazilas}
    cen_to_adm3, crosswalk_rows, census_kinds = {}, [], Counter()
    for row in census["upazilas"]:
        dname = cen_district[row["districtId"]]["name"]
        pcode, kind = matcher.match(dname, row["name"])
        if not pcode:
            raise SystemExit(f"Census upazila unmatched: {dname} / {row['name']}")
        if up_by_pcode[pcode]["parent"]["pcode"] != next(d["pcode"] for d in districts if int(d["pcode"][-2:]) == row["districtId"]):
            raise SystemExit(f"Census upazila matched across districts: {row['name']}")
        cen_to_adm3[row["id"]] = pcode
        census_kinds[kind] += 1
        crosswalk_rows.append([dname, row["name"], row["pop"], pcode, up_by_pcode[pcode]["name"], kind])
    up_census = defaultdict(list)
    for row in census["upazilas"]:
        up_census[cen_to_adm3[row["id"]]].append(row)
    if len(up_census) != len(upazilas):
        missing = [u["name"] for u in upazilas if u["pcode"] not in up_census]
        raise SystemExit(f"Upazilas without census population: {missing}")

    # --- PEC adjustment: one factor per division (BBS publishes adjusted totals by division only).
    adjusted = {district_key(k): v for k, v in sources["population"]["divisions"].items()}
    division_factor = {}
    for dv in divisions:
        enumerated = sum(district_pop[d["pcode"]]["pop"] for d in districts if d["parent"] is dv)
        division_factor[dv["pcode"]] = adjusted[district_key(dv["name"])] / enumerated
    factor_of_district = {d["pcode"]: division_factor[d["parent"]["pcode"]] for d in districts}

    # --- Unions.
    union_census = defaultdict(list)
    for row in census["unions"]:
        union_census[cen_to_adm3[row["upazilaId"]]].append(row)
    union_rows = defaultdict(list)
    for i, u in enumerate(unions):
        union_rows[u["parent"]["pcode"]].append({"pcode": u["pcode"], "name": u["name"], "area_km2": u["area_km2"], "i": i})
    union_pop = np.zeros(len(unions))
    union_u5 = np.zeros(len(unions))
    union_age60 = np.zeros(len(unions))
    union_source = [""] * len(unions)
    index_of = {u["pcode"]: i for i, u in enumerate(unions)}
    for up in upazilas:
        total = sum(r["pop"] for r in up_census[up["pcode"]])
        alloc = allocate_unions(up["pcode"], union_rows[up["pcode"]], union_census[up["pcode"]], total)
        for pcode, (pop, u5, a60, source) in alloc.items():
            i = index_of[pcode]
            union_pop[i], union_u5[i], union_age60[i], union_source[i] = pop, u5, a60, source
    union_factor = np.array([factor_of_district[u["parent"]["parent"]["pcode"]] for u in unions])
    union_adj = union_pop * union_factor
    census_total = sum(d["pop"] for d in census["districts"])
    if abs(union_pop.sum() - census_total) > 1:
        raise SystemExit(f"Union population {union_pop.sum():.0f} != census {census_total}")

    # --- Population on the grid (+ one point for unions without a cell centre).
    gx, gy, union_of_cell = ctx["gx"], ctx["gy"], ctx["union_of_cell"]
    counts = np.bincount(union_of_cell, minlength=len(unions))
    from shapely.ops import transform as shp_transform
    extra = [i for i in range(len(unions)) if counts[i] == 0]
    extra_xy = np.array([shp_transform(to_utm, unions[i]["geometry"].representative_point()).coords[0] for i in extra]).reshape(-1, 2)
    px = np.concatenate([gx, extra_xy[:, 0]])
    py = np.concatenate([gy, extra_xy[:, 1]])
    unit = np.concatenate([union_of_cell, np.array(extra, dtype=int)])
    cell_n = np.bincount(unit, minlength=len(unions))
    weight = union_adj[unit] / cell_n[unit]
    if abs(weight.sum() - union_adj.sum()) > 1:
        raise SystemExit("Grid population does not add up")
    xy = np.column_stack([px, py])

    usable = [f for f in facilities if f["usable"]]
    class_points = defaultdict(list)
    for f in usable:
        x, y = to_utm(float(f["lon"]), float(f["lat"]))
        for t in tags(f):
            class_points[t].append((x, y))
    dist = {c: cKDTree(np.array(class_points[c])).query(xy, k=1)[0] / 1000.0 for c in ACCESS_CLASSES}

    up_index = {u["pcode"]: i for i, u in enumerate(upazilas)}
    di_index = {d["pcode"]: i for i, d in enumerate(districts)}
    dv_index = {d["pcode"]: i for i, d in enumerate(divisions)}
    union_up = np.array([up_index[u["parent"]["pcode"]] for u in unions])
    up_di = np.array([di_index[u["parent"]["pcode"]] for u in upazilas])
    di_dv = np.array([dv_index[d["parent"]["pcode"]] for d in districts])
    area_of = {"union": unit, "upazila": union_up[unit]}
    area_of["district"] = up_di[area_of["upazila"]]
    area_of["division"] = di_dv[area_of["district"]]
    levels = {"division": divisions, "district": districts, "upazila": upazilas, "union": unions}

    def access_stats(level):
        idx, n = area_of[level], len(levels[level])
        pop = np.bincount(idx, weights=weight, minlength=n)
        out = {}
        for c in ACCESS_CLASSES:
            within = {str(t): np.bincount(idx, weights=weight * (dist[c] <= t), minlength=n) for t in THRESHOLDS}
            mean = np.bincount(idx, weights=weight * dist[c], minlength=n)
            out[c] = {"within": within, "mean": mean}
        return pop, out

    # --- Facility counts: recorded DGHS labels (all active listings, coordinates not needed)
    #     for division/district/upazila; mapped points for unions.
    dist_by_key = {district_key(d["name"]): d for d in districts}
    div_by_key = {district_key(d["name"]): d for d in divisions}
    label = {lv: defaultdict(Counter) for lv in ("division", "district", "upazila")}
    beds = {lv: defaultdict(Counter) for lv in ("division", "district", "upazila")}
    dghs_kinds, dghs_unmatched = Counter(), Counter()
    for f in facilities:
        if not f["active"]:
            continue
        found = {}
        if district_key(f["division"]) in div_by_key:
            found["division"] = div_by_key[district_key(f["division"])]["pcode"]
        if district_key(f["district"]) in dist_by_key:
            found["district"] = dist_by_key[district_key(f["district"])]["pcode"]
        if f["upazila"]:
            pcode, kind = matcher.match(f["district"], f["upazila"])
            dghs_kinds[kind] += 1
            if pcode:
                found["upazila"] = pcode
            else:
                dghs_unmatched[f"{f['district']} / {f['upazila']}"] += 1
        for lv, pcode in found.items():
            for t in tags(f):
                label[lv][pcode][t] += 1
            if f["klass"] in ("public_hospital", "private_ngo_hospital"):
                beds[lv][pcode]["public" if f["klass"] == "public_hospital" else "private_ngo"] += f["beds"]
    union_tree = STRtree([u["geometry"] for u in unions])
    union_points = defaultdict(Counter)
    for f in usable:
        hits = union_tree.query(Point(float(f["lon"]), float(f["lat"])), predicate="intersects")
        if len(hits):
            for t in tags(f):
                union_points[unions[int(hits[0])]["pcode"]][t] += 1

    # --- Census attributes per level.
    def census_attrs(level, area):
        if level == "union":
            return None
        rows = (up_census[area["pcode"]] if level == "upazila" else
                [district_pop[area["pcode"]]] if level == "district" else
                [district_pop[d["pcode"]] for d in districts if d["parent"] is area])
        pop = sum(r["pop"] for r in rows)
        attrs = {k: int(sum(r.get(k) or 0 for r in rows)) for k in ("pop", "u5", "age60", "hh")}
        if level == "upazila":
            for k in SOCIO:
                vals = [(r[k], r["pop"]) for r in rows if r.get(k) is not None]
                attrs[k] = round(sum(v * w for v, w in vals) / sum(w for _, w in vals), 2) if vals else None
            attrs["ethnic_pct"] = round(100 * sum(r.get("ethnic_pop") or 0 for r in rows) / pop, 2)
            attrs["unions_census"] = sum(1 for r in union_census[area["pcode"]] if r["type"] == "Union")
            attrs["union_pop"] = sum(r["pop"] for r in union_census[area["pcode"]] if r["type"] == "Union")
            attrs["units"] = [r["name"] for r in rows]
        return attrs

    results, upazila_metrics = {}, {}
    for level, areas in levels.items():
        pop_adj, acc = access_stats(level)
        rows = []
        for i, area in enumerate(areas):
            p = float(pop_adj[i])
            if level == "union":
                c = union_points[area["pcode"]]
                rows.append([area["pcode"], area["name"], area["parent"]["name"], area["parent"]["parent"]["name"],
                             round(p), union_source[i], round(float(union_u5[i] * union_factor[i])),
                             c["community_clinic"], c["union_facility"], c["uhc"], c["any_hospital"],
                             *[round(100 * float(acc[k]["within"]["5"][i]) / p, 1) if p else None
                               for k in ("public_hospital", "any_hospital", "primary_care")],
                             round(float(acc["primary_care"]["mean"][i]) / p, 2) if p else None])
                continue
            attrs = census_attrs(level, area)
            factor = (division_factor[area["pcode"]] if level == "division" else
                      factor_of_district[area["pcode"]] if level == "district" else
                      factor_of_district[area["parent"]["pcode"]])
            counts_ = {t: label[level][area["pcode"]][t] for t in COUNT_TAGS}
            row = {"pcode": area["pcode"], "name": area["name"], "area_km2": area["area_km2"],
                   "population": round(attrs["pop"] * factor), "population_enumerated": attrs["pop"],
                   "u5": round(attrs["u5"] * factor), "age60": round(attrs["age60"] * factor), "households": attrs["hh"],
                   "density": round(attrs["pop"] * factor / area["area_km2"]) if area["area_km2"] else None,
                   "counts": counts_, "beds": dict(beds[level][area["pcode"]]),
                   "rates": {t: round(counts_[t] / (attrs["pop"] * factor) * 1e5, 2) for t in RATE_TAGS},
                   "beds_per10k": {g: round(beds[level][area["pcode"]][g] / (attrs["pop"] * factor) * 1e4, 2)
                                   for g in ("public", "private_ngo")},
                   "within": {c: {str(t): round(100 * float(acc[c]["within"][str(t)][i]) / p, 1) for t in THRESHOLDS}
                              for c in ACCESS_CLASSES},
                   "people_beyond10": {c: round(p - float(acc[c]["within"]["10"][i])) for c in ACCESS_CLASSES},
                   "mean_km": {c: round(float(acc[c]["mean"][i]) / p, 2) for c in ACCESS_CLASSES}}
            if abs(p - row["population"]) > max(2, 1e-6 * p):
                raise SystemExit(f"{level} {area['name']}: grid population {p:.0f} != {row['population']}")
            if level != "division":
                row["parent"], row["parent_name"] = area["parent"]["pcode"], area["parent"]["name"]
            if level == "upazila":
                row["district"] = area["parent"]["name"]
                row["socio"] = {k: attrs[k] for k in (*SOCIO, "ethnic_pct")}
                row["unions_census"] = attrs["unions_census"]
                row["union_population"] = round(attrs["union_pop"] * factor)
                cc = counts_["community_clinic"]
                row["union_people_per_cc"] = round(row["union_population"] / cc) if cc else None
                row["census_units"] = attrs["units"]
                upazila_metrics[area["pcode"]] = row
            rows.append(row)
        results[level] = rows

    # --- Population living in unions (outside paurashavas and city corporations; BBS "rural" is smaller
    #     because it excludes urban areas inside unions) and union people per community clinic.
    union_pop_by = {"district": Counter(), "division": Counter()}
    for r in results["upazila"]:
        district_pcode = r["parent"]
        union_pop_by["district"][district_pcode] += r["union_population"]
        union_pop_by["division"][next(d["parent"]["pcode"] for d in districts if d["pcode"] == district_pcode)] += r["union_population"]
    for level in ("district", "division"):
        for r in results[level]:
            r["union_population"] = union_pop_by[level][r["pcode"]]
            cc = r["counts"]["community_clinic"]
            r["union_people_per_cc"] = round(r["union_population"] / cc) if cc else None

    # --- Inequality (district, upazila).
    inequality = {}
    for level in ("district", "upazila"):
        rows = results[level]
        w = [r["population"] for r in rows]
        inequality[level] = {
            **{f"rate_{t}": weighted_gini([r["rates"][t] for r in rows], w) for t in ("public_hospital", "any_hospital", "primary_care", "community_clinic")},
            "beds_public": weighted_gini([r["beds_per10k"]["public"] for r in rows], w),
        }

    # --- Spatial autocorrelation (upazilas).
    rng = np.random.default_rng(SEED)
    nbrs = neighbours([u["geometry"] for u in upazilas])
    rows = results["upazila"]
    values = {
        "within5_public_hospital": [r["within"]["public_hospital"]["5"] for r in rows],
        "within5_any_hospital": [r["within"]["any_hospital"]["5"] for r in rows],
        "rate_any_hospital": [r["rates"]["any_hospital"] for r in rows],
        "rate_primary_care": [r["rates"]["primary_care"] for r in rows],
    }
    moran_summary = {}
    for key, vals in values.items():
        stat, labels = moran(vals, nbrs, rng)
        moran_summary[key] = {"label": MORAN_MEASURES[key], **stat}
        for r, lab in zip(rows, labels):
            r.setdefault("lisa", {})[key] = lab

    # --- Access versus census indicators (upazilas; Spearman).
    correlations = {}
    for key in ("within5_public_hospital", "within5_any_hospital", "rate_any_hospital", "rate_primary_care"):
        correlations[key] = {}
        for s in (*SOCIO, "ethnic_pct"):
            pairs = [(v, r["socio"][s]) for v, r in zip(values[key], rows) if r["socio"].get(s) is not None]
            rho, p = spearmanr([a for a, _ in pairs], [b for _, b in pairs])
            correlations[key][s] = {"rho": round(float(rho), 3), "p": float(f"{p:.2g}"), "n": len(pairs)}

    # --- National.
    total = float(weight.sum())
    union_total = sum(r["union_population"] for r in results["division"])
    cc_total = sum(r["counts"]["community_clinic"] for r in results["division"])
    national = {"population": round(total), "population_enumerated": census_total,
                "union_population": union_total, "community_clinics": cc_total,
                "union_people_per_cc": round(union_total / cc_total),
                "unions_census": sum(r["unions_census"] for r in results["upazila"]),
                "union_facilities": sum(r["counts"]["union_facility"] for r in results["division"]),
                "access": {c: {"within": {str(t): round(100 * float(weight[dist[c] <= t].sum()) / total, 1) for t in THRESHOLDS},
                               "people_within": {str(t): round(float(weight[dist[c] <= t].sum())) for t in THRESHOLDS},
                               "mean_km": round(float((weight * dist[c]).sum()) / total, 2),
                               **people_curve(dist[c], weight),
                               "points": len(class_points[c])} for c in ACCESS_CLASSES}}
    pop_source_share = Counter()
    for i in range(len(unions)):
        pop_source_share[union_source[i] or "none"] += union_adj[i]
    summary = {
        "generatedAt": ctx["generated"],
        "population_source": census["source"], "population_basis": census["basis"],
        "population_extracted_from": census["extracted_from"],
        "adjustment": {"method": "Each area's enumerated count x its division's PEC factor (adjusted / enumerated)",
                       "division_factors": {d["name"]: round(division_factor[d["pcode"]], 4) for d in divisions}},
        "grid": {"metres": 1000, "points": int(len(weight)), "extra_union_points": len(extra)},
        "national": national,
        "inequality": inequality,
        "moran": moran_summary,
        "correlations": correlations,
        "matching": {
            "census_upazilas": dict(census_kinds),
            "dghs_upazila_labels": dict(dghs_kinds),
            "dghs_unmatched_listings": sum(dghs_unmatched.values()),
            "dghs_unmatched_examples": dghs_unmatched.most_common(8),
            "union_population_share": {k: round(100 * v / union_adj.sum(), 1) for k, v in pop_source_share.items()},
            "unions_by_source": dict(Counter(union_source)),
        },
    }

    OUT.mkdir(exist_ok=True)
    def dump(name, payload):
        (OUT / name).write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    for level in ("division", "district", "upazila"):
        dump(f"areas-{level}.json", {"generatedAt": ctx["generated"], "level": level, "count": len(results[level]), "areas": results[level]})
    union_cols = ["pcode", "name", "upazila", "district", "population", "source", "u5", "community_clinic", "union_facility", "uhc", "any_hospital",
                  "within5_public_hospital", "within5_any_hospital", "within5_primary_care", "mean_km_primary_care"]
    dump("areas-union.json", {"generatedAt": ctx["generated"], "level": "union", "count": len(results["union"]),
                              "columns": union_cols, "rows": results["union"]})
    dump("summary.json", summary)
    # Facility points for the map overlay: [lon, lat, bitmask] using MASK_BITS (usable coordinates only).
    mask_rows = []
    for f in usable:
        mask = sum(MASK_BITS[t] for t in tags(f) if t in MASK_BITS)
        if mask:
            mask_rows.append([round(float(f["lon"]), 4), round(float(f["lat"]), 4), mask])
    mask_rows.sort()
    dump("points.json", {"generatedAt": ctx["generated"], "bits": MASK_BITS, "rows": mask_rows})
    with open(OUT / "census-upazila-crosswalk.csv", "w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(["district", "census_upazila_or_thana", "census_population_2022", "pcode_2015", "upazila_2015", "match"])
        writer.writerows(sorted(crosswalk_rows))
    return summary

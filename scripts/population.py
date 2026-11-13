"""Join BBS Census 2022 population and DGHS upazila labels to the geoBoundaries
(2015) upazilas and unions used by the site.

Upazilas/thanas: name within district -> spelling-tolerant key -> explicit
crosswalk (units created or renamed after 2015 go to the 2015 unit they were
carved from). Every census unit must land in exactly one 2015 upazila, so
district and upazila totals are exact.

Unions: rural unions by name within the upazila; each paurashava polygon gets
its paurashava's census wards; the rest of the upazila's population (city
wards, unmatched unions) is spread over the remaining polygons by area and
flagged "estimated".
"""
from __future__ import annotations

import difflib
import re
import unicodedata
from collections import defaultdict

DISTRICT_ALIASES = {
    "barisal": "barishal", "chittagong": "chattogram", "bogra": "bogura", "comilla": "cumilla",
    "jessore": "jashore", "jhalokati": "jhalokathi", "khagrachhari": "khagrachari",
    "brahamanbaria": "brahmanbaria", "maulvibazar": "moulvibazar", "nawabganj": "chapainawabganj",
    "chapai nawabganj": "chapainawabganj", "netrakona": "netrokona",
}

# (district, census or DGHS name) -> 2015 geoBoundaries upazila. "parent": created after 2015
# from this unit; "rename"/"spelling": same unit; "approximate": metropolitan thana created after
# 2015, assigned to an adjacent 2015 thana in the same city.
CROSSWALK = {
    ("barguna", "taltali"): ("Amtali", "parent"),
    ("barishal", "barishal"): ("Barisal Sadar (Kotwali)", "rename"),
    ("barishal", "ujirpur"): ("Wazirpur", "spelling"),
    ("barishal", "hijla"): ("Hizla", "spelling"),
    ("rajbari", "goalanda"): ("Goalandaghat", "rename"),
    ("chattogram", "akbarshah"): ("Pahartali", "approximate"),
    ("chattogram", "chalk bazar"): ("Kotwali", "approximate"),
    ("chattogram", "chak bazar"): ("Kotwali", "approximate"),
    ("chattogram", "chattogram port"): ("Chittagong Port", "spelling"),
    ("chattogram", "chittogram port"): ("Chittagong Port", "spelling"),
    ("chattogram", "epz"): ("Patenga", "approximate"),
    ("chattogram", "sadarghat"): ("Kotwali", "approximate"),
    ("chattogram", "karnaphuli"): ("Patiya", "parent"),
    ("cumilla", "dakkhin"): ("Comilla Sadar Dakshin", "spelling"),
    ("cumilla", "cumilla dakshin"): ("Comilla Sadar Dakshin", "spelling"),
    ("cumilla", "adarsha"): ("Comilla Adarsha Sadar", "spelling"),
    ("cumilla", "cumilla adarsha"): ("Comilla Adarsha Sadar", "spelling"),
    ("cumilla", "lalmai"): ("Comilla Sadar Dakshin", "parent"),
    ("cumilla", "lalmi"): ("Comilla Sadar Dakshin", "parent"),
    ("coxs bazar", "eidgaon"): ("Cox's Bazar Sadar", "parent"),
    ("dhaka", "mugda"): ("Sabujbagh", "approximate"),
    ("dhaka", "mugda para"): ("Sabujbagh", "approximate"),
    ("dhaka", "shahjahanpur"): ("Motijheel", "approximate"),
    ("dhaka", "shajahanpur"): ("Motijheel", "approximate"),
    ("dhaka", "wari"): ("Sutrapur", "approximate"),
    ("dhaka", "banani"): ("Gulshan", "approximate"),
    ("dhaka", "bhasantek"): ("Kafrul", "approximate"),
    ("dhaka", "bhasan tek"): ("Kafrul", "approximate"),
    ("dhaka", "bhatara"): ("Badda", "approximate"),
    ("dhaka", "hatirjheel"): ("Tejgaon", "approximate"),
    ("dhaka", "rupnagar"): ("Pallabi", "approximate"),
    ("dhaka", "tejgaon shilpa elaka"): ("Tejgaon Ind. Area", "rename"),
    ("dhaka", "uttra pashchim"): ("Uttara", "parent"),
    ("dhaka", "uttara paschim"): ("Uttara", "parent"),
    ("dhaka", "uttara purba"): ("Uttara", "parent"),
    ("dhaka", "uttarkhan"): ("Uttar Khan", "spelling"),
    ("dhaka", "nawabganj"): ("Nawabganj", "spelling"),
    ("dinajpur", "nababganj"): ("Nawabganj", "spelling"),
    ("dinajpur", "nawabganj"): ("Nawabganj", "spelling"),
    ("chapainawabganj", "chapainawabganj"): ("Nawabganj Sadar", "rename"),
    ("gazipur", "basan"): ("Gazipur Sadar", "parent"),
    ("gazipur", "gachha"): ("Gazipur Sadar", "parent"),
    ("gazipur", "kashimpur"): ("Gazipur Sadar", "parent"),
    ("gazipur", "konabari"): ("Gazipur Sadar", "parent"),
    ("gazipur", "pubail"): ("Gazipur Sadar", "parent"),
    ("gazipur", "tongi pashchim"): ("Gazipur Sadar", "parent"),
    ("gazipur", "tongi purba"): ("Gazipur Sadar", "parent"),
    ("gazipur", "joydebpur"): ("Gazipur Sadar", "parent"),
    ("habiganj", "shayestaganj"): ("Habiganj Sadar", "parent"),
    ("jashore", "jashore"): ("Kotwali", "rename"),
    ("khagrachari", "guimara"): ("Matiranga", "parent"),
    ("kurigram", "rajibpur"): ("Char Rajibpur", "rename"),
    ("lakshmipur", "raipur"): ("Roypur", "spelling"),
    ("madaripur", "dasar"): ("Kalkini", "parent"),
    ("mymensingh", "fulpur"): ("Phulpur", "spelling"),
    ("mymensingh", "tarakanda"): ("Phulpur", "parent"),
    ("narsingdi", "raipura"): ("Roypura", "spelling"),
    ("natore", "naldanga"): ("Natore Sadar", "parent"),
    ("noakhali", "noakhali"): ("Noakhali Sadar (Sudharam)", "rename"),
    ("patuakhali", "rangabali"): ("Galachipa", "parent"),
    ("pirojpur", "nesarabad"): ("Nesarabad (Swarupkati)", "rename"),
    ("pirojpur", "indurkani"): ("Zianagar", "rename"),
    ("rajshahi", "chandrima"): ("Boalia", "approximate"),
    ("rajshahi", "kashiadanga"): ("Rajpara", "approximate"),
    ("rangamati", "kawkhali"): ("Kawkhali (Betbunia)", "rename"),
    ("rangamati", "kowkhali"): ("Kawkhali (Betbunia)", "rename"),
    ("rangpur", "hajirhat"): ("Rangpur Sadar", "parent"),
    ("rangpur", "kotwali"): ("Rangpur Sadar", "parent"),
    ("rangpur", "mahiganj"): ("Rangpur Sadar", "parent"),
    ("rangpur", "parshuram"): ("Rangpur Sadar", "parent"),
    ("rangpur", "tajhat"): ("Rangpur Sadar", "parent"),
    ("rangpur", "haragachh"): ("Kaunia", "parent"),
    ("sunamganj", "madhyanagar"): ("Dharampasha", "parent"),
    ("sunamganj", "shalla"): ("Sulla", "spelling"),
    ("sunamganj", "shantiganj"): ("Dakshin Sunamganj", "rename"),
    ("sylhet", "airport"): ("Sylhet Sadar", "parent"),
    ("sylhet", "jalalabad"): ("Sylhet Sadar", "parent"),
    ("sylhet", "kotwali"): ("Sylhet Sadar", "parent"),
    ("sylhet", "shahparan"): ("Sylhet Sadar", "parent"),
    ("sylhet", "moglabazar"): ("Dakshin Surma", "parent"),
    ("sylhet", "osmaninagar"): ("Balaganj", "parent"),
}


def basic(value) -> str:
    value = unicodedata.normalize("NFKC", str(value or "")).casefold()
    value = re.sub(r"\(.*?\)", " ", value)
    value = value.replace("-", " ").replace("'", "").replace("’", "").replace(".", " ")
    value = re.sub(r"\b(upazila|upazilla|thana|sadar|city corporation|union|parishad)\b", " ", value)
    return " ".join(value.split())


def district_key(value) -> str:
    value = basic(value)
    return DISTRICT_ALIASES.get(value, value)


def skeleton(value) -> str:
    """Spelling-tolerant key: drops spaces, 'h' and vowels (Fatikchari ~ Fatikchhari)."""
    value = re.sub(r"[^a-z]", "", basic(value)).replace("h", "")
    value = value[:1] + re.sub(r"[aeiouwy]", "", value[1:])
    return re.sub(r"(.)\1+", r"\1", value)


def similarity(a: str, b: str) -> float:
    swap = lambda v: basic(v).replace("dakkhin", "dakshin").replace("z", "j").replace(" ", "")  # noqa: E731
    return max(difflib.SequenceMatcher(None, swap(a), swap(b)).ratio(),
               difflib.SequenceMatcher(None, skeleton(a), skeleton(b)).ratio() - 0.05)


class UpazilaMatcher:
    """Match (district, upazila/thana name) to a 2015 upazila pcode."""

    def __init__(self, upazilas):
        self.by_district = defaultdict(list)
        for u in upazilas:
            self.by_district[district_key(u["district"])].append(u)
        self.log = []

    def match(self, district: str, name: str):
        dkey, nkey = district_key(district), basic(name)
        candidates = self.by_district.get(dkey, [])
        if not candidates:
            return None, "no district"
        if (dkey, nkey) in CROSSWALK:
            target, kind = CROSSWALK[(dkey, nkey)]
            hit = [u for u in candidates if u["name"] == target]
            if len(hit) != 1:
                raise SystemExit(f"Crosswalk target missing: {district} / {target}")
            return hit[0]["pcode"], kind
        exact = [u for u in candidates if basic(u["name"]) == nkey]
        if len(exact) == 1:
            return exact[0]["pcode"], "exact"
        loose = [u for u in candidates if skeleton(u["name"]) == skeleton(name)]
        if len(loose) == 1:
            return loose[0]["pcode"], "spelling"
        names = {basic(u["name"]): u for u in candidates}
        close = difflib.get_close_matches(nkey, list(names), n=2, cutoff=0.82)
        if len(close) == 1 or (len(close) == 2 and difflib.SequenceMatcher(None, nkey, close[0]).ratio()
                                > difflib.SequenceMatcher(None, nkey, close[1]).ratio() + 0.08):
            return names[close[0]]["pcode"], "spelling"
        return None, "unmatched"


def allocate_unions(upazila_pcode, polygons, census_units, upazila_total):
    """Population for each union polygon of one 2015 upazila.

    polygons: [{"pcode", "name", "area_km2"}]; census_units: census rows mapped to this upazila.
    Returns {pcode: (population, u5, age60, source)} whose populations sum to upazila_total.
    """
    out = {}
    rural = defaultdict(list)
    for unit in census_units:
        if unit["type"] == "Union":
            rural[skeleton(unit["name"])].append(unit)
    paura_units = [u for u in census_units if u["type"] == "Ward" and u["urban"] == "Paurashava"]
    used = set()
    for poly in polygons:
        if "paurashava" in poly["name"].casefold():
            continue
        hits = rural.get(skeleton(poly["name"]), [])
        if len(hits) == 1 and id(hits[0]) not in used:
            unit = hits[0]
            used.add(id(unit))
            out[poly["pcode"]] = [unit["pop"], unit["u5"], unit["age60"] or 0, "census"]
    # Second pass: pair leftover rural names by spelling similarity (Gajalia ~ Gazalia), best pairs first.
    left_units = [u for u in census_units if u["type"] == "Union" and id(u) not in used]
    left_polys = [p for p in polygons if p["pcode"] not in out and "paurashava" not in p["name"].casefold()
                  and not p["name"].casefold().startswith("ward")]
    pairs = sorted(((similarity(u["name"], p["name"]), j, k) for j, u in enumerate(left_units)
                    for k, p in enumerate(left_polys)), reverse=True)
    taken_u, taken_p = set(), set()
    for score, j, k in pairs:
        if score < 0.75:
            break
        if j in taken_u or k in taken_p:
            continue
        taken_u.add(j)
        taken_p.add(k)
        unit = left_units[j]
        used.add(id(unit))
        out[left_polys[k]["pcode"]] = [unit["pop"], unit["u5"], unit["age60"] or 0, "census"]
    paura_polys = [p for p in polygons if "paurashava" in p["name"].casefold()]
    if paura_polys and paura_units:
        total_area = sum(p["area_km2"] for p in paura_polys) or 1.0
        for unit in paura_units:
            used.add(id(unit))
        sums = [sum(u[k] or 0 for u in paura_units) for k in ("pop", "u5", "age60")]
        for p in paura_polys:
            share = p["area_km2"] / total_area if len(paura_polys) > 1 else 1.0
            out[p["pcode"]] = [sums[0] * share, sums[1] * share, sums[2] * share,
                               "paurashava" if len(paura_polys) == 1 else "estimated"]
    rest = [u for u in census_units if id(u) not in used]
    residual = [sum(u[k] or 0 for u in rest) for k in ("pop", "u5", "age60")]
    open_polys = [p for p in polygons if p["pcode"] not in out]
    if open_polys:
        area = sum(p["area_km2"] for p in open_polys) or float(len(open_polys))
        for p in open_polys:
            share = (p["area_km2"] or area / len(open_polys)) / area
            out[p["pcode"]] = [residual[0] * share, residual[1] * share, residual[2] * share, "estimated"]
    elif residual[0] and out:
        assigned = sum(v[0] for v in out.values()) or 1.0
        for v in out.values():
            share = v[0] / assigned
            v[0] += residual[0] * share
            v[1] += residual[1] * share
            v[2] += residual[2] * share
            if v[3] == "census":
                v[3] = "census+"
    total = sum(v[0] for v in out.values())
    if out and abs(total - upazila_total) > 0.5:
        raise SystemExit(f"{upazila_pcode}: union population {total:.0f} != upazila {upazila_total}")
    return {k: tuple(v) for k, v in out.items()}

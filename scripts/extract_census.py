"""Extract BBS Population & Housing Census 2022 tables from the UNICEF Bangladesh
census dashboard (github.com/unicefbd/bangladesh-population-housing-census-2022).

The dashboard embeds BBS Community Series tables (C-01, C-02, C-18) for 8
divisions, 64 districts, 600 upazilas/thanas and 8,198 unions/wards, plus
upazila-level literacy, WASH, digital-access and ethnic-population tables.
Its embedded geometry is NOT used: it does not line up with its own names.

Usage:
    python3 -I scripts/extract_census.py <path to dashboard index.html>
Writes data/population/bbs-census-2022.json (enumerated counts, not PEC-adjusted).
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/population/bbs-census-2022.json"
SOURCE_REPO = "https://github.com/unicefbd/bangladesh-population-housing-census-2022"
NATIONAL_TOTAL = 165_158_616  # BBS 2022 enumerated total (before the post-enumeration check)


def block(html: str, name: str):
    start = html.index(f"const {name}")
    brace = min(i for i in (html.find("{", start), html.find("[", start)) if i > 0)
    value, _ = json.JSONDecoder().raw_decode(html[brace:])
    return value


def unpack(table):
    """Union tables are stored as {"__packed": true, "cols": [...], "rows": [[...]]}."""
    if isinstance(table, dict) and table.get("__packed"):
        return [dict(zip(table["cols"], row)) for row in table["rows"]]
    return table


def aged(row):
    age = row.get("age") or []
    return sum(age[12:]) if len(age) == 17 else None  # bands 60-64 ... 80+


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    path = Path(sys.argv[1])
    html = path.read_text(encoding="utf-8")
    data = block(html, "BD_DATA")
    sdg, edu, digital, wash, eth = (block(html, n) for n in ("SDG_DATA", "EDU_DATA", "DIGITAL_DATA", "WASH_DATA", "ETH_DATA"))

    for level in ("divisions", "districts", "upazilas", "unionwards"):
        total = sum(r.get("pop") or 0 for r in data[level])
        if total != NATIONAL_TOTAL:
            raise SystemExit(f"{level}: total {total} != {NATIONAL_TOTAL}")

    keep = ("pop", "male", "female", "hh", "u5")
    divisions = [{"id": r["id"], "name": r["name"], **{k: r[k] for k in keep}, "age60": aged(r)} for r in data["divisions"]]
    districts = [{"id": r["id"], "name": r["name"], "divisionId": r["divisionId"], **{k: r[k] for k in keep}, "age60": aged(r)}
                 for r in data["districts"]]

    by_id = lambda rows: {r["id"]: r for r in rows}  # noqa: E731
    socio = {name: by_id(table["upazilas"]) for name, table in
             (("sdg", sdg), ("edu", edu), ("digital", digital), ("wash", wash), ("eth", eth))}
    upazilas = []
    for r in data["upazilas"]:
        s = {k: socio[k].get(r["id"], {}) for k in socio}
        upazilas.append({
            "id": r["id"], "name": r["name"], "districtId": r["districtId"], "cityCorp": r["isCityCorp"],
            **{k: r[k] for k in keep}, "age60": aged(r),
            "literacy7": edu_value(s["edu"], "Total_lit_7plus_total"),
            "female_literacy7": edu_value(s["edu"], "Total_lit_7plus_female"),
            "basic_sanitation": edu_value(s["sdg"], "Basic_Sanitation"),
            "internet5": edu_value(s["digital"], "Total_internet_5plus_total"),
            "mobile15_female": edu_value(s["digital"], "Total_mobile_15plus_female"),
            "ethnic_pop": edu_value(s["eth"], "Total_ethnic_pop_total"),
        })
    unions = [{"id": r["id"], "name": r["name"], "type": r["type"], "urban": r["urban"], "upazilaId": r["upazilaId"],
               "pop": r.get("pop") or 0, "u5": r.get("u5") or 0, "age60": aged(r)} for r in data["unionwards"]]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "source": "Bangladesh Bureau of Statistics (BBS), Population and Housing Census 2022, Community Series "
                  "(tables C-01, C-02, C-18; literacy, WASH, ICT and ethnic-population tables)",
        "basis": "Enumerated counts (not adjusted by the post-enumeration check)",
        "national_total": NATIONAL_TOTAL,
        "extracted_from": SOURCE_REPO,
        "extracted_file_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "age60_note": "Sum of the 60-64 ... 80+ bands of table C-02",
        "divisions": divisions, "districts": districts, "upazilas": upazilas, "unions": unions,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(districts)} districts, {len(upazilas)} upazilas/thanas, {len(unions)} unions/wards")
    return 0


def edu_value(row, key):
    value = row.get(key)
    return round(float(value), 2) if isinstance(value, (int, float)) else None


if __name__ == "__main__":
    raise SystemExit(main())

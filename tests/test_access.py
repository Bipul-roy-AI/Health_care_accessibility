"""Checks for the population-based access outputs (data/access/, scripts/build_access.py)."""
import csv
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from population import UpazilaMatcher, allocate_unions, skeleton, similarity  # noqa: E402

ACCESS = ROOT / "data/access"


def load(name):
    return json.loads((ACCESS / name).read_text(encoding="utf-8"))


class CensusSource(unittest.TestCase):
    def test_census_totals(self):
        census = json.loads((ROOT / "data/population/bbs-census-2022.json").read_text(encoding="utf-8"))
        for level in ("districts", "upazilas", "unions"):
            self.assertEqual(sum(r["pop"] for r in census[level]), 165_158_616, level)
        self.assertEqual(len(census["districts"]), 64)
        self.assertEqual(len(census["unions"]), 8198)


class Matching(unittest.TestCase):
    def test_spelling_key(self):
        self.assertEqual(skeleton("Fatikchari"), skeleton("Fatikchhari"))
        self.assertEqual(skeleton("Bogura Sadar Upazila"), skeleton("Bogra Sadar"))
        self.assertGreater(similarity("Gajalia Union", "Gazalia"), 0.9)
        self.assertLess(similarity("Sreepur Union", "Ulania"), 0.5)

    def test_crosswalk_and_exact(self):
        m = UpazilaMatcher([{"pcode": "A", "name": "Amtali", "district": "Barguna"},
                            {"pcode": "B", "name": "Barguna Sadar", "district": "Barguna"}])
        self.assertEqual(m.match("Barguna", "Taltali Upazila"), ("A", "parent"))
        self.assertEqual(m.match("Barguna", "Barguna Sadar Upazila")[0], "B")
        self.assertEqual(m.match("Barguna", "Nowhere")[0], None)

    def test_union_allocation_conserves_total(self):
        polys = [{"pcode": "u1", "name": "Alpha", "area_km2": 10}, {"pcode": "u2", "name": "Beta Para", "area_km2": 20},
                 {"pcode": "u3", "name": "Town Paurashava", "area_km2": 5}, {"pcode": "u4", "name": "Ward No-01", "area_km2": 1}]
        units = [{"name": "Alpha Union", "type": "Union", "urban": "Rural (Upazila/Union)", "pop": 100, "u5": 10, "age60": 5},
                 {"name": "Betapara Union", "type": "Union", "urban": "Rural (Upazila/Union)", "pop": 200, "u5": 20, "age60": 9},
                 {"name": "Ward No. 01", "type": "Ward", "urban": "Paurashava", "pop": 50, "u5": 4, "age60": 3},
                 {"name": "Ward No. 07", "type": "Ward", "urban": "City Corporation", "pop": 70, "u5": 6, "age60": 2}]
        out = allocate_unions("X", polys, units, 420)
        self.assertEqual(out["u1"][0], 100)
        self.assertEqual(out["u2"][0], 200)
        self.assertEqual((out["u3"][0], out["u3"][3]), (50, "paurashava"))
        self.assertEqual((out["u4"][0], out["u4"][3]), (70, "estimated"))
        self.assertAlmostEqual(sum(v[0] for v in out.values()), 420)


class Outputs(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.summary = load("summary.json")
        cls.levels = {k: load(f"areas-{k}.json")["areas"] for k in ("division", "district", "upazila")}
        cls.union = load("areas-union.json")

    def test_population_totals(self):
        adjusted = json.loads((ROOT / "data/statistics/sources.json").read_text(encoding="utf-8"))["population"]["divisions"]
        total = sum(adjusted.values())
        self.assertEqual(self.summary["national"]["population"], total)
        for level, rows in self.levels.items():
            self.assertLessEqual(abs(sum(r["population"] for r in rows) - total), len(rows), level)
            self.assertEqual(sum(r["population_enumerated"] for r in rows), 165_158_616, level)
        for row in self.levels["division"]:
            self.assertEqual(row["population"], adjusted[row["name"]], row["name"])
        cols = self.union["columns"]
        pop = sum(r[cols.index("population")] for r in self.union["rows"])
        self.assertLessEqual(abs(pop - total), len(self.union["rows"]))
        self.assertEqual(len(self.union["rows"]), 5160)

    def test_counts_match_statistics_page(self):
        groups = json.loads((ROOT / "data/statistics/summary.json").read_text(encoding="utf-8"))["groups"]
        by_name = {r["name"]: r for r in self.levels["division"]}
        for group, tag in (("hospitals", "any_hospital"), ("publicHospitals", "public_hospital"),
                           ("bloodBanks", "blood_bank"), ("communityClinics", "community_clinic")):
            for name, value in groups[group]["divisions"].items():
                self.assertEqual(by_name[name]["counts"][tag], value["count"], f"{group} {name}")

    def test_shares_and_statistics_are_valid(self):
        for level, rows in self.levels.items():
            for r in rows:
                self.assertGreater(r["population"], 0, r["name"])
                for klass, within in r["within"].items():
                    values = [within[t] for t in ("2", "5", "10", "20")]
                    self.assertEqual(values, sorted(values), f"{level} {r['name']} {klass}")
                    self.assertTrue(all(0 <= v <= 100 for v in values))
        for level in ("district", "upazila"):
            for key, value in self.summary["inequality"][level].items():
                self.assertTrue(0 <= value["gini"] < 1, key)
                self.assertEqual(value["lorenz"][0], [0.0, 0.0])
                self.assertEqual(value["lorenz"][-1], [100.0, 100.0])
        for key, value in self.summary["moran"].items():
            self.assertTrue(-1 <= value["I"] <= 1, key)
            self.assertEqual(sum(value["counts"].values()), len(self.levels["upazila"]))
        for r in self.levels["upazila"]:
            self.assertTrue(set(r["lisa"].values()) <= {"HH", "LL", "HL", "LH", "ns"})

    def test_crosswalk_covers_every_census_unit(self):
        with open(ACCESS / "census-upazila-crosswalk.csv", encoding="utf-8") as stream:
            rows = list(csv.DictReader(stream))
        self.assertEqual(len(rows), 600)
        self.assertEqual(sum(int(r["census_population_2022"]) for r in rows), 165_158_616)
        self.assertEqual(len({r["pcode_2015"] for r in rows}), 544)
        self.assertTrue(all(r["match"] for r in rows))

    def test_points_file(self):
        points = load("points.json")
        self.assertEqual(points["bits"]["public_hospital"], 1)
        for lon, lat, mask in points["rows"]:
            self.assertTrue(88 <= lon <= 93 and 20.5 <= lat <= 27, (lon, lat))
            self.assertGreater(mask, 0)
        hospitals = sum(1 for *_, mask in points["rows"] if mask & points["bits"]["any_hospital"])
        self.assertEqual(hospitals, self.summary["national"]["access"]["any_hospital"]["points"])


if __name__ == "__main__":
    unittest.main()

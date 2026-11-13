"""Internal consistency checks for the committed atlas and location-audit data."""
import csv
import hashlib
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEVELS = {"division": 8, "district": 64, "upazila": 544}


def load(name):
    return json.loads((ROOT / "data" / name).read_text(encoding="utf-8"))


class AtlasDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = load("atlas/manifest.json")
        cls.areas = {level: load(f"atlas/areas-{level}.json")["areas"] for level in ("division", "district", "upazila", "union")}
        cls.distance = load("atlas/distance.json")
        cls.quality = load("atlas/location-quality.json")

    def test_registry_snapshot_is_recorded(self):
        # The atlas is a dated snapshot; the daily registry update does not
        # rebuild it, so a changed index must not block deployment.
        recorded = self.manifest["registry"]["sha256"]
        self.assertRegex(recorded, r"^[0-9a-f]{64}$")
        if hashlib.sha256((ROOT / "data/dghs/index.json").read_bytes()).hexdigest() != recorded:
            self.skipTest("DGHS index changed since the atlas snapshot; rebuild with scripts/build_atlas.py")

    def test_area_counts_and_unique_ids(self):
        for level, count in LEVELS.items():
            self.assertEqual(len(self.areas[level]), count, level)
        self.assertGreater(len(self.areas["union"]), 4500)
        for level, rows in self.areas.items():
            self.assertEqual(len({r["pcode"] for r in rows}), len(rows), level)
        self.assertEqual(self.manifest["levels"]["union"], len(self.areas["union"]))

    def test_levels_nest(self):
        for child, parent in (("district", "division"), ("upazila", "district"), ("union", "upazila")):
            parents = {a["pcode"] for a in self.areas[parent]}
            for area in self.areas[child]:
                self.assertIn(area["parent"], parents, f"{child} {area['pcode']}")
        self.assertEqual({u["parent"] for u in self.areas["union"]}, {u["pcode"] for u in self.areas["upazila"]})

    def test_point_counts_add_up_across_levels(self):
        for klass in ("public_hospital", "private_ngo_hospital", "primary_care"):
            totals = {level: sum(a["points"].get(klass, 0) for a in rows) for level, rows in self.areas.items()}
            self.assertEqual(len(set(totals.values())), 1, f"{klass}: {totals}")
            usable = self.distance["points"][klass]
            self.assertLessEqual(usable - totals["union"], self.quality["usable_outside_union_polygons"], klass)

    def test_quality_counts_reconcile(self):
        q = self.quality
        self.assertEqual(q["published"], q["flagged"] + q["usable"])
        self.assertEqual(len(q["flagged_ids"]), q["flagged"])
        with open(ROOT / "data/atlas/flagged-locations.csv", encoding="utf-8") as stream:
            rows = list(csv.DictReader(stream))
        self.assertEqual(len(rows), q["flagged"])
        self.assertEqual({r["dghs_id"] for r in rows}, set(q["flagged_ids"]))
        self.assertEqual(self.distance["points"]["any_hospital"], q["hospitals"]["usable"])

    def test_distance_curves_and_quantiles(self):
        for klass, entry in self.distance["national"].items():
            shares = [share for _, share in entry["curve"]]
            self.assertTrue(all(b >= a for a, b in zip(shares, shares[1:])), klass)
            self.assertLessEqual(entry["median_km"], entry["p90_km"])
        for level in ("division", "district", "upazila"):
            for area in self.areas[level]:
                for klass, stats in area["distance"].items():
                    if stats.get("cells"):
                        self.assertLessEqual(stats["median_km"], stats["p90_km"], f"{level} {area['pcode']} {klass}")

    def test_grid_cells_partition_each_level(self):
        cells = self.distance["cells"]
        for level, rows in self.areas.items():
            self.assertEqual(sum(r["distance"]["public_hospital"].get("cells", 0) for r in rows), cells, level)

    def test_boundary_files_align(self):
        for name, level, key in (("bangladesh-divisions.geojson", "division", "pcode"), ("bangladesh-districts.geojson", "district", "pcode"),
                                 ("bangladesh-upazilas.geojson", "upazila", "pcode")):
            features = load(f"boundaries/{name}")["features"]
            self.assertEqual({f["properties"][key] for f in features}, {a["pcode"] for a in self.areas[level]}, name)
        topo = load("boundaries/bangladesh-unions.topojson")
        geometries = topo["objects"]["unions"]["geometries"]
        self.assertEqual({g["properties"]["pcode"] for g in geometries}, {a["pcode"] for a in self.areas["union"]})


if __name__ == "__main__":
    unittest.main()

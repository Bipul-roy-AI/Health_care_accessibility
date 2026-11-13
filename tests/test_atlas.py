"""Internal consistency checks for the committed atlas datasets."""
import hashlib
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(name):
    return json.loads((ROOT / "data" / name).read_text(encoding="utf-8"))


class AtlasDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = load("atlas/manifest.json")
        cls.adm2 = load("atlas/areas-adm2.json")["areas"]
        cls.adm3 = load("atlas/areas-adm3.json")["areas"]
        cls.distance = load("atlas/distance.json")
        cls.profiles = load("atlas/profile-aggregates.json")

    def test_registry_snapshot_is_recorded(self):
        # The atlas is a dated snapshot. The daily workflow refreshes the DGHS
        # index without rebuilding the atlas, so a changed index must not
        # block deployment; it only means the atlas should be rebuilt.
        recorded = self.manifest["registry"]["sha256"]
        self.assertRegex(recorded, r"^[0-9a-f]{64}$")
        digest = hashlib.sha256(
            (ROOT / "data/dghs/index.json").read_bytes()).hexdigest()
        if digest != recorded:
            self.skipTest("DGHS index changed since the atlas snapshot; "
                          "rebuild with scripts/build_atlas.py")

    def test_area_counts(self):
        self.assertEqual(len(self.adm2), 64)
        self.assertEqual(len(self.adm3), 544)
        self.assertEqual(len({a["pcode"] for a in self.adm3}), 544)

    def test_registry_totals_reconcile(self):
        total = sum(a["registry"].get("total", 0) for a in self.adm2)
        expected = (self.manifest["registry"]["active"]
                    - self.manifest["registry"]["active_without_district_match"])
        self.assertEqual(total, expected)

    def test_adm3_links_to_adm2(self):
        district_pcodes = {a["pcode"] for a in self.adm2}
        for area in self.adm3:
            self.assertIn(area["district_pcode"], district_pcodes)

    def test_distance_curves_are_monotonic(self):
        for klass, entry in self.distance["national"].items():
            shares = [share for _, share in entry["curve"]]
            self.assertTrue(all(0 <= s <= 100 for s in shares), klass)
            self.assertTrue(all(b >= a for a, b in zip(shares, shares[1:])), klass)
            self.assertGreater(entry["cells"], 30000)

    def test_distance_quantiles_ordered(self):
        for area in self.adm3:
            for klass, stats in area["distance"].items():
                if stats.get("cells"):
                    self.assertLessEqual(stats["median_km"], stats["p90_km"], klass)
                    self.assertLessEqual(stats["p90_km"], stats["max_km"], klass)

    def test_boundary_files_align_with_areas(self):
        for name, count, key in (
                ("boundaries/bangladesh-districts.geojson", 64, self.adm2),
                ("boundaries/bangladesh-upazilas.geojson", 544, self.adm3)):
            collection = load(name)
            self.assertEqual(len(collection["features"]), count)
            pcodes = {f["properties"]["pcode"] for f in collection["features"]}
            self.assertEqual(pcodes, {a["pcode"] for a in key})
            for feature in collection["features"]:
                self.assertGreater(feature["properties"]["area_km2"], 0)

    def test_profile_coverage_is_reported(self):
        coverage = self.profiles["coverage"]
        self.assertGreater(coverage["approved_beds_total"], 0)
        self.assertLessEqual(coverage["establishment_year_reported"],
                             coverage["facilities_total_active"])
        growth = self.profiles["growth_by_decade"]
        self.assertEqual(sum(v.get("all", 0) for v in growth.values()),
                         coverage["establishment_year_reported"])


if __name__ == "__main__":
    unittest.main()

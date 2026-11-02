import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from country_boundary import COUNTRY, CountryBoundary
from sync_dghs import coordinates


class BoundaryChecks(unittest.TestCase):
    def test_known_bangladesh_places_including_offshore_island(self):
        for latitude, longitude in [(23.8103, 90.4125), (24.8949, 91.8687), (22.3569, 91.7832), (20.627, 92.322)]:
            self.assertTrue(COUNTRY.contains(latitude, longitude))

    def test_neighbours_inside_old_rectangle_are_rejected(self):
        for latitude, longitude in [(22.5726, 88.3639), (23.8315, 91.2868), (25.5788, 91.8933), (21.0, 89.5)]:
            self.assertFalse(COUNTRY.contains(latitude, longitude))
            self.assertEqual(coordinates(latitude, longitude), (None, None, "outside"))

    def test_holes_and_multipolygon_islands(self):
        shape = {"type": "MultiPolygon", "coordinates": [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]]], [[[20, 0], [22, 0], [22, 2], [20, 2], [20, 0]]]]}
        country = CountryBoundary(shape)
        self.assertTrue(country.contains(1, 1))
        self.assertTrue(country.contains(1, 21))
        self.assertFalse(country.contains(5, 5))
        self.assertFalse(country.contains(1, 15))
        self.assertTrue(country.contains(0, 0))

    def test_every_excluded_record_is_preserved_and_has_no_renderable_point(self):
        directory = Path(__file__).resolve().parents[1] / "data" / "dghs"
        index = json.loads((directory / "index.json").read_text())
        review = json.loads((directory / "coordinate-review.json").read_text())
        by_id = {row["id"]: row for row in index["records"]}
        for row in review["records"]:
            record = by_id[row["id"]]
            self.assertEqual(record["coordinateStatus"], "outside")
            self.assertIsNone(record["lat"])
            self.assertIsNone(record["lon"])
            self.assertFalse(COUNTRY.contains(float(row["reportedLatitude"]), float(row["reportedLongitude"])))


if __name__ == "__main__":
    unittest.main()

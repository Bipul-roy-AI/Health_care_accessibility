"""Unit checks for scripts/build_travel.py (least-cost travel time and flood fractions)."""
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
try:
    import rasterio  # noqa: F401
    import skimage  # noqa: F401
    HAVE = True
except ImportError:  # optional geospatial stack
    HAVE = False


@unittest.skipUnless(HAVE, "rasterio and scikit-image are needed")
class Travel(unittest.TestCase):
    def test_uniform_speed_matches_distance(self):
        from build_travel import travel_minutes
        friction = np.full((21, 21), 0.002)                  # 0.002 min/m = 30 km/h
        minutes = travel_minutes(friction, [(10, 10)], 1000)
        self.assertAlmostEqual(minutes[10, 20], 10 * 1000 * 0.002, places=6)   # 10 km east: 20 min
        self.assertAlmostEqual(minutes[0, 10], 20.0, places=6)
        self.assertAlmostEqual(minutes[20, 20], 10 * 2 ** 0.5 * 2, places=4)  # diagonal

    def test_barrier_forces_detour_and_slow_cells_cost_more(self):
        from build_travel import travel_minutes
        friction = np.full((5, 5), 0.002)
        friction[:, 2] = np.nan                               # impassable column
        minutes = travel_minutes(friction, [(2, 0)], 1000)
        self.assertTrue(np.isinf(minutes[2, 4]))
        slow = np.full((1, 5), 0.002)
        slow[0, 2] = 0.04                                     # one wading cell
        t = travel_minutes(slow, [(0, 0)], 1000)[0, 4]
        self.assertAlmostEqual(t, 2 + (2 + 40) / 2 * 2 + 2, places=6)  # mean of neighbouring cell costs per step

    def test_no_open_facility_means_unreachable(self):
        from build_travel import travel_minutes
        self.assertTrue(np.isinf(travel_minutes(np.full((3, 3), 0.01), [], 1000)).all())

    def test_cells_and_flood_fraction(self):
        from rasterio.transform import from_origin
        from build_travel import area_flood_fraction, cells_of
        t = from_origin(0, 10000, 1000, 1000)
        r, c = cells_of(t, (10, 10), [500, 9500, 20000], [9500, 500, 500])
        self.assertEqual((list(r), list(c)), ([0, 9, -1], [0, 9, -1]))
        fine = np.zeros((50, 50), np.uint8)
        fine[:5, :5] = 1                                      # exactly one 1 km cell flooded (200 m pixels)
        fine[:5, 5:10] = 255                                  # the next cell not observed
        frac = area_flood_fraction(fine, from_origin(0, 10000, 200, 200), t, (10, 10))
        self.assertAlmostEqual(float(frac["flooded"][0, 0]), 1.0)
        self.assertAlmostEqual(float(frac["observed"][0, 1]), 0.0)
        self.assertAlmostEqual(float(frac["flooded"].sum()), 1.0, places=5)


if __name__ == "__main__":
    unittest.main()

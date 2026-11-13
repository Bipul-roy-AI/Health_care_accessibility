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
    def test_fill_water_bridges_rivers_and_estuary_only(self):
        from rasterio.transform import from_origin
        from build_travel import WATER_MIN_PER_M, fill_water
        # 1 km cells around Hatiya (about 91.1 E, 22.3 N): UTM 46N x 304 km, y 2467 km
        t = from_origin(295000, 2477000, 1000, 1000)
        band = np.full((20, 20), 0.003)
        band[:, 8:11] = np.nan                       # sea channel, outside the population grid
        band[2, 2] = np.nan                          # a river cell inside Bangladesh
        inside = ~np.isnan(band)
        inside[2, 2] = True
        out, water = fill_water(band, t, inside)
        self.assertTrue(water[2, 2] and water[5, 9])
        self.assertAlmostEqual(out[5, 9], WATER_MIN_PER_M)
        # the same channel far from the estuary (Thakurgaon, near India) stays impassable
        t_nw = from_origin(30000, 2893000, 1000, 1000)
        out_nw, water_nw = fill_water(band, t_nw, inside)
        self.assertTrue(water_nw[2, 2])
        self.assertFalse(water_nw[5, 9])
        self.assertTrue(np.isnan(out_nw[5, 9]))

    def test_snap_cells_moves_edge_points_to_valid_cells(self):
        from build_travel import snap_cells
        valid = np.ones((5, 5), bool)
        valid[:, 0] = False                                   # masked column (outside the boundary)
        valid[4, :] = False
        row, col = snap_cells(valid, [2, 4, 0, -1], [0, 2, 3, -1], max_cells=1)
        self.assertEqual((row[0], col[0]), (2, 1))            # snapped one cell east
        self.assertEqual((row[1], col[1]), (3, 2))            # snapped one cell north
        self.assertEqual((row[2], col[2]), (0, 3))            # already valid, unchanged
        self.assertEqual(row[3], -1)                          # outside the raster stays outside
        far = np.zeros((5, 5), bool)
        far[0, 0] = True
        r, c = snap_cells(far, [4], [4], max_cells=2)
        self.assertEqual((r[0], c[0]), (-1, -1))              # too far from any valid cell

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


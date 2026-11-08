"""Verify the frozen published baseline without needing private boundary uploads."""
from collections import Counter
import csv
import hashlib
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1] / 'data/accessibility/baseline'


def rows(name):
    with (ROOT / name).open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


class PublishedAvailabilityTests(unittest.TestCase):
    def test_complete_export_hashes_and_map_count(self):
        manifest = json.loads((ROOT / 'manifest.json').read_text())
        self.assertEqual(manifest['status'], 'COMPLETED')
        self.assertEqual(sum(len(v['maps']) for v in manifest['levels'].values()), 10)
        for filename, expected in manifest['output_sha256'].items():
            self.assertEqual(Path(filename).name, filename)
            self.assertEqual(hashlib.sha256((ROOT / filename).read_bytes()).hexdigest(), expected, filename)

    def test_facility_assignments_reconcile_to_every_area_and_national_total(self):
        national = {r['tier']: int(r['active']) for r in rows('national_availability.csv')}
        for level, features in [('division', 8), ('district', 64), ('upazila_thana', 544)]:
            summary = rows(level + '_availability.csv')
            assignments = rows(level + '_facility_assignments.csv')
            self.assertEqual(len({r['facility_id'] for r in assignments}), len(assignments))
            self.assertEqual(len(summary), features * 6)
            self.assertEqual(len({(r['pcode'], r['tier']) for r in summary}), len(summary))
            self.assertEqual(Counter(r['tier'] for r in assignments), national)
            name_counts = Counter((r['registry_pcode'], r['tier']) for r in assignments if r['registry_pcode'])
            point_counts = Counter((r['point_pcode'], r['tier']) for r in assignments if r['point_pcode'])
            for r in summary:
                self.assertEqual(int(r['active_listings_by_registry_name']), name_counts[(r['pcode'], r['tier'])])
                self.assertEqual(int(r['spatial_points_inside']), point_counts[(r['pcode'], r['tier'])])
                self.assertEqual(int(r['eligible_coordinates_by_registry_name']) + int(r['coordinates_unavailable_by_registry_name']), int(r['active_listings_by_registry_name']))
                if level == 'division':
                    self.assertGreater(int(r['bbs_population_2022']), 0)
                else:
                    self.assertEqual(r['bbs_population_2022'], '')
                    self.assertEqual(r['active_listings_per_100000_bbs_residents'], '')


if __name__ == '__main__':
    unittest.main()

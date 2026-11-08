"""Known zones distinguish registry counts, coordinate counts and population rates."""
from pathlib import Path
import sys
import unittest
import geopandas as gpd
from shapely.geometry import box
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from build_availability_baseline import summarize_level, name_lookup, name_key


def zones():
    return gpd.GeoDataFrame({'ADM1_EN': ['Barisal', 'Chittagong'], 'ADM1_PCODE': ['BD10', 'BD20'],
                            'ADM2_EN': ['Bogra', 'Comilla'], 'ADM2_PCODE': ['BD1001', 'BD2001'],
                            'ADM3_EN': ['Same name', 'Same name'], 'ADM3_PCODE': ['BD100101', 'BD200101']},
                           geometry=[box(90, 23, 91, 24), box(91, 23, 92, 24)], crs=4326)


def record(fid, division='Barishal', district='Bogura', lon=90.5):
    return {'id': fid, 'facility_type_name': 'Community Clinic', 'division_name': division,
            'district_name': district, 'upazila_name': 'Same name', 'lat': 23.5, 'lon': lon,
            'coordinateStatus': 'published' if lon is not None else 'missing'}


class AvailabilityTests(unittest.TestCase):
    def test_counts_reconcile_without_reassigning_registry_names(self):
        records = [record('a'), record('b', lon=None), record('c', lon=91.5),
                   record('d', division='Unknown', district='Unknown', lon=91.6),
                   record('e', division='Chattogram', district='Cumilla', lon=93), record('f', lon=91)]
        rows, qa, details = summarize_level(records, zones(), 1, {'barishal': 100000, 'chattogram': 200000})
        counts = {r['pcode']: r for r in rows if r['tier'] == 'community'}
        # Four recorded in A, despite only one eligible point uniquely inside A.
        self.assertEqual(counts['BD10']['active_listings_by_registry_name'], 4)
        self.assertEqual(counts['BD10']['spatial_points_inside'], 1)
        self.assertEqual(counts['BD10']['coordinate_availability_pct'], 75)
        self.assertEqual(counts['BD10']['active_listings_per_100000_bbs_residents'], 4)
        self.assertEqual(counts['BD20']['active_listings_per_100000_bbs_residents'], .5)
        self.assertEqual(counts['BD20']['spatial_points_inside'], 2)
        self.assertEqual(qa['community']['registry_unmatched_name'], 1)
        self.assertEqual(qa['community']['point_outside'], 1)
        self.assertEqual(qa['community']['point_ambiguous_border'], 1)
        self.assertEqual(qa['community']['name_point_disagreement'], 1)
        self.assertEqual(sum(r['spatial_points_inside'] for r in counts.values()), 3)
        self.assertEqual({r['facility_id']: r['point_pcode'] for r in details}['f'], '')

    def test_parent_keys_disambiguate_repeated_adm3_names_and_do_not_fuzzy_match(self):
        frame = zones()
        lookup = name_lookup(frame, 3)
        self.assertEqual(lookup[name_key(record('a'), 3, registry=True)], ['BD100101'])
        other = record('b', division='Chattogram', district='Cumilla')
        self.assertEqual(lookup[name_key(other, 3, registry=True)], ['BD200101'])
        other['upazila_name'] = 'Same name Sadar'
        self.assertNotIn(name_key(other, 3, registry=True), lookup)
        # An old district alias never renames an upazila with the same spelling.
        other['upazila_name'] = 'Nawabganj'
        self.assertEqual(name_key(other, 3, registry=True)[-1], 'nawabganj')

    def test_no_finer_population_rates_no_listing_completeness_and_missing_bbs_fail(self):
        rows, _, _ = summarize_level([record('a')], zones(), 2, {'barishal': 100000, 'chattogram': 200000})
        self.assertTrue(all(r['bbs_population_2022'] is None for r in rows))
        self.assertTrue(all(r['active_listings_per_100000_bbs_residents'] is None for r in rows))
        empty = next(r for r in rows if r['pcode'] == 'BD2001' and r['tier'] == 'community')
        self.assertIsNone(empty['coordinate_availability_pct'])
        with self.assertRaisesRegex(ValueError, 'BBS population'):
            summarize_level([], zones(), 1, {'barishal': 100000})

    def test_ambiguous_names_not_allocated_and_duplicate_boundary_codes_rejected(self):
        frame = zones()
        frame.loc[1, ['ADM1_EN', 'ADM2_EN', 'ADM3_EN']] = frame.loc[0, ['ADM1_EN', 'ADM2_EN', 'ADM3_EN']].values
        rows, qa, _ = summarize_level([record('a')], frame, 3)
        self.assertEqual(qa['community']['registry_ambiguous_name'], 1)
        self.assertEqual(sum(r['active_listings_by_registry_name'] for r in rows), 0)
        frame.loc[1, 'ADM3_PCODE'] = frame.loc[0, 'ADM3_PCODE']
        with self.assertRaisesRegex(ValueError, 'unique'):
            summarize_level([], frame, 3)


if __name__ == '__main__':
    unittest.main()

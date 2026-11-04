import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('stats', ROOT/'scripts/build_statistics.py')
stats = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stats)

class StatisticsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources = json.loads((ROOT/'data/statistics/sources.json').read_text())
        cls.summary = json.loads((ROOT/'data/statistics/summary.json').read_text())

    def test_ownership_is_not_guessed(self):
        row = {'facility_type_name':'District/General Hospital', 'name':'Government hospital'}
        self.assertTrue(stats.matches(row, 'hospitals'))
        self.assertFalse(stats.matches(row, 'publicHospitals'))
        self.assertEqual(stats.ownership(row), 'Not reported')
        row['facility_ownership_name'] = 'Fully Government-owned'
        self.assertTrue(stats.matches(row, 'publicHospitals'))
        row['facility_type_name'] = 'Civil Surgeon Office'
        self.assertFalse(stats.matches(row, 'publicHospitals'))

    def test_private_type_and_ownership_are_separate(self):
        row = {'facility_type_name':'Private Hospital / Clinic'}
        self.assertTrue(stats.matches(row, 'privateClinics'))
        self.assertEqual(stats.ownership(row), 'Not reported')
        self.assertFalse(stats.matches(row, 'bloodBanks'))

    def test_totals_reconcile(self):
        self.assertEqual(sum(self.sources['population']['divisions'].values()), self.summary['populationTotal'])
        for group in self.summary['groups'].values():
            total = group['national']['count']
            self.assertEqual(sum(r['count'] for r in group['divisions'].values()), total)
            self.assertEqual(sum(r['count'] for r in group['districts']), total)
            self.assertEqual(sum(group['national']['ownership'].values()), total)
            self.assertEqual(sum(group['national']['types'].values()), total)

    def fixture(self):
        return {'records':[{'id':'1','is_active':'1','division_name':'Dhaka','facility_type_name':'Blood Bank'}, {'id':'2','is_active':'0','division_name':'Dhaka'}, {'id':'3','is_active':'unknown','division_name':'Dhaka'}], 'count':3,'generatedAt':'2026-11-04','sourceUrl':'https://example.test'}

    def test_active_only_and_empty_groups(self):
        result = stats.build(self.fixture(),self.sources,'test')
        self.assertEqual((result['activeTotal'],result['inactiveTotal'],result['unknownStatusTotal']),(1,1,1))
        self.assertEqual(result['groups']['bloodBanks']['national']['count'],1)
        self.assertEqual(result['groups']['hospitals']['national']['count'],0)

    def test_invalid_data_fails(self):
        for mutation in ('duplicate','division','population'):
            index = self.fixture(); sources = copy.deepcopy(self.sources)
            if mutation == 'duplicate': index['records'][1]['id'] = '1'
            if mutation == 'division': index['records'][0]['division_name'] = 'Unknown'
            if mutation == 'population': sources['population']['divisions']['Dhaka'] = 0
            with self.assertRaises(ValueError): stats.build(index,sources,'test')

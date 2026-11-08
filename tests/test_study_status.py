"""Input presence must not become a claim that a study has been executed."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from prepare_study_status import assess


class StudyStatusTests(unittest.TestCase):
    def fixture(self, root):
        (root / 'data/accessibility').mkdir(parents=True)
        (root / 'data/accessibility/boundaries.json').write_text(json.dumps({'levels': [{'level': 'district', 'features': 64}], 'union': {'status': 'MISSING'}}))
        config = {'travel_mode': 'motorised', 'threshold_minutes': [30, 60, 120], 'friction': 'friction.tif', 'population': 'population.tif', 'capacity_csv': 'capacity.csv', 'candidate_csv': 'sites.csv', 'provenance': {}}
        path = root / 'config.json'; path.write_text(json.dumps(config)); return config, path

    def test_missing_inputs_and_explicit_unrun_accessmod_status(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); _, path = self.fixture(root); result = assess(path, root)
            self.assertEqual(result['threshold_minutes'], [30, 60, 120])
            self.assertEqual(result['accessmod5_execution'], 'NOT_RUN')
            self.assertEqual(len(result['analyses']), 5)
            modules = {r['id']: r for r in result['analyses']}
            self.assertEqual(modules['referral']['missing_inputs'], ['friction'])
            self.assertEqual(modules['zonal']['missing_inputs'], ['friction', 'population'])
            self.assertTrue(all(r['status'] == 'NOT_RUN' for r in result['analyses']))

    def test_files_alone_and_wrong_population_publisher_are_not_approved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); config, path = self.fixture(root)
            for name in ['friction.tif', 'population.tif', 'capacity.csv', 'sites.csv']:
                (root / name).write_text('FICTIONAL PRESENCE ONLY; NOT A VALID ANALYSIS INPUT')
            result = assess(path, root)
            self.assertFalse(any(v['ready'] for v in result['input_checks'].values()))
            config['provenance'] = {key: {'publisher': 'DGHS', 'source_url': 'https://example.invalid/test', 'date': 'TEST', 'approved': True} for key in ['friction', 'population', 'capacity', 'candidates']}
            path.write_text(json.dumps(config)); result = assess(path, root)
            self.assertFalse(result['input_checks']['population']['ready'])
            self.assertFalse(result['input_checks']['capacity']['ready'])
            self.assertFalse(result['input_checks']['candidates']['ready'])
            config['provenance']['population']['publisher'] = 'BBS'; config['service_period'] = 'TEST'; config['new_site_budget'] = 1
            path.write_text(json.dumps(config)); result = assess(path, root)
            self.assertTrue(all(v['ready'] for v in result['input_checks'].values()))
            self.assertTrue(all(r['status'] == 'NOT_RUN' for r in result['analyses']))


if __name__ == '__main__':
    unittest.main()

"""Check actual study inputs and publish readiness, never synthetic study results."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def assess(config_path, root=ROOT):
    config_path = Path(config_path).resolve()
    config = json.loads(config_path.read_text(encoding='utf-8'))
    catalog = json.loads((root / 'data/accessibility/boundaries.json').read_text(encoding='utf-8'))
    def raster_input(key, label):
        value = config.get(key)
        exists = bool(value and (config_path.parent / value).is_file())
        meta = config.get('provenance', {}).get(key, {})
        reviewed = meta.get('approved') is True and all(meta.get(k) for k in ['publisher', 'date', 'source_url'])
        if key == 'population':
            reviewed = reviewed and meta.get('publisher') == 'BBS'
        if key == 'capacity':
            reviewed = reviewed and meta.get('publisher') == 'DGHS'
        return {'label': label, 'file_present': exists, 'provenance_approved': reviewed,
                'ready': exists and reviewed, 'note': 'File presence and provenance approval are necessary; grid/model validation still required.'}
    inputs = {
        'friction': raster_input('friction', 'Motorised travel-cost grid and documented transport assumptions'),
        'population': raster_input('population', 'BBS spatial population counts aligned to the analysis grid'),
        'capacity': raster_input('capacity', 'DGHS service capacity in persons per declared period'),
        'candidates': raster_input('candidates', 'Feasible candidate sites, proposed capacity and site budget')}
    # Configuration field names differ from the provenance keys.
    for key, field in [('capacity', 'capacity_csv'), ('candidates', 'candidate_csv')]:
        value = config.get(field)
        inputs[key]['file_present'] = bool(value and (config_path.parent / value).is_file())
        inputs[key]['ready'] = inputs[key]['file_present'] and inputs[key]['provenance_approved']
    if not config.get('service_period'):
        inputs['capacity']['ready'] = False
    if not isinstance(config.get('new_site_budget'), int) or config['new_site_budget'] <= 0:
        inputs['candidates']['ready'] = False
    definitions = [
        ('accessibility', 'Travel-time accessibility', ['friction'],
         'Time to the nearest facility; facilities reachable within each threshold, separately by DGHS tier.',
         'Travel-time map, threshold maps, travel-time distribution, facility-option counts and tables.'),
        ('capacity', 'Capacity-constrained geographic coverage', ['friction', 'population', 'capacity'],
         'People allocated service capacity, and physically accessible people left unserved.',
         'Served/unserved maps, capacity-allocation chart and facility/population tables.'),
        ('referral', 'Referral analysis', ['friction'],
         'Travel time and distance between selected facility tiers along modelled routes.',
         'Referral-route maps, time/distance distributions and origin–destination tables.'),
        ('zonal', 'Population coverage by administrative area', ['friction', 'population'],
         'Percentage of BBS population within 30, 60 and 120 minutes in each available administrative area.',
         'Population-coverage choropleths, threshold comparison charts and zonal tables.'),
        ('scaling_up', 'New-facility location optimisation', ['friction', 'population', 'capacity', 'candidates'],
         'Choose sites that maximise additional population served within the declared candidate set and budget.',
         'Selected-site maps, additional-people-served charts, scenarios and solver optimality status.')]
    analyses = []
    for key, label, requires, question, outputs in definitions:
        missing = [name for name in requires if not inputs[name]['ready']]
        analyses.append({'id': key, 'label': label, 'status': 'NOT_RUN', 'required_inputs': requires,
                         'missing_inputs': missing, 'question': question, 'outputs': outputs,
                         'note': 'Input readiness does not certify an analysis run. No AccessMod 5 or Bangladesh model result exists for this module.'})
    return {'checked_at': datetime.now(timezone.utc).isoformat(),
            'travel_mode': config['travel_mode'], 'threshold_minutes': config['threshold_minutes'],
            'health_source': 'DGHS', 'population_source': 'BBS', 'support_policy': 'Approved open/OSM transport support',
            'accessmod5_execution': 'NOT_RUN', 'python_model': 'Tested pilot; not a validated Bangladesh motorised-routing model or AccessMod 5 equivalent',
            'input_checks': inputs, 'analyses': analyses,
            'boundaries': {'available': [{'level': r['level'], 'features': r['features']} for r in catalog['levels']],
                           'union': catalog['union'], 'note': 'The file called Bd_union.zip contains ADM3 upazila/thana areas. ADM4 union results are not available.'},
            'facility_coordinates_note': 'DGHS location gaps and name–point disagreements require review before policy use. A point location does not establish a usable road entrance.',
            'travel_validation_needed': ['Road speeds and sensitivity scenarios', 'Water barriers, bridges and operating ferries', 'Network connectivity and grade-separated crossings', 'Facility access points', 'Comparison with observed motorised journey times'],
            'population_note': 'Division totals cannot establish population covered at travel-time thresholds; no uniform population distribution is assumed.'}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--config', type=Path, default=ROOT / 'analysis-config.example.json')
    p.add_argument('--output', type=Path)
    a = p.parse_args()
    text = json.dumps(assess(a.config), ensure_ascii=False, indent=2) + '\n'
    if a.output:
        a.output.parent.mkdir(parents=True, exist_ok=True)
        a.output.write_text(text, encoding='utf-8')
    else:
        print(text, end='')


if __name__ == '__main__':
    main()

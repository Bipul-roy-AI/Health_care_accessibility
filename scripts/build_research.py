"""Build the hospital research snapshot from existing DGHS/BBS inputs.

No invented population, inferred service capability, or live browser API calls.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path
from build_statistics import HOSPITAL_TYPES, ownership
from country_boundary import COUNTRY

ROOT = Path(__file__).resolve().parents[1]
ALIASES = {'barisal':'barishal','chittagong':'chattogram','bogra':'bogura','comilla':'cumilla','jessore':'jashore','brahamanbaria':'brahmanbaria','jhalokati':'jhalokathi','khagrachhari':'khagrachari','nawabganj':'chapainawabganj'}
def key(s):
    s = ''.join(c for c in (s or '').casefold() if c.isalnum())
    return ALIASES.get(s, s)
def build():
    raw=(ROOT/'data/dghs/index.json').read_bytes(); index=json.loads(raw)
    sources=json.loads((ROOT/'data/statistics/sources.json').read_text())
    division_rows=list(csv.DictReader((ROOT/'data/accessibility/baseline/division_availability.csv').open(encoding='utf-8-sig')))
    canonical_divisions={key(name):name for name in sources['population']['divisions']}
    divisions={r['pcode']:canonical_divisions[key(r['area_name'])] for r in division_rows}
    district_rows=list(csv.DictReader((ROOT/'data/accessibility/baseline/district_availability.csv').open(encoding='utf-8-sig')))
    districts={key(r['area_name']):{'name':r['area_name'],'division':divisions[r['ADM1_PCODE']],'pcode':r['pcode']} for r in district_rows}
    geometry=json.loads((ROOT/'data/research/districts.geojson').read_text())
    if len(geometry['features'])!=64 or len(districts)!=64: raise ValueError('Expected 64 distinct districts')
    mapped_keys=[key(f['properties']['shapeName']) for f in geometry['features']]
    if len(set(mapped_keys))!=64 or set(mapped_keys)!=set(districts): raise ValueError('District boundary/name crosswalk is not one-to-one')
    records=[]
    for r in index['records']:
        if str(r.get('is_active','')).strip()!='1' or r.get('facility_type_name') not in HOSPITAL_TYPES: continue
        d=districts.get(key(r.get('district_name')))
        # Reject contradictory division/district labels, without silently repairing them.
        joined=bool(d and key(d['division'])==key(r.get('division_name')))
        lat,lon=r.get('lat'),r.get('lon')
        eligible=r.get('coordinateStatus')=='published' and isinstance(lat,(int,float)) and isinstance(lon,(int,float)) and COUNTRY.contains(lat,lon)
        records.append({'id':str(r['id']),'name':r['name'],'type':r['facility_type_name'],
            'agency':r.get('facility_agency_name') or 'Not reported','ownership':ownership(r),
            'division':r.get('division_name') or 'Not reported','district':r.get('district_name') or 'Not reported',
            'districtKey':key(r.get('district_name')) if joined else None,
            'coordinateStatus':r.get('coordinateStatus') if not eligible else 'published',
            'lat':lat if eligible else None,'lon':lon if eligible else None})
    if len(set(r['id'] for r in records))!=len(records): raise ValueError('Duplicate facility IDs')
    return {'schemaVersion':1,'methodVersion':'1.0.0','datasetUpdatedAt':index['generatedAt'],
        'reportExportedAt':index.get('reportExportedAt'),'indexSHA256':hashlib.sha256(raw).hexdigest(),
        'boundarySHA256':hashlib.sha256((ROOT/'data/research/districts.geojson').read_bytes()).hexdigest(),
        'populationSource':sources,'hospitalTypes':sorted(HOSPITAL_TYPES),'districts':districts,'records':records}

def main():
    p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args()
    result=build();text=json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n'
    dest=ROOT/'data/research/hospitals.json'
    if args.check:
        if not dest.exists() or dest.read_text()!=text: raise SystemExit('Research snapshot stale; run scripts/build_research.py')
    else:dest.write_text(text)
    print(f"Research snapshot: {len(result['records'])} active hospital listings; 64 audited district joins.")
if __name__=='__main__':main()

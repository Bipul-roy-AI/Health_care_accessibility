"""Rebuild compact, auditable statistics using only DGHS records and BBS tables.

No name-based guesses, coordinate relocation, third-party population or live API.
"""
from pathlib import Path
from collections import Counter
import argparse
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = {'Fully Government-owned','Government-Autonomous','Government-Semi-auonomous'}
COMMERCIAL = {'Non-Government(Private Commercial)','Non-Government(Private personal occupational business)'}
HOSPITAL_TYPES = {
    '10-bed Hospital','20-bed Hospital','25-bed Hospital','30-bed Hospital','31-bed Hospital','50-bed Hospital',
    'Chest Disease Hospital','City Corporation / Municipality Hospital','Combined Military Hospital',
    'Dental College Hospital','District/General Hospital','General Hospital (Non District Hospital)',
    'Hospital of Alternative Medicine','Infectious Disease Hospital','Jail Hospital','Leprosy Hospital',
    'Medical College Hospital','NGO Hospital/Clinic','Other Hospital','Postgraduate Institute & Hospital',
    'Private Hospital / Clinic','Special Purpose Hospital','Specialized Hospital','Trauma Center','Upazila Health Complex'
}
GROUPS = {
 'hospitals':{'label':'Hospitals / health complexes','definition':'Explicit hospital-type list, including private/NGO hospital-clinics, upazila health complexes and trauma centres. Not all registry institutions.'},
 'publicHospitals':{'label':'Government-owned hospital listings','definition':'Hospital-type list AND explicit fully government, autonomous or semi-autonomous ownership. Missing ownership is never assumed government; not restricted to DGHS-run facilities.'},
 'privateClinics':{'label':'Private hospital / clinic listings','definition':'Exact DGHS facility type: Private Hospital / Clinic. Includes records whose separate ownership field is missing.'},
 'bloodBanks':{'label':'Blood-bank listings','definition':'Exact DGHS facility type: Blood Bank. Counts registry entries, not available blood units, donor stock or all hospital transfusion services.'},
 'diagnostics':{'label':'Diagnostic-centre listings','definition':'Exact DGHS facility type: Consultancy & Diagnostic Center.'},
 'communityClinics':{'label':'Community-clinic listings','definition':'Exact DGHS facility type: Community Clinic.'},
 'all':{'label':'All registry institutions','definition':'Includes administrative offices, training institutes and other non-treatment institutions. Do not interpret this as a hospital count.'},
}

def ownership(row):
    value = row.get('facility_ownership_name','').strip()
    if value in PUBLIC: return 'Government / autonomous'
    if value in COMMERCIAL: return 'Private commercial / personal'
    if value == 'Non-Government(NGO)': return 'NGO'
    if value: return 'Other stated ownership'
    return 'Not reported'

def matches(row,key):
    kind = row.get('facility_type_name','')
    if key == 'all': return True
    if key == 'hospitals': return kind in HOSPITAL_TYPES
    if key == 'publicHospitals': return kind in HOSPITAL_TYPES and row.get('facility_ownership_name') in PUBLIC
    return kind == {'privateClinics':'Private Hospital / Clinic','bloodBanks':'Blood Bank','diagnostics':'Consultancy & Diagnostic Center','communityClinics':'Community Clinic'}[key]

def summarize(rows):
    return {'count':len(rows),
            'ownership':dict(sorted(Counter(ownership(r) for r in rows).items())),
            'types':dict(sorted(Counter(r.get('facility_type_name') or 'Not reported' for r in rows).items()))}

def build(index,sources,index_sha):
    rows = index['records']
    if len({r['id'] for r in rows}) != len(rows): raise ValueError('Duplicate institution IDs')
    if index['count'] != len(rows): raise ValueError('Count mismatch')
    # Unknown active flags are excluded explicitly, never coerced to active.
    active = [r for r in rows if str(r.get('is_active','')).strip() == '1']
    pop = sources['population']['divisions']
    if len(pop) != 8 or any(type(n) is not int or n <= 0 for n in pop.values()): raise ValueError('Invalid population table')
    # Fail on changed administrative divisions: do not silently lose the denominator.
    unknown = sorted({r.get('division_name') for r in active if r.get('division_name') not in pop})
    if unknown: raise ValueError(f'Unmatched DGHS divisions: {unknown}')
    result={'schemaVersion':1,'methodVersion':'1.0.0','indexSHA256':index_sha,
      'reportExportedAt':index.get('reportExportedAt',index['generatedAt']),
      'datasetUpdatedAt':index['generatedAt'],
      'recordUpdateRange':{'first':min(r.get('retrievedAt',index['generatedAt']) for r in rows),'last':max(r.get('retrievedAt',index['generatedAt']) for r in rows)},
      'sourceUrl':index['sourceUrl'],'registryTotal':len(rows),'activeTotal':len(active),
      'inactiveTotal':sum(str(r.get('is_active',''))=='0' for r in rows),
      'unknownStatusTotal':sum(str(r.get('is_active','')) not in ('0','1') for r in rows),
      'populationTotal':sum(pop.values()),'hospitalTypes':sorted(HOSPITAL_TYPES),
      'governmentOwnershipValues':sorted(PUBLIC),'groups':{}}
    for key,definition in GROUPS.items():
        selected=[r for r in active if matches(r,key)]
        districts=[]
        for division,district in sorted({(r.get('division_name'),r.get('district_name') or 'Not reported') for r in active}):
            subset=[r for r in selected if r.get('division_name')==division and (r.get('district_name') or 'Not reported')==district]
            districts.append({'division':division,'district':district,**summarize(subset)})
        result['groups'][key]={**definition,'national':summarize(selected),
            'divisions':{name:{'population':n,**summarize([r for r in selected if r.get('division_name')==name])} for name,n in pop.items()},
            'districts':districts}
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true',help='Fail if committed summary is out of date')
    args=parser.parse_args()
    raw=(ROOT/'data/dghs/index.json').read_bytes()
    sources=json.loads((ROOT/'data/statistics/sources.json').read_text())
    content=json.dumps(build(json.loads(raw),sources,hashlib.sha256(raw).hexdigest()),ensure_ascii=False,separators=(',',':'))+'\n'
    output=ROOT/'data/statistics/summary.json'
    if args.check:
        if not output.exists() or output.read_text()!=content: raise SystemExit('Statistics are stale: run python3 scripts/build_statistics.py')
    else: output.write_text(content)
    print('Statistics match DGHS snapshot and BBS population table.' if args.check else f'Wrote {output.name} ({len(content):,} characters).')

if __name__=='__main__': main()

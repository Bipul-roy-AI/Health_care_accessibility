"""DGHS classification and strict geospatial input validation; never downloads data."""
from collections import Counter
import csv
import hashlib
import json
from pathlib import Path
import math
from urllib.parse import urlsplit

TIERS={
 'community':{'Community Clinic'},
 'union':{'Union Health Sub Center','Union Health Center','Union Health & Family Welfare Center (UH&FWC)'},
 'upazila':{'Upazila Health Complex'},
 'urban_primary':{'Urban Primary Health Care Center'},
 'secondary':{'District/General Hospital'},
 'tertiary':{'Medical College Hospital','Specialized Hospital','Postgraduate Institute & Hospital'},
}


def load_index(path):
    data=json.loads(Path(path).read_text(encoding='utf-8'))
    records=data['records']
    if data['source']!='DGHS facility registry':raise ValueError('Health facilities must come from the DGHS registry snapshot')
    if len({str(r['id']) for r in records})!=len(records):raise ValueError('Duplicate DGHS institution ID')
    if len(records)!=data['count']:raise ValueError('DGHS count mismatch')
    return data


def valid_point(row):
    try:lat,lon=float(row['lat']),float(row['lon'])
    except (KeyError,ValueError,TypeError):return False
    # Retain the repository's existing published-coordinate eligibility rule.
    # This is not fresh location/entrance verification or a new polygon boundary.
    return row.get('coordinateStatus')=='published' and math.isfinite(lat) and math.isfinite(lon) and -90<=lat<=90 and -180<=lon<=180


def audit(index):
    rows=index['records'];active=[r for r in rows if str(r.get('is_active'))=='1']
    tiers={}
    for name,kinds in TIERS.items():
        selected=[r for r in active if r.get('facility_type_name') in kinds]
        divisions={}
        for row in selected:
            div=row.get('division_name') or 'Not reported'
            bucket=divisions.setdefault(div,{'active':0,'usable_coordinates':0})
            bucket['active']+=1;bucket['usable_coordinates']+=int(valid_point(row))
        tiers[name]={'types':sorted(kinds),'active':len(selected),'usable_coordinates':sum(valid_point(r) for r in selected),'divisions':divisions}
    return {'source':'DGHS facility registry','report_exported_at':index.get('reportExportedAt'),'snapshot_updated_at':index.get('generatedAt'),
            'registry_records':len(rows),'active_records':len(active),'tiers':tiers,
            'analysis_status':{'travel_time':'requires approved friction grid','population_coverage':'requires aligned population counts raster','capacity_coverage':'requires DGHS persons-per-period capacity, not bed counts','referral':'requires travel grid and an explicit referral type pairing','zonal_percentages':'requires population raster and administrative polygons','new_sites':'requires feasible candidate locations, capacity and site budget'},
            'coordinate_note':'Published-coordinate flags inherit the existing repository national-boundary QA; they do not prove entrances or correct buildings. Missing, invalid and withheld coordinates are not relocated.',
            'population_note':'No population-access percentage has been computed from registry counts.'}


def select_facilities(index,tiers):
    if not tiers or set(tiers)-set(TIERS):raise ValueError('Select explicit known DGHS tiers')
    kinds=set().union(*(TIERS[t] for t in tiers))
    return [r for r in index['records'] if str(r.get('is_active'))=='1' and r.get('facility_type_name') in kinds and valid_point(r)]


def read_capacity(path,facility_ids,period):
    with Path(path).open(encoding='utf-8-sig',newline='') as handle:
        rows=list(csv.DictReader(handle))
    by_id={}
    for row in rows:
        key=row['facility_id'].strip()
        if key in by_id:raise ValueError('Duplicate capacity facility ID: '+key)
        if row.get('unit')!='persons_per_period' or row.get('period')!=period:
            raise ValueError('Capacity must be persons_per_period for the declared population/service period')
        host=urlsplit(row.get('source_url','')).hostname or ''
        if not row.get('source_url','').startswith('https://') or not (host=='dghs.gov.bd' or host.endswith('.dghs.gov.bd') or host=='hris.mohfw.gov.bd') or not row.get('source_field'):
            raise ValueError('DGHS capacity needs a source URL and the original service-capacity field')
        if 'bed' in row['source_field'].lower():raise ValueError('Bed fields are not primary-care service capacity')
        value=float(row['capacity'])
        if not math.isfinite(value) or value<0:raise ValueError('Invalid capacity; do not fill unknown values with zero')
        by_id[key]=value
    missing=set(map(str,facility_ids))-set(by_id)
    if missing:raise ValueError(f'{len(missing)} selected facilities lack capacity; no bed-based substitution is allowed')
    return [by_id[str(key)] for key in facility_ids]


def check_provenance(config):
    """Explicit source declarations are necessary but not proof of authenticity."""
    if config.get('health_source')!='DGHS':raise ValueError('Facility/health source must be DGHS')
    if config.get('source_policy') not in ('DGHS_only','DGHS_health_with_approved_support'):raise ValueError('Choose the source policy explicitly')
    required=['population','friction']
    if config.get('zones'):required.append('zones')
    if config.get('capacity_csv'):required.append('capacity')
    if config.get('candidate_csv'):required.append('candidates')
    for key in required:
        meta=config.get('provenance',{}).get(key,{})
        if meta.get('approved') is not True or not meta.get('publisher') or not meta.get('source_url') or not meta.get('date'):
            raise ValueError(f'Input {key} needs reviewed publisher, date, source URL and explicit approval')
        if config['source_policy']=='DGHS_only' and meta['publisher']!='DGHS':raise ValueError(f'{key} is not declared DGHS-sourced')
        if key=='capacity' and meta['publisher']!='DGHS':raise ValueError('Capacity must be DGHS-sourced')


def sha256(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

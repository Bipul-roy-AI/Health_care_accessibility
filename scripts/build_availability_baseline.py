"""DGHS facility availability and coordinate QA; never estimates population access."""
import argparse
from collections import Counter, defaultdict
import csv
from datetime import datetime, timezone
import importlib.metadata
import json
from pathlib import Path
import re
import unicodedata

import geopandas as gpd
from accessibility.inputs import TIERS, load_index, valid_point, sha256

ROOT = Path(__file__).resolve().parents[1]
LEVELS = {'division': 1, 'district': 2, 'upazila_thana': 3}
LABELS = {'community': 'Community clinics', 'union': 'Union-level facilities',
          'upazila': 'Upazila health complexes', 'urban_primary': 'Urban primary care',
          'secondary': 'District/general hospitals', 'tertiary': 'Tertiary facilities'}
# Explicit historical district/division spellings; no fuzzy matching or ADM3 aliases.
ALIASES = {'barisal': 'barishal', 'chittagong': 'chattogram', 'bogra': 'bogura',
           'comilla': 'cumilla', 'jessore': 'jashore', 'brahamanbaria': 'brahmanbaria',
           'jhalokati': 'jhalokathi', 'khagrachhari': 'khagrachari', 'nawabganj': 'chapainawabganj'}


def normalized(value, level):
    value = unicodedata.normalize('NFKC', str(value or '')).casefold()
    value = re.sub(r'[^\w]+', '', value, flags=re.UNICODE)
    return ALIASES.get(value, value) if level < 3 else value


def name_key(row, level, registry=False):
    fields = ['division_name', 'district_name', 'upazila_name'] if registry else ['ADM1_EN', 'ADM2_EN', 'ADM3_EN']
    return tuple(normalized(row.get(fields[n - 1]), n) for n in range(1, level + 1))


def name_lookup(frame, level):
    result = defaultdict(list)
    for row in frame.to_dict('records'):
        result[name_key(row, level)].append(row[f'ADM{level}_PCODE'])
    return result


def point_assignments(records, frame, id_field):
    """A point on a shared border is ambiguous, never counted in both polygons."""
    eligible = [r for r in records if valid_point(r)]
    if not eligible:
        return {}, {}
    points = gpd.GeoDataFrame({'facility_id': [str(r['id']) for r in eligible]},
                             geometry=gpd.points_from_xy([float(r['lon']) for r in eligible],
                                                        [float(r['lat']) for r in eligible]), crs=4326)
    joined = gpd.sjoin(points.to_crs(frame.crs), frame[[id_field, 'geometry']], how='left', predicate='intersects')
    by_id = joined.groupby('facility_id')[id_field].agg(lambda s: sorted(set(s.dropna())))
    assigned, status = {}, {}
    for facility_id, codes in by_id.items():
        status[facility_id] = 'assigned' if len(codes) == 1 else 'outside' if not codes else 'ambiguous_border'
        if len(codes) == 1:
            assigned[facility_id] = codes[0]
    return assigned, status


def summarize_level(records, frame, level, populations=None):
    id_field = f'ADM{level}_PCODE'
    if frame[id_field].isna().any() or not frame[id_field].is_unique:
        raise ValueError('Boundary IDs must be nonempty and unique')
    if frame.crs is None or frame.empty or not frame.geometry.is_valid.all() or frame.geometry.is_empty.any():
        raise ValueError('Boundaries need valid nonempty geometries and a CRS')
    lookup = name_lookup(frame, level)
    spatial, point_status = point_assignments(records, frame, id_field)
    type_tier = {kind: tier for tier, kinds in TIERS.items() for kind in kinds}
    buckets = defaultdict(Counter)
    qa = {tier: Counter() for tier in TIERS}
    details = []
    for record in records:
        tier = type_tier[record['facility_type_name']]
        fid = str(record['id'])
        codes = lookup.get(name_key(record, level, registry=True), [])
        reported = codes[0] if len(codes) == 1 else ''
        match_status = 'matched' if reported else 'ambiguous_name' if codes else 'unmatched_name'
        eligible = valid_point(record)
        located = spatial.get(fid, '')
        status = point_status.get(fid, 'ineligible_coordinates')
        qa[tier]['active'] += 1
        qa[tier]['registry_' + match_status] += 1
        qa[tier]['point_' + status] += 1
        disagree = bool(reported and located and reported != located)
        qa[tier]['name_point_disagreement'] += int(disagree)
        if reported:
            buckets[(reported, tier)]['active_listings_by_registry_name'] += 1
            buckets[(reported, tier)]['eligible_coordinates_by_registry_name'] += int(eligible)
        if located:
            buckets[(located, tier)]['spatial_points_inside'] += 1
        details.append({'facility_id': fid, 'tier': tier, 'division_name': record.get('division_name') or '',
                        'district_name': record.get('district_name') or '', 'upazila_name': record.get('upazila_name') or '',
                        'registry_join_status': match_status, 'registry_pcode': reported,
                        'coordinate_status': record.get('coordinateStatus') or '', 'point_assignment_status': status,
                        'point_pcode': located, 'name_point_disagreement': int(disagree)})
    rows = []
    for area in frame.sort_values(id_field).to_dict('records'):
        pcode = area[id_field]
        population_name = normalized(area['ADM1_EN'], 1)
        pop = populations.get(population_name) if populations is not None and level == 1 else None
        if populations is not None and level == 1 and (pop is None or pop <= 0):
            raise ValueError('Missing/nonpositive BBS population for division ' + area['ADM1_EN'])
        for tier in TIERS:
            values = buckets[(pcode, tier)]
            active = values['active_listings_by_registry_name']
            eligible = values['eligible_coordinates_by_registry_name']
            row = {'pcode': pcode, 'area_name': area[f'ADM{level}_EN'], 'tier': tier,
                   **{f'ADM{n}_PCODE': area[f'ADM{n}_PCODE'] for n in range(1, level + 1)},
                   'active_listings_by_registry_name': active, 'eligible_coordinates_by_registry_name': eligible,
                   'coordinates_unavailable_by_registry_name': active - eligible,
                   'coordinate_availability_pct': round(100 * eligible / active, 4) if active else None,
                   'spatial_points_inside': values['spatial_points_inside'],
                   'bbs_population_2022': pop,
                   'active_listings_per_100000_bbs_residents': round(100000 * active / pop, 6) if pop else None}
            rows.append(row)
    return rows, qa, details


def write_csv(path, rows, fields=None):
    with path.open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fields or list(rows[0]), lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)


def plot_panels(frame, rows, level_name, metric, destination, source_label):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.colors import Normalize
    from matplotlib.cm import ScalarMappable
    from matplotlib.patches import Patch
    titles = {'active_listings_by_registry_name': 'Active listings joined by recorded administrative names',
              'coordinate_availability_pct': 'Published-coordinate availability among name-joined listings (%)',
              'spatial_points_inside': 'Eligible DGHS points inside supplied polygons',
              'active_listings_per_100000_bbs_residents': 'Active listings per 100,000 BBS 2022 residents'}
    # Simplification is only for rendering, never point-in-polygon assignments or counts.
    display = frame.to_crs(32646).copy()
    display.geometry = display.geometry.simplify(100, preserve_topology=True)
    id_field = f'ADM{LEVELS[level_name]}_PCODE'
    fig, axes = plt.subplots(2, 3, figsize=(13, 11))
    for ax, tier in zip(axes.flat, TIERS):
        data = {row['pcode']: row[metric] for row in rows if row['tier'] == tier}
        values = display[id_field].map(data).astype(float)
        vmax = 100 if metric == 'coordinate_availability_pct' else values.max()
        if not vmax > 0:
            vmax = 1
        norm = Normalize(vmin=0, vmax=vmax)
        display.assign(value=values).plot(ax=ax, column='value', cmap='viridis', norm=norm,
                                         edgecolor='#b9c2c3', linewidth=.18, missing_kwds={'color': '#ddd'})
        fig.colorbar(ScalarMappable(norm=norm, cmap='viridis'), ax=ax, shrink=.65, pad=.02)
        ax.set_title(LABELS[tier], fontsize=11)
        ax.set_axis_off()
    fig.suptitle(f'Bangladesh · {level_name.replace("_", "/")}\n{titles[metric]}', fontsize=15)
    note = 'Tier-specific colour scales; compare areas within a panel.'
    if metric == 'coordinate_availability_pct':
        note = 'Shared 0–100% scale. Grey: no name-joined active listings; not a population-coverage percentage.'
        axes.flat[0].legend(handles=[Patch(facecolor='#ddd', label='No name-joined listings')], loc='lower left', fontsize=7)
    fig.text(.5, .04, f'{source_label}\nBBS supplied boundaries: geometry 2015; validOn 2020-11-13. Display simplified to 100 m.\n{note}\nMissing locations/name joins and name–point disagreement are reported in QA; no travel or capacity inference.',
             ha='center', fontsize=8)
    fig.tight_layout(rect=[0, .13, 1, .93])
    fig.savefig(destination, dpi=160, bbox_inches='tight')
    plt.close(fig)


def build(index_path, population_path, boundary_catalog, output):
    if output.exists() and any(output.iterdir()):
        raise ValueError('Use an empty output directory to preserve previous results')
    index = load_index(index_path)
    source = json.loads(population_path.read_text(encoding='utf-8'))
    if source.get('publisher') != 'Bangladesh Bureau of Statistics (BBS)' or source['population']['year'] != 2022:
        raise ValueError('Expected documented BBS 2022 population denominators')
    populations = {normalized(k, 1): v for k, v in source['population']['divisions'].items()}
    if len(populations) != 8 or len(populations) != len(source['population']['divisions']):
        raise ValueError('Expected eight unique BBS division denominators')
    catalog = json.loads(boundary_catalog.read_text(encoding='utf-8'))
    kinds = set().union(*TIERS.values())
    records = [r for r in index['records'] if str(r.get('is_active')) == '1' and r.get('facility_type_name') in kinds]
    output.mkdir(parents=True, exist_ok=True)
    manifest = {'status': 'BUILDING', 'created_at': datetime.now(timezone.utc).isoformat(),
                'analysis': 'facility availability and coordinate QA; not population accessibility',
                'sources': {'dghs_index_sha256': sha256(index_path), 'dghs_source_url': index['sourceUrl'],
                            'dghs_report_exported_at': index.get('reportExportedAt'), 'dghs_snapshot_updated_at': index.get('generatedAt'),
                            'bbs_metadata_sha256': sha256(population_path), 'bbs_url': source['url'],
                            'bbs_pdf_sha256': source['sha256'], 'bbs_population': source['population'],
                            'boundary_catalog_sha256': sha256(boundary_catalog)},
                'name_join': {'method': 'NFKC, case, punctuation/whitespace normalization; explicit ADM1/2 aliases; parent hierarchy required; no fuzzy matching',
                              'aliases_adm1_adm2': ALIASES, 'ambiguous_or_unmatched': 'not allocated by name; retained in detailed QA'},
                'point_assignment': 'Published valid coordinates only. Intersects exactly one polygon; shared-border ambiguity excluded; no snapping/geocoding.',
                'tiers': {k: sorted(v) for k, v in TIERS.items()}, 'levels': {},
                'limitations': ['2026 registry snapshot / 2022 population / 2015 geometry (validOn 2020); rates are mixed-vintage availability indicators.',
                                'No district or upazila BBS denominators; their population/rate cells are blank.',
                                'Missing or withheld coordinates are not zero facilities. A polygon with zero points can still contain unlocated facilities.',
                                'Name-based and point-based areas may disagree. Neither automatically corrects the other.',
                                'Spatial assignment is independent of registry names and is not a facility entrance validation.',
                                'All six tiers are registry type classifications; not a verified list of services, operational hours or staff.',
                                'True union/ADM4 not available. Union-level facility type is not union geography.',
                                'No travel-time, accessible-population percentage, capacity allocation or optimum-site result calculated.'],
                'software': {p: importlib.metadata.version(p) for p in ['geopandas', 'numpy', 'shapely', 'pyproj', 'matplotlib']}}
    try:
        for level_name, level in LEVELS.items():
            entries = [r for r in catalog['levels'] if r['level'] == level_name]
            if len(entries) != 1:
                raise ValueError('Expected one boundary layer for ' + level_name)
            entry = entries[0]
            path = ROOT / entry['path']
            frame = gpd.read_file(path)
            if len(frame) != entry['features'] or entry['id_field'] != f'ADM{level}_PCODE':
                raise ValueError('Boundary catalog count/ID mismatch')
            rows, qa, details = summarize_level(records, frame, level, populations)
            write_csv(output / f'{level_name}_availability.csv', rows)
            write_csv(output / f'{level_name}_facility_assignments.csv', details)
            # Small public table retaining all unmatched name combinations and their counts.
            unmatched = Counter((r['tier'], r['division_name'], r['district_name'], r['upazila_name'], r['registry_join_status'])
                                for r in details if r['registry_join_status'] != 'matched')
            fields = ['tier', 'division_name', 'district_name', 'upazila_name', 'registry_join_status', 'active_listings']
            write_csv(output / f'{level_name}_unmatched_names.csv', [dict(zip(fields, (*key, count))) for key, count in sorted(unmatched.items())], fields)
            maps = []
            metrics = ['active_listings_by_registry_name', 'coordinate_availability_pct', 'spatial_points_inside']
            if level == 1:
                metrics.append('active_listings_per_100000_bbs_residents')
            for metric in metrics:
                filename = f'{level_name}_{metric}.png'
                plot_panels(frame, rows, level_name, metric, output / filename, 'DGHS registry report ' + index['reportExportedAt'][:10])
                maps.append(filename)
            manifest['levels'][level_name] = {'features': len(frame), 'boundary_gpkg_sha256': sha256(path),
                                              'boundary_origin': entry['origin'], 'tiers': qa, 'maps': maps}
        totals = []
        for tier, kinds in TIERS.items():
            subset = [r for r in records if r['facility_type_name'] in kinds]
            totals.append({'tier': tier, 'active': len(subset), 'eligible_coordinates': sum(valid_point(r) for r in subset),
                           'bbs_population_2022': sum(populations.values()),
                           'active_per_100000_bbs_residents': round(100000 * len(subset) / sum(populations.values()), 6)})
        write_csv(output / 'national_availability.csv', totals)
        manifest['national'] = totals
        manifest['status'] = 'COMPLETED'
        manifest['output_sha256'] = {p.name: sha256(p) for p in sorted(output.iterdir()) if p.is_file() and p.name != 'manifest.json'}
    except Exception as exc:
        manifest['status'] = 'FAILED'
        manifest['error'] = str(exc)
        raise
    finally:
        (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return manifest


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--index', type=Path, default=ROOT / 'data/dghs/index.json')
    p.add_argument('--population', type=Path, default=ROOT / 'data/statistics/sources.json')
    p.add_argument('--boundaries', type=Path, default=ROOT / 'data/accessibility/boundaries.json')
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    manifest = build(a.index, a.population, a.boundaries, a.output)
    print(json.dumps({'status': manifest['status'], 'output': str(a.output.resolve()), 'national': manifest['national']}, indent=2))


if __name__ == '__main__':
    main()

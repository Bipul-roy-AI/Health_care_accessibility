"""Inspect uploaded administrative boundaries without trusting archive labels.

Only GIS sidecars are extracted. Source XML supplies provenance facts, never
commands. Raw boundaries remain in ignored analysis-inputs/ by default.
"""
import argparse
import hashlib
import json
import ntpath
from pathlib import Path, PurePosixPath
import re
import stat
import zipfile
from xml.etree import ElementTree as ET
import geopandas as gpd

ROOT=Path(__file__).resolve().parents[1]
LEVEL_NAMES={0:'country',1:'division',2:'district',3:'upazila_thana',4:'union'}
GIS_SUFFIXES={'.shp','.shx','.dbf','.prj','.cpg','.sbn','.sbx','.xml'}


def digest(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as handle:
        for chunk in iter(lambda:handle.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()


def extract_gis(archive,output,max_bytes=1024**3):
    output=Path(output).resolve();output.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(archive) as source:
        if sum(i.file_size for i in source.infolist())>max_bytes:raise ValueError('Boundary archive exceeds the uncompressed size limit')
        files=[];seen=set()
        for info in source.infolist():
            name=info.filename.replace('\\','/');relative=PurePosixPath(name)
            if relative.is_absolute() or '..' in relative.parts or ntpath.splitdrive(name)[0] or stat.S_ISLNK(info.external_attr>>16):raise ValueError('Unsafe archive path/link')
            if info.is_dir() or Path(name).suffix.lower() not in GIS_SUFFIXES:continue
            target=(output/str(relative)).resolve()
            if not target.is_relative_to(output) or target in seen:raise ValueError('Archive path escapes output or repeats a file')
            seen.add(target);payload=source.read(info)
            if target.exists() and target.read_bytes()!=payload:raise ValueError('Refusing to overwrite a different existing boundary file')
            target.parent.mkdir(parents=True,exist_ok=True)
            if not target.exists():target.write_bytes(payload)
            files.append(target)
    shapes=[p for p in files if p.suffix.lower()=='.shp']
    if len(shapes)!=1:raise ValueError('Supply one administrative Shapefile set per archive')
    shape=shapes[0]
    lower={p.name.lower() for p in shape.parent.iterdir() if p.is_file()}
    for extension in ('.shp','.shx','.dbf','.prj'):
        if shape.with_suffix(extension).name.lower() not in lower:raise ValueError('Missing required Shapefile sidecar: '+extension)
    return shape,files


def source_metadata(shape):
    xml=Path(str(shape)+'.xml')
    if not xml.exists():return {'metadata_xml':False,'publisher_organizations':[]}
    root=ET.parse(xml).getroot()
    def values(tag):return sorted({node.text.strip() for node in root.iter() if node.tag.split('}')[-1]==tag and node.text and node.text.strip()})
    # Do not publish ArcGIS processing histories or local workstation paths.
    return {'metadata_xml':True,'publisher_organizations':values('rpOrgName'),'purpose':values('idPurp'),
            'publication_date':values('pubDate'),'license_status':'Preserve the supplied COD/FOD terms; no CC0/ODbL licence is inferred for these boundaries.'}


def inspect(frame):
    levels=[level for level in LEVEL_NAMES if f'ADM{level}_PCODE' in frame and f'ADM{level}_EN' in frame]
    if not levels:raise ValueError('No recognized ADM level ID/name fields')
    level=max(levels);id_field=f'ADM{level}_PCODE';name_field=f'ADM{level}_EN'
    if frame.crs is None or frame.empty:raise ValueError('Boundaries need a declared CRS and at least one feature')
    if frame.geometry.isna().any() or frame.geometry.is_empty.any() or (~frame.geometry.is_valid).any() or (~frame.geom_type.isin(['Polygon','MultiPolygon'])).any():raise ValueError('Invalid, empty or non-polygon administrative geometry; no automatic repair applied')
    if frame[id_field].isna().any() or frame[id_field].astype(str).duplicated().any() or (frame[id_field].astype(str).str.strip()=='').any():raise ValueError('Administrative IDs must be nonempty and unique')
    if frame[name_field].isna().any():raise ValueError('Administrative names are missing')
    if 'ADM0_PCODE' in frame and set(frame.ADM0_PCODE.astype(str))!={'BD'}:raise ValueError('The study expects Bangladesh country code BD')
    for child in range(1,level+1):
        if f'ADM{child}_PCODE' in frame and f'ADM{child-1}_PCODE' in frame:
            if any(not str(c).startswith(str(p)) for c,p in zip(frame[f'ADM{child}_PCODE'],frame[f'ADM{child-1}_PCODE'])):raise ValueError('Inconsistent administrative parent-code prefix')
    geographic=frame.to_crs(4326)
    metric=frame.to_crs(6933)
    left,right=metric.sindex.query(metric.geometry,predicate='intersects')
    overlaps=[]
    for a,b in zip(left,right):
        if a<b:
            area=float(metric.geometry.iloc[a].intersection(metric.geometry.iloc[b]).area)
            if area>1.:overlaps.append({'a':str(frame[id_field].iloc[a]),'b':str(frame[id_field].iloc[b]),'area_m2':area})
    if overlaps:raise ValueError(f'{len(overlaps)} positive-area administrative overlaps above 1 m2; inspect source topology before use')
    dates={}
    for field in ['date','validOn','validTo','ValidTo']:
        if field in frame:dates[field]=sorted(set(frame[field].dropna().astype(str)))
    codes={f'ADM{n}_PCODE':int(frame[f'ADM{n}_PCODE'].nunique()) for n in levels}
    return {'detected_administrative_level':level,'level_name':LEVEL_NAMES[level],'feature_count':len(frame),'id_field':id_field,'name_field':name_field,
            'crs':frame.crs.to_string(),'wgs84_bounds':geographic.total_bounds.tolist(),'geometry_types':frame.geom_type.value_counts().to_dict(),
            'invalid_geometries':0,'empty_geometries':0,'overlaps_over_1m2':0,'parent_code_counts':codes,'dates':dates,
            'duplicate_name_count':int(frame[name_field].astype(str).duplicated().sum()),
            'note':'Level is detected from ID/name fields, not the ZIP filename. Shape_Area/Shape_Leng are not assumed km2/metres.'}


def prepare(archive,output,derive_parents=False):
    archive=Path(archive).resolve();output=Path(output).resolve()
    shape,files=extract_gis(archive,output)
    frame=gpd.read_file(shape);report=inspect(frame)
    level=report['detected_administrative_level']
    normalized=output/(LEVEL_NAMES[level]+'.gpkg')
    if normalized.exists():raise ValueError('Prepared GeoPackage already exists; choose a fresh preparation directory')
    frame.to_file(normalized,layer=LEVEL_NAMES[level],driver='GPKG',index=False)
    report.update(archive_name=archive.name,archive_sha256=digest(archive),shapefile_name=shape.name,source_files_sha256={str(p.relative_to(output)):digest(p) for p in files},source_metadata=source_metadata(shape),normalized_name=normalized.name,normalized_sha256=digest(normalized))
    derivatives=[]
    if derive_parents:
        for parent in range(level):
            key=f'ADM{parent}_PCODE'
            if key not in frame:continue
            fields=[f'ADM{n}_{suffix}' for n in range(parent+1) for suffix in ['PCODE','EN'] if f'ADM{n}_{suffix}' in frame]
            derived=frame[fields+['geometry']].dissolve(by=key,as_index=False)
            summary=inspect(derived)
            target=output/('derived_'+LEVEL_NAMES[parent]+'.gpkg')
            if target.exists():raise ValueError('Derived output already exists')
            derived.to_file(target,layer=LEVEL_NAMES[parent],driver='GPKG',index=False)
            derivatives.append({**summary,'name':target.name,'sha256':digest(target),'derived_from':shape.name,'independent_official_layer':False})
    report['derived_layers']=derivatives
    path=output/'boundary-audit.json';path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    id_fields=[c for c in frame if re.fullmatch(r'ADM\d+_(PCODE|EN)',c)]
    frame[id_fields].sort_values(report['id_field']).to_csv(output/'administrative-ids.csv',index=False)
    print(f"Validated {len(frame)} {LEVEL_NAMES[level]} features; ID={report['id_field']}; CRS={frame.crs}")
    return report


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--archive',required=True,type=Path);p.add_argument('--output',required=True,type=Path)
    p.add_argument('--derive-parents',action='store_true')
    a=p.parse_args();prepare(a.archive,a.output,a.derive_parents)


if __name__=='__main__':main()

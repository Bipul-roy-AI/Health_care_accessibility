"""Extract OSM transport geometry/tags, without importing OSM health facilities.

This is source preparation, not a road-routing or speed-calibration engine.
Shared node IDs/layer/bridge/tunnel tags are preserved for topology review.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
import os
import osmium
from accessibility.inputs import sha256

ALLOWED={'yes','designated','permissive','official'}
CLOSED={'no','private'}
TAGS=['highway','surface','tracktype','smoothness','access','foot','motor_vehicle','vehicle','maxspeed','oneway','junction','bridge','tunnel','layer','service','ford','foot:conditional','motor_vehicle:conditional','access:conditional']


def eligible(tags,mode):
    highway=tags.get('highway','')
    if not highway or highway in {'construction','proposed','abandoned','disused'}:return False
    if mode not in {'walk','drive'}:raise ValueError('Choose walk or drive explicitly')
    specific=tags.get('foot' if mode=='walk' else 'motor_vehicle','')
    if specific in CLOSED:return False
    if tags.get('access') in CLOSED and specific not in ALLOWED:return False
    if mode=='walk':
        if highway in {'motorway','motorway_link'}:return False
    else:
        if tags.get('vehicle') in CLOSED and specific not in ALLOWED:return False
        if highway in {'footway','pedestrian','steps','cycleway','bridleway','path'} and specific not in ALLOWED:return False
    return True


def extract(source,output,mode,location_cache=None):
    source=Path(source);output=Path(output)
    if output.exists():raise ValueError('Transport output exists; choose a new output path')
    if mode not in {'walk','drive'}:raise ValueError('Choose a supported travel mode')
    output.parent.mkdir(parents=True,exist_ok=True)
    if location_cache is not None:
        location_cache=Path(location_cache)
        if location_cache.exists():raise ValueError('Location-cache file exists; choose a new temporary cache path')
        location_cache.parent.mkdir(parents=True,exist_ok=True)
    fd,tmp=tempfile.mkstemp(dir=output.parent,prefix=output.name+'.',suffix='.partial')
    counts={'ways_seen':0,'transport_ways_written':0,'ways_without_complete_geometry':0}
    class Roads(osmium.SimpleHandler):
        def way(self,way):
            counts['ways_seen']+=1
            tags=dict(way.tags)
            if not eligible(tags,mode):return
            if len(way.nodes)<2 or any(not node.location.valid() for node in way.nodes):
                counts['ways_without_complete_geometry']+=1;return
            feature={'type':'Feature','geometry':{'type':'LineString','coordinates':[[n.lon,n.lat] for n in way.nodes]},'properties':{'osm_way_id':int(way.id),'node_ids':[int(n.ref) for n in way.nodes],'source':'OpenStreetMap contributors','mode_filter':mode,**{key:tags[key] for key in TAGS if key in tags}}}
            if counts['transport_ways_written']:writer.write(',\n')
            writer.write(json.dumps(feature));counts['transport_ways_written']+=1
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as writer:
            writer.write('{"type":"FeatureCollection","features":[\n')
            index='flex_mem' if location_cache is None else 'sparse_file_array,'+str(location_cache)
            Roads().apply_file(str(source),locations=True,idx=index)
            writer.write('\n]}\n');writer.flush();os.fsync(writer.fileno())
        if not counts['transport_ways_written']:raise ValueError('No eligible OSM transport ways found')
        if counts['ways_without_complete_geometry']:raise ValueError('Missing OSM node locations; do not silently publish an incomplete road layer')
        os.replace(tmp,output)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
    metadata={'source':'OpenStreetMap contributors','license':'ODbL 1.0','attribution':'© OpenStreetMap contributors','input_sha256':sha256(source),'output_sha256':sha256(output),'retrieved_or_processed_at':datetime.now(timezone.utc).isoformat(),'mode':mode,'counts':counts,'speeds_assigned':False,'routing_calculated':False,'osm_health_facilities_imported':False,
              'limitations':['Mode filters are conservative preprocessing, not complete legal/time-dependent access rules.','Preserve and review node IDs, one-way, layer, bridge and tunnel tags before routing.','Do not merge grade-separated crossings or treat maxspeed as observed typical speed.','Ferry connections and seasonal barriers are not inferred.']}
    output.with_suffix(output.suffix+'.provenance.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
    return metadata


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input',required=True,type=Path);p.add_argument('--output',required=True,type=Path)
    p.add_argument('--mode',required=True,choices=['walk','drive']);p.add_argument('--location-cache',type=Path)
    a=p.parse_args();print(json.dumps(extract(a.input,a.output,a.mode,a.location_cache),indent=2))


if __name__=='__main__':main()

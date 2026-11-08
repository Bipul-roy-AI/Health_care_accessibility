"""Transport-only extraction and integrity checks; fictional XML, no downloads."""
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from download_osm_transport import checksum_line, stream_verified
from extract_osm_transport import eligible, extract


class IntegrityTests(unittest.TestCase):
    def test_official_checksum_format_and_invalid_response(self):
        self.assertEqual(checksum_line('a'*32+'  bangladesh-latest.osm.pbf\n'),'a'*32)
        with self.assertRaises(ValueError):checksum_line('<html>denied</html>')

    def test_failed_or_oversize_download_never_overwrites_previous_file(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'extract.pbf';path.write_bytes(b'original')
            with self.assertRaises(ValueError):stream_verified(io.BytesIO(b'wrong'),path,'0'*32,100)
            self.assertEqual(path.read_bytes(),b'original')
            with self.assertRaises(ValueError):stream_verified(io.BytesIO(b'too large'),path,'0'*32,2)
            self.assertEqual(path.read_bytes(),b'original')
            self.assertFalse(list(Path(d).glob('*.partial')))

    def test_verified_download_records_both_hashes(self):
        with tempfile.TemporaryDirectory() as d:
            payload=b'fictional transport artifact'
            path=Path(d)/'extract.pbf'
            result=stream_verified(io.BytesIO(payload),path,hashlib.md5(payload).hexdigest(),100)
            self.assertEqual(result['sha256'],hashlib.sha256(payload).hexdigest())
            self.assertEqual(path.read_bytes(),payload)


class TransportTests(unittest.TestCase):
    def test_mode_and_access_filters(self):
        self.assertFalse(eligible({'amenity':'hospital'},'walk'))
        self.assertFalse(eligible({'highway':'motorway'},'walk'))
        self.assertFalse(eligible({'highway':'residential','foot':'no'},'walk'))
        self.assertFalse(eligible({'highway':'residential','access':'private'},'drive'))
        self.assertFalse(eligible({'highway':'footway'},'drive'))
        self.assertTrue(eligible({'highway':'footway'},'walk'))
        self.assertTrue(eligible({'highway':'residential','access':'private','foot':'yes'},'walk'))

    def test_only_roads_imported_and_topology_tags_preserved(self):
        source='''<osm version="0.6" generator="fictional-test">
        <node id="1" lat="23.0" lon="90.0"/>
        <node id="2" lat="23.001" lon="90.001"><tag k="amenity" v="hospital"/><tag k="name" v="NOT A STUDY FACILITY"/></node>
        <way id="10"><nd ref="1"/><nd ref="2"/><tag k="highway" v="residential"/><tag k="oneway" v="yes"/><tag k="bridge" v="yes"/><tag k="layer" v="1"/></way>
        <way id="11"><nd ref="1"/><nd ref="2"/><tag k="amenity" v="clinic"/></way>
        <way id="12"><nd ref="1"/><nd ref="2"/><tag k="highway" v="residential"/><tag k="access" v="private"/></way>
        </osm>'''
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);p=root/'source.osm';p.write_text(source)
            output=root/'roads.geojson'
            report=extract(p,output,'walk')
            features=json.loads(output.read_text())['features']
            self.assertEqual(len(features),1)
            self.assertEqual(features[0]['properties']['node_ids'],[1,2])
            self.assertEqual(features[0]['properties']['bridge'],'yes')
            self.assertNotIn('amenity',features[0]['properties'])
            self.assertNotIn('name',features[0]['properties'])
            self.assertFalse(report['osm_health_facilities_imported'])
            self.assertFalse(report['speeds_assigned'])
            self.assertFalse(report['routing_calculated'])
            self.assertTrue(output.with_suffix('.geojson.provenance.json').exists())
            disk_report=extract(p,root/'roads_disk.geojson','walk',root/'nodes.idx')
            self.assertEqual(disk_report['counts']['transport_ways_written'],1)


if __name__=='__main__':unittest.main()

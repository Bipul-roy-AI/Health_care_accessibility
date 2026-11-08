"""End-to-end entirely fictional pilot; all files live in a temporary directory."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import numpy as np
import geopandas as gpd
import rasterio
from rasterio.transform import from_origin
from pyproj import Transformer
from shapely.geometry import box

SCRIPTS=Path(__file__).resolve().parents[2]/'scripts'
sys.path.insert(0,str(SCRIPTS))
spec=importlib.util.spec_from_file_location('accessibility_runner',SCRIPTS/'run_accessibility.py')
runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)


class PipelineTest(unittest.TestCase):
    def test_all_requested_model_outputs_on_known_synthetic_grid(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'data/dghs').mkdir(parents=True)
            profile={'driver':'GTiff','height':1,'width':3,'count':1,'dtype':'float64','crs':'EPSG:32646','transform':from_origin(300000,2600100,100,100),'nodata':-9999}
            for name,array in [('friction.tif',[[.01,.01,.01]]),('population.tif',[[40.,40.,40.]])]:
                with rasterio.open(root/name,'w',**profile) as dst:dst.write(np.array(array),1)
            transform=Transformer.from_crs(32646,4326,always_xy=True)
            lon,lat=transform.transform(300050,2600050);tlon,tlat=transform.transform(300250,2600050)
            index={'source':'DGHS facility registry','count':2,'records':[{'id':'TEST_C','name':'FICTIONAL TEST CLINIC','lat':lat,'lon':lon,'is_active':'1','coordinateStatus':'published','facility_type_name':'Community Clinic','division_name':'TEST'}, {'id':'TEST_H','name':'FICTIONAL TEST HOSPITAL','lat':tlat,'lon':tlon,'is_active':'1','coordinateStatus':'published','facility_type_name':'District/General Hospital'}]}
            (root/'data/dghs/index.json').write_text(json.dumps(index))
            (root/'capacity.csv').write_text('facility_id,capacity,unit,period,source_url,source_field\nTEST_C,70,persons_per_period,TEST_PERIOD,https://hrm.dghs.gov.bd/FICTIONAL_TEST_FIXTURE,people_service_capacity\n')
            (root/'candidates.csv').write_text(f'candidate_id,lat,lon,capacity,unit,period,feasible\nTEST_SITE,{tlat},{tlon},50,persons_per_period,TEST_PERIOD,1\n')
            zones=gpd.GeoDataFrame({'code':['A','B']},geometry=[box(300000,2600000,300200,2600100),box(300200,2600000,300300,2600100)],crs=32646)
            zones.to_file(root/'zones.geojson',driver='GeoJSON')
            provenance={key:{'publisher':'DGHS','date':'FICTIONAL_TEST','source_url':'https://hrm.dghs.gov.bd/FICTIONAL_TEST_FIXTURE','approved':True} for key in ['population','friction','capacity','zones','candidates']}
            config={'health_source':'DGHS','source_policy':'DGHS_only','friction':'friction.tif','population':'population.tif','friction_unit':'minutes_per_metre','population_unit':'persons_per_cell','primary_tiers':['community'],'threshold_minutes':[1,2], 'capacity_csv':'capacity.csv','service_period':'TEST_PERIOD','zones':[{'name':'test','path':'zones.geojson','id_field':'code'}],'referrals':[{'from_tiers':['community'],'to_tiers':['secondary']}],'candidate_csv':'candidates.csv','new_site_budget':1,'provenance':provenance}
            (root/'config.json').write_text(json.dumps(config))
            with patch.object(runner,'ROOT',root):runner.run(root/'config.json',root/'out')
            manifest=json.loads((root/'out/run_manifest.json').read_text())
            self.assertEqual(manifest['status'],'COMPLETED_MODEL_OUTPUTS_REQUIRE_VALIDATION')
            self.assertAlmostEqual(manifest['capacity_served_population'],70)
            self.assertEqual(manifest['population_total'],120)
            self.assertAlmostEqual(manifest['coverage'][0]['physically_accessible_population'],80)
            with rasterio.open(root/'out/nearest_primary_minutes.tif') as src:np.testing.assert_allclose(src.read(1),[[0,1,2]])
            site=json.loads((root/'out/site_selection.json').read_text())
            self.assertTrue(site['optimality_proven']);self.assertEqual(site['selected_candidate_ids'],['TEST_SITE']);self.assertAlmostEqual(site['additional_people_served'],50)
            routes=json.loads((root/'out/referral_modelled_paths.geojson').read_text())
            self.assertAlmostEqual(routes['features'][0]['properties']['minutes'],2)
            self.assertAlmostEqual(routes['features'][0]['properties']['distance_km_on_fastest_modelled_path'],.2)
            for file in ['zonal_test_2min.csv','zonal_test_2min.geojson','nearest_primary_minutes.png','primary_count_2min.png','accessible_capacity_unserved.tif']:
                self.assertTrue((root/'out'/file).stat().st_size>0)


if __name__=='__main__':unittest.main()

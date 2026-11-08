"""Synthetic grids with known answers; no fixture is a Bangladesh study result."""
import sys
from pathlib import Path
import unittest
import numpy as np
import geopandas as gpd
from shapely.geometry import box
from rasterio.transform import from_origin

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from accessibility.grid import build_graph, nearest, reachability, path_from_predecessors, path_metres
from accessibility.allocation import allocate, select_sites
from accessibility.raster_io import zonal_statistics
from accessibility.inputs import audit, check_provenance


class TravelTests(unittest.TestCase):
    def test_minutes_and_distance_have_correct_units(self):
        graph,valid=build_graph(np.full((1,4),.01),100,100)
        times,pred,origins=nearest(graph,[0])
        np.testing.assert_allclose(times,[0,1,2,3])
        self.assertEqual(path_metres(path_from_predecessors(pred,3),4,100,100),300)
        self.assertTrue(valid.all())

    def test_barrier_cannot_be_crossed_diagonally(self):
        graph,_=build_graph([[.01,np.nan],[np.nan,.01]],100,100)
        times,_,_=nearest(graph,[0])
        self.assertTrue(np.isinf(times[3]))

    def test_multi_source_nearest_and_colocated_counts(self):
        graph,_=build_graph(np.full((1,4),.01),100,100)
        times,_,_=nearest(graph,[0,3])
        np.testing.assert_allclose(times,[0,1,1,0])
        counts,cells,f,p,t=reachability(graph,[0,0],[[1,1,1,1]],[1])
        np.testing.assert_array_equal(counts[1],[2,2,0,0])
        self.assertEqual(len(f),4)

    def test_guard_refuses_unbounded_pilot_and_edges(self):
        with self.assertRaises(ValueError):build_graph(np.ones((3,3)),1,1,max_cells=2)
        graph,_=build_graph(np.ones((1,3)),1,1)
        with self.assertRaises(ValueError):reachability(graph,[0],[[1,1,1]],[10],max_edges=1)


class AllocationTests(unittest.TestCase):
    def test_capacity_shortfall_and_conservation(self):
        result=allocate([40,40,40],[70],[0,0,0],[0,1,2],[0,1,2])
        np.testing.assert_allclose(result['served'],[40,30,0])
        self.assertAlmostEqual(result['total_served'],70)
        self.assertAlmostEqual(result['facility_load'].sum(),70)

    def test_overlapping_catchments_do_not_double_count_people(self):
        result=allocate([50],[100,100],[0,1],[0,0],[1,2])
        self.assertAlmostEqual(result['total_served'],50)
        self.assertAlmostEqual(result['facility_load'][0],50)

    def test_exact_site_choice_improves_coverage(self):
        # Existing facility covers cell 0; candidate 1 adds none, candidate 2 adds cell 1.
        result=select_sites([40,60],[40,40,60],[0,1,2],[0,0,1],[0,0,0],1,1)
        self.assertTrue(result['optimality_proven'])
        self.assertEqual(result['selected_facility_indices'],[2])
        self.assertAlmostEqual(result['total_served'],100)

    def test_missing_capacity_not_imputed(self):
        with self.assertRaises(ValueError):allocate([40],[np.nan],[0],[0],[1])


class ZonalTests(unittest.TestCase):
    def profile(self):return {'height':1,'width':3,'transform':from_origin(0,100,100,100),'crs':'EPSG:32646'}
    def test_weighted_population_percent_not_facility_density(self):
        zones=gpd.GeoDataFrame({'code':['A','B']},geometry=[box(0,0,200,100),box(200,0,300,100)],crs=32646)
        rows,qa=zonal_statistics(zones,'code',self.profile(),np.array([[20.,80.,100.]]),np.array([[True,False,True]]),np.array([[2,0,1]]),np.array([[10.,0.,50.]]))
        self.assertEqual(rows[0]['physical_coverage_percent'],20)
        self.assertEqual(rows[1]['physical_coverage_percent'],100)
        self.assertEqual(rows[0]['capacity_coverage_percent'],10)
        self.assertEqual(rows[1]['accessible_but_capacity_unserved'],50)
        self.assertEqual(qa['population_outside_admin_polygons'],0)

    def test_overlapping_zones_rejected(self):
        zones=gpd.GeoDataFrame({'code':['A','B']},geometry=[box(0,0,300,100),box(0,0,300,100)],crs=32646)
        with self.assertRaises(ValueError):zonal_statistics(zones,'code',self.profile(),np.ones((1,3)),np.ones((1,3),bool),np.ones((1,3)))


class ProvenanceTests(unittest.TestCase):
    def test_non_dghs_health_data_rejected(self):
        with self.assertRaises(ValueError):check_provenance({'health_source':'OSM'})
    def test_selected_policy_requires_bbs_population(self):
        base={'health_source':'DGHS','source_policy':'DGHS_health_BBS_population_approved_support','provenance':{key:{'publisher': 'BBS' if key=='population' else 'Approved travel provider', 'date':'TEST', 'source_url':'https://example.invalid', 'approved':True} for key in ['population','friction']}}
        check_provenance(base)
        base['provenance']['population']['publisher']='WorldPop'
        with self.assertRaises(ValueError):check_provenance(base)

    def test_unknown_support_data_is_not_approved(self):
        with self.assertRaises(ValueError):check_provenance({'health_source':'DGHS','source_policy':'DGHS_only'})
    def test_clinical_types_exclude_administrative_offices(self):
        index={'records':[{'id':'1','is_active':'1','facility_type_name':'Community Clinic','coordinateStatus':'missing'}, {'id':'2','is_active':'1','facility_type_name':'Upazila Level Office'}]}
        result=audit(index)
        self.assertEqual(result['tiers']['community']['active'],1)
        self.assertEqual(result['tiers']['community']['usable_coordinates'],0)
        self.assertEqual(result['tiers']['upazila']['active'],0)


if __name__=='__main__':unittest.main()

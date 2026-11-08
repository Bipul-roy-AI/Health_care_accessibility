"""DGHS accessibility CLI. `audit` works without external population/travel data."""
import argparse
import csv
import json
from pathlib import Path
import sys
from importlib.metadata import version
from accessibility.inputs import load_index, audit, select_facilities, check_provenance, read_capacity, sha256

ROOT=Path(__file__).resolve().parents[1]


def write_json(path,data):
    Path(path).write_text(json.dumps(data,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')


def write_csv(path,rows):
    if not rows:return
    with Path(path).open('w',newline='',encoding='utf-8') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)


def run(config_path,output):
    import numpy as np
    import rasterio
    from scipy.sparse.csgraph import dijkstra
    from accessibility.grid import build_graph, nearest, reachability, path_from_predecessors, path_metres
    from accessibility.raster_io import read_grids, facility_cells, write_raster, zonal_statistics
    from accessibility.allocation import allocate, select_sites
    config_path=Path(config_path).resolve();config=json.loads(config_path.read_text())
    check_provenance(config)
    if config.get('friction_unit')!='minutes_per_metre' or config.get('population_unit')!='persons_per_cell':raise ValueError('Explicit friction/population units required')
    resolve=lambda value:(config_path.parent/value).resolve()
    index_path=ROOT/'data/dghs/index.json';index=load_index(index_path)
    rows=select_facilities(index,config['primary_tiers'])
    friction_path,pop_path=resolve(config['friction']),resolve(config['population'])
    friction,population,profile=read_grids(friction_path,pop_path)
    graph,valid=build_graph(friction,profile['transform'].a,-profile['transform'].e,config.get('max_cells',1_000_000))
    primary,seeds,excluded=facility_cells(rows,profile,valid)
    times,predecessors,origins=nearest(graph,seeds)
    thresholds=config.get('threshold_minutes',[15,30,60])
    counts,demand_cells,facility,destination,cost=reachability(graph,seeds,population,thresholds,config.get('max_edges',2_000_000))
    largest=max(counts);demand=population.ravel()[demand_cells]
    out=Path(output).resolve()
    if out.exists() and any(out.iterdir()):raise ValueError('Choose an empty output directory; existing study results are not overwritten')
    out.mkdir(parents=True,exist_ok=True)
    inputs=[index_path,config_path,friction_path,pop_path]
    report={'status':'RUNNING','model':'isotropic eight-neighbour least-cost raster; no corner cutting',
            'primary_tiers':config['primary_tiers'],'exact_types':audit(index)['tiers'],
            'active_selected_registry_facilities':sum(audit(index)['tiers'][t]['active'] for t in config['primary_tiers']),'eligible_registry_facilities':len(rows),'in_grid_facilities':len(primary),'excluded_facilities':excluded,
            'coordinate_eligibility':'existing published flags; missing/outside/invalid coordinates are not relocated','interpretation':'Coverage refers only to the mapped, selected DGHS subset; missing facility coordinates can bias coverage and proposed-site results' ,
            'software_versions':{name:version(name) for name in ['numpy','scipy','rasterio','pyproj','geopandas','matplotlib']},'grid_cells':friction.size,'population_total':float(demand.sum()),'population_missing_cells':int(np.isnan(population).sum()),
            'population_on_impassable_cells':float(np.nansum(population[~valid])),
            'friction_unit':'minutes_per_metre','population_unit':'persons_per_cell','thresholds_minutes':sorted(counts),
            'provenance':config['provenance'],'coverage':[],'capacity_status':'NOT_RUN_NO_SERVICE_CAPACITY_INPUT'}
    try:
        times_grid=times.reshape(friction.shape)
        export_time=np.where(valid,np.where(np.isfinite(times_grid),times_grid,-1),np.nan)
        write_raster(out/'nearest_primary_minutes.tif',export_time,profile,'minutes; -1 unreachable; nodata missing/impassable friction')
        by_cell={}
        for row,cell in zip(primary,seeds):by_cell.setdefault(int(cell),[]).append(str(row['id']))
        # Vector lookup avoids a full-grid scan for every facility.
        code_by_cell={cell:i+1 for i,cell in enumerate(sorted(by_cell))}
        lookup=[{'owner_code':code_by_cell[cell],'seed_cell':cell,'facility_ids':by_cell[cell]} for cell in code_by_cell]
        cell_codes=np.zeros(friction.size,dtype=np.int32)
        for cell,code in code_by_cell.items():cell_codes[cell]=code
        owner=np.where(origins>=0,cell_codes[np.maximum(origins,0)],0).astype(float)
        owner[~valid.ravel()]=np.nan
        write_raster(out/'nearest_primary_owner.tif',owner,profile,'owner code; zero unreachable; lookup lists same-cell ties')
        write_json(out/'owner_lookup.json',lookup)
        for threshold,count in counts.items():
            write_raster(out/f'primary_count_{threshold:g}min.tif',np.where(valid.ravel(),count,np.nan),profile,'distinct DGHS facilities within modelled threshold')
            accessible=float(demand[count[demand_cells]>0].sum())
            multiple=float(demand[count[demand_cells]>=2].sum())
            report['coverage'].append({'minutes':threshold,'physically_accessible_population':accessible,'physical_coverage_percent':accessible/report['population_total']*100 if report['population_total'] else None,'population_with_2plus_facilities':multiple})
        served=None;capacity=None
        if config.get('capacity_csv'):
            capacity_path=resolve(config['capacity_csv']);inputs.append(capacity_path)
            capacity=np.asarray(read_capacity(capacity_path,[r['id'] for r in primary],config['service_period']))
            result=allocate(demand,capacity,facility,destination,cost)
            served=np.zeros(friction.size);served[demand_cells]=result['served'];served=served.reshape(friction.shape)
            write_raster(out/'capacity_served_population.tif',np.where(np.isfinite(population),served,np.nan),profile,'persons served in declared period')
            accessible_pop=np.where(counts[largest].reshape(friction.shape)>0,population,0)
            unmet=np.maximum(accessible_pop-served,0)
            write_raster(out/'accessible_capacity_unserved.tif',np.where(np.isfinite(population),unmet,np.nan),profile,'physically accessible persons not allocated service capacity')
            write_csv(out/'facility_capacity_allocation.csv',[{'facility_id':str(r['id']),'capacity_persons_per_period':float(c),'allocated_persons':float(load),'period':config['service_period']} for r,c,load in zip(primary,capacity,result['facility_load'])])
            write_csv(out/'capacity_flows.csv',[{'facility_id':str(primary[f]['id']),'demand_cell':int(demand_cells[p]),'allocated_people':float(flow),'travel_minutes':float(t)} for f,p,flow,t in zip(facility,destination,result['flows'],cost) if flow>1e-8])
            report.update(capacity_status='CALCULATED_SCENARIO',capacity_served_population=result['total_served'],service_period=config['service_period'],capacity_person_minutes=result['person_minutes'])
        for zone in config.get('zones',[]):
            import geopandas as gpd
            path=resolve(zone['path']);inputs.append(path)
            if not zone['name'].replace('_','').isalnum():raise ValueError('Zone output name must be alphanumeric/underscore')
            frame=gpd.read_file(path)
            for threshold,count in counts.items():
                stats,missing=zonal_statistics(frame,zone['id_field'],profile,population,(count>0).reshape(friction.shape),count.reshape(friction.shape),served if threshold==largest else None)
                write_csv(out/f'zonal_{zone["name"]}_{threshold:g}min.csv',stats)
                values={r['zone_id']:r for r in stats}
                geo=frame.to_crs(4326).copy()
                for field in stats[0]:
                    if field!='zone_id':geo[field]=geo[zone['id_field']].astype(str).map(lambda key:values[key][field])
                geo.to_file(out/f'zonal_{zone["name"]}_{threshold:g}min.geojson',driver='GeoJSON')
                report.setdefault('zonal_qa',{})[zone['name']]=missing
        # Referral routing uses the same supplied friction, not public OSRM/OSM.
        referrals=[];lines=[]
        for pairing in config.get('referrals',[]):
            sources=select_facilities(index,pairing['from_tiers']);targets=select_facilities(index,pairing['to_tiers'])
            sources,source_cells,source_exclusions=facility_cells(sources,profile,valid)
            targets,target_cells,target_exclusions=facility_cells(targets,profile,valid)
            if not len(target_cells):raise ValueError('Referral pairing has no usable target facilities in this grid')
            target_time,pred,target_owner=nearest(graph,target_cells)
            targets_by_cell={}
            for r,c in zip(targets,target_cells):targets_by_cell.setdefault(int(c),[]).append(str(r['id']))
            for source,cell in zip(sources,source_cells):
                reachable=np.isfinite(target_time[cell]);target_ids=targets_by_cell.get(int(target_owner[cell]),[]) if reachable else []
                path=path_from_predecessors(pred,int(cell)) if reachable else []
                distance=path_metres(path,profile['width'],profile['transform'].a,-profile['transform'].e)/1000 if reachable else None
                row={'source_id':str(source['id']),'target_ids_same_cell':';'.join(target_ids),'from_tiers':';'.join(pairing['from_tiers']),'to_tiers':';'.join(pairing['to_tiers']),'minutes':float(target_time[cell]) if reachable else None,'distance_km_on_fastest_modelled_path':distance,'status':'REACHABLE' if reachable else 'UNREACHABLE'}
                referrals.append(row)
                if path:
                    from pyproj import Transformer
                    tr=Transformer.from_crs(profile['crs'],4326,always_xy=True)
                    points=[list(tr.transform(*rasterio.transform.xy(profile['transform'],c//profile['width'],c%profile['width']))) for c in path]
                    geometry={'type':'LineString','coordinates':points} if len(points)>1 else {'type':'Point','coordinates':points[0]}
                    lines.append({'type':'Feature','properties':row,'geometry':geometry})
            report.setdefault('referral_exclusions',[]).append({'pairing':pairing,'sources':source_exclusions,'targets':target_exclusions})
        write_csv(out/'referrals.csv',referrals)
        if lines:write_json(out/'referral_modelled_paths.geojson',{'type':'FeatureCollection','features':lines})
        if config.get('candidate_csv'):
            if capacity is None:raise ValueError('Capacity-aware site selection requires existing facility capacity')
            path=resolve(config['candidate_csv']);inputs.append(path)
            with path.open(encoding='utf-8-sig',newline='') as handle:
                candidates=list(csv.DictReader(handle))
            if len(candidates)>config.get('max_candidates',100):raise ValueError('Too many candidate sites for this pilot solver')
            if len({r['candidate_id'] for r in candidates})!=len(candidates):raise ValueError('Candidate IDs must be unique')
            if any(r.get('feasible')!='1' for r in candidates):raise ValueError('Every candidate must have explicit feasibility approval')
            if any(r.get('unit')!='persons_per_period' or r.get('period')!=config['service_period'] for r in candidates):raise ValueError('Candidate capacity period/units mismatch')
            points=[dict(r,id=r['candidate_id']) for r in candidates]
            selected,candidate_cells,bad=facility_cells(points,profile,valid)
            if bad:raise ValueError('Candidate locations outside/impassable on grid; no snapping allowed')
            _,candidate_demand,cf,cp,ct=reachability(graph,candidate_cells,population,[largest],config.get('max_edges',2_000_000))
            caps=np.r_[capacity,[float(r['capacity']) for r in selected]]
            optimum=select_sites(demand,caps,np.r_[facility,cf+len(primary)],np.r_[destination,cp],np.r_[cost,ct],len(primary),config['new_site_budget'],config.get('site_solver_seconds',120))
            optimum['baseline_served_population']=report['capacity_served_population']
            optimum['additional_people_served']=max(0.,optimum['total_served']-report['capacity_served_population'])
            optimum['selected_candidate_ids']=[selected[i-len(primary)]['id'] for i in optimum['selected_facility_indices']]
            optimum.pop('served');write_json(out/'site_selection.json',optimum)
            chosen=set(optimum['selected_candidate_ids'])
            write_json(out/'selected_new_sites.geojson',{'type':'FeatureCollection','features':[{'type':'Feature','properties':{'candidate_id':r['id'],'capacity':float(r['capacity']),'optimality_proven':optimum['optimality_proven']},'geometry':{'type':'Point','coordinates':[float(r['lon']),float(r['lat'])]}} for r in selected if r['id'] in chosen]})
        # Export map figures; raster/GeoJSON/CSV retain the underlying measurements.
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        for filename,title,unit in [('nearest_primary_minutes.tif','Modelled time to nearest selected DGHS facility','minutes'),(f'primary_count_{largest:g}min.tif',f'DGHS facilities within {largest:g} modelled minutes','facilities')]:
            with rasterio.open(out/filename) as src:array=src.read(1,masked=True)
            if unit=='minutes':array=np.ma.masked_less(array,0)
            fig,ax=plt.subplots(figsize=(8,8));image=ax.imshow(array,cmap='viridis');fig.colorbar(image,ax=ax,label=unit)
            ax.set_title(title);ax.set_xlabel('Raster column');ax.set_ylabel('Raster row')
            fig.savefig(out/filename.replace('.tif','.png'),dpi=180,bbox_inches='tight');plt.close(fig)
        report['status']='COMPLETED_MODEL_OUTPUTS_REQUIRE_VALIDATION'
    except BaseException as error:
        report['status']='FAILED';report['error']=str(error)
        raise
    finally:
        files=set(inputs)
        for p in inputs:
            if p.suffix.lower()=='.shp':files.update(x for x in p.parent.glob(p.stem+'.*') if x.suffix.lower() in ('.shx','.dbf','.prj','.cpg'))
        report['input_sha256']={str(p):sha256(p) for p in sorted(files) if p.is_file()}
        write_json(out/'run_manifest.json',report)
    print('Finished model outputs:',out)


def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='command',required=True)
    a=sub.add_parser('audit');a.add_argument('--output',type=Path)
    r=sub.add_parser('run');r.add_argument('--config',required=True,type=Path);r.add_argument('--output',required=True,type=Path)
    args=p.parse_args()
    if args.command=='audit':
        result=audit(load_index(ROOT/'data/dghs/index.json'))
        if args.output:args.output.parent.mkdir(parents=True,exist_ok=True);write_json(args.output,result)
        else:print(json.dumps(result,ensure_ascii=False,indent=2))
    else:run(args.config,args.output)


if __name__=='__main__':main()

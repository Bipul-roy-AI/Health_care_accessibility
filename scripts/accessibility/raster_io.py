"""Aligned grids, point-to-cell validation and population-preserving zonal sums."""
import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.enums import MergeAlg
from pyproj import CRS, Transformer


def read_grids(friction_path,population_path):
    with rasterio.open(friction_path) as f,rasterio.open(population_path) as p:
        if f.count!=1 or p.count!=1:raise ValueError('One-band friction/population rasters required')
        if f.crs!=p.crs or f.transform!=p.transform or f.shape!=p.shape:raise ValueError('Population and friction must already align; population counts are never silently resampled')
        crs=CRS(f.crs)
        if not crs.is_projected or any(abs(a.unit_conversion_factor-1)>1e-9 for a in crs.axis_info[:2]):raise ValueError('The travel grid needs a projected CRS with metre axes')
        t=f.transform
        if t.b or t.d or t.a<=0 or t.e>=0:raise ValueError('Use a north-up unrotated grid')
        friction=f.read(1,masked=True).astype('float64').filled(np.nan)
        population=p.read(1,masked=True).astype('float64').filled(np.nan)
        if np.any(np.isfinite(population)&(population<0)):raise ValueError('Population raster must contain nonnegative persons per cell')
        return friction,population,f.profile.copy()


def facility_cells(rows,profile,valid):
    transformer=Transformer.from_crs(4326,profile['crs'],always_xy=True)
    selected=[];cells=[];excluded=[]
    for row in rows:
        x,y=transformer.transform(float(row['lon']),float(row['lat']))
        rr,cc=rasterio.transform.rowcol(profile['transform'],x,y)
        if not(0<=rr<profile['height'] and 0<=cc<profile['width']):reason='outside_grid'
        elif not valid[rr,cc]:reason='impassable_or_missing_friction'
        else:
            selected.append(row);cells.append(int(rr*profile['width']+cc));continue
        excluded.append({'facility_id':str(row['id']),'reason':reason})
    return selected,np.asarray(cells,int),excluded


def write_raster(path,values,profile,unit):
    values=np.asarray(values,dtype='float64').reshape(profile['height'],profile['width'])
    out=profile.copy();out.update(driver='GTiff',count=1,dtype='float64',nodata=-9999,compress='deflate')
    with rasterio.open(path,'w',**out) as dst:
        dst.write(np.where(np.isnan(values),-9999,values),1);dst.update_tags(units=unit)


def zonal_statistics(features,id_field,profile,population,physical,counts,served=None):
    """Cell-centre assignment on the native population grid; no uniform spread of totals."""
    if features.crs is None:raise ValueError('Administrative polygons need a declared CRS')
    features=features.to_crs(profile['crs'])
    if id_field not in features or features[id_field].isna().any() or features[id_field].astype(str).duplicated().any():raise ValueError('Administrative IDs must be present and unique')
    if features.empty or (~features.geometry.is_valid).any() or (~features.geom_type.isin(['Polygon','MultiPolygon'])).any():raise ValueError('Administrative polygons must be valid polygon geometries')
    shapes=list(features.geometry)
    overlap=rasterize([(g,1) for g in shapes],out_shape=population.shape,transform=profile['transform'],dtype='int32',merge_alg=MergeAlg.add)
    if np.any(overlap>1):raise ValueError('Administrative zones overlap on population cell centres; choose one administrative level per run')
    zones=rasterize([(g,i+1) for i,g in enumerate(shapes)],out_shape=population.shape,transform=profile['transform'],dtype='int32')
    valid=np.isfinite(population);result=[]
    for number,name in enumerate(features[id_field].astype(str),start=1):
        use=valid&(zones==number);total=float(population[use].sum())
        accessible=float(population[use&physical].sum());multiple=float(population[use&(counts>=2)].sum())
        row={'zone_id':name,'population':total,'physically_accessible_population':accessible,'physical_coverage_percent':accessible/total*100 if total else None,'population_with_2plus_facilities':multiple,'multiple_coverage_percent':multiple/total*100 if total else None}
        if served is not None:
            covered=float(served[use].sum())
            row.update(capacity_served_population=covered,capacity_coverage_percent=covered/total*100 if total else None,accessible_but_capacity_unserved=max(0.,accessible-covered))
        result.append(row)
    return result,{'population_outside_admin_polygons':float(population[valid&(zones==0)].sum())}

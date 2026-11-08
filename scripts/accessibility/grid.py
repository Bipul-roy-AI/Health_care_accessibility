"""Isotropic least-cost raster model; weights are minutes per metre.

These are modelled travel times, not observed road/traffic measurements. Impassable
cells cannot be crossed, including diagonal corner cutting. No facility snapping.
"""
import numpy as np
from scipy import sparse
from scipy.sparse.csgraph import dijkstra


def build_graph(friction, x_metres, y_metres, max_cells=1_000_000):
    f=np.asarray(friction,dtype=float)
    if f.ndim!=2 or f.size>max_cells:raise ValueError('Use a pilot/coarser approved grid within max_cells; no silent downsampling')
    if x_metres<=0 or y_metres<=0:raise ValueError('Pixel dimensions must be positive metres')
    valid=np.isfinite(f)&(f>0)
    h,w=f.shape;index=np.arange(f.size).reshape(f.shape)
    rows=[];cols=[];weights=[]
    for dr,dc in [(0,1),(1,0),(1,1),(1,-1)]:
        r=np.arange(0,h-dr);c=np.arange(max(0,-dc),min(w,w-dc))
        rr,cc=np.meshgrid(r,c,indexing='ij');rr2,cc2=rr+dr,cc+dc
        use=valid[rr,cc]&valid[rr2,cc2]
        if dr and dc:use&=valid[rr2,cc]&valid[rr,cc2]
        a=index[rr[use],cc[use]];b=index[rr2[use],cc2[use]]
        distance=np.hypot(dr*y_metres,dc*x_metres)
        cost=(f[rr[use],cc[use]]+f[rr2[use],cc2[use]])*.5*distance
        rows.extend([a,b]);cols.extend([b,a]);weights.extend([cost,cost])
    graph=sparse.coo_matrix((np.concatenate(weights),(np.concatenate(rows),np.concatenate(cols))),shape=(f.size,f.size)).tocsr()
    return graph,valid


def nearest(graph,seed_cells):
    seeds=np.unique(np.asarray(seed_cells,dtype=int))
    if not len(seeds):raise ValueError('No usable facilities in the travel grid')
    times,predecessors,origins=dijkstra(graph,directed=True,indices=seeds,min_only=True,return_predecessors=True)
    return times,predecessors,origins


def path_from_predecessors(predecessors,start):
    result=[int(start)];seen={int(start)}
    while predecessors[result[-1]]>=0:
        parent=int(predecessors[result[-1]])
        if parent in seen:raise ValueError('Cyclic path predecessor array')
        seen.add(parent);result.append(parent)
    return result


def path_metres(path,width,x_metres,y_metres):
    if len(path)<2:return 0.
    cells=np.asarray(path);r,c=np.divmod(cells,width)
    return float(np.hypot(np.diff(r)*y_metres,np.diff(c)*x_metres).sum())


def reachability(graph,seed_cells,population,thresholds,max_edges=2_000_000):
    """Count distinct facilities and construct sparse facility-demand travel edges.

    Co-located facilities are counted separately; no capacity/quality assumption
    follows from that count. Each unique raster seed is routed just once.
    """
    population=np.asarray(population,float).ravel()
    demand_cells=np.flatnonzero(np.isfinite(population)&(population>0))
    thresholds=sorted(set(float(t) for t in thresholds))
    if not thresholds or thresholds[0]<=0:raise ValueError('Travel thresholds must be positive minutes')
    counts={t:np.zeros(graph.shape[0],dtype=np.int32) for t in thresholds}
    seeds=np.asarray(seed_cells,dtype=int);groups={}
    for facility,cell in enumerate(seeds):groups.setdefault(int(cell),[]).append(facility)
    facility_rows=[];demand_cols=[];costs=[];n=0
    for cell,facilities in groups.items():
        times=dijkstra(graph,directed=True,indices=cell,limit=thresholds[-1])
        for t in thresholds:counts[t]+=(times<=t).astype(np.int32)*len(facilities)
        selected=np.flatnonzero(times[demand_cells]<=thresholds[-1])
        n+=len(selected)*len(facilities)
        if n>max_edges:raise ValueError('Reachability exceeds max_edges; reduce pilot extent or use a documented larger-resource backend')
        for facility in facilities:
            facility_rows.extend([facility]*len(selected));demand_cols.extend(selected)
            costs.extend(times[demand_cells[selected]])
    return counts,demand_cells,np.asarray(facility_rows,int),np.asarray(demand_cols,int),np.asarray(costs,float)

"""Capacity allocation and exact candidate-site maximum coverage.

Demand/capacity must share a defined service period and a persons-served unit.
Population is divisible in these aggregate allocation models. No beds-to-capacity
conversion is made. Results describe constrained scenarios, not clinical promises.
"""
import numpy as np
from scipy import sparse
from scipy.optimize import linprog, milp, LinearConstraint, Bounds


def capacities_and_edges(demand,capacity,facility,destination,minutes):
    d=np.asarray(demand,float);c=np.asarray(capacity,float)
    f=np.asarray(facility,int);p=np.asarray(destination,int);t=np.asarray(minutes,float)
    if np.any(~np.isfinite(d)) or np.any(d<0) or np.any(~np.isfinite(c)) or np.any(c<0):raise ValueError('Demand and capacity must be finite/nonnegative; missing capacity is not zero')
    if not (len(f)==len(p)==len(t)) or np.any(~np.isfinite(t)) or np.any(t<0):raise ValueError('Invalid travel edges')
    if len(f) and (f.min()<0 or f.max()>=len(c) or p.min()<0 or p.max()>=len(d)):raise ValueError('Edge index out of range')
    edges=np.arange(len(f))
    a=sparse.coo_matrix((np.ones(len(f)*2),(np.r_[p,len(d)+f],np.r_[edges,edges])),shape=(len(d)+len(c),len(f))).tocsr()
    return d,c,f,p,t,a


def allocate(demand,capacity,facility,destination,minutes):
    d,c,f,p,t,a=capacities_and_edges(demand,capacity,facility,destination,minutes)
    if not len(f):return {'served':np.zeros_like(d),'facility_load':np.zeros_like(c),'flows':np.zeros(0),'total_served':0.,'person_minutes':0.}
    first=linprog(-np.ones(len(f)),A_ub=a,b_ub=np.r_[d,c],bounds=(0,None),method='highs')
    if not first.success:raise RuntimeError('Capacity solver failed: '+first.message)
    maximum=float(first.x.sum())
    # Preserve maximum coverage, then minimize total person-minutes.
    second=linprog(t,A_ub=a,b_ub=np.r_[d,c],A_eq=sparse.csr_matrix(np.ones((1,len(f)))),b_eq=[maximum],bounds=(0,None),method='highs')
    if not second.success:raise RuntimeError('Travel-minimization solver failed: '+second.message)
    flows=np.maximum(second.x,0)
    served=np.bincount(p,weights=flows,minlength=len(d));load=np.bincount(f,weights=flows,minlength=len(c))
    if np.any(served>d+1e-5) or np.any(load>c+1e-5):raise RuntimeError('Capacity conservation check failed')
    return {'served':served,'facility_load':load,'flows':flows,'total_served':float(served.sum()),'person_minutes':float(flows@t)}


def select_sites(demand,capacity,facility,destination,minutes,existing_count,budget,time_limit=120):
    """Global optimum only if the MILP solver certifies optimality for supplied candidates.

    Existing facilities are always open. At most budget candidate sites may open;
    a candidate's coverage edges are disabled unless its binary opening variable
    is 1. A feasible time-limited solution is labelled uncertified, never optimum.
    """
    d,c,f,p,t,a=capacities_and_edges(demand,capacity,facility,destination,minutes)
    if not 0<=existing_count<=len(c) or budget<1:raise ValueError('Invalid existing-facility count or new-site budget')
    n=len(f);k=len(c)-existing_count
    if not k or not n:raise ValueError('No candidate sites or reachable demand')
    gate=sparse.coo_matrix((-c[existing_count:],(len(d)+np.arange(existing_count,len(c)),np.arange(k))),shape=(len(d)+len(c),k)).tocsr()
    constraints=sparse.vstack([sparse.hstack([a,gate]),sparse.csr_matrix(np.r_[np.zeros(n),np.ones(k)].reshape(1,-1))]).tocsc()
    upper=np.r_[d,c[:existing_count],np.zeros(k),budget]
    objective=np.r_[-np.ones(n),np.zeros(k)]
    result=milp(objective,integrality=np.r_[np.zeros(n),np.ones(k)],bounds=Bounds(np.zeros(n+k),np.r_[np.full(n,np.inf),np.ones(k)]),constraints=LinearConstraint(constraints,-np.inf,upper),options={'time_limit':time_limit,'mip_rel_gap':0.})
    if result.x is None:raise RuntimeError('Site solver found no feasible solution: '+result.message)
    opened=np.flatnonzero(result.x[n:]>0.5)+existing_count
    served=np.bincount(p,weights=np.maximum(result.x[:n],0),minlength=len(d))
    return {'selected_facility_indices':opened.tolist(),'served':served,'total_served':float(served.sum()),'optimality_proven':result.status==0,'solver_status':int(result.status),'mip_gap':float(result.mip_gap),'message':result.message}

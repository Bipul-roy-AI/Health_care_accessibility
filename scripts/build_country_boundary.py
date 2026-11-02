"""Rebuild Bangladesh geometry from a complete public Overpass country-relation response.
After rebuilding, independently verify the geometry and update its checksum pins.
"""
import argparse
import json
import collections
from pathlib import Path
from country_boundary import CountryBoundary
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
source=json.loads(args.input.read_text())
relations=[e for e in source['elements'] if e.get('type')=='relation' and e.get('tags',{}).get('ISO3166-1')=='BD']
assert len(relations)==1,'Expected one Bangladesh country relation'
r=relations[0]
def rings(role):
 paths=[]
 for m in r['members']:
  if m['type']=='way' and m.get('role')==role:
   pts=[(p['lon'],p['lat']) for p in m.get('geometry',[]) if p]
   if len(pts)<2:raise ValueError('Incomplete way geometry')
   paths.append(pts)
 endpoints=collections.defaultdict(list)
 for i,p in enumerate(paths):endpoints[p[0]].append(i);endpoints[p[-1]].append(i)
 left=set(range(len(paths)));out=[]
 while left:
  i=min(left);left.remove(i);ring=paths[i][:]
  while ring[-1]!=ring[0]:
   choices=[j for j in endpoints[ring[-1]] if j in left]
   if len(choices)!=1:raise ValueError(f'Boundary join ambiguity: {len(choices)}')
   j=choices[0];left.remove(j);part=paths[j]
   if part[0]!=ring[-1]:part=part[::-1]
   ring.extend(part[1:])
  out.append(ring)
 return out
outer=rings('outer');inner=rings('inner');polygons=[[o] for o in outer]
for hole in inner:
 candidates=[p for p in polygons if CountryBoundary.ring_state(*hole[0],p[0])>=0]
 if len(candidates)!=1:raise ValueError('Ambiguous inner ring')
 candidates[0].append(hole)
out={'type':'FeatureCollection','features':[{'type':'Feature','properties':{'name':'Bangladesh','ISO3166-1':'BD','osmRelation':r['id']},'geometry':{'type':'MultiPolygon','coordinates':polygons}}]}
args.output.write_text(json.dumps(out,separators=(',',':')))
c=CountryBoundary(out)
print('Ways:',collections.Counter((m['type'],m.get('role')) for m in r['members']))
print('Polygon count',len(polygons),'vertices',sum(len(g) for p in polygons for g in p),'south',min(p[1][1] for p in c.polygons),'country tags', {k:v for k,v in r['tags'].items() if k in ['name','ISO3166-1','admin_level','type','maritime']})
for n,a,b in [('Dhaka',23.8103,90.4125),('Saint Martin',20.627,92.322),('Kolkata',22.5726,88.3639),('Agartala',23.8315,91.2868),('Bay',21,89.5)]:print(n,c.contains(a,b))

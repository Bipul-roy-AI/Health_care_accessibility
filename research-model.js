'use strict';
(function(root){
  const rad = v => v * Math.PI / 180;
  function distance(a,b) {
    const x=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lon-a.lon)/2)**2;
    return 6371.0088*2*Math.atan2(Math.sqrt(Math.min(1,x)),Math.sqrt(Math.max(0,1-x)));
  }
  const point = r => r.coordinateStatus==='published' && Number.isFinite(r.lat) && Number.isFinite(r.lon);
  function select(rows, f, geography=true){return rows.filter(r=>(f.scope!=='dghs'||r.agency==='DGHS') && (f.scope!=='public'||r.ownership==='Government / autonomous') && (!f.type||r.type===f.type) && (!geography||!f.division||r.division===f.division) && (!geography||!f.district||r.districtKey===f.district));}
  function groups(rows, field){const out=new Map();for(const r of rows)out.set(r[field],(out.get(r[field])||0)+1);return [...out].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0])));}
  function districtSummary(rows, districts, division=''){
    return Object.entries(districts).filter(([,d])=>!division||d.division===division).map(([key,d])=>{const rr=rows.filter(r=>r.districtKey===key),n=rr.length,m=rr.filter(point).length;return {key,...d,count:n,mapped:m,completeness:n?100*m/n:null};});
  }
  function probe(rows, origin){
    const ranked=rows.filter(point).map(r=>({...r,km:distance(origin,r)})).sort((a,b)=>a.km-b.km||a.id.localeCompare(b.id));
    const thresholds=[1,2,5,10,20,50];
    return {nearest:ranked.slice(0,5),curve:thresholds.map(km=>({km,count:ranked.filter(r=>r.km<=km).length})),
      rings:thresholds.map((km,i)=>({label:`${i?thresholds[i-1]:0}–${km} km`,count:ranked.filter(r=>r.km<=km && (i===0||r.km>thresholds[i-1])).length})),total:ranked.length};
  }
  function csv(rows){return rows.map(row=>row.map(v=>{let s=v==null?'':String(v);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');}
  const api={distance,point,select,groups,districtSummary,probe,csv};
  if(typeof module!=='undefined')module.exports=api;else root.ResearchModel=api;
})(globalThis);

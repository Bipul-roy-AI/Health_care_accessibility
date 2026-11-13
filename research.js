'use strict';
(async()=>{
 const $=id=>document.getElementById(id), M=window.ResearchModel, fmt=n=>n.toLocaleString('en-GB'), charts={}, tables={};
 const palette=['#29664e','#bd8838','#477e9b','#8b6199','#a15050','#738d60','#746e59'];
 let data,geo,boundary,map,polygons,markers,probeLayer,selected=[],districts=[],origin=null,probeMode=false;
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const filters=()=>({scope:$('r-scope').value,division:$('r-division').value,district:$('r-district').value,type:$('r-type').value});
 const scopeLabel=()=> $('r-scope').selectedOptions[0].textContent;
 const context=(national=false)=>`${scopeLabel()} · ${$('r-type').value||'All hospital types'} · ${national?'Nationwide':[$('r-division').value,$('r-district').selectedOptions[0]?.textContent].filter(Boolean).join(' / ')} · DGHS snapshot ${data.datasetUpdatedAt.slice(0,10)}`;
 const sourceUrl=id=>`https://hrm.dghs.gov.bd/index.php/public/facility-registry/facilities/${encodeURIComponent(id)}/profile?tab=detailed-information`;
 function download(name,body,type='text/csv;charset=utf-8'){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([body],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
 function table(id,rows){tables[id]=rows;const table=document.createElement('table');rows.forEach((r,i)=>{const tr=document.createElement('tr');r.forEach(v=>{const cell=document.createElement(i?'td':'th');cell.textContent=v==null?'Not available':typeof v==='number'?v.toLocaleString('en-GB',{maximumFractionDigits:4}):v;tr.append(cell);});table.append(tr);});$(id.startsWith('table-')?id:'table-'+id).replaceChildren(table);}
 function chart(id,type,labels,series,rows,{horizontal=false,stacked=false,national=false,unit='Hospital listings',onClick=null}={}){
   if(charts[id])charts[id].destroy();
   $('context-'+id).textContent=context(national);
   table(id,rows);
   $('chart-'+id).parentElement.style.height=horizontal?Math.max(370,labels.length*25+140)+'px':'370px';
   charts[id]=new Chart($('chart-'+id),{type,data:{labels,datasets:series.map((s,i)=>({label:s.name,data:s.values,backgroundColor:type==='doughnut'?palette:palette[i%palette.length],borderColor:palette[i%palette.length],borderWidth:type==='line'?2:0,pointRadius:3,tension:0,...s.options}))},options:{responsive:true,maintainAspectRatio:false,animation:false,indexAxis:horizontal?'y':'x',plugins:{legend:{display:series.length>1||type==='doughnut',position:'bottom'},title:{display:true,text:unit},subtitle:{display:true,text:[scopeLabel(),filters().type||'All hospital types','DGHS '+data.datasetUpdatedAt.slice(0,10),national?'National comparison · BBS 2022':(filters().division||'Bangladesh')+(filters().district&&!['district','quality'].includes(id)?' / '+data.districts[filters().district].name:'')]}},scales:type==='doughnut'?{}:{x:{stacked,beginAtZero:true,...(id==='curve'?{type:'linear'}:{}),title:{display:!horizontal,text:id==='curve'?'Radius (km)':unit==='Share (%)'?'Division':horizontal?'Hospital listings':''},ticks:{maxRotation:55}},y:{stacked,beginAtZero:true,title:{display:!horizontal,text:unit},ticks:{autoSkip:!horizontal,precision:unit.includes('%')||unit.includes('100,000')?2:0}}},onClick:onClick?(_e,items)=>{if(items.length)onClick(items[0].index);}:undefined}});
 }
 function updateDistrictOptions(){const old=$('r-district').value;$('r-district').replaceChildren(new Option('All districts',''));Object.entries(data.districts).filter(([,d])=>!$('r-division').value||d.division===$('r-division').value).sort((a,b)=>a[1].name.localeCompare(b[1].name)).forEach(([k,d])=>$('r-district').add(new Option(d.name,k)));if([...$('r-district').options].some(o=>o.value===old))$('r-district').value=old;}
 function chooseDistrict(key){const d=data.districts[key];$('r-division').value=d.division;updateDistrictOptions();$('r-district').value=key;render();fit();}
 function drawRecords(){const q=$('r-search').value.trim().toLowerCase(),rows=selected.filter(r=>!q||r.name.toLowerCase().includes(q)||r.id.includes(q));$('r-record-status').textContent=`${fmt(rows.length)} matching hospital listings.`;$('r-records').innerHTML=rows.slice(0,100).map(r=>`<tr><td><a href="${sourceUrl(r.id)}" target="_blank" rel="noopener">${escape(r.name)}</a><br>ID ${escape(r.id)}</td><td>${escape(r.type)}</td><td>${escape(r.division)} / ${escape(r.district)}</td><td>${M.point(r)?'Eligible published point':escape(r.coordinateStatus||'Unavailable')}${r.districtKey?'':' · unmatched district'}</td></tr>`).join('');}
 function fit(){const f=filters(),layers=polygons.getLayers().filter(l=>!f.district?( !f.division||data.districts[l.feature.properties.researchKey].division===f.division):l.feature.properties.researchKey===f.district);if(layers.length)map.fitBounds(L.featureGroup(layers).getBounds(),{padding:[12,12]});}
 const colors=['#e7f0e9','#c0d8c8','#8bb69c','#548b69','#20573f'];
 function mapRender(){
  const metric=$('r-metric').value,byKey=new Map(districts.map(d=>[d.key,d])),max=Math.max(1,...districts.map(d=>d[metric]??0));
  const color=d=>!d||d[metric]===null?'#ddd':colors[Math.min(4,Math.floor((metric==='completeness'?d[metric]/100:d[metric]/max)*4))];
  polygons.eachLayer(layer=>{const d=byKey.get(layer.feature.properties.researchKey),isSelected=filters().district===layer.feature.properties.researchKey;layer.setStyle({fillColor:color(d),fillOpacity:d?.count===0&&metric==='count'?0.35:0.85,color:isSelected?'#c16c14':'#6c8576',weight:isSelected?3:0.7});layer.unbindTooltip();if(d)layer.bindTooltip(`${escape(d.name)}: ${fmt(d.count)} listings · ${d.completeness===null?'completeness unavailable':d.completeness.toFixed(1)+'% coordinates'}`);});
  markers.clearLayers();if($('r-points').checked)for(const r of selected.filter(M.point))L.circleMarker([r.lat,r.lon],{radius:3,color:'#a14527',weight:.6,fillColor:'#cd723f',fillOpacity:.8,bubblingMouseEvents:false}).bindPopup(`<strong>${escape(r.name)}</strong><br>${escape(r.type)}<br>${escape(r.district)} · ID ${escape(r.id)}<br><a href="${sourceUrl(r.id)}" target="_blank" rel="noopener">DGHS source profile</a><br>Published coordinate; location precision unverified.`).addTo(markers);
  $('r-legend').innerHTML=(metric==='count'?`Count scale, relative to maximum ${fmt(max)}: `:'Coordinate completeness: ')+colors.map((c,i)=>`<span class="research-legend-box" style="background:${c}"></span>${(i*(metric==='count'?max:100)/4).toFixed(metric==='count'?0:0)}`).join(' ')+` <span class="research-legend-box" style="background:#ddd"></span>No denominator / outside selected division`;
 }
 function render(){
   const f=filters();selected=M.select(data.records,f);const comparison=M.select(data.records,{...f,district:''}),national=M.select(data.records,f,false),points=selected.filter(M.point);
   districts=M.districtSummary(comparison,data.districts,f.division);
   $('r-total').textContent=fmt(selected.length);$('r-mapped').textContent=fmt(points.length);$('r-complete').textContent=selected.length?(100*points.length/selected.length).toFixed(1)+'%':'Not available';$('r-unmatched').textContent=fmt(selected.filter(r=>!r.districtKey).length);
   $('r-scope-note').textContent=f.scope==='dghs'?'Agency is explicitly DGHS. This is not the same as government ownership; it includes hospital/clinic types assigned to DGHS in the registry.':f.scope==='public'?'Government / autonomous ownership must be explicitly stated. This includes agencies other than DGHS.':'Includes all active hospital-type records in the DGHS registry, including private/NGO hospitals and unknown agency. This is not a count of DGHS-operated hospitals.';
   const ranked=[...districts].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
   chart('district','bar',ranked.slice(0,20).map(d=>d.name),[{name:'Listings',values:ranked.slice(0,20).map(d=>d.count)}],[['District','Division','Listings','Eligible coordinates','Completeness (%)'],...ranked.map(d=>[d.name,d.division,d.count,d.mapped,d.completeness])],{horizontal:true,onClick:i=>chooseDistrict(ranked[i].key)});
   for(const [id,field,type] of [['types','type','bar'],['ownership','ownership','doughnut']]){const g=M.groups(selected,field);chart(id,type,g.map(d=>d[0]),[{name:'Listings',values:g.map(d=>d[1])}],[[field,'Listings'],...g],{horizontal:id==='types'});}
   const divisions=Object.keys(data.populationSource.population.divisions),qa=divisions.filter(d=>!f.division||f.division===d).map(d=>{const rr=comparison.filter(r=>r.division===d),m=rr.filter(M.point).length;return [d,m,rr.length-m];});
   chart('quality','bar',qa.map(r=>r[0]),[{name:'Eligible coordinates',values:qa.map(r=>r[1])},{name:'Unavailable / excluded',values:qa.map(r=>r[2])}],[['Division','Eligible','Unavailable'],...qa],{stacked:true});
   const pop=data.populationSource.population.divisions,popTotal=Object.values(pop).reduce((a,b)=>a+b,0),dr=divisions.map(d=>{const n=national.filter(r=>r.division===d).length;return [d,n,pop[d],n/pop[d]*1e5,national.length?n/national.length*100:null,pop[d]/popTotal*100];});
   chart('rates','bar',divisions,[{name:'Listings per 100,000',values:dr.map(r=>r[3])}],[['Division','Listings','BBS 2022 population','Listings per 100,000'],...dr.map(r=>r.slice(0,4))],{national:true,unit:'Listings per 100,000 residents'});
   chart('shares','bar',divisions,[{name:'Hospital share (%)',values:dr.map(r=>r[4])},{name:'Population share (%)',values:dr.map(r=>r[5])}],[['Division','Hospital share (%)','BBS population share (%)'],...dr.map(r=>[r[0],r[4],r[5]])],{national:true,unit:'Share (%)'});
   // Override comparison contexts to avoid implying district-selected charts are district-only.
   for(const id of ['district','quality'])$('context-'+id).textContent=`${scopeLabel()} · ${f.type||'All hospital types'} · ${f.division||'All divisions'} · all districts · DGHS ${data.datasetUpdatedAt.slice(0,10)}`;
   mapRender();drawRecords();if(origin)calculateProbe(origin);
   const params=new URLSearchParams();for(const [k,v]of Object.entries(f))if(v)params.set(k,v);history.replaceState(null,'','?'+params.toString());
 }
 function calculateProbe(p){
   probeLayer.clearLayers();$('r-probe-results').hidden=true;
   if(!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||!boundary.contains(p.lat,p.lon)){$('r-probe-status').textContent='Choose a valid coordinate inside the project’s Bangladesh country boundary.';origin=null;return;}
   origin=p;const destinations=M.select(data.records,filters(),false),out=M.probe(destinations,p);
   $('r-probe-status').textContent=`Origin ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)} · ${fmt(out.total)} eligible destination listings nationwide. ${out.nearest.length?'Nearest: '+out.nearest[0].km.toFixed(2)+' km (straight line).':'No eligible destinations for this selection.'}`;
   L.circleMarker([p.lat,p.lon],{radius:7,color:'#172e73',fillOpacity:1,bubblingMouseEvents:false}).bindTooltip('Chosen origin').addTo(probeLayer);
   for(const km of [1,5,10])L.circle([p.lat,p.lon],{radius:km*1000,color:'#536c9a',weight:1,fill:false,interactive:false}).addTo(probeLayer);
   if(out.nearest.length){const n=out.nearest[0];L.polyline([[p.lat,p.lon],[n.lat,n.lon]],{color:'#283b87',dashArray:'5 5',interactive:false}).addTo(probeLayer);}
   $('r-nearest').innerHTML=out.nearest.map(r=>`<tr><td><a href="${sourceUrl(r.id)}" target="_blank" rel="noopener">${escape(r.name)}</a></td><td>${escape(r.district)}</td><td>${r.km.toFixed(3)}</td></tr>`).join('');$('r-probe-results').hidden=false;
   chart('curve','line',out.curve.map(r=>r.km),[{name:'Hospitals within radius',values:out.curve.map(r=>r.count)}],[['Radius (km)','Hospital listings'],...out.curve.map(r=>[r.km,r.count])],{national:true});
   chart('rings','bar',out.rings.map(r=>r.label),[{name:'Hospital listings in band',values:out.rings.map(r=>r.count)}],[['Distance band','Hospital listings'],...out.rings.map(r=>[r.label,r.count])],{national:true});
   for(const id of ['curve','rings']){$('context-'+id).textContent=`${context(true)} · origin ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)} · straight-line distance; NOT population coverage`;charts[id].options.plugins.subtitle.text=[`Origin ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)} · straight-line distance`,scopeLabel(),filters().type||'All types','DGHS '+data.datasetUpdatedAt.slice(0,10)];charts[id].update();}
 }
 try{
   const load=async url=>{const r=await fetch(url);if(!r.ok)throw new Error('Unavailable data: '+url);return r.json();};
   [data,geo,boundary]=await Promise.all([load('./data/research/hospitals.json'),load('./data/research/districts.geojson'),CountryBoundary.load()]);
   if(data.schemaVersion!==1||!Array.isArray(data.records)||geo.features.length!==64)throw new Error('Research snapshot or district geometry is invalid');
   const norm=s=>{let k=s.toLowerCase().replace(/[^a-z0-9]/g,'');return ({barisal:'barishal',chittagong:'chattogram',bogra:'bogura',comilla:'cumilla',jessore:'jashore',brahamanbaria:'brahmanbaria',jhalokati:'jhalokathi',khagrachhari:'khagrachari',nawabganj:'chapainawabganj'})[k]||k;};
   for(const f of geo.features){f.properties.researchKey=norm(f.properties.shapeName);if(!data.districts[f.properties.researchKey])throw new Error('Unmatched district boundary');}
   for(const d of Object.keys(data.populationSource.population.divisions))$('r-division').add(new Option(d,d));for(const t of data.hospitalTypes)$('r-type').add(new Option(t,t));
   const params=new URLSearchParams(location.search);for(const k of ['scope','division','type']){const el=$('r-'+k),v=params.get(k);if([...el.options].some(o=>o.value===v))el.value=v;}
   updateDistrictOptions();if([...$('r-district').options].some(o=>o.value===params.get('district')))$('r-district').value=params.get('district');
   $('research-content').hidden=false;
   map=L.map('research-map',{preferCanvas:true,scrollWheelZoom:false}).setView([23.7,90.3],7);map.attributionControl.addAttribution('<a href="https://www.geoboundaries.org/">geoBoundaries</a> · DGHS');
   polygons=L.geoJSON(geo,{onEachFeature:(f,l)=>l.on('click',e=>{if(probeMode)return;chooseDistrict(f.properties.researchKey);L.DomEvent.stopPropagation(e);})}).addTo(map);markers=L.layerGroup().addTo(map);probeLayer=L.layerGroup().addTo(map);
   map.on('click',e=>{if(!probeMode)return;$('r-lat').value=e.latlng.lat.toFixed(6);$('r-lon').value=e.latlng.lng.toFixed(6);calculateProbe({lat:e.latlng.lat,lon:e.latlng.lng});probeMode=false;$('r-probe-mode').setAttribute('aria-pressed','false');$('r-probe-mode').textContent='Probe a place on the map';});
   for(const k of ['scope','division','district','type'])$('r-'+k).addEventListener('change',()=>{if(k==='division'){ $('r-district').value='';updateDistrictOptions();}render();if(k==='division'||k==='district')fit();});
   $('r-metric').onchange=mapRender;$('r-points').onchange=mapRender;$('r-extent').onclick=fit;$('r-search').oninput=drawRecords;
   $('r-reset').onclick=()=>{$('r-scope').value='dghs';$('r-division').value='';$('r-type').value='';$('r-district').value='';$('r-search').value='';origin=null;probeMode=false;probeLayer.clearLayers();$('r-probe-results').hidden=true;$('r-probe-status').textContent='Choose a place to calculate distances.';$('r-probe-mode').setAttribute('aria-pressed','false');$('r-probe-mode').textContent='Probe a place on the map';updateDistrictOptions();render();fit();};
   $('r-probe-form').onsubmit=e=>{e.preventDefault();calculateProbe({lat:Number($('r-lat').value),lon:Number($('r-lon').value)});};
   $('r-probe-mode').onclick=()=>{probeMode=!probeMode;$('r-probe-mode').setAttribute('aria-pressed',String(probeMode));$('r-probe-mode').textContent=probeMode?'Click the map to choose an origin':'Probe a place on the map';if(probeMode)$('research-map').scrollIntoView({behavior:'smooth',block:'center'});};
   $('r-export').onclick=()=>{const fields=['id','name','type','agency','ownership','division','district','districtKey','coordinateStatus','lat','lon'];download('hospital-selection.csv',M.csv([fields,...selected.map(r=>fields.map(f=>r[f]))]));};
   $('r-areas-export').onclick=()=>download('hospital-district-comparison.csv',M.csv([['District','Division','Listings','Eligible coordinates','Completeness (%)'],...districts.map(d=>[d.name,d.division,d.count,d.mapped,d.completeness])]));
   $('r-geojson').onclick=()=>download('hospital-points.geojson',JSON.stringify({type:'FeatureCollection',source:'DGHS registry',datasetUpdatedAt:data.datasetUpdatedAt,selection:filters(),features:selected.filter(M.point).map(r=>({type:'Feature',geometry:{type:'Point',coordinates:[r.lon,r.lat]},properties:r}))}), 'application/geo+json');
   document.querySelectorAll('[data-png]').forEach(b=>b.onclick=()=>{const id=b.dataset.png;if(!charts[id])return;const a=document.createElement('a');a.href=charts[id].toBase64Image();a.download=`hospital-${id}.png`;a.click();});
   document.querySelectorAll('[data-csv]').forEach(b=>b.onclick=()=>{const id=b.dataset.csv;if(tables[id])download(`hospital-${id}.csv`,M.csv([['Context',$('context-'+id).textContent],...tables[id]]));});
   $('r-bbs-source').href=data.populationSource.url;$('r-hospital-types').textContent='Included exact DGHS facility types: '+data.hospitalTypes.join('; ')+'.';
   $('r-provenance').textContent=`Registry report export: ${data.reportExportedAt?.slice(0,10)||'not recorded'}. Profile snapshot updated through ${data.datasetUpdatedAt.slice(0,10)}; individual record dates differ. Population: BBS adjusted Census 2022, Table ${data.populationSource.population.table}. Source SHA-256: ${data.indexSHA256}.`;
   $('research-status').textContent=`Loaded ${fmt(data.records.length)} active hospital-type records from the DGHS snapshot; 64 district boundaries. Filters below define the displayed subset.`;
   render();fit();
 }catch(e){$('research-content').hidden=true;$('research-status').className='research-error';$('research-status').textContent='The research explorer could not load its required data. No results are shown. Please reload or try again later. '+e.message;}
})();

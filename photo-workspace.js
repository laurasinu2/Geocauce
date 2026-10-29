/* GeoCauce R29 | Photo and georeferenced point workspace for the PWA.
 * Uses existing IndexedDB photo records, legacy photo-point state and map rasters.
 * No network calls, new storage engine, or automatic data migrations.
 */
(function(root){
'use strict';
let api=null,dialog=null,tab='photos',rows=[],selected=-1,busy=false,seq=0,map=null,ctx=null,view={cx:0,cy:0,scale:1},previewUrls=[],galleryUrls=[],galleryRecords=[],galleryPage=0,selectedGalleryId=null;
const $=s=>document.querySelector(s);
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const fmt=n=>Number.isFinite(n)?Number(n).toFixed(5):'—';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>root.crypto?.randomUUID?.()||('photo-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));
const validXY=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const release=refs=>{for(const u of refs.splice(0))URL.revokeObjectURL(u);};
function status(row){if(row.excluded)return'excluded';if(row.error)return'error';if(row.duplicate)return'duplicate';return row.world?'valid':'no-coordinates';}
function locationOf(record){
 if(record.manualWorld)return record.manualWorld;
 if(record.gps)return api.project(record.gps.lon,record.gps.lat);
 return record.world||null;
}
function photoDetails(row){const info=row.metadata||{};return [row.name,row.gps?fmt(row.gps.lat)+'°, '+fmt(row.gps.lon)+'°':'Sin coordenadas',info.dateOriginal||'',row.file?.size?Math.round(row.file.size/1024)+' KB':''].filter(Boolean).join(' · ');}
function buttons(){
 return '<div class="gc-work-head"><div><strong>Importar elementos</strong><small>Añade puntos o fotografías georreferenciadas al proyecto</small></div><button type="button" id="gcImportClose" aria-label="Cerrar">✕</button></div>'+
 '<div class="gc-work-tabs"><button data-tab="photos" class="active">📷 Fotografías</button><button data-tab="points">📍 Puntos</button></div>'+
 '<div class="gc-work-grid"><section class="gc-work-left">'+
 '<label class="gc-drop" id="gcDrop"><span>📁</span><b id="gcDropTitle">Selecciona fotografías</b><small id="gcDropHelp">JPG / JPEG con GPS EXIF o ubicación manual · puedes elegir muchos archivos</small><span class="gc-pick">Explorar archivos</span><input id="gcFiles" type="file" accept=".jpg,.jpeg,image/jpeg" multiple hidden></label>'+
 '<div class="gc-settings"><h3>⚙ Opciones de importación</h3><label>Nombre de la capa<input id="gcLayerName" type="text" value="Fotografías de campo" maxlength="90"></label><label id="gcPointCrsRow" class="hidden">CRS de los puntos<select id="gcPointCrs"><option value="4326">WGS84 · EPSG:4326</option><option value="25831">ETRS89 / UTM 31N</option><option value="25830">ETRS89 / UTM 30N</option></select></label><label class="gc-check"><input id="gcDuplicates" type="checkbox" checked> Detectar y excluir duplicados</label><label class="gc-check"><input id="gcKeepUnlocated" type="checkbox" checked> Conservar fotografías sin coordenadas</label><label class="gc-check"><input id="gcThumbnails" type="checkbox" checked> Miniaturas de vista previa</label></div>'+
 '<div class="gc-work-actions"><button id="gcImportCommit" class="gc-primary" type="button" disabled>Importar fotografías</button><div class="gc-import-progress hidden" id="gcImportProgress"><div><span id="gcProgressText"></span><span id="gcProgressCount"></span></div><progress id="gcProgressBar" max="1" value="0"></progress></div><p id="gcImportFeedback" aria-live="polite"></p></div></section>'+
 '<section class="gc-work-right"><div class="gc-preview-head"><div><b>◉ Vista previa</b><small>Revisa las posiciones antes de importar</small></div><span id="gcCountLabel">0 elementos</span></div>'+
 '<div class="gc-map-box"><canvas id="gcPreviewMap" aria-label="Mapa georreferenciado de vista previa"></canvas><div class="gc-map-controls"><button id="gcMapPlus" type="button">+</button><button id="gcMapMinus" type="button">−</button><button id="gcMapFit" type="button" title="Mostrar todos">⌗</button></div><p id="gcMapHint">Selecciona archivos para ver su ubicación</p></div>'+
 '<div class="gc-list-head"><b>☷ Lista de elementos</b><span id="gcCounters"></span></div><div id="gcImportRows" class="gc-import-rows"></div>'+
 '</section></div>';
}
function show(){
 if(!api)return;
 if(!api.getState().projectId){api.notify('Abre un proyecto antes de importar');return;}
 if(!api.canEdit()){api.notify('Esta campaña es de solo lectura. Crea una nueva jornada para importar');return;}
 if(!dialog){
  dialog=el('div','gc-work-modal hidden');dialog.id='gcImportModal';dialog.innerHTML='<div class="gc-work-backdrop"></div><div class="gc-work-card">'+buttons()+'</div>';
  document.body.appendChild(dialog);dialog.querySelector('.gc-work-backdrop').onclick=()=>{if(!busy)close();};
  $('#gcImportClose').onclick=close;
  dialog.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
  $('#gcDrop').addEventListener('click',e=>{if(e.target.tagName!=='INPUT')$('#gcFiles').click();});
  $('#gcFiles').addEventListener('change',e=>{const files=[...e.target.files];e.target.value='';stage(files);});
  for(const event of ['dragenter','dragover'])$('#gcDrop').addEventListener(event,e=>{e.preventDefault();$('#gcDrop').classList.add('gc-over');});
  $('#gcDrop').addEventListener('dragleave',()=>$('#gcDrop').classList.remove('gc-over'));
  $('#gcDrop').addEventListener('drop',e=>{e.preventDefault();$('#gcDrop').classList.remove('gc-over');stage([...e.dataTransfer.files]);});
  $('#gcDuplicates').onchange=()=>{for(const row of rows)row.duplicate=$('#gcDuplicates').checked&&!!row.duplicateHash;render();};
  $('#gcKeepUnlocated').onchange=render;
  $('#gcPointCrs').onchange=()=>{if(tab==='points')stagePoints();};
  $('#gcMapPlus').onclick=()=>{view.scale*=1.6;paint();};
  $('#gcMapMinus').onclick=()=>{view.scale/=1.6;paint();};
  $('#gcMapFit').onclick=fitAll;
  $('#gcImportCommit').onclick=commit;
  map=$('#gcPreviewMap');ctx=map.getContext('2d');installMapControls();
 }
 tab='photos';rows=[];selected=-1;busy=false;seq++;
 setTab('photos');
 dialog.classList.remove('hidden');
 $('#gcLayerName').value='Fotografías de campo';
 $('#gcImportFeedback').textContent='';
 requestAnimationFrame(()=>{resizeMap();fitAll();render();});
}
function close(){if(busy){api.notify('La importación está guardando archivos; no cierres la ventana');return;}seq++;release(previewUrls);rows=[];selected=-1;dialog?.classList.add('hidden');}
function setTab(next){
 if(busy)return;
 const same=next===tab;tab=next;if(!same){rows=[];selected=-1;seq++;release(previewUrls);}
 dialog.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
 $('#gcDropTitle').textContent=tab==='photos'?'Selecciona fotografías':'Selecciona archivos de puntos';
 $('#gcDropHelp').textContent=tab==='photos'?'JPG / JPEG con GPS EXIF o ubicación manual · selección múltiple':'CSV, GeoJSON, GPX o KML · varios puntos por archivo';
 $('#gcFiles').accept=tab==='photos'?'.jpg,.jpeg,image/jpeg':'.csv,.geojson,.json,.gpx,.kml';
 $('#gcPointCrsRow').classList.toggle('hidden',tab!=='points');
 $('#gcDuplicates').parentElement.classList.toggle('hidden',tab!=='photos');
 $('#gcKeepUnlocated').parentElement.classList.toggle('hidden',tab!=='photos');
 $('#gcThumbnails').parentElement.classList.toggle('hidden',tab!=='photos');
 $('#gcLayerName').value=tab==='photos'?'Fotografías de campo':'Puntos importados';
 $('#gcImportCommit').textContent=tab==='photos'?'Importar fotografías':'Importar puntos';
 render();
}
async function hashes(){
 const existing=await api.allPhotos(),h=new Set();
 for(const p of existing)if(p.contentHash)h.add(p.contentHash);
 return h;
}
async function stage(files){
 if(busy||!files.length)return;
 const run=++seq;rows=[];selected=-1;release(previewUrls);
 $('#gcImportFeedback').textContent='Leyendo archivos…';
 progress(true,0,files.length,'Leyendo archivos');
 if(tab==='points'){await stagePoints(files,run);return;}
 try{
  const known=await hashes();
  const prepared=await root.GeoCauceUnifiedPhotos.analyzePhotoBatch(files,{existingHashes:[...known],onProgress:({processed,total})=>{if(run===seq)progress(true,processed,total,'Leyendo y verificando EXIF');}});
  if(run!==seq)return;
  rows=prepared.map((p,i)=>({
   key:uid(),file:p.file,name:p.name,metadata:p.metadata,gps:p.gps,
   error:p.error,duplicateHash:p.status==='duplicate',duplicate:p.status==='duplicate',
   hash:p.hash,excluded:false,index:i,manualWorld:null,world:p.gps?api.project(p.gps.lon,p.gps.lat):null
  }));
  $('#gcImportFeedback').textContent='Revisa los elementos antes de confirmar. Puedes editar coordenadas desde cada fila.';
  progress(false);fitAll();render();
 }catch(e){progress(false);$('#gcImportFeedback').textContent='Error al preparar archivos: '+(e.message||e);}
}
function parsePointFile(text,name,crs){
 const format=name.toLowerCase().split('.').pop(),points=[];
 if(format==='csv'){
  const csv=root.GeoCauceUnifiedPhotos.parseCsv(text),cols=csv.columns;
  const find=(patterns)=>cols.find(c=>patterns.some(p=>p.test(c.trim().toLowerCase())));
  const xField=find(crs===4326?[/^lon(gitude)?$/, /^long$/, /^x$/]:[/^x$/, /^easting$/, /^este$/, /^utm_x$/]);
  const yField=find(crs===4326?[/^lat(itude)?$/, /^y$/]:[/^y$/, /^northing$/, /^norte$/, /^utm_y$/]);
  const nameField=find([/^name$/, /^nombre$/, /^nom$/, /^id$/]);
  if(!xField||!yField)throw Error('CSV: no se detectan las columnas X/Y o Lat/Lon');
  csv.rows.forEach((r,i)=>points.push({name:r[nameField]||'Punto '+(i+1),x:Number(String(r[xField]).replace(',','.')),y:Number(String(r[yField]).replace(',','.')),properties:r,crs}));
 }else if(format==='geojson'||format==='json'){
  const f=JSON.parse(text);if(f.crs?.properties?.name&&/2583[01]/.test(f.crs.properties.name))crs=Number(f.crs.properties.name.match(/2583[01]/)[0]);
  for(const rec of root.GeoCauceUnifiedPhotos.pointRecords(f))points.push({name:rec.name,x:rec.lon,y:rec.lat,properties:rec.properties,crs:4326});
 }else if(format==='gpx'||format==='kml'){
  const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('XML inválido');
  if(format==='gpx'){
   const all=[...doc.getElementsByTagName('wpt'),...doc.getElementsByTagName('trkpt'),...doc.getElementsByTagName('rtept')];
   all.forEach((n,i)=>points.push({name:n.getElementsByTagName('name')[0]?.textContent||'Punto '+(i+1),x:Number(n.getAttribute('lon')),y:Number(n.getAttribute('lat')),properties:{},crs:4326}));
  }else{
   const all=[...doc.getElementsByTagName('Placemark')];
   all.forEach((n,i)=>{const c=n.getElementsByTagName('Point')[0]?.getElementsByTagName('coordinates')[0]?.textContent?.trim().split(',');if(c)points.push({name:n.getElementsByTagName('name')[0]?.textContent||'Punto '+(i+1),x:Number(c[0]),y:Number(c[1]),properties:{},crs:4326});});
  }
 }else throw Error('Formato de puntos no compatible');
 return points;
}
async function stagePoints(files=[],run=seq){
 if(!files.length)return;
 rows=[];selected=-1;const crs=Number($('#gcPointCrs').value);
 for(let index=0;index<files.length;index++){
  if(run!==seq)return;
  const f=files[index];
  try{
   const entries=parsePointFile(await f.text(),f.name,crs);
   for(const p of entries){
    let world=null,error=null;
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y))error='Coordenadas no numéricas';
    else if(p.crs===4326&&Math.abs(p.y)<=90&&Math.abs(p.x)<=180)world=api.project(p.x,p.y);
    else if(p.crs===25830||p.crs===25831){
     const ll=api.unproject(p.x,p.y,p.crs);
     if(ll&&Math.abs(ll.lat)<=90&&Math.abs(ll.lon)<=180)world=api.project(ll.lon,ll.lat);
     else error='No se pueden transformar las coordenadas UTM';
    }else error='Coordenadas fuera de rango';
    rows.push({key:uid(),file:f,name:p.name,world,point:p,excluded:false,error,index:rows.length});
   }
  }catch(e){rows.push({key:uid(),file:f,name:f.name,error:String(e.message||e),excluded:false});}
  progress(true,index+1,files.length,'Leyendo puntos');
 }
 progress(false);$('#gcImportFeedback').textContent='Revisa los puntos y confirma su importación.';fitAll();render();
}
function progress(on,done=0,total=1,title=''){
 const p=$('#gcImportProgress');if(!p)return;
 p.classList.toggle('hidden',!on);
 $('#gcProgressBar').max=Math.max(1,total);$('#gcProgressBar').value=done;
 $('#gcProgressText').textContent=title;
 $('#gcProgressCount').textContent=done+' / '+total;
}
function resizeMap(){if(!map)return;const r=map.getBoundingClientRect();if(!r.width||!r.height)return;const dpr=Math.min(2,root.devicePixelRatio||1);map.width=Math.max(2,Math.round(r.width*dpr));map.height=Math.max(2,Math.round(r.height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);paint();}
function dimensions(){const r=map.getBoundingClientRect();return {w:r.width||600,h:r.height||300};}
function screen(world){const {w,h}=dimensions();return {x:w/2+(world.x-view.cx)*view.scale,y:h/2-(world.y-view.cy)*view.scale};}
function world(x,y){const {w,h}=dimensions();return {x:view.cx+(x-w/2)/view.scale,y:view.cy-(y-h/2)/view.scale};}
function fitAll(){
 if(!map)return;
 const valid=rows.map(r=>locationOf(r)).filter(validXY);
 const rasterBounds=(api.getState().rasters||[]).filter(r=>r.visible!==false&&r.georef&&r.affine).map(r=>{
  const a=r.affine,width=r.image?.width||0,height=r.image?.height||0;
  return [{x:a.C,y:a.F},{x:a.C+a.A*width+a.B*height,y:a.F+a.D*width+a.E*height}];
 }).flat();
 const pts=valid.length?valid:rasterBounds.length?rasterBounds:[{x:api.getState().view.cx||0,y:api.getState().view.cy||0}];
 const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),{w,h}=dimensions();
 const spanX=Math.max(30,maxX-minX),spanY=Math.max(30,maxY-minY);
 view={cx:(minX+maxX)/2,cy:(minY+maxY)/2,scale:Math.min(1000,Math.max(.000001,Math.min(w/spanX,h/spanY)*.77))};paint();
}
function paint(){
 if(!ctx||!map)return;const {w,h}=dimensions(),dpr=Math.min(2,root.devicePixelRatio||1);
 ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#e7e8da';ctx.fillRect(0,0,w,h);
 ctx.strokeStyle='rgba(72,92,70,.11)';ctx.lineWidth=1;
 for(let x=0;x<w;x+=42){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
 for(let y=0;y<h;y+=42){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
 for(const raster of api.getState().rasters||[]){
  if(raster.visible===false||!raster.image||!raster.affine)continue;
  const a=raster.affine;ctx.save();ctx.globalAlpha=Number.isFinite(raster.opacity)?raster.opacity:1;
  ctx.transform(view.scale*a.A,-view.scale*a.D,view.scale*a.B,-view.scale*a.E,w/2+view.scale*(a.C-view.cx),h/2-view.scale*(a.F-view.cy));
  try{ctx.drawImage(raster.image,0,0);}catch(e){}
  ctx.restore();
 }
 const buckets=new Map();
 for(let i=0;i<rows.length;i++){
  const r=rows[i],p=locationOf(r);if(!validXY(p)||r.excluded)continue;
  const s=screen(p),key=Math.round(s.x/28)+','+Math.round(s.y/28);
  if(!buckets.has(key))buckets.set(key,{x:s.x,y:s.y,indices:[]});
  buckets.get(key).indices.push(i);
 }
 map._clusters=[...buckets.values()];
 for(const b of map._clusters){
  const active=b.indices.includes(selected);
  ctx.beginPath();ctx.arc(b.x,b.y,active?16:13,0,Math.PI*2);
  ctx.fillStyle=active?'#e6a455':'#315d43';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke();
  ctx.fillStyle='#fff';ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(b.indices.length>1?String(b.indices.length):tab==='photos'?'▣':'●',b.x,b.y);
 }
 $('#gcMapHint').textContent=rows.some(r=>validXY(locationOf(r)))?'Selecciona un marcador · pellizca para ampliar':'Sin puntos ubicados · puedes asignar coordenadas manuales';
}
function installMapControls(){
 let contacts=new Map(),moved=false,manual=-1;
 const pos=e=>{const r=map.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
 map.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;contacts.set(e.pointerId,pos(e));moved=false;map.setPointerCapture?.(e.pointerId);e.preventDefault();});
 map.addEventListener('pointermove',e=>{
  if(!contacts.has(e.pointerId))return;
  const before=[...contacts.values()],p=pos(e);contacts.set(e.pointerId,p);
  if(contacts.size===2){const after=[...contacts.values()],old=Math.hypot(before[0].x-before[1].x,before[0].y-before[1].y),next=Math.hypot(after[0].x-after[1].x,after[0].y-after[1].y);if(old>0)view.scale=Math.max(.000001,Math.min(10000,view.scale*next/old));view.cx-=(p.x-before[[...contacts.keys()].indexOf(e.pointerId)].x)/view.scale;view.cy+=(p.y-before[[...contacts.keys()].indexOf(e.pointerId)].y)/view.scale;}
  else{const dx=p.x-before[0].x,dy=p.y-before[0].y;if(Math.abs(dx)+Math.abs(dy)>.3){view.cx-=dx/view.scale;view.cy+=dy/view.scale;}}
  moved=true;paint();e.preventDefault();
 });
 map.addEventListener('pointerup',e=>{
  if(!contacts.has(e.pointerId))return;contacts.delete(e.pointerId);
  if(!moved&&contacts.size===0){const p=pos(e),manualIndex=Number(map.dataset.manualIndex);
   if(Number.isInteger(manualIndex)&&manualIndex>=0&&rows[manualIndex]){
    rows[manualIndex].manualWorld=world(p.x,p.y);rows[manualIndex].gps=null;map.dataset.manualIndex='';selected=manualIndex;render();return;
   }
   const hit=(map._clusters||[]).find(b=>Math.hypot(b.x-p.x,b.y-p.y)<23);
   if(hit){selected=hit.indices[0];render();}
  }
 });
 map.addEventListener('pointercancel',e=>contacts.delete(e.pointerId));
 map.addEventListener('wheel',e=>{e.preventDefault();const p=pos(e),before=world(p.x,p.y);view.scale=Math.max(.000001,Math.min(10000,view.scale*(e.deltaY<0?1.25:.8)));const after=world(p.x,p.y);view.cx+=before.x-after.x;view.cy+=before.y-after.y;paint();},{passive:false});
 root.addEventListener('resize',()=>{if(dialog&&!dialog.classList.contains('hidden'))resizeMap();});
}
function render(){
 if(!dialog)return;
 const active=rows.filter(r=>!r.excluded);
 const valid=active.filter(r=>status(r)==='valid').length,missing=active.filter(r=>status(r)==='no-coordinates').length,duplicate=active.filter(r=>status(r)==='duplicate').length,error=active.filter(r=>status(r)==='error').length;
 $('#gcCountLabel').textContent=active.length+' elementos';
 $('#gcCounters').textContent=valid+' válidos · '+missing+' sin GPS · '+duplicate+' duplicados · '+error+' errores';
 const root=$('#gcImportRows');root.replaceChildren();release(previewUrls);
 const maxRows=100;const displayed=rows.slice(0,maxRows);
 displayed.forEach((r,i)=>{
  const item=el('div','gc-import-row'+(selected===i?' selected':'')+(r.excluded?' excluded':''));
  const preview=el('div','gc-import-thumb');
  if(tab==='photos'&&r.file&&!r.error&&$('#gcThumbnails').checked){
   const u=URL.createObjectURL(r.file);previewUrls.push(u);const img=el('img');img.src=u;img.alt='';img.loading='lazy';preview.appendChild(img);
  }else preview.textContent=tab==='photos'?'📷':'📍';
  const summary=el('div','gc-import-summary');summary.innerHTML='<b>'+escape(r.name)+'</b><small>'+escape(r.error||((r.gps?fmt(r.gps.lat)+', '+fmt(r.gps.lon):r.manualWorld?'Ubicación manual · EPSG:'+api.epsg():'Sin coordenadas')+(r.metadata?.dateOriginal?' · '+r.metadata.dateOriginal:'')))+'</small>';
  const pill=el('span','gc-import-state '+status(r),({valid:'Válida',duplicate:'Duplicada','no-coordinates':'Sin GPS',error:'Error',excluded:'Excluida'})[status(r)]);
  const edit=el('button','gc-row-edit','✎');edit.title='Editar ubicación';edit.disabled=tab!=='photos'||!!r.error||busy;
  edit.onclick=ev=>{ev.stopPropagation();editCoordinates(i);};
  const del=el('button','gc-row-remove',r.excluded?'↺':'×');del.title=r.excluded?'Incluir':'Excluir';del.disabled=busy;
  del.onclick=ev=>{ev.stopPropagation();r.excluded=!r.excluded;render();};
  item.append(preview,summary,pill,edit,del);
  item.onclick=()=>{selected=i;const w=locationOf(r);if(validXY(w)){view.cx=w.x;view.cy=w.y;}render();};
  root.appendChild(item);
 });
 if(rows.length>maxRows){const note=el('p','gc-row-note','Se muestran los primeros '+maxRows+' elementos; el lote completo contiene '+rows.length+'.');root.appendChild(note);}
 const candidates=rows.filter(r=>!r.excluded&&!r.error&&(!r.duplicate||!$('#gcDuplicates').checked)&&(r.world||$('#gcKeepUnlocated').checked));
 $('#gcImportCommit').disabled=busy||!candidates.length;
 $('#gcImportCommit').textContent=tab==='photos'?'Importar fotografías ('+candidates.length+')':'Importar puntos ('+candidates.length+')';
 paint();
}
function editCoordinates(i){
 const row=rows[i];if(!row)return;
 const value=row.gps?fmt(row.gps.lat)+', '+fmt(row.gps.lon):'';
 const answer=prompt('Coordenadas WGS84: latitud, longitud (deja vacío para seleccionar sobre el mapa)',value);
 if(answer===null)return;
 if(!answer.trim()){map.dataset.manualIndex=String(i);selected=i;$('#gcImportFeedback').textContent='Toca el mapa para asignar la posición a '+row.name;render();return;}
 const normalized=answer.replace(/;/g,',').split(/,\s*/);
 if(normalized.length!==2){api.notify('Introduce latitud y longitud separadas por coma');return;}
 const lat=Number(normalized[0]),lon=Number(normalized[1]);if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){api.notify('Coordenadas fuera de rango');return;}
 row.manualWorld=api.project(lon,lat);row.manualGps={lat,lon};selected=i;fitAll();render();
}
async function commit(){
 if(busy||!api.canEdit()){api.notify('Campaña de solo lectura');return;}
 const candidates=rows.filter(r=>!r.excluded&&!r.error&&(!r.duplicate||!$('#gcDuplicates').checked)&&(tab==='points'||locationOf(r)||$('#gcKeepUnlocated').checked));
 if(!candidates.length)return;
 busy=true;render();const startedProject=api.getState().projectId,startedCampaign=api.getState().campaign;
 const group=$('#gcLayerName').value.trim()||(tab==='photos'?'Fotografías de campo':'Puntos importados');
 let done=0,failed=0,skipped=0;
 progress(true,0,candidates.length,tab==='photos'?'Guardando fotografías localmente':'Guardando puntos localmente');
 for(const row of candidates){
  try{
   if(startedProject!==api.getState().projectId)throw Error('Se ha cambiado de proyecto durante la importación');
   if(tab==='points'){
    if(!validXY(locationOf(row)))throw Error('Punto sin coordenadas');
    const w=locationOf(row);api.getState().mapPins.push({id:'mp-'+uid(),kind:'gps',x:w.x,y:w.y,crs:api.epsg(),label:row.name,attributes:row.point?.properties||{},importGroup:group,createdAt:Date.now(),campaignId:startedCampaign});
    api.persist();done++;
   }else{
    if(row.hash){
     const prev=await api.findPhotoByHash(row.hash);
     if(prev){skipped++;row.excluded=true;continue;}
    }
    const w=locationOf(row),id='p'+uid(),pointId=w?'hp'+uid():null;
    const exifDate=row.metadata?.dateOriginal||null;
    const captured=exifDate&&/^\d{4}:\d{2}:\d{2}/.test(exifDate)?exifDate.slice(0,10).replaceAll(':','-'):null;
    const gnss=w?{x:w.x,y:w.y,crs:api.epsg(),lat:row.manualGps?.lat??row.gps?.lat??null,lon:row.manualGps?.lon??row.gps?.lon??null,accuracy:null,source:row.manualWorld?'manual':row.gps?'exif':'map'}:null;
    const record={id,blob:row.file,name:row.name,date:Date.now(),captureDate:captured,captureDateSource:captured?'exif':'unknown',createdAt:Date.now(),campaignId:startedCampaign,featureId:null,contentHash:row.hash,importGroup:group,historicalPointId:pointId,gnss,heading:row.metadata?.heading??null,exifOrientation:row.metadata?.orientation??null,originalSize:row.file.size,originalMime:row.file.type,positionSource:gnss?.source||'none'};
    await api.savePhoto(record);
    const saved=await api.readPhoto(id);
    if(!saved?.blob||saved.blob.size!==row.file.size)throw Error('No se ha verificado el guardado local');
    if(pointId){api.getState().historicalPhotoPoints.push({id:pointId,name:row.name,x:w.x,y:w.y,crs:api.epsg(),photoPointPosition:{x:w.x,y:w.y,crs:api.epsg()},photos:[id],importGroup:group,campaignId:startedCampaign,createdAt:Date.now()});api.persist();}
    done++;
   }
   row.excluded=true;
  }catch(e){failed++;row.error='Error al guardar: '+(e.message||e);console.warn('GeoCauce: importación parcial',row.name,e);}
  finally{progress(true,done+failed+skipped,candidates.length,tab==='photos'?'Almacenamiento local confirmado':'Registrando puntos');await new Promise(resolve=>setTimeout(resolve,0));}
 }
 api.redraw();busy=false;progress(false);
 $('#gcImportFeedback').textContent=done+' '+(tab==='photos'?'fotografías':'puntos')+' guardados localmente; '+failed+' con error; '+skipped+' ya existentes. La sincronización con la nube seguirá la cola habitual.';
 render();
}
async function showGallery(){
 if(!api.getState().projectId){api.notify('Abre un proyecto para ver fotografías');return;}
 if(!$('#gcGalleryModal')){
  const host=el('div','gc-gallery-modal hidden');host.id='gcGalleryModal';
  host.innerHTML='<div class="gc-gallery-shade"></div><section class="gc-gallery-card"><header><div><h2>Fotografías</h2><small>Imágenes de campo y archivo · todas las fechas</small></div><div><button id="gcGalleryImport">＋ Importar</button><button id="gcGalleryClose">✕</button></div></header><div class="gc-gallery-body"><aside><div class="gc-gallery-filters"><input id="gcPhotoSearch" placeholder="Buscar fotografía"><select id="gcPhotoFilter"><option value="all">Todas</option><option value="located">Con coordenadas</option><option value="unlocated">Sin coordenadas</option></select></div><div id="gcGalleryGrid" class="gc-gallery-grid"></div><footer><button id="gcGalleryPrev">‹</button><span id="gcGalleryPages"></span><button id="gcGalleryNext">›</button></footer></aside><article id="gcGalleryDetails"><p>Selecciona una fotografía para editar sus metadatos.</p></article></div></section>';
  document.body.appendChild(host);host.querySelector('.gc-gallery-shade').onclick=()=>host.classList.add('hidden');
  $('#gcGalleryClose').onclick=()=>{release(galleryUrls);host.classList.add('hidden');};
  $('#gcGalleryImport').onclick=()=>{host.classList.add('hidden');show();};
  $('#gcPhotoSearch').oninput=()=>{galleryPage=0;galleryRender();};
  $('#gcPhotoFilter').onchange=()=>{galleryPage=0;galleryRender();};
  $('#gcGalleryPrev').onclick=()=>{galleryPage=Math.max(0,galleryPage-1);galleryRender();};
  $('#gcGalleryNext').onclick=()=>{galleryPage++;galleryRender();};
 }
 galleryRecords=await api.allPhotos();galleryPage=0;selectedGalleryId=null;
 $('#gcGalleryModal').classList.remove('hidden');galleryRender();
}
function galleryRender(){
 if(!$('#gcGalleryModal'))return;release(galleryUrls);
 const term=$('#gcPhotoSearch').value.toLowerCase(),filter=$('#gcPhotoFilter').value;
 const pts=api.getState().historicalPhotoPoints||[];
 const filtered=galleryRecords.filter(rec=>{
  const p=pts.find(p=>(p.photos||[]).includes(rec.id)||p.id===rec.historicalPointId);
  const located=!!(rec.gnss&&validXY(rec.gnss))||!!(p&&validXY(p));
  return (rec.name||'').toLowerCase().includes(term)&&(filter==='all'||(filter==='located')===located);
 });
 const pageSize=24,pages=Math.max(1,Math.ceil(filtered.length/pageSize));galleryPage=Math.min(galleryPage,pages-1);
 const grid=$('#gcGalleryGrid');grid.replaceChildren();
 for(const photo of filtered.slice(galleryPage*pageSize,(galleryPage+1)*pageSize)){
  const b=el('button','gc-gallery-tile'+(photo.id===selectedGalleryId?' active':'')),u=URL.createObjectURL(photo.blob);galleryUrls.push(u);
  const img=el('img');img.src=u;img.loading='lazy';img.alt='';const n=el('span','',photo.title||photo.name||'Fotografía');b.append(img,n);
  b.onclick=()=>{selectedGalleryId=photo.id;galleryRender();galleryDetail(photo);};grid.appendChild(b);
 }
 $('#gcGalleryPages').textContent=(galleryPage+1)+' / '+pages+' · '+filtered.length+' fotografías';
 $('#gcGalleryPrev').disabled=galleryPage===0;$('#gcGalleryNext').disabled=galleryPage>=pages-1;
}
function galleryDetail(photo){
 const root=$('#gcGalleryDetails');root.replaceChildren();
 const p=(api.getState().historicalPhotoPoints||[]).find(p=>(p.photos||[]).includes(photo.id)||p.id===photo.historicalPointId);
 const gnss=photo.gnss||{},title=photo.title||photo.name||'Fotografía';
 const big=el('img','gc-gallery-big'),u=URL.createObjectURL(photo.blob);galleryUrls.push(u);big.src=u;big.alt=title;big.onclick=()=>api.openImage(u,title);
 root.innerHTML='<div class="gc-detail-head"><h3>Fotografía · '+escape(title)+'</h3><button id="gcDetailFullscreen">⛶ Ver grande</button></div>';root.appendChild(big);
 const form=el('div','gc-gallery-form');
 form.innerHTML='<label>Título<input id="gcDetailTitle" maxlength="150"></label><label>Fecha documental<input id="gcDetailDate" type="date"></label><label>Autor / Archivo<input id="gcDetailAuthor" maxlength="150"></label><label>Descripción<textarea id="gcDetailDescription" rows="3"></textarea></label>'+
 '<div class="gc-detail-coords"><label>Latitud<input id="gcDetailLat" type="number" step="any" placeholder="Sin coordenadas"></label><label>Longitud<input id="gcDetailLon" type="number" step="any" placeholder="Sin coordenadas"></label></div>'+
 '<label>Parada vinculada<select id="gcDetailStop"><option value="">Ninguna</option></select></label><button id="gcDetailSave" class="gc-primary">Guardar cambios</button><p id="gcDetailMessage"></p>';
 root.appendChild(form);
 $('#gcDetailTitle').value=photo.title||'';
 $('#gcDetailDate').value=photo.captureDate||photo.historicalDate||'';
 $('#gcDetailAuthor').value=photo.author||'';
 $('#gcDetailDescription').value=photo.description||photo.caption||'';
 let lat=Number.isFinite(gnss.lat)?gnss.lat:null,lon=Number.isFinite(gnss.lon)?gnss.lon:null;
 if(lat===null&&p&&validXY(p)){const ll=api.unproject(p.x,p.y,Number(p.crs)||api.epsg());lat=ll?.lat??null;lon=ll?.lon??null;}
 $('#gcDetailLat').value=lat??'';$('#gcDetailLon').value=lon??'';
 const stops=(api.getState().mapPins||[]).filter(x=>x.kind==='stop');
 for(const stop of stops){const o=el('option','',stop.label||stop.id);o.value=stop.id;$('#gcDetailStop').appendChild(o);}
 $('#gcDetailStop').value=photo.stopId||p?.linkedStopId||'';
 $('#gcDetailFullscreen').onclick=()=>api.openImage(u,title);
 $('#gcDetailSave').disabled=!api.canEdit();
 $('#gcDetailSave').onclick=async()=>{
  if(!api.canEdit())return;
  const a=$('#gcDetailLat').value.trim(),b=$('#gcDetailLon').value.trim();
  if((a&&!b)||(!a&&b)){api.notify('Introduce ambas coordenadas o deja las dos vacías');return;}
  const next={...photo,title:$('#gcDetailTitle').value.trim(),captureDate:$('#gcDetailDate').value||null,author:$('#gcDetailAuthor').value.trim(),description:$('#gcDetailDescription').value.trim(),stopId:$('#gcDetailStop').value||null,updatedAt:Date.now()};
  let newWorld=null;
  if(a&&b){
   const latitude=Number(a),longitude=Number(b);
   if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180){api.notify('Coordenadas fuera de rango');return;}
   newWorld=api.project(longitude,latitude);
   next.gnss={...photo.gnss,x:newWorld.x,y:newWorld.y,crs:api.epsg(),lat:latitude,lon:longitude,source:'manual',accuracy:null};
   next.positionSource='manual';
  }
  try{
   await api.savePhoto(next);
   if(newWorld){
    let point=p;
    if(!point){point={id:'hp'+uid(),photos:[next.id],campaignId:api.getState().campaign,createdAt:Date.now(),name:next.title||next.name};api.getState().historicalPhotoPoints.push(point);next.historicalPointId=point.id;await api.savePhoto(next);}
    // Coordinates belong to a photographic point. Keep unrelated photo positions untouched.
    if((point.photos||[]).length===1){Object.assign(point,{x:newWorld.x,y:newWorld.y,crs:api.epsg(),photoPointPosition:{...newWorld,crs:api.epsg()}});}
   }
   api.persist();api.redraw();Object.assign(photo,next);
   $('#gcDetailMessage').textContent='Cambios guardados localmente';galleryRender();
  }catch(e){$('#gcDetailMessage').textContent='Error al guardar: '+e.message;}
 };
}
function install(hooks){api=hooks;return true;}
return {install,show,showGallery};
})(typeof window!=='undefined'?window:globalThis);

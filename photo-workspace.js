/* GeoCauce R29 | Photo and georeferenced point workspace for the PWA.
 * Uses existing IndexedDB photo records, legacy photo-point state and map rasters.
 * No network calls, new storage engine, or automatic data migrations.
 */
(typeof window!=='undefined'?window:globalThis).GeoCaucePhotoWorkspace=(function(root){
'use strict';
let api=null,dialog=null,tab='photos',rows=[],selected=-1,listPage=0,busy=false,seq=0,map=null,ctx=null,view={cx:0,cy:0,scale:1},previewUrls=[],galleryUrls=[],galleryDetailUrls=[],galleryRecords=[],galleryPage=0,selectedGalleryId=null,lastPointFiles=[];
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
 '<div class="gc-work-actions"><button id="gcApplyFieldPoints" class="gc-field-positions hidden" type="button">📍 Asignar puntos 1a · 2 · 3a (revisar)</button><button id="gcImportCommit" class="gc-primary" type="button" disabled>Importar fotografías</button><div class="gc-import-progress hidden" id="gcImportProgress"><div><span id="gcProgressText"></span><span id="gcProgressCount"></span></div><progress id="gcProgressBar" max="1" value="0"></progress></div><p id="gcImportFeedback" aria-live="polite"></p></div></section>'+
 '<section class="gc-work-right"><div class="gc-preview-head"><div><b>◉ Vista previa</b><small>Revisa las posiciones antes de importar</small></div><span id="gcCountLabel">0 elementos</span></div>'+
 '<div class="gc-map-box"><canvas id="gcPreviewMap" aria-label="Mapa georreferenciado de vista previa"></canvas><div class="gc-map-controls"><button id="gcMapPlus" type="button">+</button><button id="gcMapMinus" type="button">−</button><button id="gcMapFit" type="button" title="Mostrar todos">⌗</button></div><p id="gcMapHint">Selecciona archivos para ver su ubicación</p></div>'+
 '<div class="gc-list-head"><b>☷ Lista de elementos</b><span id="gcCounters"></span></div><div id="gcImportRows" class="gc-import-rows"></div>'+
 '</section></div>';
}

// Test positions provided by the user, opt-in only. Their provenance remains manual.
const fieldSamplePositions={
 'IMG_5212.JPEG':{lat:41.60515,lon:1.81454,label:'1a'},
 'IMG_5188.JPEG':{lat:41.60627,lon:1.81422,label:'2'},
 'IMG_5160.JPEG':{lat:41.60840,lon:1.81452,label:'3a'}
};
function applyFieldSamplePositions(){
 let count=0;
 for(const row of rows){
  const p=fieldSamplePositions[String(row.name||'').toUpperCase()];
  if(!p||row.gps)continue;
  row.manualGps={lat:p.lat,lon:p.lon};row.manualWorld=api.project(p.lon,p.lat);
  row.locationSource='manual-user-provided';count++;
 }
 $('#gcImportFeedback').textContent=count+' posiciones asignadas manualmente. Revisa las fotografías y sus ubicaciones antes de importar.';
 fitAll();render();
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
  $('#gcFiles').addEventListener('change',e=>{const files=[...e.target.files];e.target.value='';stage(files);});
  for(const event of ['dragenter','dragover'])$('#gcDrop').addEventListener(event,e=>{e.preventDefault();$('#gcDrop').classList.add('gc-over');});
  $('#gcDrop').addEventListener('dragleave',()=>$('#gcDrop').classList.remove('gc-over'));
  $('#gcDrop').addEventListener('drop',e=>{e.preventDefault();$('#gcDrop').classList.remove('gc-over');stage([...e.dataTransfer.files]);});
  $('#gcDuplicates').onchange=()=>{for(const row of rows)row.duplicate=$('#gcDuplicates').checked&&!!row.duplicateHash;render();};
  $('#gcKeepUnlocated').onchange=render;
  $('#gcThumbnails').onchange=render;
  $('#gcApplyFieldPoints').onclick=applyFieldSamplePositions;
  $('#gcPointCrs').onchange=()=>{if(tab==='points'&&lastPointFiles.length)stagePoints(lastPointFiles,++seq);};
  $('#gcMapPlus').onclick=()=>{view.scale*=1.6;paint();};
  $('#gcMapMinus').onclick=()=>{view.scale/=1.6;paint();};
  $('#gcMapFit').onclick=fitAll;
  $('#gcImportCommit').onclick=commit;
  map=$('#gcPreviewMap');ctx=map.getContext('2d');installMapControls();
 }
 tab='photos';rows=[];selected=-1;busy=false;seq++;
 setTab('photos');
 dialog.classList.remove('hidden');
 $('#gcApplyFieldPoints').classList.add('hidden');
 lastPointFiles=[];
 $('#gcLayerName').value='Fotografías de campo';
 $('#gcImportFeedback').textContent='';
 requestAnimationFrame(()=>{resizeMap();fitAll();render();});
}
function close(){if(busy){api.notify('La importación está guardando archivos; no cierres la ventana');return;}seq++;release(previewUrls);rows=[];selected=-1;lastPointFiles=[];dialog?.classList.add('hidden');api.scheduleSync?.();}
function setTab(next){
 if(busy)return;
 const same=next===tab;tab=next;if(!same){rows=[];selected=-1;seq++;release(previewUrls);lastPointFiles=[];$('#gcApplyFieldPoints').classList.add('hidden');}
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
async function hashes(sizes=[]){return new Set(await api.photoHashes(sizes));}

async function makePreviewThumbnail(file){
 if(typeof createImageBitmap!=='function')return null;
 const bitmap=await createImageBitmap(file,{resizeWidth:180,resizeHeight:180,resizeQuality:'medium'});
 try{
  const scale=Math.min(1,180/Math.max(bitmap.width,bitmap.height));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(bitmap.width*scale));c.height=Math.max(1,Math.round(bitmap.height*scale));
  c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);
  return await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',.72));
 }finally{bitmap.close?.();}
}

async function stage(files){
 if(busy||!files.length)return;
 const run=++seq;rows=[];selected=-1;release(previewUrls);
 $('#gcImportFeedback').textContent='Leyendo archivos…';
 progress(true,0,files.length,'Leyendo archivos');
 if(tab==='points'){lastPointFiles=files;await stagePoints(files,run);return;}
 try{
  const known=await hashes(files.map(f=>f.size));
  const prepared=await root.GeoCauceUnifiedPhotos.analyzePhotoBatch(files,{existingHashes:[...known],onProgress:({processed,total})=>{if(run===seq)progress(true,processed,total,'Leyendo y verificando EXIF');}});
  if(run!==seq)return;
  rows=prepared.map((p,i)=>({
   key:uid(),file:p.file,name:p.name,metadata:p.metadata,gps:p.gps,
   error:p.error,duplicateHash:p.status==='duplicate',duplicate:p.status==='duplicate',
   hash:p.hash,excluded:false,index:i,manualWorld:null,world:p.gps?api.project(p.gps.lon,p.gps.lat):null
  }));
  if($('#gcThumbnails').checked){
   for(let i=0;i<rows.length;i++){
    if(run!==seq)return;
    if(!rows[i].error){try{rows[i].thumbBlob=await makePreviewThumbnail(rows[i].file);}catch(e){console.warn('Miniatura JPEG',rows[i].name,e);}}
    progress(true,i+1,rows.length,'Preparando miniaturas');
   }
  }
  $('#gcApplyFieldPoints').classList.toggle('hidden',!rows.some(row=>fieldSamplePositions[String(row.name||'').toUpperCase()]&&!row.gps));
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
  const f=JSON.parse(text);
  const declared=f.crs?.properties?.name||'';if(declared&&/EPSG[:/]*2583[01]/i.test(declared))crs=Number(declared.match(/2583[01]/)[0]);
  else crs=4326;
  const features=f.type==='FeatureCollection'?f.features:f.type==='Feature'?[f]:[{type:'Feature',geometry:f,properties:{}}];
  for(const [i,record] of features.entries()){
   const geometry=record.geometry;if(geometry?.type!=='Point'||!Array.isArray(geometry.coordinates))continue;
   const [x,y]=geometry.coordinates;
   points.push({name:String(record.properties?.name||record.id||'Punto '+(i+1)),x:Number(x),y:Number(y),properties:record.properties||{},crs});
  }
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
async function digestFile(file){
 if(!root.crypto?.subtle)throw Error('Se requiere SHA-256 disponible en una PWA segura (HTTPS)');
 const bytes=new Uint8Array(await root.crypto.subtle.digest('SHA-256',await file.arrayBuffer()));
 return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
async function stagePoints(files=[],run=seq){
 if(!files.length)return;
 rows=[];selected=-1;listPage=0;
 const crs=Number($('#gcPointCrs').value);
 for(let index=0;index<files.length;index++){
  if(run!==seq)return;
  const f=files[index];
  try{
   const fileHash=await digestFile(f),entries=parsePointFile(await f.text(),f.name,crs);
   if(rows.length+entries.length>5000)throw Error('El lote supera los 5000 puntos; divídelo en varios archivos');
   for(const [pointIndex,p] of entries.entries()){
    let world=null,error=null;
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y))error='Coordenadas no numéricas';
    else if(p.crs===4326&&Math.abs(p.y)<=90&&Math.abs(p.x)<=180)world=api.project(p.x,p.y);
    else if(p.crs===25830||p.crs===25831){
     const ll=api.unproject(p.x,p.y,p.crs);
     if(ll&&Math.abs(ll.lat)<=90&&Math.abs(ll.lon)<=180)world=api.project(ll.lon,ll.lat);
     else error='No se pueden transformar las coordenadas UTM';
    }else error='Coordenadas fuera de rango';
    rows.push({key:uid(),file:f,name:p.name,world,point:p,
      pointImportId:'mp-'+fileHash.slice(0,32)+'-'+pointIndex,
      excluded:false,error,index:rows.length});
   }
  }catch(error){rows.push({key:uid(),file:f,name:f.name,error:String(error?.message||error),excluded:false});}
  progress(true,index+1,files.length,'Leyendo puntos');
 }
 progress(false);
 $('#gcImportFeedback').textContent='Revisa los puntos y confirma su importación. Los reintentos no crearán puntos repetidos.';
 fitAll();render();
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
    rows[manualIndex].manualWorld=world(p.x,p.y);rows[manualIndex].gps=null;rows[manualIndex].manualGps=null;rows[manualIndex].locationSource='manual-map';map.dataset.manualIndex='';selected=manualIndex;render();return;
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
   const u=URL.createObjectURL(r.thumbBlob||r.file);previewUrls.push(u);const img=el('img');img.src=u;img.alt='';img.loading='lazy';img.onerror=()=>{if(!r.error){r.error='No se puede visualizar este JPEG';render();}};preview.appendChild(img);
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
 const candidates=rows.filter(r=>!r.excluded&&!r.error&&(!r.duplicate||!$('#gcDuplicates').checked)&&(tab==='points'||locationOf(r)||$('#gcKeepUnlocated').checked));
 $('#gcImportCommit').disabled=busy||!candidates.length;
 $('#gcImportCommit').textContent=tab==='photos'?'Importar fotografías ('+candidates.length+')':'Importar puntos ('+candidates.length+')';
 paint();
}
function editCoordinates(i){
 const row=rows[i];if(!row)return;
 const value=row.manualGps?fmt(row.manualGps.lat)+', '+fmt(row.manualGps.lon):row.gps?fmt(row.gps.lat)+', '+fmt(row.gps.lon):'';
 const answer=prompt('Coordenadas WGS84: latitud, longitud (deja vacío para seleccionar sobre el mapa)',value);
 if(answer===null)return;
 if(!answer.trim()){map.dataset.manualIndex=String(i);selected=i;$('#gcImportFeedback').textContent='Toca el mapa para asignar la posición a '+row.name;render();return;}
 const normalized=answer.replace(/;/g,',').split(/,\s*/);
 if(normalized.length!==2){api.notify('Introduce latitud y longitud separadas por coma');return;}
 const lat=Number(normalized[0]),lon=Number(normalized[1]);if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){api.notify('Coordenadas fuera de rango');return;}
 row.manualWorld=api.project(lon,lat);row.manualGps={lat,lon};row.locationSource='manual';selected=i;fitAll();render();
}
function ensureSavedPhotoPoint(record,world,group,campaignId){
 if(!validXY(world)||!record.historicalPointId)return false;
 const list=api.getState().historicalPhotoPoints||(api.getState().historicalPhotoPoints=[]);
 const existing=list.find(p=>p.id===record.historicalPointId||(p.photos||[]).includes(record.id));
 if(existing){
  if((existing.photos||[]).includes(record.id))return true;
  existing.photos=Array.isArray(existing.photos)?existing.photos:[];
  existing.photos.push(record.id);
  try{api.persistVerified();}catch(error){existing.photos=existing.photos.filter(id=>id!==record.id);throw error;}
  return true;
 }
 const point={id:record.historicalPointId,name:record.title||record.name||'Fotografía',
  x:world.x,y:world.y,crs:api.epsg(),photoPointPosition:{x:world.x,y:world.y,crs:api.epsg()},
  photos:[record.id],importGroup:group||record.importGroup||'Fotografías de campo',
  campaignId:campaignId||record.campaignId,createdAt:record.createdAt||Date.now()};
 list.push(point);
 try{api.persistVerified();}catch(error){
  const index=list.indexOf(point);if(index!==-1)list.splice(index,1);
  throw error;
 }
 return true;
}
async function commit(){
 if(busy||!api.canEdit()){api.notify('Campaña de solo lectura');return;}
 const candidates=rows.filter(r=>!r.excluded&&!r.error&&(!r.duplicate||!$('#gcDuplicates').checked)&&(tab==='points'||locationOf(r)||$('#gcKeepUnlocated').checked));
 if(!candidates.length)return;
 busy=true;render();
 const startedProject=api.getState().projectId,startedCampaign=api.getState().campaign;
 const group=$('#gcLayerName').value.trim()||(tab==='photos'?'Fotografías de campo':'Puntos importados');
 let known;
 try{
  progress(true,0,candidates.length,tab==='photos'?'Comprobando duplicados':'Comprobando puntos');
  known=new Set(tab==='photos'?await api.photoHashes(candidates.map(r=>r.file?.size)):[]);
 }catch(error){
  busy=false;progress(false);render();
  $('#gcImportFeedback').textContent='No se pudo comprobar el contenido existente; no se ha importado ningún archivo: '+(error?.message||error);
  return;
 }
 let done=0,failed=0,skipped=0,restored=0;
 progress(true,0,candidates.length,tab==='photos'?'Guardando fotografías localmente':'Guardando puntos localmente');
 for(const row of candidates){
  try{
   if(startedProject!==api.getState().projectId||startedCampaign!==api.getState().campaign)
    throw Error('El proyecto o la campaña ha cambiado durante la importación');
   if(tab==='points'){
    const worldPoint=locationOf(row);
    if(!validXY(worldPoint))throw Error('Punto sin coordenadas');
    const pointId=row.pointImportId;if(!pointId)throw Error('No se puede identificar de forma estable este punto');
    const pins=api.getState().mapPins||(api.getState().mapPins=[]);
    if(pins.some(p=>p.id===pointId)){skipped++;row.excluded=true;continue;}
    const pin={id:pointId,kind:'gps',x:worldPoint.x,y:worldPoint.y,crs:api.epsg(),
      sourceCrs:row.point?.crs,originalX:row.point?.x,originalY:row.point?.y,
      label:row.name,attributes:row.point?.properties||{},importGroup:group,
      createdAt:Date.now(),campaignId:startedCampaign};
    pins.push(pin);
    try{api.persistVerified();}catch(error){pins.splice(pins.indexOf(pin),1);throw error;}
    done++;
   }else{
    const worldPoint=locationOf(row);
    if(row.hash&&known.has(row.hash)){
     const existing=await api.findPhotoByHash(row.hash);
     // After an interrupted import a verified photo binary may have no map point.
     // Repair only points created by this importer, never silently migrate older records.
     if(existing?.importVersion==='r29'&&existing.historicalPointId){
      const savedWorld=existing.gnss&&validXY(existing.gnss)?existing.gnss:worldPoint;
      if(validXY(savedWorld)) {
       const already=(api.getState().historicalPhotoPoints||[]).some(p=>
        p.id===existing.historicalPointId||(p.photos||[]).includes(existing.id));
       if(!already){ensureSavedPhotoPoint(existing,savedWorld,existing.importGroup,existing.campaignId);restored++;}
      }
     }
     skipped++;row.excluded=true;continue;
    }
    if(!row.hash)throw Error('Huella SHA-256 no disponible; no se puede garantizar una importación recuperable');
    const photoId='p'+row.hash.slice(0,32),pointId=worldPoint?'hp'+row.hash.slice(0,32):null;
    const exifDate=row.metadata?.dateOriginal||null;
    const captured=exifDate&&/^\d{4}:\d{2}:\d{2}/.test(exifDate)?exifDate.slice(0,10).replaceAll(':','-'):null;
    const gnss=worldPoint?{x:worldPoint.x,y:worldPoint.y,crs:api.epsg(),
      lat:row.manualGps?.lat??row.gps?.lat??null,lon:row.manualGps?.lon??row.gps?.lon??null,
      accuracy:null,source:row.locationSource||(row.manualWorld?'manual':row.gps?'exif':'map')}:null;
    const record={id:photoId,blob:row.file,name:row.name,date:Date.now(),importVersion:'r29',
      captureDate:captured,captureDateSource:captured?'exif':'unknown',createdAt:Date.now(),
      campaignId:startedCampaign,featureId:null,contentHash:row.hash,importGroup:group,
      historicalPointId:pointId,gnss,heading:row.metadata?.heading??null,
      exifOrientation:row.metadata?.orientation??null,originalSize:row.file.size,
      originalMime:row.file.type,positionSource:gnss?.source||'none'};
    const collision=await api.readPhoto(photoId);
    if(collision&&collision.contentHash!==row.hash)throw Error('Conflicto de identificador; no se ha sobrescrito la fotografía');
    if(!collision)await api.savePhoto(record);
    const saved=await api.readPhoto(photoId);
    if(!saved?.blob||saved.blob.size!==row.file.size||saved.contentHash!==row.hash)
     throw Error('No se ha verificado el guardado local');
    if(pointId)ensureSavedPhotoPoint(saved,worldPoint,group,startedCampaign);
    known.add(row.hash);done++;
   }
   row.excluded=true;
  }catch(error){
   failed++;row.error='Error al guardar: '+(error?.message||error);
   console.warn('GeoCauce: importación parcial',row.name,error);
  }finally{
   progress(true,done+failed+skipped,candidates.length,tab==='photos'?'Almacenamiento local confirmado':'Registrando puntos');
   await new Promise(resolve=>setTimeout(resolve,0));
  }
 }
 try{api.redraw();}catch(error){console.warn('GeoCauce map refresh after import',error);}
 busy=false;progress(false);api.scheduleSync?.();
 $('#gcImportFeedback').textContent=done+' '+(tab==='photos'?'fotografías':'puntos')+' guardados localmente; '+failed+' con error; '+skipped+' ya existentes.'+
  (restored?' '+restored+' marcador(es) recuperados.':'')+
  ' La sincronización con la nube seguirá la cola habitual.';
 render();
}
async function showGallery(initialPhotoId=null){
 if(!api.getState().projectId){api.notify('Abre un proyecto para ver fotografías');return;}
 if(!$('#gcGalleryModal')){
  const host=el('div','gc-gallery-modal hidden');host.id='gcGalleryModal';
  host.innerHTML='<div class="gc-gallery-shade"></div><section class="gc-gallery-card"><header><div><h2>Fotografías</h2><small>Imágenes de campo y archivo · todas las fechas</small></div><div><button id="gcGalleryImport">＋ Importar</button><button id="gcGalleryClose">✕</button></div></header><div class="gc-gallery-body"><aside><div class="gc-gallery-filters"><input id="gcPhotoSearch" placeholder="Buscar fotografía"><select id="gcPhotoFilter"><option value="all">Todas</option><option value="located">Con coordenadas</option><option value="unlocated">Sin coordenadas</option></select></div><div id="gcGalleryGrid" class="gc-gallery-grid"></div><footer><button id="gcGalleryPrev">‹</button><span id="gcGalleryPages"></span><button id="gcGalleryNext">›</button></footer></aside><article id="gcGalleryDetails"><p>Selecciona una fotografía para editar sus metadatos.</p></article></div></section>';
  document.body.appendChild(host);host.querySelector('.gc-gallery-shade').onclick=()=>host.classList.add('hidden');
  $('#gcGalleryClose').onclick=()=>{release(galleryUrls);release(galleryDetailUrls);host.classList.add('hidden');api.scheduleSync?.();};
  $('#gcGalleryImport').onclick=()=>{host.classList.add('hidden');show();};
  $('#gcPhotoSearch').oninput=()=>{galleryPage=0;galleryRender();};
  $('#gcPhotoFilter').onchange=()=>{galleryPage=0;galleryRender();};
  $('#gcGalleryPrev').onclick=()=>{galleryPage=Math.max(0,galleryPage-1);galleryRender();};
  $('#gcGalleryNext').onclick=()=>{galleryPage++;galleryRender();};
 }
 galleryRecords=await api.allPhotos();galleryPage=0;selectedGalleryId=initialPhotoId;
 $('#gcGalleryModal').classList.remove('hidden');galleryRender();
 if(initialPhotoId){const photo=galleryRecords.find(p=>p.id===initialPhotoId);if(photo)galleryDetail(photo);}
}
function galleryRender(){
 if(!$('#gcGalleryModal'))return;release(galleryUrls);
 const term=$('#gcPhotoSearch').value.toLowerCase(),filter=$('#gcPhotoFilter').value;
 const pts=api.getState().historicalPhotoPoints||[];
 const filtered=galleryRecords.filter(rec=>{
  const p=pts.find(p=>(p.photos||[]).includes(rec.id)||p.id===rec.historicalPointId);
  const located=!!(rec.gnss&&(validXY(rec.gnss)||(Number.isFinite(rec.gnss.lat)&&Number.isFinite(rec.gnss.lon))))||!!(p&&validXY(p));
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

function photoWorld(photo){
 const g=photo.gnss||{};
 if(Number.isFinite(g.lat)&&Number.isFinite(g.lon))return api.project(g.lon,g.lat);
 if(validXY(g))return api.epsg()===Number(g.crs||api.epsg())?{x:g.x,y:g.y}:null;
 const p=(api.getState().historicalPhotoPoints||[]).find(p=>(p.photos||[]).includes(photo.id)||p.id===photo.historicalPointId);
 if(p&&validXY(p)){
  if(!p.crs||Number(p.crs)===api.epsg())return{x:p.x,y:p.y};
  const ll=api.unproject(p.x,p.y,Number(p.crs));return ll?api.project(ll.lon,ll.lat):null;
 }
 const pin=(api.getState().mapPins||[]).find(p=>p.kind==='photo'&&p.photoId===photo.id);
 return validXY(pin)?{x:pin.x,y:pin.y}:null;
}
function photoDistance(a,b){
 if(!validXY(a)||!validXY(b))return Infinity;
 if(api.epsg()===4326){const lat=(a.y+b.y)/2*Math.PI/180;return Math.hypot((a.x-b.x)*111320*Math.cos(lat),(a.y-b.y)*111320);}
 return Math.hypot(a.x-b.x,a.y-b.y);
}
function photoMapDraw(photo,coords){
 const canvas=$('#gcDetailPhotoMap');if(!canvas)return;
 const w=canvas.getBoundingClientRect().width||380,h=canvas.getBoundingClientRect().height||215,dpr=Math.min(2,root.devicePixelRatio||1);
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);
 c.fillStyle='#e4e9df';c.fillRect(0,0,w,h);
 const center=coords||photoWorld(photo);
 if(!validXY(center)){c.fillStyle='#506253';c.textAlign='center';c.font='13px system-ui';c.fillText('Fotografía sin ubicación · introduce coordenadas',w/2,h/2);return;}
 const dist=api.epsg()===4326?.008:600,scale=Math.min(w,h)/dist;
 for(const r of api.getState().rasters||[]){
  if(r.visible===false||!r.image||!r.affine)continue;
  const a=r.affine;c.save();c.globalAlpha=Number.isFinite(r.opacity)?r.opacity:1;
  c.transform(scale*a.A,-scale*a.D,scale*a.B,-scale*a.E,w/2+scale*(a.C-center.x),h/2-scale*(a.F-center.y));
  try{c.drawImage(r.image,0,0);}catch(e){}
  c.restore();
 }
 const v=$('#gcDetailHeading')?.value.trim();
 const heading=v===''?null:Number(v),fov=Number($('#gcDetailFov')?.value||60),lengthM=Number($('#gcDetailDistance')?.value||200);
 const visible=$('#gcDetailShowCone')?.checked;
 if(visible&&Number.isFinite(heading)&&heading>=0&&heading<360){
  const len=(api.epsg()===4326?lengthM/111320:lengthM)*scale;
  const rad=heading*Math.PI/180,wide=Math.max(5,Math.min(170,fov))*Math.PI/360;
  c.save();c.beginPath();c.moveTo(w/2,h/2);
  for(let i=0;i<=40;i++){const angle=rad-wide+2*wide*i/40;c.lineTo(w/2+Math.sin(angle)*len,h/2-Math.cos(angle)*len);}
  c.closePath();c.fillStyle='rgba(48,117,73,.23)';c.strokeStyle='rgba(40,96,60,.6)';c.fill();c.stroke();c.restore();
 }
 c.beginPath();c.arc(w/2,h/2,10,0,Math.PI*2);c.fillStyle='#2f5d43';c.fill();c.lineWidth=3;c.strokeStyle='#fff';c.stroke();
 c.textAlign='center';c.textBaseline='middle';c.font='bold 12px system-ui';c.fillStyle='#fff';c.fillText('▣',w/2,h/2);
}
let compareUrls=[];
function closeComparison(){
 const node=$('#gcCompareModal');if(node)node.remove();
 release(compareUrls);
}
function comparePhotos(photo,reference){
 if(!photo?.blob||!reference?.blob)return;
 closeComparison();
 const host=el('div','gc-compare-modal');host.id='gcCompareModal';
 const a=URL.createObjectURL(photo.blob),b=URL.createObjectURL(reference.blob);compareUrls.push(a,b);
 host.innerHTML='<section class="gc-compare-card"><header><div><b>Comparación temporal</b><small>'+escape(photo.name)+' · '+escape(reference.name)+'</small></div><button id="gcCompareClose">✕</button></header>'+
 '<div class="gc-compare-tools"><label>Modo<select id="gcCompareMode"><option value="slider">Deslizador</option><option value="opacity">Transparencia</option><option value="parallel">Paralelo</option></select></label><label>Ajuste<input type="range" id="gcCompareRange" min="0" max="100" value="50"></label><label>Zoom referencia<input type="range" id="gcCompareZoom" min="50" max="200" value="100"></label><label>Rotación referencia<input id="gcCompareRotation" type="number" min="-180" max="180" value="0" step="1"></label></div>'+
 '<div class="gc-compare-images"><img id="gcCompareOriginal" alt="Fotografía inicial"><div id="gcCompareSecond"><img id="gcCompareReference" alt="Fotografía de referencia"></div><div id="gcCompareLine"></div></div>'+
 '<small class="gc-compare-note">Alineación visual, sin modificación de los originales.</small></section>';
 document.body.appendChild(host);$('#gcCompareOriginal').src=a;$('#gcCompareReference').src=b;$('#gcCompareClose').onclick=closeComparison;
 host.addEventListener('click',e=>{if(e.target===host)closeComparison();});
 const redraw=()=>{
  const mode=$('#gcCompareMode').value,pct=Number($('#gcCompareRange').value),zoom=Number($('#gcCompareZoom').value)/100,angle=Number($('#gcCompareRotation').value)||0;
  host.dataset.mode=mode;$('#gcCompareSecond').style.clipPath=mode==='slider'?'inset(0 '+(100-pct)+'% 0 0)':'';
  $('#gcCompareSecond').style.opacity=mode==='opacity'?String(pct/100):'1';
  $('#gcCompareReference').style.transform='scale('+zoom+') rotate('+angle+'deg)';
  $('#gcCompareLine').style.left=pct+'%';
 };
 ['gcCompareMode','gcCompareRange','gcCompareZoom','gcCompareRotation'].forEach(k=>$('#'+k).oninput=redraw);
 redraw();
}
function galleryDetail(photo){
 release(galleryDetailUrls);const root=$('#gcGalleryDetails');root.replaceChildren();
 const p=(api.getState().historicalPhotoPoints||[]).find(p=>(p.photos||[]).includes(photo.id)||p.id===photo.historicalPointId);
 const gnss=photo.gnss||{},title=photo.title||photo.name||'Fotografía',known=photoWorld(photo);
 const big=el('img','gc-gallery-big'),u=URL.createObjectURL(photo.blob);galleryDetailUrls.push(u);
 big.src=u;big.alt=title;big.onclick=()=>api.openImage(u,title);
 root.innerHTML='<div class="gc-detail-head"><h3>Fotografía · '+escape(title)+'</h3><button id="gcDetailFullscreen">⛶ Ver grande</button></div>';
 root.appendChild(big);
 const related=Array.isArray(photo.seriesNames)?photo.seriesNames:(photo.seriesName?[photo.seriesName]:[]);
 if(related.length){
  const timeline=el('div','gc-photo-timeline');
  for(const candidate of galleryRecords.filter(r=>r.id!==photo.id&&(r.seriesNames||[r.seriesName]).some(n=>n&&related.includes(n))).slice(0,15)){
   const url=URL.createObjectURL(candidate.blob);galleryDetailUrls.push(url);
   const b=el('button','gc-time-thumb'),img=el('img');img.src=url;img.alt='';b.append(img,el('small','',candidate.documentDateRaw||candidate.captureDate||candidate.historicalDate||candidate.name));b.onclick=()=>{selectedGalleryId=candidate.id;galleryRender();galleryDetail(candidate);};timeline.appendChild(b);
  }
  if(timeline.childNodes.length){root.appendChild(el('b','gc-detail-section','Serie temporal'));root.appendChild(timeline);}
 }
 const position=el('section','gc-detail-map-section');
 position.innerHTML='<div class="gc-detail-section">Localización y orientación · EPSG:'+api.epsg()+'</div><canvas id="gcDetailPhotoMap" aria-label="Localización fotográfica"></canvas>'+
 '<div class="gc-detail-orientation"><label>Azimut (°)<input id="gcDetailHeading" type="number" min="0" max="359" step="1" placeholder="Desconocido"></label><label>Campo visual (°)<input id="gcDetailFov" type="number" min="5" max="170" value="60"></label><label>Distancia (m)<input id="gcDetailDistance" type="number" min="10" max="5000" value="200"></label><label class="gc-detail-show"><input type="checkbox" id="gcDetailShowCone" checked> Mostrar campo visual</label></div>';
 root.appendChild(position);
 const form=el('div','gc-gallery-form');
 form.innerHTML='<label>Título<input id="gcDetailTitle" maxlength="150"></label>'+
 '<label>Fecha documental<input id="gcDetailDate" type="text" placeholder="1925, ca. 1925 o AAAA-MM-DD"></label>'+
 '<label>Tipo de fecha<select id="gcDetailDateType"><option value="exact">Exacta</option><option value="approx">Aproximada</option><option value="year">Solo año</option><option value="interval">Intervalo</option><option value="unknown">Desconocida</option></select></label>'+
 '<label>Certeza de fecha<select id="gcDetailDateCertainty"><option value="unknown">Desconocida</option><option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option></select></label>'+
 '<label>Autor<input id="gcDetailAuthor" maxlength="150"></label>'+
 '<label>Institución / Archivo<input id="gcDetailInstitution" maxlength="150"></label>'+
 '<label>Colección<input id="gcDetailCollection" maxlength="120"></label>'+
 '<label>Referencia documental<input id="gcDetailReference" maxlength="150"></label>'+
 '<label class="gc-detail-full">Enlace / fuente<input id="gcDetailSource" type="url" placeholder="https://…"></label>'+
 '<label class="gc-detail-full">Series temporales (separa varias con coma)<input id="gcDetailSeries" placeholder="Ej. Tormentas 2026, Evolución del cauce"></label>'+
 '<label class="gc-detail-full">Descripción<textarea id="gcDetailDescription" rows="3"></textarea></label>'+
 '<div class="gc-detail-coords"><label>Latitud<input id="gcDetailLat" type="number" step="any" placeholder="Sin coordenadas"></label><label>Longitud<input id="gcDetailLon" type="number" step="any" placeholder="Sin coordenadas"></label></div>'+
 '<label>Parada vinculada<select id="gcDetailStop"><option value="">Ninguna</option></select></label>'+
 '<label>Fotografía de referencia<select id="gcDetailCompare"><option value="">Sin fotografía de referencia</option></select></label>'+
 '<button id="gcDetailOpenCompare" type="button">Abrir comparador</button>'+
 '<button id="gcDetailSave" class="gc-primary">Guardar cambios</button><p id="gcDetailMessage"></p>';
 root.appendChild(form);
 $('#gcDetailTitle').value=photo.title||'';
 $('#gcDetailDate').value=photo.documentDateRaw||photo.captureDate||photo.historicalDate||'';
 $('#gcDetailDateType').value=photo.datePrecision||((photo.captureDate||photo.historicalDate)?'exact':'unknown');
 $('#gcDetailDateCertainty').value=photo.dateCertainty||'unknown';
 $('#gcDetailAuthor').value=photo.author||'';$('#gcDetailInstitution').value=photo.institution||'';
 $('#gcDetailCollection').value=photo.collection||'';$('#gcDetailReference').value=photo.documentReference||'';
 $('#gcDetailSource').value=photo.sourceUrl||'';
 $('#gcDetailSeries').value=related.join(', ');
 $('#gcDetailDescription').value=photo.description||photo.caption||'';
 $('#gcDetailHeading').value=Number.isFinite(photo.heading)?String(photo.heading):'';
 $('#gcDetailFov').value=Number.isFinite(photo.fieldOfViewDeg)?photo.fieldOfViewDeg:60;
 $('#gcDetailDistance').value=Number.isFinite(photo.fieldOfViewDistanceM)?photo.fieldOfViewDistanceM:200;
 $('#gcDetailShowCone').checked=photo.showFieldOfView!==false;
 let lat=Number.isFinite(gnss.lat)?gnss.lat:null,lon=Number.isFinite(gnss.lon)?gnss.lon:null;
 if(lat===null&&p&&validXY(p)){const ll=api.unproject(p.x,p.y,Number(p.crs)||api.epsg());lat=ll?.lat??null;lon=ll?.lon??null;}
 $('#gcDetailLat').value=lat??'';$('#gcDetailLon').value=lon??'';
 const stops=(api.getState().mapPins||[]).filter(x=>x.kind==='stop');
 for(const stop of stops){const o=el('option','',stop.label||stop.id);o.value=stop.id;$('#gcDetailStop').appendChild(o);}
 $('#gcDetailStop').value=photo.stopId||p?.linkedStopId||'';
 for(const candidate of galleryRecords.filter(r=>r.id!==photo.id)){
  const o=el('option','',candidate.title||candidate.name);o.value=candidate.id;$('#gcDetailCompare').appendChild(o);
 }
 $('#gcDetailCompare').value=photo.referencePhotoId||'';
 $('#gcDetailOpenCompare').onclick=()=>{const target=galleryRecords.find(r=>r.id===$('#gcDetailCompare').value);if(!target){api.notify('Elige una fotografía de referencia');return;}comparePhotos(photo,target);};
 ['gcDetailHeading','gcDetailFov','gcDetailDistance','gcDetailShowCone'].forEach(k=>$('#'+k).oninput=()=>photoMapDraw(photo,known));
 $('#gcDetailFullscreen').onclick=()=>api.openImage(u,title);
 const nearby=galleryRecords.filter(r=>r.id!==photo.id&&validXY(photoWorld(r))&&validXY(known)).map(r=>({photo:r,dist:photoDistance(known,photoWorld(r))})).sort((a,b)=>a.dist-b.dist).slice(0,5);
 if(nearby.length){
  root.appendChild(el('b','gc-detail-section','Fotografías cercanas'));
  const tray=el('div','gc-photo-timeline');
  for(const {photo:near,dist} of nearby){const uri=URL.createObjectURL(near.blob);galleryDetailUrls.push(uri);const b=el('button','gc-time-thumb'),img=el('img');img.src=uri;img.alt='';b.append(img,el('small','',near.name+' · '+Math.round(dist)+' m'));b.onclick=()=>{selectedGalleryId=near.id;galleryRender();galleryDetail(near);};tray.appendChild(b);}
  root.appendChild(tray);
 }
 $('#gcDetailSave').disabled=!api.canEdit();
 $('#gcDetailSave').onclick=async()=>{
  if(!api.canEdit())return;
  const a=$('#gcDetailLat').value.trim(),b=$('#gcDetailLon').value.trim();
  if((a&&!b)||(!a&&b)){api.notify('Introduce ambas coordenadas o deja las dos vacías');return;}
  const rawHeading=$('#gcDetailHeading').value.trim(),heading=rawHeading===''?null:Number(rawHeading);
  if(heading!==null&&(!Number.isFinite(heading)||heading<0||heading>=360)){api.notify('Azimut válido: 0 a 359 grados');return;}
  const fov=Number($('#gcDetailFov').value),distance=Number($('#gcDetailDistance').value);
  if(!(fov>=5&&fov<=170)||!(distance>=10&&distance<=5000)){api.notify('Revisa el campo visual y la distancia');return;}
  const seriesNames=[...new Set($('#gcDetailSeries').value.split(',').map(x=>x.trim()).filter(Boolean))];
  const dateRaw=$('#gcDetailDate').value.trim(),kind=$('#gcDetailDateType').value;
  if(kind==='exact'&&dateRaw&&!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)){api.notify('Para fecha exacta utiliza AAAA-MM-DD');return;}
  if(kind==='year'&&dateRaw&&!/^\d{4}$/.test(dateRaw)){api.notify('Introduce el año con cuatro cifras');return;}
  if(kind==='unknown'&&dateRaw){api.notify('Si la fecha es desconocida deja el campo vacío');return;}
  if(kind==='interval'&&dateRaw&&!/^\d{4}\s*[-–]\s*\d{4}$/.test(dateRaw)){api.notify('Para intervalo: AAAA-AAAA');return;}
  const exactDate=kind==='exact'&&dateRaw?dateRaw:null;
  const next={...photo,title:$('#gcDetailTitle').value.trim(),documentDateRaw:dateRaw||null,captureDate:exactDate,
   datePrecision:kind,dateCertainty:$('#gcDetailDateCertainty').value,
   author:$('#gcDetailAuthor').value.trim(),institution:$('#gcDetailInstitution').value.trim(),
   collection:$('#gcDetailCollection').value.trim(),documentReference:$('#gcDetailReference').value.trim(),
   sourceUrl:$('#gcDetailSource').value.trim(),seriesNames,description:$('#gcDetailDescription').value.trim(),
   referencePhotoId:$('#gcDetailCompare').value||null,heading,fieldOfViewDeg:fov,fieldOfViewDistanceM:distance,
   showFieldOfView:$('#gcDetailShowCone').checked,stopId:$('#gcDetailStop').value||null,
   historicalDate:photo.historicalDate!==undefined?exactDate:photo.historicalDate,updatedAt:Date.now()};
  let newWorld=null;
  if(a&&b){
   const latitude=Number(a),longitude=Number(b);
   if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180){api.notify('Coordenadas fuera de rango');return;}
   const oldLat=Number.isFinite(gnss.lat)?gnss.lat:lat,oldLon=Number.isFinite(gnss.lon)?gnss.lon:lon;
   if(oldLat===null||oldLon===null||Math.abs(oldLat-lat)>1e-7||Math.abs(oldLon-lon)>1e-7){
    newWorld=api.project(longitude,latitude);
    next.gnss={...photo.gnss,x:newWorld.x,y:newWorld.y,crs:api.epsg(),lat:latitude,lon:longitude,source:'manual',accuracy:null};
    next.positionSource='manual';
   }
  }
  try{
   await api.savePhoto(next);
   if(newWorld){
    let point=p;
    if(!point||((point.photos||[]).length>1)){
     if(point)point.photos=point.photos.filter(id=>id!==next.id);
     point={id:'hp'+uid(),photos:[next.id],campaignId:api.getState().campaign,createdAt:Date.now(),name:next.title||next.name};
     api.getState().historicalPhotoPoints.push(point);next.historicalPointId=point.id;await api.savePhoto(next);
    }
    Object.assign(point,{x:newWorld.x,y:newWorld.y,crs:api.epsg(),photoPointPosition:{...newWorld,crs:api.epsg()}});
   }
   api.persist();api.redraw();Object.assign(photo,next);
   $('#gcDetailMessage').textContent='Cambios guardados localmente';
   galleryRender();
  }catch(e){$('#gcDetailMessage').textContent='Error al guardar: '+e.message;}
 };
 requestAnimationFrame(()=>photoMapDraw(photo,known));
}

function install(hooks){api=hooks;return true;}
return {install,show,showGallery};
})(typeof window!=='undefined'?window:globalThis);

/* GeoCauce R29 · Non-destructive relocation of georeferenced map elements.
 * Pure, tested transformations. No database operations and no hidden GPS inference.
 */
(function(root){
 'use strict';
 const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
 const copy=p=>({x:p.x,y:p.y});
 const shift=(p,dx,dy)=>valid(p)?{...p,x:p.x+dx,y:p.y+dy}:p;
 const translatePoints=(points,dx,dy)=>Array.isArray(points)?points.map(p=>shift(p,dx,dy)):points;
 const center=points=>{
  const list=(points||[]).filter(valid);
  if(!list.length)return null;
  return{x:list.reduce((v,p)=>v+p.x,0)/list.length,y:list.reduce((v,p)=>v+p.y,0)/list.length};
 };
 function featureAnchor(f){
  const collection=f?.type==='watercourse'&&Array.isArray(f.fragments)&&f.fragments.length?
   f.fragments.flat():f?.points||[];
  return center(collection);
 }
 const stamp=(value,source,target)=>{
  const entries=Array.isArray(value.positionHistory)?value.positionHistory:[];
  return [...entries.slice(-24),{
   from:{x:source.x,y:source.y,crs:value.crs||null,source:value.positionSource||value.gnss?.source||null},
   to:{x:target.x,y:target.y},at:Date.now(),reason:'manual-map-relocation'
  }];
 };
 function moveFeature(f,target,anchor=featureAnchor(f)){
  if(!valid(target)||!valid(anchor)||!Array.isArray(f?.points)||!f.points.length)throw Error('El elemento no tiene geometría desplazable');
  const dx=target.x-anchor.x,dy=target.y-anchor.y;
  const out={...f,points:translatePoints(f.points,dx,dy),
   positionHistory:stamp(f,anchor,target),positionSource:'manual-map',updatedAt:Date.now()};
  if(Array.isArray(f.fragments))out.fragments=f.fragments.map(fr=>translatePoints(fr,dx,dy));
  if(Array.isArray(f.erasures))out.erasures=f.erasures.map(er=>({...er,points:translatePoints(er.points,dx,dy)}));
  if(valid(f.anchorPoint))out.anchorPoint=shift(f.anchorPoint,dx,dy);
  // A moved profile no longer represents the same terrain location. Preserve
  // its former values for recovery and flag the active derived data as outdated.
  const derived={};
  for(const key of ['mdeStats','longitudinalProfile','sectionProfile']){
   if(f[key]!=null){derived[key]=f[key];out[key]=null;}
  }
  if(Object.keys(derived).length){
   out.relocationPreviousDerived={...f.relocationPreviousDerived,...derived};
   out.derivedDataStale=true;
  }
  return out;
 }
 function movePin(pin,target,{crs,lonLat=null,utm=null}={}){
  if(!valid(target)||!valid(pin))throw Error('Punto sin coordenadas válidas');
  const position={...pin.position,x:target.x,y:target.y,crs:crs||pin.crs||null,source:'manual-map'};
  delete position.altitude;delete position.accuracy;
  if(lonLat&&Number.isFinite(lonLat.lon)&&Number.isFinite(lonLat.lat)){
   position.lon=lonLat.lon;position.lat=lonLat.lat;
  }else{delete position.lon;delete position.lat;}
  if(utm&&Number.isFinite(utm.x)&&Number.isFinite(utm.y)){
   position.utmX=utm.x;position.utmY=utm.y;position.utmCrs=utm.crs;
  }else{delete position.utmX;delete position.utmY;delete position.utmCrs;}
  return{...pin,x:target.x,y:target.y,crs:crs||pin.crs||null,position,
   originalPosition:pin.originalPosition||(valid(pin)?{x:pin.x,y:pin.y,crs:pin.crs||null,position:pin.position||null}:null),
   positionHistory:stamp(pin,pin,target),positionSource:'manual-map',updatedAt:Date.now()};
 }
 function movePhotoPoint(point,target,options={}){
  if(!valid(target)||!point)throw Error('Posición fotográfica inválida');
  const moved=valid(point)?movePin(point,target,options):{...point,x:target.x,y:target.y,
   crs:options.crs||point.crs||null,positionSource:'manual-map',updatedAt:Date.now()};
  return{...moved,photoPointPosition:{...point.photoPointPosition,x:target.x,y:target.y,
   crs:options.crs||point.crs||null,source:'manual-map'}};
 }
 function movePhotoRecord(photo,target,{crs,lonLat=null,pointId=photo.historicalPointId}={}){
  if(!valid(target))throw Error('Ubicación inválida');
  const source=valid(photo.gnss)?photo.gnss:null;
  const gps={...photo.gnss,x:target.x,y:target.y,crs:crs||photo.gnss?.crs||null,
   lat:Number.isFinite(lonLat?.lat)?lonLat.lat:null,lon:Number.isFinite(lonLat?.lon)?lonLat.lon:null,
   accuracy:null,altitude:null,source:'manual-map',timestamp:Date.now()};
  return{...photo,gnss:gps,historicalPointId:pointId,
   originalGnss:photo.originalGnss|| (photo.gnss?{...photo.gnss}:null),
   positionHistory:source?stamp(photo,source,target):(photo.positionHistory||[]),positionSource:'manual-map',updatedAt:Date.now()};
 }
 function moveInkStroke(stroke,target){
  const anchor=center(stroke?.points);
  if(!anchor||!valid(target))throw Error('Anotación no desplazable');
  const dx=target.x-anchor.x,dy=target.y-anchor.y;
  return{...stroke,points:translatePoints(stroke.points,dx,dy),updatedAt:Date.now()};
 }
 function moveNotebookLink(link,target){
  if(link?.type!=='position'||!valid(target)||!valid(link))throw Error('Posición de libreta inválida');
  return{...link,x:target.x,y:target.y,source:'manual-map',updatedAt:Date.now()};
 }
 root.GeoCauceMapRelocation={valid,featureAnchor,moveFeature,movePin,movePhotoPoint,movePhotoRecord,moveInkStroke,moveNotebookLink};
})(typeof window!=='undefined'?window:globalThis);

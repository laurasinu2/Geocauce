/* GeoCauce unified photos, non-destructive data adapter and metadata decoding.
   No DOM, database access, mutations or writes. Old records remain valid. */
(function(root){
'use strict';
const clean=v=>typeof v==='string'?v.trim():'';
const date=d=>Number.isFinite(+d)&&+d>0?new Date(+d).toISOString():null;
const unique=items=>[...new Set((items||[]).filter(Boolean))];
function adapt(photo,points=[]){
 const p=points.find(p=>(p.photos||[]).includes(photo.id)||p.id===photo.historicalPointId)||null;
 const gnss=photo.gnss||null;
 const location=gnss&&Number.isFinite(gnss.lat)&&Number.isFinite(gnss.lon)?
  {lat:gnss.lat,lon:gnss.lon,source:gnss.source||'gnss',accuracy:gnss.accuracy??null}:
  p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?{x:p.x,y:p.y,crs:p.crs||p.photoPointPosition?.crs||null,source:'historical-point'}:
  gnss&&Number.isFinite(gnss.x)&&Number.isFinite(gnss.y)?{x:gnss.x,y:gnss.y,crs:gnss.crs,source:gnss.source||'map'}:null;
 return {id:photo.id,name:photo.name||'Fotografia',file:photo.blob||null,date:photo.historicalDate||date(photo.date),
  dateType:photo.historicalDate?'documentary':'capture',location,heading:Number.isFinite(photo.heading)?photo.heading:null,
  campaignId:photo.campaignId||null,pointId:p?.id||photo.historicalPointId||null,
  stopId:photo.stopId||p?.linkedStopId||null,featureId:photo.featureId||null,
  reachId:photo.reachId||null,sectionId:photo.sectionId||null,courseId:photo.watercourseId||null,
  title:photo.title||'',description:photo.caption||photo.observation||photo.note||'',source:photo.source||null,
  original:photo};
}
const take16=(v,p,le)=>v.getUint16(p,le),take32=(v,p,le)=>v.getUint32(p,le);
function jpegExif(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const output={};if(v.byteLength<4||take16(v,0,false)!==0xffd8)throw Error('No es un JPEG válido');
 let pos=2;
 while(pos+4<=v.byteLength){
  if(v.getUint8(pos)!==0xff)break;
  const marker=v.getUint8(pos+1);pos+=2;
  if(marker===0xd9||marker===0xda)break;
  if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
  if(pos+2>v.byteLength)break;
  const length=take16(v,pos,false);
  if(length<2||pos+length>v.byteLength)break;
  if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=7){output.height=take16(v,pos+3,false);output.width=take16(v,pos+5,false);}
  if(marker===0xe1&&length>10&&String.fromCharCode(...new Uint8Array(bytes.buffer,bytes.byteOffset+pos+2,4))==='Exif'){
   const base=pos+8,end=pos+length;if(base+8>end)break;
   const bo=take16(v,base,false);if(bo!==0x4949&&bo!==0x4d4d)break;
   const le=bo===0x4949;
   if(take16(v,base+2,le)!==42)break;
   const sizes={1:1,2:1,3:2,4:4,5:8,7:1,9:4,10:8};
   const entry=(type,count,where)=>{
    const size=sizes[type];if(!size||count>100000||count*size>1048576)return null;
    const offset=count*size<=4?where:base+take32(v,where,le);
    if(offset<base||offset+count*size>end)return null;
    if(type===2)return Array.from({length:count},(_,i)=>String.fromCharCode(v.getUint8(offset+i))).join('').replace(/\0+$/,'');
    const read=i=>{const p=offset+i*size;
     if(type===3)return take16(v,p,le);
     if(type===4)return take32(v,p,le);
     if(type===9)return v.getInt32(p,le);
     if(type===5||type===10){const a=type===5?take32(v,p,le):v.getInt32(p,le),b=type===5?take32(v,p+4,le):v.getInt32(p+4,le);return b?a/b:null;}
     return v.getUint8(p);
    };
    return count===1?read(0):Array.from({length:count},(_,i)=>read(i));
   };
   const dirs=new Set();
   function directory(offset){
    if(!Number.isInteger(offset)||offset<8||dirs.has(offset)||dirs.size>8)return {};
    dirs.add(offset);const abs=base+offset;if(abs+2>end)return {};
    const count=take16(v,abs,le),out={};if(count>256||abs+2+count*12>end)return {};
    for(let i=0;i<count;i++){const p=abs+2+i*12,tag=take16(v,p,le),type=take16(v,p+2,le),n=take32(v,p+4,le);out[tag]=entry(type,n,p+8);}
    return out;
   }
   const primary=directory(take32(v,base+4,le));
   const gps=directory(primary[0x8825]);const exif=directory(primary[0x8769]);
   const degree=parts=>Array.isArray(parts)&&parts.length>=3&&parts.slice(0,3).every(Number.isFinite)?parts[0]+parts[1]/60+parts[2]/3600:null;
   const lat=degree(gps[2]),lon=degree(gps[4]);
   if(lat!==null&&lon!==null){const ns=clean(gps[1]).toUpperCase(),ew=clean(gps[3]).toUpperCase();
    const latitude=lat*(ns==='S'?-1:1),longitude=lon*(ew==='W'?-1:1);
    if(['N','S'].includes(ns)&&['E','W'].includes(ew)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180)output.gps={lat:latitude,lon:longitude,source:'exif'};
   }
   if(output.gps&&Number.isFinite(gps[6]))output.gps.altitude=(gps[5]===1?-1:1)*gps[6];
   if(Number.isFinite(gps[17]))output.heading=gps[17];
   output.dateOriginal=clean(exif[0x9003]||primary[0x132])||null;
   if(Number.isInteger(primary[0x112]))output.orientation=primary[0x112];
   if(Number.isFinite(primary[0x100]))output.width=primary[0x100];
   if(Number.isFinite(primary[0x101]))output.height=primary[0x101];
  }
  pos+=length;
 }
 return output;
}
function parseCsv(input){
 const text=String(input||'').replace(/^\uFEFF/,'');const first=text.split(/\r?\n/)[0]||'';
 const delimiter=[';',',','\t'].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
 const rows=[],row=[];let word='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){word+='"';i++;}else quoted=!quoted;}
  else if(c===delimiter&&!quoted){row.push(word);word='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(word);word='';if(row.some(s=>s.trim()))rows.push(row.splice(0));else row.length=0;}
  else word+=c;
 }
 row.push(word);if(row.some(s=>s.trim()))rows.push(row);
 const columns=(rows.shift()||[]).map(x=>x.trim());
 return {columns,rows:rows.map(line=>Object.fromEntries(columns.map((key,i)=>[key,line[i]??''])))};
}
function pointRecords(input,format='geojson'){
 if(format==='geojson'){
  const data=typeof input==='string'?JSON.parse(input):input;
  const list=data.type==='FeatureCollection'?data.features:[data.type==='Feature'?data:{type:'Feature',geometry:data,properties:{}}];
  return list.flatMap((f,i)=>{
   const geometry=f.geometry;if(!geometry||geometry.type!=='Point'||!Array.isArray(geometry.coordinates))return [];
   const [lon,lat]=geometry.coordinates;
   return Number.isFinite(lon)&&Number.isFinite(lat)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?
    [{id:String(f.id??i),name:clean(f.properties?.name)||'Punt '+(i+1),lon,lat,properties:f.properties||{},source:'geojson'}]:[];
  });
 }
 return [];
}

/* The preflight never writes, geolocates from the device or changes JPEG bytes.
   Read one file at a time to bound memory usage on Android PWAs. */
async function analyzePhotoBatch(files,{existingHashes=[],onProgress=null,digest=null}={}){
 const items=Array.from(files||[]),seen=new Set(),known=new Set(existingHashes||[]),result=[];
 const subtle=typeof crypto!=='undefined'?crypto.subtle:root.crypto?.subtle;
 const hash=async file=>{
  if(digest)return await digest(file);
  if(!subtle)return null;
  const buffer=await file.arrayBuffer();
  const bytes=new Uint8Array(await subtle.digest('SHA-256',buffer));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 };
 for(let i=0;i<items.length;i++){
  const file=items[i],item={file,name:file?.name||'Archivo',size:file?.size||0,
   status:'error',gps:null,dateOriginal:null,heading:null,hash:null,error:null,metadata:null};
  try{
   if(!file||!/\.jpe?g$/i.test(file.name||'')&&!/image\/jpeg/i.test(file.type||''))throw Error('Formato no admitido. Usa JPEG/JPG');
   if(!Number.isFinite(file.size)||file.size<4)throw Error('Archivo vacío o incompleto');
   const head=new Uint8Array(await file.slice(0,Math.min(file.size,1024*1024)).arrayBuffer());
   const exif=jpegExif(head);
   item.metadata=exif;item.gps=exif.gps||null;item.dateOriginal=exif.dateOriginal||null;
   item.heading=Number.isFinite(exif.heading)?exif.heading:null;
   item.hash=await hash(file);
   // No filename-only duplicate guesses: SHA-256 match is required.
   if(item.hash&&(seen.has(item.hash)||known.has(item.hash)))item.status='duplicate';
   else item.status=item.gps?'valid':'no-coordinates';
   if(item.hash)seen.add(item.hash);
  }catch(e){item.error=String(e?.message||e);}
  result.push(item);
  if(typeof onProgress==='function')onProgress({processed:i+1,total:items.length,item});
 }
 return result;
}

root.GeoCauceUnifiedPhotos={adapt,jpegExif,parseCsv,pointRecords,analyzePhotoBatch};
})(typeof window!=='undefined'?window:globalThis);

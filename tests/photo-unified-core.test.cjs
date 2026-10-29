'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../photo-unified-core.js'),'utf8');
const ctx={window:{},crypto:require('node:crypto').webcrypto};vm.runInNewContext(code,ctx);
const api=ctx.window.GeoCauceUnifiedPhotos;
test('Legacy historical and current photographs share an adapter without altering records',()=>{
 const old={id:'p1',name:'1910',historicalDate:'1910',blob:{size:123}};
 const point={id:'hp1',x:100,y:200,crs:25831,photos:['p1'],linkedStopId:'stop1'};
 const before=JSON.stringify(old),view=api.adapt(old,[point]);
 assert.equal(view.id,'p1');assert.equal(view.pointId,'hp1');assert.equal(view.stopId,'stop1');
 assert.equal(view.location.source,'historical-point');assert.equal(JSON.stringify(old),before);
});
test('Current GNSS location is preserved and does not inherit a historical point location',()=>{
 const rec={id:'p2',gnss:{lat:41.24,lon:2.13,source:'exif'},date:1234567890123};
 const view=api.adapt(rec,[{id:'hp2',photos:['p2'],x:3,y:4}]);
 assert.equal(view.location.lat,41.24);assert.equal(view.location.lon,2.13);
});
test('CSV understands semicolon and quoted strings',()=>{
 const out=api.parseCsv('Nombre;X;Y\n"Rio; tramo";400000;4600000\n');
 assert.equal(out.rows.length,1);assert.equal(out.rows[0].Nombre,'Rio; tramo');
});
test('GeoJSON point geometry keeps attributes and rejects invalid latitudes',()=>{
 const parsed=api.pointRecords({type:'FeatureCollection',features:[
  {type:'Feature',geometry:{type:'Point',coordinates:[1.5,41.5]},properties:{name:'A'}},
  {type:'Feature',geometry:{type:'Point',coordinates:[1.5,141.5]},properties:{name:'B'}}
 ]});
 assert.equal(parsed.length,1);assert.equal(parsed[0].name,'A');assert.equal(parsed[0].lon,1.5);
});
test('Malformed JPEG fails safely rather than inventing coordinates',()=>{
 assert.throws(()=>api.jpegExif(new Uint8Array([0,1,2,3])));
 assert.equal(api.jpegExif(new Uint8Array([255,216,255,217])).gps,undefined);
});

// Synthetic EXIF JPEGs for deterministic GPS tests. No user images are committed.
function syntheticJpeg({lat=41.5,lon=2.1,withGps=true,year=2026}={}){
 if(!withGps)return new Uint8Array([255,216,255,217]);
 const tiff=new Uint8Array(190),d=new DataView(tiff.buffer),le=true;
 const w16=(p,n)=>d.setUint16(p,n,le),w32=(p,n)=>d.setUint32(p,n,le);
 tiff.set([73,73],0);w16(2,42);w32(4,8);w16(8,3);
 const entry=(p,tag,type,count,value)=>{w16(p,tag);w16(p+2,type);w32(p+4,count);w32(p+8,value);};
 entry(10,0x112,3,1,1);entry(22,0x8825,4,1,50);entry(34,0x8769,4,1,104);w32(46,0);
 w16(50,4);entry(52,1,2,2,78);entry(64,2,5,3,142);entry(76,3,2,2,69);entry(88,4,5,3,166);w32(100,0);
 w16(104,1);entry(106,0x9003,2,20,122);w32(118,0);
 const when=year+':10:29 15:30:00\0';for(let i=0;i<when.length;i++)tiff[122+i]=when.charCodeAt(i);
 const coord=(value,at)=>{const deg=Math.trunc(value),mins=Math.trunc((value-deg)*60),sec=(value-deg-mins/60)*3600;
  [[deg,1],[mins,1],[Math.round(sec*1000000),1000000]].forEach(([n,m],i)=>{w32(at+i*8,n);w32(at+i*8+4,m);});
 };
 coord(lat,142);coord(lon,166);
 const len=tiff.length+8;
 const sof=[255,192,0,17,8,6,0,4,128,3,1,17,0,2,17,0,3,17,0];
 return Uint8Array.from([255,216,255,225,len>>8,len&255,69,120,105,102,0,0,...tiff,...sof,255,217]);
}
function file(bytes,name='IMG.JPG'){
 const blob=new Blob([bytes],{type:'image/jpeg'});
 return {name,type:'image/jpeg',size:blob.size,slice:(a,b)=>blob.slice(a,b),arrayBuffer:()=>blob.arrayBuffer()};
}
test('EXIF extracts separate GPS values, original date, orientation and image dimensions',()=>{
 const a=api.jpegExif(syntheticJpeg({lat:41.5,lon:2.1,year:2025}));
 const b=api.jpegExif(syntheticJpeg({lat:42.25,lon:1.75,year:2026}));
 assert.ok(Math.abs(a.gps.lat-41.5)<0.00001);assert.ok(Math.abs(a.gps.lon-2.1)<0.00001);
 assert.ok(Math.abs(b.gps.lat-42.25)<0.00001);assert.ok(Math.abs(b.gps.lon-1.75)<0.00001);
 assert.equal(a.dateOriginal,'2025:10:29 15:30:00');assert.equal(a.orientation,1);
 assert.equal(a.width,1152);assert.equal(a.height,1536);
});
test('Analyzes 50 different GPS locations without sharing positions',async()=>{
 const inputs=Array.from({length:50},(_,i)=>file(syntheticJpeg({lat:41.1+i*.001,lon:2.1+i*.001}),'IMG_'+i+'.JPG'));
 const result=await api.analyzePhotoBatch(inputs);
 assert.equal(result.length,50);assert.equal(result.filter(x=>x.status==='valid').length,50);
 assert.equal(new Set(result.map(x=>x.gps.lat.toFixed(5))).size,50);
});
test('Keeps twenty GPS photos and five unlocated photos for review',async()=>{
 const inputs=[...Array.from({length:20},(_,i)=>file(syntheticJpeg({lat:41.2+i*.002}),'GPS_'+i+'.jpg')),...Array.from({length:5},(_,i)=>file(syntheticJpeg({withGps:false}),'NO_GPS_'+i+'.jpg'))];
 const result=await api.analyzePhotoBatch(inputs);
 assert.equal(result.filter(x=>x.status==='valid').length,20);
 // Identical content with a different filename is correctly flagged as duplicate.
 assert.equal(result.filter(x=>x.status==='no-coordinates').length,1);
 assert.equal(result.filter(x=>x.status==='duplicate').length,4);
 assert.equal(result.filter(x=>x.gps===null).length,5);
});
test('Repeated image is flagged by content hash, not by name',async()=>{
 const bytes=syntheticJpeg({lat:41.9});
 const first=await api.analyzePhotoBatch([file(bytes,'A.jpg'),file(bytes,'B.jpg')]);
 assert.equal(first[0].status,'valid');assert.equal(first[1].status,'duplicate');
 const second=await api.analyzePhotoBatch([file(bytes,'C.jpg')],{existingHashes:[first[0].hash]});
 assert.equal(second[0].status,'duplicate');
});

test('Cancelling a large batch stops EXIF work without saving new data',async()=>{
 const inputs=Array.from({length:85},(_,i)=>file(syntheticJpeg({lat:41.2+i*.001}),'GPS_'+i+'.jpg'));
 let processed=0;
 const result=await api.analyzePhotoBatch(inputs,{shouldCancel:()=>processed>=4,onProgress:()=>processed++});
 assert.equal(processed,4);
 assert.equal(result.length,4);
});

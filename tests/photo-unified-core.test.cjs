'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../photo-unified-core.js'),'utf8');
const ctx={window:{}};vm.runInNewContext(code,ctx);
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

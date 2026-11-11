const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const sw=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
const sqliteReader=fs.readFileSync(path.join(__dirname,'../gpkg-lite.js'),'utf8');
const importer=fs.readFileSync(path.join(__dirname,'../gpkg-import.js'),'utf8');
const ctx={window:{},TextDecoder,Uint8Array,DataView,ArrayBuffer,Map,Set,BigInt,Number,Math,Error};
vm.runInNewContext(sqliteReader,ctx);
const gpkg=ctx.window.GeoCauceGpkg;
const bytes=Buffer.from(execFileSync('python3',[path.join(__dirname,'make-gpkg-fixture.py')],{maxBuffer:8*1024*1024}).toString().trim(),'base64');
const fixture=new Uint8Array(bytes);

test('GPKG reader opens SQLite metadata and discovers feature + tile tables',()=>{
 const d=gpkg.open(fixture);
 assert.equal(d.contents.length,2);
 assert.equal(d.geometryColumns[0].column_name,'geom');
 assert.equal(d.matrix[0].tile_width,256);
 assert.equal(d.matrixSets[0].max_x,400256);
});
test('GPKG traverses B-tree and overflow records, and reads WKB geometry and attributes',()=>{
 const d=gpkg.open(fixture),rows=Array.from(d.db.rows('curs torrent'));
 assert.equal(rows.length,260);
 assert.equal(rows[42].nom,'torrent 42');
 assert.equal(rows[42].long_text.length,1000);
 const g=d.decodeGeometry(rows[42].geom);
 assert.equal(g.shapeType,3);
 assert.equal(g.paths.length,1);
 assert.equal(g.paths[0].length,2);
 assert.equal(g.paths[0][0].x,400042);
 assert.equal(g.paths[0][0].y,4600000);
});
test('GPKG raster tile bytes survive read intact',()=>{
 const d=gpkg.open(fixture),row=Array.from(d.db.rows('imatges'))[0];
 assert.equal(row.zoom_level,1);
 assert.equal(row.tile_column,0);
 assert.deepEqual(Array.from(row.tile_data.slice(0,4)),[137,80,78,71]);
});
test('Both import pickers accept GeoPackage and offline PWA caches the parser',()=>{
 assert.match(html,/id="mapFileInput"[^>]+\.gpkg/);
 assert.match(html,/id="vectorFileInput"[^>]+\.gpkg/);
 assert.match(html,/gpkg-lite\.js/);
 assert.match(html,/gpkg-import\.js/);
 assert.match(sw,/gpkg-lite\.js/);
 assert.match(sw,/gpkg-import\.js/);
 assert.match(app,/function prepareQueuedGeoPackage/);
 assert.match(app,/item.kind==='gpkg'/);
 assert.match(importer,/async function prepare\(file,config/);
 assert.doesNotMatch(importer,/fetch\(/);
});

test('GPKG preparation returns complete vector + georeferenced raster from one file',async()=>{
 const drawings=[],scope={
  window:{GeoCauceGpkg:gpkg},Uint8Array,Blob,Date,Math,Number,Error,
  createImageBitmap:async()=>({width:1,height:1,close(){}}),
  document:{createElement:()=>({width:0,height:0,getContext:()=>({
    imageSmoothingEnabled:true,drawImage(...args){drawings.push(args)}
   }),toBlob(cb){cb(new Blob(['raster preview'],{type:'image/png'}));}})}
 };
 vm.runInNewContext(importer,scope);
 let n=0;
 const deps={
  projectEpsg:()=>25831,rasterBounds:()=>null,
  transform:(p,src,dst)=>{assert.equal(src,dst);return p;},
  pointsBounds:paths=>({minX:Math.min(...paths.flat().map(p=>p.x)),maxX:Math.max(...paths.flat().map(p=>p.x)),
    minY:Math.min(...paths.flat().map(p=>p.y)),maxY:Math.max(...paths.flat().map(p=>p.y))}),
  intersects:()=>true,featureLabel:a=>a.nom,color:()=>"#113355",id:prefix=>prefix+(++n)
 };
 const file={name:'demo.gpkg',arrayBuffer:async()=>fixture.buffer.slice(fixture.byteOffset,fixture.byteOffset+fixture.byteLength)};
 const prepared=await scope.window.GeoCauceGpkgImporter.prepare(file,{role:'watercourse',color:'#113355'},deps);
 assert.equal(prepared.kind,'geopackage');
 assert.equal(prepared.layers.length,1);
 assert.equal(prepared.layers[0].features.length,260);
 assert.equal(prepared.layers[0].role,'watercourse');
 assert.equal(prepared.layers[0].features[0].label,'torrent 0');
 assert.equal(prepared.rasters.length,1);
 assert.equal(prepared.rasters[0].meta.epsg,25831);
 assert.equal(prepared.rasters[0].affine.C,400000);
 assert.equal(prepared.rasters[0].affine.F,4600156);
 assert.equal(prepared.rasters[0].blob.type,'image/png');
 assert.equal(drawings.length,1);
 assert.deepEqual(Array.from(prepared.warnings),[]);
});

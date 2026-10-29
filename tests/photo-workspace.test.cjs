'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const core=fs.readFileSync(path.join(root,'photo-unified-core.js'),'utf8');
const source=fs.readFileSync(path.join(root,'photo-workspace.js'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const ctx={window:{crypto:require('node:crypto').webcrypto}};
vm.runInNewContext(core,ctx);
const withTestHooks=source.replace('return {install,show,showGallery};','return {install,show,showGallery,__test:{parsePointFile,photoDistance,locationOf,fieldSamplePositions,buttons,ensureSavedPhotoPoint,digestFile}};');
assert.notEqual(withTestHooks,source,'Workspace test export must exist');
vm.runInNewContext(withTestHooks,ctx);
const ws=ctx.window.GeoCaucePhotoWorkspace,internal=ws.__test;
ws.install({project:(lon,lat)=>({x:lon,y:lat}),epsg:()=>4326});
test('Imports CSV geographic points with distinct positions',()=>{
 const csv='name,longitude,latitude\n'+Array.from({length:50},(_,i)=>'Point'+i+','+(1.8+i/1000)+','+(41.6+i/1000)).join('\n');
 const p=internal.parsePointFile(csv,'points.csv',4326);
 assert.equal(p.length,50);assert.equal(new Set(p.map(x=>x.x)).size,50);
 assert.equal(p[0].name,'Point0');assert.equal(p[0].crs,4326);
});
test('CSV UTM coordinates remain UTM until reprojection',()=>{
 const p=internal.parsePointFile('id;X;Y\nP1;400000;4600000\nP2;400010;4600005\n','utm.csv',25831);
 assert.equal(p[0].x,400000);assert.equal(p[0].y,4600000);assert.equal(p[0].crs,25831);
});
test('GeoJSON with an explicit CRS does not misinterpret UTM as longitude',()=>{
 const src={type:'FeatureCollection',crs:{type:'name',properties:{name:'EPSG:25831'}},features:[
  {type:'Feature',geometry:{type:'Point',coordinates:[402500,4602500]},properties:{name:'A'}}
 ]};
 const p=internal.parsePointFile(JSON.stringify(src),'data.geojson',4326);
 assert.equal(p[0].crs,25831);assert.equal(p[0].x,402500);
});
test('Photo locations supplied manually override a missing EXIF coordinate',()=>{
 const row={manualWorld:{x:1.81454,y:41.60515},gps:null};
 const p=internal.locationOf(row);
 assert.equal(p.x,1.81454);assert.equal(p.y,41.60515);
});
test('The three supplied control points are opt-in and distinctly placed',()=>{
 const p=internal.fieldSamplePositions;
 assert.equal(p['IMG_5212.JPEG'].label,'1a');
 assert.equal(p['IMG_5188.JPEG'].label,'2');
 assert.equal(p['IMG_5160.JPEG'].label,'3a');
 assert.equal(new Set(Object.values(p).map(q=>q.lat)).size,3);
 assert.match(source,/\$\('#gcApplyFieldPoints'\)\.onclick=applyFieldSamplePositions/);
});
test('Two-point distance uses true metric units when CRS is projected',()=>{
 ws.install({project:(lon,lat)=>({x:lon,y:lat}),epsg:()=>25831});
 assert.equal(internal.photoDistance({x:0,y:0},{x:3,y:4}),5);
});
test('PWA loads the importer before the map application and caches it offline',()=>{
 assert.ok(html.indexOf('photo-unified-core.js')<html.indexOf('photo-workspace.js'));
 assert.ok(html.indexOf('photo-workspace.js')<html.indexOf('src="app.js'));
 for(const name of ['photo-unified-core.js','photo-workspace.js','photo-workspace.css'])assert.ok(sw.includes(name));
 assert.match(app,/initPhotoWorkspaceR29\(\)/);
});
test('Import persists via existing IndexedDB bridge and checks stored binary sizes',()=>{
 assert.match(source,/await api\.savePhoto\(record\)/);
 assert.match(source,/await api\.readPhoto\(photoId\)/);
 assert.match(source,/saved\.blob\.size!==row\.file\.size/);
 assert.match(app,/savePhoto:record=>dbPut\('photos',record\)/);
 assert.match(app,/gcImportModal:not\(\.hidden\) #gcImportProgress/);
});
test('Photo metadata includes explicit date precision and reference photograph',()=>{
 assert.match(source,/documentDateRaw/);
 assert.match(source,/dateCertainty/);
 assert.match(source,/referencePhotoId/);
 assert.match(source,/showFieldOfView/);
 assert.match(source,/seriesNames/);
});

test('Photo-point association is saved and survives repeated attempts',()=>{
 const state={historicalPhotoPoints:[]};let writes=0;
 ws.install({getState:()=>state,epsg:()=>25831,persistVerified:()=>{writes++;return true;}});
 const record={id:'p-record-1',name:'JPEG',historicalPointId:'hp-record-1',campaignId:'D01',createdAt:123};
 assert.equal(internal.ensureSavedPhotoPoint(record,{x:400000,y:4610000},'Campo','D01'),true);
 assert.equal(state.historicalPhotoPoints.length,1);
 assert.equal(state.historicalPhotoPoints[0].photos[0],'p-record-1');
 assert.equal(state.historicalPhotoPoints[0].x,400000);
 assert.equal(writes,1);
 assert.equal(internal.ensureSavedPhotoPoint(record,{x:400000,y:4610000},'Campo','D01'),true);
 assert.equal(state.historicalPhotoPoints.length,1);
 assert.equal(writes,1);
});
test('Failed local-state persistence rolls back newly created map point',()=>{
 const state={historicalPhotoPoints:[]};
 ws.install({getState:()=>state,epsg:()=>25831,persistVerified:()=>{throw Error('QuotaExceededError');}});
 const record={id:'p-record-2',historicalPointId:'hp-record-2',campaignId:'D01'};
 assert.throws(()=>internal.ensureSavedPhotoPoint(record,{x:402000,y:4600000},'Campo','D01'),/QuotaExceededError/);
 assert.equal(state.historicalPhotoPoints.length,0);
});
test('Repeated photo metadata is not inserted twice into a pre-existing point',()=>{
 const point={id:'hp-record-3',photos:['p-record-3'],x:403000,y:4600000};
 const state={historicalPhotoPoints:[point]};
 ws.install({getState:()=>state,epsg:()=>25831,persistVerified:()=>{throw Error('Unexpected duplicate persistence');}});
 const record={id:'p-record-3',historicalPointId:'hp-record-3'};
 assert.equal(internal.ensureSavedPhotoPoint(record,{x:403000,y:4600000},'Campo','D01'),true);
 assert.deepEqual(point.photos,['p-record-3']);
});
test('Same source file yields repeatable SHA-256 for point-import IDs',async()=>{
 const file=new Blob(['name,latitude,longitude\nA,41.6,1.8\n'],{type:'text/csv'});
 const hash1=await internal.digestFile(file),hash2=await internal.digestFile(file);
 assert.equal(hash1,hash2);
 assert.equal(hash1.length,64);
 assert.match(source,/pointImportId:'mp-'\+fileHash\.slice\(0,32\)\+'-'\+pointIndex/);
});
test('Import list paginates and map selections navigate to matching page',()=>{
 assert.match(source,/rows\.slice\(pageStart,pageStart\+maxRows\)/);
 assert.match(source,/listPage=Math\.floor\(selected\/100\)/);
 assert.match(source,/gc-row-pagination/);
});

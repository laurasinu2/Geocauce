'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'map-relocation.js'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const context={window:{}};vm.runInNewContext(source,context);
const core=context.window.GeoCauceMapRelocation;
test('Photographic point relocation preserves links, IDs and its image collection',()=>{
 const p={id:'hp-1',x:401000,y:4600000,crs:25831,photos:['p1','p2'],
  linkedStopId:'stop-1',photoPointPosition:{x:401000,y:4600000,crs:25831}};
 const moved=core.movePhotoPoint(p,{x:402000,y:4600500},{crs:25831,lonLat:{lat:41.6,lon:1.8}});
 assert.equal(moved.id,p.id);assert.deepEqual(Array.from(moved.photos),['p1','p2']);
 assert.equal(moved.linkedStopId,'stop-1');assert.equal(moved.x,402000);assert.equal(moved.photoPointPosition.y,4600500);
 assert.equal(p.x,401000);assert.equal(moved.positionHistory.length,1);
});
test('Unlocated photograph receives a new photo point without invented previous coordinates',()=>{
 const p={id:'hp-new',photos:['new-photo']};
 const next=core.movePhotoPoint(p,{x:402000,y:4600000},{crs:25831});
 assert.equal(next.x,402000);assert.equal(next.positionSource,'manual-map');
 assert.equal(next.photoPointPosition.x,402000);assert.equal(p.x,undefined);
});
test('Moved photo preserves original binary, EXIF, heading and documentary relations',()=>{
 const binary={size:1000},p={id:'p-1',blob:binary,heading:71,
  historicalPointId:'hp-1',featureId:'f-1',exifMetadata:{originalGPS:{lat:41.2,lon:1.6}},
  gnss:{x:402000,y:4600000,source:'exif'}};
 const newPhoto=core.movePhotoRecord(p,{x:403000,y:4610000},
  {crs:25831,lonLat:{lat:41.6,lon:1.8},pointId:'hp-2'});
 assert.strictEqual(newPhoto.blob,binary);
 assert.equal(newPhoto.heading,71);assert.equal(newPhoto.featureId,'f-1');
 assert.equal(newPhoto.historicalPointId,'hp-2');assert.equal(newPhoto.gnss.source,'manual-map');
 assert.equal(newPhoto.gnss.lat,41.6);assert.equal(newPhoto.positionHistory.length,1);
 assert.equal(p.gnss.x,402000);assert.equal(p.exifMetadata.originalGPS.lat,41.2);
 assert.equal(newPhoto.originalGnss.x,402000);
});
test('Move stop to chosen coordinate without moving any other point',()=>{
 const creation={x:400000,y:4600000,source:'map'};
 const stop={id:'stop-1',kind:'stop',x:400000,y:4600000,position:creation,creationPosition:creation};
 const moved=core.movePin(stop,{x:410000,y:4601000},{crs:25831,lonLat:{lat:41.6,lon:1.8},
  utm:{x:410000,y:4601000,crs:25831}});
 assert.equal(moved.x,410000);assert.equal(moved.position.source,'manual-map');
 assert.equal(moved.position.lat,41.6);assert.equal(moved.position.utmCrs,25831);
 assert.equal(moved.originalPosition.x,400000);
 assert.strictEqual(moved.creationPosition,creation);assert.equal(stop.x,400000);
});
test('Move complex river keeping all fragments and their relative arrangement',()=>{
 const river={id:'C1',type:'watercourse',
  points:[{x:0,y:0},{x:100,y:0}],fragments:[
    [{x:0,y:0},{x:100,y:0}],
    [{x:200,y:100},{x:300,y:100}]
  ],longitudinalProfile:{dummy:true}};
 const anchor=core.featureAnchor(river);
 const moved=core.moveFeature(river,{x:anchor.x+500,y:anchor.y-250});
 assert.equal(moved.fragments[0][0].x,500);
 assert.equal(moved.fragments[1][1].y,-150);
 assert.equal(moved.points[1].x,600);assert.equal(moved.longitudinalProfile,null);
 assert.equal(river.points[0].x,0);
});
test('Move section or polygon without distorting its original shape',()=>{
 const feature={id:'SEC-1',type:'section',points:[{x:0,y:0},{x:30,y:0}],
  anchorPoint:{x:15,y:0},sectionProfile:{old:true},
  erasures:[{points:[{x:10,y:0}],widthWorld:4}]};
 const moved=core.moveFeature(feature,{x:100,y:200});
 assert.equal(moved.points[0].x,85);assert.equal(moved.points[1].x,115);
 assert.equal(moved.anchorPoint.y,200);
 assert.equal(moved.derivedDataStale,true);
 assert.deepEqual(moved.relocationPreviousDerived.sectionProfile,{old:true});
 assert.equal(moved.sectionProfile,null);assert.equal(moved.erasures[0].points[0].x,95);
 assert.deepEqual(Array.from(moved.points).map(p=>p.x),[85,115]);
});
test('Move a notebook position and a cartographic pen stroke independently',()=>{
 const original={type:'position',x:2,y:3};
 const moved=core.moveNotebookLink(original,{x:20,y:30});
 assert.equal(moved.x,20);assert.equal(original.x,2);
 const stroke=core.moveInkStroke({points:[{x:0,y:0},{x:2,y:0}],color:'#000'}, {x:20,y:30});
 assert.equal(stroke.points[0].x,19);assert.equal(stroke.points[1].x,21);
});
test('Invalid target coordinates reject moving any feature',()=>{
 assert.throws(()=>core.moveFeature({points:[{x:1,y:2}]},{x:NaN,y:1}));
 assert.throws(()=>core.movePhotoPoint({}, {x:Infinity,y:100}));
 assert.throws(()=>core.moveNotebookLink({type:'feature',x:1,y:1},{x:3,y:4}));
});
test('Relocation UI is available on the map, photos, stops and features',()=>{
 for(const id of ['gcMovePhotoPoint','gcMoveStop','gcMoveFeatureBtn','gcMoveFeatureMoreBtn']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.ok(html.includes('data-tool="relocate"'));
 assert.ok(html.includes('map-relocation.js?v='));
 assert.ok(sw.includes('map-relocation.js'));
 assert.match(app,/function finishPointRelocation\(sp\)/);
 assert.match(app,/function beginPointRelocation\(kind,id,extra/);
 assert.match(app,/if\(state\.relocatingPoint\)return true/);
});
test('The map relocation keeps 2-finger navigation and cancels on Escape',()=>{
 assert.match(app,/state\.tool==='relocate'\|\|!!state\.relocatingPoint/);
 assert.match(app,/if\(e\.key==='Escape'&&state\.relocatingPoint\)/);
 assert.match(app,/e\.type!=='pointercancel'/);
 assert.match(app,/pending\.projectId!==state\.projectId/);
 assert.match(app,/confirm\('¿Anclar/);
});
test('Moving a reach translates the whole course and preserves selected anchor',()=>{
 assert.match(app,/if\(f\?\.type==='reach'&&f\.courseId\)/);
 assert.match(app,/const group=relocationFeatureGroup\(feature\),anchor=core\.featureAnchor\(feature\)/);
 assert.match(app,/x\.type==='section'&&/);
});
test('Moving an individual photo does not move every photo sharing its point',()=>{
 assert.match(app,/point\.photos=point\.photos\.filter\(id=>id!==photoId\)/);
 assert.match(app,/await dbPut\('photos',next\)/);
 assert.match(app,/const failedRestores=\[\]/);
});

test('Moving a photograph without prior GPS does not invent a former position',()=>{
 const image={id:'p-unlocated',blob:{size:20},exifMetadata:{dateTimeOriginal:null}};
 const moved=core.movePhotoRecord(image,{x:410000,y:4600100},{crs:25831,lonLat:{lat:41.6,lon:1.8}});
 assert.equal(moved.gnss.source,'manual-map');
 assert.equal(moved.positionHistory.length,0);
 assert.equal(moved.originalGnss,null);
 assert.equal(image.gnss,undefined);
});
test('Relocation selection is explicit when markers overlap',()=>{
 assert.match(app,/function chooseRelocationCandidate\(choices\)/);
 assert.match(app,/gcRelocationChooseList/);
 assert.match(app,/if\(choices\.length\)return chooseRelocationCandidate\(choices\)/);
});

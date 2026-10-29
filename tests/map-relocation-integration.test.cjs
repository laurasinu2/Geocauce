'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const coreSource=fs.readFileSync(path.join(__dirname,'../map-relocation.js'),'utf8');
const from=app.indexOf('function relocationFeatureGroup(f){');
const to=app.indexOf('async function finishPointRelocation(sp){',from);
assert.ok(from>0&&to>from,'Original app relocation implementation must exist');
const extract=app.slice(from,to)+'\nwindow.applyPointRelocation=applyPointRelocation;';
const clone=v=>JSON.parse(JSON.stringify(v));
function scenario({features=[],points=[],pins=[],photos=[],persistFailure=false}={}){
 const state={features:clone(features),historicalPhotoPoints:clone(points),mapPins:clone(pins),mapInk:[],notebook:{pages:[]},history:[]};
 const records=new Map(photos.map(p=>[p.id,{...p}]));
 let persistCalls=0,sequence=0;
 const context={window:{},state,
  relocationCore:()=>context.window.GeoCauceMapRelocation,
  workingMapEpsg:()=>25831,projectCrsEpsg:()=>25831,
  relocationWgs:()=>({lat:41.60515,lon:1.81454}),
  relocationUtm:(_,ll)=>({x:401000,y:4600000,crs:25831}),
  dbGet:async(_,id)=>records.get(id),
  dbPut:async(_,record)=>{records.set(record.id,record);},
  cloneAny:clone,cloneFeatures:()=>clone(state.features),
  cloudUuid:()=>('unique-'+(++sequence)),historicalPointById:id=>state.historicalPhotoPoints.find(p=>p.id===id)||null,
  persistStateLocalOnly:()=>{
   persistCalls++;if(persistFailure)throw Error('Local storage denied');
   return{projectId:'test'};
  },scheduleCloudSync:()=>{},renderSectionList:()=>{},updateHydroFab:()=>{}
 };
 vm.runInNewContext(coreSource,context);
 vm.runInNewContext(extract,context);
 return{state,records,run:context.window.applyPointRelocation,persistCount:()=>persistCalls};
}
test('Moving one of two photographs detaches it, keeping the other in its exact original position',async()=>{
 const originalBlob={size:64000};
 const photos=[
  {id:'p1',name:'1925.jpg',blob:originalBlob,gnss:{x:400000,y:4600000},historicalPointId:'hp1'},
  {id:'p2',name:'2026.jpg',blob:originalBlob,gnss:{x:400000,y:4600000},historicalPointId:'hp1'}];
 const point={id:'hp1',name:'Punto original',x:400000,y:4600000,crs:25831,photos:['p1','p2']};
 const env=scenario({photos,points:[point]});
 const result=await env.run({kind:'photo',id:'p1'},{x:401000,y:4601000});
 assert.match(result,/Fotografía trasladada/);
 assert.equal(env.state.historicalPhotoPoints.length,2);
 const old=env.state.historicalPhotoPoints.find(p=>p.id==='hp1');
 assert.deepEqual(Array.from(old.photos),['p2']);assert.equal(old.x,400000);
 const moved=env.state.historicalPhotoPoints.find(p=>(p.photos||[]).includes('p1'));
 assert.equal(moved.x,401000);assert.equal(moved.y,4601000);
 assert.equal(env.records.get('p2').gnss.x,400000);
 assert.equal(env.records.get('p1').gnss.x,401000);
 assert.strictEqual(env.records.get('p1').blob,originalBlob);
});
test('Moving a shared photo point moves all photos but not the stop it is linked to',async()=>{
 const photos=[
  {id:'p1',blob:{size:100},gnss:{x:10,y:20},historicalPointId:'hp1'},
  {id:'p2',blob:{size:200},gnss:{x:10,y:20},historicalPointId:'hp1'}];
 const env=scenario({photos,points:[{id:'hp1',x:10,y:20,crs:25831,linkedStopId:'P1',photos:['p1','p2']}],
  pins:[{id:'P1',kind:'stop',x:10,y:20}]});
 await env.run({kind:'photoPoint',id:'hp1'},{x:50,y:60});
 assert.equal(env.state.historicalPhotoPoints[0].x,50);
 assert.equal(env.records.get('p1').gnss.x,50);
 assert.equal(env.records.get('p2').gnss.y,60);
 assert.equal(env.state.mapPins[0].x,10);
 assert.equal(env.state.historicalPhotoPoints[0].linkedStopId,'P1');
});
test('Moving a stop changes its position and coordinates but not any linked photograph',async()=>{
 const env=scenario({
  pins:[{id:'P1',kind:'stop',x:400000,y:4600000,position:{x:400000,y:4600000},creationPosition:{x:400000,y:4600000}}],
  points:[{id:'hp1',linkedStopId:'P1',x:400000,y:4600000,photos:[]}]
 });
 await env.run({kind:'pin',id:'P1'},{x:401000,y:4600500});
 assert.equal(env.state.mapPins[0].x,401000);
 assert.equal(env.state.mapPins[0].position.lat,41.60515);
 assert.equal(env.state.historicalPhotoPoints[0].x,400000);
 assert.equal(env.state.mapPins[0].creationPosition.x,400000);
});
test('Moving a selected reach anchors that reach correctly and translates its whole course and sections',async()=>{
 const features=[
  {id:'river',type:'watercourse',points:[{x:0,y:0},{x:100,y:0}],fragments:[[{x:0,y:0},{x:100,y:0}]]},
  {id:'reach',type:'reach',courseId:'river',points:[{x:30,y:0},{x:50,y:0}],mdeStats:{old:true}},
  {id:'section',type:'section',reachId:'reach',points:[{x:40,y:-10},{x:40,y:10}],sectionProfile:{old:true}},
  {id:'unrelated',type:'deposit',points:[{x:10,y:40},{x:20,y:40}]}];
 const env=scenario({features});
 await env.run({kind:'feature',id:'reach'},{x:300,y:200});
 const reach=env.state.features.find(f=>f.id==='reach');
 const river=env.state.features.find(f=>f.id==='river');
 const section=env.state.features.find(f=>f.id==='section');
 assert.equal((reach.points[0].x+reach.points[1].x)/2,300);
 assert.equal(river.points[0].x,260);
 assert.equal(section.points[0].x,300);
 assert.equal(section.sectionProfile,null);
 assert.equal(env.state.features.find(f=>f.id==='unrelated').points[0].x,10);
 assert.equal(env.state.history.length,1);
});
test('A failed relocation write restores the previous stop coordinates',async()=>{
 const env=scenario({pins:[{id:'P1',kind:'stop',x:400000,y:4600000}],persistFailure:true});
 await assert.rejects(env.run({kind:'pin',id:'P1'},{x:410000,y:4610000}),/Local storage denied/);
 assert.equal(env.state.mapPins[0].x,400000);
});
test('A failed photo-point write restores the old position and image metadata',async()=>{
 const env=scenario({points:[{id:'hp1',x:400000,y:4600000,photos:['p1']}],
  photos:[{id:'p1',blob:{size:100},gnss:{x:400000,y:4600000},historicalPointId:'hp1'}],
  persistFailure:true});
 await assert.rejects(env.run({kind:'photoPoint',id:'hp1'},{x:410000,y:4610000}),/Local storage denied/);
 assert.equal(env.state.historicalPhotoPoints[0].x,400000);
 assert.equal(env.records.get('p1').gnss.x,400000);
});

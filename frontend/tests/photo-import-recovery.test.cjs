'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../photo-workspace.js'),'utf8');
const injected=source.replace(
 'return {install,show,showGallery};',
 "render=()=>{};progress=()=>{};return {install,show,showGallery,__test:{commit,setRows:(list,kind)=>{rows=list;tab=kind;busy=false;},ensureSavedPhotoPoint}};"
);
assert.notEqual(injected,source,'Internal test adapters must exist');
const nodes=new Map();
const document={
 querySelector(selector){
  const id=selector.slice(1);
  if(!nodes.has(id))nodes.set(id,{value:id==='gcLayerName'?'Fotografías de campo':'',
   checked:id==='gcKeepUnlocated'||id==='gcDuplicates',textContent:'',disabled:false,
   classList:{add(){},remove(){},toggle(){}}});
  return nodes.get(id);
 }
};
const root={window:{crypto:require('node:crypto').webcrypto},document,URL,setTimeout,console};
vm.runInNewContext(injected,root);
const workspace=root.window.GeoCaucePhotoWorkspace;
function setup({failFirst=false}={}){
 const photos=new Map(),state={projectId:'test',campaign:'D01',historicalPhotoPoints:[],mapPins:[]};
 let fail=failFirst,confirmed=0;
 const bridge={
  getState:()=>state,canEdit:()=>true,epsg:()=>25831,redraw(){},scheduleSync(){},
  photoHashes:async()=>[...photos.values()].map(p=>p.contentHash).filter(Boolean),
  savePhoto:async record=>{photos.set(record.id,record);},
  readPhoto:async id=>photos.get(id)||null,
  findPhotoByHash:async hash=>[...photos.values()].find(p=>p.contentHash===hash)||null,
  persistVerified:()=>{if(fail){fail=false;throw Error('Quota exceeded');}confirmed++;return true;}
 };
 workspace.install(bridge);
 return {state,photos,bridge,confirmed:()=>confirmed};
}
const makePhoto=()=>({
 name:'IMG_5212.jpeg',hash:'a'.repeat(64),file:new Blob(['JPEG content'],{type:'image/jpeg'}),
 manualWorld:{x:401250,y:4601100},manualGps:{lat:41.60515,lon:1.81454},
 metadata:{},gps:null,excluded:false,error:null,duplicate:false
});
test('Interrupted photo import keeps original blob and restores its missing point on retry',async()=>{
 const env=setup({failFirst:true}),first=makePhoto();
 workspace.__test.setRows([first],'photos');
 await workspace.__test.commit();
 assert.equal(env.photos.size,1);
 assert.equal(env.state.historicalPhotoPoints.length,0);
 assert.match(first.error,/Error al guardar/);
 const retry=makePhoto();
 workspace.__test.setRows([retry],'photos');
 await workspace.__test.commit();
 assert.equal(env.photos.size,1,'No second binary must be created');
 assert.equal(env.state.historicalPhotoPoints.length,1);
 assert.equal(env.state.historicalPhotoPoints[0].photos[0],[...env.photos.keys()][0]);
 assert.equal(env.confirmed(),1);
});
test('Same GPS input point imported twice keeps a single marker',async()=>{
 const env=setup();
 const point=()=>({name:'P1',pointImportId:'mp-hash-0',world:{x:402000,y:4600000},
  point:{x:402000,y:4600000,crs:25831,properties:{name:'P1'}},excluded:false,error:null});
 workspace.__test.setRows([point()],'points');
 await workspace.__test.commit();
 workspace.__test.setRows([point()],'points');
 await workspace.__test.commit();
 assert.equal(env.state.mapPins.length,1);
 assert.equal(env.state.mapPins[0].id,'mp-hash-0');
 assert.equal(env.state.mapPins[0].sourceCrs,25831);
 assert.equal(env.confirmed(),1);
});

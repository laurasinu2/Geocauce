'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const deltaSource=fs.readFileSync(path.join(__dirname,'../cloud-delta-sync.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const sync=new Function('window',deltaSource+';return window.GeoCauceDeltaSync;')({});
const clone=x=>JSON.parse(JSON.stringify(x));
const now=Date.now();
const statusPath='/campaigns[id=D01]/upserts[id=SEC1]/sheetIII/workStatus';
const orderPath='/campaigns[id=D01]/order';
const project=(status='pending',note='')=>({projectId:'pr1',campaigns:[{
 id:'D01',order:['SEC1','SEC2'],upserts:[
  {id:'SEC1',sheetIII:{workStatus:status,observations:''}},
  {id:'SEC2',sheetIII:{workStatus:'pending',observations:note}}
 ]
}],mapPins:[]});
const sec1=x=>x.campaigns[0].upserts[0].sheetIII;
const sec2=x=>x.campaigns[0].upserts[1].sheetIII;
function assertIds(actual,expected){assert.equal(JSON.stringify([...actual].sort()),JSON.stringify([...expected].sort()));}

test('offline edits in different sections merge without losing either edit',()=>{
 const base=project(),mobile=project('done'),tablet=project('pending','Observación de la tablet');
 const r=sync.merge(base,mobile,tablet);
 assert.equal(r.conflicts.length,0);
 assert.equal(sec1(r.value).workStatus,'done');
 assert.equal(sec2(r.value).observations,'Observación de la tablet');
});

test('offline edits in different fields of the SAME section also merge',()=>{
 const base=project(),mobile=project('done'),tablet=project('pending');
 tablet.campaigns[0].upserts[0].sheetIII.observations='Notas independientes';
 const r=sync.merge(base,mobile,tablet);
 assert.equal(r.conflicts.length,0);
 assert.equal(sec1(r.value).workStatus,'done');
 assert.equal(sec1(r.value).observations,'Notas independientes');
});

test('latest reliable edit clock wins only when both devices edit the same field',()=>{
 const base=project(),mobile=project('done'),tablet=project('started');
 const r=sync.merge(base,mobile,tablet,{editTimes:{
  local:{[statusPath]:now-60000},remote:{[statusPath]:now-10000}
 }});
 assert.equal(r.conflicts.length,0);
 assert.equal(sec1(r.value).workStatus,'started');
 assert.equal(r.autoResolved.length,1);
 assert.equal(r.autoResolved[0].source,'field');
});

test('latest timestamp of an entire object NEVER discards independent child edits',()=>{
 const base={campaigns:[{id:'D01',upserts:[]}]};
 const mobile={campaigns:[{id:'D01',upserts:[{id:'SEC1',sheetIII:{workStatus:'done'}}]}]};
 const tablet={campaigns:[{id:'D01',upserts:[{id:'SEC1',sheetIII:{observations:'datos tablet'}}]}]};
 const p='/campaigns[id=D01]/upserts[id=SEC1]';
 const r=sync.merge(base,mobile,tablet,{editTimes:{local:{[p]:now-5000},remote:{[p]:now-2000}}});
 assert.equal(r.conflicts.length,0);
 assert.equal(r.value.campaigns[0].upserts[0].sheetIII.workStatus,'done');
 assert.equal(r.value.campaigns[0].upserts[0].sheetIII.observations,'datos tablet');
});

test('two new offline GPS points with different IDs are both retained',()=>{
 const base=project(),mobile=clone(base),tablet=clone(base);
 mobile.mapPins.push({id:'gps-a',kind:'gps',x:1,y:2});
 tablet.mapPins.push({id:'gps-b',kind:'gps',x:3,y:4});
 const r=sync.merge(base,mobile,tablet);
 assert.equal(r.conflicts.length,0);
 assertIds(r.value.mapPins.map(x=>x.id),['gps-a','gps-b']);
 assert.match(app,/id:'gps-'\+cloudUuid\(\)/);
 assert.match(app,/id:'mp-'\+cloudUuid\(\)/);
});

test('independent inserted section IDs are combined even when order differs',()=>{
 const base={campaigns:[{id:'D01',order:['A']}]};
 const mobile={campaigns:[{id:'D01',order:['A','B']}]};
 const tablet={campaigns:[{id:'D01',order:['A','C']}]};
 const r=sync.merge(base,mobile,tablet);
 assert.equal(r.conflicts.length,0);
 assertIds(r.value.campaigns[0].order,['A','B','C']);
});

test('an order that removes an existing section is not automatically accepted',()=>{
 const base={campaigns:[{id:'D01',order:['A','B']}]};
 const mobile={campaigns:[{id:'D01',order:['B','C']}]};
 const tablet={campaigns:[{id:'D01',order:['A','B','D']}]};
 const r=sync.merge(base,mobile,tablet,{editTimes:{
  local:{[orderPath]:now-5000},remote:{[orderPath]:now-10000}
 }});
 assert.equal(r.conflicts.length,1);
 const chosen=sync.merge(base,mobile,tablet,{resolutions:{[orderPath]:'local'}});
 assert.equal(chosen.conflicts.length,0);
 assertIds(chosen.value.campaigns[0].order,['B','C','D']);
 assert.ok(!chosen.value.campaigns[0].order.includes('A'));
});

test('identical-timed, missing-timed and deletion-vs-edit conflicts remain manual',()=>{
 const base=project(),mobile=project('done'),tablet=project('started');
 assert.equal(sync.merge(base,mobile,tablet).conflicts.length,1);
 assert.equal(sync.merge(base,mobile,tablet,{editTimes:{
  local:{[statusPath]:now-10000},remote:{[statusPath]:now-11000}
 }}).conflicts.length,1);
 const removed=clone(base),changed=project('done');
 delete removed.campaigns[0].upserts[0].sheetIII.workStatus;
 assert.equal(sync.merge(base,removed,changed).conflicts.length,1);
});

test('a remote snapshot saved after the local edit does NOT prove its field is newer',()=>{
 const base=project(),mobile=project('done'),tablet=project('started');
 const r=sync.merge(base,mobile,tablet,{legacy:{
  localQueue:{[statusPath]:now-80000},remoteSnapshotAt:now-15000
 }});
 assert.equal(r.conflicts.length,1);
});

test('new local field changes record timestamps without changing other clocks',()=>{
 const a=app.indexOf('function cloudQueueStateDiff(');
 const b=app.indexOf('function cloudQueueAssetChange(',a);
 assert.ok(a>=0&&b>a);
 const code=app.slice(a,b);
 let counter=0;
 const queue=[],memory=new Map();
 const env={
  cloudApplyingRemote:false,window:{GeoCauceDeltaSync:sync},
  localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},
  cloudQueueKey:()=> 'q',cloudPendingChanges:()=>JSON.parse(memory.get('q')||'[]'),
  cloudUuid:()=>String(++counter),scheduleCloudSync:()=>{},
  cloudQueueChange:()=>{throw Error('fallback should not be needed')},console
 };
 const diff=new Function('env','with(env){'+code+';return cloudQueueStateDiff;}')(env);
 const old=project(),next=project('done');
 old.syncEditTimes={'/mapPins':now-90000};
 diff('pr1',JSON.stringify(old),next);
 assert.ok(Number(next.syncEditTimes[statusPath])>now-6000);
 assert.equal(next.syncEditTimes['/mapPins'],now-90000);
 assert.equal(JSON.parse(memory.get('q')).length,1);
 assert.equal(JSON.parse(memory.get('q'))[0].path,statusPath);
});

async function simulateAppMerge(base,local,remote,{manual=false,queue=[]}={}){
 const start=app.indexOf('async function cloudBidirectionalSync(');
 const end=app.indexOf('async function syncNow(',start);
 assert.ok(start>=0&&end>start);
 const body=app.slice(start,end),actions=[];
 const remoteAt=new Date(now-30000).toISOString(),oldAt=new Date(now-120000).toISOString();
 const store=new Map([['project:pr1',JSON.stringify(local)]]);
 const env={
  state:{projectId:'pr1',project:{cloudProjectId:'pr-cloud',_cloudUpdatedAt:Date.parse(oldAt)},campaign:'D01'},
  canEditCurrentProject:()=>true,cloudDeltaRunning:false,cloudSyncRunning:false,cloudRestoreRunning:false,
  loadCloudSession:()=>({access_token:'token'}),cloudConfigured:()=>true,navigator:{onLine:true},
  cloudSyncEditingInProgress:()=>false,cloudPendingChanges:()=>queue,
  cloudProgressStart:()=>{},cloudProgressFinish:()=>{},cloudProgressUpdate:()=>{},toast:()=>{},
  cloudSchema:async()=> 'modern',ensureCloudProjectId:()=> 'pr-cloud',
  cloudFetch:async url=>{
   if(url.includes('select=updated_at,state'))return [{updated_at:remoteAt,state:remote}];
   if(url.includes('select=updated_at'))return [{updated_at:remoteAt}];
   throw Error('unexpected request '+url);
  },
  dbGet:async(store,key)=>key==='baseline'?{projectId:'pr1',state:base,updatedAt:oldAt}:null,
  dbPut:async(store,rec)=>actions.push('recovery:'+rec.key),
  currentStatePayloadForCloud:()=>JSON.parse(store.get('project:pr1')),
  cloudSaveConflictVersions:async()=>actions.push('backups'),
  cloudResolveFieldConflicts:async()=>null,
  cloudDeltaReceivePhotos:async()=>{actions.push('photosChecked');return [];},
  cloudStableJson:x=>JSON.stringify(x),
  cloudApplyCollaborativeState:()=>actions.push('stateApplied'),
  renderSectionList:()=>{},updateCampaignUi:()=>{},drawAll:()=>{},
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
  projectStateKey:()=> 'project:pr1',
  saveProjectCatalog:()=>{},cloudDeltaSaveBase:async()=>actions.push('baselineSaved'),
  cloudClearAcknowledgedChanges:()=>actions.push('queueAcknowledged'),
  cloudLastAssetManifest:null,
  syncCurrentProjectToCloud:async()=>{actions.push('incrementalUpload');return true;},
  cloudDeltaRootError:()=>actions.push('pendingResolution'),
  refreshAccountUi:()=>{},cloudProgressTimer:0,document:{querySelector:()=>null},
  cloudConflictLabel:x=>x,window:{GeoCauceDeltaSync:sync},console
 };
 const run=new Function('env','with(env){'+body+';return cloudBidirectionalSync;}')(env);
 const result=await run({manual});
 return {result,actions,payload:JSON.parse(store.get('project:pr1'))};
}
test('real synchronization flow merges mobile/tablet independent changes and uploads once',async()=>{
 const base=project(),mobile=project('done'),tablet=project('pending','Datos tablet');
 const out=await simulateAppMerge(base,mobile,tablet);
 assert.equal(out.result,true);
 assert.equal(sec1(out.payload).workStatus,'done');
 assert.equal(sec2(out.payload).observations,'Datos tablet');
 assert.equal(out.actions.filter(x=>x==='incrementalUpload').length,1);
 assert.ok(out.actions.includes('queueAcknowledged'));
});

test('real sync backs up both sides before applying a newer conflicting value',async()=>{
 const base=project(),mobile=project('done'),tablet=project('started');
 mobile.syncEditTimes={[statusPath]:now-60000};
 tablet.syncEditTimes={[statusPath]:now-10000};
 const out=await simulateAppMerge(base,mobile,tablet);
 assert.equal(out.result,true);
 assert.equal(sec1(out.payload).workStatus,'started');
 assert.ok(out.actions.includes('backups'));
 assert.ok(out.actions.includes('stateApplied'));
 assert.equal(out.actions.filter(x=>x==='incrementalUpload').length,1);
});

test('uncertain conflict does not upload, overwrite, or acknowledge local edits',async()=>{
 const base=project(),mobile=project('done'),tablet=project('started');
 const out=await simulateAppMerge(base,mobile,tablet);
 assert.equal(out.result,false);
 assert.equal(sec1(out.payload).workStatus,'done');
 assert.ok(out.actions.includes('pendingResolution'));
 assert.ok(!out.actions.includes('incrementalUpload'));
 assert.ok(!out.actions.includes('queueAcknowledged'));
});

test('remote-only changes are received without uploading unchanged data again',async()=>{
 const base=project(),remote=project('pending','Texto recibido');
 const out=await simulateAppMerge(base,clone(base),remote);
 assert.equal(out.result,true);
 assert.equal(sec2(out.payload).observations,'Texto recibido');
 assert.ok(out.actions.includes('baselineSaved'));
 assert.ok(out.actions.includes('queueAcknowledged'));
 assert.ok(!out.actions.includes('incrementalUpload'));
});

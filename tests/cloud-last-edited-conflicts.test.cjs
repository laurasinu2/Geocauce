'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const deltaSource=fs.readFileSync(path.join(__dirname,'../cloud-delta-sync.js'),'utf8');
const appSource=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function engine(){const window={};vm.runInNewContext(deltaSource,{window,Date});return window.GeoCauceDeltaSync;}
const key='/campaigns[id=D01]/upserts[id=SEC-1]/sheetIII/workStatus';
const now=Date.now();
const status=value=>({campaigns:[{id:'D01',upserts:[{id:'SEC-1',sheetIII:{workStatus:value}}]}]});
test('different statuses use the newest trustworthy field edit timestamp',()=>{
 const m=engine().merge(status('started'),status('done'),status('pending'),{
  editTimes:{local:{[key]:now-12000},remote:{[key]:now-54000}}
 });
 assert.equal(m.conflicts.length,0);
 assert.equal(m.autoResolved[0].choice,'local');
 assert.equal(m.value.campaigns[0].upserts[0].sheetIII.workStatus,'done');
});
test('remote snapshot time is not treated as a reliable time for a single field',()=>{
 const m=engine().merge(status('started'),status('done'),status('pending'),{
  legacy:{localQueue:{[key]:now-80000},remoteSnapshotAt:now-10000}
 });
 assert.equal(m.conflicts.length,1);
 assert.equal(m.autoResolved.length,0);
});
test('missing or effectively tied timestamps require choosing',()=>{
 const api=engine(),base=status('started'),local=status('done'),remote=status('pending');
 assert.equal(api.merge(base,local,remote).conflicts.length,1);
 assert.equal(api.merge(base,local,remote,{editTimes:{local:{[key]:now-5000},remote:{[key]:now-5100}}}).conflicts.length,1);
});
test('independent order inserts merge without losing either section',()=>{
 const b={campaigns:[{id:'D01',order:['A','B']}]};
 const l={campaigns:[{id:'D01',order:['A','LOCAL','B']}]};
 const r={campaigns:[{id:'D01',order:['A','REMOTE','B']}]};
 const m=engine().merge(b,l,r);
 assert.equal(m.conflicts.length,0);
 assert.equal(JSON.stringify(m.value.campaigns[0].order),JSON.stringify(['A','LOCAL','REMOTE','B']));
});
test('incompatible reorder prefers most recent and retains both devices section IDs',()=>{
 const b={campaigns:[{id:'D01',order:['A','B','C']}]};
 const l={campaigns:[{id:'D01',order:['B','A','C','NEW_LOCAL']}]};
 const r={campaigns:[{id:'D01',order:['A','C','B','NEW_REMOTE']}]};
 const p='/campaigns[id=D01]/order';
 const m=engine().merge(b,l,r,{editTimes:{local:{[p]:now-22000},remote:{[p]:now-6000}}});
 assert.equal(m.conflicts.length,0);
 assert.equal(m.autoResolved[0].choice,'remote');
 assert.equal(JSON.stringify(m.value.campaigns[0].order),JSON.stringify(['A','C','B','NEW_REMOTE','NEW_LOCAL']));
 const decided=engine().merge(b,l,r,{resolutions:{[p]:'local'}});
 assert.equal(decided.conflicts.length,0);
 assert.ok(decided.value.campaigns[0].order.includes('NEW_LOCAL'));
});
test('deletion versus editing does not silently restore removed data',()=>{
 const base={mapPins:[{id:'stop-1',label:'before'}]};
 const local={mapPins:[]},remote={mapPins:[{id:'stop-1',label:'after'}]};
 const m=engine().merge(base,local,remote,{
  editTimes:{local:{'/mapPins[id=stop-1]':now-30000},remote:{'/mapPins[id=stop-1]/label':now-10000}}
 });
 assert.equal(m.conflicts.length,1);
 assert.equal(m.conflicts[0].type,'delete-versus-edit');
});
test('saving keeps field-edit metadata without restamping unchanged data',()=>{
 const i=appSource.indexOf('function cloudQueueStateDiff('),j=appSource.indexOf('function cloudQueueAssetChange(',i);
 assert.ok(i>0&&j>i);
 const memory=new Map();let counter=0;
 const env={
  cloudApplyingRemote:false,window:{GeoCauceDeltaSync:engine()},
  localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},
  cloudQueueKey:p=>'queue:'+p,
  cloudPendingChanges:p=>JSON.parse(memory.get('queue:'+p)||'[]'),
  cloudUuid:()=>String(++counter),scheduleCloudSync:()=>{},cloudQueueChange:()=>{},console
 };
 const fn=new Function('env','with(env){'+appSource.slice(i,j)+';return cloudQueueStateDiff;}')(env);
 const before=status('started'),after=status('done');
 fn('pr1',JSON.stringify(before),after);
 assert.ok(Number.isFinite(after.syncEditTimes[key]));
 assert.equal(counter,1);
 fn('pr1',JSON.stringify(after),JSON.parse(JSON.stringify(after)));
 assert.equal(counter,1);
});
test('manual conflict resolution saves both versions before asking',()=>{
 const i=appSource.indexOf('const mergeOptions='),j=appSource.indexOf('const hasLocal=localChange.length>0',i);
 assert.ok(i>0&&j>i);
 const flow=appSource.slice(i,j);
 assert.ok(flow.includes('cloudSaveConflictVersions(projectId,local,remote.state,remote.updated_at)'));
 assert.ok(flow.indexOf('cloudSaveConflictVersions(')<flow.indexOf('cloudResolveFieldConflicts('));
 assert.ok(appSource.includes('cloudDownloadConflictBackup'));
 assert.ok(appSource.includes('conflictRecoveryLocal'));
 assert.ok(appSource.includes('conflictRecoveryRemote'));
 assert.doesNotThrow(()=>new vm.Script(appSource));
});

test('legacy local modification after cloud snapshot is provably more recent',()=>{
 const m=engine().merge(status('started'),status('done'),status('pending'),{
  legacy:{localQueue:{[key]:now-5000},remoteSnapshotAt:now-40000}
 });
 assert.equal(m.conflicts.length,0);
 assert.equal(m.autoResolved[0].choice,'local');
 assert.equal(m.autoResolved[0].source,'snapshot-before-local');
});

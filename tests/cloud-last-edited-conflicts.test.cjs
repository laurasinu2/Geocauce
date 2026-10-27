'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const deltaSource=fs.readFileSync(path.join(__dirname,'../cloud-delta-sync.js'),'utf8');
const appSource=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function engine(){
 const window={};
 vm.runInNewContext(deltaSource,{window,Date});
 return window.GeoCauceDeltaSync;
}
const key='/campaigns[id=D01]/upserts[id=SEC-1]/sheetIII/workStatus';
const now=Date.now();
const status=value=>({campaigns:[{id:'D01',upserts:[{id:'SEC-1',sheetIII:{workStatus:value}}]}]});
test('newest local edit wins a workStatus disagreement',()=>{
 const m=engine().merge(status('started'),status('done'),status('pending'),{
  editTimes:{local:{[key]:now-12000},remote:{[key]:now-54000}}
 });
 assert.equal(m.conflicts.length,0);
 assert.equal(m.value.campaigns[0].upserts[0].sheetIII.workStatus,'done');
 assert.equal(m.autoResolved[0].choice,'local');
 assert.equal(m.autoResolved[0].source,'field');
});
test('newest remote edit wins a workStatus disagreement',()=>{
 const m=engine().merge(status('started'),status('done'),status('pending'),{
  editTimes:{local:{[key]:now-54000},remote:{[key]:now-12000}}
 });
 assert.equal(m.conflicts.length,0);
 assert.equal(m.value.campaigns[0].upserts[0].sheetIII.workStatus,'pending');
 assert.equal(m.autoResolved[0].choice,'remote');
});
test('legacy field uses queued local edit versus remote save, clearly marked estimated',()=>{
 const m=engine().merge(status('started'),status('done'),status('pending'),{
  legacy:{localQueue:{[key]:now-80000},remoteSnapshotAt:now-10000}
 });
 assert.equal(m.conflicts.length,0);
 assert.equal(m.value.campaigns[0].upserts[0].sheetIII.workStatus,'pending');
 assert.equal(m.autoResolved[0].source,'snapshot-estimate');
});
test('missing or effectively tied timestamps still require a choice',()=>{
 const api=engine(),base=status('started'),local=status('done'),remote=status('pending');
 assert.equal(api.merge(base,local,remote).conflicts.length,1);
 assert.equal(api.merge(base,local,remote,{editTimes:{local:{[key]:now-5000},remote:{[key]:now-5100}}}).conflicts.length,1);
});
test('newer reordering keeps all section IDs from both devices',()=>{
 const base={campaigns:[{id:'D01',order:['A','B','C']}]};
 const local={campaigns:[{id:'D01',order:['B','A','C','NEW_LOCAL']}]};
 const remote={campaigns:[{id:'D01',order:['A','C','B','NEW_REMOTE']}]};
 const p='/campaigns[id=D01]/order';
 const result=engine().merge(base,local,remote,{
  editTimes:{local:{[p]:now-22000},remote:{[p]:now-6000}}
 });
 assert.equal(result.conflicts.length,0);
 assert.equal(JSON.stringify(result.value.campaigns[0].order),JSON.stringify(['A','C','B','NEW_REMOTE','NEW_LOCAL']));
});
test('concurrent deletions versus edits are not silently resolved',()=>{
 const base={mapPins:[{id:'stop-1',label:'before'}]};
 const local={mapPins:[]};
 const remote={mapPins:[{id:'stop-1',label:'after'}]};
 const result=engine().merge(base,local,remote,{
  editTimes:{local:{'/mapPins[id=stop-1]':now-30000},remote:{'/mapPins[id=stop-1]/label':now-10000}}
 });
 assert.equal(result.conflicts.length,1);
 assert.equal(result.conflicts[0].type,'delete-versus-edit');
});
test('saving records per-field timestamps, without restamping unchanged data',()=>{
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
test('automatic resolution takes a recovery copy before it can apply merged data',()=>{
 const i=appSource.indexOf('const mergeOptions='),j=appSource.indexOf('const hasLocal=localChange.length>0',i);
 assert.ok(i>0&&j>i);
 const flow=appSource.slice(i,j);
 assert.ok(flow.indexOf('await cloudSaveConflictVersions(')>0);
 assert.ok(flow.indexOf('await cloudSaveConflictVersions(')<flow.indexOf('merged={...local}'));
 assert.ok(appSource.includes('cloudDownloadConflictBackup'));
 assert.ok(appSource.includes('merged.syncEditTimes=editTimes'));
 assert.doesNotThrow(()=>new vm.Script(appSource));
});

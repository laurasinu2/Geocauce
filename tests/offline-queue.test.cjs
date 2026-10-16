const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(dir,'app.js'),'utf8');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(dir,'sw.js'),'utf8');
const delta=fs.readFileSync(path.join(dir,'cloud-delta-sync.js'),'utf8');
const isolate={};vm.runInNewContext(delta,isolate);const pure=isolate.GeoCauceDeltaSync;
function storage(){const map=new Map();return{getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
function queue(){
 const start=app.indexOf('const CLOUD_CHANGE_QUEUE_PREFIX='),end=app.indexOf('function lastKnownCloudSyncAt(){',start);
 assert.ok(start>0&&end>start);
 let scheduled=0,uuid=0;
 const env={localStorage:storage(),window:{GeoCauceDeltaSync:pure},state:{projectId:'p1'},Date,JSON,
   cloudUuid:()=>String(++uuid),scheduleCloudSync:()=>scheduled++,console,
   refreshAccountUi:()=>{},cloudLastError:''};
 const val=vm.runInNewContext('(function(){'+app.slice(start,end)+';return {cloudPendingChanges,cloudQueueChange,cloudQueueStateDiff,cloudQueueAssetChange,cloudClearAcknowledgedChanges};})()',env);
 return{...val,env,schedule:()=>scheduled};
}
test('pending offline operations survive localStorage reads and photo upload is one item',()=>{
 const q=queue();q.cloudQueueAssetChange('photos','mobile-image-1','put');
 assert.equal(q.cloudPendingChanges('p1').length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(q.cloudPendingChanges('p1').map(x=>[x.kind,x.path]))),[['photos','put:mobile-image-1']]);
 assert.equal(q.schedule(),1);
});
test('saving one observation queues only that field',()=>{
 const q=queue();
 const before={campaigns:[{id:'D01',upserts:[{id:'s1',sheetIII:{observations:'antes'}}]}]};
 const after={campaigns:[{id:'D01',upserts:[{id:'s1',sheetIII:{observations:'despues'}}]}]};
 q.cloudQueueStateDiff('p1',JSON.stringify(before),after);
 const entries=JSON.parse(JSON.stringify(q.cloudPendingChanges('p1')));
 assert.equal(entries.length,1);
 assert.match(entries[0].path,/sheetIII\/observations/);
 assert.equal(entries[0].kind,'data');
});
test('coalesced unsent changes never duplicate calls',()=>{
 const q=queue();
 const old={campaigns:[{id:'D01',upserts:[{id:'s1',sheetIII:{observations:'0'}}]}]};
 const v1={campaigns:[{id:'D01',upserts:[{id:'s1',sheetIII:{observations:'1'}}]}]};
 const v2={campaigns:[{id:'D01',upserts:[{id:'s1',sheetIII:{observations:'2'}}]}]};
 q.cloudQueueStateDiff('p1',JSON.stringify(old),v1);
 q.cloudQueueStateDiff('p1',JSON.stringify(v1),v2);
 assert.equal(q.cloudPendingChanges('p1').length,1);
});
test('acknowledgments never clear edits added after upload started',()=>{
 const q=queue();
 q.cloudQueueAssetChange('photos','one','put');const first=JSON.parse(JSON.stringify(q.cloudPendingChanges('p1')));
 q.cloudQueueAssetChange('photos','two','put');
 q.cloudClearAcknowledgedChanges('p1',first);
 assert.deepEqual(JSON.parse(JSON.stringify(q.cloudPendingChanges('p1').map(x=>x.path))),['put:two']);
});
test('autosync, manual bidirectional sync and local data backups remain wired',()=>{
 assert.match(app,/function scheduleCloudSync\(delay=7000\)\{[^}]*setTimeout/);
 assert.match(app,/window\.addEventListener\('online'/);
 assert.match(app,/document\.addEventListener\('visibilitychange'/);
 assert.match(app,/setInterval\(\(\)=>\{if\(!document\.hidden/);
 assert.match(app,/return cloudBidirectionalSync\(\{manual:true\}\)/);
 assert.match(app,/\$\('#settingsCloudSyncBtn'\)\.onclick=syncNow/);
 assert.match(app,/function exportProjectPackage\(/);
 assert.match(app,/dbPut\('cloudSyncBase',\{key:'preMergeRecovery'/);
 assert.doesNotMatch(app,/function scheduleCloudSync\(delay=7000\)[^\n]*Subidas solo manuales/);
});
test('unchanged revision check avoids transferring full JSON snapshots',()=>{
 const i=app.indexOf('async function cloudBidirectionalSync('),j=app.indexOf('async function syncNow(){',i),block=app.slice(i,j);
 assert.match(block,/&select=updated_at&limit=1/);
 assert.match(block,/verifiedUnchanged/);
 assert.match(block,/&select=updated_at,state&limit=1/);
 assert.match(block,/GeoCauceDeltaSync\.merge/);
 assert.match(block,/cloudDeltaReceivePhotos/);
 assert.match(block,/cloudClearAcknowledgedChanges/);
 assert.match(block,/result\.conflicts\.length/);
});
test('remote cloud-only asset pointers are preserved unless explicitly deleted',()=>{
 const i=app.indexOf('async function cloudUploadProjectAssets('),j=app.indexOf('function cloudStableJson(',i),block=app.slice(i,j);
 assert.match(block,/for\(const kind of \['photos','rasters','vectorLayers'\]\)/);
 assert.match(block,/q\.path==='delete:'\+remote\.id/);
 assert.match(block,/result\[kind\]\.push\(remote\)/);
});
test('PWA loads delta engine before app, caches it and keeps offline DB upgrade',()=>{
 assert.ok(html.indexOf('<script src="cloud-delta-sync.js?v=20261016-sync-r25"')<html.indexOf('<script src="app.js?v=20261016-sync-r25"'));
 assert.match(sw,/"cloud-delta-sync\.js"/);
 assert.match(sw,/mobile-pwa-r25/);
 assert.match(app,/indexedDB\.open\(name,5\)/);
 assert.match(app,/createObjectStore\('cloudSyncBase'/);
 assert.doesNotThrow(()=>new vm.Script(app));
});

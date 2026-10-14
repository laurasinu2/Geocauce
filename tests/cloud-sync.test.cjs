// Regression tests for cloud sync. Run with: npm test
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const a=app.indexOf('function cloudStableJson('),b=app.indexOf('// Supabase old: project(',a);
assert.ok(a>=0&&b>a,'Cloud helpers should be present');
const helpers=app.slice(a,b);
function storage(){
  const items=new Map();
  return {getItem:k=>items.get(k)||null,setItem:(k,v)=>items.set(k,v),removeItem:k=>items.delete(k)};
}
function load(fetchImpl=async()=>({metadata:{size:5}}),localStorage=storage()){
  const env={Blob,cloudFetch:fetchImpl,cloudAssetDigest:async()=>'abc',cloudObjectPath:(...parts)=>parts.join('/'),localStorage,console};
  return vm.runInNewContext('(function(){'+helpers+';return {cloudStableJson,cloudRemoteAssetIndex,cloudStorageObjectExists,cloudReuseBlob,cloudReuseFeatures,cloudCollectObsoleteAssets};})()',env);
}
test('app.js compiles as JavaScript',()=>assert.doesNotThrow(()=>new vm.Script(app)));
test('structured content comparison ignores JSONB key order',()=>{
  const {cloudStableJson}=load();
  assert.equal(cloudStableJson({b:2,a:{z:3,x:1}}),cloudStableJson({a:{x:1,z:3},b:2}));
});
test('cloud manifest identifies all five asset kinds by stable ID',()=>{
  const {cloudRemoteAssetIndex}=load(),index=cloudRemoteAssetIndex({
    photos:[{id:'p',cloudBlobPath:'photo'}],
    rasters:[{id:'r',cloudPreviewPath:'preview',cloudSourcePath:'source'}],
    vectorLayers:[{id:'v',cloudFeaturesPath:'features',cloudRenderPath:'render'}]
  });
  assert.equal(index.size,5);
  assert.equal(index.get('raster-source:r').path,'source');
});
test('Storage existence uses JSON object-info instead of opaque HEAD',async()=>{
  let requested;
  const {cloudStorageObjectExists}=load(async url=>{requested=url;return {metadata:{size:5}};});
  assert.equal(await cloudStorageObjectExists('user/project/photos/x',5,'user'),true);
  assert.match(requested,/\/object\/info\/geocauce-files\//);
  assert.equal(await cloudStorageObjectExists('user/project/photos/x',6,'user'),false);
  assert.equal(await cloudStorageObjectExists('other/project/photos/x',5,'user'),false);
});
test('missing object HTTP 400 is recoverable, permissions are not',async()=>{
  const fail=(status,message)=>load(async()=>{const e=new Error(message);e.status=status;throw e;}).cloudStorageObjectExists('user/project/photos/x',5,'user');
  assert.equal(await fail(400,'Object not found'),false);
  assert.equal(await fail(404,'Not found'),false);
  await assert.rejects(fail(400,'JWT expired'),/No se pudo verificar/);
  await assert.rejects(fail(403,'Forbidden'),/No se pudo verificar/);
});
test('local blobs are reused only when content fingerprint agrees',async()=>{
  const {cloudReuseBlob}=load(),blob=new Blob(['hello'],{type:'text/plain'});
  assert.ok(await cloudReuseBlob(blob,5,'sha256-chunks-v1:5:text/plain:abc'));
  assert.equal(await cloudReuseBlob(blob,5,'sha256-chunks-v1:5:text/plain:wrong'),null);
});
test('unchanged cloud assets do not hash, upload or make object requests',async()=>{
  const i=app.indexOf('  const put=async function('),j=app.indexOf("  if(manual)cloudProgressStart('Preparando archivos para subir'",i);
  assert.ok(i>0&&j>i,'Upload put closure must exist');
  const blob=new Blob(['hello'],{type:'text/plain'}),fp='sha256-chunks-v1:5:text/plain:abc';
  const cache={photo:{path:'user/pr/photos/p.bin',hash:fp,sig:'sig'}};
  let digestCalls=0,uploaded=0,checked=0;
  const env={manual:false,done:0,total:3,cache,remoteFiles:new Map([['photo',{path:cache.photo.path,hash:fp,size:5}]]),
    globalCache:{},cloudAssetDigest:async()=>{digestCalls++;return 'abc';},
    exists:async()=>{checked++;return true;},cloudUploadBlob:async()=>{uploaded++;},
    persist:()=>{},cloudProgressUpdate:()=>{},reused:0,uploaded:0};
  const put=new Function('env','with(env){'+app.slice(i,j)+';return put;}')(env);
  assert.equal(await put('photo','user/pr/photos/p',blob,'sig','photo','.bin'),cache.photo.path);
  assert.equal(digestCalls,0);assert.equal(uploaded,0);assert.equal(checked,0);
});
test('unused old blob is deleted after checking active snapshots',async()=>{
  const ops=[],store=storage();
  const {cloudCollectObsoleteAssets}=load(async(url,opts)=>{
    ops.push([url,opts]);
    if(url.includes('project_snapshots'))return [{assets:{photos:[]}}];
    return [];
  },store);
  await cloudCollectObsoleteAssets('user','pr',{photos:[{cloudBlobPath:'user/pr/photos/old'}]},{photos:[]});
  const deletes=ops.filter(([url])=>url==='/storage/v1/object/geocauce-files');
  assert.equal(deletes.length,1);
  assert.equal(deletes[0][1].body.prefixes[0],'user/pr/photos/old');
});
test('old cloud backups keep their shared blobs',async()=>{
  const ops=[];
  const {cloudCollectObsoleteAssets}=load(async(url,opts)=>{
    ops.push([url,opts]);
    if(url.includes('project_snapshots'))return [
      {assets:{photos:[]}},
      {assets:{photos:[{cloudBlobPath:'user/pr/photos/shared'}]}}
    ];
    return [];
  });
  await cloudCollectObsoleteAssets('user','pr',{photos:[{cloudBlobPath:'user/pr/photos/shared'}]},{photos:[]});
  assert.equal(ops.filter(([url])=>url==='/storage/v1/object/geocauce-files').length,0);
});

test('first upload skips remote file-existence probes entirely',async()=>{
  const start=app.indexOf('  const put=async function(');
  const end=app.indexOf("  if(manual)cloudProgressStart('Preparando archivos para subir'",start);
  assert.ok(start>=0&&end>start,'The upload function must exist');
  let infoChecks=0,uploads=0;
  const env={manual:false,done:0,total:3,cache:{},remoteFiles:new Map(),globalCache:{},
    cloudAssetDigest:async()=>'abc',exists:async()=>{infoChecks++;throw Error('unexpected probe')},
    cloudUploadBlob:async()=>{uploads++},persist:()=>{},cloudProgressUpdate:()=>{},reused:0,uploaded:0};
  const put=new Function('env','with(env){'+app.slice(start,end)+';return put;}')(env);
  const file=new Blob(['hello'],{type:'text/plain'});
  const path=await put('photo:1','user/project/photos/1',file,'file-v1','photo','.bin');
  assert.equal(path,'user/project/photos/1.abc.bin');
  assert.equal(infoChecks,0);
  assert.equal(uploads,1);
  assert.equal(env.cache['photo:1'].path,path);
});

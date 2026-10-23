const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');

test('hillshade renderer supports QGIS defaults and inversions without changing elevations',()=>{
 const i=app.indexOf('function rasterHillshade('),j=app.indexOf('function drawStyledRasterDetail(',i);
 assert.ok(i>0&&j>i);
 const scope={Uint8ClampedArray,Math,Number,adjustRasterRgb:c=>c};
 vm.runInNewContext(app.slice(i,j)+';this.hillshade=rasterHillshade',scope);
 const w=7,h=7;
 const flat=new Float32Array(w*h).fill(300);
 const config={renderer:'hillshade',hillshadeAzimuth:315,hillshadeAltitude:45,hillshadeZFactor:1,hillshadeInvert:false};
 const result=scope.hillshade(flat,w,h,config,-9999,.5,.5);
 assert.equal(result.length,w*h*4);
 assert.equal(result[3],255);
 assert.ok(Math.abs(result[0]-180)<3);
 const sloped=new Float32Array(w*h).map((_,index)=>300+index%w*0.5);
 const front=scope.hillshade(sloped,w,h,config,-9999,.5,.5);
 const reverse=scope.hillshade(sloped,w,h,{...config,hillshadeInvert:true},-9999,.5,.5);
 assert.notEqual(front[4*(3*w+3)],reverse[4*(3*w+3)]);
 assert.deepEqual(Array.from(sloped.slice(0,3)),[300,300.5,301]);
 const noData=new Float32Array(flat);noData[0]=-9999;
 assert.equal(scope.hillshade(noData,w,h,config,-9999,.5,.5)[3],0);
 assert.match(html,/id="rasterStyleHillshadePanel"/);
 assert.match(html,/value="hillshade"/);
 assert.match(html,/id="rasterStyleHillshadeInvert"/);
 assert.match(app,/rasterHillshade\(/);
});

test('a >50 MiB MDT uploads as deterministic immutable parts, not one oversized object',async()=>{
 const i=app.indexOf('  const put=async function('),j=app.indexOf("  if(manual)cloudProgressStart('Preparando archivos para subir'",i);
 assert.ok(i>0&&j>i);
 const partSize=8*1024*1024,bytes=51*1024*1024;
 const blob=new Blob([new Uint8Array(bytes)],{type:'image/tiff'});
 const env={manual:false,done:0,total:2,cache:{},globalCache:{},remoteFiles:new Map(),uid:'u',
   cloudAssetDigest:async()=>'hash001',cloudUploadBlob:async(path,data)=>{uploads.push({path,bytes:data.size});},
   cloudStorageObjectExists:async()=>{throw Error('Unexpected probe on first upload')},
   cloudProgressUpdate:()=>{},persist:()=>{},reused:0,uploaded:0};
 const uploads=[];
 const put=new Function('env','with(env){'+app.slice(i,j)+';return put;}')(env);
 const first=await put('raster-source:r','u/p/rasters/r',blob,'signature','MDT.tif','.source');
 assert.equal(uploads.length,7);
 assert.equal(uploads[0].bytes,partSize);
 assert.equal(uploads.at(-1).bytes,3*1024*1024);
 assert.equal(first,uploads[0].path);
 assert.equal(env.cache['raster-source:r'].parts.length,7);
 assert.ok(env.cache['raster-source:r'].parts.every((p,i)=>p.endsWith('.part'+String(i).padStart(4,'0'))));
});

test('cloud download reassembles parts byte-perfectly in order',async()=>{
 const i=app.indexOf('const CLOUD_ASSET_PART_SIZE='),j=app.indexOf('async function cloudAssetDigest(',i);
 assert.ok(i>0&&j>i);
 const content={a:new Blob(['hello']),b:new Blob(['-world'])};
 const env={Blob,cloudAssetParts:(path,parts)=>parts?.length?parts:[path].filter(Boolean),
  cloudBinaryFetch:async url=>({blob:async()=>content[url.split('/').at(-1)]})};
 vm.runInNewContext(app.slice(i,j)+';this.download=cloudDownloadBlob',env);
 const reconstructed=await env.download('a',['a','b'],'text/plain');
 assert.equal(await reconstructed.text(),'hello-world');
 assert.equal(reconstructed.size,11);
 assert.equal(reconstructed.type,'text/plain');
});

test('interrupted MDT upload resumes verified completed chunks without losing local files',async()=>{
 const i=app.indexOf('  const put=async function('),j=app.indexOf("  if(manual)cloudProgressStart('Preparando archivos para subir'",i);
 const size=17*1024*1024,blob=new Blob([new Uint8Array(size)],{type:'image/tiff'});
 const saved=new Map(),attempts=[],infoChecks=[];
 const env={manual:false,done:0,total:1,cache:{},globalCache:{},remoteFiles:new Map(),uid:'u',
  cloudAssetDigest:async()=>'samehash',
  cloudStorageObjectExists:async(path,bytes)=>{infoChecks.push(path);return saved.get(path)===bytes;},
  cloudUploadBlob:async(path,part)=>{
   attempts.push(path);
   if(attempts.length===2)throw Error('network disconnected');
   saved.set(path,part.size);
  },
  cloudProgressUpdate:()=>{},persist:()=>{},reused:0,uploaded:0};
 const put=new Function('env','with(env){'+app.slice(i,j)+';return put;}')(env);
 await assert.rejects(put('raster-source:r','u/p/rasters/r',blob,'sig','MDT.tif','.source'),/network disconnected/);
 assert.equal(env.cache['raster-source:r'].pending.uploaded.length,1);
 const resumed=await put('raster-source:r','u/p/rasters/r',blob,'sig','MDT.tif','.source');
 assert.equal(infoChecks.length,1);
 assert.equal(saved.size,3);
 assert.equal(attempts.length,4);
 assert.equal(env.cache['raster-source:r'].parts.length,3);
 assert.equal(resumed,env.cache['raster-source:r'].parts[0]);
 assert.equal(env.uploaded,1);
});

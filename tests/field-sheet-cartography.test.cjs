const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8'),index=fs.readFileSync(path.join(root,'index.html'),'utf8'),sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
test('export-only code parses and PWA rev includes new maps',()=>{
 assert.doesNotThrow(()=>new vm.Script(app));
 assert.match(index,/app\.js\?v=20261016-sheetmaps-r26/);
 assert.match(sw,/mobile-pwa-r26/);
});
test('FITXA I keeps its original editable field form and restores first-page course map plus final profile',()=>{
 const first=app.indexOf('async function localPdfProfileCourse('),last=app.indexOf('async function localPdfReachSheet(',first);
 assert.ok(first>0&&last>first);
 const body=app.slice(first,last);
 assert.match(body,/renderProjectMapImage\(expandedBounds\(featureBounds\(course\)/);
 assert.match(body,/showReaches:true/);
 assert.match(body,/localPdfIllustratedPage\(stage,'FITXA I/);
 assert.match(body,/localPdfClone\(source,stage,1580\)/);
 assert.match(body,/const perSheet=6/);
 assert.match(body,/const profilePage=await localPdfProfileGraph\(course,stage\)/);
 assert.match(body,/return \[mapPage,\.\.\.sheets,profilePage\]/);
 assert.match(body,/localPdfInkCanvas\(cv,strokes\)/);
 assert.doesNotMatch(body,/innerHTML\s*=\s*'<!doctype/);
});
test('FITXA I table uses fixed, full-width columns and preserves ink',()=>{
 const block=app.slice(app.indexOf('async function localPdfProfileCourse('),app.indexOf('async function localPdfReachSheet('));
 assert.match(block,/tableLayout:'fixed'/);
 assert.match(block,/minWidth:'0'/);
 assert.match(block,/const widths=\['6%','9%','9%'/);
 assert.match(block,/querySelectorAll\('canvas\[data-pdf-ink\]'\)/);
 assert.match(block,/tr\.style\.height='108px'/);
 assert.match(block,/rows|reaches\.slice\(start,start\+perSheet\)/);
});
test('the final map of a FITXA II highlights only its own reach',()=>{
 const block=app.slice(app.indexOf('async function localPdfReachSheet('),app.indexOf('function localPdfSectionTable('));
 assert.match(block,/localPdfFocusMap\('reach',reach\)/);
 assert.match(block,/FITXA II · LOCALITZACIÓ DEL TRAM/);
 assert.match(block,/return \[\.\.\.pages,appendix\]/);
});
test('the final map of a FITXA III highlights its section on the context reach',()=>{
 const block=app.slice(app.indexOf('async function localPdfSectionSheet('),app.indexOf('async function localExportArchiveFile('));
 assert.match(block,/localPdfFocusMap\('section',section\)/);
 assert.match(block,/FITXA III · LOCALITZACIÓ DE LA SECCIÓ/);
 assert.match(block,/return \[\.\.\.pages,appendix\]/);
});
test('map overlays use exactly the same raster centring transform, even with non-square viewports',()=>{
 const begin=app.indexOf('function localPdfMapTransform('),end=app.indexOf('function localPdfFocusMap(',begin);
 const section=app.slice(begin,end);
 assert.ok(begin>0&&end>begin);
 const {localPdfMapTransform}=vm.runInNewContext(section+';({localPdfMapTransform})');
 const b={minX:100,maxX:200,minY:300,maxY:320},w=1200,h=1440,pad=52;
 const bw=b.maxX-b.minX,bh=b.maxY-b.minY,sc=Math.min((w-2*pad)/bw,(h-2*pad)/bh);
 const offX=pad+((w-2*pad)-bw*sc)/2,offY=pad+((h-2*pad)-bh*sc)/2;
 const p=localPdfMapTransform(b,w,h);
 assert.equal(p.tx(100),offX);
 assert.equal(p.ty(320),offY);
 assert.equal(p.tx(200),offX+bw*sc);
 assert.equal(p.ty(300),offY+bh*sc);
});
test('cartographic overlay targets selected feature and preserves other elements as context',()=>{
 const begin=app.indexOf('function localPdfFocusMap('),end=app.indexOf('function localPdfIllustratedPage(',begin);
 assert.ok(begin>0&&end>begin);const snippet=app.slice(begin,end);
 const p=(x,y)=>({x,y}),course={id:'c',type:'watercourse',name:'Torrent',abbr:'TSJ',points:[p(0,0),p(100,100)]};
 const reach={id:'r',type:'reach',courseId:'c',reachCode:'TSJ-1',points:[p(20,20),p(40,40)]};
 const section={id:'s',type:'section',reachId:'r',sectionName:'S1',points:[p(25,25),p(35,28)]};
 const marks=[],g={lineCap:'',lineJoin:'',strokeStyle:'',lineWidth:1,
  save(){},restore(){},setLineDash(){},beginPath(){},moveTo(x,y){marks.push(['M',x,y]);},lineTo(x,y){marks.push(['L',x,y]);},
  arc(){},fill(){},stroke(){marks.push(['stroke',this.strokeStyle]);},fillText(){},strokeText(){}};
 let renderedOpts;
 const env={sectionCourse:()=>course,reachCourse:()=>course,sectionReach:()=>reach,featureBounds:f=>({minX:Math.min(...f.points.map(p=>p.x)),maxX:Math.max(...f.points.map(p=>p.x)),minY:Math.min(...f.points.map(p=>p.y)),maxY:Math.max(...f.points.map(p=>p.y))}),
  combineBounds:list=>({minX:Math.min(...list.map(b=>b.minX)),maxX:Math.max(...list.map(b=>b.maxX)),minY:Math.min(...list.map(b=>b.minY)),maxY:Math.max(...list.map(b=>b.maxY))}),
  expandedBounds:b=>b,renderProjectMapImage:(b,o)=>{renderedOpts=o;return{getContext:()=>g};},
  localPdfMapTransform:(b,w,h)=>({tx:x=>x,ty:y=>y}),featurePolylines:f=>[f.points]};
 vm.runInNewContext(snippet+';localPdfFocusMap("section",testSection)',{...env,testSection:section});
 assert.equal(renderedOpts.muteCourses,true);
 assert.equal(renderedOpts.showTitle,false);
 assert.ok(marks.some(x=>x[0]==='stroke'&&x[1]==='#558c9d'));
 assert.ok(marks.some(x=>x[0]==='stroke'&&x[1]==='#dc6420'));
 assert.ok(marks.some(x=>x[0]==='M'&&x[1]===25&&x[2]===25));
});
test('map export makes no changes to cloud-sync database or upload logic',()=>{
 const begin=app.indexOf('function localPdfMapTransform('),end=app.indexOf('async function localPdfReachSheet(',begin);
 const block=app.slice(begin,end);
 assert.doesNotMatch(block,/cloudUpload|cloudSyncBase|dbPut\(|dbClear\(|fetch\(/);
 assert.match(app,/async function exportSelectedContentsZip\(\)/);
});

test('separate PDF downloads and hierarchical ZIP reuse the same map-inclusive renderer',()=>{
 const a=app.indexOf('async function exportSelectedContents(){'),b=app.indexOf('function initUi(){',a);
 const block=app.slice(a,b);
 assert.match(block,/const pdf=await localExportArchiveFile\(id\)/);
 assert.match(block,/selected\[n\]\?\.dataset\.zipPath/);
 assert.match(block,/await downloadBlob\(pdf,filename\)/);
 assert.match(block,/if\(!ANDROID_NATIVE\)/);
 assert.match(block,/nativeExportProfileSheetPdf\(payload\)/);
 assert.match(block,/nativeExportReachSheetPdf\(payload\)/);
 assert.match(block,/nativeExportSectionSheetPdf\(payload\)/);
 assert.match(app,/async function exportSelectedContentsZip\(/);
});

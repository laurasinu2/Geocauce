const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const code=fs.readFileSync(path.join(root,'app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
function extract(start,end){const a=code.indexOf(start),b=code.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'Missing '+start);return code.slice(a,b);}
const context={
  view:{verticalScale:'real',gridStep:1},data:{lo:1134,hi:1162,mid:1148,span:28},
  screen:{width:1120,height:440},
  sectionView:f=>context.view,
  sectionRawRange:f=>context.data,
  sectionGridStep:f=>context.view.gridStep,
  sectionVisibleWindow:f=>({start:0,end:39.9,span:39.9,len:39.9}),
  console
};
vm.createContext(context);
vm.runInContext(extract('function sectionPlotRect(', 'function sectionRawRange('),context);
vm.runInContext(extract('function sectionDisplayRange(', 'function updateSectionCanvasMetricSize('),context);
vm.runInContext(extract('function remapSectionNormPointForRange(', 'function remapSectionDrawingForRange('),context);
const canvas={getBoundingClientRect:()=>({width:context.screen.width,height:context.screen.height,left:0,top:0})};
test('source parses and existing cloud operations are still present',()=>{
 assert.doesNotThrow(()=>new vm.Script(code));
 assert.match(code,/function cloudRemoteAssetIndex/);
 assert.match(code,/function cloudCollectObsoleteAssets/);
 assert.doesNotMatch(code,/method:'HEAD'/);
});
test('true 1:1 scale fits both full elevation range and metric span inside canvas',()=>{
 context.view.verticalScale='real';
 for(const [width,height,lo,hi] of [[1120,440,1134,1162],[410,330,100,145],[1440,700,50,55]]){
  context.screen={width,height};
  context.data={lo,hi,span:hi-lo,mid:(lo+hi)/2};
  const pr=context.sectionPlotRect(canvas,{}),rg=context.sectionDisplayRange({},canvas);
  assert.ok(pr.left>=65&&pr.right<=width-27,'X plot stays visible');
  assert.ok(rg.lo<lo&&rg.hi>hi,'Entire elevation range fits with padding');
  assert.ok(Math.abs(pr.width/39.9-pr.height/rg.span)<1e-8,'Metres per pixel are equal in both axes');
  assert.ok(pr.width>0&&pr.width<=width-94);
 }
});
test('conventional vertical scale still spans the original graph width',()=>{
 context.screen={width:1120,height:440};
 context.data={lo:1134,hi:1162,mid:1148,span:28};
 for(const mode of ['1','2','5']){
  context.view.verticalScale=mode;
  const pr=context.sectionPlotRect(canvas,{}),rg=context.sectionDisplayRange({},canvas);
  assert.equal(pr.left,66);
  assert.equal(pr.width,1026);
  assert.ok(rg.hi>=1162&&rg.lo<=1134);
 }
});
test('switching to true scale reprojects ink in X and Y without deleting it',()=>{
 context.view.verticalScale='1';
 const f={},oldPr=context.sectionPlotRect(canvas,f),oldRg=context.sectionDisplayRange(f,canvas);
 context.view.verticalScale='real';
 const newPr=context.sectionPlotRect(canvas,f),newRg=context.sectionDisplayRange(f,canvas);
 const sx=oldPr.left+oldPr.width*.35, z=1142;
 const sy=oldPr.bottom-(z-oldRg.lo)/oldRg.span*oldPr.height;
 const result=context.remapSectionNormPointForRange({x:sx/1120,y:sy/440},canvas,oldRg,newRg,oldPr,newPr);
 const px=result.x*1120,py=result.y*440;
 assert.ok(Math.abs((px-newPr.left)/newPr.width-.35)<1e-8);
 assert.ok(Math.abs((newPr.bottom-py)/newPr.height*newRg.span+newRg.lo-z)<1e-8);
 const unrelated=context.remapSectionNormPointForRange({x:0,y:0},canvas,oldRg,newRg,oldPr,newPr);
 assert.deepEqual(JSON.parse(JSON.stringify(unrelated)),{x:0,y:0});
 assert.match(code,/\(f\.sectionInk\|\|\[\]\)\.forEach\(mapRec\)/);
});
test('FITXA III selector comment is absent but stored old sectionType is retained',()=>{
 assert.doesNotMatch(html,/id="sectionTypeInput"/);
 assert.doesNotMatch(html,/Tipus secció ↑/);
 assert.match(code,/sectionType:''/);
 assert.match(code,/defaultSectionSheetIII\(\),\.\.\.\(src\|\|\{\}\)/);
});
test('FITXA III has five compact table columns, one row label, and internal scroll',()=>{
 assert.match(code,/const SECTION_TABLE_COLS=\[\[/);
 const pairs=code.match(/const SECTION_TABLE_COLS=\[([\s\S]*?)\];/);
 assert.ok(pairs&&((pairs[1].match(/\['(?:leftSlope|leftBank|channel|rightBank|rightSlope)'/g)||[]).length===5));
 assert.match(code,/for\(const \[col\] of SECTION_TABLE_COLS\)/);
 assert.match(code,/class="field-table-quick-select"/);
 assert.match(code,/class="section-table-ink-canvas/);
 const segment=css.slice(css.lastIndexOf('/* R19'));
 assert.match(segment,/\.section-table-zoom-wrap\{[^}]*width:100%;max-width:100%;[^}]*overflow-x:auto/);
 assert.match(segment,/\.section-field-table table\{[^}]*min-width:1120px;table-layout:fixed/);
 assert.match(segment,/\.section-field-table thead th:first-child/);
 assert.match(segment,/\.section-field-table td\{[^}]*overflow:hidden/);
});
test('revision bump loads corrected CSS and JS without erasing local data',()=>{
 assert.match(html,/app\.js\?v=20261015-download-r23/);
 assert.match(html,/styles\.css\?v=20261015-download-r23/);
 assert.match(sw,/mobile-pwa-r23/);
 assert.doesNotMatch(code,/localStorage\.clear\(\)/);
});

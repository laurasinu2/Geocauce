const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const app=read('app.js'),html=read('index.html'),sw=read('sw.js');
const start=app.indexOf('const FIELD_CHANGE_REASONS='),end=app.indexOf('const SECTION_TABLE_ROWS=',start);
assert.ok(start>0&&end>start,'Field dictionary exists');
const ctx={escapeHtml:s=>String(s),Math,Number,Set};
vm.createContext(ctx);
vm.runInContext(app.slice(start,end),ctx);
Object.assign(ctx,vm.runInContext('({FIELD_CHANGE_REASONS,FIELD_CERTAINTY})',ctx));
test('app remains valid JavaScript',()=>assert.doesNotThrow(()=>new vm.Script(app)));
test('cardinal orientation respects direction of drawn section',()=>{
  assert.equal(ctx.sectionOrientationLabel({points:[{x:0,y:0},{x:20,y:0}]}),'O–E');
  assert.equal(ctx.sectionOrientationLabel({points:[{x:0,y:0},{x:0,y:20}]}),'S–N');
  assert.equal(ctx.sectionOrientationLabel({points:[{x:20,y:0},{x:0,y:0}]}),'E–O');
  assert.equal(ctx.sectionOrientationLabel({points:[]}), '—');
});
test('real metric scale is equal horizontally and vertically',()=>{
  const first=app.indexOf('function sectionDisplayRange(f,c){'),last=app.indexOf('function updateSectionCanvasMetricSize(',first);
  assert.ok(first>0&&last>first);
  const sv={gridStep:1,verticalScale:'real'};
  Object.assign(ctx,{
    sectionRawRange:()=>({lo:50,hi:70,mid:60,span:20}),
    sectionView:()=>sv,sectionGridStep:()=>1,
    sectionPlotRect:()=>({width:600,height:400}),
    sectionVisibleWindow:()=>({span:30})
  });
  vm.runInContext(app.slice(first,last),ctx);
  const rg=ctx.sectionDisplayRange({},{});
  assert.ok(Math.abs(600/30-400/rg.span)<1e-10);
  assert.ok(Math.abs(rg.span-20)<1e-10);
  sv.verticalScale='5';const other=ctx.sectionDisplayRange({},{});
  assert.notEqual(other.span,rg.span);
});
test('Fitxa I change reason codes match supplied dictionary',()=>{
  assert.deepEqual(Array.from(ctx.FIELD_CHANGE_REASONS,x=>x[0]),['P','L','C','M','V','A','O','X']);
  assert.equal(ctx.codedFieldLabel(ctx.FIELD_CHANGE_REASONS,'P'),'Pendent');
  assert.equal(ctx.codedFieldLabel(ctx.FIELD_CHANGE_REASONS,'M'),'Morfologia/material');
  assert.ok(app.includes('r.changeReasonCode=e.target.value'));
  assert.match(app,/changeReasonText:codedFieldLabel/);
});
test('Fitxa II quick dropdowns offer profile, cover, vegetation and substrate choices',()=>{
  for(const id of ['reachSheetProfileType','reachSheetVegetationCover','reachSheetVegetationType','reachSheetLithology']){
    assert.match(html,new RegExp('id="'+id+'" class="field-quick-select"'));
  }
  assert.match(html,/Esglaó/);assert.match(html,/Sediment consolidat/);
  assert.match(app,/setFieldQuickChoice\('reachSheetProfileType'/);
});
test('Fitxa III context-sensitive code choices reflect terrain unit',()=>{
  assert.ok(Array.from(ctx.fieldSectionChoices('erosionEvidence','channel')).includes('Canal · incidit'));
  assert.ok(Array.from(ctx.fieldSectionChoices('erosionEvidence','leftBank')).includes('Banc · esllavissament'));
  assert.ok(Array.from(ctx.fieldSectionChoices('erosionEvidence','leftSlope')).includes('Pendent · erosió difusa'));
  assert.ok(Array.from(ctx.fieldSectionChoices('accumulationEvidence','rightSlope')).includes('Pendent · lòbul'));
  assert.ok(Array.from(ctx.fieldSectionChoices('accumulationEvidence','channel')).includes('Canal · presa natural'));
});
test('certainty values match v5 and retain descriptive meaning',()=>{
  const values=Array.from(ctx.FIELD_CERTAINTY,([c,v])=>[c,v]);
  assert.deepEqual(values.map(x=>x[0]),['A','B','C','D','X']);
  assert.ok(values[0][1].toLowerCase().includes('observació directa'));
  assert.ok(values[2][1].includes('Interpretació'));
});
test('Fitxa III still retains stylus drawing canvas plus quick selection',()=>{
  assert.match(app,/class="field-table-quick-select"/);
  assert.match(app,/class="section-table-ink-canvas/);
  assert.match(app,/installSectionTableInkCanvas\(c,f/);
  assert.match(app,/tableInk/);
  assert.match(app,/\.table\[r\]\[c\]=e\.target\.value/);
  assert.match(app,/renderFitxaIIIPage2/);
});
test('PDF export uses only chosen FIC category, not all available choices',()=>{
  const p2=app.slice(app.indexOf('function renderFitxaIIIPage2('),app.indexOf('async function buildSectionSheetExportPayload('));
  assert.match(p2,/row\.options\.find\(o=>o\.score===optionalScore\(rec\.score\)\)/);
  assert.doesNotMatch(p2,/for\(const o of row\.options\)/);
  const reachExport=app.slice(app.indexOf('function renderFitxaIIPage3('),app.indexOf('async function buildReachSheetExportPayload('));
  assert.doesNotMatch(reachExport,/for\(const o of row\.options\)/);
});
test('orientation and scale are included in exported section drawing',()=>{
  assert.ok(app.includes("'Orientació:',sectionOrientationLabel(f)"));
  assert.match(app,/Escala real 1:1 \(X = Y\)/);
  assert.match(html,/id="sectionVerticalScale"/);
  assert.match(html,/value="real">Real 1:1/);
});
test('handwriting and synchronization pathways remain available',()=>{
  assert.ok(app.includes('n.changeCodeInk=n.changeCodeInk'));
  assert.match(app,/renderInkToDataUrl/);
  assert.match(app,/function cloudRemoteAssetIndex/);
  assert.doesNotMatch(app,/method:'HEAD'/);
  assert.match(app,/function cloudCollectObsoleteAssets/);
});
test('new PWA revision references all edited files',()=>{
  assert.match(html,/app\.js\?v=20261015-download-r22/);
  assert.match(sw,/mobile-pwa-r22/);
});


test('cardinal ends follow the original drawing order, never the river or a sorted axis',()=>{
 const examples=[
   [{x:0,y:0},{x:100,y:0},'O','E'],
   [{x:100,y:0},{x:0,y:0},'E','O'],
   [{x:0,y:0},{x:0,y:100},'S','N'],
   [{x:0,y:100},{x:0,y:0},'N','S'],
   [{x:0,y:0},{x:100,y:100},'SO','NE'],
   [{x:100,y:100},{x:0,y:0},'NE','SO'],
   [{x:0,y:100},{x:100,y:0},'NO','SE'],
   [{x:100,y:0},{x:0,y:100},'SE','NO']
 ];
 for(const [a,b,from,to] of examples){
   const section={points:[a,b],reachId:'unrelated-river'},old=JSON.stringify(section.points);
   const ends=ctx.sectionOrientationEnds(section);
   assert.equal(ends.start,from);assert.equal(ends.end,to);
   assert.equal(ctx.sectionOrientationLabel(section),from+'–'+to);
   assert.equal(JSON.stringify(section.points),old,'must not reorder section or profile');
 }
 assert.equal(ctx.sectionOrientationEnds({points:[{x:0,y:0},{x:0,y:0}]}),null);
});
test('Fitxa III clearly identifies the cardinal beginning and end on screen and export',()=>{
 assert.match(html,/id="sectionOrientationEndPoints"/);
 assert.match(app,/Inici: \$\{ends.start\} → Final: \$\{ends.end\}/);
 assert.match(app,/function drawSectionOrientationEnds\(ctx,f,pr\)/);
 assert.match(app,/drawSectionOrientationEnds\(ctx,f,pr\)/);
 const exportMeta=app.slice(app.indexOf('function exportFitxaIIIMeta('),app.indexOf('async function renderFitxaIIIPage1('));
 assert.match(exportMeta,/sectionOrientationLabel\(f\)/);
 assert.match(app,/const a=f.points\[0\],b=f.points\[f.points.length-1\]/);
});

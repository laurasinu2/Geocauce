'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function segment(a,b){const x=app.indexOf(a),y=app.indexOf(b,x+a.length);assert.ok(x>=0&&y>x,'Missing code: '+a);return app.slice(x,y);}
test('R28/FIC combined app keeps valid JavaScript syntax',()=>assert.doesNotThrow(()=>new Function(app)));
test('R28 sharing, permissions and existing section status remain present',()=>{
 for(const token of ['async function cloudProjectRole(','async function openProjectShare(','function sectionWorkStatusInfo(','workStatus:null'])assert.ok(app.includes(token),token);
});
test('old free-text substrate/weight values move into notes, without duplicate migration',()=>{
 const script=segment('const SECTION_NUMERIC_RANGES=','const SECTION_ZONE_TYPES=')+
 segment('function defaultSectionSheetIII(','// Status is manual');
 const sandbox={blankFicData:()=>({}),optionalScore:v=>v==null?null:Number(v)};
 vm.createContext(sandbox);
 vm.runInContext(script+';this.normalize=normalizeSectionSheetIII;',sandbox);
 const original={workStatus:'started',table:{substrateExposure:{channel:'Aproximadament 35 %, roca visible'},maxBlockWeight:{leftBank:'blocs variables'}},tableNotes:{substrateExposure:{channel:'Observació prèvia'}},tableInk:{channel:{sample:[{x:1,y:2}]}}};
 const a=sandbox.normalize(original),b=sandbox.normalize(a);
 assert.equal(a.workStatus,'started');
 assert.equal(a.table.substrateExposure.channel,'');
 assert.ok(a.tableNotes.substrateExposure.channel.includes('Observació prèvia'));
 assert.ok(a.tableNotes.substrateExposure.channel.includes('Aproximadament 35 %, roca visible'));
 assert.equal(a.tableNotes.substrateExposure.channel,b.tableNotes.substrateExposure.channel);
 assert.equal(a.tableNotes.maxBlockWeight.leftBank,'blocs variables');
 assert.equal(a.tableInk.channel.sample.length,1);
});
test('incision grade selection is available in the UI and code',()=>{
 assert.ok(html.includes('id="reachSheetIncisionGrade"'));
 assert.ok(app.includes("d.incisionGrade=$('#reachSheetIncisionGrade')?.value||''"));
 assert.ok(app.includes("localPdfField(doc,'reachSheetIncisionGrade'"));
});
test('field reports provide active stops, spatial intersections, local pdf, and edit preview',()=>{
 for(const token of ['function fieldActiveStop(','function fieldSectionIntersection(','async function fieldReportBuild(','function fieldReportInit(','window.GeoCauceFieldPdf.fromElements(pages)','contenteditable="true"'])assert.ok(app.includes(token),token);
});

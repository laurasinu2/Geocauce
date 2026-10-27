'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function piece(start,end){
 const i=source.indexOf(start),j=source.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,'Cannot find '+start);
 return source.slice(i,j);
}
test('whole-column and individual No hi ha work together without erasing recorded values',()=>{
 const code=piece('function fieldSectionChoices(','function codedFieldLabel(')
  +piece('function fieldChoiceHTML(','function sectionOrientationEnds(')
  +piece('function sectionTableCell(','function sectionTableInkCell(')
  +piece('function renderSectionFieldTable(','function ficCanvasNormGeneric(')
  +piece('function sectionColumnStatus(','function ficSnapshot(');
 const data={table:{matrixSupport:{channel:'Escassa',leftBank:'Abundant'},sedimentThickness:{channel:'2 m'}},tableNotes:{matrixSupport:{channel:'nota existent'}},tableInk:{},columnPresence:{},cellAbsence:{}};
 const root={innerHTML:'',controls:{},querySelectorAll(selector){
  const regex=selector==='[data-section-presence]'?/data-section-presence="([^"]+)"/g
    :selector==='[data-section-table-choice-row]'?/data-section-table-choice-row="([^"]+)" data-section-table-choice-col="([^"]+)"/g
    :selector==='[data-section-table-absence-row]'?/data-section-table-absence-row="([^"]+)" data-section-table-absence-col="([^"]+)"/g:null;
  const found=[];let m;
  if(regex)while((m=regex.exec(this.innerHTML)))found.push({
   dataset:selector==='[data-section-presence]'?{sectionPresence:m[1]}
     :selector==='[data-section-table-choice-row]'?{sectionTableChoiceRow:m[1],sectionTableChoiceCol:m[2]}
     :{sectionTableAbsenceRow:m[1],sectionTableAbsenceCol:m[2]},
   addEventListener(){},value:null
  });
  this.controls[selector]=found;return found;
 }};
 let saves=0;
 const setup=new Function('data','root','save',
  "const SECTION_TABLE_ROWS=[{key:'matrixSupport',label:'Matriu'},{key:'sedimentThickness',label:'Gruix'}];"+
  "const SECTION_TABLE_COLS=[['channel','Canal'],['leftBank','Banc esquerra']];"+
  "const FIELD_SECTION_CHOICES={matrixSupport:['Absent','Escassa (clast supported)','Moderada','Abundant (matrix supported)']};"+
  "const SECTION_NUMERIC_RANGES={};"+
  "const $=()=>root,ensureSectionSheetData=()=>data,isEditableCampaign=()=>true,persistState=save;"+
  "const renderSectionTableQuickColors=()=>{},setSectionTableZoom=()=>{},requestAnimationFrame=()=>{};"+
  "const state={sectionTableZoom:1},escapeHtml=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\"','&quot;');"+
  code+";return {renderSectionFieldTable,sectionCellAbsent,sectionColumnAbsent};");
 const api=setup(data,root,()=>saves++),section={id:'SEC01'};
 const find=(type,predicate)=>{
  const result=root.controls[type]?.find(predicate);
  assert.ok(result,'Control missing: '+type);
  return result;
 };
 api.renderSectionFieldTable(section);
 let cell=find('[data-section-table-choice-row]',x=>x.dataset.sectionTableChoiceRow==='matrixSupport'&&x.dataset.sectionTableChoiceCol==='channel');
 cell.value='__section_cell_absent__';cell.onchange();
 assert.equal(api.sectionCellAbsent(data,'matrixSupport','channel'),true);
 assert.equal(data.table.matrixSupport.channel,'Escassa');
 let column=find('[data-section-presence]',x=>x.dataset.sectionPresence==='channel');
 column.value='absent';column.onchange();
 assert.equal(api.sectionColumnAbsent(data,'channel'),true);
 assert.equal(api.sectionCellAbsent(data,'matrixSupport','channel'),true);
 assert.equal(data.table.sedimentThickness.channel,'2 m');
 column=find('[data-section-presence]',x=>x.dataset.sectionPresence==='channel');
 column.value='present';column.onchange();
 assert.equal(api.sectionColumnAbsent(data,'channel'),false);
 assert.equal(api.sectionCellAbsent(data,'matrixSupport','channel'),true);
 cell=find('[data-section-table-choice-row]',x=>x.dataset.sectionTableChoiceRow==='matrixSupport'&&x.dataset.sectionTableChoiceCol==='channel');
 cell.value='__section_cell_restore__';cell.onchange();
 assert.equal(api.sectionCellAbsent(data,'matrixSupport','channel'),false);
 assert.equal(data.table.matrixSupport.channel,'Escassa');
 let textCell=find('[data-section-table-absence-row]',x=>x.dataset.sectionTableAbsenceRow==='sedimentThickness'&&x.dataset.sectionTableAbsenceCol==='channel');
 textCell.value='absent';textCell.onchange();
 assert.equal(api.sectionCellAbsent(data,'sedimentThickness','channel'),true);
 assert.equal(data.table.sedimentThickness.channel,'2 m');
 assert.equal(data.tableNotes.matrixSupport.channel,'nota existent');
 assert.ok(saves>=5);
});

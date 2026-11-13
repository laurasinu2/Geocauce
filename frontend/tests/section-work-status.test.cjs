const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');

const begin=app.indexOf('function blankFicData()'),end=app.indexOf('function sectionReach(',begin);
assert.ok(begin>=0&&end>begin,'section helper block must exist');
const sectionHelpers=app.slice(begin,end);
function createContext(features=[],editable=true){
 let persisted=0,drawn=0,listed=0;
 const controls=new Map();
 const state={currentSection:features[0]?.id||null,features};
 const ctx={state,Object,Math,Number,console,
  $:id=>{if(!controls.has(id)){controls.set(id,{style:{},value:'',title:'',disabled:false});}return controls.get(id);},
  isEditableCampaign:()=>editable,
  persistState:()=>persisted++,
  drawAll:()=>drawn++,
  renderSectionList:()=>listed++
 };
 vm.createContext(ctx);
 vm.runInContext(sectionHelpers+';this.api={defaultSectionSheetIII,normalizeSectionSheetIII,sectionWorkStatus,sectionWorkStatusInfo,updateSectionWorkStatusUi,setSectionWorkStatus};',ctx);
 return {ctx,api:ctx.api,state,controls,counts:()=>({persisted,drawn,listed})};
}
const section=(workStatus,id='s1')=>({id,type:'section',sheetIII:workStatus===undefined?{sectionName:'S1',table:{vegetationCover:'30%'}}:{sectionName:'S1',workStatus}});
test('old section data with no status remains unclassified and content is preserved',()=>{
 const old=section(undefined),data=JSON.stringify(old.sheetIII),t=createContext([old]);
 assert.equal(t.api.sectionWorkStatus(old),null);
 assert.equal(t.api.sectionWorkStatusInfo(old).label,'Por revisar');
 assert.equal(JSON.stringify(old.sheetIII),data);
 const normalized=t.api.normalizeSectionSheetIII(old.sheetIII);
 assert.equal(normalized.workStatus,null);
 assert.equal(normalized.table.vegetationCover,'30%');
 assert.equal(t.api.defaultSectionSheetIII().workStatus,null);
});
test('invalid and malicious statuses normalize to unclassified',()=>{
 const t=createContext();
 for(const bad of ['finished','onerror=alert(1)',-1,{},'__proto__']){
  const d=t.api.normalizeSectionSheetIII({workStatus:bad});
  assert.equal(d.workStatus,null);
 }
});
test('new sections start pending, three colors are distinct and first page has picker',()=>{
 assert.match(app,/sheetIII:\{\.\.\.defaultSectionSheetIII\(\),workStatus:'pending'\}/);
 const t=createContext();
 const entries=['pending','started','done'].map(workStatus=>t.api.sectionWorkStatusInfo(section(workStatus)));
 assert.deepEqual(entries.map(x=>x.label),['Sin hacer','Comenzada','Acabada']);
 assert.equal(new Set(entries.map(x=>x.color)).size,3);
 assert.match(html,/id="sectionWorkStatus"/);
 assert.match(html,/value="pending"/);
 assert.match(html,/value="started"/);
 assert.match(html,/value="done"/);
 assert.match(css,/\.section-status-summary/);
});
test('changing section status persists only the selected section and refreshes map/list',()=>{
 const a=section('pending','s1'),b=section('done','s2'),t=createContext([a,b]);
 assert.equal(t.api.setSectionWorkStatus('started'),true);
 assert.equal(a.sheetIII.workStatus,'started');
 assert.equal(b.sheetIII.workStatus,'done');
 assert.equal(t.controls.get('#sectionWorkStatus').value,'started');
 assert.equal(t.counts().persisted,1);
 assert.equal(t.counts().drawn,1);
 assert.equal(t.counts().listed,1);
 assert.equal(t.api.setSectionWorkStatus('done'),true);
 assert.equal(a.sheetIII.workStatus,'done');
 assert.equal(t.counts().persisted,2);
 assert.equal(t.api.setSectionWorkStatus('invalid'),false);
 assert.equal(t.counts().persisted,2);
});
test('past / read-only campaign cannot modify section status',()=>{
 const a=section('started'),t=createContext([a],false);
 assert.equal(t.api.setSectionWorkStatus('done'),false);
 assert.equal(a.sheetIII.workStatus,'started');
 assert.equal(t.counts().persisted,0);
 t.api.updateSectionWorkStatusUi(a,true);
 assert.equal(t.controls.get('#sectionWorkStatus').disabled,true);
});
test('map and section list display small traffic-light dots without replacing section symbol',()=>{
 assert.match(app,/const statusColor=sectionWorkStatusInfo\(f\)\.color/);
 assert.match(app,/ctx\.fillText\(sectionName,anchor\.x\+7,anchor\.y-8\)/);
 assert.match(app,/section-status-progress/);
 assert.match(app,/section-status-dot/);
 assert.match(app,/\$\('#sectionWorkStatus'\)\.onchange=e=>setSectionWorkStatus/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const begin=app.indexOf('function defaultSectionSheetIII(');
const end=app.indexOf('function sectionReach(',begin);
assert.ok(begin>=0&&end>begin,'section status helpers must exist');
const source=app.slice(begin,end);
function sandbox(){
 const calls={save:0,list:0,draw:0};
 const f={id:'SEC-001',type:'section',sheetIII:{sectionName:'S1',observations:'datos existentes',workStatus:null}};
 const nodes={'sectionWorkStatus':{value:'',disabled:false},'sectionWorkStatusIndicator':{style:{},title:''}};
 const context={
  state:{features:[f],currentSection:f.id},
  $:id=>nodes[id.slice(1)]||null,
  isEditableCampaign:()=>true,
  persistState:()=>calls.save++,
  renderSectionList:()=>calls.list++,
  drawAll:()=>calls.draw++,
  blankFicData:()=>({}),
  optionalScore:x=>x==null?null:Number(x),
  Object,Number,Array,Math
 };
 vm.createContext(context);
 vm.runInContext(source+';this.defaultData=defaultSectionSheetIII;this.normalize=normalizeSectionSheetIII;this.status=sectionWorkStatusInfo;this.change=setSectionWorkStatus;this.updateUi=updateSectionWorkStatusUi;',context);
 return {context,f,calls,nodes};
}
test('legacy section fichas remain explicitly unclassified instead of being marked unfinished',()=>{
 const x=sandbox();
 assert.equal(x.context.normalize({sectionName:'S1',observations:'datos existentes'}).workStatus,null);
 assert.equal(x.context.status(x.f).label,'Por revisar');
 assert.equal(x.context.status(x.f).color,'#9ca3a0');
});
test('manual selector stores only the status in existing section sheetIII preserving other content',()=>{
 const x=sandbox();
 for(const [status,label,color] of [['pending','Sin hacer','#cf514d'],['started','Comenzada','#e5b43d'],['done','Acabada','#3c9964']]){
  assert.equal(x.context.change(status),true);
  assert.equal(x.f.sheetIII.workStatus,status);
  assert.equal(x.f.sheetIII.observations,'datos existentes');
  assert.equal(x.context.status(x.f).label,label);
  assert.equal(x.nodes.sectionWorkStatus.value,status);
  assert.equal(x.nodes.sectionWorkStatusIndicator.style.backgroundColor,color);
 }
 assert.equal(x.calls.save,3);assert.equal(x.calls.draw,3);assert.equal(x.calls.list,3);
});
test('invalid states cannot overwrite any section status',()=>{
 const x=sandbox();
 assert.equal(x.context.change('arbitrary'),false);
 assert.equal(x.f.sheetIII.workStatus,null);
 assert.equal(x.calls.save,0);
});
test('selector and map dots exist without changing Supabase schema',()=>{
 assert.match(html,/id="sectionWorkStatus"/);
 for(const v of ['pending','started','done'])assert.match(html,new RegExp('value="'+v+'"'));
 assert.match(app,/if\(\$\('#sectionWorkStatus'\)\)\$\('#sectionWorkStatus'\)\.onchange=e=>setSectionWorkStatus\(e\.target\.value\)/);
 assert.match(app,/const statusColor=sectionWorkStatusInfo\(f\)\.color/);
 assert.match(app,/className='section-status-progress'/);
 assert.match(app,/f\.sheetIII=normalizeSectionSheetIII\(f\.sheetIII\)/);
 assert.doesNotMatch(source,/\/rest\/v1\/|CREATE TABLE|ALTER TABLE/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../mobile-pwa.css'),'utf8');
const start=app.indexOf('function updateHydroFab(){');
const end=app.indexOf('function projectPointToPolyline(',start);
assert.ok(start>0&&end>start,'existing FITXA I button updater must be present');
const source=app.slice(start,end);
function setup(){
 const make=()=>{
  const classes=new Set(['hidden']);
  return {dataset:{},textContent:'',
   classList:{toggle:(name,force)=>{if(force)classes.add(name);else classes.delete(name);},
    contains:name=>classes.has(name)}};
 };
 const nodes=new Map();
 const get=id=>{if(!nodes.has(id))nodes.set(id,make());return nodes.get(id);};
 const courses=[
  {id:'CUR-TSJ',type:'watercourse',abbr:'TSJ',name:'Torrent Sant Jeroni'},
  {id:'CUR-TSM',type:'watercourse',abbr:'TSM',name:'Torrent Santa Maria'}
 ];
 const reaches=[
  {id:'TR-1',type:'reach',reachCode:'TSJ1',courseId:'CUR-TSJ'},
  {id:'TR-2',type:'reach',reachCode:'TSJ2',courseId:'CUR-TSJ'},
  {id:'TR-3',type:'reach',reachCode:'TSM1',courseId:'CUR-TSM'}
 ];
 const elements=[...courses,...reaches,{id:'DEP-1',type:'deposit'}];
 const state={features:elements,selectedId:null,activeCourseId:'CUR-TSM',tool:'select'};
 const env={state,document:{createElement:()=>make()},$:get,
  activeCourse:()=>state.features.find(f=>f.id===state.activeCourseId&&f.type==='watercourse')||null,
  reachCourse:r=>state.features.find(f=>f.id===r?.courseId&&f.type==='watercourse')||null};
 env.$('#mapScreen').appendChild=el=>nodes.set('#hydroActiveBadge',el);
 vm.createContext(env);
 vm.runInContext(source+';this.update=updateHydroFab;',env);
 return {state,nodes,get,update:env.update};
}
test('selecting TSJ2 preserves the normal reach card but exposes the whole TSJ course FITXA I',()=>{
 const h=setup();h.state.selectedId='TR-2';h.update();
 const button=h.get('#profileSheetFab');
 assert.equal(button.dataset.courseId,'CUR-TSJ');
 assert.equal(h.get('#profileSheetFabLabel').textContent,'Fitxa TSJ');
 assert.equal(button.classList.contains('hidden'),false);
 assert.equal(button.classList.contains('reach-selected'),true);
 assert.equal(h.get('#activeToolBtn span').textContent,'');
 assert.equal(h.nodes.has('#hydroActiveBadge'),false);
 assert.match(app,/else if\(f\.type==='reach'\)openReachSheet\(f\.id\)/);
 assert.match(app,/const btn=|\$\('#profileSheetFab'\)\.onclick=\(\)=>\{const id=\$\('#profileSheetFab'\)\.dataset\.courseId/);
});
test('changing selected reach changes the parent course even if another course was active',()=>{
 const h=setup();h.state.selectedId='TR-2';h.update();
 h.state.selectedId='TR-3';h.update();
 assert.equal(h.get('#profileSheetFab').dataset.courseId,'CUR-TSM');
 assert.equal(h.get('#profileSheetFabLabel').textContent,'Fitxa TSM');
});
test('selection of unrelated element or empty map hides the FITXA I button and clears its target',()=>{
 const h=setup();h.state.selectedId='TR-1';h.update();
 h.state.selectedId='DEP-1';h.update();
 assert.equal(h.get('#profileSheetFab').classList.contains('hidden'),true);
 assert.equal(h.get('#profileSheetFab').dataset.courseId,'');
 h.state.selectedId=null;h.update();
 assert.equal(h.get('#profileSheetFab').classList.contains('hidden'),true);
 assert.match(app,/state\.selectedId=null;hideFeatureCard\(\);updateHydroFab\(\);/);
});
test('an orphan reach never opens a different active course FITXA I',()=>{
 const h=setup();h.state.features.push({id:'TR-ORPHAN',type:'reach',courseId:'MISSING'});
 h.state.selectedId='TR-ORPHAN';h.update();
 assert.equal(h.get('#profileSheetFab').classList.contains('hidden'),true);
 assert.equal(h.get('#profileSheetFab').dataset.courseId,'');
});
test('existing watercourse and reach tool behavior remains unchanged',()=>{
 const h=setup();h.state.tool='reach';h.update();
 assert.equal(h.get('#profileSheetFab').dataset.courseId,'CUR-TSM');
 assert.equal(h.get('#profileSheetFab').classList.contains('hidden'),false);
 assert.equal(h.get('#profileSheetFab').classList.contains('reach-selected'),false);
 assert.equal(h.get('#activeToolBtn span').textContent,'Trams · TSM');
 assert.equal(h.get('#hydroActiveBadge').classList.contains('hidden'),false);
 h.state.tool='watercourse';h.update();
 assert.equal(h.get('#activeToolBtn span').textContent,'Curs · TSM');
 h.state.tool='pan';h.update();
 assert.equal(h.get('#profileSheetFab').classList.contains('hidden'),true);
 assert.equal(h.get('#hydroActiveBadge').classList.contains('hidden'),true);
});
test('selection shortcut stays reachable on mobile but other FITXA buttons keep original visibility',()=>{
 assert.match(css,/body\.mobile-map-lite #mapScreen #profileSheetFab\.reach-selected:not\(\.hidden\)/);
 assert.match(css,/display:flex!important/);
});

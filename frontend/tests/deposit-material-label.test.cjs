const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const scripts=app.slice(app.indexOf('function depositMaterialLabel('),app.indexOf('function featureCardDateText('));
const cardCode=app.slice(app.indexOf('async function showFeatureCard('),app.indexOf('function positionFeatureCard(',app.indexOf('async function showFeatureCard(')));
const materialList=app.slice(app.indexOf('const materials = ['),app.indexOf('const materialById',app.indexOf('const materials = [')));
test('deposit label returns selected material, never database identifier',()=>{
 const sandbox={state:{features:[]},featureArea:()=>100,featureLength:()=>10,formatAreaUnit:()=> '100 m²',formatLengthUnit:()=> '10 m'};
 vm.runInNewContext(materialList+'const materialById=id=>materials.find(m=>m.id===id);'+scripts+';this.label=depositMaterialLabel;this.present=featureCardPresentation;',sandbox);
 const selected={id:'DEP-017',type:'deposit',material:'conglomerate',closed:true,points:[{x:0,y:0},{x:1,y:0},{x:0,y:1}]};
 assert.equal(sandbox.label(selected),'Conglomerado consolidado');
 assert.equal(sandbox.present(selected).title,'Conglomerado consolidado');
 assert.doesNotMatch(sandbox.present(selected).title,/DEP-/);
 assert.equal(sandbox.label({...selected,material:'missing-material'}),'Material sin asignar');
});
test('deposit selection uses a compact material-only tooltip without opening a field sheet',async()=>{
 const elements=new Map();
 function fakeElement(id){
  if(!elements.has(id)){
   const classes=new Set(['hidden']);
   elements.set(id,{
    textContent:'',src:'',dataset:{},className:'',
    classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},
    setAttribute(name,val){this[name]=val;}
   });
  }
  return elements.get(id);
 }
 const context={materials:[{id:'conglomerate',name:'Conglomerado consolidado'}],
  $:id=>fakeElement(id.slice(1)),
  positionFeatureCard:()=>{context.positioned=true;},
  state:{},Date,Math,URL:{revokeObjectURL:()=>{}}};
 vm.runInNewContext(app.slice(app.indexOf('function depositMaterialLabel('),app.indexOf('function featureCardPresentation('))+cardCode+';this.selectDeposit=showFeatureCard;',context);
 await context.selectDeposit({id:'DEP-003',type:'deposit',material:'conglomerate'});
 assert.equal(fakeElement('featureCardTitle').textContent,'Conglomerado consolidado');
 assert.ok(fakeElement('featureCard').className.includes('feature-card-material-only'));
 assert.equal(fakeElement('featureCard').dataset.featureId,'DEP-003');
 assert.equal(fakeElement('featureCard').role,'status');
 assert.equal(context.positioned,true);
 assert.doesNotMatch(fakeElement('featureCardTitle').textContent,/DEP-/);
});
test('deposit map ID labels and sheets are disabled, without removing underlying identifiers',()=>{
 assert.match(app,/!ghost && f\.closed && !f\.paint && f\.type!=='basin' && f\.type!=='deposit'/);
 assert.match(app,/if\(!f\|\|f\.type==='deposit'\)return;/);
 assert.match(app,/f\.type==='deposit'\?depositMaterialLabel\(f\)/);
 assert.match(css,/#featureCard\.feature-card-material-only #featureCardTitle/);
 assert.match(css,/#featureCard\.feature-card-material-only\.hidden\{display:none!important\}/);
 assert.match(css,/#featureCard\.feature-card-material-only #openSheetBtn/);
 assert.doesNotMatch(html,/<strong id="featureCardTitle">DEP-/);
 assert.match(app,/id:uid\('deposit'\)/);
});

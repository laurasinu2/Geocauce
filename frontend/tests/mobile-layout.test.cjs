const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'mobile-pwa.css'),'utf8');
const js=fs.readFileSync(path.join(root,'mobile-pwa.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const responsive=css.slice(css.indexOf('/* Mobile map layout R16.'));
test('mobile controller is valid JavaScript',()=>assert.doesNotThrow(()=>new vm.Script(js)));
test('project title is left-aligned rather than translated off the phone screen',()=>{
  assert.match(responsive,/@media\s*\(max-width:820px\)/);
  assert.match(responsive,/body\.mobile-map-lite\s+#mapScreen\s+#projectBtn\s*\{[^}]*transform:none!important/);
  assert.match(responsive,/left:calc\(12px\s*\+\s*env\(safe-area-inset-left/);
});
test('map and bottom bar reserve matching safe-area heights',()=>{
  assert.match(responsive,/#mapScreen\s*\{[^}]*bottom:calc\(76px\s*\+\s*env\(safe-area-inset-bottom/);
  assert.match(responsive,/\.mobile-map-bar\s*\{[^}]*height:calc\(76px\s*\+\s*env\(safe-area-inset-bottom/);
});
test('mobile map provides both fit-to-project and locate controls',()=>{
  assert.match(responsive,/\.map-quick-actions>#fitAllBtn/);
  assert.match(responsive,/\.map-quick-actions>#locateQuickBtn/);
  assert.match(responsive,/\.map-quick-actions>button:not\(#fitAllBtn\):not\(#locateQuickBtn\)/);
});
test('mobile PWA cache and markup use the current revision',()=>{
  assert.match(index,/mobile-pwa\.css\?v=20261016-sharing-r28/);
  assert.match(index,/mobile-pwa\.js\?v=20261016-sharing-r28/);
  assert.match(sw,/const CACHE='geocauce-v0\.16\.40-mobile-pwa-r28(?:-hillshade-chunks(?:-gpkg(?:-deposits(?:-patterns(?:-sections)?)?)?)?)?'/);
});
test('first mobile map opening refits project once, but subsequent navigation preserves zoom',async()=>{
  const start=js.indexOf('async function showMap(){');
  const end=js.indexOf('function selectProjectMobile(',start);
  assert.ok(start>=0&&end>start);
  const showMapSrc=js.slice(start,end);
  const elements=new Map();
  const fakeElement=id=>{
    if(!elements.has(id)){
      const classes=new Set(['hidden']);
      elements.set(id,{classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)}});
    }
    return elements.get(id);
  };
  let fitted=0,resized=0;
  const context={
    simpleEnabled:()=>true,activeProject:()=>({id:context.projectId}),
    projectId:'first',
    ensureProjectLoaded:async()=>true,showShell:()=>{throw Error('unexpected shell')},
    shell:fakeElement('mobileShell'),mapBar:fakeElement('mobileMapBar'),
    document:{body:{classList:{add:()=>{}}}},
    $:id=>id==='#fitAllBtn'?{click:()=>{fitted++}}:fakeElement(id),
    api:{getState:()=>({projectId:context.projectId,screen:'map',rasters:[{visible:true}],features:[]})},
    window:{dispatchEvent:()=>{resized++}},
    Event:function(type){this.type=type},
    requestAnimationFrame:cb=>{context.pending.push(cb)},pending:[],
    lastFramedMapProjectId:null
  };
  vm.createContext(context);
  context.showMap=vm.runInContext('(function(){'+showMapSrc+'return showMap;})()',context);
  async function navigate(){await context.showMap();while(context.pending.length)context.pending.shift()();}
  await navigate();assert.equal(fitted,1);assert.equal(resized,2);
  await navigate();assert.equal(fitted,1);assert.equal(resized,4);
  context.projectId='second';
  await navigate();assert.equal(fitted,2);
});

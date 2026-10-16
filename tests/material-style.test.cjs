const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const app=read('app.js'),html=read('index.html'),css=read('styles.css'),sw=read('sw.js');
const helpersStart=app.indexOf('const MATERIAL_CUSTOM_PATTERNS=');
const helpersEnd=app.indexOf('const ICONS=',helpersStart);
const materialHelpers=app.slice(helpersStart,helpersEnd);
function setup(styles={}){
  const ctx={state:{materialStyles:styles},console,Set,Object,Math,Number};
  vm.createContext(ctx);
  vm.runInContext(materialHelpers,ctx);
  return ctx;
}
const json=x=>JSON.parse(JSON.stringify(x));
test('GeoCauce app code parses',()=>assert.doesNotThrow(()=>new vm.Script(app)));
test('erosion and deposition appear as separate fluvial materials',()=>{
  assert.match(app,/id:'erosion', name:'Zona de erosión', kind:'fluvial'/);
  assert.match(app,/id:'deposition', name:'Zona de deposición', kind:'fluvial'/);
  assert.match(app,/id:'erosion'/);
});
test('legacy material styles remain unchanged when no custom style is stored',()=>{
  const c=setup({});
  assert.equal(c.materialStyleConfig('coarse'),null);
  assert.equal(c.materialStyleConfig('gravel'),null);
  assert.equal(c.materialStyleConfig('fine'),null);
});
test('fluvial styles default to distinct transparent QGIS-style hatches',()=>{
  const c=setup();
  const erosion=json(c.materialStyleConfig('erosion')),deposition=json(c.materialStyleConfig('deposition'));
  assert.equal(erosion.pattern,'diagonal');assert.equal(deposition.pattern,'dots');
  assert.ok(erosion.opacity>0&&erosion.opacity<1);
  assert.ok(deposition.opacity>0&&deposition.opacity<1);
  assert.notEqual(erosion.color,deposition.color);
});
test('custom styles are normalized against malicious or invalid settings',()=>{
  const c=setup();
  const s=json(c.normalizeMaterialStyle('coarse',{pattern:'javascript:x',color:'red;opacity:1',ink:'#ABCDEF',opacity:99,spacing:-8,outline:true,outlineColor:'#000000',outlineWidth:500,outlineDash:'evil',brushWidth:-1}));
  assert.equal(s.pattern,'legacy');assert.equal(s.color,'#eee0bc');
  assert.equal(s.ink,'#abcdef');assert.equal(s.opacity,1);
  assert.equal(s.spacing,5);assert.equal(s.outlineWidth,12);assert.equal(s.brushWidth,4);
  assert.equal(s.outlineDash,'solid');
});
test('customized materials inherit style globally from per-project dictionary',()=>{
  const c=setup({gravel:{pattern:'horizontal',color:'#223344',opacity:.3,outline:false}});
  const s=json(c.materialStyleConfig('gravel'));
  assert.equal(s.pattern,'horizontal');assert.equal(s.color,'#223344');
  assert.equal(s.opacity,.3);assert.equal(s.outline,false);
  assert.equal(c.materialStyleConfig('fine'),null);
});
test('all material styles round-trip via existing project snapshot without new database tables',()=>{
  assert.match(app,/materialStyles:state\.materialStyles\|\|\{\}/);
  assert.match(app,/state\.materialStyles=Object\.fromEntries/);
  assert.match(app,/state\.tool='pan';state\.material='coarse';state\.materialStyles=\{\}/);
  assert.match(app,/state\.materialStyles\[editingMaterialId\]=normalizeMaterialStyle/);
  assert.match(app,/delete state\.materialStyles\[editingMaterialId\]/);
});
test('all existing drawing tools still map their features to the selected material',()=>{
  assert.match(app,/st\.tool==='boundary'[\s\S]*?material:state\.material/);
  assert.match(app,/st\.tool==='paint'[\s\S]*?material:state\.material/);
  assert.match(app,/state\.tool==='fill'[\s\S]*?f\.material=state\.material/);
});
test('style editor has real accessible controls and reset/save handlers',()=>{
  for(const name of ['materialStyleModal','materialStylePreview','materialStylePattern','materialStyleColor','materialStyleInk','materialStyleOpacity','materialStyleSpacing','materialStyleBrushWidth','materialStyleOutline','materialStyleOutlineColor','materialStyleOutlineDash','materialStyleOutlineWidth','materialStyleReset','materialStyleSave','materialStyleCancel']){
    assert.ok(html.includes('id="'+name+'"'),name+' must exist in the HTML');
  }
  assert.match(app,/installMaterialStyleEditor\(\);/);
  assert.match(css,/\.material-style-dialog/);
});
test('PWA cache is bumped to material editor revision r17',()=>{
  assert.match(html,/app\.js\?v=20261016-sheetmaps-r26/);
  assert.match(sw,/mobile-pwa-r26/);
});
test('existing synchronized asset manifest and retry code remain in place',()=>{
  assert.match(app,/function cloudRemoteAssetIndex\(/);
  assert.match(app,/function cloudCollectObsoleteAssets\(/);
  assert.match(app,/const previous=previousRows\?\.\[0\]/);
  assert.doesNotMatch(app,/method:'HEAD'/);
  assert.doesNotMatch(app,/await exists\(old\.path/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const load=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const app=load('app.js'),html=load('index.html'),sw=load('sw.js');
const begin=app.indexOf('function rasterParseFiniteNumber('),end=app.indexOf('function adjustRasterRgb(',begin);
assert.ok(begin>=0&&end>begin,'QGIS colormap helper boundary');
const sandbox={};vm.createContext(sandbox);
vm.runInContext(app.slice(begin,end)+';this.rasterFns={rasterParseFiniteNumber,rasterParseQgisColorMap,rasterQgisStopColor,rasterValidateStops};',sandbox);
const {rasterParseFiniteNumber:parseNumber,rasterParseQgisColorMap:parse,rasterQgisStopColor:color,rasterValidateStops:valid}=sandbox.rasterFns;
const sample=`# Archivo de exportación de mapa de colores generado por QGIS
INTERPOLATION:INTERPOLATED
-0.5,0,0,0,255,-1 - -1
5,255,255,0,255,0 - 5
30.00000000000000355,0,255,255,255,5 - 30
100,0,127,255,255,30 - 100
1000,0,0,255,255,100 - 1000
55928,0,0,0,255,1000 - 55928`;
test('GeoCauce still compiles',()=>assert.doesNotThrow(()=>new vm.Script(app)));
test('QGIS sample imports every original value, label and color',()=>{
 const map=parse(sample);assert.equal(map.interpolation,'linear');
 assert.deepEqual(Array.from(map.stops,x=>x.value),[-.5,5,30.00000000000000355,100,1000,55928]);
 assert.deepEqual(Array.from(map.stops,x=>x.color),['#000000','#ffff00','#00ffff','#007fff','#0000ff','#000000']);
 assert.equal(map.stops[4].label,'100 - 1000');
 assert.equal(map.min,-.5);assert.equal(map.max,55928);
});
test('QGIS interpolation matches exact endpoint values and transitions',()=>{
 const p=parse(sample),mid=Array.from(color(17.5,p.stops,'linear'));
 assert.deepEqual(Array.from(color(5,p.stops,'linear')),[255,255,0,255]);
 assert.ok(Math.abs(mid[0]-128)<=1&&mid[1]===255&&Math.abs(mid[2]-128)<=1);
 assert.deepEqual(Array.from(color(1000,p.stops,'linear')),[0,0,255,255]);
 assert.deepEqual(Array.from(color(-500,p.stops,'linear')),[0,0,0,255]);
});
test('QGIS DISCRETE and EXACT styles are supported',()=>{
 const simple='INTERPOLATION:DISCRETE\n0,0,0,0,255,low\n10,255,0,0,255,high';
 const p=parse(simple);
 assert.equal(p.interpolation,'discrete');
 assert.deepEqual(Array.from(color(5,p.stops,p.interpolation)),[255,0,0,255]);
 assert.deepEqual(Array.from(color(5,p.stops,'exact')||[]),[]);
 assert.deepEqual(Array.from(color(10,p.stops,'exact')),[255,0,0,255]);
});
test('QGIS alpha is preserved in interpolated RGBA output',()=>{
 const p=parse('INTERPOLATION:INTERPOLATED\n0,0,0,0,0,a\n10,255,255,255,255,b');
 assert.deepEqual(Array.from(color(5,p.stops)),[128,128,128,128]);
});
test('comma decimal input is parsed and invalid input rejected',()=>{
 assert.equal(parseNumber('87,2'),87.2);assert.equal(parseNumber('-0,5'),-.5);
 assert.equal(parseNumber('30.00000000000000355'),30.00000000000000355);
 assert.equal(parseNumber(''),null);assert.equal(parseNumber('1,2,3'),null);
 assert.equal(parseNumber('1e3'),1000);
});
test('broken or unordered palette is never silently accepted',()=>{
 assert.throws(()=>parse('INTERPOLATION:INTERPOLATED\n5,0,0,0,255,a\n5,255,0,0,255,b'),/ordre|ordenats|duplicats/);
 assert.throws(()=>parse('INTERPOLATION:INTERPOLATED\n0,0,0,0,255,a\n10,270,0,0,255,b'),/RGBA/);
 assert.equal(valid([{value:2},{value:1}]),false);
});
test('imported palette and manual ranges are both saved, editable and reloadable',()=>{
 assert.match(app,/colorStops:rasterStyleQgisStops\?cloneAny\(rasterStyleQgisStops\):\[\]/);
 assert.match(app,/st\.colorStops/);
 assert.match(app,/rasterQgisStopColor\(v,style\.colorStops/);
 assert.match(app,/limit\.value=String\(nv\)/);
 assert.match(app,/inputmode="decimal"/);
 assert.match(app,/function renderRasterQgisStops\(/);
});
test('QGIS file picker and progressive raster rendering are kept intact',()=>{
 assert.match(html,/id="rasterStyleImportQgisFile"/);
 assert.match(app,/async function importRasterQgisPalette\(/);
 assert.match(app,/renderStyledValues\(dec\.values,w,h,style/);
 assert.match(app,/function cloudRemoteAssetIndex\(/);
 assert.doesNotMatch(app,/method:'HEAD'/);
 assert.match(html,/20261016-sharing-r28/);
 assert.match(sw,/mobile-pwa-r28/);
});

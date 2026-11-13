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
const drainageDirectionQgis=`# S'ha generat un fitxer QGIS d'exportació de mapa de colors
INTERPOLATION:DISCRETE
-7,64,64,162,255,<= -7
-6,70,107,227,255,-7 - -6
-5,66,148,255,255,-6 - -5
-4,40,188,235,255,-5 - -4
-3,24,221,194,255,-4 - -3
-2,50,242,152,255,-3 - -2
-1,109,254,98,255,-2 - -1
0,164,252,60,255,-1 - 0
1,205,236,52,255,0 - 1
2,238,207,58,255,1 - 2
3,253,172,52,255,2 - 3
4,251,126,33,255,3 - 4
5,235,80,14,255,4 - 5
6,208,47,5,255,5 - 6
7,169,22,1,255,6 - 7
inf,122,4,3,255,> 7`;
test('QGIS drainage direction exported file imports its 16 color classes with an unbounded final class',()=>{
 const map=parse(drainageDirectionQgis);
 assert.equal(map.interpolation,'discrete');
 assert.equal(map.stops.length,16);
 assert.deepEqual(Array.from(map.stops,x=>x.color),[
  '#4040a2','#466be3','#4294ff','#28bceb','#18ddc2','#32f298',
  '#6dfe62','#a4fc3c','#cdec34','#eecf3a','#fdac34','#fb7e21',
  '#eb500e','#d02f05','#a91601','#7a0403'
 ]);
 assert.equal(map.stops[0].label,'<= -7');
 assert.equal(map.stops[15].label,'> 7');
 assert.equal(map.stops[15].unbounded,true);
 assert.ok(Number.isFinite(map.stops[15].value)&&map.stops[15].value>7);
 assert.equal(valid(map.stops),true);
 assert.deepEqual(Array.from(color(-9,map.stops,'discrete')),[64,64,162,255]);
 assert.deepEqual(Array.from(color(7,map.stops,'discrete')),[169,22,1,255]);
 assert.deepEqual(Array.from(color(7.0001,map.stops,'discrete')),[122,4,3,255]);
 assert.deepEqual(Array.from(color(100000000,map.stops,'discrete')),[122,4,3,255]);
});
test('QGIS +inf class remains open across JSON save/restore and an edited upper threshold',()=>{
 const original=parse(drainageDirectionQgis),restored=JSON.parse(JSON.stringify(original.stops));
 assert.ok(valid(restored));
 assert.equal(restored.at(-1).unbounded,true);
 assert.deepEqual(Array.from(color(1000,restored,'discrete')),[122,4,3,255]);
 assert.match(app,/num\.readOnly=true/);
 assert.match(app,/rasterQgisOpenUpper\(value\)/);
 assert.match(app,/rec\.unbounded\?'∞'/);
});
test('QGIS infinity is only permitted on the final DISCRETE interval',()=>{
 assert.throws(()=>parse('INTERPOLATION:INTERPOLATED\n0,0,0,0,255,low\ninf,255,0,0,255,high'),/inf/);
 assert.throws(()=>parse('INTERPOLATION:EXACT\n0,0,0,0,255,low\ninf,255,0,0,255,high'),/inf/);
 assert.throws(()=>parse('INTERPOLATION:DISCRETE\n0,0,0,0,255,low\ninf,255,0,0,255,high\n10,255,255,0,255,end'),/inf/);
 assert.throws(()=>parse('INTERPOLATION:DISCRETE\n0,0,0,0,255,low\nNaN,255,0,0,255,high'),/RGBA/);
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

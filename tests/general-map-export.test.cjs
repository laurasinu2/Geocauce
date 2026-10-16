const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),
      html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),
      sw=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
const from=app.indexOf('const GENERAL_MAP_COURSE_PALETTE='),to=app.indexOf('function dataUrlBlob(',from);
assert.ok(from>0&&to>from,'general map export-only functions exist');
const isolated=app.slice(from,to);
function load(env={}){const context={...env};vm.runInNewContext(isolated+';this.general={generalMapCourseColors,generalMapRasterLayers,generalMapBasinLayers,drawGeneralMapBasinBoundaries,drawGeneralMapCourseLabels,generalMapDataUrl};',context);return context.general;}
const p=(x,y)=>({x,y});
test('course colours are distinct, deterministic and independent of feature ordering',()=>{
 const a=[{id:'torrent-z'},{id:'torrent-b'},{id:'torrent-m'},{id:'torrent-a'}];
 const fn=load();
 const first=fn.generalMapCourseColors(a),second=fn.generalMapCourseColors([...a].reverse());
 const result=a.map(c=>first.get(c.id));
 assert.equal(new Set(result).size,a.length);
 assert.ok(result.every(c=>/^#|^hsl/.test(c)));
 for(const c of a)assert.equal(first.get(c.id),second.get(c.id));
});
test('topographic map is layered after DEM with exactly the same blending opacity',()=>{
 const dem={id:'dem',name:'MDT 0.25m',meta:{kind:'dem'},visible:true,opacity:.49,georef:true,image:{},affine:{}};
 const topo={id:'map',name:'Mapa topografia',meta:{kind:'rgb'},visible:false,opacity:1,georef:true,image:{},affine:{}};
 const state={rasters:[topo,dem]};
 const fn=load({state,sourceResolution:()=>.25});
 const layers=fn.generalMapRasterLayers();
 assert.deepEqual(Array.from(layers.rasters.map(x=>x.id)),['dem','map']);
 assert.equal(layers.opacity,.49);
 assert.equal(layers.topographic,topo);
 assert.equal(topo.visible,false,'export must not turn on the source map');
 assert.equal(topo.opacity,1,'export must not change source map opacity');
});
test('non-dem georeferenced map is fallback topographic layer and opacity keeps both backgrounds visible',()=>{
 const dem={id:'dem',name:'mde',meta:{kind:'dem'},opacity:1,image:{},affine:{},georef:true};
 const other={id:'base',name:'ICGC full image',image:{},affine:{},georef:true};
 const fn=load({state:{rasters:[other,dem]},sourceResolution:()=>1});
 const layers=fn.generalMapRasterLayers();
 assert.equal(layers.topographic,other);
 assert.equal(layers.opacity,.62);
});
test('definitive basin SHP is preferred and is found even when invisible',()=>{
 const a={id:'draft',role:'basin',name:'conca provisional',visible:true};
 const b={id:'final',role:'basin',name:'SHP definit de conca',visible:false};
 const fn=load({state:{referenceLayers:[a,b]}});
 assert.deepEqual(Array.from(fn.generalMapBasinLayers().map(x=>x.id)),['final']);
 assert.equal(b.visible,false);
});
test('basin outline uses SHP geometry without filling or changing the original style',()=>{
 const layer={id:'final',role:'basin',name:'definit de conca',visible:false,
   features:[{paths:[[p(1,2),p(4,5),p(6,7)]]}],vectorStyle:{strokeColor:'#f00'}};
 const marks=[],g={save(){},restore(){},beginPath(){},moveTo(...xy){marks.push(['M',...xy]);},
  lineTo(...xy){marks.push(['L',...xy]);},stroke(){marks.push(['stroke',this.strokeStyle]);},setLineDash(x){marks.push(['dash',...x]);}};
 const fn=load({hydroBasins:()=>[],boundsIntersect:()=>true});
 fn.drawGeneralMapBasinBoundaries(g,{minX:0,minY:0,maxX:10,maxY:10},x=>x,y=>y,[layer]);
 assert.ok(marks.some(x=>x[0]==='stroke'&&x[1]==='#315949'));
 assert.ok(marks.some(x=>x[0]==='M'&&x[1]===1&&x[2]===2));
 assert.equal(layer.vectorStyle.strokeColor,'#f00');
 assert.equal(layer.visible,false);
});
test('colored name and its torrent share the same ink and readable white outline',()=>{
 const marks=[],color='#12638a';
 const g={save(){},restore(){},measureText:txt=>({width:txt.length*8}),
   beginPath(){},moveTo(){},lineTo(){},stroke(){marks.push(['stroke',this.strokeStyle]);},
   strokeText(txt){marks.push(['halo',txt,this.strokeStyle]);},
   fillText(txt){marks.push(['label',txt,this.fillStyle]);}};
 const fn=load({featurePolylines:c=>[c.points],polylineLength:()=>2,pointAtAlong:pts=>pts[0]});
 fn.drawGeneralMapCourseLabels(g,[{id:'one',abbr:'TSS',name:'Sant Salvador',points:[p(500,500),p(600,600)]}],new Map([['one',color]]),x=>x,y=>y,1800,1250);
 assert.ok(marks.some(x=>x[0]==='label'&&x[2]===color));
 assert.ok(marks.some(x=>x[0]==='halo'&&x[2].includes('255,255,255')));
});
test('general export includes both backgrounds, hidden definitive SHP and colored courses without changing editor visibility',async()=>{
 const marks=[],g={save(){},restore(){},rect(){},clip(){},beginPath(){},moveTo(){},lineTo(){},stroke(){marks.push(['stroke',this.strokeStyle]);},
  fillRect(){},fillText(txt){marks.push(['text',txt,this.fillStyle]);},strokeText(){},setLineDash(){},
  measureText:t=>({width:t.length*8})};
 const canvas={width:0,height:0,getContext:()=>g,toDataURL:()=> 'data:image/jpeg;base64,ZW5jb2RlZA=='};
 const courses=[{id:'c2',name:'Riu Blau',abbr:'RB',points:[p(10,10),p(30,30)]},{id:'c1',name:'Torrent Verd',abbr:'TV',points:[p(15,10),p(25,40)]}];
 const basin={id:'basin',role:'basin',name:'Definit de conca',visible:false,fullBounds:{minX:0,maxX:50,minY:0,maxY:50},
   features:[{paths:[[p(0,0),p(50,0),p(50,50),p(0,0)]]}]};
 const dem={id:'dem',meta:{kind:'dem'},georef:true,image:{},affine:{},opacity:.58,visible:true};
 const topo={id:'topo',name:'Topografia',georef:true,image:{},affine:{},opacity:.9,visible:false};
 const state={project:{name:'Camp'},rasters:[topo,dem],referenceLayers:[basin]};
 const bounds={minX:0,maxX:50,minY:0,maxY:50};
 let loaded=0,rendered=null,referenceCalled=0;
 const env={state,document:{createElement:()=>canvas},sourceResolution:()=>1,rasterBounds:()=>bounds,
  featureBounds:()=>bounds,pointsBounds:()=>bounds,combineBounds:()=>bounds,expandedBounds:()=>bounds,
  projectRasterBounds:()=>bounds,hydroCourses:()=>courses,hydroBasins:()=>[],
  boundsIntersect:()=>true,ensureReferenceLayerFeatures:async()=>{loaded++;return true;},
  drawExportRasterStack:(ctx,b,w,h,pad,opts)=>{rendered=opts;return {tx:x=>x,ty:y=>y};},
  drawReferenceLayersExport:()=>referenceCalled++,
  featurePolylines:c=>[c.points],polylineLength:()=>2,pointAtAlong:pts=>pts[0]};
 const fn=load(env),src=await fn.generalMapDataUrl();
 assert.match(src,/^data:image\/jpeg/);
 assert.equal(loaded,1);
 assert.equal(referenceCalled,1);
 assert.deepEqual(Array.from(rendered.rasters.map(r=>r.id)),['dem','topo']);
 assert.equal(rendered.sharedOpacity,.58);
 assert.ok(marks.some(x=>x[0]==='stroke'&&x[1]==='#315949'),'basin outline drawn');
 const colors=fn.generalMapCourseColors(courses);
 assert.ok(marks.some(x=>x[0]==='stroke'&&x[1]===colors.get('c1')));
 assert.ok(marks.some(x=>x[0]==='stroke'&&x[1]===colors.get('c2')));
 assert.equal(topo.visible,false);
 assert.equal(basin.visible,false);
});
test('general-map output is used by both individual and ZIP exports, FITXA renderer stays untouched',()=>{
 assert.match(app,/dataUrlBlob\(await generalMapDataUrl\(\)\)/);
 assert.match(app,/const url=await generalMapDataUrl\(\),blob=dataUrlBlob\(url\)/);
 assert.match(app,/function renderProjectMapImage\(bounds,/);
 assert.doesNotMatch(isolated,/persistState\(|dbPut\(|cloudUpload/);
 assert.match(html,/app\.js\?v=20261016-generalmap-r27/);
 assert.match(sw,/mobile-pwa-r27/);
 assert.doesNotThrow(()=>new vm.Script(app));
});

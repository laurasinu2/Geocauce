const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=app.indexOf('function materialMapPatternTransform('),end=app.indexOf('function makePattern(',start);
assert.ok(start>=0&&end>start);
const slice=app.slice(start,end);
function mapWorld(p,view,{w=1200,h=800}={}){
 const s=view.scale,r=view.rotation||0,c=Math.cos(r),sn=Math.sin(r),dx=p.x-view.cx,dy=p.y-view.cy;
 return{x:w/2+s*(c*dx+sn*dy),y:h/2+s*(sn*dx-c*dy)};
}
function inPattern(p,m){
 const x=p.x-m[4],y=p.y-m[5],d=m[0]*m[3]-m[1]*m[2];
 return{x:(m[3]*x-m[2]*y)/d,y:(-m[1]*x+m[0]*y)/d};
}
function residue(n,k){return ((n%k)+k)%k;}
function testPattern(world,views,epsg=25831){
 const ctx={state:{view:views[0]},Math,projectCrsEpsg:()=>epsg,worldToScreen:p=>mapWorld(p,ctx.state.view)};
 vm.createContext(ctx);vm.runInContext(slice+';this.transform=materialMapPatternTransform;',ctx);
 const phases=[];
 for(const v of views){
  ctx.state.view=v;
  const m=Array.from(ctx.transform(28));
  const p=inPattern(mapWorld(world,v),m);
  phases.push({x:residue(p.x,28),y:residue(p.y,28)});
 }
 return phases;
}
test('all polygons and brush strokes share one world-anchored hatch grid after pan zoom and rotation',()=>{
 const w={x:400037.25,y:4600019.75};
 const phases=testPattern(w,[
  {cx:400000,cy:4600000,scale:.6,rotation:0},
  {cx:400046,cy:4600022,scale:.6,rotation:0},
  {cx:400012,cy:4600080,scale:1.8,rotation:.35},
  {cx:400037,cy:4600020,scale:3.4,rotation:-.8}
 ]);
 for(const p of phases.slice(1)){
  assert.ok(Math.abs(p.x-phases[0].x)<1e-7,JSON.stringify(phases));
  assert.ok(Math.abs(p.y-phases[0].y)<1e-7,JSON.stringify(phases));
 }
});
test('geographic CRS uses a practical small repeat interval',()=>{
 const phases=testPattern({x:2.168479,y:41.511118},[
  {cx:2.168,cy:41.511,scale:200000,rotation:0},
  {cx:2.169,cy:41.512,scale:400000,rotation:0.2}
 ],4326);
 assert.ok(Math.abs(phases[0].x-phases[1].x)<1e-7);
 assert.ok(Math.abs(phases[0].y-phases[1].y)<1e-7);
});
test('both fill and paint use world anchored material patterns without mutating persisted feature geometry',()=>{
 assert.match(app,/ctx\.strokeStyle=makePattern\(f\.material,ctx,pts\[0\],true\)/);
 assert.match(app,/ctx\.fillStyle=makePattern\(f\.material,ctx,pts\[0\],true\)/);
 assert.match(app,/function makePattern\(id,ctx,anchor=\{x:0,y:0\},worldFixed=false\)/);
 assert.match(app,/if\(worldFixed\)pattern\.setTransform\(new DOMMatrix\(materialMapPatternTransform\(tile\)\)\)/);
 assert.match(app,/ctx\.fillStyle=makePattern\(id,ctx,\{x:0,y:0\}\)/);
 assert.doesNotMatch(app.slice(start,end),/f\.points|f\.id|f\.material/);
});

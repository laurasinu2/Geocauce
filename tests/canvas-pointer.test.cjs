const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const first=source.indexOf('function eventPoint(e,el){');
const last=source.indexOf('\n\nfunction featureCardPresentation(',first);
const n=source.indexOf('function normPoint(p,c){');
const end=source.indexOf('\n',n);
assert.ok(first>=0&&last>first&&n>=0&&end>n,'Pointer and normalization helpers must exist');
function canvas(left,top,width,height){return {getBoundingClientRect:()=>({left,top,width,height})};}
function coordinates(mapSize={w:1200,h:800}){
  const map=canvas(0,0,600,400);
  const context={inkCanvas:map,screenSize:()=>mapSize};
  vm.createContext(context);
  vm.runInContext(source.slice(first,last)+'\n'+source.slice(n,end),context);
  return {eventPoint:context.eventPoint,normPoint:context.normPoint,map};
}
function pointer(x,y){return {clientX:x,clientY:y};}
test('app.js is valid JavaScript',()=>assert.doesNotThrow(()=>new vm.Script(source)));
test('map retains its existing screen-space coordinate mapping',()=>{
  const {eventPoint,map}=coordinates();
  assert.deepEqual(JSON.parse(JSON.stringify(eventPoint(pointer(300,200),map))),{x:600,y:400});
});
test('section pen starts exactly under the stylus, not on the map scale',()=>{
  const {eventPoint,normPoint}=coordinates();
  const section=canvas(50,70,900,450),p=eventPoint(pointer(500,295),section),np=normPoint(p,section);
  assert.deepEqual(JSON.parse(JSON.stringify(p)),{x:450,y:225});
  assert.equal(np.x*900,450);assert.equal(np.y*450,225);
});
test('section vertex placement remains aligned after viewport resizing',()=>{
  const {eventPoint,normPoint}=coordinates({w:2200,h:1400});
  for(const dimensions of [[100,100,600,300],[140,80,1100,570]]){
    const [left,top,w,h]=dimensions,section=canvas(left,top,w,h);
    const local=eventPoint(pointer(left+w*.23,top+h*.71),section),np=normPoint(local,section);
    assert.ok(Math.abs(np.x-.23)<1e-10);
    assert.ok(Math.abs(np.y-.71)<1e-10);
  }
});
test('notebook drawing aligns with page position and 200% zoom',()=>{
  const {eventPoint,normPoint}=coordinates();
  for(const [w,h] of [[820,1160],[1640,2320]]){
    const notebook=canvas(120,65,w,h),p=eventPoint(pointer(120+w*.6,65+h*.4),notebook);
    const np=normPoint(p,notebook);
    assert.ok(Math.abs(np.x-.6)<1e-10);
    assert.ok(Math.abs(np.y-.4)<1e-10);
  }
});
test('feature sheet and section notes use their local canvas dimensions',()=>{
  const {eventPoint,normPoint}=coordinates();
  for(const dims of [[30,40,300,150],[30,40,480,260]]){
    const [x,y,w,h]=dims,sheet=canvas(x,y,w,h);
    const p=eventPoint(pointer(x+w*.35,y+h*.62),sheet),np=normPoint(p,sheet);
    assert.ok(Math.abs(np.x-.35)<1e-10);
    assert.ok(Math.abs(np.y-.62)<1e-10);
  }
});

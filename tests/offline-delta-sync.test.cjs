const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../cloud-delta-sync.js'),'utf8');
const sandbox={};vm.runInNewContext(source,sandbox);
const {merge,diff}=sandbox.GeoCauceDeltaSync;
const unpack=x=>JSON.parse(JSON.stringify(x));
const f=(id,sheet,photos=[])=>({id,type:'section',sheetIII:{observations:sheet},photos});
const state=(items)=>({campaigns:[{id:'D01',upserts:items,deleted:[],order:items.map(x=>x.id)}]});
test('independent tablet notes and mobile photos enrich the same section',()=>{
 const base=state([f('SEC-1','old')]);
 const mobile=state([f('SEC-1','old',['photo1'])]);
 const tablet=state([f('SEC-1','new')]);
 const r=merge(base,tablet,mobile);
 assert.equal(r.conflicts.length,0);
 assert.equal(r.value.campaigns[0].upserts[0].sheetIII.observations,'new');
 assert.deepEqual(unpack(r.value.campaigns[0].upserts[0].photos),['photo1']);
});
test('two new photographs on two devices merge without losing either',()=>{
 const base=state([f('SEC-1','old')]);
 const a=state([f('SEC-1','old',['photo-mob'])]);
 const b=state([f('SEC-1','old',['photo-tab'])]);
 const r=merge(base,a,b);
 assert.equal(r.conflicts.length,0);
 assert.deepEqual(unpack(r.value.campaigns[0].upserts[0].photos),['photo-tab','photo-mob']);
});
test('different edits on same field are flagged and never silently overwritten',()=>{
 const base=state([f('SEC-1','old')]),mobile=state([f('SEC-1','from mobile')]),tablet=state([f('SEC-1','from tablet')]);
 const r=merge(base,tablet,mobile);
 assert.equal(r.conflicts.length,1);
 assert.match(r.conflicts[0].path,/sheetIII\/observations/);
 assert.equal(r.value.campaigns[0].upserts[0].sheetIII.observations,'from tablet');
});
test('merge new sections with stable ids in a shared campaign',()=>{
 const base=state([f('SEC-1','')]),a=state([f('SEC-1',''),f('SEC-2','tablet')]),b=state([f('SEC-1',''),f('SEC-3','mobile')]);
 const r=merge(base,a,b);
 assert.equal(r.conflicts.length,0);
 assert.deepEqual(unpack(r.value.campaigns[0].upserts.map(v=>v.id)),['SEC-1','SEC-3','SEC-2']);
 assert.deepEqual(unpack(r.value.campaigns[0].order),['SEC-1','SEC-3','SEC-2']);
});
test('deletion versus editing a feature stops with a conflict',()=>{
 const base=state([f('SEC-1','old')]),local=state([]),remote=state([f('SEC-1','changed')]);
 const r=merge(base,local,remote);
 assert.equal(r.conflicts.length>=1,true);
 assert.match(r.conflicts[0].type,/delete-versus-edit/);
});
test('pure diff records only touched leaf paths, not entire project',()=>{
 const before=state([f('SEC-1','old')]),after=state([f('SEC-1','new')]);
 const ops=unpack(diff(before,after));
 assert.deepEqual(ops,[{path:'/campaigns[id=D01]/upserts[id=SEC-1]/sheetIII/observations',kind:'update'}]);
});
test('viewport changes never appear in shared-change queue',()=>{
 const before={...state([]),view:{cx:10}},after={...state([]),view:{cx:150}};
 assert.equal(diff(before,after).length,0);
});
test('new snapshot contains remote unchanged fields alongside local changes',()=>{
 const base=state([f('SEC-1','old')]),local=state([f('SEC-1','new')]),remote={...state([f('SEC-1','old')]),sectionPalette:[{id:'a',name:'rojo'}]};
 const r=merge(base,local,remote);assert.equal(r.conflicts.length,0);
 assert.equal(r.value.sectionPalette[0].name,'rojo');
 assert.equal(r.value.campaigns[0].upserts[0].sheetIII.observations,'new');
});
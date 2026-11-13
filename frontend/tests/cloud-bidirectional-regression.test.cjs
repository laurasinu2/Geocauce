'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'../cloud-delta-sync.js'),'utf8');
const env={window:{},Date};vm.runInNewContext(code,env);
const sync=env.window.GeoCauceDeltaSync;
const section=(id,fields={})=>({id,type:'section',sheetIII:{workStatus:'started',...fields}});
const campaign=(features,order=features.map(x=>x.id))=>({campaigns:[{id:'D01',upserts:features,order}]});
const stamp=(id,field)=>'/campaigns[id=D01]/upserts[id='+id+']/sheetIII/'+field;
test('mobile and tablet add sections independently while offline: no section lost',()=>{
 const base=campaign([section('S1')]),mobile=campaign([section('S1'),section('S2')]),tablet=campaign([section('S1'),section('S3')]);
 const merged=sync.merge(base,mobile,tablet);
 assert.equal(merged.conflicts.length,0);
 assert.deepEqual(new Set(merged.value.campaigns[0].upserts.map(x=>x.id)),new Set(['S1','S2','S3']));
 assert.deepEqual(new Set(merged.value.campaigns[0].order),new Set(['S1','S2','S3']));
 const repeat=sync.merge(merged.value,merged.value,merged.value);
 assert.equal(repeat.conflicts.length,0);
 assert.equal(JSON.stringify(repeat.value),JSON.stringify(merged.value));
});
test('independent changes to different fields in the same section both survive',()=>{
 const base=campaign([section('S1',{observations:'',sectionType:''})]);
 const mobile=campaign([section('S1',{observations:'field observation',sectionType:''})]);
 const tablet=campaign([section('S1',{observations:'',sectionType:'cross-section'})]);
 const result=sync.merge(base,mobile,tablet);
 assert.equal(result.conflicts.length,0);
 assert.equal(result.value.campaigns[0].upserts[0].sheetIII.observations,'field observation');
 assert.equal(result.value.campaigns[0].upserts[0].sheetIII.sectionType,'cross-section');
});
test('same field edited twice: reliably newer value wins in either direction',()=>{
 const now=Date.now(),field=stamp('S1','observations');
 const base=campaign([section('S1',{observations:'initial'})]);
 const mobile=campaign([section('S1',{observations:'mobile'})]);
 const tablet=campaign([section('S1',{observations:'tablet'})]);
 let result=sync.merge(base,mobile,tablet,{editTimes:{local:{[field]:now-10000},remote:{[field]:now-30000}}});
 assert.equal(result.conflicts.length,0);assert.equal(result.value.campaigns[0].upserts[0].sheetIII.observations,'mobile');
 result=sync.merge(base,mobile,tablet,{editTimes:{local:{[field]:now-30000},remote:{[field]:now-10000}}});
 assert.equal(result.conflicts.length,0);assert.equal(result.value.campaigns[0].upserts[0].sheetIII.observations,'tablet');
});
test('missing or nearly identical timestamps never guess a winner',()=>{
 const now=Date.now(),field=stamp('S1','observations');
 const base=campaign([section('S1',{observations:'initial'})]);
 const mobile=campaign([section('S1',{observations:'mobile'})]);
 const tablet=campaign([section('S1',{observations:'tablet'})]);
 assert.equal(sync.merge(base,mobile,tablet).conflicts.length,1);
 assert.equal(sync.merge(base,mobile,tablet,{editTimes:{local:{[field]:now-5000},remote:{[field]:now-5100}}}).conflicts.length,1);
});
test('a deletion versus an edit is never auto-resolved by timestamps',()=>{
 const base=campaign([section('S1',{observations:'initial'})]);
 const mobile=campaign([]),tablet=campaign([section('S1',{observations:'changed on tablet'})]);
 const result=sync.merge(base,mobile,tablet,{editTimes:{local:{'/campaigns[id=D01]/upserts[id=S1]':Date.now()},remote:{[stamp('S1','observations')]:Date.now()-20000}}});
 assert.ok(result.conflicts.length>0);
});
test('different reorderings use the newer order while preserving independent new IDs',()=>{
 const now=Date.now();
 const base=campaign([section('A'),section('B'),section('C')]);
 const mobile=campaign([section('A'),section('B'),section('C'),section('D')],['B','A','C','D']);
 const tablet=campaign([section('A'),section('B'),section('C'),section('E')],['A','C','B','E']);
 const result=sync.merge(base,mobile,tablet,{editTimes:{local:{'/campaigns[id=D01]/order':now-9000},remote:{'/campaigns[id=D01]/order':now-3000}}});
 assert.equal(result.conflicts.length,0);
 assert.equal(result.value.campaigns[0].upserts.length,5);
 assert.equal(JSON.stringify(result.value.campaigns[0].order),JSON.stringify(['A','C','B','E','D']));
});
test('the delta engine remains pure and never mutates device data',()=>{
 const base=campaign([section('S1')]),mobile=campaign([section('S1'),section('S2')]),tablet=campaign([section('S1'),section('S3')]);
 const before=JSON.stringify({base,mobile,tablet});
 sync.merge(base,mobile,tablet);
 assert.equal(JSON.stringify({base,mobile,tablet}),before);
});

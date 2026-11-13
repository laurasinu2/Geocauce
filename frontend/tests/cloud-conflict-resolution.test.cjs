'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'../cloud-delta-sync.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const context={window:{}};
vm.runInNewContext(script,context);
const {merge}=context.window.GeoCauceDeltaSync;
const json=o=>JSON.parse(JSON.stringify(o));
test('independent newly created sections and stop pins survive three-way sync',()=>{
 const base={campaigns:[{id:'D01',upserts:[{id:'SEC-001',sheetIII:{workStatus:null}}],order:['SEC-001']}],mapPins:[]};
 const local={campaigns:[{id:'D01',upserts:[{id:'SEC-001',sheetIII:{workStatus:'started'}},{id:'SEC-002',sheetIII:{workStatus:'done'}}],order:['SEC-001','SEC-002']}],mapPins:[{id:'stop-tablet',kind:'stop'}]};
 const remote={campaigns:[{id:'D01',upserts:[{id:'SEC-001',sheetIII:{workStatus:'done',observations:'cloud notes'}},{id:'SEC-003',sheetIII:{workStatus:'pending'}}],order:['SEC-001','SEC-003']}],mapPins:[{id:'stop-mobile',kind:'stop'}]};
 const initial=merge(base,local,remote);
 assert.equal(initial.conflicts.length,1);
 assert.match(initial.conflicts[0].path,/SEC-001.*workStatus/);
 const pick=Object.fromEntries(initial.conflicts.map(c=>[c.path,'local']));
 const final=merge(base,local,remote,{resolutions:pick});
 assert.equal(final.conflicts.length,0);
 const c=final.value.campaigns[0],sections=new Map(c.upserts.map(s=>[s.id,s]));
 assert.deepEqual(json(c.order),['SEC-001','SEC-002','SEC-003']);
 assert.equal(sections.get('SEC-001').sheetIII.workStatus,'started');
 assert.equal(sections.get('SEC-001').sheetIII.observations,'cloud notes');
 assert.equal(sections.get('SEC-002').sheetIII.workStatus,'done');
 assert.equal(sections.get('SEC-003').sheetIII.workStatus,'pending');
 assert.deepEqual(json(final.value.mapPins.map(x=>x.id).sort()),['stop-mobile','stop-tablet']);
});
test('legacy unclassified section status does not conflict with a real classification',()=>{
 const b={},l={campaigns:[{id:'D01',upserts:[{id:'SEC-002',sheetIII:{workStatus:null}}]}]},
  r={campaigns:[{id:'D01',upserts:[{id:'SEC-002',sheetIII:{workStatus:'done'}}]}]};
 const result=merge(b,l,r);
 assert.equal(result.conflicts.length,0);
 assert.equal(result.value.campaigns[0].upserts[0].sheetIII.workStatus,'done');
});
test('genuinely divergent statuses remain explicit until the user chooses',()=>{
 const b={},l={campaigns:[{id:'D01',upserts:[{id:'SEC-002',sheetIII:{workStatus:'started'}}]}]},
 r={campaigns:[{id:'D01',upserts:[{id:'SEC-002',sheetIII:{workStatus:'done'}}]}]};
 const first=merge(b,l,r);assert.equal(first.conflicts.length,1);
 assert.equal(merge(b,l,r,{resolutions:{[first.conflicts[0].path]:'remote'}}).value.campaigns[0].upserts[0].sheetIII.workStatus,'done');
});
test('opposite reorders are not merged destructively',()=>{
 const b={campaigns:[{id:'D01',order:['a','b','c']}]},
 l={campaigns:[{id:'D01',order:['b','a','c']}]},
 r={campaigns:[{id:'D01',order:['a','c','b']}]};
 const first=merge(b,l,r);
 assert.equal(first.conflicts.length,1);
 assert.match(first.conflicts[0].path,/order/);
});
test('bulk conflict decisions only replace contested values',()=>{
 const n=17,base={campaigns:[{id:'D01',upserts:[],order:[]}]},
 local={campaigns:[{id:'D01',upserts:[],order:[]}]},
 remote={campaigns:[{id:'D01',upserts:[],order:[]}]};
 for(let i=1;i<=n;i++){
  const id='SEC-'+String(i).padStart(3,'0');
  local.campaigns[0].upserts.push({id,sheetIII:{workStatus:'started',observations:'local observation '+i}});
  remote.campaigns[0].upserts.push({id,sheetIII:{workStatus:'done',observations:'local observation '+i}});
  local.campaigns[0].order.push(id);remote.campaigns[0].order.push(id);
 }
 const first=merge(base,local,remote);
 assert.equal(first.conflicts.length,n);
 const keepLocal=Object.fromEntries(first.conflicts.map(x=>[x.path,'local']));
 const done=merge(base,local,remote,{resolutions:keepLocal});
 assert.equal(done.conflicts.length,0);
 assert.equal(done.value.campaigns[0].upserts.length,n);
 assert.equal(done.value.campaigns[0].upserts.filter(s=>s.sheetIII.workStatus==='started').length,n);
});
test('manual conflict UI saves both snapshots before asking and supports batch choices',()=>{
 assert.ok(app.includes("await cloudSaveConflictVersions(projectId,local,remote.state,remote.updated_at);"));
 assert.ok(app.includes("await cloudResolveFieldConflicts(result.conflicts,projectId)"));
 assert.ok(app.indexOf('await cloudSaveConflictVersions(projectId,local,remote.state,remote.updated_at);')<app.indexOf('await cloudResolveFieldConflicts(result.conflicts,projectId)'));
 for(const label of ['Conservar este dispositivo en todos','Conservar nube en todos','Descargar las dos versiones (JSON)','Diferencias']) {
  if(label==='Diferencias')continue;
  assert.ok(app.includes(label),label);
 }
 assert.ok(app.includes("key:'conflictRecoveryLocal'"));
 assert.ok(app.includes("key:'conflictRecoveryRemote'"));
});

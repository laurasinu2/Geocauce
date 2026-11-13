'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../cloud-delta-sync.js'),'utf8');
const context={window:{},Date,JSON,Set,Map,Symbol,Object,Array,Number,String,Math};
vm.runInNewContext(source,context);
const api=context.window.GeoCauceDeltaSync;
const NOW=Date.now();
const PATH='/campaigns[id=D01]/upserts[id=SEC-004]/sheetIII/workStatus';
const status=x=>({campaigns:[{id:'D01',upserts:[{id:'SEC-004',sheetIII:{workStatus:x}}]}]});
const order=arr=>({campaigns:[{id:'D01',order:arr}]});
const getStatus=r=>r.value.campaigns[0].upserts[0].sheetIII.workStatus;
const getOrder=r=>[...r.value.campaigns[0].order];
test('a newer remote field wins over an older local edit',()=>{
 const result=api.merge(status('started'),status('pending'),status('done'),{editTimes:{local:{[PATH]:NOW-50000},remote:{[PATH]:NOW-10000}}});
 assert.equal(result.conflicts.length,0);
 assert.equal(getStatus(result),'done');
 assert.equal(result.autoResolved[0].choice,'remote');
});
test('a newer local field wins over an older cloud edit',()=>{
 const result=api.merge(status('started'),status('pending'),status('done'),{editTimes:{local:{[PATH]:NOW-10000},remote:{[PATH]:NOW-50000}}});
 assert.equal(result.conflicts.length,0);
 assert.equal(getStatus(result),'pending');
 assert.equal(result.autoResolved[0].choice,'local');
});
test('legacy local edit after cloud snapshot can be selected safely',()=>{
 const result=api.merge(status('started'),status('pending'),status('done'),{legacy:{localQueue:{[PATH]:NOW-10000},remoteSnapshotAt:NOW-70000}});
 assert.equal(result.conflicts.length,0);
 assert.equal(getStatus(result),'pending');
});
test('cloud snapshot date is not mistaken for actual edit date',()=>{
 const result=api.merge(status('started'),status('pending'),status('done'),{legacy:{localQueue:{[PATH]:NOW-70000},remoteSnapshotAt:NOW-10000}});
 assert.equal(result.conflicts.length,1);
});
test('ambiguous timestamps and conflicting old fields remain manual',()=>{
 assert.equal(api.merge(status('started'),status('pending'),status('done')).conflicts.length,1);
 assert.equal(api.merge(status('started'),status('pending'),status('done'),{editTimes:{local:{[PATH]:NOW-5000},remote:{[PATH]:NOW-5800}}}).conflicts.length,1);
});
test('independent section additions merge without dropping IDs',()=>{
 const result=api.merge(order(['A']),order(['A','B']),order(['A','C']));
 assert.equal(result.conflicts.length,0);
 assert.deepEqual(getOrder(result),['A','B','C']);
});
test('when order conflicts, most recently edited order wins but retains all sections',()=>{
 const orderPath='/campaigns[id=D01]/order';
 const result=api.merge(order(['A','B','C']),order(['B','A','C','L']),order(['A','C','B','R']),{editTimes:{local:{[orderPath]:NOW-50000},remote:{[orderPath]:NOW-10000}}});
 assert.equal(result.conflicts.length,0);
 assert.deepEqual(getOrder(result),['A','C','B','R','L']);
});
test('conflicting reorder with no trustworthy time stays manual',()=>{
 const result=api.merge(order(['A','B','C']),order(['B','A','C']),order(['A','C','B']));
 assert.equal(result.conflicts.length,1);
});
test('deleting a section on one device and editing it on another stays manual',()=>{
 const base={campaigns:[{id:'D01',upserts:[{id:'SEC-1',name:'Original'}]}]};
 const local={campaigns:[{id:'D01',upserts:[]}]};
 const remote={campaigns:[{id:'D01',upserts:[{id:'SEC-1',name:'Edited'}]}]};
 const result=api.merge(base,local,remote,{editTimes:{local:{'/campaigns[id=D01]/upserts[id=SEC-1]':NOW-1000},remote:{'/campaigns[id=D01]/upserts[id=SEC-1]/name':NOW-2000}}});
 assert.ok(result.conflicts.length>0);
});

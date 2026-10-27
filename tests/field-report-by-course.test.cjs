'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const begin=source.indexOf('function fieldReportCampaignFeatures(');
const end=source.indexOf('function fieldReportNarrativeReach(',begin);
assert.ok(begin>=0&&end>begin);
const code=source.slice(begin,end);
function collect(state){
 const fn=new Function('state','reachProfileInterval','fieldReportCourse',code+';return fieldReportCollect;');
 return fn(state,(_,r)=>({from:r.startAlong,to:r.endAlong}),f=>state.features.find(c=>c.id===f.courseId));
}
test('Full report sorts reach by longitudinal position, not creation or name',()=>{
 const state={campaign:'D2',campaigns:[],features:[
  {id:'C',type:'watercourse',name:'Torrent',longitudinalProfile:{segments:[{}]}},
  {id:'R2',type:'reach',courseId:'C',reachCode:'Z',startAlong:80,endAlong:120},
  {id:'R1',type:'reach',courseId:'C',reachCode:'A',startAlong:10,endAlong:50},
  {id:'S',type:'section',reachId:'R1',courseId:'C'}
 ]};
 const data=collect(state)({mode:'course',courseId:'C'});
 assert.deepEqual(data.reports[0].rows.map(r=>r.reach.id),['R1','R2']);
 assert.equal(data.reports[0].rows[0].sections[0].id,'S');
});
test('Daily selection includes parent reach when only section was updated',()=>{
 const state={campaign:'D2',campaigns:[{id:'D2',upserts:[{id:'S'}]}],features:[
  {id:'C',type:'watercourse'},
  {id:'R',type:'reach',courseId:'C',startAlong:0,endAlong:30},
  {id:'S',type:'section',courseId:'C',reachId:'R',campaign:'D2'}
 ]};
 const data=collect(state)({mode:'day',campaignId:'D2'});
 assert.equal(data.reports[0].rows.length,1);
 assert.deepEqual(data.reports[0].rows[0].sections.map(x=>x.id),['S']);
});
test('Unassociated section is retained for review rather than assigned by proximity',()=>{
 const state={campaign:'D1',campaigns:[],features:[
  {id:'C',type:'watercourse'},
  {id:'S',type:'section',courseId:'C',campaign:'D1'}
 ]};
 const data=collect(state)({mode:'course',courseId:'C'});
 assert.deepEqual(data.unlinked.map(x=>x.id),['S']);
});

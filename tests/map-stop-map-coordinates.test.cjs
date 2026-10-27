'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function block(start,end){
 const i=src.indexOf(start),j=src.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,'Required function is missing: '+start);
 return src.slice(i,j);
}
test('A new stop uses clicked map coordinates without reading GNSS',()=>{
 const stopCode=block('function addMapStopAt(','function mapStopById(');
 assert.ok(!stopCode.includes('fieldFreshGnssForStop('));
 assert.ok(!stopCode.includes('navigator.geolocation'));
 let saves=0,draws=0,projections=0;
 const state={campaign:'D01',gnss:{x:999,y:888,lat:41.61,lon:1.85,accuracy:2},mapPins:[],activeFieldStopId:null};
 const compiled=new Function('state','prompt','requireEditable','cloneAny','persistState','drawAll','toast','nextStopLabel','projectCrsEpsg','workingMapEpsg','utmZoneForEpsg','lonLatToMapCoords',
   block('function fieldStopPosition(','async function fieldFreshGnssForStop(')+'\n'+stopCode+'\nreturn addMapStopAt;');
 const add=compiled(state,(_,label)=>label,()=>true,value=>JSON.parse(JSON.stringify(value)),
  ()=>saves++,()=>draws++,()=>{},()=>('Parada '+(state.mapPins.length+1)),
  ()=>25831,()=>25831,()=>31,()=>{projections++;throw Error('Unexpected GNSS projection');});
 add({x:404193,y:4607180});
 add({x:404300,y:4607300});
 assert.equal(state.mapPins.length,2);
 assert.equal(state.mapPins[0].x,404193);
 assert.equal(state.mapPins[0].y,4607180);
 assert.equal(state.mapPins[0].position.source,'map');
 assert.equal(state.mapPins[0].position.crs,25831);
 assert.equal(state.mapPins[0].position.utmX,404193);
 assert.equal(state.mapPins[0].position.utmY,4607180);
 assert.equal(state.mapPins[1].x,404300);
 assert.equal(state.mapPins[1].position.x,404300);
 assert.equal(state.activeFieldStopId,state.mapPins[1].id);
 assert.equal(state.mapPins[0].position.accuracy,undefined);
 assert.equal(state.mapPins[0].gnssPending,undefined);
 assert.equal(projections,0);
 assert.equal(saves,2);
 assert.equal(draws,2);
});

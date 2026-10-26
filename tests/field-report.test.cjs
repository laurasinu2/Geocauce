'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function fragment(a,b){
 const x=src.indexOf(a),y=src.indexOf(b,x+a.length);
 assert.ok(x>=0&&y>x,'No es troba el bloc '+a);
 return src.slice(x,y);
}
function evaluate(source,context,expression){
 const env=vm.createContext({...context});
 return vm.runInContext(source+'\n('+expression+')',env);
}
test('L’aplicació manté sintaxi JavaScript vàlida',()=>assert.doesNotThrow(()=>new Function(src)));
test('La parada activa és independent de la parada oberta a la finestra',()=>{
 const state={campaign:'D01',currentStopId:'other',activeFieldStopId:'s2',
  mapPins:[{id:'s1',kind:'stop',campaignId:'D01',createdAt:1},{id:'s2',kind:'stop',campaignId:'D01',createdAt:2}],features:[]};
 const get=evaluate(fragment('function fieldActiveStop(','function addMapStopAt('),
  {state,projectCrsEpsg:()=>25831,workingMapEpsg:()=>25831,utmZoneForEpsg:()=>31,lonLatToMapCoords:()=>({x:404193,y:4607180})},
  '({fieldActiveStop,fieldStopPosition})');
 assert.equal(get.fieldActiveStop().id,'s2');
 const gps=get.fieldStopPosition({x:20,y:30},{x:404193,y:4607180,lat:41.61,lon:1.85,altitude:702,accuracy:4,crs:25831});
 assert.equal(gps.mapPoint.x,404193);
 assert.equal(gps.position.altitude,702);
 assert.equal(gps.position.accuracy,4);
 const manual=get.fieldStopPosition({x:20,y:30},null);
 assert.equal(manual.position.lat,undefined);
 assert.equal(manual.position.accuracy,undefined);
});
test('La intersecció es calcula sobre els segments reals i no sobre el punt central',()=>{
 const state={features:[{id:'water',type:'watercourse',points:[{x:0,y:5},{x:10,y:5}]}]};
 const seg=(a,b,c,d)=>{const rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y,den=rx*sy-ry*sx;if(Math.abs(den)<1e-12)return null;const dx=c.x-a.x,dy=c.y-a.y,t=(dx*sy-dy*sx)/den,u=(dx*ry-dy*rx)/den;return t>=0&&t<=1&&u>=0&&u<=1?t:null;};
 const intersection=evaluate(fragment('function fieldSectionIntersection(','function createSectionFeature('),
 {state,segmentIntersectionT:seg,linePoint:(a,b,t)=>({x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)}),courseFragments:c=>[c.points],workingMapEpsg:()=>25831,projectCrsEpsg:()=>25831,utmZoneForEpsg:()=>31,lonLatToMapCoords:()=>({x:0,y:0})},'fieldSectionIntersection');
 const actual=intersection({points:[{x:3,y:0},{x:3,y:10}],courseId:'water'});
 assert.equal(actual.utmX,3);assert.equal(actual.utmY,5);
 assert.equal(intersection({points:[{x:3,y:11},{x:3,y:12}],courseId:'water'}),null);
});
test('Un punt històric prioritza stopId i la finestra temporal és el recurs alternatiu',()=>{
 const state={campaign:'D01',features:[{id:'c',type:'watercourse',name:'Torrent real'},{id:'s',type:'section',courseId:'c',stopId:'b',campaign:'D01'},{id:'old',type:'section',courseId:'c',campaign:'D00'}],mapPins:[],historicalPhotoPoints:[{id:'h',photos:['ph'],campaignId:'D01',createdAt:100}],notebook:{pages:[]}};
 const impl=evaluate(fragment('function fieldReportCourse(','function fieldReportEntries(')+fragment('function fieldReportItems(','async function fieldReportBuild('),
 {state},'({fieldReportStopFor,fieldReportItems})');
 const stops=[{id:'a',createdAt:100},{id:'b',createdAt:200}];
 assert.equal(impl.fieldReportStopFor({createdAt:150},stops,{historical:true}).id,'a');
 assert.equal(impl.fieldReportStopFor({stopId:'b',createdAt:150},stops,{historical:true}).id,'b');
 const items=impl.fieldReportItems(stops,[{id:'ph',historicalPointId:'h',date:250,stopId:'b',campaignId:'D01'}]);
 assert.equal(items.find(x=>x.kind==='historical').stop.id,'b');
 assert.equal(items.filter(x=>x.kind==='photo').length,0);
 assert.equal(items.some(x=>x.obj.id==='old'),false);
 assert.equal(items.find(x=>x.kind==='section').course.name,'Torrent real');
});
test('Informe local sense IA i PDF reutilitzant el motor existent',()=>{
 assert.ok(src.includes('window.GeoCauceFieldPdf.fromElements(pages)'));
 assert.ok(src.includes('fieldReportInit();'));
 assert.ok(src.includes('contenteditable="true"'));
 assert.ok(src.includes('Punt d’intersecció amb el canal no disponible.'));
 const source=fragment('// ---------- Informe de camp determinista','loadSectionPalette();loadProjectCatalog();initUi();');
 assert.equal(source.includes("cloudFetch("),false);
});

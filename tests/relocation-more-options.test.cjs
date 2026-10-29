'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');

test('Moving a section is offered inside More options, not below Abrir',()=>{
 const card=html.slice(html.indexOf('id="featureCard"'),html.indexOf('id="featureStyleModal"'));
 const more=card.indexOf('id="featureMoreMenu"');
 const move=card.indexOf('id="gcMoveFeatureMoreBtn"');
 const primary=card.indexOf('id="openSheetBtn"');
 assert.ok(primary>=0&&more>primary&&move>more);
 assert.ok(!card.includes('id="gcMoveFeatureBtn"'),'No duplicated primary move action');
 assert.equal(card.match(/id="gcMoveFeatureMoreBtn"/g)?.length,1);
 assert.match(card.slice(move,move+200),/Mover a otro punto/);
});

test('The secondary Move option calls the existing relocation feature',()=>{
 assert.match(app,/\$\('#gcMoveFeatureMoreBtn'\)\.onclick=moveSelectedFeature;/);
 assert.match(app,/beginPointRelocation\('feature',id\)/);
 assert.doesNotMatch(app,/\$\('#gcMoveFeatureBtn'\)/);
});

test('Material-only compact cards retain their separate Move control',()=>{
 assert.match(html,/id="gcMoveMaterialBtn"/);
 assert.match(app,/\$\('#gcMoveMaterialBtn'\)\.onclick=moveSelectedFeature;/);
 assert.match(css,/#featureCard\.feature-card-material-only #gcMoveMaterialBtn/);
});

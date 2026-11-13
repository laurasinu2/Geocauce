'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),app=fs.readFileSync(path.join(root,'app.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
test('Viewport has stable scale while map gesture handlers remain installed',()=>{
 assert.match(html,/maximum-scale=1/);
 assert.match(html,/user-scalable=no/);
 assert.match(app,/function installSectionViewportGestures\(/);
 assert.match(app,/function installNotebookViewportGestures\(/);
 assert.match(app,/function installPhotoEditorInteractions\(/);
});
test('Historical photo opens fullscreen viewer and keeps navigation',()=>{
 assert.match(html,/id="historicalPhotoEnlarge"/);
 assert.match(app,/gcOpenPhotoLightbox\(main\.src/);
 assert.match(app,/historicalPhotoPrev/);
 assert.match(app,/historicalPhotoNext/);
 assert.match(app,/gcPhotoLightbox\?\.close\(\);state\.currentHistoricalPointId/);
});
test('Fullscreen photo has pinch, pan, close and no project writes',()=>{
 const start=app.indexOf('function gcOpenPhotoLightbox('),end=app.indexOf('let historicalPhotoObjectUrls=',start);
 assert.ok(start>0&&end>start);
 const source=app.slice(start,end);
 assert.match(source,/pointermove/);
 assert.match(source,/scale\*after\/before/);
 assert.match(source,/gcLightboxClose/);
 assert.doesNotMatch(source,/persistState\(|dbPut\(/);
 assert.match(css,/\.gc-lightbox-viewport\{[^}]*touch-action:none/);
});

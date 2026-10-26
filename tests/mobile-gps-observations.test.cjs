'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const mobile=fs.readFileSync(path.join(__dirname,'../mobile-pwa.js'),'utf8');
test('mobile and core scripts parse',()=>{assert.doesNotThrow(()=>new Function(app));assert.doesNotThrow(()=>new Function(mobile));});
test('mobile observation sheet only offers six requested tools',()=>{
 const markup=mobile.match(/sheet\.innerHTML=\`([\s\S]*?)\`;/)?.[1];
 assert.ok(markup,'observation menu missing');
 for(const tool of ['gps','photo','historicalPhoto','stop','pan','select'])assert.ok(markup.includes('data-observation-tool="'+tool+'"'),tool);
 for(const tool of ['section','boundary','watercourse'])assert.ok(!markup.includes('data-observation-tool="'+tool+'"'),tool);
});
test('GPS tool creates a persistent pin and photo tool launches picker directly',()=>{
 assert.ok(app.includes("kind:'gps'"));
 assert.ok(app.includes('state.mapPins.push(pin)'));
 assert.ok(app.includes('mobileRegisterGpsPoint,'));
 assert.ok(app.includes('mobileCapturePhoto,'));
 assert.ok(mobile.includes("if(tool==='gps'){await api.mobileRegisterGpsPoint();return;}"));
 assert.ok(mobile.includes("api.mobileCapturePhoto();"));
 assert.ok(app.includes("'geocauce-photo-saved'"));
});
test('tablet GPS permission, unavailable location and timeout errors are surfaced',()=>{
 for(const message of ['Ubicación denegada','No se pudo determinar la posición','Tiempo de espera del GPS agotado','HTTPS'])assert.ok(app.includes(message),message);
 assert.ok(app.includes("appSettings.inputMode==='pen' && state.tool!=='stop'"));
});

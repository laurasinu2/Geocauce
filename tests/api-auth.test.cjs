const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const start=app.indexOf('async function cloudFetch('),end=app.indexOf('function cloudObjectPath(',start);
assert.ok(start>=0&&end>start);
const code=app.slice(start,end);
function harness({session=null,expired=false,respond=async()=>({ok:true,text:async()=>'[]'})}={}){
 const calls=[];
 const fakeFetch=async(url,opts)=>{calls.push([url,opts]);return respond(url,opts);};
 const context={
  cloudConfig:()=>({enabled:true,url:'https://example.supabase.co',key:'sb_publishable_test'}),
  loadCloudSession:()=>session,
  sessionExpired:()=>expired,
  refreshCloudSession:async()=>{throw new Error('Invalid refresh token')},
  fetch:fakeFetch,
  Error
 };
 vm.runInNewContext(code+';this.cloudFetch=cloudFetch',context);
 return {run:context.cloudFetch,calls};
}
test('protected PostgREST calls are blocked locally when no bearer token exists',async()=>{
 const h=harness();
 await assert.rejects(h.run('/rest/v1/projects'),/Sesión caducada/);
 assert.equal(h.calls.length,0);
});
test('protected calls reject stale tokens before attempting a network request',async()=>{
 const h=harness({session:{access_token:'expired-token'},expired:true});
 await assert.rejects(h.run('/rest/v1/project_snapshots'),/Sesión caducada/);
 assert.equal(h.calls.length,0);
});
test('protected project and Storage-adjacent metadata APIs forward bearer token',async()=>{
 const h=harness({session:{access_token:'valid-token',expires_at:9999999999}});
 await h.run('/rest/v1/rpc/geocauce_project_role',{method:'POST',body:{p_project_id:'project-123'}});
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0][1].headers.Authorization,'Bearer valid-token');
 assert.equal(h.calls[0][1].headers.apikey,'sb_publishable_test');
 assert.equal(h.calls[0][1].method,'POST');
 assert.equal(JSON.parse(h.calls[0][1].body).p_project_id,'project-123');
});
test('authentication entry point can send password sign-in without bearer token',async()=>{
 const h=harness();
 await h.run('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{email:'a@b.c',password:'x'}});
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0][1].headers.Authorization,undefined);
});
test('server denial is propagated rather than silently accepting unauthorized edits',async()=>{
 const h=harness({
  session:{access_token:'token',expires_at:9999999999},
  respond:async()=>({ok:false,status:403,text:async()=>JSON.stringify({message:'permission denied',code:'42501'})})
 });
 await assert.rejects(h.run('/rest/v1/project_snapshots',{method:'PATCH'}),/permission denied/);
});

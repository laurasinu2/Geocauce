const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const first=app.indexOf('function cloudRoleRpcMissing(');
const last=app.indexOf('function canEditProjectInUi(',first);
assert.ok(first>=0&&last>first,'expected standalone role helpers');
const code=app.slice(first,last);
const projectId='11111111-1111-4111-8111-111111111111';
const user='22222222-2222-4222-8222-222222222222';
function create({missing=true,permissions={},rpcError=null}={}){
 const calls=[];
 const ctx={
  sessionUser:()=>({id:user}),
  isUuid:id=>/^[0-9a-f-]{36}$/.test(id),
  navigator:{onLine:true},
  saveProjectCatalog:()=>{},
  cloudFetch:async(path,{body}={})=>{
   calls.push({path,body});
   if(path.endsWith('/geocauce_project_role')){
    if(rpcError)throw rpcError;
    if(missing)throw Object.assign(new Error('Could not find the function public.geocauce_project_role(p_project_id) in the schema cache'),{status:404,code:'PGRST202'});
    return 'viewer';
   }
   return permissions[path.split('/').pop()]??false;
  }
 };
 vm.runInNewContext(code+';this.getRole=cloudProjectRole;this.isMissing=cloudRoleRpcMissing;',ctx);
 return {ctx,calls,project:{id:projectId,cloudProjectId:projectId,ownerUserId:user}};
}
for(const [name,perms,expected] of [
 ['owner',{geocauce_is_project_owner:true},'owner'],
 ['editor',{geocauce_is_project_owner:false,geocauce_can_edit_project:true},'editor'],
 ['viewer',{geocauce_is_project_owner:false,geocauce_can_edit_project:false,geocauce_can_view_project:true},'viewer'],
 ['no membership',{},null]
]){
 test('legacy Supabase JWT authorization: '+name,async()=>{
  const h=create({permissions:perms});
  assert.equal(await h.ctx.getRole(h.project),expected);
  assert.equal(h.project._sharedRole,expected);
  assert.ok(h.calls[0].path.endsWith('geocauce_project_role'));
  assert.ok(h.calls.every(c=>c.path.startsWith('/rest/v1/rpc/')));
  assert.ok(h.calls.filter(c=>c.path!=='/rest/v1/rpc/geocauce_project_role').every(c=>c.body.p_project===projectId));
 });
}
test('permission-denied RPC does not silently fall back',async()=>{
 const h=create({rpcError:Object.assign(new Error('permission denied'),{status:403,code:'42501'})});
 await assert.rejects(h.ctx.getRole(h.project),/permission denied/);
 assert.equal(h.calls.length,1);
});
test('a deployed new-role RPC takes precedence',async()=>{
 const h=create({missing:false});
 assert.equal(await h.ctx.getRole(h.project),'viewer');
 assert.equal(h.calls.length,1);
});
test('invalid cloud identifiers are refused by the legacy fallback',async()=>{
 const h=create();
 h.project.id='not-a-uuid';
 h.project.cloudProjectId='not-a-uuid';
 await assert.rejects(h.ctx.getRole(h.project),/identificador cloud/);
});

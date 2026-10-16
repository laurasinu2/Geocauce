const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const routes=fs.readFileSync(path.join(root,'project-access.js'),'utf8');
const share=fs.readFileSync(path.join(root,'project-sharing-ui.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const sql=fs.readFileSync(path.join(root,'SUPABASE_PROJECT_SHARING_R28.sql'),'utf8');
function load(){
 const window={location:{pathname:'/',search:'?lang=es',hash:''}};
 vm.runInNewContext(routes,{window,URLSearchParams});
 return window.GeoCauceProjectAccess;
}
test('authorization roles are strictly ordered and do not grant edit via viewer links',()=>{
 const access=load();
 assert.equal(access.canView('viewer'),true);
 assert.equal(access.canEdit('viewer'),false);
 assert.equal(access.canEdit('editor'),true);
 assert.equal(access.canEdit('owner'),true);
 assert.equal(access.canShare('editor'),false);
 assert.equal(access.canShare('owner'),true);
 assert.equal(access.canView('admin'),false);
});
test('static Pages deep links preserve other query parameters and are reloadable',()=>{
 const access=load();
 assert.equal(access.routeUrl('1234','edit'), '/?lang=es&project=1234&mode=edit');
 assert.equal(access.routeUrl('1234','view'), '/?lang=es&project=1234');
 assert.equal(access.projectsUrl(), '/?lang=es');
 assert.equal(access.routeFromLocation({search:'?project=1234&mode=edit'}).mode,'edit');
 assert.equal(access.routeFromLocation({search:'?project=1234&mode=view'}).mode,'view');
 assert.equal(access.routeFromLocation({search:'?mode=edit'}),null);
});
test('authenticated API requires bearer token; app role comes from RPC, not URL',()=>{
 assert.match(app,/if\(auth&&\(!session\?\.access_token\|\|sessionExpired\(session\)\)\)throw/);
 assert.match(app,/\/rest\/v1\/rpc\/geocauce_project_role/);
 assert.match(app,/if\(!window\.GeoCauceProjectAccess\.canView\(role\)\)/);
 assert.match(app,/cloudProjectRole\(p\)/);
 assert.match(app,/if\(!canEditCurrentProject\(\)\).*permiso/);
 assert.match(app,/p\.ownerUserId\|\|uid,cloudId/);
 assert.doesNotMatch(app,/owner_user_id:uid,name:p\.name/);
});
test('project invitations use protected server RPCs and never accept role from a URL',()=>{
 assert.match(app,/geocauce_list_project_members/);
 assert.match(app,/geocauce_set_project_member/);
 assert.match(app,/geocauce_remove_project_member/);
 assert.match(share,/email\.type='email'/);
 assert.match(share,/textContent=text/);
 assert.doesNotMatch(share,/\.innerHTML\s*=/);
});
test('migration reuses the verified legacy membership schema with reversible soft deletion',()=>{
 assert.match(sql,/public\.project_persona/);
 assert.match(sql,/public\.personas/);
 assert.match(sql,/public\.rol_projecte/);
 assert.match(sql,/public\.geocauce_can_view_project/);
 assert.match(sql,/public\.geocauce_can_edit_project/);
 assert.match(sql,/public\.geocauce_is_project_owner/);
 assert.match(sql,/geocauce_my_project_roles/);
 assert.match(app,/rpc\/geocauce_my_project_roles/);
 assert.match(sql,/geocauce_project_role/);
 assert.match(sql,/geocauce_snapshot_owner_delete_gate/);
 assert.match(sql,/geocauce_assets_read_gate/);
 assert.match(sql,/geocauce_assets_insert_gate/);
 assert.match(sql,/geocauce_assets_update_gate/);
 assert.match(sql,/geocauce_assets_delete_gate/);
 assert.match(sql,/SECURITY DEFINER SET search_path = ''/);
 assert.match(sql,/p_role NOT IN \('viewer','editor'\)/);
 assert.match(sql,/deleted_at=now\(\)/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.doesNotMatch(sql,/CREATE TABLE IF NOT EXISTS public\.project_members/);
 assert.doesNotMatch(sql,/DROP TABLE/);
 assert.doesNotMatch(sql,/DELETE FROM public\.project_persona/);
 assert.doesNotMatch(sql,/service_role/);
});
test('PWA caches the access and sharing scripts before app.js',()=>{
 assert.ok(html.indexOf('project-access.js?v=20261016-sharing-r28')<html.indexOf('app.js?v=20261016-sharing-r28'));
 assert.ok(html.indexOf('project-sharing-ui.js?v=20261016-sharing-r28')<html.indexOf('app.js?v=20261016-sharing-r28'));
 assert.match(sw,/project-access\.js/);
 assert.match(sw,/project-sharing-ui\.js/);
 assert.doesNotThrow(()=>new vm.Script(app));
 assert.doesNotThrow(()=>new vm.Script(share));
});

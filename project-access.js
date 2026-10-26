/* GeoCauce project URL and role helpers. Security remains enforced by Supabase RLS.
 * Static GitHub Pages requires query routes; /project/:id/edit would 404 on reload.
 */
(function(root){
 'use strict';
 const roles=['viewer','editor','owner'];
 const canView=role=>roles.includes(role);
 const canEdit=role=>role==='owner'||role==='editor';
 const canShare=role=>role==='owner';
 function routeFromLocation(location){
  const params=new URLSearchParams(location.search||'');
  const id=params.get('project');
  const mode=params.get('mode')==='edit'?'edit':'view';
  return id?{id,mode}:null;
 }
 function routeUrl(id,mode='view',location=root.location){
  const query=new URLSearchParams(location.search||'');
  query.set('project',String(id));
  if(mode==='edit')query.set('mode','edit');else query.delete('mode');
  return (location.pathname||'/')+'?'+query.toString()+(location.hash||'');
 }
 function projectsUrl(location=root.location){
  const query=new URLSearchParams(location.search||'');
  query.delete('project');query.delete('mode');
  const tail=query.toString();
  return (location.pathname||'/')+(tail?'?'+tail:'')+(location.hash||'');
 }
 root.GeoCauceProjectAccess={canView,canEdit,canShare,routeFromLocation,routeUrl,projectsUrl};
})(typeof window!=='undefined'?window:globalThis);

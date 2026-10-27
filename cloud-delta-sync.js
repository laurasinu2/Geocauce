/* GeoCauce offline-first change merging. Pure data transformations, no IO.
   Stable-id objects merge at field level; independent appended IDs are additive.
   Disagreements about the SAME value remain explicit conflicts. */
(function(root){
 'use strict';
 const MISSING=Symbol('missing');
 const clone=v=>v===MISSING?MISSING:(v===undefined?undefined:JSON.parse(JSON.stringify(v)));
 const eq=(a,b)=>{
  if(a===MISSING||b===MISSING)return a===b;
  if(a===b)return true;
  if(typeof a!==typeof b||a===null||b===null||typeof a!=='object')return false;
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>eq(v,b[i]));
  const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();
  return ak.length===bk.length&&ak.every((k,i)=>k===bk[i]&&eq(a[k],b[k]));
 };
 const keyed=x=>Array.isArray(x)&&x.every(v=>v&&typeof v==='object'&&!Array.isArray(v)&&typeof v.id==='string'&&v.id.length>0)&&new Set(x.map(v=>v.id)).size===x.length;
 const plain=x=>x!==MISSING&&x!==null&&typeof x==='object'&&!Array.isArray(x);
 const pathName=xs=>xs.map(x=>x.startsWith('@')?'[id='+x.slice(1)+']':(x.startsWith('/')?x:('/'+x))).join('');
 const fields=['campaigns','notebook','mapInk','mapPins','historicalPhotoPoints','materialStyles','referenceLayers','demGroups','activeDemGroupId'];

 // Order arrays contain stable IDs. We can combine independent insertions
 // when both devices agree on the order of shared elements.
 const reconcileOrder=(local,remote)=>{
  if(!Array.isArray(local)||!Array.isArray(remote))return null;
  const valid=x=>x.every(v=>typeof v==='string'&&v.length>0)&&new Set(x).size===x.length;
  if(!valid(local)||!valid(remote))return null;
  const rs=new Set(remote),ls=new Set(local);
  if(!eq(local.filter(x=>rs.has(x)),remote.filter(x=>ls.has(x))))return null;
  const nodes=[...new Set([...local,...remote])],edges=new Map(nodes.map(v=>[v,new Set()])),degrees=new Map(nodes.map(v=>[v,0]));
  for(const arr of [local,remote])for(let i=1;i<arr.length;i++){
   const a=arr[i-1],b=arr[i];
   if(!edges.get(a).has(b)){edges.get(a).add(b);degrees.set(b,degrees.get(b)+1);}
  }
  const result=[],used=new Set();
  while(result.length<nodes.length){
   const free=nodes.find(v=>!used.has(v)&&degrees.get(v)===0);
   if(!free)return null;
   used.add(free);result.push(free);
   for(const v of edges.get(free))degrees.set(v,degrees.get(v)-1);
  }
  return result;
 };
 function merge(base,local,remote,options={}){
  const resolutions=options.resolutions||{};
  const conflicts=[],changed=[],autoResolved=[];
  const times=options.editTimes||{},legacy=options.legacy||{};
  const validTime=value=>{
   const n=typeof value==='string'&&isNaN(Number(value))?Date.parse(value):Number(value);
   // Ignore implausible clocks and never interpret an absent date as 1970.
   return Number.isFinite(n)&&n>1577836800000&&n<Date.now()+300000?n:0;
  };
  const latest=path=>{
   const local=validTime(times.local?.[path]),remote=validTime(times.remote?.[path]);
   if(local&&remote&&Math.abs(local-remote)>=2000)
    return {path,choice:local>remote?'local':'remote',localAt:local,remoteAt:remote,source:'field'};
   // For old field sheets the remote snapshot time is NOT the last field
   // edit. It only proves the edit already existed by the snapshot date.
   // Thus we may prefer a known later local edit, never infer remote wins.
   if(!remote&&(/\/sheetIII\/workStatus$|\/order$/).test(path)){
    const queued=validTime(legacy.localQueue?.[path])||local;
    const lastRemoteSave=validTime(legacy.remoteSnapshotAt);
    if(queued&&lastRemoteSave&&queued>lastRemoteSave+2000)
     return {path,choice:'local',localAt:queued,remoteAt:lastRemoteSave,source:'snapshot-before-local'};
   }
   return null;
  };
  const resolve=(b,l,r,p)=>{
   if(eq(l,r))return clone(l);
   if(eq(b,l))return clone(r);
   if(eq(b,r))return clone(l);
   const path=pathName(p),explicit=resolutions[path];
   const orderPath=p[0]==='campaigns'&&p[p.length-1]==='order';
   const orderList=orderPath&&Array.isArray(l)&&Array.isArray(r);
   const orderDelete=orderList&&Array.isArray(b)&&b.some(id=>!l.includes(id)||!r.includes(id));
   if(orderList&&explicit==='local'||orderList&&explicit==='remote'){
    // Honour which device removed a previously-known ID, but keep new IDs
    // created independently by the other device.
    const preferred=explicit==='local'?l:r,other=explicit==='local'?r:l;
    const out=[...preferred];for(const id of other)
     if((!Array.isArray(b)||!b.includes(id))&&!out.includes(id))out.push(id);
    return clone(out);
   }
   if(orderList&&!orderDelete){
    const combined=reconcileOrder(l,r);
    if(combined!==null)return combined;
    // When both sides reordered the same set differently, prefer a reliably
    // newer order and append IDs created on the other device.
    const decision=latest(path);
    if(decision){
     autoResolved.push(decision);
     const preferred=decision.choice==='local'?l:r,other=decision.choice==='local'?r:l;
     const out=[...preferred];for(const id of other)if(!out.includes(id))out.push(id);
     return clone(out);
    }
   }
   if(l===MISSING||r===MISSING){
    if(resolutions[pathName(p)]==='local')return clone(l);
    if(resolutions[pathName(p)]==='remote')return clone(r);
    conflicts.push({path:pathName(p),local:l===MISSING?null:clone(l),remote:r===MISSING?null:clone(r),type:'delete-versus-edit'});return clone(l);
   }
   if(plain(l)&&plain(r)&&(plain(b)||b===MISSING)){
    const out={},keys=new Set([...Object.keys(b===MISSING?{}:b),...Object.keys(l),...Object.keys(r)]);
    for(const k of keys){const value=resolve(Object.prototype.hasOwnProperty.call(b===MISSING?{}:b,k)?b[k]:MISSING,Object.prototype.hasOwnProperty.call(l,k)?l[k]:MISSING,Object.prototype.hasOwnProperty.call(r,k)?r[k]:MISSING,[...p,k]);if(value!==MISSING)out[k]=value;}
    return out;
   }
   if(Array.isArray(l)&&Array.isArray(r)&&((b===MISSING)||Array.isArray(b))){
    const baseArray=b===MISSING?[]:b;
    if(keyed(l)&&keyed(r)&&keyed(baseArray)){
     const lm=new Map(l.map(x=>[x.id,x])),rm=new Map(r.map(x=>[x.id,x])),bm=new Map(baseArray.map(x=>[x.id,x])),ordered=[...new Set([...baseArray,...r,...l].map(x=>x.id))],out=[];
     for(const id of ordered){const value=resolve(bm.has(id)?bm.get(id):MISSING,lm.has(id)?lm.get(id):MISSING,rm.has(id)?rm.get(id):MISSING,[...p,'@'+id]);if(value!==MISSING)out.push(value);}
     return out;
    }
    const simple=x=>x.every(v=>['string','number','boolean'].includes(typeof v))&&new Set(x.map(v=>typeof v+':'+String(v))).size===x.length;
    if(!orderPath&&simple(l)&&simple(r)&&simple(baseArray)&&baseArray.every(v=>l.includes(v)&&r.includes(v))){
      return [...new Set([...baseArray,...r,...l])];
    }
   }
   if(explicit==='local')return clone(l);
   if(explicit==='remote')return clone(r);
   // Merge objects and stable-ID collections before considering timestamps.
   // Selecting a whole recently-saved object would discard independent edits
   // made to another field on the other device.
   if(!orderList&&!plain(l)&&!plain(r)&&!Array.isArray(l)&&!Array.isArray(r)){
    const decision=latest(path);
    if(decision){autoResolved.push(decision);return clone(decision.choice==='local'?l:r);}
   }
   // A legacy unclassified sheet has no asserted field condition.
   if(b===MISSING&&p[0]==='campaigns'&&p[p.length-1]==='workStatus'&&p.includes('sheetIII')){
    const unclassified=v=>v===MISSING||v===null||v==='';
    const valid=v=>['pending','started','done'].includes(v);
    if(unclassified(l)&&valid(r))return clone(r);
    if(unclassified(r)&&valid(l))return clone(l);
   }
   conflicts.push({path,local:clone(l),remote:clone(r),type:'concurrent-edit'});
   return clone(l);
  };
  const result={...clone(remote||{})};
  for(const key of fields){
   const has=x=>x&&Object.prototype.hasOwnProperty.call(x,key);
   const value=resolve(has(base)?base[key]:MISSING,has(local)?local[key]:MISSING,has(remote)?remote[key]:MISSING,[key]);
   if(value!==MISSING)result[key]=value;else delete result[key];
   if(!eq(value,has(remote)?remote[key]:MISSING))changed.push(key);
  }
  return {value:result,conflicts,changed,autoResolved};
 }
 function diff(before,after){
  const operations=[];
  const walk=(a,b,p)=>{
   if(eq(a,b))return;
   if(plain(a)&&plain(b)){
    for(const k of new Set([...Object.keys(a),...Object.keys(b)]))
     walk(Object.prototype.hasOwnProperty.call(a,k)?a[k]:MISSING,Object.prototype.hasOwnProperty.call(b,k)?b[k]:MISSING,[...p,k]);
    return;
   }
   if(Array.isArray(a)&&Array.isArray(b)&&keyed(a)&&keyed(b)){
    const am=new Map(a.map(x=>[x.id,x])),bm=new Map(b.map(x=>[x.id,x]));
    for(const id of new Set([...am.keys(),...bm.keys()]))
     walk(am.has(id)?am.get(id):MISSING,bm.has(id)?bm.get(id):MISSING,[...p,'@'+id]);
    return;
   }
   operations.push({path:pathName(p),kind:b===MISSING?'remove':a===MISSING?'add':'update'});
  };
  for(const key of fields)
   walk(before&&Object.prototype.hasOwnProperty.call(before,key)?before[key]:MISSING,after&&Object.prototype.hasOwnProperty.call(after,key)?after[key]:MISSING,[key]);
  return operations;
 }
 root.GeoCauceDeltaSync={merge,diff,fields};
})(typeof window!=='undefined'?window:globalThis);

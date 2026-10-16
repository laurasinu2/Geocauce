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
 const fields=['campaigns','notebook','mapInk','mapPins','historicalPhotoPoints','materialStyles','referenceLayers','demGroups','activeDemGroupId','sectionPalette','appSettings'];
 function merge(base,local,remote){
  const conflicts=[],changed=[];
  const resolve=(b,l,r,p)=>{
   if(eq(l,r))return clone(l);
   if(eq(b,l))return clone(r);
   if(eq(b,r))return clone(l);
   if(l===MISSING||r===MISSING){conflicts.push({path:pathName(p),local:l===MISSING?null:clone(l),remote:r===MISSING?null:clone(r),type:'delete-versus-edit'});return clone(l);}
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
    if(simple(l)&&simple(r)&&simple(baseArray)&&baseArray.every(v=>l.includes(v)&&r.includes(v))){
      return [...new Set([...baseArray,...r,...l])];
    }
   }
   conflicts.push({path:pathName(p),local:clone(l),remote:clone(r),type:'concurrent-edit'});
   return clone(l);
  };
  const result={...clone(remote||{})};
  for(const key of fields){
   const has=x=>x&&Object.prototype.hasOwnProperty.call(x,key);
   const value=resolve(has(base)?base[key]:MISSING,has(local)?local[key]:MISSING,has(remote)?remote[key]:MISSING,[key]);
   if(value!==MISSING)result[key]=value;else delete result[key];
   if(!eq(value,has(remote)?remote[key]:MISSING))changed.push(key);
  }
  return {value:result,conflicts,changed};
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

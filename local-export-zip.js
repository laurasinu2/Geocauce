/* Offline, dependency-free ZIP writer for GeoCauce's LOCAL exports only.
   Entries use standard ZIP STORE (method 0) and UTF-8 names. No project
   state, IndexedDB, network or Supabase access. */
(function(root){
  'use strict';
  const encoder=new TextEncoder();
  const table=new Uint32Array(256);
  for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);table[i]=c>>>0;}
  function cleanPath(input){
    const value=String(input??'').replace(/\\/g,'/');
    const chunks=value.split('/');
    if(!chunks.length||chunks.some(x=>!x||x==='.'||x==='..'||/[\x00-\x1f]/.test(x))||value.startsWith('/'))
      throw Error('Ruta ZIP insegura: '+value);
    return chunks.join('/');
  }
  async function crc32Blob(blob){
    let crc=0xffffffff;
    for(let off=0;off<blob.size;off+=1024*1024){
      const bytes=new Uint8Array(await blob.slice(off,off+1024*1024).arrayBuffer());
      for(let j=0;j<bytes.length;j++)crc=table[(crc^bytes[j])&255]^(crc>>>8);
    }
    return (crc^0xffffffff)>>>0;
  }
  function header(len,writer){
    const bytes=new Uint8Array(len),view=new DataView(bytes.buffer);
    writer(view);return bytes;
  }
  function createDosTimestamp(date){
    const d=date instanceof Date&&Number.isFinite(date.valueOf())?date:new Date();
    const y=Math.min(2107,Math.max(1980,d.getFullYear()));
    return {day:((y-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate(),time:(d.getHours()<<11)|(d.getMinutes()<<5)|Math.floor(d.getSeconds()/2)};
  }
  async function createZip(files,{onProgress}={}){
    if(!Array.isArray(files)||!files.length)throw Error('No hi ha fitxers per comprimir');
    const used=new Set(),parts=[],central=[];
    let offset=0,centralSize=0;
    const stamp=createDosTimestamp(new Date());
    for(let i=0;i<files.length;i++){
      const item=files[i],name=cleanPath(item.path),bytes=encoder.encode(name),blob=item.blob;
      if(used.has(name))throw Error('Nom de fitxer repetit al ZIP: '+name);
      used.add(name);
      if(!(blob instanceof Blob))throw Error('Exportació sense fitxer: '+name);
      if(bytes.length>0xffff||blob.size>0xffffffff||offset+30+bytes.length+blob.size>0xffffffff)
        throw Error('ZIP massa gran per a aquest dispositiu');
      const crc=await crc32Blob(blob),length=blob.size,localOffset=offset;
      const local=header(30,v=>{
        v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);
        v.setUint16(8,0,true);v.setUint16(10,stamp.time,true);v.setUint16(12,stamp.day,true);
        v.setUint32(14,crc,true);v.setUint32(18,length,true);v.setUint32(22,length,true);
        v.setUint16(26,bytes.length,true);v.setUint16(28,0,true);
      });
      parts.push(local,bytes,blob);offset+=local.length+bytes.length+length;
      const dir=header(46,v=>{
        v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);
        v.setUint16(8,0x0800,true);v.setUint16(10,0,true);v.setUint16(12,stamp.time,true);
        v.setUint16(14,stamp.day,true);v.setUint32(16,crc,true);v.setUint32(20,length,true);
        v.setUint32(24,length,true);v.setUint16(28,bytes.length,true);v.setUint16(30,0,true);
        v.setUint16(32,0,true);v.setUint16(34,0,true);v.setUint16(36,0,true);
        v.setUint32(38,0,true);v.setUint32(42,localOffset,true);
      });
      central.push(dir,bytes);centralSize+=dir.length+bytes.length;
      if(onProgress)await onProgress({current:i+1,total:files.length,name});
    }
    if(files.length>0xffff||offset+centralSize+22>0xffffffff)throw Error('Arxiu ZIP massa gran');
    parts.push(...central);
    parts.push(header(22,v=>{
      v.setUint32(0,0x06054b50,true);v.setUint16(4,0,true);v.setUint16(6,0,true);
      v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);
      v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
      v.setUint16(20,0,true);
    }));
    return new Blob(parts,{type:'application/zip'});
  }
  root.GeoCauceLocalZip={createZip,cleanPath};
})(typeof window!=='undefined'?window:globalThis);

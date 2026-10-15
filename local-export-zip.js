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

  // Generate offline PDFs from the application's already rendered page canvases.
  // PDF image objects contain genuine JPEG bytes (no HTML and no remote service).
  async function createPdfFromJpegs(pages){
    if(!Array.isArray(pages)||!pages.length)throw Error('No hi ha pàgines per crear el PDF');
    const objects=[
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((p,i)=>(3+i*3)+' 0 R').join(' ')+'] >>'
    ];
    for(let i=0;i<pages.length;i++){
      const pic=pages[i],blob=pic.blob;
      if(!(blob instanceof Blob)||blob.type!=='image/jpeg'||!Number.isFinite(pic.width)||!Number.isFinite(pic.height)||pic.width<=0||pic.height<=0)
        throw Error('Pàgina PDF sense imatge JPEG vàlida');
      const landscape=pic.width>pic.height,pageW=landscape?841.89:595.28,pageH=landscape?595.28:841.89;
      const scale=Math.min(pageW/pic.width,pageH/pic.height),drawW=(pic.width*scale).toFixed(3),drawH=(pic.height*scale).toFixed(3);
      const dx=((pageW-pic.width*scale)/2).toFixed(3),dy=((pageH-pic.height*scale)/2).toFixed(3);
      const pageId=3+i*3,imgId=pageId+1,contentId=pageId+2,name='Im'+i;
      const command='q\n'+drawW+' 0 0 '+drawH+' '+dx+' '+dy+' cm\n/'+name+' Do\nQ\n';
      objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+pageW+' '+pageH+'] /Resources << /XObject << /'+name+' '+imgId+' 0 R >> >> /Contents '+contentId+' 0 R >>');
      objects.push(['<< /Type /XObject /Subtype /Image /Width '+Math.round(pic.width)+' /Height '+Math.round(pic.height)+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+blob.size+' >>\nstream\n',blob,'\nendstream']);
      objects.push(['<< /Length '+encoder.encode(command).length+' >>\nstream\n',command,'endstream']);
    }
    const chunks=[],offsets=[0];
    let position=0;
    const append=part=>{chunks.push(part);position+=typeof part==='string'?encoder.encode(part).length:part.size??part.byteLength;};
    append(new Uint8Array([37,80,68,70,45,49,46,52,10,37,226,227,207,211,10]));
    for(let i=0;i<objects.length;i++){
      offsets.push(position);
      append((i+1)+' 0 obj\n');
      for(const piece of Array.isArray(objects[i])?objects[i]:[objects[i]])append(piece);
      append('\nendobj\n');
    }
    const xref=position;
    append('xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n');
    for(const off of offsets.slice(1))append(String(off).padStart(10,'0')+' 00000 n \n');
    append('trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
    return new Blob(chunks,{type:'application/pdf'});
  }
  async function createPdfFromImages(images){
    if(!Array.isArray(images)||!images.length)throw Error('No hi ha pàgines per crear el PDF');
    const pages=[];
    for(const source of images){
      if(typeof source!=='string'||!/^data:image\/(?:png|jpeg|webp);base64,/i.test(source))
        throw Error('Imatge de fitxa no vàlida per crear el PDF');
      const image=await new Promise((resolve,reject)=>{
        const pic=new Image();
        pic.onload=()=>resolve(pic);
        pic.onerror=()=>reject(Error('No s’ha pogut obrir una pàgina de la fitxa'));
        pic.src=source;
      });
      const ratio=Math.min(1,2000/Math.max(image.naturalWidth,image.naturalHeight));
      const width=Math.max(1,Math.round(image.naturalWidth*ratio)),height=Math.max(1,Math.round(image.naturalHeight*ratio));
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('El dispositiu no permet generar el PDF');
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
      ctx.drawImage(image,0,0,width,height);
      let blob=await new Promise(resolve=>canvas.toBlob?canvas.toBlob(resolve,'image/jpeg',.88):resolve(null));
      if(!blob){
        const data=canvas.toDataURL('image/jpeg',.88),encoded=data.split(',')[1];
        if(!encoded)throw Error('No es pot codificar una pàgina PDF');
        const raw=atob(encoded),bytes=new Uint8Array(raw.length);
        for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
        blob=new Blob([bytes],{type:'image/jpeg'});
      }
      canvas.width=canvas.height=0;
      pages.push({blob,width,height});
    }
    return createPdfFromJpegs(pages);
  }

  root.GeoCauceLocalZip={createZip,cleanPath,createPdfFromJpegs,createPdfFromImages};
})(typeof window!=='undefined'?window:globalThis);

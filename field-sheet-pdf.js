/* GeoCauce local field-sheet PDF renderer, r24.
   Vector text, vector form borders and lossless canvas content. No external
   libraries, network access, storage, or project writes. */
(function(root){
 'use strict';
 const enc=new TextEncoder(), A4_W=595.28,A4_H=841.89,MARGIN=25;
 const byteLength=v=>typeof v==='string'?enc.encode(v).length:v.size??v.byteLength;
 const cp1252={'€':128,'‚':130,'ƒ':131,'„':132,'…':133,'†':134,'‡':135,'ˆ':136,'‰':137,'Š':138,'‹':139,'Œ':140,'Ž':142,'‘':145,'’':146,'“':147,'”':148,'•':149,'–':150,'—':151,'˜':152,'™':153,'š':154,'›':155,'œ':156,'ž':158,'Ÿ':159};
 function pdfText(s){
  let out='';
  for(const c of String(s??'').replace(/[↑⬆]/g,'^').replace(/[↓⬇]/g,'v').replace(/[→➜]/g,'>').replace(/[←]/g,'<')){
   const point=c.codePointAt(0),n=cp1252[c]??(point<=255?point:63);
   out+=n.toString(16).padStart(2,'0');
  }
  return '<'+out+'>';
 }
 const num=n=>Number.isFinite(n)?(+n.toFixed(3)).toString():'0';
 function color(str){
  const m=String(str||'').match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s\/]+([\d.]+))?/);
  return m?[+m[1]/255,+m[2]/255,+m[3]/255,m[4]===undefined?1:+m[4]]:null;
 }
 function visible(style){
  return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity||1)>0;
 }
 function elementBox(el,rootBox){
  const b=el.getBoundingClientRect();
  return {x:b.left-rootBox.left,y:b.top-rootBox.top,w:b.width,h:b.height};
 }
 async function rgbImage(el){
  let w,h;
  if(el.tagName==='CANVAS'){w=el.width;h=el.height;}
  else{w=el.naturalWidth;h=el.naturalHeight;}
  if(!w||!h)return null;
  const factor=Math.min(1,2200/Math.max(w,h));
  w=Math.max(1,Math.round(w*factor));h=Math.max(1,Math.round(h*factor));
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const ctx=cv.getContext('2d',{willReadFrequently:true});
  if(!ctx)return null;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
  try{ctx.drawImage(el,0,0,w,h);}catch{return null;}
  const data=ctx.getImageData(0,0,w,h).data,bytes=new Uint8Array(w*h*3);
  for(let p=0,q=0;p<data.length;p+=4){
   const alpha=data[p+3]/255,white=255*(1-alpha);
   bytes[q++]=Math.round(data[p]*alpha+white);
   bytes[q++]=Math.round(data[p+1]*alpha+white);
   bytes[q++]=Math.round(data[p+2]*alpha+white);
  }
  cv.width=cv.height=0;
  if(typeof CompressionStream==='function'){
   const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
   return {w,h,data:new Uint8Array(await new Response(stream).arrayBuffer()),flate:true};
  }
  // Older browsers can still emit a valid PDF, without unsafe dependencies.
  return {w,h,data:bytes,flate:false};
 }
 function fragments(node,parent){
  const chunks=[],txt=node.nodeValue||'';
  const re=/\S+/g;let match;
  while((match=re.exec(txt))){
   const range=document.createRange();
   range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);
   const rect=range.getBoundingClientRect();
   if(rect.width>0&&rect.height>0)chunks.push({text:match[0],x:rect.x,y:rect.y,w:rect.width,h:rect.height,font:getComputedStyle(parent)});
  }
  return chunks;
 }
 async function collect(element){
  if(!element||element.nodeType!==1)throw Error('FITXA PDF: document no disponible');
  const box=element.getBoundingClientRect(),entries=[],images=[];
  async function walk(node){
   if(node.nodeType===3){
    const f=fragments(node,node.parentElement);
    for(const part of f){
     const c=color(part.font.color)||[0,0,0,1];
     entries.push({type:'text',x:part.x-box.x,y:part.y-box.y,h:part.h,value:part.text,
      size:parseFloat(part.font.fontSize)||13,font:/bold|[6-9]00/.test(part.font.fontWeight)?'bold':'normal',color:c});
    }
    return;
   }
   if(node.nodeType!==1)return;
   const st=getComputedStyle(node);if(!visible(st))return;
   const b=elementBox(node,box);
   if(b.w<=0||b.h<=0)return;
   const bg=color(st.backgroundColor);
   if(bg&&bg[3]>.01)entries.push({type:'fill',...b,color:bg});
   for(const [side,widthProp,colorProp] of [['top','borderTopWidth','borderTopColor'],['right','borderRightWidth','borderRightColor'],['bottom','borderBottomWidth','borderBottomColor'],['left','borderLeftWidth','borderLeftColor']]){
    const width=parseFloat(st[widthProp])||0,co=color(st[colorProp]);
    if(width>0&&co&&co[3]>.01)entries.push({type:'border',...b,side,width,color:co});
   }
   if(node.tagName==='CANVAS'||node.tagName==='IMG'){
    const im=await rgbImage(node);
    if(im){const key=images.length;images.push(im);entries.push({type:'image',...b,key});}
    return;
   }
   if(node.tagName==='INPUT'||node.tagName==='SELECT'||node.tagName==='TEXTAREA'){
    let value=node.tagName==='SELECT'?(node.selectedOptions?.[0]?.textContent||''):(node.type==='checkbox'?(node.checked?'☑':'☐'):node.value||'');
    if(node.type==='checkbox')value=node.checked?'X':' ';
    if(value){
     const c=color(st.color)||[0,0,0,1],size=parseFloat(st.fontSize)||13;
     const pieces=String(value).split(/\n/);
     for(let i=0;i<pieces.length;i++)entries.push({type:'text',x:b.x+Math.max(2,parseFloat(st.paddingLeft)||3),y:b.y+i*(size*1.25)+Math.max(2,parseFloat(st.paddingTop)||2),h:size*1.25,value:pieces[i],size,font:'normal',color:c});
    }
    return;
   }
   for(const child of node.childNodes)await walk(child);
  }
  await walk(element);
  return {width:box.width,height:Math.max(box.height,element.scrollHeight),entries,images};
 }
 async function makePdf(documents){
  if(!Array.isArray(documents)||!documents.length)throw Error('No hi ha fitxes per exportar');
  const objects=[null,null,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  const pageIds=[];
  const push=o=>{objects.push(o);return objects.length;};
  for(const doc of documents){
   if(!(doc.width>0))throw Error('La fitxa no té amplada per imprimir');
   const PW=doc.width>=1450?1190.55:A4_W,PH=A4_H;
   const scale=(PW-MARGIN*2)/doc.width,perPage=(PH-MARGIN*2)/scale;
   const count=Math.max(1,Math.ceil(doc.height/perPage-0.0001));
   const imageIds=doc.images.map(im=>push(['<< /Type /XObject /Subtype /Image /Width '+im.w+' /Height '+im.h+' /ColorSpace /DeviceRGB /BitsPerComponent 8 '+(im.flate?'/Filter /FlateDecode ':'')+'/Length '+im.data.byteLength+' >>\nstream\n',im.data,'\nendstream']));
   for(let page=0;page<count;page++){
    const yOffset=page*perPage,cmd=[];
    const x=x=>MARGIN+x*scale,y=y=>PH-MARGIN-(y-yOffset)*scale;
    const rect=(e)=>num(x(e.x))+' '+num(y(e.y+e.h))+' '+num(e.w*scale)+' '+num(e.h*scale)+' re ';
    const rgb=c=>c.slice(0,3).map(num).join(' ');
    cmd.push('q '+num(MARGIN)+' '+num(MARGIN)+' '+num(PW-2*MARGIN)+' '+num(PH-2*MARGIN)+' re W n\n');
    for(const e of doc.entries){
     if(e.y>yOffset+perPage+2||e.y+(e.h||0)<yOffset-2)continue;
     if(e.type==='fill'){cmd.push(rgb(e.color)+' rg '+rect(e)+'f\n');continue;}
     if(e.type==='border'){
      const c=e.color,k=e.width/2,coords=e.side==='top'?[e.x,e.y+k,e.x+e.w,e.y+k]:e.side==='bottom'?[e.x,e.y+e.h-k,e.x+e.w,e.y+e.h-k]:e.side==='left'?[e.x+k,e.y,e.x+k,e.y+e.h]:[e.x+e.w-k,e.y,e.x+e.w-k,e.y+e.h];
      cmd.push(rgb(c)+' RG '+num(Math.max(.1,e.width*scale))+' w '+num(x(coords[0]))+' '+num(y(coords[1]))+' m '+num(x(coords[2]))+' '+num(y(coords[3]))+' l S\n');
      continue;
     }
     if(e.type==='text'){
      if(!e.value||!e.value.trim())continue;
      const size=Math.max(2,e.size*scale);
      cmd.push('BT /F'+(e.font==='bold'?'2':'1')+' '+num(size)+' Tf '+rgb(e.color)+' rg 1 0 0 1 '+num(x(e.x))+' '+num(y(e.y+e.h*.78))+' Tm '+pdfText(e.value)+' Tj ET\n');
      continue;
     }
     if(e.type==='image'){
      const ref=imageIds[e.key];
      if(ref)cmd.push('q '+num(e.w*scale)+' 0 0 '+num(e.h*scale)+' '+num(x(e.x))+' '+num(y(e.y+e.h))+' cm /Im'+e.key+' Do Q\n');
     }
    }
    cmd.push('Q\n');
    const stream=cmd.join('');
    const contentId=push(['<< /Length '+byteLength(stream)+' >>\nstream\n',stream,'\nendstream']);
    const xobjs=imageIds.map((id,i)=>'/Im'+i+' '+id+' 0 R').join(' ');
    const pageId=push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+PW+' '+PH+'] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << '+xobjs+' >> >> /Contents '+contentId+' 0 R >>');
    pageIds.push(pageId);
   }
  }
  objects[0]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[1]='<< /Type /Pages /Count '+pageIds.length+' /Kids ['+pageIds.map(x=>x+' 0 R').join(' ')+'] >>';
  const parts=[],offsets=[0];let position=0;
  const append=x=>{const part=typeof x==='string'?enc.encode(x):x;parts.push(part);position+=byteLength(part);};
  append('%PDF-1.4\n');
  for(let i=0;i<objects.length;i++){
   offsets.push(position);append((i+1)+' 0 obj\n');
   for(const part of Array.isArray(objects[i])?objects[i]:[objects[i]])append(part);
   append('\nendobj\n');
  }
  const startxref=position;
  append('xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n');
  for(const off of offsets.slice(1))append(String(off).padStart(10,'0')+' 00000 n \n');
  append('trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+startxref+'\n%%EOF\n');
  return new Blob(parts,{type:'application/pdf'});
 }
 async function fromElements(elements){const docs=[];for(const el of elements)docs.push(await collect(el));return makePdf(docs);}
 root.GeoCauceFieldPdf={fromElements,makePdf,pdfText};
})(typeof window!=='undefined'?window:globalThis);

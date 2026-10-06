/* GeoCauce GeoTIFF Lite — offline TIFF/GeoTIFF reader for field basemaps.
   Supports classic TIFF + BigTIFF, strips/tiles, chunky/planar data,
   Compression: none, LZW, Deflate/AdobeDeflate, PackBits, JPEG-in-TIFF (baseline RGB/RGBA).
   Common sample types: 8/16/32-bit integer and 32/64-bit float.
   Georeferencing: ModelPixelScale+ModelTiepoint or ModelTransformation.
   This module is intentionally self-contained (no CDN/network dependency). */
(() => {
  'use strict';

  const TYPE_SIZE={1:1,2:1,3:2,4:4,5:8,6:1,7:1,8:2,9:4,10:8,11:4,12:8,16:8,17:8,18:8};
  const TAG={
    ImageWidth:256, ImageLength:257, BitsPerSample:258, Compression:259, Photometric:262,
    StripOffsets:273, SamplesPerPixel:277, RowsPerStrip:278, StripByteCounts:279,
    PlanarConfiguration:284, Predictor:317, ColorMap:320, TileWidth:322, TileLength:323,
    TileOffsets:324, TileByteCounts:325, ExtraSamples:338, SampleFormat:339, JPEGTables:347,
    ModelPixelScale:33550, ModelTiepoint:33922, ModelTransformation:34264,
    GeoKeyDirectory:34735, GeoDoubleParams:34736, GeoAsciiParams:34737, GDALNoData:42113
  };

  const asArray=v=>Array.isArray(v)?v:[v];
  const num=v=>typeof v==='bigint'?Number(v):v;
  function safeNum(v){const n=num(v);if(!Number.isSafeInteger(n)&&typeof v==='bigint')throw Error('GeoTIFF demasiado grande para este navegador');return n}

  function parseGeoTIFF(buffer){
    const dv=new DataView(buffer); if(dv.byteLength<8)throw Error('Archivo TIFF incompleto');
    const bo=String.fromCharCode(dv.getUint8(0),dv.getUint8(1));
    const le=bo==='II'; if(!le&&bo!=='MM')throw Error('Cabecera TIFF no válida');
    const magic=dv.getUint16(2,le); let big=false, ifdOffset;
    if(magic===42){ifdOffset=dv.getUint32(4,le)}
    else if(magic===43){big=true;const offSize=dv.getUint16(4,le),zero=dv.getUint16(6,le);if(offSize!==8||zero!==0)throw Error('BigTIFF no compatible');ifdOffset=safeNum(dv.getBigUint64(8,le))}
    else throw Error('No parece un TIFF/BigTIFF válido');
    const tags=readIFD(dv,ifdOffset,le,big);
    const get=id=>tags.get(id);
    const width=num(get(TAG.ImageWidth)),height=num(get(TAG.ImageLength));
    if(!width||!height)throw Error('GeoTIFF sin dimensiones válidas');
    const spp=num(get(TAG.SamplesPerPixel)||1);
    let bits=asArray(get(TAG.BitsPerSample)||8).map(num); if(bits.length===1&&spp>1)bits=Array(spp).fill(bits[0]);
    let sf=asArray(get(TAG.SampleFormat)||1).map(num); if(sf.length===1&&spp>1)sf=Array(spp).fill(sf[0]);
    const extraRaw=get(TAG.ExtraSamples),jpegRaw=get(TAG.JPEGTables);
    const meta={buffer,dv,le,big,tags,width,height,spp,bits,sampleFormat:sf,
      compression:num(get(TAG.Compression)||1),photometric:num(get(TAG.Photometric)||1),
      planar:num(get(TAG.PlanarConfiguration)||1),predictor:num(get(TAG.Predictor)||1),
      rowsPerStrip:num(get(TAG.RowsPerStrip)||height),tileWidth:num(get(TAG.TileWidth)||0),tileLength:num(get(TAG.TileLength)||0),
      stripOffsets:asArray(get(TAG.StripOffsets)||[]).map(safeNum),stripByteCounts:asArray(get(TAG.StripByteCounts)||[]).map(safeNum),
      tileOffsets:asArray(get(TAG.TileOffsets)||[]).map(safeNum),tileByteCounts:asArray(get(TAG.TileByteCounts)||[]).map(safeNum),
      extraSamples:extraRaw==null?[]:asArray(extraRaw).map(num),jpegTables:jpegRaw==null?null:Uint8Array.from(asArray(jpegRaw).map(num)),
      noData:parseNoData(get(TAG.GDALNoData)),epsg:parseEpsg(get(TAG.GeoKeyDirectory)),
      affine:parseAffine(get(TAG.ModelPixelScale),get(TAG.ModelTiepoint),get(TAG.ModelTransformation)),ifdOffset};
    if(!meta.affine)meta.affine={A:1,D:0,B:0,E:-1,C:0,F:height};
    return meta;
  }

  function readIFD(dv,off,le,big){
    if(off<0||off>=dv.byteLength)throw Error('IFD TIFF fuera del archivo');
    const map=new Map(); let count,p;
    if(big){count=safeNum(dv.getBigUint64(off,le));p=off+8;for(let i=0;i<count;i++,p+=20){if(p+20>dv.byteLength)break;const tag=dv.getUint16(p,le),type=dv.getUint16(p+2,le),n=dv.getBigUint64(p+4,le),valOff=p+12;map.set(tag,readValue(dv,type,n,valOff,8,le,true))}}
    else {count=dv.getUint16(off,le);p=off+2;for(let i=0;i<count;i++,p+=12){if(p+12>dv.byteLength)break;const tag=dv.getUint16(p,le),type=dv.getUint16(p+2,le),n=dv.getUint32(p+4,le),valOff=p+8;map.set(tag,readValue(dv,type,n,valOff,4,le,false))}}
    return map;
  }
  function nextIFDOffset(dv,off,le,big){
    if(big){const count=safeNum(dv.getBigUint64(off,le)),p=off+8+count*20;if(p+8>dv.byteLength)return 0;return safeNum(dv.getBigUint64(p,le));}
    const count=dv.getUint16(off,le),p=off+2+count*12;if(p+4>dv.byteLength)return 0;return dv.getUint32(p,le);
  }
  function metaFromIFD(buffer,dv,off,le,big,baseMeta=null){
    const tags=readIFD(dv,off,le,big),get=id=>tags.get(id),width=num(get(TAG.ImageWidth)),height=num(get(TAG.ImageLength));
    if(!width||!height)return null;const spp=num(get(TAG.SamplesPerPixel)||baseMeta?.spp||1);
    let bits=asArray(get(TAG.BitsPerSample)||baseMeta?.bits||8).map(num);if(bits.length===1&&spp>1)bits=Array(spp).fill(bits[0]);
    let sf=asArray(get(TAG.SampleFormat)||baseMeta?.sampleFormat||1).map(num);if(sf.length===1&&spp>1)sf=Array(spp).fill(sf[0]);
    const extraRaw=get(TAG.ExtraSamples),jpegRaw=get(TAG.JPEGTables),sx=baseMeta?baseMeta.width/width:1,sy=baseMeta?baseMeta.height/height:1;
    const inheritedAffine=baseMeta?{A:baseMeta.affine.A*sx,D:baseMeta.affine.D*sx,B:baseMeta.affine.B*sy,E:baseMeta.affine.E*sy,C:baseMeta.affine.C,F:baseMeta.affine.F}:null;
    return{buffer,dv,le,big,tags,width,height,spp,bits,sampleFormat:sf,
      compression:num(get(TAG.Compression)||baseMeta?.compression||1),photometric:num(get(TAG.Photometric)||baseMeta?.photometric||1),planar:num(get(TAG.PlanarConfiguration)||baseMeta?.planar||1),predictor:num(get(TAG.Predictor)||1),
      rowsPerStrip:num(get(TAG.RowsPerStrip)||height),tileWidth:num(get(TAG.TileWidth)||0),tileLength:num(get(TAG.TileLength)||0),stripOffsets:asArray(get(TAG.StripOffsets)||[]).map(safeNum),stripByteCounts:asArray(get(TAG.StripByteCounts)||[]).map(safeNum),tileOffsets:asArray(get(TAG.TileOffsets)||[]).map(safeNum),tileByteCounts:asArray(get(TAG.TileByteCounts)||[]).map(safeNum),
      extraSamples:extraRaw==null?(baseMeta?.extraSamples||[]):asArray(extraRaw).map(num),jpegTables:jpegRaw==null?(baseMeta?.jpegTables||null):Uint8Array.from(asArray(jpegRaw).map(num)),noData:parseNoData(get(TAG.GDALNoData))??baseMeta?.noData??null,epsg:parseEpsg(get(TAG.GeoKeyDirectory))||baseMeta?.epsg||null,
      affine:parseAffine(get(TAG.ModelPixelScale),get(TAG.ModelTiepoint),get(TAG.ModelTransformation))||inheritedAffine||{A:1,D:0,B:0,E:-1,C:0,F:height},ifdOffset:off};
  }
  function selectOverviewMeta(base,maxDimension){
    const list=[base];let off=nextIFDOffset(base.dv,base.ifdOffset,base.le,base.big),guard=0;
    while(off&&guard++<32){try{const m=metaFromIFD(base.buffer,base.dv,off,base.le,base.big,base);if(!m)break;list.push(m);off=nextIFDOffset(base.dv,off,base.le,base.big);}catch{break}}
    let best=base,bestPenalty=Infinity;for(const m of list){const d=Math.max(m.width,m.height),pen=d>=maxDimension?d-maxDimension:(maxDimension-d)*2;if(pen<bestPenalty){best=m;bestPenalty=pen}}
    return best;
  }

  function readValue(dv,type,countRaw,valueFieldOff,inlineBytes,le,big){
    const size=TYPE_SIZE[type]; if(!size)return undefined; const count=safeNum(countRaw),bytes=count*size;
    let off;if(bytes<=inlineBytes)off=valueFieldOff;else off=big?safeNum(dv.getBigUint64(valueFieldOff,le)):dv.getUint32(valueFieldOff,le);
    if(off<0||off+bytes>dv.byteLength)throw Error('Etiqueta TIFF apunta fuera del archivo');
    if(type===2){let s='';for(let i=0;i<count;i++){const c=dv.getUint8(off+i);if(c===0)break;s+=String.fromCharCode(c)}return s}
    const arr=[];for(let i=0;i<count;i++){const q=off+i*size;let v;
      switch(type){case 1:case 7:v=dv.getUint8(q);break;case 6:v=dv.getInt8(q);break;case 3:v=dv.getUint16(q,le);break;case 8:v=dv.getInt16(q,le);break;case 4:v=dv.getUint32(q,le);break;case 9:v=dv.getInt32(q,le);break;case 5:v=dv.getUint32(q,le)/dv.getUint32(q+4,le);break;case 10:v=dv.getInt32(q,le)/dv.getInt32(q+4,le);break;case 11:v=dv.getFloat32(q,le);break;case 12:v=dv.getFloat64(q,le);break;case 16:case 18:v=dv.getBigUint64(q,le);break;case 17:v=dv.getBigInt64(q,le);break;default:v=0}
      arr.push(v)}return count===1?arr[0]:arr;
  }
  function parseNoData(v){if(v==null)return null;const n=parseFloat(String(v).trim());return Number.isFinite(n)?n:null}
  function parseEpsg(dir){if(!dir)return null;const a=asArray(dir).map(num);if(a.length<4)return null;const n=a[3];let geog=null,pcs=null,projection=null,datum=null;for(let i=0;i<n;i++){const j=4+i*4,key=a[j],loc=a[j+1],count=a[j+2],value=a[j+3];if(loc!==0||count!==1)continue;if(key===3072)pcs=value;else if(key===3074)projection=value;else if(key===2048)geog=value;else if(key===2050)datum=value}if(pcs&&pcs!==32767)return pcs;if(projection>=16001&&projection<=16060&&datum===6258)return 25800+(projection-16000);return geog&&geog!==32767?geog:null}
  function parseAffine(scale,tie,transform){
    if(transform){const m=asArray(transform).map(num);if(m.length>=16)return{A:m[0],B:m[1],C:m[3],D:m[4],E:m[5],F:m[7]}}
    if(scale&&tie){const s=asArray(scale).map(num),t=asArray(tie).map(num);if(s.length>=2&&t.length>=6){const sx=s[0],sy=s[1],i=t[0],j=t[1],x=t[3],y=t[4];return{A:sx,B:0,C:x-i*sx,D:0,E:-sy,F:y+j*sy}}}
    return null;
  }

  function packBits(bytes,expected){const out=new Uint8Array(expected||Math.max(1024,bytes.length*4));let dyn=out,pos=0;const ensure=n=>{if(pos+n<=dyn.length)return;const x=new Uint8Array(Math.max(pos+n,dyn.length*2));x.set(dyn);dyn=x};for(let i=0;i<bytes.length;){let n=(bytes[i++]<<24)>>24;if(n>=0&&n<=127){const c=n+1;ensure(c);dyn.set(bytes.subarray(i,i+c),pos);pos+=c;i+=c}else if(n>=-127&&n<=-1){const c=1-n,b=bytes[i++];ensure(c);dyn.fill(b,pos,pos+c);pos+=c}}return dyn.slice(0,pos)}

  function lzwDecode(input){
    let bitPos=0, codeSize=9, nextCode=258, old=null, out=[];
    let dict=new Array(4096);const reset=()=>{dict=new Array(4096);for(let i=0;i<256;i++)dict[i]=[i];codeSize=9;nextCode=258;old=null};reset();
    const readCode=()=>{if(bitPos+codeSize>input.length*8)return null;let code=0;for(let k=0;k<codeSize;k++){const bi=bitPos+k,byte=input[bi>>3],bit=(byte>>(7-(bi&7)))&1;code=(code<<1)|bit}bitPos+=codeSize;return code};
    while(true){const code=readCode();if(code==null)break;if(code===256){reset();continue}if(code===257)break;let entry;if(dict[code])entry=dict[code];else if(code===nextCode&&old){entry=old.concat(old[0])}else throw Error('LZW TIFF corrupto o no compatible');out.push(...entry);if(old&&nextCode<4096){dict[nextCode++]=old.concat(entry[0]);if(nextCode===(1<<codeSize)-1&&codeSize<12)codeSize++}old=entry}
    return Uint8Array.from(out);
  }

  async function inflate(bytes){
    if(typeof DecompressionStream==='undefined')throw Error('Este navegador no dispone de descompresión Deflate');
    let lastErr;for(const fmt of ['deflate','deflate-raw']){try{const ds=new DecompressionStream(fmt);const stream=new Blob([bytes]).stream().pipeThrough(ds);return new Uint8Array(await new Response(stream).arrayBuffer())}catch(e){lastErr=e}}
    throw Error('No se pudo descomprimir Deflate: '+(lastErr?.message||''));
  }
  async function decompress(bytes,compression,expected){switch(compression){case 1:return bytes.slice();case 5:return lzwDecode(bytes);case 8:case 32946:return inflate(bytes);case 32773:return packBits(bytes,expected);case 7:throw Error('JPEG TIFF se descodifica por bloques');default:throw Error(`Compresión TIFF ${compression} aún no soportada`)}}

  const JPEG_ZIGZAG=[0,1,8,16,9,2,3,10,17,24,32,25,18,11,4,5,12,19,26,33,40,48,41,34,27,20,13,6,7,14,21,28,35,42,49,56,57,50,43,36,29,22,15,23,30,37,44,51,58,59,52,45,38,31,39,46,53,60,61,54,47,55,62,63];
  const JPEG_COS=Array.from({length:8},(_,x)=>Array.from({length:8},(_,u)=>Math.cos((2*x+1)*u*Math.PI/16))),JPEG_C=[1/Math.sqrt(2),1,1,1,1,1,1,1];
  function mergeJpegTables(tile,tables){
    if(!tables?.length)return tile.slice();const a=(tile[0]===0xff&&tile[1]===0xd8)?2:0,b=(tables[0]===0xff&&tables[1]===0xd8)?2:0,te=(tables.at(-2)===0xff&&tables.at(-1)===0xd9)?tables.length-2:tables.length;
    const out=new Uint8Array(2+(te-b)+(tile.length-a));out[0]=0xff;out[1]=0xd8;out.set(tables.subarray(b,te),2);out.set(tile.subarray(a),2+te-b);return out;
  }
  function jpegHuffmanTable(counts,values){
    const byLen=Array.from({length:17},()=>new Map());let code=0,k=0;for(let len=1;len<=16;len++){for(let j=0;j<counts[len-1];j++)byLen[len].set(code++,values[k++]);code<<=1}return byLen;
  }
  function jpegParse(bytes){
    if(bytes[0]!==0xff||bytes[1]!==0xd8)throw Error('Bloque JPEG TIFF sin cabecera SOI');let p=2,frame=null,scan=null,entropyStart=0,restartInterval=0;const quant={},huffDC={},huffAC={};
    while(p<bytes.length){while(p<bytes.length&&bytes[p]!==0xff)p++;while(p<bytes.length&&bytes[p]===0xff)p++;if(p>=bytes.length)break;const marker=bytes[p++];if(marker===0xd9)break;if(marker>=0xd0&&marker<=0xd7)continue;if(marker===0x01)continue;if(p+2>bytes.length)break;const L=(bytes[p]<<8)|bytes[p+1],start=p+2,end=p+L;if(L<2||end>bytes.length)throw Error('Segmento JPEG TIFF inválido');
      if(marker===0xdb){let q=start;while(q<end){const pq=bytes[q]>>4,tq=bytes[q]&15;q++;if(pq!==0)throw Error('JPEG TIFF de 12/16 bits no soportado');const tab=new Int32Array(64);for(let i=0;i<64&&q<end;i++)tab[JPEG_ZIGZAG[i]]=bytes[q++];quant[tq]=tab}}
      else if(marker===0xc4){let q=start;while(q<end){const tc=bytes[q]>>4,th=bytes[q]&15;q++;const counts=Array.from(bytes.subarray(q,q+16));q+=16;const total=counts.reduce((a,b)=>a+b,0),vals=Array.from(bytes.subarray(q,q+total));q+=total;(tc===0?huffDC:huffAC)[th]=jpegHuffmanTable(counts,vals)}}
      else if(marker===0xc0){const precision=bytes[start],height=(bytes[start+1]<<8)|bytes[start+2],width=(bytes[start+3]<<8)|bytes[start+4],n=bytes[start+5],components=[];let q=start+6;for(let i=0;i<n;i++,q+=3)components.push({id:bytes[q],h:bytes[q+1]>>4,v:bytes[q+1]&15,qt:bytes[q+2]});frame={precision,width,height,components}}
      else if(marker===0xdd){restartInterval=(bytes[start]<<8)|bytes[start+1]}
      else if(marker===0xda){const n=bytes[start],components=[];let q=start+1;for(let i=0;i<n;i++,q+=2)components.push({id:bytes[q],dc:bytes[q+1]>>4,ac:bytes[q+1]&15});scan={components};entropyStart=end;break}
      p=end;
    }
    if(!frame||!scan||!entropyStart)throw Error('JPEG TIFF baseline incompleto');if(frame.precision!==8)throw Error('JPEG TIFF: solo se admiten 8 bits');return{frame,scan,quant,huffDC,huffAC,entropyStart,restartInterval};
  }
  function jpegBitReader(bytes,start){
    let pos=start,buf=0,bits=0;return{bit(){if(!bits){if(pos>=bytes.length)throw Error('JPEG TIFF truncado');let b=bytes[pos++];if(b===0xff){let m=bytes[pos++];while(m===0xff)m=bytes[pos++];if(m===0x00)b=0xff;else throw Error(`Marcador JPEG inesperado 0x${m.toString(16)}`)}buf=b;bits=8}return(buf>>--bits)&1},bits(n){let v=0;for(let i=0;i<n;i++)v=(v<<1)|this.bit();return v},align(){bits=0},restart(){bits=0;while(pos<bytes.length&&bytes[pos]!==0xff)pos++;while(pos<bytes.length&&bytes[pos]===0xff)pos++;const m=bytes[pos++];if(!(m>=0xd0&&m<=0xd7))throw Error('Marcador de reinicio JPEG esperado')},get pos(){return pos}};
  }
  function jpegDecodeHuff(br,table){let code=0;for(let len=1;len<=16;len++){code=(code<<1)|br.bit();const v=table?.[len]?.get(code);if(v!==undefined)return v}throw Error('Tabla Huffman JPEG inválida')}
  function jpegExtend(v,s){if(!s)return 0;const vt=1<<(s-1);return v<vt?v-((1<<s)-1):v}
  function jpegIdct(coeff){
    const tmp=new Float64Array(64),out=new Uint8Array(64);for(let v=0;v<8;v++)for(let x=0;x<8;x++){let sum=0;for(let u=0;u<8;u++)sum+=JPEG_C[u]*coeff[v*8+u]*JPEG_COS[x][u];tmp[v*8+x]=sum}
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){let sum=0;for(let v=0;v<8;v++)sum+=JPEG_C[v]*tmp[v*8+x]*JPEG_COS[y][v];out[y*8+x]=Math.max(0,Math.min(255,Math.round(sum/4+128)))}return out;
  }
  function jpegDecodeRawComponents(bytes){
    const j=jpegParse(bytes),fr=j.frame;
    if(fr.components.some(c=>c.h!==1||c.v!==1))throw Error('JPEG TIFF amb subsampling no suportat en RGB/RGBA');
    const br=jpegBitReader(bytes,j.entropyStart),prevDC=new Int32Array(fr.components.length),mw=Math.ceil(fr.width/8),mh=Math.ceil(fr.height/8),planes=fr.components.map(()=>new Uint8Array(fr.width*fr.height));let mcu=0;
    for(let my=0;my<mh;my++)for(let mx=0;mx<mw;mx++,mcu++){
      if(j.restartInterval&&mcu>0&&mcu%j.restartInterval===0){br.restart();prevDC.fill(0)}
      for(let si=0;si<j.scan.components.length;si++){
        const sc=j.scan.components[si],fi=fr.components.findIndex(c=>c.id===sc.id),fc=fr.components[fi],dcT=j.huffDC[sc.dc],acT=j.huffAC[sc.ac],qt=j.quant[fc.qt];if(!qt)throw Error('Taula de quantificació JPEG absent');
        const coeff=new Int32Array(64),s=jpegDecodeHuff(br,dcT),diff=jpegExtend(s?br.bits(s):0,s);prevDC[fi]+=diff;coeff[0]=prevDC[fi]*qt[0];
        let k=1;while(k<64){const rs=jpegDecodeHuff(br,acT);if(rs===0)break;if(rs===0xf0){k+=16;continue}const run=rs>>4,sz=rs&15;k+=run;if(k>=64)break;const val=jpegExtend(sz?br.bits(sz):0,sz);coeff[JPEG_ZIGZAG[k]]=val*qt[JPEG_ZIGZAG[k]];k++}
        const block=jpegIdct(coeff),plane=planes[fi];for(let yy=0;yy<8;yy++){const py=my*8+yy;if(py>=fr.height)break;for(let xx=0;xx<8;xx++){const px=mx*8+xx;if(px>=fr.width)break;plane[py*fr.width+px]=block[yy*8+xx]}}
      }
    }
    return{width:fr.width,height:fr.height,planes};
  }
  async function jpegCanvasRgba(bytes){
    const blob=new Blob([bytes],{type:'image/jpeg'});let img,url=null;try{if(typeof createImageBitmap==='function')img=await createImageBitmap(blob);else{url=URL.createObjectURL(blob);img=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('El WebView no pot descodificar JPEG'));im.src=url})}const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0);return{width:c.width,height:c.height,rgba:g.getImageData(0,0,c.width,c.height).data}}finally{try{img?.close?.()}catch{}if(url)URL.revokeObjectURL(url)}}
  async function decodeTiffJpegBlock(tile,m){
    const jpg=mergeJpegTables(tile,m.jpegTables);
    // GeoTIFF JPEG amb 4 mostres s'emmagatzema com quatre components JPEG crus.
    // Els decodificadors d'imatge habituals ho interpreten com CMYK i deformen tant
    // els colors com el canal alfa. En TIFF RGB+A els quatre components són els
    // canals TIFF reals, així que els reconstruïm directament sense passar per la conversió CMYK del navegador.
    if(m.spp===4&&m.extraSamples?.length){const raw=jpegDecodeRawComponents(jpg),pixels=raw.width*raw.height,out=new Uint8Array(pixels*4);for(let i=0;i<pixels;i++){const o=i*4;out[o]=raw.planes[0][i];out[o+1]=raw.planes[1][i];out[o+2]=raw.planes[2][i];out[o+3]=raw.planes[3][i]}return out}
    const canvas=await jpegCanvasRgba(jpg),pixels=canvas.width*canvas.height;
    if(m.spp===3){const out=new Uint8Array(pixels*3);for(let i=0;i<pixels;i++){out[i*3]=canvas.rgba[i*4];out[i*3+1]=canvas.rgba[i*4+1];out[i*3+2]=canvas.rgba[i*4+2]}return out}
    throw Error(`JPEG TIFF RGB amb ${m.spp} canals no suportat`);
  }

  function applyPredictor(buf,predictor,width,height,bits,components,le){
    if(!predictor||predictor===1)return buf;const b=bits[0];if(bits.some(x=>x!==b)||b%8)throw Error('Predictor TIFF con bits heterogéneos no soportado');const bytes=b/8,rowBytes=width*components*bytes;
    if(predictor===2){const dv=new DataView(buf.buffer,buf.byteOffset,buf.byteLength);for(let y=0;y<height;y++){const base=y*rowBytes;for(let x=1;x<width;x++)for(let c=0;c<components;c++){const cur=base+(x*components+c)*bytes,prev=base+((x-1)*components+c)*bytes;if(bytes===1)dv.setUint8(cur,(dv.getUint8(cur)+dv.getUint8(prev))&255);else if(bytes===2)dv.setUint16(cur,(dv.getUint16(cur,le)+dv.getUint16(prev,le))&65535,le);else if(bytes===4)dv.setUint32(cur,(dv.getUint32(cur,le)+dv.getUint32(prev,le))>>>0,le);else throw Error('Predictor 2 no soportado para este tamaño de muestra')}}return buf}
    if(predictor===3){for(let y=0;y<height;y++){const start=y*rowBytes,end=Math.min(start+rowBytes,buf.length);const row=buf.subarray(start,end);const stride=components;let o=0,n=row.length;const samples=n/bytes;while(n>stride){for(let r=stride;r>0;r--){row[o+stride]=(row[o+stride]+row[o])&255;o++}n-=stride}const cp=row.slice();for(let s=0;s<samples;s++)for(let k=0;k<bytes;k++)row[bytes*s+k]=cp[(bytes-k-1)*samples+s]}return buf}
    throw Error(`Predictor TIFF ${predictor} no soportado`);
  }

  function readSample(dv,off,bits,fmt,le){switch(fmt){case 1:if(bits===8)return dv.getUint8(off);if(bits===16)return dv.getUint16(off,le);if(bits===32)return dv.getUint32(off,le);break;case 2:if(bits===8)return dv.getInt8(off);if(bits===16)return dv.getInt16(off,le);if(bits===32)return dv.getInt32(off,le);break;case 3:if(bits===32)return dv.getFloat32(off,le);if(bits===64)return dv.getFloat64(off,le);break}throw Error(`Muestra TIFF no soportada: ${bits} bits, SampleFormat ${fmt}`)}

  function imageStructure(m){
    const tiled=m.tileOffsets.length>0;
    const offsets=tiled?m.tileOffsets:m.stripOffsets;
    const counts=tiled?m.tileByteCounts:m.stripByteCounts;
    if(!offsets.length||offsets.length!==counts.length)throw Error('GeoTIFF sin bloques de imagen legibles');
    const bw=tiled?m.tileWidth:m.width;
    const bh=tiled?m.tileLength:m.rowsPerStrip;
    const blocksAcross=tiled?Math.ceil(m.width/bw):1;
    const blocksDown=Math.ceil(m.height/bh);
    return{tiled,offsets,counts,bw,bh,blocksAcross,blocksDown,blocksPerPlane:blocksAcross*blocksDown};
  }

  async function decodeGeoTIFF(buffer,{maxDimension=3072,onProgress}={}){
    const base=parseGeoTIFF(buffer),m=selectOverviewMeta(base,maxDimension);if(m.bits.some(b=>![8,16,32,64].includes(b)))throw Error('Solo se admiten muestras TIFF de 8/16/32/64 bits');
    const ratio=Math.max(1,Math.max(m.width,m.height)/maxDimension),ow=Math.max(1,Math.round(m.width/ratio)),oh=Math.max(1,Math.round(m.height/ratio));
    const region=await decodeRegionInternal(m,{x:0,y:0,width:m.width,height:m.height,outWidth:ow,outHeight:oh,range:null,onProgress});
    const totalSx=base.width/ow,totalSy=base.height/oh,a=base.affine,affine={A:a.A*totalSx,D:a.D*totalSx,B:a.B*totalSy,E:a.E*totalSy,C:a.C,F:a.F};
    return{width:ow,height:oh,rgba:region.rgba,affine,sourceAffine:{...base.affine},georef:!!(base.tags.get(TAG.ModelPixelScale)||base.tags.get(TAG.ModelTransformation)),epsg:base.epsg,sourceWidth:base.width,sourceHeight:base.height,kind:region.kind,noData:base.noData,range:region.range,compression:base.compression,predictor:base.predictor,downsample:Math.max(base.width/ow,base.height/oh),validPercent:region.validPercent,validCount:region.validCount,tiled:imageStructure(base).tiled,blockWidth:imageStructure(base).bw,blockHeight:imageStructure(base).bh,overviewWidth:m.width,overviewHeight:m.height,overviewCount:m===base?0:1,samplesPerPixel:base.spp,bitsPerSample:[...base.bits],sampleFormat:[...base.sampleFormat],photometric:base.photometric,extraSamples:[...(base.extraSamples||[])]};
  }

  async function decodeRegion(bufferOrMeta,{x=0,y=0,width,height,step=1,outWidth=null,outHeight=null,range=null,onProgress}={}){
    const m=bufferOrMeta&&bufferOrMeta.tags?bufferOrMeta:parseGeoTIFF(bufferOrMeta);
    const x0=Math.max(0,Math.floor(x)),y0=Math.max(0,Math.floor(y));
    const x1=Math.min(m.width,Math.ceil(x+(width??(m.width-x0)))),y1=Math.min(m.height,Math.ceil(y+(height??(m.height-y0))));
    if(x1<=x0||y1<=y0)return{width:0,height:0,rgba:new Uint8ClampedArray(),kind:'empty',range,validPercent:0,validCount:0};
    if(!outWidth)outWidth=Math.max(1,Math.ceil((x1-x0)/Math.max(1,step)));
    if(!outHeight)outHeight=Math.max(1,Math.ceil((y1-y0)/Math.max(1,step)));
    return decodeRegionInternal(m,{x:x0,y:y0,width:x1-x0,height:y1-y0,outWidth,outHeight,range,onProgress});
  }


  async function decodeValuesRegion(bufferOrMeta,{x=0,y=0,width,height,step=1,outWidth=null,outHeight=null,onProgress}={}){
    const m=bufferOrMeta&&bufferOrMeta.tags?bufferOrMeta:parseGeoTIFF(bufferOrMeta);
    if(m.spp>=3&&m.photometric===2)throw Error('La capa seleccionada es multibanda RGB; los valores únicos requieren una banda numérica');
    const x0=Math.max(0,Math.floor(x)),y0=Math.max(0,Math.floor(y));
    const x1=Math.min(m.width,Math.ceil(x+(width??(m.width-x0)))),y1=Math.min(m.height,Math.ceil(y+(height??(m.height-y0))));
    if(x1<=x0||y1<=y0)return{width:0,height:0,values:new Float32Array(),noData:m.noData,validCount:0,min:null,max:null};
    if(!outWidth)outWidth=Math.max(1,Math.ceil((x1-x0)/Math.max(1,step)));
    if(!outHeight)outHeight=Math.max(1,Math.ceil((y1-y0)/Math.max(1,step)));
    return decodeRegionInternal(m,{x:x0,y:y0,width:x1-x0,height:y1-y0,outWidth,outHeight,range:null,onProgress,rawValues:true});
  }

  async function samplePoints(bufferOrMeta,points,{onProgress}={}){
    const m=bufferOrMeta&&bufferOrMeta.tags?bufferOrMeta:parseGeoTIFF(bufferOrMeta);
    if(m.spp>=3&&m.photometric===2)throw Error('La capa seleccionada no es un MDT de una banda');
    const st=imageStructure(m),{offsets,counts,bw,bh,blocksAcross,blocksPerPlane}=st;
    const bytesPerSample=m.bits.map(b=>b/8);
    if(m.planar===1&&new Set(bytesPerSample).size>1)throw Error('GeoTIFF con muestras de distinto tamaño no soportado');
    const groups=new Map(),out=new Array(points.length).fill(null);
    for(let i=0;i<points.length;i++){
      const p=points[i],sx=Math.floor(p.x),sy=Math.floor(p.y);
      if(!Number.isFinite(sx)||!Number.isFinite(sy)||sx<0||sy<0||sx>=m.width||sy>=m.height)continue;
      const tx=Math.floor(sx/bw),ty=Math.floor(sy/bh),local=ty*blocksAcross+tx,bi=m.planar===2?local:local;
      if(!groups.has(bi))groups.set(bi,[]);groups.get(bi).push({i,sx,sy,tx,ty});
    }
    const entries=[...groups.entries()];let done=0;
    for(const [bi,items] of entries){
      const off=offsets[bi],cnt=counts[bi];if(!off||!cnt||off+cnt>m.buffer.byteLength){done++;continue}
      const packed=new Uint8Array(m.buffer,off,cnt),components=m.planar===2?1:m.spp;
      const expected=bw*bh*components*(m.bits[0]||8)/8;
      let raw=await decompress(packed,m.compression,expected);raw=applyPredictor(raw,m.predictor,bw,bh,[m.bits[0]||8],components,m.le);
      const dv=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),pixelStride=bytesPerSample.reduce((a,b)=>a+b,0);
      for(const it of items){
        const lx=it.sx-it.tx*bw,ly=it.sy-it.ty*bh;let bo=(ly*bw+lx)*(m.planar===1?pixelStride:bytesPerSample[0]);
        const v=readSample(dv,bo,m.bits[0],m.sampleFormat[0]||1,m.le);
        out[it.i]=(Number.isFinite(v)&&(m.noData==null||Math.abs(v-m.noData)>1e-8))?v:null;
      }
      done++;if(onProgress)onProgress(entries.length?done/entries.length:1);if(done%8===0)await new Promise(r=>setTimeout(r,0));
    }
    return out;
  }
  async function decodeRegionInternal(m,{x,y,width,height,outWidth,outHeight,range,onProgress,rawValues=false}){
    const ow=outWidth,oh=outHeight,x0=x,y0=y,x1=x+width,y1=y+height;
    const isRgb=m.spp>=3&&m.photometric===2;const single=!isRgb;
    const vals=single?new Float32Array(ow*oh):null;if(vals)vals.fill(NaN);
    const rgba=isRgb?new Uint8ClampedArray(ow*oh*4):null;
    const st=imageStructure(m),{offsets,counts,bw,bh,blocksAcross,blocksPerPlane}=st;
    const bytesPerSample=m.bits.map(b=>b/8);if(m.planar===1&&new Set(bytesPerSample).size>1)throw Error('GeoTIFF con muestras de distinto tamaño no soportado');
    const sxScale=width/ow,syScale=height/oh;
    let candidates=0;
    for(let bi=0;bi<offsets.length;bi++){
      const local=m.planar===2?bi%blocksPerPlane:bi,tx=local%blocksAcross,ty=Math.floor(local/blocksAcross),bx0=tx*bw,by0=ty*bh,bx1=Math.min(m.width,bx0+bw),by1=Math.min(m.height,by0+bh);
      if(bx1>x0&&bx0<x1&&by1>y0&&by0<y1)candidates++;
    }
    let done=0,decodedBlocks=0;
    for(let bi=0;bi<offsets.length;bi++){
      const plane=m.planar===2?Math.floor(bi/blocksPerPlane):0,local=m.planar===2?bi%blocksPerPlane:bi;
      const tx=local%blocksAcross,ty=Math.floor(local/blocksAcross);const bx0=tx*bw,by0=ty*bh,bx1=Math.min(m.width,bx0+bw),by1=Math.min(m.height,by0+bh);
      if(!(bx1>x0&&bx0<x1&&by1>y0&&by0<y1))continue;
      const off=offsets[bi],cnt=counts[bi];if(!off||!cnt){done++;continue}if(off+cnt>m.buffer.byteLength)throw Error('Bloque TIFF fuera del archivo');
      const packed=new Uint8Array(m.buffer,off,cnt);const components=m.planar===2?1:m.spp;const expected=bw*bh*components*(m.bits[plane]||m.bits[0])/8;
      let raw=m.compression===7?await decodeTiffJpegBlock(packed,m):await decompress(packed,m.compression,expected);if(m.compression!==7)raw=applyPredictor(raw,m.predictor,bw,bh,[m.bits[plane]||m.bits[0]],components,m.le);const dv=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);

      // Output pixels whose source sample falls inside this TIFF block.
      const ox0=Math.max(0,Math.ceil((bx0-x0)/sxScale-.5));
      const ox1=Math.min(ow,Math.ceil((bx1-x0)/sxScale-.5));
      const oy0=Math.max(0,Math.ceil((by0-y0)/syScale-.5));
      const oy1=Math.min(oh,Math.ceil((by1-y0)/syScale-.5));
      for(let oy=oy0;oy<oy1;oy++){
        const sy=Math.min(m.height-1,Math.floor(y0+(oy+.5)*syScale));if(sy<by0||sy>=by0+bh)continue;const ly=sy-by0;
        for(let ox=ox0;ox<ox1;ox++){
          const sx=Math.min(m.width-1,Math.floor(x0+(ox+.5)*sxScale));if(sx<bx0||sx>=bx0+bw)continue;const lx=sx-bx0,oi=oy*ow+ox;
          if(m.planar===1){
            let byteOff=(ly*bw+lx)*bytesPerSample.reduce((a,b)=>a+b,0);
            if(isRgb){for(let c=0;c<3;c++){const v=readSample(dv,byteOff,m.bits[c],m.sampleFormat[c]||1,m.le);rgba[oi*4+c]=m.bits[c]===8?v:Math.max(0,Math.min(255,v/((2**m.bits[c])-1)*255));byteOff+=bytesPerSample[c]}if(m.spp>=4&&m.extraSamples?.length){const av=readSample(dv,byteOff,m.bits[3],m.sampleFormat[3]||1,m.le);rgba[oi*4+3]=m.bits[3]===8?av:Math.max(0,Math.min(255,av/((2**m.bits[3])-1)*255))}else rgba[oi*4+3]=255}
            else vals[oi]=readSample(dv,byteOff,m.bits[0],m.sampleFormat[0]||1,m.le);
          } else {
            const bo=(ly*bw+lx)*bytesPerSample[plane],v=readSample(dv,bo,m.bits[plane],m.sampleFormat[plane]||1,m.le);
            if(isRgb&&plane<3){rgba[oi*4+plane]=m.bits[plane]===8?v:Math.max(0,Math.min(255,v/((2**m.bits[plane])-1)*255));rgba[oi*4+3]=255}else if(plane===0)vals[oi]=v;
          }
        }
      }
      decodedBlocks++;done++;if(onProgress&&(done%Math.max(1,Math.floor(candidates/20))===0||done===candidates))onProgress(candidates?done/candidates:1);
      if(decodedBlocks%8===0)await new Promise(r=>setTimeout(r,0));
    }
    if(isRgb)return{width:ow,height:oh,rgba,kind:'rgb',range:null,validPercent:100,validCount:ow*oh};
    if(rawValues){let validCount=0,min=Infinity,max=-Infinity;for(let i=0;i<vals.length;i++){const v=vals[i];if(Number.isFinite(v)&&(m.noData==null||Math.abs(v-m.noData)>1e-8)){validCount++;if(v<min)min=v;if(v>max)max=v;}}return{width:ow,height:oh,values:vals,noData:m.noData,validCount,min:validCount?min:null,max:validCount?max:null};}
    const rendered=renderSingleBand(vals,ow,oh,m.noData,m.affine,sxScale,syScale,range);
    return{width:ow,height:oh,rgba:rendered.rgba,kind:'dem',range:rendered.range,validPercent:rendered.validPercent,validCount:rendered.validCount};
  }

  function renderSingleBand(vals,w,h,noData,affine,sxScale,syScale,forcedRange=null){
    const valid=(v)=>Number.isFinite(v)&&(noData==null||Math.abs(v-noData)>1e-8);
    let lo,hi;
    if(forcedRange&&Number.isFinite(forcedRange[0])&&Number.isFinite(forcedRange[1])){lo=forcedRange[0];hi=forcedRange[1]}
    else {
      const sample=[];const stride=Math.max(1,Math.floor(vals.length/60000));for(let i=0;i<vals.length;i+=stride){const v=vals[i];if(valid(v))sample.push(v)}
      sample.sort((a,b)=>a-b);lo=sample.length?sample[Math.floor(sample.length*.02)]:0;hi=sample.length?sample[Math.floor(sample.length*.98)]:1;
    }
    const rgba=new Uint8ClampedArray(w*h*4);const cellX=Math.max(1e-9,Math.hypot(affine.A,affine.D)*sxScale),cellY=Math.max(1e-9,Math.hypot(affine.B,affine.E)*syScale);const az=315*Math.PI/180,alt=45*Math.PI/180;
    let validCount=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,v=vals[i],o=i*4;if(!valid(v)){rgba[o+3]=0;continue}validCount++;let shade;
      if(x>0&&x<w-1&&y>0&&y<h-1&&valid(vals[i-1])&&valid(vals[i+1])&&valid(vals[i-w])&&valid(vals[i+w])){const sx=Math.sign(affine.A||1)||1,sy=Math.sign(affine.E||-1)||-1,dzdx=sx*(vals[i+1]-vals[i-1])/(2*cellX),dzdy=sy*(vals[i+w]-vals[i-w])/(2*cellY);const slope=Math.atan(Math.hypot(dzdx,dzdy));const aspect=Math.atan2(dzdy,-dzdx);const hs=Math.sin(alt)*Math.cos(slope)+Math.cos(alt)*Math.sin(slope)*Math.cos(az-aspect);shade=Math.round(55+200*Math.max(0,hs))}
      else shade=Math.round(35+210*Math.max(0,Math.min(1,(v-lo)/(hi-lo||1))));rgba[o]=rgba[o+1]=rgba[o+2]=shade;rgba[o+3]=255}
    return{rgba,range:[lo,hi],validCount,validPercent:vals.length?100*validCount/vals.length:0};
  }

  window.GeoCauceGeoTIFF={parse:parseGeoTIFF,decode:decodeGeoTIFF,decodeRegion,decodeValuesRegion,samplePoints};
})();

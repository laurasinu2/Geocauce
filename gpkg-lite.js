/* GeoCauce GeoPackage reader (read-only SQLite). Self-contained, no CDN.
   Supports ordinary SQLite rowid tables, overflow pages, gpkg geometry WKB and tile pyramids. */
(function(root){
 'use strict';
 const utf8=new TextDecoder('utf-8'),MAX_DEPTH=25;
 function fail(message){throw Error('GeoPackage: '+message);}
 function dataView(x){return new DataView(x.buffer,x.byteOffset,x.byteLength);}
 function sqlite(bytes){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
  if(bytes.byteLength<100||utf8.decode(bytes.subarray(0,16))!=='SQLite format 3\0')fail('no es un fitxer SQLite vàlid');
  const dv=dataView(bytes);
  let pageSize=dv.getUint16(16,false);if(pageSize===1)pageSize=65536;
  const reserved=bytes[20],usable=pageSize-reserved;
  if(pageSize<512||pageSize>65536||usable<480)fail('mida de pàgina SQLite no compatible');
  const pageTotal=Math.floor(bytes.length/pageSize);
  function page(n){if(!Number.isSafeInteger(n)||n<1||n>pageTotal)fail('pàgina SQLite fora de rang');return(n-1)*pageSize;}
  function number(off,n,signed=false,little=false){
   if(off<0||off+n>bytes.length)fail('registre SQLite incomplet');
   if(n===1)return signed?dv.getInt8(off):dv.getUint8(off);
   if(n===2)return signed?dv.getInt16(off,little):dv.getUint16(off,little);
   if(n===4)return signed?dv.getInt32(off,little):dv.getUint32(off,little);
   if(n===8){const v=little?dv.getBigInt64(off,true):dv.getBigInt64(off,false);return Number(v);}
   let v=0n;for(let i=0;i<n;i++)v=(v<<8n)|BigInt(bytes[off+i]);
   if(signed&&v&(1n<<BigInt(n*8-1)))v-=1n<<BigInt(n*8);
   return Number(v);
  }
  function varint(off,input=bytes){
   let value=0n;
   for(let i=0;i<9;i++){
    if(off+i>=input.length)fail('varint incomplet');
    const b=input[off+i];
    if(i===8)return{value:Number((value<<8n)|BigInt(b)),next:off+9};
    value=(value<<7n)|BigInt(b&127);
    if(!(b&128))return{value:Number(value),next:off+i+1};
   }
   fail('varint no vàlid');
  }
  function record(payload){
   const h=varint(0,payload),fields=[];let at=h.next;
   if(h.value<1||h.value>payload.length)fail('capçalera de registre invàlida');
   while(at<h.value){const t=varint(at,payload);fields.push(t.value);at=t.next;}
   let off=h.value;
   return fields.map(code=>{
    let len=0,val=null;
    if(code===0)return null;
    if(code===8)return 0;if(code===9)return 1;
    if(code===1)len=1;else if(code===2)len=2;else if(code===3)len=3;
    else if(code===4)len=4;else if(code===5)len=6;else if(code===6)len=8;
    else if(code===7)len=8;else if(code>=12)len=Math.floor((code-12)/2);
    else fail('tipus SQLite no reconegut');
    if(off+len>payload.length)fail('valor SQLite truncat');
    if(code>=12){
     const chunk=payload.subarray(off,off+len);
     val=code%2===0?chunk.slice():utf8.decode(chunk);
    }else if(code===7)val=dataView(payload).getFloat64(off,false);
    else{let bi=0n;for(let i=0;i<len;i++)bi=(bi<<8n)|BigInt(payload[off+i]);
     if(bi&(1n<<BigInt(len*8-1)))bi-=1n<<BigInt(len*8);
     val=Number(bi);
    }
    off+=len;return val;
   });
  }
  function payloadRead(start,P){
   const X=usable-35,M=Math.floor((usable-12)*32/255)-23;
   const K=P<=X?P:M+((P-M)%(usable-4));
   const local=P<=X?P:(K<=X?K:M);
   if(P<0||P>300*1024*1024)fail('registre massa gran');
   const dst=new Uint8Array(P);
   if(start+local>bytes.length)fail('pàgina SQLite truncada');
   dst.set(bytes.subarray(start,start+local),0);
   if(P===local)return dst;
   let next=number(start+local,4),written=local,seen=new Set();
   while(written<P){
    if(!next||seen.has(next))fail('cadena de pàgines overflow invàlida');
    seen.add(next);
    const off=page(next),count=Math.min(P-written,usable-4);
    if(off+4+count>bytes.length)fail('overflow truncat');
    dst.set(bytes.subarray(off+4,off+4+count),written);
    written+=count;next=number(off,4);
   }
   return dst;
  }
  function* walk(rootPage,depth=0,visited=new Set()){
   if(depth>MAX_DEPTH)fail('arbre SQLite massa profund');
   const off=page(rootPage)+(rootPage===1?100:0),type=bytes[off],count=number(off+3,2),header=type===5?12:8;
   if(type!==5&&type!==13)fail('tipus de pàgina SQLite no compatible');
   if(count>pageSize/2)fail('nombre de cel·les SQLite invàlid');
   if(visited.has(rootPage))fail('arbre SQLite circular');
   visited.add(rootPage);
   for(let i=0;i<count;i++){
    const rel=number(off+header+i*2,2),cell=page(rootPage)+rel;
    if(type===5){const left=number(cell,4);yield* walk(left,depth+1,visited);}
    else{const p=varint(cell),id=varint(p.next);
     const payload=payloadRead(id.next,p.value);
     yield{rowid:id.value,values:record(payload)};
    }
   }
   if(type===5)yield* walk(number(off+8,4),depth+1,visited);
  }
  function sqlColumns(sql){
   const start=sql.indexOf('(');if(start<0)fail('esquema de taula desconegut');
   const parts=[];let dep=0,quote=null,s=start+1;
   for(let i=start+1;i<sql.length;i++){
    const ch=sql[i];
    if(quote){
     if(ch===quote){if(sql[i+1]===quote){i++;}else quote=null;}
     continue;
    }
    if(ch==='"'||ch==="'"||ch==='\x60'){quote=ch;continue;}
    if(ch==='['){quote=']';continue;}
    if(ch==='(')dep++;
    if(ch===')'){if(!dep){parts.push(sql.slice(s,i));break;}dep--;}
    if(ch===','&&!dep){parts.push(sql.slice(s,i));s=i+1;}
   }
   return parts.map(t=>t.trim()).filter(t=>! /^(?:CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK)\b/i.test(t)).map(t=>{
    const m=t.match(/^(?:"((?:[^"]|"")*)"|'([^']+)'|\x60([^\x60]+)\x60|\[([^\]]+)\]|([^\s(]+))/);
    return m?(m[1]??m[2]??m[3]??m[4]??m[5]).replace(/""/g,'"'):null;
   }).filter(Boolean);
  }
  const master=new Map();
  for(const row of walk(1)){
   const [type,name,,rootpage,sql]=row.values;
   if(type==='table'&&rootpage&&sql)master.set(name,{root:rootpage,columns:sqlColumns(sql)});
  }
  function* rows(name){
   const rec=master.get(name);if(!rec)fail('falta la taula '+name);
   for(const row of walk(rec.root)){
    const obj={};
    for(let i=0;i<rec.columns.length;i++)obj[rec.columns[i]]=row.values[i]??null;
    const first=rec.columns[0];
    if(first&&obj[first]===null)obj[first]=row.rowid;
    yield obj;
   }
  }
  return {has:name=>master.has(name),rows,list:name=>Array.from(rows(name)),schema:master};
 }
 function wkbGeometry(blob){
  if(!(blob instanceof Uint8Array)||blob.length<8)fail('geometria GeoPackage buida');
  if(blob[0]!==71||blob[1]!==80)fail('capçalera GP (GeoPackageBinary) no vàlida');
  const flags=blob[3],envelope=(flags>>1)&7;
  const envLengths=[0,4,6,6,8];
  if(envelope>4)fail('capçalera de geometria sense suport');
  let cursor=8+envLengths[envelope]*8;
  const dv=dataView(blob),paths=[],limit=5000000;let pts=0,shape=0;
  function u32(order){if(cursor+4>blob.length)fail('WKB truncat');const x=dv.getUint32(cursor,order);cursor+=4;return x;}
  function f64(order){if(cursor+8>blob.length)fail('WKB truncat');const x=dv.getFloat64(cursor,order);cursor+=8;return x;}
  function parse(depth=0){
   if(depth>16)fail('WKB massa profund');
   if(cursor+5>blob.length)fail('WKB truncat');
   const order=blob[cursor++]===1;let code=u32(order),dims=2;
   if(code&0x80000000)dims++;if(code&0x40000000)dims++;
   if(code&0x20000000)u32(order);
   code&=0x1fffffff;
   if(code>=3000){dims=4;code-=3000;}else if(code>=2000){dims=3;code-=2000;}else if(code>=1000){dims=3;code-=1000;}
   const coord=()=>{if(++pts>limit)fail('geometria massa gran');const x=f64(order),y=f64(order);for(let i=2;i<dims;i++)f64(order);return{x,y};};
   const coords=()=>{const n=u32(order);if(n>limit)fail('massa vèrtexs');const a=[];for(let i=0;i<n;i++)a.push(coord());return a;};
   if(code===1){paths.push([coord()]);shape=shape||1;}
   else if(code===2){paths.push(coords());shape=shape||3;}
   else if(code===3){const n=u32(order);if(n>limit)fail('massa anells');for(let i=0;i<n;i++)paths.push(coords());shape=shape||5;}
   else if([4,5,6,7].includes(code)){const n=u32(order);if(n>limit)fail('massa geometries');if(code===6)shape=5;else if(code===5)shape=shape||3;else if(code===4)shape=shape||8;for(let i=0;i<n;i++)parse(depth+1);}
   else fail('tipus WKB '+code+' no compatible');
  }
  parse();
  return{paths,shapeType:shape};
 }
 function open(ab){
  const db=sqlite(ab instanceof Uint8Array?ab:new Uint8Array(ab));
  if(!db.has('gpkg_contents'))fail('no conté gpkg_contents');
  const contents=db.list('gpkg_contents').filter(r=>r&&r.table_name&&db.has(r.table_name));
  const geometryColumns=db.has('gpkg_geometry_columns')?db.list('gpkg_geometry_columns'):[];
  const matrixSets=db.has('gpkg_tile_matrix_set')?db.list('gpkg_tile_matrix_set'):[];
  const matrix=db.has('gpkg_tile_matrix')?db.list('gpkg_tile_matrix'):[];
  return{db,contents,geometryColumns,matrixSets,matrix,decodeGeometry:wkbGeometry};
 }
 root.GeoCauceGpkg={open,sqlite,decodeGeometry:wkbGeometry};
})(typeof window==='object'?window:globalThis);

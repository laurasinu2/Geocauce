const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const app=read('app.js'),html=read('index.html'),sw=read('sw.js'),zipSource=read('local-export-zip.js');
const zipRoot={Blob,TextEncoder,Uint8Array,Uint32Array,DataView,Date,Error,Math};
zipRoot.globalThis=zipRoot;
vm.runInNewContext(zipSource,zipRoot);
const {createZip,cleanPath,createPdfFromJpegs}=zipRoot.GeoCauceLocalZip;
function findZipEntries(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let eocd=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}
  assert.ok(eocd>=0,'valid EOCD');
  const count=view.getUint16(eocd+10,true),directory=view.getUint32(eocd+16,true),size=view.getUint32(eocd+12,true);
  assert.ok(directory+size<=bytes.length);
  let p=directory;const result=[];
  for(let i=0;i<count;i++){
    assert.equal(view.getUint32(p,true),0x02014b50);
    const filenameLength=view.getUint16(p+28,true),extra=view.getUint16(p+30,true),comment=view.getUint16(p+32,true);
    const filename=new TextDecoder().decode(bytes.subarray(p+46,p+46+filenameLength));
    assert.equal(view.getUint16(p+10,true),0,'STORE compression');
    assert.equal(view.getUint16(p+8,true),0x0800,'UTF-8 flag');
    const start=view.getUint32(p+42,true);
    assert.equal(view.getUint32(start,true),0x04034b50);
    const localNameLength=view.getUint16(start+26,true),localExtra=view.getUint16(start+28,true),length=view.getUint32(p+24,true);
    const startData=start+30+localNameLength+localExtra;
    result.push({filename,content:new TextDecoder().decode(bytes.subarray(startData,startData+length)),crc:view.getUint32(p+16,true),size:length});
    p+=46+filenameLength+extra+comment;
  }
  return result;
}
test('ZIP writer produces a readable local archive with nested UTF-8 folders',async()=>{
  const entries=[
    {path:'GeoCauce_Sant Salvador/Cursos/Torrent/Trams/TSS-2/FITXA_II_TSS-2.html',blob:new Blob(['<h1>Fitxa II</h1>'])},
    {path:'GeoCauce_Sant Salvador/Mapes/MAPA_GENERAL.jpg',blob:new Blob(['JPEG IMAGE'])},
    {path:'GeoCauce_Sant Salvador/Cursos/Torrent/Trams/TSS-2/Seccions/Secció 1.html',blob:new Blob(['català'])}
  ];
  const progress=[];
  const blob=await createZip(entries,{onProgress:p=>progress.push(p.current)});
  assert.equal(blob.type,'application/zip');
  const files=findZipEntries(new Uint8Array(await blob.arrayBuffer()));
  assert.equal(files.length,3);
  assert.deepEqual(files.map(f=>f.content),['<h1>Fitxa II</h1>','JPEG IMAGE','català']);
  assert.match(files[2].filename,/Secció 1\.html$/);
  assert.deepEqual(progress,[1,2,3]);
});
test('ZIP writer rejects traversal, duplicate paths and empty selection',async()=>{
  assert.throws(()=>cleanPath('../secret.txt'),/insegura/);
  assert.throws(()=>cleanPath('/root/file.txt'),/insegura/);
  assert.throws(()=>cleanPath('a//b.txt'),/insegura/);
  await assert.rejects(createZip([]),/No hi ha fitxers/);
  await assert.rejects(createZip([{path:'root/a.txt',blob:new Blob(['a'])},{path:'root/a.txt',blob:new Blob(['b'])}]),/repetit/);
});
test('old individual exports stay on their original native/browser path',()=>{
  const start=app.indexOf('async function exportSelectedContents(){');
  const end=app.indexOf('function initUi(){',start);
  assert.ok(start>0&&end>start);
  const implementation=app.slice(start,end);
  assert.match(implementation,/nativeExportProfileSheetPdf\(payload\)/);
  assert.match(implementation,/nativeExportReachSheetPdf\(payload\)/);
  assert.match(implementation,/nativeExportSectionSheetPdf\(payload\)/);
  assert.match(implementation,/localExportTreeSelection\(\)/);
});
test('selection tree supports course, reach, section, map and unassigned section groups',()=>{
  const start=app.indexOf('function openDownloadContents(){');
  const end=app.indexOf('function localExportHtml(',start);
  const src=app.slice(start,end);
  for(const key of ['Mapes','Cursos d’aigua','Trams','Seccions','Seccions sense tram','course:','reachsheet:','sectionsheet:','__general_map__','data-export-folder']){
    assert.ok(src.includes(key),'tree missing '+key);
  }
  assert.match(src,/details\?\.querySelectorAll\('input\[type="checkbox"\]'\)/);
  assert.match(src,/master\.onchange/);
  assert.match(src,/group\.indeterminate/);
});
test('ZIP exports PDF/JPG locally without invoking cloud sync or altering project records',()=>{
  const part=app.slice(app.indexOf('function localExportLoadImage('),app.indexOf('function exportWrapText('));
  assert.match(part,/window\.GeoCauceLocalZip\.createZip/);
  assert.match(part,/createPdfFromImages/);
  assert.match(part,/localCoursePdfPages/);
  assert.doesNotMatch(part,/localExportHtml|text\/html/);
  assert.match(part,/await downloadBlob\(zip,rootName\+'\.zip'\)/);
  assert.doesNotMatch(part,/cloudFetch\(|cloudUpload|cloudDownload|dbClear\(|dbDelete\(|deleteProject\(/);
});
test('PDF UI has an all-selection checkbox, both export actions and cached module',()=>{
  assert.match(html,/id="downloadContentsSelectAll"/);
  assert.match(html,/id="downloadContentsZip"/);
  assert.match(html,/id="downloadContentsExport"/);
  assert.match(html,/local-export-zip\.js\?v=20261015-download-r23/);
  assert.match(sw,/mobile-pwa-r23/);
  assert.match(sw,/"local-export-zip\.js"/);
  assert.match(html,/fitxes PDF/);
});
test('all scripts parse',()=>{
  assert.doesNotThrow(()=>new vm.Script(app));
  assert.doesNotThrow(()=>new vm.Script(zipSource));
});


test('project-date ZIP folder uses the local export day without an extra product prefix',()=>{
  const part=app.slice(app.indexOf('function localArchiveRootName('),app.indexOf('function localExportTreeSelection('));
  assert.match(part,/d\.getFullYear\(\)/);
  assert.match(part,/d\.getMonth\(\)\+1/);
  assert.match(part,/d\.getDate\(\)/);
  assert.match(part,/localArchiveSegment\(state\.project\?\.name/);
  assert.doesNotMatch(part,/GeoCauce_/);
  assert.match(app,/root\.dataset\.archiveRoot=projectRoot/);
  assert.match(app,/dataset\.archiveRoot\|\|localArchiveRootName/);
});
test('all hierarchical FITXA files use PDF extensions; the general map remains JPG',()=>{
  const part=app.slice(app.indexOf('function openDownloadContents(){'),app.indexOf('function localExportLoadImage('));
  assert.match(part,/MAPA_GENERAL_.*\.jpg/);
  assert.ok((part.match(/\.pdf/g)||[]).length>=4);
  assert.doesNotMatch(part,/\.html/);
});
test('PDF writer embeds genuine image objects and a correct byte-offset cross reference',async()=>{
  const sample='/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AD//Z';
  const blob=new Blob([Buffer.from(sample,'base64')],{type:'image/jpeg'});
  const pdf=await createPdfFromJpegs([{blob,width:2,height:2},{blob,width:2,height:2}]);
  assert.equal(pdf.type,'application/pdf');
  const bytes=Buffer.from(await pdf.arrayBuffer()),src=bytes.toString('latin1');
  assert.match(src,/^%PDF-1\.4/);
  assert.match(src,/\/Count 2 \/Kids \[3 0 R 6 0 R\]/);
  assert.equal((src.match(/\/Filter \/DCTDecode/g)||[]).length,2);
  const match=/startxref\n(\d+)\n%%EOF/.exec(src);
  assert.ok(match,'PDF has its cross reference pointer');
  const pos=Number(match[1]);
  assert.equal(src.slice(pos,pos+4),'xref');
  const body=src.slice(pos).split('\n'),count=Number(body[1].split(' ')[1]);
  assert.equal(count,9);
  for(let i=1;i<count;i++){
    const line=body[i+2],offset=Number(line.slice(0,10));
    assert.ok(src.slice(offset).startsWith(i+' 0 obj\n'),'PDF object '+i+' has correct byte offset');
  }
});

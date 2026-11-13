/* Prepare mixed GeoPackage vector and tile layers entirely in the browser. */
(function(root){
 'use strict';
 const fail=message=>{throw Error('GeoPackage: '+message);};
 async function prepare(file,config={},deps={},progress=()=>{}){
  if(!root.GeoCauceGpkg)fail('falta gpkg-lite.js');
  progress(.05,'Llegint el GeoPackage…');
  const gpkg=root.GeoCauceGpkg.open(await file.arrayBuffer()),vectors=[],rasters=[],warnings=[];
  const dst=deps.projectEpsg(),bounds=deps.rasterBounds(),records=gpkg.contents;
  const features=records.filter(x=>x.data_type==='features'),tiles=records.filter(x=>x.data_type==='tiles');
  let done=0;
  for(const entry of features){
   progress(.08+.35*(++done/Math.max(1,features.length)),'Geometria '+entry.table_name);
   const col=gpkg.geometryColumns.find(x=>x.table_name===entry.table_name);
   if(!col){warnings.push(entry.table_name+': falta la definició de geometria');continue;}
   const src=Number(col.srs_id??entry.srs_id),geometry=[],shape=String(col.geometry_type_name||'').toUpperCase();
   if(!src||src<1)fail(entry.table_name+': EPSG desconegut; defineix el CRS a QGIS');
   let index=0;
   for(const row of gpkg.db.rows(entry.table_name)){
    const binary=row[col.column_name];if(!(binary instanceof Uint8Array))continue;
    const g=gpkg.decodeGeometry(binary),paths=g.paths.map(p=>p.map(q=>deps.transform(q,src,dst)));
    if(!paths.length)continue;
    const bb=deps.pointsBounds(paths);
    if(!bb||(bounds&&!deps.intersects(bb,bounds)))continue;
    const attrs={};for(const [key,v] of Object.entries(row))if(key!==col.column_name)
     attrs[key]=v instanceof Uint8Array?'[BLOB]':v;
    geometry.push({paths,shapeType:g.shapeType,attrs,label:deps.featureLabel(attrs),bounds:bb});
    if(++index%400===0)await new Promise(resolve=>setTimeout(resolve,0));
   }
   const kind=/POLYGON|SURFACE/.test(shape)?'polygon':/POINT/.test(shape)?'point':'line';
   const color=deps.color(config.color),name=config.displayName&&features.length===1&&!tiles.length?config.displayName:(entry.identifier||entry.table_name);
   vectors.push({id:deps.id('v'),name,sourceName:entry.table_name,sourceType:'geopackage',
    sourcePackage:file.name,sourceEpsg:src,projectEpsg:dst,geometryType:kind,role:config.role||'reference',
    customRole:config.customRole||'',visible:true,opacity:.85,color,strokeWidth:2.5,
    vectorStyle:{kind,strokeColor:color,strokeWidth:2.5,strokeUnit:'px',strokeOpacity:1,
     strokeDash:'dash',strokeOffset:0,offsetUnit:'px',lineCap:'round',lineJoin:'round',
     fillColor:color,fillStyle:'none',fillOpacity:0,pointColor:color,pointOpacity:1,
     pointSize:6,pointUnit:'px',pointShape:'circle'},
    features:geometry,importedAt:Date.now(),clippedToRasterExtent:!!bounds});
  }
  done=0;
  for(const entry of tiles){
   progress(.47+.13*(++done/Math.max(1,tiles.length)),'Teseles '+entry.table_name);
   const set=gpkg.matrixSets.find(x=>x.table_name===entry.table_name);
   if(!set){warnings.push(entry.table_name+': falta gpkg_tile_matrix_set');continue;}
   const src=Number(set.srs_id??entry.srs_id);
   if(!(src===dst||(src===32631&&dst===25831)||(src===32630&&dst===25830))){
    warnings.push(entry.table_name+': EPSG:'+src+' no compatible amb EPSG:'+dst+'; reprojeta el mapa a QGIS');
    continue;
   }
   const levels=gpkg.matrix.filter(x=>x.table_name===entry.table_name).sort((a,b)=>b.zoom_level-a.zoom_level);
   const meta=new Map(levels.map(m=>[m.zoom_level,{m,minC:Infinity,maxC:-Infinity,minR:Infinity,maxR:-Infinity,count:0}]));
   for(const tile of gpkg.db.rows(entry.table_name)){
    const st=meta.get(tile.zoom_level);if(!st||!(tile.tile_data instanceof Uint8Array))continue;
    st.count++;st.minC=Math.min(st.minC,tile.tile_column);st.maxC=Math.max(st.maxC,tile.tile_column);
    st.minR=Math.min(st.minR,tile.tile_row);st.maxR=Math.max(st.maxR,tile.tile_row);
   }
   const available=[...meta.values()].filter(x=>x.count>0);
   if(!available.length){warnings.push(entry.table_name+': sense teseles');continue;}
   const dimensions=st=>({width:(st.maxC-st.minC+1)*st.m.tile_width,height:(st.maxR-st.minR+1)*st.m.tile_height});
   const selected=available.find(st=>{const d=dimensions(st);return d.width<=4096&&d.height<=4096&&d.width*d.height<=16000000;})||available.at(-1);
   const nat=dimensions(selected);
   const scale=Math.min(1,4096/nat.width,4096/nat.height,Math.sqrt(16000000/(nat.width*nat.height)));
   const w=Math.max(1,Math.round(nat.width*scale)),h=Math.max(1,Math.round(nat.height*scale));
   if(scale<1)warnings.push(entry.table_name+': vista de teseles reduïda a '+w+' × '+h+' px per protegir la memòria. Per editar el raster a resolució completa, exporta un GeoTIFF des de QGIS.');
   const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
   const ctx=canvas.getContext('2d');if(!ctx)fail('el navegador no permet dibuixar el mapa');ctx.imageSmoothingEnabled=true;
   let count=0;
   for(const tile of gpkg.db.rows(entry.table_name)){
    if(tile.zoom_level!==selected.m.zoom_level||!(tile.tile_data instanceof Uint8Array))continue;
    let bmp;
    try{bmp=await createImageBitmap(new Blob([tile.tile_data]));}
    catch{fail(entry.table_name+': tesela no compatible (possiblement TIFF de cobertura). Exporta-la com a GeoTIFF a QGIS');}
    ctx.drawImage(bmp,(tile.tile_column-selected.minC)*selected.m.tile_width*scale,
     (tile.tile_row-selected.minR)*selected.m.tile_height*scale,
     selected.m.tile_width*scale,selected.m.tile_height*scale);
    bmp.close?.();
    if(++count%16===0){progress(.62+.3*count/selected.count,'Teseles '+count+'/'+selected.count);await new Promise(resolve=>setTimeout(resolve,0));}
   }
   const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('No s’ha pogut generar el mapa')),'image/png'));
   const image=await createImageBitmap(blob),m=selected.m;
   const affine={A:nat.width*m.pixel_x_size/w,D:0,B:0,E:-nat.height*m.pixel_y_size/h,
    C:Number(set.min_x)+selected.minC*m.tile_width*m.pixel_x_size,
    F:Number(set.max_y)-selected.minR*m.tile_height*m.pixel_y_size};
   rasters.push({id:deps.id('r'),name:entry.identifier||entry.table_name,blob,image,sourceBlob:null,
    affine,georef:true,visible:true,opacity:1,renderMode:'smooth',
    meta:{sourceType:'gpkg-tiles',sourcePackage:file.name,sourceTable:entry.table_name,epsg:src,
     kind:'map',sourceWidth:nat.width,sourceHeight:nat.height,displayWidth:w,displayHeight:h,
     downsample:nat.width/w,zoomLevel:m.zoom_level}});
  }
  for(const entry of records)if(!['features','tiles','attributes'].includes(entry.data_type))
   warnings.push(entry.table_name+': '+entry.data_type+' no admès (exporta a GeoTIFF si és raster altimètric)');
  if(!vectors.length&&!rasters.length)fail('cap capa compatible. '+warnings.join('; '));
  progress(.98,'Capes llestes');
  return{kind:'geopackage',layers:vectors,rasters,warnings};
 }
 root.GeoCauceGpkgImporter={prepare};
})(typeof window==='object'?window:globalThis);

const CACHE='geocauce-v0.16.40-mobile-pwa-r28-hillshade-chunks';
const ASSETS=["./", "index.html", "styles.css", "mobile-pwa.css", "app.js", "local-export-zip.js", "field-sheet-pdf.js", "cloud-delta-sync.js", "project-access.js", "project-sharing-ui.js", "modal-layer.js", "mobile-pwa.js", "supabase-config.js", "native-adapter.js", "geotiff-lite.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "logo-geocauce.png", "mobile-mountain.png", "icons/acercar.png", "icons/ajustes.svg", "icons/alejar.png", "icons/borrador.png", "icons/brujula.png", "icons/camara.png", "icons/cambio.png", "icons/canal.png", "icons/capas.png", "icons/centrar.png", "icons/cerrar.png", "icons/deshacer.png", "icons/duplicar.png", "icons/editar.png", "icons/editar_propiedad.png", "icons/eliminar.svg", "icons/etiqueta.png", "icons/ficha.png", "icons/fotos.png", "icons/gps.png", "icons/guardar.png", "icons/herramienta.png", "icons/importar.png", "icons/info.png", "icons/invisible.png", "icons/mapa.png", "icons/material.png", "icons/mi_posicion.png", "icons/mover.png", "icons/norte.png", "icons/pasado.png", "icons/pintar.png", "icons/proyecto.png", "icons/rellenar.png", "icons/rio.png", "icons/seccion.svg", "icons/seleccionar.png", "icons/visita.png", "icons/libreta.png", "icons/pagina.png", "icons/vista3d.png", "icons/cuenta.svg", "icons/correo.svg", "icons/candado.svg", "icons/ojo.svg", "icons/offline.svg", "icons/nube.svg", "icons/sincronizar.svg", "icons/mas.svg"];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('geocauce-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  // Authenticated requests (Supabase), APIs and maps never enter the application cache.
  if(url.origin!==self.location.origin)return;
  const isAppShell=e.request.mode==='navigate'||/\.(?:js|css|html|webmanifest)$/.test(url.pathname);
  if(isAppShell){
    // Network-first prevents old JavaScript from repeatedly coming back from an older cache.
    e.respondWith(fetch(e.request,{cache:'no-store'}).then(response=>{
      if(response.ok){const copy=response.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}
      return response;
    }).catch(async()=>{
      const cached=await caches.match(e.request);
      if(cached)return cached;
      const canonical=new Request(url.origin+url.pathname);
      return await caches.match(canonical)||(e.request.mode==='navigate'?(await caches.match('./')||await caches.match('index.html')):Response.error());
    }));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(response=>{
    if(response.ok){const copy=response.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}
    return response;
  })));
});

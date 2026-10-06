(() => {
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const shell=$('#mobileShell'), content=$('#mobileContent'), mapBar=$('#mobileMapBar');
const api=window.GeoCauceMobileApi;
if(!shell||!content||!api)return;
let route='home', mapOpening=false;
const ACTIVE_KEY='geocauce-active-project-v010';
const previewMobile=new URLSearchParams(location.search).get('previewMobile')==='1';
const isNarrow=()=>matchMedia('(max-width: 820px)').matches;
const mode=()=>api.getSettings()?.mobileUi||'auto';
const simpleEnabled=()=>previewMobile||mode()==='simple'||(mode()==='auto'&&isNarrow());
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmtDate=t=>{if(!t)return '—';const d=new Date(t);return Number.isFinite(+d)?d.toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'}):String(t)};
const selectedProjectId=()=>localStorage.getItem(ACTIVE_KEY)||api.getState()?.projectId||api.getProjects()?.[0]?.id||null;
function activeProject(){
  const id=selectedProjectId(), ps=api.getProjects()||[];
  return ps.find(p=>p.id===id)||((api.getState()?.projectId===id)?api.getState()?.project:null)||null;
}
function stats(p){try{return api.projectStats(p.id)}catch{return{campaigns:0,elements:0}}}
function updateGps(){const g=api.getState()?.gnss, t=$('#mGpsText');if(t)t.textContent=g&&Number.isFinite(g.accuracy)?`Precisión ±${Math.round(g.accuracy)} m`:'Precisión —';}
function markNav(name){$$('[data-m-route]').forEach(b=>b.classList.toggle('active',b.dataset.mRoute===name));}
function setBusy(on,label='Cargando proyecto…'){
  let el=$('#mBusy');
  if(!el){el=document.createElement('div');el.id='mBusy';el.className='m-busy hidden';el.innerHTML='<div class="m-busy-card"><span class="m-spinner"></span><b></b></div>';document.body.appendChild(el);}
  el.querySelector('b').textContent=label;el.classList.toggle('hidden',!on);
}
function showShell(next='home'){
  if(!simpleEnabled())return;
  route=next;document.body.classList.remove('mobile-map-lite');mapBar.classList.add('hidden');
  ['splash','projectScreen','projectCreateScreen','settingsScreen','mapScreen'].forEach(id=>$('#'+id)?.classList.add('hidden'));
  shell.classList.remove('hidden');markNav(next);render();updateGps();
}
async function ensureProjectLoaded(){
  const id=selectedProjectId();if(!id)return false;
  if(api.getState()?.projectId===id&&api.getState()?.project)return true;
  if(mapOpening)return false;
  mapOpening=true;setBusy(true,'Cargando proyecto y mapas…');
  try{await api.openProject(id);return api.getState()?.projectId===id;}
  catch(err){console.error(err);return false;}
  finally{mapOpening=false;setBusy(false);}
}
async function showMap(){
  if(!simpleEnabled())return;
  const p=activeProject();if(!p){showShell('projects');return;}
  const ok=await ensureProjectLoaded();if(!ok){showShell('projects');return;}
  shell.classList.add('hidden');document.body.classList.add('mobile-map-lite');
  $('#mapScreen')?.classList.remove('hidden');mapBar.classList.remove('hidden');
  try{api.getState().screen='map';}catch{}
  requestAnimationFrame(()=>{window.dispatchEvent(new Event('resize'));setTimeout(()=>window.dispatchEvent(new Event('resize')),120);});
}
function selectProjectMobile(id){
  const p=(api.getProjects()||[]).find(x=>x.id===id);if(!p)return;
  localStorage.setItem(ACTIVE_KEY,id);
  if(route==='projects')render();else showShell('projects');
}
function card(icon,title,text,klass='',routeName=''){return `<button class="m-card m-feature-card ${klass}" ${routeName?`data-go="${routeName}"`:''}><span class="m-ico"><img src="${icon}" alt=""></span><h3>${title}</h3><p>${text}</p><span class="m-card-chevron">›</span><span class="m-hills"></span></button>`}
function home(){
 const p=activeProject(), name=p?.name||'Sin proyecto activo';
 return `<div class="m-eyebrow">HOLA</div><h1 class="m-title">Explora, documenta<br>y conserva nuestros cauces</h1><p class="m-subtitle">Geología, paisaje e historia en un mismo lugar.</p>
 <div class="m-grid2">${card('icons/mapa.png','Mapa','Consulta capas, explora el territorio y localiza puntos de interés.','','map')}${card('icons/proyecto.png','Proyectos','Gestiona tus proyectos, sitios y observaciones en el territorio.','sand','projects')}</div>
 <button class="m-hero" data-go="history"><span class="m-badge">▣ &nbsp; DESTACADO</span><h2>Fotografías históricas ›</h2><p>Observa cómo han cambiado los cauces a lo largo del tiempo. Compara fotografías antiguas y actuales.</p><span class="m-polaroid"></span></button>
 <div class="m-grid2 m-grid-secondary">${card('icons/libreta.png','Libreta de campo','Registra observaciones, mediciones y notas de tus salidas.','','notebook')}${card('icons/capas.png','Campañas / capas','Activa y gestiona capas temáticas del proyecto.','blue','campaigns')}</div>
 <div class="m-section-row"><section class="m-card m-panel"><div class="m-panel-head"><h3>◷ &nbsp; Actividad reciente</h3></div><div class="m-activity"><span class="m-thumb">⌖</span><div><b>Proyecto activo</b><small>${esc(name)}</small></div></div><div class="m-activity"><span class="m-thumb">▤</span><div><b>Última actualización</b><small>${fmtDate(p?.updatedAt)}</small></div></div></section>
 <section class="m-card m-panel"><div class="m-panel-head"><h3>⌾ &nbsp; Proyecto activo</h3><a data-go="map">Mapa ›</a></div><div class="m-near-photo"></div><h3 class="m-project-name">${esc(name)}</h3><p class="m-small-copy">${p?esc(p.objective||'Proyecto de territorio y observaciones de campo.'):'Selecciona un proyecto para empezar.'}</p><button class="m-open-btn" data-go="${p?'map':'projects'}">${p?'Abrir mapa':'Ver proyectos'} ›</button></section></div>`;
}
function projects(){
 const ps=[...(api.getProjects()||[])].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)), active=selectedProjectId();
 return `<div class="m-eyebrow">PROYECTOS</div><h1 class="m-title">Tus proyectos de territorio</h1><p class="m-subtitle">Toca un proyecto para dejarlo activo. El ✓ indica cuál se abrirá en el mapa.</p>
 <div class="m-project-toolbar"><button class="m-icon-action" id="mImportProject" aria-label="Importar proyecto" title="Importar"><img src="icons/importar.png" alt=""></button><button class="m-icon-action primary" id="mNewProject" aria-label="Nuevo proyecto" title="Nuevo proyecto"><img src="icons/mas.svg" alt=""></button></div>
 <div class="m-list">${ps.length?ps.map((p,i)=>{const st=stats(p),isActive=p.id===active;return `<button class="m-project-item ${isActive?'is-active':''}" data-project-id="${esc(p.id)}" aria-pressed="${isActive?'true':'false'}"><div class="m-list-photo ${i%3===2?'bw':''}"></div><div class="m-item-copy"><h3>${esc(p.name)}</h3><div class="m-meta"><strong>●</strong> ${esc([p.torrent,p.zone].filter(Boolean).join(', ')||'Zona sin especificar')}</div><p>${esc(p.objective||p.notes||'Proyecto de territorio y observaciones de campo.')}</p><div class="m-project-stats"><span><b>${st.campaigns}</b>camp.</span><span><b>${st.elements}</b>elem.</span><span><b>◷</b>${fmtDate(p.updatedAt)}</span></div></div><span class="m-project-check" aria-hidden="true">${isActive?'✓':''}</span></button>`}).join(''):`<section class="m-card m-profile-card"><div class="m-profile-avatar"><img src="icons/proyecto.png"></div><h2>Aún no hay proyectos</h2><p>Crea o importa uno para empezar.</p></section>`}</div>`;
}
function history(){const st=api.getState(), pts=(st?.projectId===selectedProjectId()?st?.historicalPhotoPoints:[])||[];const rows=pts.length?pts.map((p,i)=>`<button class="m-history-item" data-history-id="${esc(p.id)}"><div class="m-list-photo ${i%2?'bw':''}"><span class="m-photo-count">▣ ${p.photos?.length||0}</span></div><div class="m-item-copy"><h3>${esc(p.label||p.name||`Punto histórico ${i+1}`)}</h3><div class="m-meta"><strong>●</strong> Punto del proyecto</div><p>${esc(p.notes||'Punto con memoria visual del territorio y seguimiento fotográfico.')}</p><div class="m-meta">◷ ${fmtDate(p.updatedAt||p.createdAt)}</div></div><span class="m-item-arrow">›</span></button>`).join(''):`<section class="m-card m-profile-card"><div class="m-profile-avatar"><img src="icons/fotos.png"></div><h2>Fotografías históricas</h2><p>Abre el proyecto activo y añade puntos fotográficos para verlos aquí.</p></section>`;return `<div class="m-eyebrow">FOTOGRAFÍAS HISTÓRICAS</div><h1 class="m-title">Fotografías históricas</h1><p class="m-subtitle">Puntos con memoria visual del territorio.</p><div class="m-list">${rows}</div><button class="m-add-history" id="mAddHistory">＋ &nbsp; Añadir punto histórico</button>`}
function campaigns(){
 const st=api.getState(),p=activeProject();
 if(!p)return `<section class="m-card m-profile-card"><h2>Sin proyecto activo</h2><p>Selecciona un proyecto para consultar campañas y capas.</p><button class="primary" data-go="projects">Ver proyectos</button></section>`;
 if(st?.projectId!==p.id)return `<section class="m-card m-profile-card"><div class="m-profile-avatar"><img src="icons/capas.png"></div><h2>${esc(p.name)}</h2><p>Carga este proyecto para consultar únicamente sus campañas, observaciones y capas.</p><button class="primary" data-open-selected> Cargar proyecto </button></section>`;
 const cs=st.campaigns||[],rs=st.rasters||[];
 return `<div class="m-eyebrow">PROYECTO ACTIVO</div><h1 class="m-title">${esc(p.name)}</h1><p class="m-subtitle">● ${cs.length} campañas · ${(st.features||[]).length} observaciones</p><section class="m-card m-panel"><div class="m-campaign-title"><span class="m-campaign-icon"><img src="icons/capas.png"></span><div><h2>Campañas</h2><p>Contenido exclusivo de este proyecto.</p></div></div><div class="m-stack">${cs.map(c=>`<div class="m-layer-row"><div class="m-layer-preview"></div><div class="m-layer-copy"><h3>${esc(c.name||c.id)} ${c.id===st.editableCampaign?'<small>Actual</small>':''}</h3><p>${esc(c.date||'')} · ${(c.order||[]).length} obs.</p></div><div class="m-switch"></div></div>`).join('')||'<p>No hay campañas.</p>'}</div><div class="m-section-sep"></div><div class="m-campaign-title"><span class="m-campaign-icon"><img src="icons/mapa.png"></span><div><h2>Capas del mapa</h2><p>${rs.length} capas cargadas.</p></div></div><div class="m-stack">${rs.slice(0,5).map(r=>`<div class="m-layer-row"><div class="m-layer-preview"></div><div class="m-layer-copy"><h3>${esc(r.name||'Capa')}</h3><p>${esc(r.meta?.kind||'Mapa raster')}</p></div><div class="m-switch"></div></div>`).join('')||'<p class="m-muted-copy">No hay capas importadas todavía.</p>'}</div></section>`;
}
function profile(){const p=activeProject();return `<div class="m-eyebrow">PERFIL</div><h1 class="m-title">GeoCauce</h1><p class="m-subtitle">Cuenta, sincronización y preferencias.</p><section class="m-card m-profile-card"><div class="m-profile-avatar"><img src="icons/cuenta.svg"></div><h2>${esc(p?.author||'Usuario de campo')}</h2><p>${esc(p?.institution||'Datos locales y Supabase cuando hay una cuenta vinculada.')}</p><div class="m-profile-actions"><button class="primary" data-go="settings">Configuración</button><button data-go="projects">Tus proyectos</button><button data-go="map">Abrir mapa</button></div></section>`}
function render(){if(route==='projects')content.innerHTML=projects();else if(route==='history')content.innerHTML=history();else if(route==='campaigns')content.innerHTML=campaigns();else if(route==='profile')content.innerHTML=profile();else content.innerHTML=home();wire();}
function ensureObservationSheet(){
 let sheet=$('#mObservationSheet');if(sheet)return sheet;
 sheet=document.createElement('div');sheet.id='mObservationSheet';sheet.className='m-observation-sheet hidden';sheet.innerHTML=`<button class="m-sheet-backdrop" data-close-observation aria-label="Cerrar"></button><section class="m-sheet-card"><div class="m-sheet-handle"></div><div class="m-sheet-head"><div><small>NUEVA OBSERVACIÓN</small><h2>¿Qué quieres registrar?</h2></div><button class="m-sheet-close" data-close-observation aria-label="Cerrar">×</button></div><div class="m-observation-grid"><button data-observation-tool="gps"><img src="icons/gps.png" alt=""><span>Punto GPS</span></button><button data-observation-tool="photo"><img src="icons/camara.png" alt=""><span>Foto</span></button><button data-observation-tool="historicalPhoto"><img src="icons/fotos.png" alt=""><span>Foto histórica</span></button><button data-observation-tool="section"><img src="icons/seccion.svg" alt=""><span>Sección</span></button><button data-observation-tool="watercourse"><img src="icons/rio.png" alt=""><span>Cauce / canal</span></button><button data-observation-tool="boundary"><img src="icons/editar.png" alt=""><span>Límite</span></button></div></section>`;
 document.body.appendChild(sheet);
 $$('[data-close-observation]').forEach(b=>b.onclick=()=>sheet.classList.add('hidden'));
 $$('[data-observation-tool]').forEach(b=>b.onclick=async()=>{const tool=b.dataset.observationTool;sheet.classList.add('hidden');await showMap();setTimeout(()=>{try{api.setTool(tool)}catch{}},100);});
 return sheet;
}
function openObservationSheet(){if(!activeProject()){showShell('projects');return;}ensureObservationSheet().classList.remove('hidden');}
function wire(){
  $$('[data-go]').forEach(el=>el.onclick=e=>{e.preventDefault();go(el.dataset.go)});
  $$('[data-project-id]').forEach(el=>el.onclick=()=>selectProjectMobile(el.dataset.projectId));
  $$('[data-history-id]').forEach(el=>el.onclick=()=>{try{api.openHistoricalPhotoPoint(el.dataset.historyId)}catch{}});
  $$('[data-open-selected]').forEach(el=>el.onclick=async()=>{await ensureProjectLoaded();showShell('campaigns')});
  const np=$('#mNewProject');if(np)np.onclick=()=>{shell.classList.add('hidden');api.showProjectCreate(null,'projects')};
  const ip=$('#mImportProject');if(ip)ip.onclick=()=>$('#projectImportInput')?.click();
  const ah=$('#mAddHistory');if(ah)ah.onclick=async()=>{await showMap();setTimeout(()=>api.setTool('historicalPhoto'),100)};
}
async function go(name){
  if(name==='map'){await showMap();return}
  if(name==='new'){openObservationSheet();return}
  if(name==='campaigns'){if(activeProject()&&api.getState()?.projectId!==selectedProjectId())await ensureProjectLoaded();showShell('campaigns');return}
  if(name==='history'){if(activeProject()&&api.getState()?.projectId!==selectedProjectId())await ensureProjectLoaded();showShell('history');return}
  if(name==='notebook'){if(activeProject()){await ensureProjectLoaded();try{api.openNotebook()}catch{}}else showShell('projects');return}
  if(name==='settings'){shell.classList.add('hidden');api.showSettings('projects');return}
  showShell(name);
}
$$('[data-m-route]').forEach(b=>b.onclick=()=>go(b.dataset.mRoute));
$('#mSettings').onclick=()=>go('settings');
$('#mGpsChip').setAttribute('aria-label','Centrar en mi ubicación');
$('#mGpsChip').onclick=async()=>{if(activeProject()){await showMap();setTimeout(()=>api.locateMe(),100)}else showShell('projects')};
$('#mMapHome').onclick=()=>showShell('home');$('#mMapProjects').onclick=()=>showShell('projects');$('#mMapProfile').onclick=()=>showShell('profile');$('#mMapAdd').onclick=openObservationSheet;
window.addEventListener('geocauce-settings-changed',()=>{if(simpleEnabled()){if($('#settingsScreen')&&!$('#settingsScreen').classList.contains('hidden'))return;showShell(route||'home')}else{shell.classList.add('hidden');mapBar.classList.add('hidden');document.body.classList.remove('mobile-map-lite')}});
window.addEventListener('resize',()=>{if(mode()==='auto'){if(isNarrow()){const projectVisible=$('#projectScreen')&&!$('#projectScreen').classList.contains('hidden');if(projectVisible)showShell('home')}else{shell.classList.add('hidden');mapBar.classList.add('hidden');document.body.classList.remove('mobile-map-lite')}}});
const observer=new MutationObserver(()=>{if(!simpleEnabled())return;const ps=$('#projectScreen');if(ps&&!ps.classList.contains('hidden')&&shell.classList.contains('hidden')&&mapBar.classList.contains('hidden'))showShell('home')});
observer.observe($('#app'),{subtree:true,attributes:true,attributeFilter:['class']});
setTimeout(()=>{if(previewMobile){showShell('home');return;}if(simpleEnabled()){const choice=localStorage.getItem('geocauce-auth-entry-choice-v1');const hasSession=!!localStorage.getItem('geocauce-cloud-session-v1');if(choice==='offline'||choice==='account'||hasSession){if(api.getProjects().length)showShell('home')}}},80);
})();

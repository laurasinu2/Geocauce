(() => {
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const shell=$('#mobileShell'), content=$('#mobileContent'), mapBar=$('#mobileMapBar');
const api=window.GeoCauceMobileApi;
if(!shell||!content||!api)return;
let route='home';
const previewMobile=new URLSearchParams(location.search).get('previewMobile')==='1';
const isNarrow=()=>matchMedia('(max-width: 820px)').matches;
const mode=()=>api.getSettings()?.mobileUi||'auto';
const simpleEnabled=()=>previewMobile||mode()==='simple'||(mode()==='auto'&&isNarrow());
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmtDate=t=>{if(!t)return '—';const d=new Date(t);return Number.isFinite(+d)?d.toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'}):String(t)};
function activeProject(){const st=api.getState();return st?.project||api.getProjects()?.find(p=>p.id===localStorage.getItem('geocauce-active-project-v010'))||null;}
function stats(p){try{return api.projectStats(p.id)}catch{return{campaigns:0,elements:0}}}
function updateGps(){const g=api.getState()?.gnss;$('#mGpsText').textContent=g&&Number.isFinite(g.accuracy)?`Precisión ±${Math.round(g.accuracy)} m`:'Precisión —';}
function markNav(name){$$('[data-m-route]').forEach(b=>b.classList.toggle('active',b.dataset.mRoute===name));}
function showShell(next='home'){
  if(!simpleEnabled())return;
  route=next;document.body.classList.remove('mobile-map-lite');mapBar.classList.add('hidden');
  ['splash','projectScreen','projectCreateScreen','settingsScreen','mapScreen'].forEach(id=>$('#'+id)?.classList.add('hidden'));
  shell.classList.remove('hidden');markNav(next);render();updateGps();
}
function showMap(){
  if(!simpleEnabled())return;
  const p=activeProject();if(!p){showShell('projects');return;}
  shell.classList.add('hidden');document.body.classList.add('mobile-map-lite');
  $('#mapScreen')?.classList.remove('hidden');mapBar.classList.remove('hidden');
  try{api.getState().screen='map';window.dispatchEvent(new Event('resize'));}catch{}
}
async function openProjectMobile(id){await api.openProject(id);showShell('campaigns');}
function card(icon,title,text,klass='',routeName=''){return `<button class="m-card m-feature-card ${klass}" ${routeName?`data-go="${routeName}"`:''}><span class="m-ico"><img src="${icon}" alt=""></span><h3>${title}</h3><p>${text}</p><span class="m-card-chevron">›</span><span class="m-hills"></span></button>`}
function home(){
 const p=activeProject(), name=p?.name||'Riera de Sant Martí';
 return `<div class="m-eyebrow">HOLA</div><h1 class="m-title">Explora, documenta<br>y conserva nuestros cauces</h1><p class="m-subtitle">Geología, paisaje e historia en un mismo lugar.</p>
 <div class="m-grid2">${card('icons/mapa.png','Mapa','Consulta capas, explora el territorio y localiza puntos de interés.','','map')}${card('icons/proyecto.png','Proyectos','Gestiona tus proyectos, sitios y observaciones en el territorio.','sand','projects')}</div>
 <button class="m-hero" data-go="history"><span class="m-badge">▣ &nbsp; DESTACADO</span><h2>Fotografías históricas ›</h2><p>Observa cómo han cambiado los cauces a lo largo del tiempo. Compara fotografías antiguas y actuales.</p><span class="m-polaroid"></span></button>
 <div class="m-grid2" style="margin-top:12px">${card('icons/libreta.png','Libreta de campo','Registra observaciones, mediciones y notas de tus salidas.','','notebook')}${card('icons/capas.png','Campañas / capas','Activa y gestiona capas temáticas: geología, hidrología, usos del suelo y más.','blue','campaigns')}</div>
 <div class="m-section-row"><section class="m-card m-panel"><div class="m-panel-head"><h3>◷ &nbsp; Actividad reciente</h3><a>Ver todo ›</a></div><div class="m-activity"><span class="m-thumb">⌖</span><div><b>Observación añadida</b><small>${esc(name)} · Hoy</small></div></div><div class="m-activity"><span class="m-thumb">▣</span><div><b>Fotografías guardadas</b><small>Proyecto actual</small></div></div><div class="m-activity"><span class="m-thumb">▤</span><div><b>Proyecto actualizado</b><small>${fmtDate(p?.updatedAt)}</small></div></div></section>
 <section class="m-card m-panel"><div class="m-panel-head"><h3>⌾ &nbsp; Proyecto más cercano</h3><a data-go="map">Ver mapa ›</a></div><div class="m-near-photo"></div><h3 style="margin:8px 0 4px">${esc(name)}</h3><p style="font-size:12px;color:#697177">${p?esc(p.objective||'Proyecto de territorio y observaciones de campo.'):'Abre o crea un proyecto para empezar.'}</p><button class="m-open-btn" data-go="${p?'campaigns':'projects'}">▣ &nbsp; ${p?'Abrir proyecto':'Ver proyectos'} ›</button></section></div>`;
}
function projects(){const ps=[...api.getProjects()].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));return `<div class="m-eyebrow">PROYECTOS</div><h1 class="m-title">Tus proyectos de territorio</h1><p class="m-subtitle">Organiza, documenta y da seguimiento a tus campañas de estudio.</p><div class="m-project-toolbar"><button class="m-pill-btn" id="mImportProject">↥ &nbsp; Importar</button><button class="m-pill-btn primary" id="mNewProject">＋ &nbsp; Nuevo proyecto</button></div><div class="m-project-tabs"><button class="active">◷ &nbsp; Recientes</button><button>⌖ &nbsp; Cerca de ti</button><button>▱ &nbsp; Todos</button></div><div class="m-list">${ps.length?ps.map((p,i)=>{const st=stats(p);return `<button class="m-project-item" data-project-id="${esc(p.id)}"><div class="m-list-photo ${i%3===2?'bw':''}"></div><div class="m-item-copy"><h3>${esc(p.name)}</h3><div class="m-meta"><strong>●</strong> ${esc([p.torrent,p.zone].filter(Boolean).join(', ')||'Zona sin especificar')}</div><p>${esc(p.objective||p.notes||'Proyecto de territorio y observaciones de campo.')}</p><div class="m-project-stats"><span><b>${st.campaigns}</b>campañas</span><span><b>${st.elements}</b>elementos</span><span><b>◷</b>${fmtDate(p.updatedAt)}</span></div></div><span class="m-item-arrow">›</span></button>`}).join(''):`<section class="m-card m-profile-card"><div class="m-profile-avatar"><img src="icons/proyecto.png"></div><h2>Aún no hay proyectos</h2><p>Crea o importa uno para empezar.</p></section>`}</div>`}
function history(){const st=api.getState(), pts=st?.historicalPhotoPoints||[];const rows=pts.length?pts.map((p,i)=>`<button class="m-history-item" data-history-id="${esc(p.id)}"><div class="m-list-photo ${i%2?'bw':''}"><span class="m-photo-count">▣ ${p.photos?.length||0} fotos</span></div><div class="m-item-copy"><h3>${esc(p.label||p.name||`Punto histórico ${i+1}`)}</h3><div class="m-meta"><strong>●</strong> Punto del proyecto &nbsp; ➤ ${Number.isFinite(p.heading)?Math.round(p.heading)+'°':'—'}</div><p>${esc(p.notes||'Punto con memoria visual del territorio y seguimiento fotográfico.')}</p><div class="m-meta">◷ Última actualización: ${fmtDate(p.updatedAt||p.createdAt)}</div></div><span class="m-item-arrow">›</span></button>`).join(''):`<section class="m-card m-profile-card"><div class="m-profile-avatar"><img src="icons/fotos.png"></div><h2>Fotografías históricas</h2><p>Cuando añadas puntos fotográficos históricos aparecerán aquí, ordenados para consultarlos rápidamente desde el móvil.</p></section>`;return `<div class="m-eyebrow">FOTOGRAFÍAS HISTÓRICAS</div><h1 class="m-title">Fotografías históricas</h1><p class="m-subtitle">Puntos con memoria visual del territorio.</p><div class="m-search">Buscar por nombre, río, municipio...</div><div class="m-filter-row"><button class="m-filter active">● &nbsp; Más cerca</button><button class="m-filter">◷ &nbsp; Más recientes</button><button class="m-filter">▣ &nbsp; Más antiguas</button><button class="m-filter">▽ &nbsp; Filtros</button></div><div class="m-list">${rows}</div><button class="m-add-history" id="mAddHistory">＋ &nbsp; Añadir punto histórico</button>`}
function campaigns(){const st=api.getState(),p=activeProject();if(!p)return `<section class="m-card m-profile-card"><h2>Sin proyecto abierto</h2><p>Abre un proyecto para consultar campañas y capas.</p><button class="primary" data-go="projects">Ver proyectos</button></section>`;const cs=st.campaigns||[];const rs=st.rasters||[];return `<div class="m-eyebrow">← &nbsp; VOLVER AL PROYECTO</div><h1 class="m-title">${esc(p.name)}</h1><p class="m-subtitle">● &nbsp; ${cs.length} campañas · ${(st.features||[]).length} observaciones</p><section class="m-card m-panel"><div class="m-campaign-title"><span class="m-campaign-icon"><img src="icons/capas.png"></span><div><h2>Campañas</h2><p>Activa y superpone campañas para comparar cambios en el territorio.</p></div></div><div class="m-stack">${cs.map((c,i)=>`<div class="m-layer-row"><div class="m-layer-preview"></div><div class="m-layer-copy"><h3>${esc(c.name||c.id)} ${c.id===st.editableCampaign?'<small style="color:#28744b">Actual</small>':''}</h3><p>${esc(c.date||'')}<br>${(c.order||[]).length} observaciones</p><div class="m-range"></div></div><div class="m-switch"></div></div>`).join('')||'<p>No hay campañas.</p>'}</div><div class="m-section-sep"></div><div class="m-campaign-title"><span class="m-campaign-icon" style="background:#f2e6d2"><img src="icons/capas.png"></span><div><h2>Capas del mapa</h2><p>Activa y organiza las capas de información del terreno.</p></div></div><div class="m-stack">${rs.slice(0,5).map(r=>`<div class="m-layer-row"><div class="m-layer-preview"></div><div class="m-layer-copy"><h3>${esc(r.name||'Capa')}</h3><p>${esc(r.meta?.kind||'Mapa raster')}</p><div class="m-range"></div></div><div class="m-switch"></div></div>`).join('')||'<p style="color:#687078">No hay capas importadas todavía.</p>'}</div></section>`}
function profile(){const p=activeProject();return `<div class="m-eyebrow">PERFIL</div><h1 class="m-title">GeoCauce</h1><p class="m-subtitle">Cuenta, sincronización y preferencias.</p><section class="m-card m-profile-card"><div class="m-profile-avatar"><img src="icons/cuenta.svg"></div><h2>${esc(p?.author||'Usuario de campo')}</h2><p>${esc(p?.institution||'Datos locales y Supabase cuando hay una cuenta vinculada.')}</p><div class="m-profile-actions"><button class="primary" data-go="settings">⚙ &nbsp; Configuración</button><button data-go="projects">▣ &nbsp; Tus proyectos</button><button data-go="map">⌖ &nbsp; Abrir mapa</button></div></section>`}
function render(){if(route==='projects')content.innerHTML=projects();else if(route==='history')content.innerHTML=history();else if(route==='campaigns')content.innerHTML=campaigns();else if(route==='profile')content.innerHTML=profile();else content.innerHTML=home();wire();}
function wire(){
  $$('[data-go]').forEach(el=>el.onclick=e=>{e.preventDefault();go(el.dataset.go)});
  $$('[data-project-id]').forEach(el=>el.onclick=()=>openProjectMobile(el.dataset.projectId));
  $$('[data-history-id]').forEach(el=>el.onclick=()=>{try{api.openHistoricalPhotoPoint(el.dataset.historyId)}catch{};});
  const np=$('#mNewProject');if(np)np.onclick=()=>{shell.classList.add('hidden');api.showProjectCreate(null,'projects')};
  const ip=$('#mImportProject');if(ip)ip.onclick=()=>$('#projectImportInput')?.click();
  const ah=$('#mAddHistory');if(ah)ah.onclick=()=>{showMap();setTimeout(()=>api.setTool('historicalPhoto'),80)};
}
function go(name){
  if(name==='map'){showMap();return}
  if(name==='new'){showMap();setTimeout(()=>{try{api.setTool('gps')}catch{}},80);return}
  if(name==='notebook'){if(activeProject()){try{api.openNotebook()}catch{}}else showShell('projects');return}
  if(name==='settings'){shell.classList.add('hidden');api.showSettings('projects');return}
  showShell(name);
}
$$('[data-m-route]').forEach(b=>b.onclick=()=>go(b.dataset.mRoute));
$('#mSettings').onclick=()=>go('settings');$('#mGpsChip').onclick=()=>{if(activeProject()){showMap();setTimeout(()=>api.locateMe(),100)}};
$('#mMapHome').onclick=()=>showShell('home');$('#mMapProjects').onclick=()=>showShell('projects');$('#mMapProfile').onclick=()=>showShell('profile');$('#mMapAdd').onclick=()=>{try{api.setTool('gps')}catch{}};
window.addEventListener('geocauce-settings-changed',()=>{if(simpleEnabled()){if($('#settingsScreen')&&!$('#settingsScreen').classList.contains('hidden'))return;showShell(route||'home')}else{shell.classList.add('hidden');mapBar.classList.add('hidden');document.body.classList.remove('mobile-map-lite')}});
window.addEventListener('resize',()=>{if(mode()==='auto'){if(isNarrow()){const projectVisible=$('#projectScreen')&&!$('#projectScreen').classList.contains('hidden');if(projectVisible)showShell('home')}else{shell.classList.add('hidden');mapBar.classList.add('hidden');document.body.classList.remove('mobile-map-lite')}}});
const observer=new MutationObserver(()=>{if(!simpleEnabled())return;const ps=$('#projectScreen');if(ps&&!ps.classList.contains('hidden')&&shell.classList.contains('hidden')&&mapBar.classList.contains('hidden'))showShell('home')});
observer.observe($('#app'),{subtree:true,attributes:true,attributeFilter:['class']});
setTimeout(()=>{if(previewMobile){showShell('home');return;}if(simpleEnabled()){const choice=localStorage.getItem('geocauce-auth-entry-choice-v1');const hasSession=!!localStorage.getItem('geocauce-cloud-session-v1');if(choice==='offline'||choice==='account'||hasSession){if(api.getProjects().length)showShell('home')}}},80);
})();

(() => {
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const mapCanvas = $('#mapCanvas');
const inkCanvas = $('#inkCanvas');
const terrain3dCanvas = $('#terrain3dCanvas');
const mapCtx = mapCanvas.getContext('2d');
const inkCtx = inkCanvas.getContext('2d');
const featureCanvas = document.createElement('canvas');
const featureCtx = featureCanvas.getContext('2d');

const state = {
  screen: 'splash',
  projectId: null,
  project: null,
  tool: 'pan',
  material: 'coarse',
  mapInk: [],
  mapInkColor: '#d73a49',
  mapInkWidth: 4,
  mapInkMode: 'pen',
  mapPins: [],
  mapContextPoint: null,
  pendingPhotoLocation: null,
  historicalPhotoPoints: [],
  showHistoricalPhotoPoints: true,
  currentHistoricalPointId: null,
  pendingHistoricalPhotoPointId: null,
  pendingHistoricalPhotoMode: null,
  historicalLinkPointId: null,
  currentStopId: null,
  campaign: 'D01',
  editableCampaign: 'D01',
  campaigns: [],
  comparePrevious: false,
  compareOpacity: .35,
  view: { cx: 0, cy: 0, scale: 1, rotation: 0 },
  view3d: { active:false, exaggeration:1 },
  rasters: [],
  demGroups: [],
  activeDemGroupId: null,
  referenceLayers: [],
  vectorExtract: null,
  pendingImportedCourseFragments: null,
  features: [],
  selectedId: null,
  currentStroke: null,
  touches: new Map(),
  pinch: null,
  panStart: null,
  pointerPan: null,
  gnss: null,
  sheetTool: 'pen',
  sectionTool: 'pen',
  sectionMaterial: 'none',
  sectionColor: '#1f2b31',
  sectionFillOpacity: .45,
  sectionMeasureTool: 'pen',
  sectionStraightSegments: true,
  sectionGeoClass: 'none',
  sectionZoneClass: 'channel',
  sectionZoneCustom: '',
  currentSection: null,
  pendingPhotoFor: null,
  eraseMode: 'zone',
  eraseSize: 38,
  autoPanAfterDraw: false,
  history: [],
  notebook: {pages:[],currentPageId:null},
  notebookTool: 'pen',
  notebookPenColor: '#1f2b31',
  notebookView: {zoom:1,touches:new Map(),pinch:null,pan:null},
  notebookLinkTarget: null,
  activeCourseId: null,
  pendingCourseStroke: null,
  pendingCourseJoin: null,
  pendingReachStart: null,
  pendingReachBoundaryMove: null,
  editReachId: null,
  profileInkTool: 'pen',
  profileSheetZoom: 1,
  profileSheetTouches: new Map(),
  profileSheetGesture: null,
  currentProfileCourseId: null,
  currentLongProfileCourseId: null,
  longProfileTool: 'profile',
  longProfileColor: '#1f2b31',
  longProfileReachStart: null,
  editCourseId: null,
  editContourFeatureId: null,
  deviceHeading: null,
  nativeCenterOnNextGnss: false,
  pendingNativeLinkPosition: false,
};

const materials = [
  { group:'DEPÓSITOS', id:'fine', name:'Arena fina', kind:'deposit' },
  { group:'DEPÓSITOS', id:'coarse', name:'Arena gruesa', kind:'deposit' },
  { group:'DEPÓSITOS', id:'gravel', name:'Grava', kind:'deposit' },
  { group:'DEPÓSITOS', id:'pebbles', name:'Cantos', kind:'deposit' },
  { group:'DEPÓSITOS', id:'blocks', name:'Bloques', kind:'deposit' },
  { group:'DEPÓSITOS', id:'mixed', name:'Mixto', kind:'deposit' },
  { group:'SUPERFICIALES', id:'alluvium', name:'Aluvión', kind:'surface' },
  { group:'SUPERFICIALES', id:'colluvium', name:'Coluvión', kind:'surface' },
  { group:'ROCA', id:'conglomerate', name:'Conglomerado consolidado', kind:'rock' },
  { group:'ROCA', id:'weak', name:'Conglomerado poco consolid.', kind:'rock' },
  { group:'ROCA', id:'breccia', name:'Brechificado', kind:'rock' },
  { group:'ROCA', id:'clast', name:'Clasto soportado', kind:'rock' },
  { group:'ROCA', id:'matrix', name:'Matriz soportada', kind:'rock' },
];
const materialById = id => materials.find(m => m.id === id) || materials[1];
const ICONS={historicalPhoto:'icons/fotos.png',mapInk:'icons/editar.png',pan:'icons/mover.png',boundary:'icons/editar.png',editContour:'icons/editar_propiedad.png',fill:'icons/rellenar.png',paint:'icons/pintar.png',basin:'icons/mapa.png',watercourse:'icons/rio.png',reach:'icons/etiqueta.png',channel:'icons/canal.png',section:'icons/seccion.svg',photo:'icons/camara.png',gps:'icons/gps.png',select:'icons/seleccionar.png',erase:'icons/borrador.png'};
function iconImg(src,cls=''){return `<img class="${cls}" src="${src}" alt="">`;}

const ANDROID_NATIVE=!!window.GeoCauceNative;
function nativeCall(name,...args){try{const fn=window.GeoCauceNative?.[name];return typeof fn==='function'?fn.apply(window.GeoCauceNative,args):null;}catch(e){console.warn('Native bridge',name,e);return null;}}
function nativeSyncProject(payload){if(!ANDROID_NATIVE||!state.projectId||!state.project)return;nativeCall('syncProjectState',JSON.stringify(state.project),JSON.stringify(payload),JSON.stringify(sectionPalette||[]));}
function nativeSyncPhotoMeta(rec){if(!ANDROID_NATIVE||!state.projectId||!rec)return;const x={...rec};delete x.blob;nativeCall('syncPhotoMeta',state.projectId,JSON.stringify(x));}
function nativeSyncRasterMeta(r){if(!ANDROID_NATIVE||!state.projectId||!r)return;const x={id:r.id,name:r.name,affine:r.affine,georef:r.georef,visible:r.visible,opacity:r.opacity,meta:r.meta||null};nativeCall('syncMapMeta',state.projectId,JSON.stringify(x));}
function nativeRestoreCatalogIfNeeded(){if(!ANDROID_NATIVE||projectCatalog?.length)return;try{const arr=JSON.parse(nativeCall('getProjectCatalog')||'[]');if(Array.isArray(arr)&&arr.length){projectCatalog=arr;localStorage.setItem(PROJECTS_KEY,JSON.stringify(projectCatalog));}}catch(e){console.warn(e);}}


// ===== GeoCauce Cloud / cuenta opcional (v0.13) =====
const AUTH_PREF_KEY='geocauce-entry-choice-v1';
const AUTH_SESSION_KEY='geocauce-supabase-session-v1';
let authUiMode='signin';
let authUiContext='entry';
let cloudSyncTimer=null;
let cloudSyncRunning=false;
let cloudLastError='';
let cloudLastSyncAt=0;

function cloudConfig(){
  const c=window.GEOCAUCE_CLOUD_CONFIG||{};
  return {url:String(c.supabaseUrl||'').replace(/\/$/,''),key:String(c.publishableKey||''),enabled:c.enabled!==false&&!!c.supabaseUrl&&!!c.publishableKey};
}
function cloudConfigured(){return cloudConfig().enabled;}
function loadCloudSession(){try{return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY)||'null');}catch{return null;}}
function saveCloudSession(session){if(session)localStorage.setItem(AUTH_SESSION_KEY,JSON.stringify(session));else localStorage.removeItem(AUTH_SESSION_KEY);refreshAccountUi();}
function authEntryChoice(){return localStorage.getItem(AUTH_PREF_KEY)||'';}
function setAuthEntryChoice(v){if(v)localStorage.setItem(AUTH_PREF_KEY,v);else localStorage.removeItem(AUTH_PREF_KEY);}
function sessionUser(session=loadCloudSession()){return session?.user||null;}
function sessionEmail(session=loadCloudSession()){return sessionUser(session)?.email||'';}
function sessionExpired(session=loadCloudSession()){
  if(!session?.access_token)return true;
  const exp=Number(session.expires_at||0);return !!exp&&Date.now()/1000>exp-45;
}
async function cloudFetch(path,{method='GET',body=null,auth=true,headers={}}={}){
  const cfg=cloudConfig();if(!cfg.enabled)throw new Error('Supabase no está configurado todavía');
  let session=loadCloudSession();
  if(auth&&session?.refresh_token&&sessionExpired(session))session=await refreshCloudSession();
  const h={'apikey':cfg.key,'Content-Type':'application/json',...headers};
  if(auth&&session?.access_token)h.Authorization=`Bearer ${session.access_token}`;
  const r=await fetch(cfg.url+path,{method,headers:h,body:body==null?undefined:JSON.stringify(body)});
  let data=null;const txt=await r.text();if(txt){try{data=JSON.parse(txt);}catch{data=txt;}}
  if(!r.ok){const msg=data?.msg||data?.message||data?.error_description||data?.error||`HTTP ${r.status}`;const e=new Error(msg);e.status=r.status;throw e;}
  return data;
}
async function refreshCloudSession(){
  const old=loadCloudSession();if(!old?.refresh_token)throw new Error('No hay sesión para renovar');
  const cfg=cloudConfig();if(!cfg.enabled)throw new Error('Supabase no está configurado');
  const r=await fetch(`${cfg.url}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:cfg.key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:old.refresh_token})});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.msg||data?.error_description||data?.message||'No se pudo renovar la sesión');
  const next={...old,...data,user:data.user||old.user,expires_at:data.expires_at||Math.floor(Date.now()/1000)+(data.expires_in||3600)};saveCloudSession(next);return next;
}
async function signInCloud(email,password){
  const data=await cloudFetch('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{email,password}});
  const session={...data,expires_at:data.expires_at||Math.floor(Date.now()/1000)+(data.expires_in||3600)};saveCloudSession(session);setAuthEntryChoice('account');return session;
}
async function signUpCloud(email,password){
  const data=await cloudFetch('/auth/v1/signup',{method:'POST',auth:false,body:{email,password}});
  if(data?.access_token){saveCloudSession({...data,expires_at:data.expires_at||Math.floor(Date.now()/1000)+(data.expires_in||3600)});setAuthEntryChoice('account');}
  return data;
}
async function signOutCloud(){
  const session=loadCloudSession();
  try{if(session?.access_token&&cloudConfigured())await cloudFetch('/auth/v1/logout',{method:'POST',body:{},auth:true});}catch(e){console.warn('logout cloud',e);}
  saveCloudSession(null);setAuthEntryChoice('offline');cloudLastError='';refreshAccountUi();
}
function setAuthMessage(msg,type='error'){
  const el=$('#authMessage');if(!el)return;if(!msg){el.classList.add('hidden');el.textContent='';return;}el.textContent=msg;el.classList.remove('hidden','success');if(type==='success')el.classList.add('success');
}
function setAuthMode(mode='signin'){
  authUiMode=mode==='signup'?'signup':'signin';const signup=authUiMode==='signup';
  $('#authTitle').textContent=signup?'Crear cuenta':'Iniciar sesión';$('#authSubmitBtn').innerHTML=signup?'Crear cuenta <span>→</span>':'Entrar <span>→</span>';$('#authSwitchLead').textContent=signup?'¿Ya tienes cuenta?':'¿No tienes cuenta?';$('#authSwitchMode').textContent=signup?'Iniciar sesión':'Crear cuenta';$('#authConfirmWrap').classList.toggle('hidden',!signup);$('#authPassword').setAttribute('autocomplete',signup?'new-password':'current-password');setAuthMessage('');
}
function openAuthModal(context='entry',mode='signin'){
  authUiContext=context;setAuthMode(mode);$('#authModal').classList.remove('hidden');$('#authModal').setAttribute('aria-hidden','false');setTimeout(()=>$('#authEmail')?.focus(),80);
}
function closeAuthModal(){$('#authModal').classList.add('hidden');$('#authModal').setAttribute('aria-hidden','true');setAuthMessage('');}
function enterAppCore(){if(projectCatalog.length)showProjectHome();else showProjectCreate(null,'splash');refreshAccountUi();}
function enterApp(){
  const session=loadCloudSession(),choice=authEntryChoice();
  if(session?.access_token){setAuthEntryChoice('account');enterAppCore();if(sessionExpired(session)&&navigator.onLine)refreshCloudSession().then(()=>{refreshAccountUi();scheduleCloudSync(500);}).catch(()=>refreshAccountUi());return;}
  if(choice==='offline'){enterAppCore();return;}
  if(choice==='account'){enterAppCore();return;}
  openAuthModal('entry','signin');
}
async function submitAuth(){
  const email=$('#authEmail').value.trim(),password=$('#authPassword').value,confirm=$('#authConfirmPassword').value;
  if(!email||!password){setAuthMessage('Escribe el correo y la contraseña.');return;}
  if(authUiMode==='signup'&&password!==confirm){setAuthMessage('Las contraseñas no coinciden.');return;}
  if(!cloudConfigured()){setAuthMessage('La interfaz de cuenta está preparada, pero falta configurar Supabase. Puedes entrar sin conexión mientras tanto.');return;}
  const btn=$('#authSubmitBtn');btn.disabled=true;setAuthMessage(authUiMode==='signup'?'Creando cuenta…':'Iniciando sesión…','success');
  try{
    if(authUiMode==='signup'){
      const data=await signUpCloud(email,password);
      if(data?.access_token){setAuthMessage('Cuenta creada y sesión iniciada.','success');closeAuthModal();refreshAccountUi();if(authUiContext==='entry')enterAppCore();else{scheduleCloudSync(100);openAccountManage();}}
      else{setAuthMode('signin');$('#authEmail').value=email;setAuthMessage('Cuenta creada. Revisa tu correo para confirmarla y después inicia sesión.','success');}
    }else{
      await signInCloud(email,password);closeAuthModal();refreshAccountUi();if(authUiContext==='entry')enterAppCore();else{scheduleCloudSync(100);openAccountManage();}
    }
  }catch(e){setAuthMessage(e.message||String(e));}
  finally{btn.disabled=false;}
}
function chooseOfflineEntry(){setAuthEntryChoice('offline');closeAuthModal();refreshAccountUi();if(authUiContext==='entry')enterAppCore();}
function accountState(){
  const s=loadCloudSession();if(s?.access_token)return{kind:'account',email:sessionEmail(s)||'Cuenta GeoCauce',session:s};
  if(authEntryChoice()==='offline')return{kind:'offline',email:'Sin cuenta'};
  return{kind:'none',email:'Sin cuenta'};
}
function refreshAccountUi(){
  const a=accountState(),online=navigator.onLine,configured=cloudConfigured();
  const name=$('#projectAccountName'),status=$('#projectAccountStatus'),createName=$('#projectCreateAccountName'),createStatus=$('#projectCreateAccountStatus');
  const accountLabel=a.kind==='account'?a.email:'Sin cuenta';const accountStatus=a.kind==='account'?(online?(cloudLastError?'Sincronización pendiente':'Cuenta · datos locales + nube'):'Sin conexión · datos en local'):(configured?'Datos guardados en local':'Datos en local · nube sin configurar');
  if(name)name.textContent=accountLabel;if(status)status.textContent=accountStatus;if(createName)createName.textContent=accountLabel;if(createStatus)createStatus.textContent=accountStatus;
  const title=$('#accountProjectTitle'),sub=$('#accountProjectSub'),action=$('#accountProjectAction'),sync=$('#accountProjectSync');
  if(title)title.textContent=a.kind==='account'?a.email:'Sin cuenta vinculada';
  if(sub)sub.textContent=a.kind==='account'?(online?'SQLite local + copia cloud':'Sin conexión · SQLite local'):'Proyecto guardado solo en este dispositivo';
  if(action){action.textContent=a.kind==='account'?'Gestionar cuenta':'Iniciar sesión';action.onclick=()=>a.kind==='account'?openAccountManage():openAuthModal('manage','signin');}
  if(sync){sync.classList.toggle('hidden',a.kind!=='account');sync.onclick=()=>syncCurrentProjectToCloud({manual:true});}
  renderAccountManageBody();if(state.screen==='settings')renderSettings();
}
function openAccountManage(){$('#accountModal').classList.remove('hidden');renderAccountManageBody();}
function closeAccountManage(){$('#accountModal').classList.add('hidden');}
function renderAccountManageBody(){
  const root=$('#accountManageBody');if(!root)return;const a=accountState(),configured=cloudConfigured(),online=navigator.onLine;
  const subtitle=$('#accountManageSubtitle');if(subtitle)subtitle.textContent=a.kind==='account'?a.email:'Datos locales';
  let html='';
  if(a.kind==='account'){
    html=`<div class="account-status-box"><div class="account-status-row"><span>Cuenta</span><b>${escapeHtml(a.email)}</b></div><div class="account-status-row"><span>Proyecto actual</span><b>${escapeHtml(state.project?.name||'—')}</b></div><div class="account-status-row"><span>Última sincronización</span><b>${cloudLastSyncAt?new Date(cloudLastSyncAt).toLocaleString('es-ES'):'Pendiente'}</b></div></div><div class="account-cloud-state ${online?'sync-good':'sync-warn'}"><img src="icons/${online?'nube':'offline'}.svg" alt=""><span>${online?(cloudLastError?escapeHtml(cloudLastError):'Conexión disponible. GeoCauce seguirá guardando primero en SQLite.'):'Sin conexión. Todo sigue funcionando con SQLite y archivos locales.'}</span></div><p class="account-note">Cerrar sesión no borra ningún proyecto local. Solo desactiva la sincronización de nube hasta que vuelvas a entrar.</p>`;
  }else{
    html=`<div class="account-status-box"><div class="account-status-row"><span>Modo</span><b>Local / sin conexión</b></div><div class="account-status-row"><span>Almacenamiento</span><b>SQLite + archivos del dispositivo</b></div><div class="account-status-row"><span>Nube</span><b>${configured?'Disponible al iniciar sesión':'Pendiente de configurar'}</b></div></div><div class="account-cloud-state sync-warn"><img src="icons/offline.svg" alt=""><span>Puedes trabajar indefinidamente sin cuenta. Si creas una más adelante, tus proyectos locales se pueden asociar y sincronizar.</span></div>`;
  }
  root.innerHTML=html;
  const p=$('#accountManagePrimary'),q=$('#accountManageSecondary');if(!p||!q)return;
  if(a.kind==='account'){p.textContent='Sincronizar ahora';p.onclick=()=>syncCurrentProjectToCloud({manual:true});q.textContent='Cerrar sesión y seguir local';q.onclick=async()=>{await signOutCloud();closeAccountManage();toast('Sesión cerrada · tus datos locales siguen disponibles');};}
  else{p.textContent='Iniciar sesión';p.onclick=()=>{closeAccountManage();openAuthModal('manage','signin');};q.textContent='Crear cuenta';q.onclick=()=>{closeAccountManage();openAuthModal('manage','signup');};}
}
function currentStatePayloadForCloud(){
  if(!state.projectId)return null;try{return JSON.parse(localStorage.getItem(projectStateKey(state.projectId))||'null');}catch{return null;}
}
async function cloudStructuredSnapshot(){
  persistStateLocalOnly();
  const base=currentStatePayloadForCloud()||{};
  let photos=[],rasters=[],vectorLayers=[];
  try{photos=(await dbAll('photos')).map(rec=>{const x={...rec};delete x.blob;return x;});}catch(e){console.warn('Cloud photo metadata',e);}
  try{rasters=(await dbAll('rasters')).map(rec=>{const x={...rec};delete x.blob;delete x.sourceBlob;delete x.image;return x;});}catch(e){console.warn('Cloud raster metadata',e);}
  try{vectorLayers=(await dbAll('vectorLayers')).map(rec=>{const x={...rec};delete x.features;delete x.renderBlob;return x;});}catch(e){console.warn('Cloud vector metadata',e);}
  return {...base,cloudSchema:3,appSettings:cloneAny(appSettings),assetMetadata:{photos,rasters,vectorLayers}};
}
async function syncCurrentProjectToCloud({manual=false}={}){
  if(cloudSyncRunning||!state.projectId||!state.project)return false;
  const session=loadCloudSession();if(!session?.access_token){if(manual)toast('Inicia sesión para sincronizar');return false;}
  if(!cloudConfigured()){if(manual)toast('Supabase todavía no está configurado');return false;}
  if(!navigator.onLine){cloudLastError='Sin conexión · pendiente de sincronizar';refreshAccountUi();if(manual)toast('Sin conexión · los cambios quedan guardados en SQLite');return false;}
  cloudSyncRunning=true;cloudLastError='';refreshAccountUi();
  try{
    const payload=await cloudStructuredSnapshot();
    const session2=sessionExpired(loadCloudSession())?await refreshCloudSession():loadCloudSession();const uid=session2?.user?.id;if(!uid)throw new Error('Sesión sin identificador de usuario');
    const p=state.project;const now=new Date().toISOString();if(p.ownerUserId!==uid){p.ownerUserId=uid;p.updatedAt=Date.now();saveProjectCatalog();state.project=p;nativeSyncProject(payload);}
    const row={id:p.id,owner_id:uid,name:p.name||'Proyecto',zone:p.zone||null,torrent:p.torrent||null,crs:p.crs||'EPSG:25831',metadata:p,updated_at:now};
    await cloudFetch('/rest/v1/projects?on_conflict=id',{method:'POST',body:[row],headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});
    const snap={project_id:p.id,owner_id:uid,state:payload,palette:sectionPalette||[],updated_at:now};
    await cloudFetch('/rest/v1/project_snapshots?on_conflict=project_id',{method:'POST',body:[snap],headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});
    cloudLastSyncAt=Date.now();cloudLastError='';if(manual)toast('Proyecto sincronizado ✓');refreshAccountUi();return true;
  }catch(e){cloudLastError=`Pendiente: ${e.message||e}`;console.warn('Cloud sync',e);if(manual)toast(`No se pudo sincronizar: ${e.message||e}`,5000);refreshAccountUi();return false;}
  finally{cloudSyncRunning=false;}
}
function scheduleCloudSync(delay=7000){clearTimeout(cloudSyncTimer);if(!loadCloudSession()?.access_token||!cloudConfigured())return;cloudSyncTimer=setTimeout(()=>syncCurrentProjectToCloud(),delay);}
function persistStateLocalOnly(){
  if(!state.projectId)return;syncCurrentCampaign();const payload={appVersion:'0.16.36-android-alpha',projectId:state.projectId,tool:state.tool,material:state.material,mapInk:state.mapInk||[],mapInkColor:state.mapInkColor,mapInkWidth:state.mapInkWidth,mapInkMode:state.mapInkMode,mapPins:state.mapPins||[],historicalPhotoPoints:state.historicalPhotoPoints||[],showHistoricalPhotoPoints:state.showHistoricalPhotoPoints!==false,campaign:state.campaign,editableCampaign:state.editableCampaign,campaigns:state.campaigns,comparePrevious:state.comparePrevious,compareOpacity:state.compareOpacity,view:{...state.view,rotation:state.view.rotation||0},eraseMode:state.eraseMode,eraseSize:state.eraseSize,autoPanAfterDraw:state.autoPanAfterDraw,notebook:state.notebook,activeCourseId:state.activeCourseId,referenceLayers:(state.referenceLayers||[]).map(referenceLayerStateRecord),demGroups:state.demGroups,activeDemGroupId:state.activeDemGroupId};localStorage.setItem(projectStateKey(state.projectId),JSON.stringify(payload));touchProject();nativeSyncProject(payload);return payload;
}
window.addEventListener('online',()=>{refreshAccountUi();scheduleCloudSync(800);});window.addEventListener('offline',refreshAccountUi);

const SECTION_PALETTE_KEY='geocauce-section-palette-v1';
const DEFAULT_SECTION_COLORS=[
  {id:'black',name:'Negro',hex:'#1f2b31'},
  {id:'gray',name:'Gris',hex:'#6e716d'},
  {id:'brown',name:'Marrón',hex:'#76533d'},
  {id:'ochre',name:'Ocre',hex:'#c58f45'},
  {id:'blue',name:'Azul',hex:'#2b78a6'},
  {id:'green',name:'Verde',hex:'#5f7d58'},
  {id:'red',name:'Rojo',hex:'#a64a45'}
];
let sectionPalette=[];
function loadSectionPalette(){
  try{const p=JSON.parse(localStorage.getItem(SECTION_PALETTE_KEY)||'null');sectionPalette=Array.isArray(p)&&p.length?p:cloneAny(DEFAULT_SECTION_COLORS);}catch{sectionPalette=cloneAny(DEFAULT_SECTION_COLORS);}
  if(!sectionPalette.some(c=>String(c.hex).toLowerCase()===String(state.sectionColor).toLowerCase()))state.sectionColor=sectionPalette[0]?.hex||'#1f2b31';
}
function saveSectionPalette(){localStorage.setItem(SECTION_PALETTE_KEY,JSON.stringify(sectionPalette));renderSectionColorChips();renderCourseLongProfileColorChips();}
function validHex(v){return /^#[0-9a-f]{6}$/i.test(String(v||''));}
function renderSectionColorChips(){
  const root=$('#sectionColorChips');if(root){root.innerHTML='';for(const col of sectionPalette){const b=document.createElement('button');b.type='button';b.className='section-color-chip';b.style.background=col.hex;b.title=col.name;b.setAttribute('aria-label',col.name);b.classList.toggle('active',String(col.hex).toLowerCase()===String(state.sectionColor).toLowerCase());b.onclick=()=>{state.sectionColor=col.hex;renderSectionColorChips();updateSectionToolHint();$('#sectionColorPopover')?.classList.add('hidden');};root.appendChild(b);}}
  updateSectionCompactSelectors();
}
function openSectionPaletteEditor(){
  renderSectionPaletteRows();$('#sectionPaletteModal').classList.remove('hidden');
}
function renderSectionPaletteRows(){
  const root=$('#sectionPaletteRows');if(!root)return;root.innerHTML='';
  sectionPalette.forEach((col,i)=>{const row=document.createElement('div');row.className='section-palette-row';row.dataset.index=i;row.innerHTML=`<input class="palette-hex" type="color" value="${validHex(col.hex)?col.hex:'#000000'}"><input class="palette-name" type="text" maxlength="30" value="${escapeHtml(col.name||'Color')}"><button type="button" class="icon-only palette-delete" title="Eliminar">${iconImg('icons/eliminar.svg')}</button>`;row.querySelector('.palette-delete').onclick=()=>{if(sectionPalette.length<=1){toast('Debe quedar al menos un color');return;}sectionPalette.splice(i,1);renderSectionPaletteRows();};root.appendChild(row);});
}
function collectSectionPaletteRows(){
  const rows=$$('#sectionPaletteRows .section-palette-row');const next=[];rows.forEach((row,i)=>{const hex=row.querySelector('.palette-hex').value,name=row.querySelector('.palette-name').value.trim()||`Color ${i+1}`;next.push({id:`c${Date.now().toString(36)}_${i}`,name,hex:validHex(hex)?hex:'#000000'});});return next;
}
function updateSectionCompactSelectors(){
  const matNames={none:'Sin trama',sand:'Arena',pebbles:'Cantos',blocks:'Bloques',rock:'Roca',water:'Agua'};const mat=matNames[state.sectionMaterial]||state.sectionMaterial;
  const pat=$('#sectionActivePattern');if(pat){pat.className='section-pattern-swatch pattern-'+(state.sectionMaterial||'none');}
  if($('#sectionActiveMaterial'))$('#sectionActiveMaterial').textContent=mat;
  const col=sectionPalette.find(c=>String(c.hex).toLowerCase()===String(state.sectionColor).toLowerCase());if($('#sectionActiveColor'))$('#sectionActiveColor').style.background=state.sectionColor;if($('#sectionActiveColorName'))$('#sectionActiveColorName').textContent=col?.name||state.sectionColor;
}
function updateSectionToolHint(){
  const el=$('#sectionToolHint');const col=sectionPalette.find(c=>String(c.hex).toLowerCase()===String(state.sectionColor).toLowerCase());const colorName=col?.name||state.sectionColor;const mat={none:'sin trama',sand:'arena',pebbles:'cantos',blocks:'bloques',rock:'roca',water:'agua'}[state.sectionMaterial]||state.sectionMaterial;
  if(el){const hints={select:'Selecciona: toca un arbre, bloc, mesura, línia, polígon o traç i prem “Eliminar seleccionat”.',profile:'Perfil: dibuixa sobre el perfil MDE/LiDAR per corregir-lo.',pen:`Llapis fi · ${colorName}.`,line:'Línia per punts · toca vèrtexs i prem Fet. L’imant uneix punts i perfil.',polygon:'Polígon · toca vèrtexs, tria roca/col·luvi/al·luvi i prem Fet.',tree:'Arbre · pressiona a la base i arrossega fins a la capçada.',shrub:'Arbust · pressiona i arrossega per controlar-ne la mida.',rockSymbol:'Bloc de roca · pressiona al centre i arrossega per definir el radi.',measure:'Mesura · arrossega entre dos punts. S’enganxa horitzontalment quan t’hi apropes.',height:'Alçada · arrossega verticalment fins a una línia o el perfil.',zone:'Zona del perfil · toca dos punts del MDE/perfil i posa el nom sota la topografia.',paint:`Pinzell lliure · ${colorName}.`,fill:`Omplir: envolta l’àrea · ${mat} · ${colorName}.`,eraser:'Goma · esborra tinta i elements de l’esquema.'};el.textContent=hints[state.sectionTool]||'';}
  updateSectionCompactSelectors();
}

function toast(msg, ms=2400) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}
function today() { return new Date().toLocaleDateString('es-ES'); }
function isoToday(){return new Date().toISOString().slice(0,10);}
function displayDate(v){if(!v)return '';if(/^\d{4}-\d{2}-\d{2}$/.test(v)){const [y,m,d]=v.split('-');return `${d}/${m}/${y}`;}return v;}
function safeSlug(v){return String(v||'GeoCauce').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,60)||'GeoCauce';}
function normalizeFeature(f, campaignId=null){
  const n=cloneAny(f||{});
  n.erasures=n.erasures||[];n.photos=n.photos||[];n.ink=n.ink||[];
  if(n.type==='section'){n.sectionInk=n.sectionInk||[];n.sectionObjects=Array.isArray(n.sectionObjects)?n.sectionObjects:[];n.sectionProfile=n.sectionProfile||null;n.sectionView=n.sectionView||{gridStep:1,verticalScale:'1',zoomX:1,centerD:null};if(!Number.isFinite(+n.sectionView.zoomX))n.sectionView.zoomX=1;if(!n.sectionView.verticalScale||n.sectionView.verticalScale==='auto')n.sectionView.verticalScale='1';n.sectionMeasurements=n.sectionMeasurements||{width:'',depth:'',note:'',widthInk:[],depthInk:[],noteInk:[]};n.sheetIII=normalizeSectionSheetIII(n.sheetIII);}
  if(n.type==='reach'){n.fieldSlopeInk=n.fieldSlopeInk||[];n.changeCodeInk=n.changeCodeInk||[];n.observationsInk=n.observationsInk||[];n.fragmentIndex=Number.isInteger(n.fragmentIndex)?n.fragmentIndex:0;n.createdOrder=Number.isFinite(+n.createdOrder)?+n.createdOrder:(n.createdAt||Number(n.startAlong)||0);n.sheetII=n.sheetII||{observer:'',visitDate:'',schemeInk:[],fieldSlope:'',lithology:'',profileType:'',vegetationCover:'',vegetationType:'',anthropic:'',fic:{ad:{score:null,note:''},bd:{score:null,note:''},cd:{score:null,note:''},dd1:{score:null,note:''},dd2:{score:null,note:''}}};}
  if(n.type==='watercourse'){
    n.abbr=n.abbr||'TR';n.name=n.name||n.id;n.kind=n.kind||'main';n.direction=n.direction||'entry';
    if(!Array.isArray(n.fragments)||!n.fragments.length)n.fragments=n.points?.length?[cloneAny(n.points)]:[];
    n.fragments=n.fragments.filter(a=>Array.isArray(a)&&a.length>1).map(a=>a.map(q=>({x:+q.x,y:+q.y})));
    if(!n.fragments.length&&n.points?.length)n.fragments=[cloneAny(n.points)];
    n.points=cloneAny(n.fragments[0]||n.points||[]);
  }
  n.createdCampaign=n.createdCampaign||n.originCampaign||n.campaign||campaignId||'D01';
  delete n.originCampaign;delete n.campaign;
  return n;
}
function featureKey(f){return JSON.stringify(normalizeFeature(f));}
function uid(prefix) {
  const code=prefix === 'section' ? 'SEC' : prefix === 'channel' ? 'CAN' : 'DEP';
  let max=0;
  const seen=[];
  seen.push(...state.features.map(f=>f.id));
  for(const c of state.campaigns||[]) seen.push(...(c.order||[]));
  for(const id of seen){const m=String(id||'').match(new RegExp('^'+code+'-(\\d+)$'));if(m)max=Math.max(max,+m[1]);}
  return `${code}-${String(max+1).padStart(3,'0')}`;
}
function formatNum(n, digits=1) {
  return Number(n).toLocaleString('es-ES', { maximumFractionDigits: digits });
}

const SECTION_TABLE_ROWS=[
  {key:'vegetationCover',label:'Coberta vegetal'},
  {key:'vegetationType',label:'Tipus vegetació'},
  {key:'substrateExposure',label:'% aflora el substrat'},
  {key:'erosionEvidence',label:'Evidència erosió en superfície'},
  {key:'erosionCertainty',label:'Certesa erosió'},
  {key:'accumulationEvidence',label:'Evidència acumulació en superfície (origen)'},
  {key:'accumulationCertainty',label:'Certesa acumulació'},
  {key:'sedimentThickness',label:'Gruix de sediment'},
  {key:'thicknessCertainty',label:'Certesa gruix'},
  {key:'sedimentShape',label:'Forma sediment predominant'},
  {key:'shapeCertainty',label:'Certesa forma'},
  {key:'matrixSupport',label:'Matriu o clast suportat'},
  {key:'maxBlockWeight',label:'Pes bloc màxim (kg)'},
  {key:'grainClasses',label:'Fins a sorra: 3–4 classes i més petites = llim-argila (grans no visibles)'}
];
const SECTION_TABLE_COLS=[['leftSlope','Pendent esquerra'],['leftBank','Banc esquerra'],['channel','Canal'],['rightBank','Banc dret'],['rightSlope','Pendent dreta']];
const SECTION_ZONE_TYPES=[...SECTION_TABLE_COLS,['custom','Personalitzada…']];
function sectionZoneLabel(key=state.sectionZoneClass,custom=state.sectionZoneCustom){
  if(key==='custom')return String(custom||'').trim()||'Zona';
  return SECTION_TABLE_COLS.find(([k])=>k===key)?.[1]||'Zona';
}
function blankFicData(){return{ad:{score:null,note:'',noteInk:[]},bd:{score:null,note:'',noteInk:[]},cd:{score:null,note:'',noteInk:[]},dd1:{score:null,note:'',noteInk:[]},dd2:{score:null,note:'',noteInk:[]}};}
function optionalScore(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null;}
function defaultSectionSheetIII(){return{observer:'',visitDate:'',sectionName:'',sectionType:'',observations:'',table:{},tableInk:{},fic:blankFicData()};}
function normalizeSectionSheetIII(src){const d={...defaultSectionSheetIII(),...(src||{})};d.table=d.table&&typeof d.table==='object'?d.table:{};d.tableInk=d.tableInk&&typeof d.tableInk==='object'?d.tableInk:{};d.fic=d.fic&&typeof d.fic==='object'?d.fic:blankFicData();for(const k of ['ad','bd','cd','dd1','dd2']){const o=d.fic[k]||{};d.fic[k]={score:optionalScore(o.score),note:o.note||'',noteInk:Array.isArray(o.noteInk)?o.noteInk:[]};}return d;}
function ensureSectionSheetData(f){if(!f)return defaultSectionSheetIII();f.sheetIII=normalizeSectionSheetIII(f.sheetIII);if(!f.sheetIII.sectionName)f.sheetIII.sectionName=f.sectionName||f.id;return f.sheetIII;}
function sectionReach(f){return state.features.find(x=>x.id===f?.reachId&&x.type==='reach')||null;}
function reachSections(reachId){return state.features.filter(x=>x.type==='section'&&x.reachId===reachId).slice().sort((a,b)=>(Number.isFinite(+a.reachAlong)?+a.reachAlong:Infinity)-(Number.isFinite(+b.reachAlong)?+b.reachAlong:Infinity));}
function reachSectionNamesText(reach){const arr=reachSections(reach?.id);return arr.length?arr.map(x=>x.sectionName||x.sheetIII?.sectionName||x.id).join(', '):'S1 (inicial), S2 (final), S3 (addicional)';}
function sectionCourse(f){const r=sectionReach(f);return r?reachCourse(r):state.features.find(x=>x.id===f?.courseId&&x.type==='watercourse')||null;}
function calcSectionFicTotal(f){const fic=ensureSectionSheetData(f).fic;let total=0,ok=false;for(const k of ['ad','bd','cd','dd1','dd2']){const v=optionalScore(fic?.[k]?.score);if(v!==null){total+=v;ok=true;}}return ok?total:null;}
function defaultReachSheetII(){return{observer:'',visitDate:'',schemeInk:[],profileInk:[],profileObjects:[],profileVerticalScale:'1',fieldSlope:'',lithology:'',profileType:'',vegetationCover:'',vegetationType:'',anthropic:'',fic:{ad:{score:null,note:'',noteInk:[]},bd:{score:null,note:'',noteInk:[]},cd:{score:null,note:'',noteInk:[]},dd1:{score:null,note:'',noteInk:[]},dd2:{score:null,note:'',noteInk:[]}}};}
function ensureReachSheetData(reach){if(!reach)return defaultReachSheetII();reach.sheetII=reach.sheetII||defaultReachSheetII();reach.sheetII.fic=reach.sheetII.fic||{};for(const k of ['ad','bd','cd','dd1','dd2']){const old=reach.sheetII.fic?.[k]||{};reach.sheetII.fic[k]={score:optionalScore(old.score),note:old.note||'',noteInk:Array.isArray(old.noteInk)?old.noteInk:[]};}reach.sheetII.schemeInk=Array.isArray(reach.sheetII.schemeInk)?reach.sheetII.schemeInk:[];reach.sheetII.profileInk=Array.isArray(reach.sheetII.profileInk)?reach.sheetII.profileInk:[];reach.sheetII.profileObjects=Array.isArray(reach.sheetII.profileObjects)?reach.sheetII.profileObjects:[];if(!['1','2','5'].includes(String(reach.sheetII.profileVerticalScale||'1')))reach.sheetII.profileVerticalScale='1';return reach.sheetII;}
function reachCourse(reach){return state.features.find(f=>f.id===reach?.courseId&&f.type==='watercourse')||null;}
const REACH_FIC_ROWS=[
  {key:'ad',label:'Ad) Distància del pou local: d (m)',options:[{text:'d>100',score:0},{text:'100<d<50',score:10},{text:'50<d<10',score:20},{text:'10<d<5',score:30},{text:'d<5',score:40}]},
  {key:'bd',label:'Bd) Presència de franja de protecció o de vegetació arbustiva al final de la via de',options:[{text:'Ample > 4 m i densa',score:0},{text:'Continua i densa',score:5},{text:'Discontinua—esparsa',score:10},{text:'Evidencies mínimes',score:15},{text:'Absència',score:20}]},
  {key:'cd',label:"Cd) Presència d'evidències de deposició al llarg de la trajectòria pendent avall.",note:"Nota: amb l'absència de processos d'erosió, assignar una puntuació 0.",options:[{text:'Forta deposició',score:0},{text:'Clares evidències',score:5},{text:'Evidencies Discontinues',score:10},{text:'Evidencies mínimes',score:15},{text:'Absència',score:20}]},
  {group:'Superfície de sòl nu'},
  {key:'dd1',label:'Dd1) Rugositat mitjana al llarg de la trajectòria de pendent avall (desviació estàndard de les elevacions perpendiculars a la superfície del sòl — en cm) [calculada al llarg de transsectes de 3 m]',options:[{text:'RR > 4',score:0},{text:'2 < RR < 4',score:5},{text:'1 < RR b<2',score:10},{text:'0.3 < RR < 1.0',score:15},{text:'RR < 0.3',score:20}]},
  {key:'dd2',label:"Dd2) a nivell de sòl: Mitjana del percentatge de cobertura del dosser + percentatge d'àrea basal de les plantes en la trajectòria pendent avall (Cv) (en %)",prefix:'Boscos, pastures, terres de pastura, cultius',options:[{text:'80 < Cv < 100',score:0},{text:'60 < Cv < 80',score:5},{text:'40 < Cv < 60',score:10},{text:'20 < Cv < 40',score:15},{text:'Cv < 20',score:20}]}
];
function calcReachFicTotal(reach){const d=ensureReachSheetData(reach),fic=d.fic||{};let total=0,ok=false;for(const k of ['ad','bd','cd','dd1','dd2']){const v=optionalScore(fic?.[k]?.score);if(v!==null){total+=v;ok=true;}}return ok?total:null;}


const APP_SETTINGS_KEY='geocauce-app-settings-v014';
const DEFAULT_APP_SETTINGS={
  inputMode:'pen', persistentTool:true,
  lengthUnit:'m', clastUnit:'cm', areaUnit:'m2', volumeUnit:'m3', coordMode:'project',
  gpsMinAccuracy:5, photoHeading:true, gpsAltitude:true, showAccuracy:true,
  notebookBg:'white', notebookAutosave:true,
  notebookQuickColors:['#1f2b31','#2563a8','#c43d3d','#2f7d4f'], notebookPenColor:'#1f2b31',
  reachPattern:'{CURS}-{N}', reachCodes:'', vectorImportColor:'#6b5d82', mobileUi:'auto'
};
let appSettings=loadAppSettings();
state.notebookPenColor=appSettings.notebookPenColor||DEFAULT_APP_SETTINGS.notebookPenColor;
function loadAppSettings(){try{const x={...DEFAULT_APP_SETTINGS,...JSON.parse(localStorage.getItem(APP_SETTINGS_KEY)||'{}')};if(!Array.isArray(x.notebookQuickColors)||x.notebookQuickColors.length!==4)x.notebookQuickColors=[...DEFAULT_APP_SETTINGS.notebookQuickColors];return x}catch{return{...DEFAULT_APP_SETTINGS,notebookQuickColors:[...DEFAULT_APP_SETTINGS.notebookQuickColors]}}}
function saveAppSettings(){localStorage.setItem(APP_SETTINGS_KEY,JSON.stringify(appSettings));applyAppSettings();window.dispatchEvent(new CustomEvent('geocauce-settings-changed',{detail:{...appSettings}}));}
function metersFactor(unit){return unit==='mm'?1000:unit==='cm'?100:unit==='km'?.001:1;}
function formatLengthUnit(m,digits=2,unit=appSettings.lengthUnit){const v=m*metersFactor(unit);return `${formatNum(v,digits)} ${unit}`;}
function formatAreaUnit(m2,digits=2){const u=appSettings.areaUnit;const v=u==='ha'?m2/10000:u==='cm2'?m2*10000:m2;return `${formatNum(v,digits)} ${u==='ha'?'ha':u==='cm2'?'cm²':'m²'}`;}
function formatVolumeUnit(m3,digits=2){const u=appSettings.volumeUnit;const v=u==='cm3'?m3*1e6:m3;return `${formatNum(v,digits)} ${u==='cm3'?'cm³':'m³'}`;}
function shouldReturnToPan(){return appSettings.inputMode==='finger' || !appSettings.persistentTool;}
function applyAppSettings(){
  const hint=$('#toolModeHint');if(hint)hint.textContent=appSettings.inputMode==='pen'?'✦ Modo lápiz: la herramienta permanece activa; usa el dedo para mover, seleccionar y pulsar botones.':'✦ Modo dedo: el dedo puede editar; después de dibujar GeoCauce vuelve a Mover.';
  if($('#gnssBadge'))$('#gnssBadge').classList.toggle('settings-hidden-accuracy',!appSettings.showAccuracy);
  if($('#vectorImportColor'))$('#vectorImportColor').value=normalizeVectorColor(appSettings.vectorImportColor);
  updateMaterialButton();if(state.screen==='settings')renderSettings();
}
function showSettings(returnTo=state.screen){
  if(state.projectId&&state.screen==='map')persistState();state.settingsReturn=returnTo;
  hideMainScreens();$('#settingsScreen').classList.remove('hidden');state.screen='settings';renderSettings();
}
function closeSettings(){
  const r=state.settingsReturn||'projects';
  if(r==='map'&&state.projectId){hideMainScreens();$('#mapScreen').classList.remove('hidden');state.screen='map';resize();drawAll();}
  else showProjectHome();
}
function bytesOfJson(v){try{return new TextEncoder().encode(JSON.stringify(v??null)).length}catch{return 0}}
async function storageBreakdown(){
  let maps=0,photos=0;try{for(const r of await dbAll('rasters'))maps+=(r.blob?.size||0)+(r.sourceBlob?.size||0);}catch{}
  try{for(const ph of await dbAll('photos'))photos+=ph.blob?.size||0;}catch{}
  const notebook=bytesOfJson(state.notebook||{}),data=bytesOfJson({campaigns:state.campaigns||[],features:state.features||[],project:state.project||null});
  let quota=null,usage=null;try{const est=await navigator.storage?.estimate?.();quota=est?.quota??null;usage=est?.usage??null;}catch{}
  return{maps,photos,notebook,data,totalKnown:maps+photos+notebook+data,usage,quota};
}
async function renderSettings(){
  const a=accountState(),email=a.kind==='account'?a.email:'Sin cuenta vinculada',online=navigator.onLine;
  $('#settingsAccountName').textContent=a.kind==='account'?a.email:'Sin cuenta';$('#settingsAccountStatus').textContent=a.kind==='account'?(online?'Cuenta · nube disponible':'Sin conexión · datos en local'):'Datos guardados en local';
  $('#settingsProfileName').textContent=a.kind==='account'?'Usuario de campo':'Modo local';$('#settingsProfileEmail').textContent=email;$('#settingsProfileInstitution').textContent=state.project?.institution||'Los proyectos se guardan en este dispositivo';
  $('#settingInputMode').value=appSettings.inputMode;$('#settingPersistentTool').checked=!!appSettings.persistentTool;$('#settingLengthUnit').value=appSettings.lengthUnit;$('#settingClastUnit').value=appSettings.clastUnit;$('#settingAreaUnit').value=appSettings.areaUnit;$('#settingVolumeUnit').value=appSettings.volumeUnit;$('#settingCoordMode').value=appSettings.coordMode;$('#settingGpsAccuracy').value=String(appSettings.gpsMinAccuracy);$('#settingPhotoHeading').checked=!!appSettings.photoHeading;$('#settingGpsAltitude').checked=!!appSettings.gpsAltitude;$('#settingShowAccuracy').checked=!!appSettings.showAccuracy;$('#settingNotebookBg').value=appSettings.notebookBg;$('#settingNotebookAutosave').checked=!!appSettings.notebookAutosave;if($('#settingReachPattern'))$('#settingReachPattern').value=appSettings.reachPattern||'{CURS}-{N}';if($('#settingReachCodes'))$('#settingReachCodes').value=appSettings.reachCodes||'';if($('#settingMobileUi'))$('#settingMobileUi').value=appSettings.mobileUi||'auto';
  const st=await storageBreakdown();$('#settingsLocalMaps').textContent=formatBytes(st.maps);$('#settingsLocalPhotos').textContent=formatBytes(st.photos);$('#settingsLocalNotebook').textContent=formatBytes(st.notebook);$('#settingsLocalData').textContent=formatBytes(st.data);$('#settingsLocalTotal').textContent=formatBytes(st.usage??st.totalKnown);$('#settingsLocalBar').style.width=st.quota&&st.usage?`${Math.min(100,st.usage/st.quota*100)}%`:`${Math.min(100,st.totalKnown/(1024*1024*1024)*100)}%`;
  const cloudBytes=bytesOfJson(currentStatePayloadForCloud?.()||{})+bytesOfJson(state.project||{});$('#settingsCloudState').textContent=a.kind==='account'?(online?(cloudLastError?'Pendiente':'Conectado'):'Sin conexión'):'Sin cuenta';$('#settingsCloudData').textContent=a.kind==='account'?`≈ ${formatBytes(cloudBytes)}`:'—';$('#settingsCloudLastSync').textContent=cloudLastSyncAt?new Date(cloudLastSyncAt).toLocaleString('es-ES'):'—';$('#settingsCloudPending').textContent=cloudLastError||(!online&&a.kind==='account'?'Cambios locales pendientes':'0');$('#settingsCloudBar').style.width=a.kind==='account'&&!cloudLastError&&online?'100%':a.kind==='account'?'45%':'0%';$('#settingsCloudSyncBtn').disabled=a.kind!=='account'||!online;
}

function cloneAny(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}

const PROJECTS_KEY='geocauce-projects-v010';
const ACTIVE_PROJECT_KEY='geocauce-active-project-v010';
let projectCatalog=[];
let editingProjectId=null;
function projectStateKey(id){return `geocauce-state::${id}`;}
function projectById(id){return projectCatalog.find(p=>p.id===id)||null;}
function loadProjectCatalog(){
  try{projectCatalog=JSON.parse(localStorage.getItem(PROJECTS_KEY)||'[]')||[];}catch{projectCatalog=[];}
  nativeRestoreCatalogIfNeeded();
  if(!projectCatalog.length){
    for(const ver of ['v09','v08','v07']){
      try{const old=JSON.parse(localStorage.getItem(`geocauce-projects-${ver}`)||'[]');if(old?.length){projectCatalog=old;saveProjectCatalog();const oa=localStorage.getItem(`geocauce-active-project-${ver}`);if(oa)localStorage.setItem(ACTIVE_PROJECT_KEY,oa);break;}}catch{}
    }
  }
  // Migración conservadora: V0.6 se convierte en un proyecto sin tocar los datos originales.
  if(!projectCatalog.length){
    const legacy=localStorage.getItem('geocauce-state');
    if(legacy){
      const id='P'+Date.now().toString(36);
      const meta={id,name:'Proyecto migrado',zone:'',torrent:'',author:'',institution:'',startDate:isoToday(),crs:'EPSG:25831',objective:'Datos recuperados de GeoCauce V0.6',methodology:'',notes:'Edita la información del proyecto cuando quieras.',createdAt:Date.now(),updatedAt:Date.now(),dbName:'GeoCauceDB',legacy:true};
      projectCatalog=[meta];
      localStorage.setItem(projectStateKey(id),legacy);
      saveProjectCatalog();
      localStorage.setItem(ACTIVE_PROJECT_KEY,id);
    }
  }
}
function saveProjectCatalog(){localStorage.setItem(PROJECTS_KEY,JSON.stringify(projectCatalog));}
function touchProject(){if(!state.projectId)return;const p=projectById(state.projectId);if(p){p.updatedAt=Date.now();state.project=p;saveProjectCatalog();}}
function projectStats(id){
  try{const sv=JSON.parse(localStorage.getItem(projectStateKey(id))||'null');if(!sv)return{campaigns:0,elements:0};const cs=sv.campaigns||[];const last=cs.find(c=>c.id===sv.editableCampaign)||cs[cs.length-1];return{campaigns:cs.length,elements:(last?.order||[]).length};}catch{return{campaigns:0,elements:0};}
}
function renderProjectHome(){
  const root=$('#projectList');if(!root)return;root.innerHTML='';
  if(!projectCatalog.length){root.innerHTML=`<div class="project-empty">${iconImg('icons/proyecto.png')}<b>No hay proyectos todavía</b><span>Crea el primero para empezar a cartografiar.</span></div>`;return;}
  const active=localStorage.getItem(ACTIVE_PROJECT_KEY);
  [...projectCatalog].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).forEach(p=>{
    const st=projectStats(p.id),card=document.createElement('article');card.className='project-card'+(p.id===active?' active':'');
    const where=[p.torrent,p.zone].filter(Boolean).join(' · ')||'Zona sin especificar';
    const desc=p.objective||p.notes||'Sin descripción del estudio.';
    card.innerHTML=`<div class="project-card-head">${iconImg('icons/proyecto.png')}<div><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(where)}</p></div></div>
      <div class="project-card-meta"><span><b>${st.campaigns}</b> campañas</span><span><b>${st.elements}</b> elementos</span><span>Autor: <b>${escapeHtml(p.author||'—')}</b></span><span>CRS: <b>${escapeHtml(p.crs||'EPSG:25831')}</b></span></div>
      <div class="project-card-desc">${escapeHtml(desc)}</div>
      <div class="project-card-actions"><button class="open-project icon-text">${iconImg('icons/proyecto.png')}<span>Abrir</span></button><button class="edit-project icon-text">${iconImg('icons/editar_propiedad.png')}<span>Información</span></button><button class="delete-project icon-only" title="Eliminar proyecto">${iconImg('icons/eliminar.svg')}</button></div>`;
    card.querySelector('.open-project').onclick=()=>openProject(p.id);
    card.querySelector('.edit-project').onclick=()=>showProjectCreate(p.id,'projects');
    card.querySelector('.delete-project').onclick=()=>deleteProject(p.id);
    root.appendChild(card);
  });
}
function hideMainScreens(){['splash','projectScreen','projectCreateScreen','settingsScreen','mapScreen'].forEach(id=>$('#'+id)?.classList.add('hidden'));}
let projectCreateReturn='splash';
function showProjectHome(){
  if(state.view3d?.active)exit3DMode({quiet:true});
  hideMainScreens();$('#projectScreen').classList.remove('hidden');state.screen='projects';renderProjectHome();refreshAccountUi();
}
function showProjectCreate(id=null,returnTo=null){
  if(state.view3d?.active)exit3DMode({quiet:true});
  editingProjectId=id;const p=id?projectById(id):null;
  projectCreateReturn=returnTo||(state.screen==='map'?'map':projectCatalog.length?'projects':'splash');
  $('#projectCreateHeader').textContent=p?'Información del proyecto':'Crear nuevo proyecto';
  $('#projectCreateSub').textContent=p?'Edita los metadatos generales del estudio':'Datos generales del estudio';
  $('#projectFormSubmitLabel').textContent=p?'Guardar cambios':'Crear proyecto';
  $('#projectName').value=p?.name||'';$('#projectZone').value=p?.zone||'';$('#projectTorrent').value=p?.torrent||'';$('#projectAuthor').value=p?.author||'';$('#projectInstitution').value=p?.institution||'';$('#projectStartDate').value=p?.startDate||isoToday();$('#projectCrs').value=p?.crs||'EPSG:25831';$('#projectObjective').value=p?.objective||'';$('#projectMethodology').value=p?.methodology||'';$('#projectNotes').value=p?.notes||'';
  hideMainScreens();$('#projectCreateScreen').classList.remove('hidden');state.screen='projectCreate';setTimeout(()=>$('#projectName').focus(),60);
}
function leaveProjectCreate(){
  editingProjectId=null;
  if(projectCreateReturn==='map'&&state.projectId){hideMainScreens();$('#mapScreen').classList.remove('hidden');state.screen='map';resize();}
  else if(projectCreateReturn==='projects'&&projectCatalog.length)showProjectHome();
  else{hideMainScreens();$('#splash').classList.remove('hidden');state.screen='splash';}
}
// enterApp se define en el módulo de acceso local-first de v0.13
function readProjectForm(){return{name:$('#projectName').value.trim(),zone:$('#projectZone').value.trim(),torrent:$('#projectTorrent').value.trim(),author:$('#projectAuthor').value.trim(),institution:$('#projectInstitution').value.trim(),startDate:$('#projectStartDate').value||isoToday(),crs:$('#projectCrs').value||'EPSG:25831',objective:$('#projectObjective').value.trim(),methodology:$('#projectMethodology').value.trim(),notes:$('#projectNotes').value.trim()};}
async function saveProjectForm(){
  const v=readProjectForm();if(!v.name){toast('Escribe un nombre para el proyecto');return;}
  if(editingProjectId){const p=projectById(editingProjectId);if(!p)return;Object.assign(p,v,{updatedAt:Date.now()});saveProjectCatalog();if(state.projectId===p.id){state.project=p;updateProjectUi();}editingProjectId=null;if(projectCreateReturn==='map'){hideMainScreens();$('#mapScreen').classList.remove('hidden');state.screen='map';updateProjectUi();resize();}else showProjectHome();toast('Información del proyecto actualizada');return;}
  if(state.projectId)persistState();
  const id='P'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);const meta={id,...v,createdAt:Date.now(),updatedAt:Date.now(),dbName:`GeoCauceDB_${id}`};projectCatalog.push(meta);saveProjectCatalog();localStorage.setItem(ACTIVE_PROJECT_KEY,id);editingProjectId=null;
  state.projectId=id;state.project=meta;resetStateForProject(meta);persistState();await openProject(id,{skipSave:true});toast(`Proyecto “${meta.name}” creado`);
}
function resetStateForProject(meta=state.project){
  state.tool='pan';state.material='coarse';state.mapInk=[];state.mapInkColor='#d73a49';state.mapInkWidth=4;state.mapInkMode='pen';state.mapPins=[];state.mapContextPoint=null;state.pendingPhotoLocation=null;state.historicalPhotoPoints=[];state.showHistoricalPhotoPoints=true;state.currentHistoricalPointId=null;state.pendingHistoricalPhotoPointId=null;state.pendingHistoricalPhotoMode=null;state.historicalLinkPointId=null;state.currentStopId=null;state.sectionTool='pen';state.sectionMaterial='none';state.sectionColor='#1f2b31';state.sectionFillOpacity=.45;state.sectionMeasureTool='pen';state.sectionStraightSegments=true;state.sectionGeoClass='none';state.sectionZoneClass='channel';state.sectionZoneCustom='';state.campaign='D01';state.editableCampaign='D01';state.comparePrevious=false;state.compareOpacity=.35;state.view={cx:0,cy:0,scale:1,rotation:0};state.view3d={active:false,exaggeration:1};state.rasters=[];state.demGroups=[];state.activeDemGroupId=null;state.referenceLayers=[];state.vectorExtract=null;state.pendingImportedCourseFragments=null;state.features=[];state.selectedId=null;state.currentStroke=null;state.touches=new Map();state.pinch=null;state.panStart=null;state.pointerPan=null;state.gnss=null;state.currentSection=null;state.pendingPhotoFor=null;state.eraseMode='zone';state.eraseSize=38;state.autoPanAfterDraw=false;state.history=[];state.notebook={pages:[],currentPageId:null};state.notebookTool='pen';state.notebookPenColor=appSettings.notebookPenColor||'#1f2b31';state.notebookView={zoom:1,touches:new Map(),pinch:null,pan:null};state.notebookLinkTarget=null;state.activeCourseId=null;state.pendingCourseStroke=null;state.pendingCourseJoin=null;state.pendingReachStart=null;state.pendingReachBoundaryMove=null;state.editReachId=null;state.profileInkTool='pen';state.profileSheetZoom=1;state.profileSheetTouches=new Map();state.profileSheetGesture=null;state.currentProfileCourseId=null;state.currentReachSheetId=null;state.reachSheetZoom=1;state.reachSheetTouches=new Map();state.reachSheetGesture=null;state.reachSheetSchemeTool='pen';state.editCourseId=null;state.editContourFeatureId=null;state.longProfileReachStart=null;
  const root=makeRootCampaign([],{date:displayDate(meta?.startDate)||today(),author:meta?.author||'',event:'initial'});state.campaigns=[root];
}
async function openProject(id,opt={}){
  if(state.view3d?.active)exit3DMode({quiet:true});
  const p=projectById(id);if(!p)return;if(state.projectId&&!opt.skipSave)persistState();
  if(dbp){try{const old=await dbp;old.close();}catch{}dbp=null;dbpName=null;}
  state.projectId=id;state.project=p;localStorage.setItem(ACTIVE_PROJECT_KEY,id);restoreState(id);state.rasters=[];
  hideMainScreens();$('#mapScreen').classList.remove('hidden');state.screen='map';
  updateProjectUi();scheduleCloudSync(1200);renderMaterials();updateMaterialButton();updateCampaignUi();$('#eraserSize').value=state.eraseSize;$$('[data-erase-mode]').forEach(b=>b.classList.toggle('active',b.dataset.eraseMode===state.eraseMode));setTool(state.tool,{quiet:true});renderSectionList();updateCompass();updateGnssUi();setTimeout(resize,20);await loadRasters();await hydrateReferenceLayersAfterOpen();touchProject();
}
function updateProjectUi(){
  refreshAccountUi();
  const p=state.project;const label=$('#projectBtnLabel');if(label)label.textContent=p?.name||'Proyecto';
  const root=$('#projectSummary');if(!root||!p)return;const st=projectStats(p.id);root.innerHTML=`<h3>${escapeHtml(p.name)}</h3><dl><dt>Zona</dt><dd>${escapeHtml([p.torrent,p.zone].filter(Boolean).join(' · ')||'—')}</dd><dt>Autor</dt><dd>${escapeHtml(p.author||'—')}</dd><dt>Institución</dt><dd>${escapeHtml(p.institution||'—')}</dd><dt>Inicio</dt><dd>${escapeHtml(displayDate(p.startDate)||'—')}</dd><dt>CRS</dt><dd>${escapeHtml(p.crs||'EPSG:25831')}</dd><dt>Campañas</dt><dd>${st.campaigns}</dd></dl>${p.objective?`<div class="project-summary-desc"><b>Objetivo</b><br>${escapeHtml(p.objective)}</div>`:''}`;
}
async function deleteProject(id){
  const p=projectById(id);if(!p||!confirm(`¿Eliminar el proyecto “${p.name}”? Se borrarán sus mapas, fotos, campañas y cartografía local.`))return;
  if(state.projectId===id&&dbp){try{const d=await dbp;d.close();}catch{}dbp=null;dbpName=null;}
  localStorage.removeItem(projectStateKey(id));projectCatalog=projectCatalog.filter(x=>x.id!==id);saveProjectCatalog();if(localStorage.getItem(ACTIVE_PROJECT_KEY)===id)localStorage.removeItem(ACTIVE_PROJECT_KEY);
  if(ANDROID_NATIVE)nativeCall('deleteProject',id);
  try{indexedDB.deleteDatabase(p.dbName||`GeoCauceDB_${id}`);}catch{}
  if(state.projectId===id){state.projectId=null;state.project=null;state.rasters=[];state.features=[];state.campaigns=[];}
  renderProjectHome();toast('Proyecto eliminado');
}
function showCurrentProjectInfo(){if(state.projectId)showProjectCreate(state.projectId,'map');}
function closeCurrentProject(){if(state.projectId)persistState();$('#mapScreen').classList.add('hidden');$('#projectPanel').classList.add('hidden');showProjectHome();}
function cloneFeatures(src=state.features){return cloneAny(src||[]);}
function pushHistory(){if(!requireEditable('deshacer o modificar'))return false;state.history.push(cloneFeatures());if(state.history.length>20)state.history.shift();return true;}
function undoLast(){if(!requireEditable('deshacer cambios'))return;if(!state.history.length){toast('No hay nada que deshacer');return;}state.features=state.history.pop();state.selectedId=null;hideFeatureCard();persistState();drawAll();toast('Última acción deshecha');}
function currentCampaign(){return (state.campaigns||[]).find(c=>c.id===state.campaign)||null;}
function campaignById(id){return (state.campaigns||[]).find(c=>c.id===id)||null;}
function campaignLabel(id){const c=campaignById(id);return c?c.name:id;}
function isEditableCampaign(id=state.campaign){return !!id&&id===state.editableCampaign;}
function requireEditable(action='editar'){
  if(isEditableCampaign())return true;
  const c=currentCampaign();toast(`${c?.name||'Este día'} está bloqueado. Crea un Nuevo día para ${action}.`,3600);
  return false;
}
function materializeCampaign(id,stack=new Set()){
  const c=campaignById(id);if(!c||stack.has(id))return [];
  stack.add(id);
  const base=c.parentId?materializeCampaign(c.parentId,stack):[];
  const map=new Map(base.map(f=>[f.id,normalizeFeature(f,id)]));
  for(const fid of c.deleted||[])map.delete(fid);
  for(const f of c.upserts||[])map.set(f.id,normalizeFeature(f,id));
  const order=[];const wanted=c.order||[];
  for(const fid of wanted)if(map.has(fid)&&!order.includes(fid))order.push(fid);
  for(const fid of map.keys())if(!order.includes(fid))order.push(fid);
  return order.map(fid=>cloneAny(map.get(fid)));
}
function computeCampaignDelta(c,features){
  const parent=c.parentId?materializeCampaign(c.parentId):[];
  const pm=new Map(parent.map(f=>[f.id,normalizeFeature(f,c.parentId)]));
  const curr=(features||[]).map(f=>normalizeFeature(f,c.id));
  const cm=new Map(curr.map(f=>[f.id,f]));
  const upserts=[];
  for(const f of curr){const old=pm.get(f.id);if(!old||featureKey(old)!==featureKey(f))upserts.push(cloneAny(f));}
  const deleted=[];for(const fid of pm.keys())if(!cm.has(fid))deleted.push(fid);
  c.upserts=upserts;c.deleted=deleted;c.order=curr.map(f=>f.id);
}
function syncCurrentCampaign(){const c=currentCampaign();if(c&&isEditableCampaign())computeCampaignDelta(c,state.features);}
function getPreviousCampaign(){const c=currentCampaign();if(c?.parentId)return campaignById(c.parentId);const i=(state.campaigns||[]).findIndex(x=>x.id===state.campaign);return i>0?state.campaigns[i-1]:null;}
function updateReadOnlyUi(){
  const ro=!isEditableCampaign();
  const badge=$('#readOnlyBadge');if(badge){badge.classList.toggle('hidden',!ro);badge.textContent=ro?`🔒 ${currentCampaign()?.name||'Día anterior'} · solo lectura`:'';}
  document.body.classList.toggle('viewing-readonly',ro);
  const editTools=new Set(['boundary','editContour','fill','paint','basin','watercourse','reach','channel','section','photo','historicalPhoto','erase']);
  $$('#toolMenu button[data-tool]').forEach(b=>{b.disabled=ro&&editTools.has(b.dataset.tool);b.title=b.disabled?'Día anterior: crea un Nuevo día para editar':'';});
  const photo=$('#featurePhotoBtn'),del=$('#deleteFeatureBtn');if(photo)photo.disabled=false;if(del)del.disabled=ro;
  $$('.section-del').forEach(b=>b.disabled=ro);
  if(ro&&editTools.has(state.tool)){state.tool='pan';updateMaterialButton();const ai=$('#activeToolIcon');if(ai)ai.src=ICONS.pan;$('#activeToolBtn span').textContent='Mover';}
}
function updateCampaignUi(){
  const c=currentCampaign(),prev=getPreviousCampaign(),lbl=$('#campaignBtnLabel');if(lbl)lbl.textContent=c?c.name:'Día';
  const tog=$('#comparePreviousToggle');if(tog){tog.checked=!!state.comparePrevious;tog.disabled=!prev;}
  const op=$('#compareOpacity');if(op){op.value=state.compareOpacity;op.disabled=!prev;}
  const nd=$('#newDayBtn');if(nd)nd.querySelector('span')&&(nd.querySelector('span').textContent=isEditableCampaign()?'Nuevo día':'Nuevo día desde este estado');
  renderCampaigns();updateReadOnlyUi();
}
function renderCampaigns(){
  const root=$('#campaignList');if(!root)return;root.innerHTML='';
  for(const c of state.campaigns||[]){
    const b=document.createElement('button'),selected=c.id===state.campaign,editable=c.id===state.editableCampaign;
    b.className='campaign-row'+(selected?' active':'')+(editable?' editable':' locked');
    const count=(c.order||[]).length,changes=(c.upserts||[]).length+(c.deleted||[]).length;
    const status=editable?'<strong>EDITABLE</strong>':'<strong class="locked-mark">🔒</strong>';
    const eventLabel=c.event==='torrentada'?'Torrentada':c.event==='heavy_rain'?'Lluvia intensa':c.event==='other'?'Otro evento':'';
    const eventHtml=eventLabel?`<em class="campaign-event ${c.event}">${eventLabel}</em>`:'';
    b.innerHTML=`<span class="campaign-dot"></span><span><b>${escapeHtml(c.name)}${eventHtml}</b><small>${escapeHtml(c.date||'')} · ${count} elementos${c.author?` · ${escapeHtml(c.author)}`:''}${c.parentId?` · ${changes} cambios guardados`:''}</small></span>${status}`;
    b.onclick=()=>switchCampaign(c.id);root.appendChild(b);
  }
}
function switchCampaign(id){
  if(id===state.campaign)return;
  syncCurrentCampaign();const c=campaignById(id);if(!c)return;
  state.campaign=id;state.features=materializeCampaign(id);state.selectedId=null;state.history=[];hideFeatureCard();
  if(!isEditableCampaign()&&['boundary','editContour','fill','paint','basin','watercourse','reach','channel','section','photo','historicalPhoto','erase'].includes(state.tool))state.tool='pan';
  persistState();renderSectionList();updateCampaignUi();drawAll();toast(isEditableCampaign()?`Abierto ${c.name} · editable`:`Abierto ${c.name} · solo lectura`);
}
function openNewDayModal(){
  const parent=currentCampaign();$('#newDayDate').value=isoToday();$('#newDayAuthor').value=state.project?.author||parent?.author||'';$('#newDayEvent').value='none';$('#newDayNotes').value='';$('#newDayModal').classList.remove('hidden');
}
function newDay(meta={}){
  syncCurrentCampaign();const parent=state.campaign;
  const n=(state.campaigns||[]).reduce((mx,c)=>{const m=String(c.id).match(/D(\d+)/);return Math.max(mx,m?+m[1]:0);},0)+1;
  const id=`D${String(n).padStart(2,'0')}`,name=`Día ${String(n).padStart(2,'0')}`;
  const inherited=cloneFeatures(state.features).map(f=>normalizeFeature(f,id));
  state.campaigns.push({id,name,date:displayDate(meta.date)||today(),author:meta.author||state.project?.author||'',event:meta.event||'none',notes:meta.notes||'',parentId:parent,upserts:[],deleted:[],order:inherited.map(f=>f.id),createdAt:Date.now()});
  state.editableCampaign=id;state.campaign=id;state.features=inherited;state.comparePrevious=true;state.selectedId=null;state.history=[];hideFeatureCard();
  persistState();renderSectionList();updateCampaignUi();drawAll();$('#campaignPanel')?.classList.add('hidden');$('#newDayModal')?.classList.add('hidden');toast(`${name} creado. ${campaignLabel(parent)} queda bloqueado e intacto.`);
}

function updateCompass(){const extra=state.view3d?.active?(terrain3d.camera?.yaw||0):0;const deg=((state.view.rotation||0)+extra)*180/Math.PI;const icon=$('#northIcon');if(icon)icon.style.transform=`rotate(${deg}deg)`;const read=$('#rotationReadout');if(read)read.textContent=`${Math.round((deg%360+360)%360)}°`;}
function resetRotation(){if(state.view3d?.active){terrain3d.camera.yaw=0;updateCompass();renderTerrain3D();toast('3D orientado al mapa');return;}state.view.rotation=0;persistState();drawAll();toast('Norte arriba');}

function resize() {
  const r = mapCanvas.getBoundingClientRect();
  // El mapa necesita aprovechar mejor la densidad física de la tablet. En v0.12.2
  // todos los canvas se limitaban a DPR 2, lo que podía suavizar innecesariamente
  // un GeoTIFF de 50 cm en pantallas de mayor densidad. El mapa usa hasta DPR 3;
  // la tinta/vectorial mantiene un límite algo menor para no disparar memoria.
  const mapDpr = Math.min(devicePixelRatio || 1, 3);
  const overlayDpr = Math.min(devicePixelRatio || 1, 2.25);
  for (const c of [mapCanvas, inkCanvas, featureCanvas]) {
    const dpr = c===mapCanvas ? mapDpr : overlayDpr;
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    c._dpr = dpr;
  }
  drawAll();
  resizeTerrain3DCanvas();
  resizeDrawCanvas($('#sheetCanvas'));
  resizeDrawCanvas($('#sectionCanvas'));
  resizeDrawCanvas($('#notebookCanvas'));
  resizeDrawCanvas($('#sectionWidthInk'));resizeDrawCanvas($('#sectionDepthInk'));resizeDrawCanvas($('#sectionNoteInk'));
}
function resizeDrawCanvas(c) {
  if (!c || !c.offsetParent) return;
  const r = c.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (c.width === Math.round(r.width*dpr) && c.height === Math.round(r.height*dpr)) return;
  c.width = Math.round(r.width*dpr);
  c.height = Math.round(r.height*dpr);
  c._dpr = dpr;
  redrawInkStore(c);
}
function screenSize() { return { w: mapCanvas.width/mapCanvas._dpr, h: mapCanvas.height/mapCanvas._dpr }; }
function normAngle(a){while(a>Math.PI)a-=Math.PI*2;while(a<=-Math.PI)a+=Math.PI*2;return a;}
function screenOffsetToWorld(dx,dy,scale=state.view.scale,rotation=state.view.rotation||0){
  const c=Math.cos(rotation),sn=Math.sin(rotation);
  const bx=c*dx+sn*dy, by=-sn*dx+c*dy; // inverse screen rotation
  return {x:bx/scale,y:-by/scale};
}
function worldToScreen(p) {
  const {w,h}=screenSize(),s=state.view.scale,r=state.view.rotation||0,c=Math.cos(r),sn=Math.sin(r);
  const dx=p.x-state.view.cx,dy=p.y-state.view.cy;
  return {x:w/2+s*(c*dx+sn*dy),y:h/2+s*(sn*dx-c*dy)};
}
function screenToWorld(p) {
  const {w,h}=screenSize(),d=screenOffsetToWorld(p.x-w/2,p.y-h/2);
  return {x:state.view.cx+d.x,y:state.view.cy+d.y};
}
function keepWorldAtScreen(world,p){
  const {w,h}=screenSize(),d=screenOffsetToWorld(p.x-w/2,p.y-h/2);
  state.view.cx=world.x-d.x; state.view.cy=world.y-d.y;
}
function applyDpr(ctx, canvas) { ctx.setTransform(canvas._dpr,0,0,canvas._dpr,0,0); }
function clearCtx(ctx, canvas) {
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  applyDpr(ctx,canvas);
}

function drawPlaceholder() {
  const {w,h} = screenSize();
  mapCtx.fillStyle='#cfd0c4';
  mapCtx.fillRect(0,0,w,h);
  mapCtx.strokeStyle='rgba(70,80,70,.14)';
  mapCtx.lineWidth=1;
  for(let y=60;y<h;y+=55){
    mapCtx.beginPath();
    for(let x=-30;x<w+30;x+=20){
      const yy=y+Math.sin(x*.018+y*.01)*18;
      x===-30 ? mapCtx.moveTo(x,yy) : mapCtx.lineTo(x,yy);
    }
    mapCtx.stroke();
  }
}
function rasterSmoothingEnabled(r,pixelScreen){
  const mode=r?.renderMode||'auto';
  if(mode==='sharp')return false;
  if(mode==='smooth')return true;
  // En automático, suavizar solo cuando realmente reducimos por debajo de ~1 píxel
  // físico. Al llegar a resolución nativa o al hacer sobrezoom, conservar el píxel.
  return pixelScreen*(mapCanvas._dpr||1)<.98;
}
function currentViewportWorldBounds(){
  const {w,h}=screenSize(),pts=[screenToWorld({x:0,y:0}),screenToWorld({x:w,y:0}),screenToWorld({x:w,y:h}),screenToWorld({x:0,y:h})];
  return{minX:Math.min(...pts.map(p=>p.x)),maxX:Math.max(...pts.map(p=>p.x)),minY:Math.min(...pts.map(p=>p.y)),maxY:Math.max(...pts.map(p=>p.y))};
}
function boundsOverlap(a,b,pad=0){return !!a&&!!b&&a.maxX+pad>=b.minX&&a.minX-pad<=b.maxX&&a.maxY+pad>=b.minY&&a.minY-pad<=b.maxY;}
function releaseRasterHeavyMemory(r,{keepPreview=true}={}){
  if(!r)return;const c=r._tileCache;if(c){for(const rec of c.values())try{rec.bitmap?.close?.()}catch{}c.clear();}
  const sc=r._styleTileCache;if(sc){for(const rec of sc.values())try{rec.bitmap?.close?.()}catch{}sc.clear();}
  r._tilePending=0;r._styleTilePending=0;delete r._bufferPromise;delete r._tiffMeta;
  if(!keepPreview&&r.image){try{r.image.close?.()}catch{}r.image=null;}
}
function clipCanvasToDemWorkingArea(ctx,raster){
  if(isDemRaster(raster))return true;const polys=demWorkingPolygons();if(!polys.length)return true;const dpr=mapCanvas._dpr||1;ctx.setTransform(1,0,0,1,0,0);ctx.beginPath();let any=false;for(const poly of polys){if(!poly?.length)continue;const pts=poly.map(worldToScreen);ctx.moveTo(pts[0].x*dpr,pts[0].y*dpr);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x*dpr,pts[i].y*dpr);ctx.closePath();any=true;}if(any)ctx.clip();return any;
}
function drawRaster(r) {
  if(!r.visible || !r.image) return;
  const rb=rasterBounds(r),vb=currentViewportWorldBounds();
  if(!boundsOverlap(rb,vb)){if(r._tileCache?.size||r._bufferPromise)releaseRasterHeavyMemory(r);return;}
  const {w,h}=screenSize();
  const a=r.affine;
  const s=state.view.scale,rn=state.view.rotation||0,c=Math.cos(rn),sn=Math.sin(rn);
  const pxScreen=Math.max(Math.hypot(a.A,a.D),Math.hypot(a.B,a.E))*s;
  const mA=s*(c*a.A+sn*a.D), mC=s*(c*a.B+sn*a.E), mE=w/2+s*(c*(a.C-state.view.cx)+sn*(a.F-state.view.cy));
  const mB=s*(sn*a.A-c*a.D), mD=s*(sn*a.B-c*a.E), mF=h/2+s*(sn*(a.C-state.view.cx)-c*(a.F-state.view.cy));
  mapCtx.save();
  clipCanvasToDemWorkingArea(mapCtx,r);
  mapCtx.globalAlpha=r.opacity;
  // Keep cartographic linework crisp when the preview itself is being enlarged.
  mapCtx.imageSmoothingEnabled=rasterSmoothingEnabled(r,pxScreen);
  if(mapCtx.imageSmoothingEnabled)mapCtx.imageSmoothingQuality='high';
  mapCtx.setTransform(mA*mapCanvas._dpr,mB*mapCanvas._dpr,mC*mapCanvas._dpr,mD*mapCanvas._dpr,mE*mapCanvas._dpr,mF*mapCanvas._dpr);
  mapCtx.drawImage(r.image,0,0);
  mapCtx.restore();
  applyDpr(mapCtx,mapCanvas);

  // GeoTIFF preview is only the overview. When zooming in, overlay source-resolution
  // tiles decoded lazily from the original GeoTIFF so detail is never destroyed.
  if(r.meta?.sourceType==='geotiff'&&r.meta?.downsample>1.02&&performance.now()>=mapMotionUntil){
    if(r.styleCache?.ready)drawStyledRasterDetail(r);
    else if(!(r.rasterStyle?.renderer&&r.rasterStyle.renderer!=='original')&&r.sourceBlob&&!r.lightMode)drawGeoTiffDetail(r);
  }
}

function normalizeNorthUpAffine(a,height){
  if(!a)return a;
  const out={A:+a.A||0,B:+a.B||0,C:+a.C||0,D:+a.D||0,E:+a.E||0,F:+a.F||0};
  // Alguns TIFF/COG arriben amb l'eix de files en sentit sud→nord. Canvas ja té
  // el seu propi eix Y de pantalla; si deixem E positiu la imatge queda cap per avall.
  // Només normalitzem rasters pràcticament north-up, sense rotació/skew significatiu.
  const scale=Math.max(Math.abs(out.A),Math.abs(out.E),1e-12),northUp=Math.abs(out.B)<=scale*1e-7&&Math.abs(out.D)<=scale*1e-7;
  if(northUp&&out.E>0&&Number.isFinite(+height)&&+height>0){out.F=out.F+out.E*(+height);out.E=-out.E;out._geoCauceFlipY=true;}
  return out;
}
function normalizeRasterOrientation(r){
  if(!r?.affine||!r.image)return r;
  const fixed=normalizeNorthUpAffine(r.affine,r.image.height);
  if(fixed?._geoCauceFlipY){delete fixed._geoCauceFlipY;r.affine=fixed;r.meta=r.meta||{};r.meta.displayNorthUpFix=true;}
  return r;
}
function sourceAffine(r){
  const m=r.meta||{},sx=(m.sourceWidth||r.image.width)/r.image.width,sy=(m.sourceHeight||r.image.height)/r.image.height,a=r.affine;
  let out={A:a.A/sx,D:a.D/sx,B:a.B/sy,E:a.E/sy,C:a.C,F:a.F};
  // Si el preview s'ha normalitzat, el detall HD ha d'usar exactament la mateixa
  // orientació visual. Les mostres científiques continuen usant meta.sourceAffine.
  if(m.displayNorthUpFix){const raw=m.sourceAffine||out;out=normalizeNorthUpAffine(raw,m.sourceHeight||r.image.height);delete out._geoCauceFlipY;}
  return out;
}
function invertAffine(a,p){
  const det=a.A*a.E-a.B*a.D;if(Math.abs(det)<1e-18)return null;
  const dx=p.x-a.C,dy=p.y-a.F;
  return{x:(a.E*dx-a.B*dy)/det,y:(-a.D*dx+a.A*dy)/det};
}
function drawBitmapAffine(bitmap,a,opacity,pixelScreen,raster=null){
  const {w,h}=screenSize(),s=state.view.scale,rn=state.view.rotation||0,c=Math.cos(rn),sn=Math.sin(rn);
  const mA=s*(c*a.A+sn*a.D),mC=s*(c*a.B+sn*a.E),mE=w/2+s*(c*(a.C-state.view.cx)+sn*(a.F-state.view.cy));
  const mB=s*(sn*a.A-c*a.D),mD=s*(sn*a.B-c*a.E),mF=h/2+s*(sn*(a.C-state.view.cx)-c*(a.F-state.view.cy));
  mapCtx.save();clipCanvasToDemWorkingArea(mapCtx,raster);mapCtx.globalAlpha=opacity;
  mapCtx.imageSmoothingEnabled=rasterSmoothingEnabled(raster,pixelScreen);if(mapCtx.imageSmoothingEnabled)mapCtx.imageSmoothingQuality='high';
  mapCtx.setTransform(mA*mapCanvas._dpr,mB*mapCanvas._dpr,mC*mapCanvas._dpr,mD*mapCanvas._dpr,mE*mapCanvas._dpr,mF*mapCanvas._dpr);
  mapCtx.drawImage(bitmap,0,0);mapCtx.restore();applyDpr(mapCtx,mapCanvas);
}
function chooseDetailStep(sourcePixelScreen,previewDownsample){
  if(sourcePixelScreen<=0)return null;
  // La decisión se toma en píxeles FÍSICOS, no CSS. En una tablet DPR 2, por
  // ejemplo, 0,5 px CSS por píxel de un MDT ya equivale a 1 píxel físico y debe
  // conservar la muestra original (step=1), no resumir dos píxeles fuente.
  const dpr=mapCanvas._dpr||Math.min(devicePixelRatio||1,3);
  const sourcePixelPhysical=sourcePixelScreen*dpr;
  const previewPixelPhysical=sourcePixelPhysical*previewDownsample;
  if(previewPixelPhysical<=.92)return null; // la vista general aún cubre la pantalla sin déficit de muestras
  const maxStep=Math.max(1,Math.floor(previewDownsample-.01));
  const ideal=Math.max(1,1/sourcePixelPhysical);
  let step=1;while(step*2<=ideal&&step*2<=maxStep)step*=2;
  return Math.max(1,step);
}
function visibleSourceBounds(a,wSrc,hSrc){
  const {w,h}=screenSize();
  const worlds=[screenToWorld({x:0,y:0}),screenToWorld({x:w,y:0}),screenToWorld({x:w,y:h}),screenToWorld({x:0,y:h})];
  const pix=worlds.map(p=>invertAffine(a,p)).filter(Boolean);if(!pix.length)return null;
  return{minX:Math.max(0,Math.min(...pix.map(p=>p.x))),maxX:Math.min(wSrc,Math.max(...pix.map(p=>p.x))),minY:Math.max(0,Math.min(...pix.map(p=>p.y))),maxY:Math.min(hSrc,Math.max(...pix.map(p=>p.y)))};
}
function drawGeoTiffDetail(r){
  const m=r.meta||{},sa=sourceAffine(r),res=Math.max(Math.hypot(sa.A,sa.D),Math.hypot(sa.B,sa.E)),sourcePixelScreen=res*state.view.scale;
  let step=chooseDetailStep(sourcePixelScreen,m.downsample||1);if(step==null)return;
  let vb=visibleSourceBounds(sa,m.sourceWidth,m.sourceHeight);if(!vb||vb.maxX<=vb.minX||vb.maxY<=vb.minY)return;
  if(!isDemRaster(r)){const wb=demWorkingBounds();if(wb){if(!boundsOverlap(rasterBounds(r),wb))return;const dp=[{x:wb.minX,y:wb.minY},{x:wb.maxX,y:wb.minY},{x:wb.maxX,y:wb.maxY},{x:wb.minX,y:wb.maxY}].map(q=>invertAffine(sa,q)).filter(Boolean);if(dp.length){const db={minX:Math.max(0,Math.min(...dp.map(q=>q.x))),maxX:Math.min(m.sourceWidth,Math.max(...dp.map(q=>q.x))),minY:Math.max(0,Math.min(...dp.map(q=>q.y))),maxY:Math.min(m.sourceHeight,Math.max(...dp.map(q=>q.y)))};vb={minX:Math.max(vb.minX,db.minX),maxX:Math.min(vb.maxX,db.maxX),minY:Math.max(vb.minY,db.minY),maxY:Math.min(vb.maxY,db.maxY)};if(vb.maxX<=vb.minX||vb.maxY<=vb.minY)return;}}}
  // Teselas de 512 px: permiten mantener step=1 en una pantalla 2K sin tener que
  // degradar el raster solo para reducir el número de teselas visibles.
  const outTile=512;
  const tileBudget=64;
  let span=outTile*step,tx0=Math.floor(vb.minX/span),tx1=Math.floor((vb.maxX-1)/span),ty0=Math.floor(vb.minY/span),ty1=Math.floor((vb.maxY-1)/span);
  // Solo pasar a un nivel más grueso si la resolución física aún lo permite.
  const dpr=mapCanvas._dpr||1,sourcePhysical=sourcePixelScreen*dpr;
  while((tx1-tx0+1)*(ty1-ty0+1)>tileBudget&&step*2<(m.downsample||1)&&sourcePhysical*step<.62){
    step*=2;span=outTile*step;tx0=Math.floor(vb.minX/span);tx1=Math.floor((vb.maxX-1)/span);ty0=Math.floor(vb.minY/span);ty1=Math.floor((vb.maxY-1)/span);
  }
  const center=invertAffine(sa,{x:state.view.cx,y:state.view.cy})||{x:(vb.minX+vb.maxX)/2,y:(vb.minY+vb.maxY)/2};
  const wanted=[];
  for(let ty=ty0;ty<=ty1;ty++)for(let tx=tx0;tx<=tx1;tx++)wanted.push({tx,ty,d:Math.hypot((tx+.5)*span-center.x,(ty+.5)*span-center.y)});
  wanted.sort((a,b)=>a.d-b.d);
  r._tileCache=r._tileCache||new Map();r._tilePending=r._tilePending||0;let requested=0;
  for(const t of wanted){
    const key=`${step}/${t.tx}/${t.ty}`,rec=r._tileCache.get(key);
    if(rec?.bitmap){rec.last=performance.now();drawDetailTile(r,rec.bitmap,sa,step,t.tx,t.ty);continue;}
    if(!rec&&requested<3&&r._tilePending<3){requested++;requestDetailTile(r,sa,step,t.tx,t.ty,key);}
  }
  evictTileCache(r);
}
function drawDetailTile(r,bitmap,sa,step,tx,ty){
  const span=512*step,x0=tx*span,y0=ty*span;
  const a={A:sa.A*step,D:sa.D*step,B:sa.B*step,E:sa.E*step,C:sa.A*x0+sa.B*y0+sa.C,F:sa.D*x0+sa.E*y0+sa.F};
  const ppx=Math.max(Math.hypot(a.A,a.D),Math.hypot(a.B,a.E))*state.view.scale;
  drawBitmapAffine(bitmap,a,r.opacity,ppx,r);
}
async function requestDetailTile(r,sa,step,tx,ty,key){
  const cache=r._tileCache||(r._tileCache=new Map());cache.set(key,{loading:true,last:performance.now()});r._tilePending=(r._tilePending||0)+1;
  try{
    r._bufferPromise=r._bufferPromise||r.sourceBlob.arrayBuffer();const ab=await r._bufferPromise;
    r._tiffMeta=r._tiffMeta||GeoCauceGeoTIFF.parse(ab);
    const span=512*step,x0=tx*span,y0=ty*span,w=Math.min(span,(r.meta.sourceWidth||0)-x0),h=Math.min(span,(r.meta.sourceHeight||0)-y0);
    if(w<=0||h<=0){cache.delete(key);return;}
    const ow=Math.ceil(w/step),oh=Math.ceil(h/step);
    const dec=await GeoCauceGeoTIFF.decodeRegion(r._tiffMeta,{x:x0,y:y0,width:w,height:h,outWidth:ow,outHeight:oh,range:r.meta.range});
    if(!dec.width||!dec.height){cache.delete(key);return;}
    let bmp;try{bmp=await createImageBitmap(new ImageData(dec.rgba,dec.width,dec.height));}
    catch(_){const c=document.createElement('canvas');c.width=dec.width;c.height=dec.height;c.getContext('2d').putImageData(new ImageData(dec.rgba,dec.width,dec.height),0,0);bmp=await createImageBitmap(c);}
    cache.set(key,{bitmap:bmp,last:performance.now()});requestAnimationFrame(drawAll);
  }catch(e){console.warn('No se pudo cargar tesela GeoTIFF HD',e);cache.set(key,{error:true,last:performance.now()});}
  finally{r._tilePending=Math.max(0,(r._tilePending||1)-1);}
}
function evictTileCache(r){
  const c=r._tileCache;if(!c||c.size<=18)return;
  const items=[...c.entries()].filter(([,v])=>v.bitmap).sort((a,b)=>(a[1].last||0)-(b[1].last||0));
  // 512² RGBA ronda 1 MB/tesela; mantenir poques teseles limita el consum en tablets de 4 GB.
  while(c.size>12&&items.length){const [k,v]=items.shift();try{v.bitmap.close?.()}catch{}c.delete(k);}
}

// ---------- Simbologia raster pre-renderitzada (v0.16.30) ----------
const RASTER_STYLE_RAMPS={
  viridis:['#440154','#414487','#2a788e','#22a884','#7ad151','#fde725'],
  cividis:['#00204c','#414d6b','#7c7b78','#bcae6c','#ffea46'],
  turbo:['#30123b','#466be3','#1bcfd4','#63f34b','#f9e721','#f77b16','#a80000'],
  spectral:['#5e4fa2','#3288bd','#66c2a5','#abdda4','#e6f598','#ffffbf','#fee08b','#fdae61','#f46d43','#d53e4f','#9e0142'],
  blues:['#f7fbff','#deebf7','#9ecae1','#4292c6','#08519c'],
  greens:['#f7fcf5','#c7e9c0','#74c476','#31a354','#006d2c'],
  reds:['#fff5f0','#fcbba1','#fb6a4a','#de2d26','#a50f15'],
  greys:['#ffffff','#d9d9d9','#969696','#525252','#000000'],
  magma:['#000004','#3b0f70','#8c2981','#de4968','#fe9f6d','#fcfdbf'],
  mako:['#0b0405','#3b0f45','#4d4f80','#3d8394','#78b6a4','#def5e5'],
  rocket:['#03051a','#4c1d4b','#a11a5b','#e83e4d','#f69c73','#faebdd'],
  rdgy:['#67001f','#b2182b','#ef8a62','#f7f7f7','#999999','#4d4d4d','#1a1a1a']
};
const RASTER_STYLE_VARIETY=['#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f','#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ab','#2f4b7c','#a05195','#d45087','#f95d6a','#ff7c43','#ffa600','#00876c','#6aaa64','#aecb6b','#f1cf63','#f7a35c','#d95f59','#7b3294','#008837','#c2a5cf'];
let rasterStyleEditingId=null,rasterStyleSample=null,rasterStyleSamplePromise=null,rasterStyleClasses=[],rasterStyleBreaks=[],rasterStyleBusy=false;
function hexRgb(hex){let s=String(hex||'#000000').replace('#','').trim();if(s.length===3)s=s.split('').map(c=>c+c).join('');const n=parseInt(s,16);return Number.isFinite(n)?[(n>>16)&255,(n>>8)&255,n&255]:[0,0,0];}
function rgbHex(r,g,b){return'#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');}
function mixHex(a,b,t){const A=hexRgb(a),B=hexRgb(b);return rgbHex(A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t,A[2]+(B[2]-A[2])*t);}
function rampColor(name,t,invert=false){const arr=RASTER_STYLE_RAMPS[name]||RASTER_STYLE_RAMPS.viridis;t=Math.max(0,Math.min(1,Number.isFinite(t)?t:0));if(invert)t=1-t;const q=t*(arr.length-1),i=Math.min(arr.length-2,Math.floor(q));return mixHex(arr[i],arr[i+1],q-i);}
function rasterRampCss(name,invert=false){let arr=name==='random'?RASTER_STYLE_VARIETY.slice(0,12):(RASTER_STYLE_RAMPS[name]||RASTER_STYLE_RAMPS.viridis).slice();if(invert)arr.reverse();return`linear-gradient(90deg,${arr.join(',')})`;}
function updateRasterRampVisuals(){const ramp=$('#rasterStyleRamp')?.value||'spectral',inv=!!$('#rasterStyleInvert')?.checked,sw=$('#rasterStyleRampSwatch');if(sw)sw.style.background=rasterRampCss(ramp,inv);const ur=$('#rasterStyleUniqueRamp')?.value||'spectral',us=$('#rasterStyleUniqueRampSwatch');if(us)us.style.background=rasterRampCss(ur,false);}
function styleValueKey(v){if(!Number.isFinite(v))return'';const n=Math.round(v);return Math.abs(v-n)<1e-8?String(n):String(+v.toFixed(6));}
function rasterStyleDefault(r){const m=r?.meta||{},st=r?.rasterStyle||{},lo=Number.isFinite(+st.min)?+st.min:(m.range?.[0]??0),hi=Number.isFinite(+st.max)?+st.max:(m.range?.[1]??1);return{renderer:st.renderer||'original',ramp:st.ramp||'spectral',uniqueRamp:st.uniqueRamp||'spectral',invert:!!st.invert,min:lo,max:hi,interpolation:st.interpolation||'linear',classMode:st.classMode||'continuous',classCount:Math.max(2,Math.min(32,+st.classCount||5)),precision:Math.max(0,Math.min(8,+st.precision||4)),brightness:Number.isFinite(+st.brightness)?+st.brightness:0,contrast:Number.isFinite(+st.contrast)?+st.contrast:0,gamma:Number.isFinite(+st.gamma)?+st.gamma:1,saturation:Number.isFinite(+st.saturation)?+st.saturation:0,isDem:st.isDem!=null?!!st.isDem:(m.kind==='dem'),classes:cloneAny(st.classes||{}),breaks:Array.isArray(st.breaks)?cloneAny(st.breaks):[]};}
function adjustRasterRgb(rgb,style){let out=rgb.slice(),b=(+style.brightness||0)*2.55,c=Math.max(-100,Math.min(100,+style.contrast||0)),factor=(259*(c+255))/(255*(259-c||1)),gamma=Math.max(.2,+style.gamma||1),sat=Math.max(-100,Math.min(100,+style.saturation||0))/100;for(let i=0;i<3;i++){let v=factor*(out[i]-128)+128+b;v=255*Math.pow(Math.max(0,Math.min(255,v))/255,1/gamma);out[i]=Math.max(0,Math.min(255,v));}if(sat!==0){const lum=.2126*out[0]+.7152*out[1]+.0722*out[2],mul=sat<0?1+sat:1+sat*1.65;for(let i=0;i<3;i++)out[i]=Math.max(0,Math.min(255,lum+(out[i]-lum)*mul));}return out.map(v=>Math.round(v));}
function adjustRasterRgba(rgba,style){const out=new Uint8ClampedArray(rgba.length);for(let i=0;i<rgba.length;i+=4){const c=adjustRasterRgb([rgba[i],rgba[i+1],rgba[i+2]],style);out[i]=c[0];out[i+1]=c[1];out[i+2]=c[2];out[i+3]=rgba[i+3];}return out;}
function rasterFmt(v,p=4){if(!Number.isFinite(+v))return'—';const n=+(+v).toFixed(Math.max(0,Math.min(8,p)));return String(n);}
function rasterBreakAutoLabel(i,breaks,precision){const prev=i?breaks[i-1]?.upper:null,cur=breaks[i]?.upper;if(i===0)return`≤ ${rasterFmt(cur,precision)}`;if(cur==null)return`> ${rasterFmt(prev,precision)}`;return`${rasterFmt(prev,precision)} – ${rasterFmt(cur,precision)}`;}
function refreshRasterBreakLabels(){const p=Math.max(0,Math.min(8,+($('#rasterStylePrecision')?.value||4)));rasterStyleBreaks.forEach((b,i)=>{if(b.autoLabel!==false)b.label=rasterBreakAutoLabel(i,rasterStyleBreaks,p);});}
function makeRasterBreaks(lo,hi,n,ramp='spectral',invert=false,bounds=null){n=Math.max(2,Math.min(32,Math.round(n)||5));const br=[];for(let i=0;i<n;i++){let upper=i===n-1?null:(bounds?.[i]??(lo+(hi-lo)*(i+1)/n));br.push({upper:upper==null?null:(Number.isFinite(+upper)?+upper:null),color:rampColor(ramp,n<=1?.5:i/(n-1),invert),label:'',visible:true,autoLabel:true});}const old=rasterStyleBreaks;rasterStyleBreaks=br;refreshRasterBreakLabels();const out=rasterStyleBreaks;rasterStyleBreaks=old;return out;}
function rasterDiscreteClassIndex(v,breaks){for(let i=0;i<breaks.length;i++){const u=breaks[i].upper;if(u==null||v<=u)return i;}return Math.max(0,breaks.length-1);}
function pseudocolorRgb(v,style){const breaks=Array.isArray(style.breaks)?style.breaks:[];if(!breaks.length)return hexRgb(rampColor(style.ramp||'spectral',Math.max(0,Math.min(1,(v-style.min)/((style.max-style.min)||1))),!!style.invert));const mode=style.interpolation||'linear';if(mode==='discrete'||mode==='exact'){const i=rasterDiscreteClassIndex(v,breaks),rec=breaks[i];if(!rec||rec.visible===false)return null;if(mode==='exact'){const tol=Math.max(1e-9,Math.abs(style.max-style.min)*1e-8),target=rec.upper==null?style.max:rec.upper;if(Math.abs(v-target)>tol)return null;}return hexRgb(rec.color||'#888888');}
  const lo=Number.isFinite(+style.min)?+style.min:0,hi=Number.isFinite(+style.max)?+style.max:1,bounds=[lo,...breaks.slice(0,-1).map(b=>+b.upper),hi],centers=[];for(let i=0;i<breaks.length;i++)centers.push((bounds[i]+bounds[i+1])/2);if(v<=centers[0])return breaks[0].visible===false?null:hexRgb(breaks[0].color);if(v>=centers[centers.length-1])return breaks[breaks.length-1].visible===false?null:hexRgb(breaks[breaks.length-1].color);for(let i=0;i<centers.length-1;i++){if(v<=centers[i+1]){const a=breaks[i],b=breaks[i+1];if(a.visible===false||b.visible===false)return null;const t=(v-centers[i])/((centers[i+1]-centers[i])||1);return hexRgb(mixHex(a.color,b.color,Math.max(0,Math.min(1,t))));}}return hexRgb(breaks[breaks.length-1].color);}
function renderStyledValues(values,w,h,style,noData){const rgba=new Uint8ClampedArray(w*h*4),renderer=style.renderer||'gray',lo=Number.isFinite(+style.min)?+style.min:0,hi=Number.isFinite(+style.max)?+style.max:1,classes=style.classes||{};for(let i=0;i<values.length;i++){const v=values[i],o=i*4;if(!Number.isFinite(v)||(noData!=null&&Math.abs(v-noData)<=1e-8)){rgba[o+3]=0;continue;}let col=null,alpha=255;if(renderer==='unique'){const rec=classes[styleValueKey(v)];if(!rec||rec.visible===false){alpha=0;col=[0,0,0];}else col=hexRgb(rec.color||'#888888');}else if(renderer==='gray'){const t=Math.max(0,Math.min(1,(v-lo)/(hi-lo||1))),g=Math.round(t*255);col=[g,g,g];}else if(renderer==='pseudocolor'){col=pseudocolorRgb(v,style);if(!col){alpha=0;col=[0,0,0];}}else{const t=Math.max(0,Math.min(1,(v-lo)/(hi-lo||1))),g=Math.round(t*255);col=[g,g,g];}if(alpha){col=adjustRasterRgb(col,style);rgba[o]=col[0];rgba[o+1]=col[1];rgba[o+2]=col[2];}rgba[o+3]=alpha;}return rgba;}
function drawStyledRasterDetail(r){const m=r.meta||{},cacheMeta=r.styleCache;if(!cacheMeta?.ready||!m.sourceWidth||!m.sourceHeight)return;const sa=sourceAffine(r),res=Math.max(Math.hypot(sa.A,sa.D),Math.hypot(sa.B,sa.E)),sourcePixelScreen=res*state.view.scale;if(chooseDetailStep(sourcePixelScreen,m.downsample||1)==null)return;let vb=visibleSourceBounds(sa,m.sourceWidth,m.sourceHeight);if(!vb)return;if(!isDemRaster(r)){const wb=demWorkingBounds();if(wb){if(!boundsOverlap(rasterBounds(r),wb))return;const dp=[{x:wb.minX,y:wb.minY},{x:wb.maxX,y:wb.minY},{x:wb.maxX,y:wb.maxY},{x:wb.minX,y:wb.maxY}].map(q=>invertAffine(sa,q)).filter(Boolean);if(dp.length){const db={minX:Math.max(0,Math.min(...dp.map(q=>q.x))),maxX:Math.min(m.sourceWidth,Math.max(...dp.map(q=>q.x))),minY:Math.max(0,Math.min(...dp.map(q=>q.y))),maxY:Math.min(m.sourceHeight,Math.max(...dp.map(q=>q.y)))};vb={minX:Math.max(vb.minX,db.minX),maxX:Math.min(vb.maxX,db.maxX),minY:Math.max(vb.minY,db.minY),maxY:Math.min(vb.maxY,db.maxY)};}}}if(vb.maxX<=vb.minX||vb.maxY<=vb.minY)return;const ts=cacheMeta.tileSize||512,tx0=Math.floor(vb.minX/ts),tx1=Math.floor((vb.maxX-1)/ts),ty0=Math.floor(vb.minY/ts),ty1=Math.floor((vb.maxY-1)/ts),center=invertAffine(sa,{x:state.view.cx,y:state.view.cy})||{x:(vb.minX+vb.maxX)/2,y:(vb.minY+vb.maxY)/2},wanted=[];for(let ty=ty0;ty<=ty1;ty++)for(let tx=tx0;tx<=tx1;tx++)wanted.push({tx,ty,d:Math.hypot((tx+.5)*ts-center.x,(ty+.5)*ts-center.y)});wanted.sort((a,b)=>a.d-b.d);r._styleTileCache=r._styleTileCache||new Map();r._styleTilePending=r._styleTilePending||0;let req=0;for(const t of wanted){const key=`${t.tx}/${t.ty}`,rec=r._styleTileCache.get(key);if(rec?.bitmap){rec.last=performance.now();const x=t.tx*ts,y=t.ty*ts,a={A:sa.A,D:sa.D,B:sa.B,E:sa.E,C:sa.A*x+sa.B*y+sa.C,F:sa.D*x+sa.E*y+sa.F},ppx=res*state.view.scale;drawBitmapAffine(rec.bitmap,a,r.opacity,ppx,r);}else if(!rec&&req<4&&r._styleTilePending<4){req++;requestStyledRasterTile(r,t.tx,t.ty,key);}}evictStyledRasterTiles(r);}
async function requestStyledRasterTile(r,tx,ty,key){const c=r._styleTileCache||(r._styleTileCache=new Map());c.set(key,{loading:true,last:performance.now()});r._styleTilePending=(r._styleTilePending||0)+1;try{const rec=await dbGet('rasterStyleTiles',`${r.id}:${tx}:${ty}`);if(!rec?.blob){c.set(key,{missing:true,last:performance.now()});return;}const bmp=await createImageBitmap(rec.blob);c.set(key,{bitmap:bmp,last:performance.now()});requestAnimationFrame(drawAll);}catch(e){console.warn('No s’ha pogut llegir la tesela raster estilitzada',e);c.set(key,{error:true,last:performance.now()});}finally{r._styleTilePending=Math.max(0,(r._styleTilePending||1)-1);}}
function evictStyledRasterTiles(r){const c=r._styleTileCache;if(!c||c.size<=16)return;const items=[...c.entries()].filter(([,v])=>v.bitmap).sort((a,b)=>(a[1].last||0)-(b[1].last||0));while(c.size>10&&items.length){const[k,v]=items.shift();try{v.bitmap.close?.()}catch{}c.delete(k);}}
async function rasterStyleSourceInfo(r){if(!r?.sourceBlob||!window.GeoCauceGeoTIFF)throw Error('Cal conservar el GeoTIFF original per editar la simbologia');const ab=await r.sourceBlob.arrayBuffer(),meta=GeoCauceGeoTIFF.parse(ab);return{ab,meta};}
function rasterStyleIsSingleBandMeta(meta){return !(meta?.spp>=3&&meta?.photometric===2);}
function rasterStyleClassColor(index,total,ramp='spectral',value=null,invert=false){if(ramp==='random')return RASTER_STYLE_VARIETY[index%RASTER_STYLE_VARIETY.length];return rampColor(ramp,total<=1?.5:index/(total-1),invert);}
async function ensureRasterStyleSample(r){if(rasterStyleSample?.rasterId===r.id)return rasterStyleSample;if(rasterStyleSamplePromise?.rasterId===r.id)return rasterStyleSamplePromise.promise;const info=$('#rasterStylePreviewInfo');if(info)info.textContent='Llegint una mostra del GeoTIFF…';const promise=(async()=>{const {meta}=await rasterStyleSourceInfo(r),maxW=560,maxH=430,sc=Math.min(1,maxW/meta.width,maxH/meta.height),ow=Math.max(1,Math.round(meta.width*sc)),oh=Math.max(1,Math.round(meta.height*sc));if(rasterStyleIsSingleBandMeta(meta)){const dec=await GeoCauceGeoTIFF.decodeValuesRegion(meta,{x:0,y:0,width:meta.width,height:meta.height,outWidth:ow,outHeight:oh});rasterStyleSample={rasterId:r.id,kind:'single',width:ow,height:oh,values:dec.values,noData:dec.noData,min:dec.min,max:dec.max};}else{const dec=await GeoCauceGeoTIFF.decodeRegion(meta,{x:0,y:0,width:meta.width,height:meta.height,outWidth:ow,outHeight:oh});rasterStyleSample={rasterId:r.id,kind:'rgb',width:ow,height:oh,rgba:dec.rgba,noData:null,min:null,max:null};}if(info&&rasterStyleEditingId===r.id)info.textContent=`Mostra ${ow} × ${oh} · el render final processarà ${meta.width.toLocaleString()} × ${meta.height.toLocaleString()} píxels.`;return rasterStyleSample;})();rasterStyleSamplePromise={rasterId:r.id,promise};try{return await promise;}finally{if(rasterStyleSamplePromise?.promise===promise)rasterStyleSamplePromise=null;}}
function currentRasterStyleFromUi(r){const base=rasterStyleDefault(r),renderer=$('#rasterStyleRenderer')?.value||base.renderer,isGray=renderer==='gray',style={...base,renderer,ramp:$('#rasterStyleRamp')?.value||base.ramp,uniqueRamp:$('#rasterStyleUniqueRamp')?.value||base.uniqueRamp,invert:!!$('#rasterStyleInvert')?.checked,min:parseFloat(isGray?$('#rasterStyleGrayMin')?.value:$('#rasterStyleMin')?.value),max:parseFloat(isGray?$('#rasterStyleGrayMax')?.value:$('#rasterStyleMax')?.value),interpolation:$('#rasterStyleInterpolation')?.value||base.interpolation,classMode:$('#rasterStyleClassMode')?.value||base.classMode,classCount:Math.max(2,Math.min(32,Math.round(+($('#rasterStyleClassCount')?.value||base.classCount)))),precision:Math.max(0,Math.min(8,Math.round(+($('#rasterStylePrecision')?.value||base.precision)))),brightness:+($('#rasterStyleBrightness')?.value||0),contrast:+($('#rasterStyleContrast')?.value||0),gamma:+($('#rasterStyleGamma')?.value||1),saturation:+($('#rasterStyleSaturation')?.value||0),isDem:!!$('#rasterStyleIsDem')?.checked,classes:{},breaks:cloneAny(rasterStyleBreaks)};if(!Number.isFinite(style.min))style.min=base.min;if(!Number.isFinite(style.max))style.max=base.max;for(const rec of rasterStyleClasses){style.classes[styleValueKey(rec.value)]={color:rec.color,label:rec.label||styleValueKey(rec.value),visible:rec.visible!==false};}return style;}
function updateRasterStylePanels(){const v=$('#rasterStyleRenderer')?.value||'original',adjust=v!=='original';$('#rasterStyleUniquePanel')?.classList.toggle('hidden',v!=='unique');$('#rasterStyleGrayPanel')?.classList.toggle('hidden',v!=='gray');$('#rasterStylePseudoPanel')?.classList.toggle('hidden',v!=='pseudocolor');$('#rasterStyleAdjustPanel')?.classList.toggle('hidden',!adjust);const isRgb=v==='rgb';if($('#rasterStyleIsDem')){$('#rasterStyleIsDem').disabled=isRgb;if(isRgb)$('#rasterStyleIsDem').checked=false;}updateRasterRampVisuals();updateRasterStylePreview();}
function renderRasterStyleClasses(){const root=$('#rasterStyleClasses');if(!root)return;root.innerHTML='';for(const rec of rasterStyleClasses){const row=document.createElement('div');row.className='raster-class-row';row.innerHTML=`<code title="${escapeHtml(styleValueKey(rec.value))}">${escapeHtml(styleValueKey(rec.value))}</code><input type="color" value="${rec.color}"><input type="text" value="${escapeHtml(rec.label||styleValueKey(rec.value))}" aria-label="Etiqueta"><input type="checkbox" ${rec.visible!==false?'checked':''} aria-label="Visible">`;const [col,label,vis]=[row.querySelector('input[type=color]'),row.querySelector('input[type=text]'),row.querySelector('input[type=checkbox]')];col.oninput=()=>{rec.color=col.value;updateRasterStylePreview();};label.oninput=()=>rec.label=label.value;vis.onchange=()=>{rec.visible=vis.checked;updateRasterStylePreview();};root.appendChild(row);}}
function renderRasterStyleBreaks(){const root=$('#rasterStyleBreaks');if(!root)return;refreshRasterBreakLabels();root.innerHTML='';const p=Math.max(0,Math.min(8,+($('#rasterStylePrecision')?.value||4)));for(let i=0;i<rasterStyleBreaks.length;i++){const rec=rasterStyleBreaks[i],last=i===rasterStyleBreaks.length-1,prev=i?rasterStyleBreaks[i-1].upper:null,row=document.createElement('div');row.className='raster-break-row';const rule=last?`<div class="raster-break-rule readonly">&gt; ${escapeHtml(rasterFmt(prev,p))}</div>`:`<div class="raster-break-rule"><span>${i===0?'≤':'fins a'}</span><input class="raster-break-limit" type="number" step="any" value="${Number(rec.upper)}"><span>${i===0?'':' '}</span></div>`;row.innerHTML=`${rule}<input class="raster-break-color" type="color" value="${rec.color||'#888888'}"><input class="raster-break-label" type="text" value="${escapeHtml(rec.label||'')}"><input class="raster-break-visible" type="checkbox" ${rec.visible!==false?'checked':''}>`;const limit=row.querySelector('.raster-break-limit');if(limit)limit.onchange=()=>{const nv=+limit.value,lo=+($('#rasterStyleMin')?.value),hi=+($('#rasterStyleMax')?.value),prevV=i===0?lo:rasterStyleBreaks[i-1].upper,nextV=i===rasterStyleBreaks.length-2?hi:rasterStyleBreaks[i+1].upper;if(!Number.isFinite(nv)||!(nv>prevV&&nv<nextV)){toast(`El límit ha d’estar entre ${rasterFmt(prevV,p)} i ${rasterFmt(nextV,p)}`);limit.value=String(rec.upper);return;}rec.upper=nv;refreshRasterBreakLabels();renderRasterStyleBreaks();updateRasterStylePreview();};const color=row.querySelector('.raster-break-color');color.oninput=()=>{rec.color=color.value;updateRasterStylePreview();};const label=row.querySelector('.raster-break-label');label.oninput=()=>{rec.label=label.value;rec.autoLabel=false;};row.querySelector('.raster-break-visible').onchange=e=>{rec.visible=e.target.checked;updateRasterStylePreview();};root.appendChild(row);}}
function recolorRasterStyleClasses(){const ramp=$('#rasterStyleUniqueRamp')?.value||'spectral',n=rasterStyleClasses.length;rasterStyleClasses.forEach((r,i)=>r.color=rasterStyleClassColor(i,n,ramp,r.value));renderRasterStyleClasses();updateRasterRampVisuals();updateRasterStylePreview();}
function recolorRasterStyleBreaks(){const ramp=$('#rasterStyleRamp')?.value||'spectral',inv=!!$('#rasterStyleInvert')?.checked,n=rasterStyleBreaks.length;rasterStyleBreaks.forEach((r,i)=>r.color=rasterStyleClassColor(i,n,ramp,null,inv));renderRasterStyleBreaks();updateRasterRampVisuals();updateRasterStylePreview();}
async function classifyRasterValues(){const r=state.rasters.find(x=>x.id===rasterStyleEditingId);if(!r||rasterStyleBusy)return;rasterStyleBusy=true;const btn=$('#rasterStyleClassify'),status=$('#rasterStyleClassStatus');if(btn)btn.disabled=true;try{showImportProgress(r.name,.01,'Llegint tots els valors de la banda…');const {meta}=await rasterStyleSourceInfo(r);if(!rasterStyleIsSingleBandMeta(meta))throw Error('La capa és RGB/multibanda');const tile=768,uniq=new Map(),cols=Math.ceil(meta.width/tile),rows=Math.ceil(meta.height/tile),total=cols*rows;let done=0,tooMany=false;for(let ty=0;ty<rows&&!tooMany;ty++)for(let tx=0;tx<cols;tx++){const x=tx*tile,y=ty*tile,w=Math.min(tile,meta.width-x),h=Math.min(tile,meta.height-y),dec=await GeoCauceGeoTIFF.decodeValuesRegion(meta,{x,y,width:w,height:h,outWidth:w,outHeight:h});for(let i=0;i<dec.values.length;i++){const v=dec.values[i];if(!Number.isFinite(v)||(dec.noData!=null&&Math.abs(v-dec.noData)<=1e-8))continue;const key=styleValueKey(v);if(!uniq.has(key)){uniq.set(key,v);if(uniq.size>512){tooMany=true;break;}}}done++;showImportProgress(r.name,Math.min(.98,done/total),tooMany?'Més de 512 valors: millor pseudocolor':`Classificant valors · ${done}/${total}`);if(done%4===0)await new Promise(q=>setTimeout(q,0));if(tooMany)break;}if(tooMany){rasterStyleClasses=[];renderRasterStyleClasses();if(status)status.textContent='Hi ha més de 512 valors diferents. Usa Pseudocolor monobanda per a dades contínues.';toast('Més de 512 valors diferents · millor usar pseudocolor',5200);return;}const vals=[...uniq.values()].sort((a,b)=>a-b),ramp=$('#rasterStyleUniqueRamp')?.value||'spectral',cm=meta.photometric===3?meta.tags.get(320):null,bits=meta.bits?.[0]||8,palN=2**Math.min(16,bits);rasterStyleClasses=vals.map((v,i)=>{let color;if(cm&&Array.isArray(cm)&&v>=0&&Number.isInteger(v)&&v<palN&&cm.length>=palN*3)color=rgbHex((cm[v]||0)/257,(cm[v+palN]||0)/257,(cm[v+palN*2]||0)/257);else color=rasterStyleClassColor(i,vals.length,ramp,v);return{value:v,color,label:styleValueKey(v),visible:true};});renderRasterStyleClasses();if(status)status.textContent=`${vals.length} valors únics detectats llegint el raster complet.`;updateRasterStylePreview();}catch(e){console.error(e);if(status)status.textContent=e?.message||String(e);toast('No s’ha pogut classificar: '+(e?.message||e),5200);}finally{hideImportProgress();if(btn)btn.disabled=false;rasterStyleBusy=false;}}
async function rasterQuantileBounds(meta,lo,hi,n,name){const bins=8192,hist=new Float64Array(bins),tile=768,cols=Math.ceil(meta.width/tile),rows=Math.ceil(meta.height/tile),total=cols*rows;let count=0,done=0;for(let ty=0;ty<rows;ty++)for(let tx=0;tx<cols;tx++){const x=tx*tile,y=ty*tile,w=Math.min(tile,meta.width-x),h=Math.min(tile,meta.height-y),dec=await GeoCauceGeoTIFF.decodeValuesRegion(meta,{x,y,width:w,height:h,outWidth:w,outHeight:h});for(const v of dec.values){if(!Number.isFinite(v)||(dec.noData!=null&&Math.abs(v-dec.noData)<=1e-8)||v<lo||v>hi)continue;const bi=Math.max(0,Math.min(bins-1,Math.floor((v-lo)/((hi-lo)||1)*(bins-1))));hist[bi]++;count++;}done++;showImportProgress(name,.03+.9*(done/total),`Quantils · llegint tots els píxels ${done}/${total}`);if(done%3===0)await new Promise(q=>setTimeout(q,0));}if(!count)throw Error('No hi ha valors vàlids dins del rang seleccionat');const targets=[];for(let i=1;i<n;i++)targets.push(count*i/n);const out=[],step=(hi-lo)/(bins-1);let cum=0,ti=0;for(let b=0;b<bins&&ti<targets.length;b++){cum+=hist[b];while(ti<targets.length&&cum>=targets[ti]){out.push(lo+b*step);ti++;}}while(out.length<n-1)out.push(hi-(n-1-out.length)*step);const eps=Math.max(1e-12,Math.abs(hi-lo)*1e-9);for(let i=0;i<out.length;i++){const mn=i?out[i-1]+eps:lo+eps,mx=hi-eps*(out.length-i);out[i]=Math.max(mn,Math.min(mx,out[i]));}return out;}
async function classifyRasterPseudocolor(){const r=state.rasters.find(x=>x.id===rasterStyleEditingId);if(!r||rasterStyleBusy)return;const lo=+$('#rasterStyleMin').value,hi=+$('#rasterStyleMax').value,n=Math.max(2,Math.min(32,Math.round(+$('#rasterStyleClassCount').value||5))),mode=$('#rasterStyleClassMode').value||'continuous',status=$('#rasterStylePseudoStatus'),btn=$('#rasterStylePseudoClassify');if(!(Number.isFinite(lo)&&Number.isFinite(hi)&&hi>lo)){toast('Revisa el mínim i el màxim');return;}rasterStyleBusy=true;if(btn)btn.disabled=true;try{let bounds=null;if(mode==='quantile'){showImportProgress(r.name,.01,'Preparant classificació per quantils…');const {meta}=await rasterStyleSourceInfo(r);bounds=await rasterQuantileBounds(meta,lo,hi,n,r.name);}else if(mode==='continuous'){const step=(hi-lo)/(n-1);bounds=Array.from({length:n-1},(_,i)=>lo+(i+.5)*step);}else{bounds=Array.from({length:n-1},(_,i)=>lo+(hi-lo)*(i+1)/n);}rasterStyleBreaks=makeRasterBreaks(lo,hi,n,$('#rasterStyleRamp').value||'spectral',!!$('#rasterStyleInvert').checked,bounds);renderRasterStyleBreaks();updateRasterRampVisuals();updateRasterStylePreview();if(status)status.textContent=mode==='quantile'?`${n} classes per quantils, calculades recorrent el raster complet.`:mode==='equal'?`${n} intervals d’amplada igual. Pots editar qualsevol límit.`:`${n} punts de classificació continus. Pots editar qualsevol límit.`;}catch(e){console.error(e);if(status)status.textContent=e?.message||String(e);toast('No s’ha pogut classificar: '+(e?.message||e),6000);}finally{hideImportProgress();if(btn)btn.disabled=false;rasterStyleBusy=false;}}
async function updateRasterStylePreview(){const r=state.rasters.find(x=>x.id===rasterStyleEditingId),canvas=$('#rasterStylePreview');if(!r||!canvas)return;const g=canvas.getContext('2d');g.clearRect(0,0,canvas.width,canvas.height);const renderer=$('#rasterStyleRenderer')?.value||'original';try{if(renderer==='original'){const bmp=r.image;if(!bmp)return;const sc=Math.min(canvas.width/bmp.width,canvas.height/bmp.height),w=bmp.width*sc,h=bmp.height*sc;g.imageSmoothingEnabled=true;g.drawImage(bmp,(canvas.width-w)/2,(canvas.height-h)/2,w,h);return;}const sample=await ensureRasterStyleSample(r);if(rasterStyleEditingId!==r.id)return;const style=currentRasterStyleFromUi(r);let rgba;if(sample.kind==='rgb'){if(renderer!=='rgb')throw Error('Aquest GeoTIFF és multibanda: usa “Color multibanda”');rgba=adjustRasterRgba(sample.rgba,style);}else{if(renderer==='rgb')throw Error('Aquesta capa és monobanda');rgba=renderStyledValues(sample.values,sample.width,sample.height,style,sample.noData);}const ic=document.createElement('canvas');ic.width=sample.width;ic.height=sample.height;ic.getContext('2d').putImageData(new ImageData(rgba,sample.width,sample.height),0,0);g.imageSmoothingEnabled=renderer==='rgb';const sc=Math.min(canvas.width/sample.width,canvas.height/sample.height),w=sample.width*sc,h=sample.height*sc;g.drawImage(ic,(canvas.width-w)/2,(canvas.height-h)/2,w,h);}catch(e){g.fillStyle='#555';g.font='14px system-ui';g.fillText(e?.message||String(e),12,28);}}
async function openRasterStyleEditor(r){if(!r?.sourceBlob||r.meta?.sourceType!=='geotiff'){toast('L’editor de simbologia necessita el GeoTIFF original');return;}rasterStyleEditingId=r.id;rasterStyleSample=null;rasterStyleSamplePromise=null;const st=rasterStyleDefault(r);rasterStyleClasses=Object.entries(st.classes||{}).map(([key,v])=>({value:Number(key),color:v.color||'#888888',label:v.label||key,visible:v.visible!==false})).filter(x=>Number.isFinite(x.value)).sort((a,b)=>a.value-b.value);rasterStyleBreaks=Array.isArray(st.breaks)&&st.breaks.length?cloneAny(st.breaks):makeRasterBreaks(st.min,st.max,st.classCount,st.ramp,st.invert);$('#rasterStyleSubtitle').textContent=r.name;const m=r.meta||{},isRgb=(m.kind==='rgb'||(m.samplesPerPixel>=3&&m.photometric===2));const renderer=$('#rasterStyleRenderer');if(renderer){for(const o of renderer.options){if(o.value==='rgb')o.disabled=!isRgb;else if(['unique','gray','pseudocolor'].includes(o.value))o.disabled=isRgb;}renderer.value=st.renderer;if(renderer.selectedOptions[0]?.disabled)renderer.value=isRgb?'rgb':'original';}$('#rasterStyleRamp').value=st.ramp||'spectral';$('#rasterStyleUniqueRamp').value=st.uniqueRamp||'spectral';$('#rasterStyleInvert').checked=!!st.invert;$('#rasterStyleMin').value=String(st.min);$('#rasterStyleMax').value=String(st.max);$('#rasterStyleGrayMin').value=String(st.min);$('#rasterStyleGrayMax').value=String(st.max);$('#rasterStyleInterpolation').value=st.interpolation||'linear';$('#rasterStyleClassMode').value=st.classMode||'continuous';$('#rasterStyleClassCount').value=String(st.classCount||5);$('#rasterStylePrecision').value=String(st.precision??4);$('#rasterStyleBrightness').value=String(st.brightness||0);$('#rasterStyleContrast').value=String(st.contrast||0);$('#rasterStyleGamma').value=String(st.gamma||1);$('#rasterStyleSaturation').value=String(st.saturation||0);$('#rasterStyleBrightnessOut').value=String(st.brightness||0);$('#rasterStyleContrastOut').value=String(st.contrast||0);$('#rasterStyleGammaOut').value=(+st.gamma||1).toFixed(2);$('#rasterStyleSaturationOut').value=String(st.saturation||0);$('#rasterStyleIsDem').checked=!!st.isDem&&!isRgb;$('#rasterStyleIsDem').disabled=isRgb;const bits=(m.bitsPerSample||[]).join('/')||'—',spp=m.samplesPerPixel||'—',photo=m.photometric??'—';$('#rasterStyleBandInfo').textContent=`Mostres: ${spp} · Bits: ${bits} · Photometric: ${photo} · NoData: ${m.noData??'—'} · ${m.sourceWidth||'?'} × ${m.sourceHeight||'?'} px`;$('#rasterStyleClassStatus').textContent=rasterStyleClasses.length?`${rasterStyleClasses.length} classes guardades.`:'Prem “Llegir valors” per detectar les classes.';$('#rasterStylePseudoStatus').textContent=rasterStyleBreaks.length?`${rasterStyleBreaks.length} classes preparades. Pots editar els límits, colors i etiquetes.`:'Defineix el mode i prem “Classificar”.';renderRasterStyleClasses();renderRasterStyleBreaks();updateRasterRampVisuals();$('#rasterStyleSaveStatus').textContent=r.styleCache?.ready?'Mapa visual generat':'Sense render visual desat';$('#rasterStyleModal').classList.remove('hidden');updateRasterStylePanels();}
function closeRasterStyleEditor(){if(rasterStyleBusy)return;$('#rasterStyleModal')?.classList.add('hidden');rasterStyleEditingId=null;rasterStyleSample=null;rasterStyleSamplePromise=null;rasterStyleClasses=[];rasterStyleBreaks=[];}
async function restoreRasterOriginalStyle(r){if(!r?.sourceBlob)return;showImportProgress(r.name,.03,'Restablint el GeoTIFF original…');try{releaseRasterHeavyMemory(r);const ab=await r.sourceBlob.arrayBuffer(),dec=await GeoCauceGeoTIFF.decode(ab,{maxDimension:3072,onProgress:p=>showImportProgress(r.name,.08+p*.78,`Regenerant vista original · ${Math.round(p*100)}%`)}),blob=await rgbaToPngBlob(dec.width,dec.height,dec.rgba),image=await createImageBitmap(blob);await dbDeleteRasterStyleTiles(r.id);try{r.image?.close?.()}catch{}r.blob=blob;r.image=image;r.affine=dec.affine;r.georef=dec.georef;r.rasterStyle=null;r.styleCache=null;r.meta={...(r.meta||{}),kind:r.meta?.originalKind||dec.kind,styleRenderer:null,displayWidth:dec.width,displayHeight:dec.height,downsample:dec.downsample,range:dec.range,validPercent:dec.validPercent,validCount:dec.validCount};normalizeRasterOrientation(r);await dbPut('rasters',stripRaster(r));nativeSyncRasterMeta(r);renderLayers();drawAll();toast('Simbologia original restablerta');}finally{hideImportProgress();}}
async function saveRasterStyle(){
  const r=state.rasters.find(x=>x.id===rasterStyleEditingId);if(!r||rasterStyleBusy)return;
  const style=currentRasterStyleFromUi(r);
  if(style.renderer==='original'){rasterStyleBusy=true;try{await restoreRasterOriginalStyle(r);closeRasterStyleEditor();}catch(e){console.error(e);toast('No s’ha pogut restablir: '+(e?.message||e),5200);}finally{rasterStyleBusy=false;}return;}
  if(style.renderer==='unique'&&!Object.keys(style.classes||{}).length){toast('Llegeix els valors abans de guardar');return;}
  if((style.renderer==='gray'||style.renderer==='pseudocolor')&&(!Number.isFinite(style.min)||!Number.isFinite(style.max)||style.max<=style.min)){toast('Revisa el mínim i el màxim');return;}
  if(style.renderer==='pseudocolor'&&(!Array.isArray(style.breaks)||style.breaks.length<2)){toast('Classifica el pseudocolor abans de guardar');return;}
  rasterStyleBusy=true;const save=$('#rasterStyleSave');if(save)save.disabled=true;
  try{
    showImportProgress(r.name,.01,'Preparant render visual…');
    const rawSa=sourceAffine(r),{meta}=await rasterStyleSourceInfo(r),isSingle=rasterStyleIsSingleBandMeta(meta);
    if(isSingle&&style.renderer==='rgb')throw Error('Aquesta capa és monobanda; usa valors únics, gris o pseudocolor');
    if(!isSingle&&style.renderer!=='rgb')throw Error('Aquest GeoTIFF és multibanda; usa “Color multibanda”');
    r.meta.originalKind=r.meta.originalKind||r.meta.kind||(isSingle?'dem':'rgb');
    r.styleCache={...(r.styleCache||{}),ready:false,generating:true,version:2};await dbPut('rasters',stripRaster(r));
    await dbDeleteRasterStyleTiles(r.id);releaseRasterHeavyMemory(r);
    const tileSize=512,cols=Math.ceil(meta.width/tileSize),rows=Math.ceil(meta.height/tileSize),total=cols*rows;let done=0;
    for(let ty=0;ty<rows;ty++)for(let tx=0;tx<cols;tx++){
      const x=tx*tileSize,y=ty*tileSize,w=Math.min(tileSize,meta.width-x),h=Math.min(tileSize,meta.height-y);let rgba;
      if(isSingle){const dec=await GeoCauceGeoTIFF.decodeValuesRegion(meta,{x,y,width:w,height:h,outWidth:w,outHeight:h});rgba=renderStyledValues(dec.values,w,h,style,dec.noData);}
      else{const dec=await GeoCauceGeoTIFF.decodeRegion(meta,{x,y,width:w,height:h,outWidth:w,outHeight:h});rgba=adjustRasterRgba(dec.rgba,style);}
      const blob=await rgbaToPngBlob(w,h,rgba);await dbPut('rasterStyleTiles',{key:`${r.id}:${tx}:${ty}`,rasterId:r.id,tx,ty,x,y,w,h,blob});done++;
      showImportProgress(r.name,.03+.82*(done/total),`Generant mapa visual · ${done}/${total} teseles`);if(done%3===0)await new Promise(q=>setTimeout(q,0));
    }
    const maxDim=3072,sc=Math.min(1,maxDim/meta.width,maxDim/meta.height),pw=Math.max(1,Math.round(meta.width*sc)),ph=Math.max(1,Math.round(meta.height*sc));showImportProgress(r.name,.88,'Creant vista general estilitzada…');let prgba,validPercent=100;
    if(isSingle){const prev=await GeoCauceGeoTIFF.decodeValuesRegion(meta,{x:0,y:0,width:meta.width,height:meta.height,outWidth:pw,outHeight:ph});prgba=renderStyledValues(prev.values,pw,ph,style,prev.noData);validPercent=prev.validCount?100*prev.validCount/(pw*ph):0;}
    else{const prev=await GeoCauceGeoTIFF.decodeRegion(meta,{x:0,y:0,width:meta.width,height:meta.height,outWidth:pw,outHeight:ph});prgba=adjustRasterRgba(prev.rgba,style);}
    const pblob=await rgbaToPngBlob(pw,ph,prgba),pimg=await createImageBitmap(pblob);try{r.image?.close?.()}catch{}
    r.blob=pblob;r.image=pimg;r.affine={A:rawSa.A*(meta.width/pw),D:rawSa.D*(meta.width/pw),B:rawSa.B*(meta.height/ph),E:rawSa.E*(meta.height/ph),C:rawSa.C,F:rawSa.F};r.rasterStyle=style;r.styleCache={ready:true,version:2,tileSize,cols,rows,generatedAt:Date.now(),sourceWidth:meta.width,sourceHeight:meta.height};
    r.meta={...(r.meta||{}),kind:style.isDem?'dem':(isSingle?'thematic':'rgb'),styleRenderer:style.renderer,displayWidth:pw,displayHeight:ph,downsample:Math.max(meta.width/pw,meta.height/ph),validPercent};normalizeRasterOrientation(r);
    await dbPut('rasters',stripRaster(r));nativeSyncRasterMeta(r);showImportProgress(r.name,1,'Mapa visual guardat');renderLayers();drawAll();toast(`Estil guardat · ${total} teseles pre-renderitzades`,4500);setTimeout(closeRasterStyleEditor,180);
  }catch(e){console.error('Raster style',e);r.styleCache={...(r.styleCache||{}),ready:false,generating:false,failedAt:Date.now()};try{await dbPut('rasters',stripRaster(r));}catch{}toast('No s’ha pogut generar el mapa visual: '+(e?.message||e),7000);}
  finally{hideImportProgress();if(save)save.disabled=false;rasterStyleBusy=false;}
}

// ---------- Vista 3D del terreno (v0.12.4) ----------
const terrain3d={
  gl:null,program:null,posBuffer:null,uvBuffer:null,indexBuffer:null,texture:null,indexCount:0,indexType:null,
  mesh:null,dem:null,building:false,refreshTimer:null,pointers:new Map(),gesture:null,
  camera:{yaw:0,pitch:.88,distance:2.85,targetX:0,targetY:0},
};
function chooseDemRasterFor3D(){
  const center={x:state.view.cx,y:state.view.cy};
  const candidates=demGroupRasters().filter(r=>r.sourceBlob&&r.meta?.validPercent!==0);
  candidates.sort((a,b)=>(sourceResolution(a)||Infinity)-(sourceResolution(b)||Infinity));
  return candidates.find(r=>pointInBounds(center,rasterBounds(r)))||candidates.find(r=>{const b=rasterBounds(r),{w,h}=screenSize();return [screenToWorld({x:0,y:0}),screenToWorld({x:w,y:0}),screenToWorld({x:w,y:h}),screenToWorld({x:0,y:h})].some(p=>pointInBounds(p,b));})||candidates[0]||null;
}
function showTerrain3DLoading(text='Generando terreno 3D…'){
  let el=$('#terrain3dLoading');
  if(!el){el=document.createElement('div');el.id='terrain3dLoading';el.className='terrain3d-loading';$('#mapScreen').appendChild(el);}
  el.textContent=text;el.classList.remove('hidden');
}
function hideTerrain3DLoading(){const el=$('#terrain3dLoading');if(el)el.classList.add('hidden');}
function resizeTerrain3DCanvas(){
  if(!terrain3dCanvas)return;
  const r=terrain3dCanvas.getBoundingClientRect();if(!r.width||!r.height)return;
  const dpr=Math.min(devicePixelRatio||1,2);
  const w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));
  if(terrain3dCanvas.width!==w||terrain3dCanvas.height!==h){terrain3dCanvas.width=w;terrain3dCanvas.height=h;terrain3dCanvas._dpr=dpr;if(state.view3d?.active)renderTerrain3D();}
}
function compile3DShader(gl,type,source){const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh)||'Error shader 3D');return sh;}
function ensureTerrain3DGl(){
  if(terrain3d.gl)return true;
  const gl=terrain3dCanvas?.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:false})||terrain3dCanvas?.getContext('experimental-webgl');
  if(!gl)return false;
  const vs=compile3DShader(gl,gl.VERTEX_SHADER,`attribute vec3 aPos;attribute vec2 aUv;uniform mat4 uMvp;uniform float uZScale;varying vec2 vUv;void main(){vec3 p=aPos;p.z*=uZScale;gl_Position=uMvp*vec4(p,1.0);vUv=aUv;}`);
  const fs=compile3DShader(gl,gl.FRAGMENT_SHADER,`precision mediump float;uniform sampler2D uTex;varying vec2 vUv;void main(){vec4 c=texture2D(uTex,vUv);gl_FragColor=vec4(c.rgb,1.0);}`);
  const pr=gl.createProgram();gl.attachShader(pr,vs);gl.attachShader(pr,fs);gl.linkProgram(pr);if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(pr)||'Error enlazando 3D');
  terrain3d.gl=gl;terrain3d.program=pr;terrain3d.posBuffer=gl.createBuffer();terrain3d.uvBuffer=gl.createBuffer();terrain3d.indexBuffer=gl.createBuffer();terrain3d.texture=gl.createTexture();
  gl.useProgram(pr);gl.uniform1i(gl.getUniformLocation(pr,'uTex'),0);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.clearColor(.055,.07,.075,1);
  return true;
}
function v3sub(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]]}function v3dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}function v3cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}function v3norm(a){const n=Math.hypot(...a)||1;return[a[0]/n,a[1]/n,a[2]/n]}
function mat4Perspective(fovy,aspect,near,far){const f=1/Math.tan(fovy/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);}
function mat4LookAt(eye,center,up){const z=v3norm(v3sub(eye,center)),x=v3norm(v3cross(up,z)),y=v3cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-v3dot(x,eye),-v3dot(y,eye),-v3dot(z,eye),1]);}
function mat4Mul(a,b){const out=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let v=0;for(let k=0;k<4;k++)v+=a[k*4+r]*b[c*4+k];out[c*4+r]=v;}return out;}
function resetTerrain3DCamera(){terrain3d.camera={yaw:0,pitch:.88,distance:2.85,targetX:0,targetY:0};updateCompass();renderTerrain3D();}
function uploadTerrain3DTexture(){
  const gl=terrain3d.gl;if(!gl||!mapCanvas.width)return;
  let source=mapCanvas;const maxSide=3072,max=Math.max(mapCanvas.width,mapCanvas.height);
  if(max>maxSide){const sc=maxSide/max,c=document.createElement('canvas');c.width=Math.max(1,Math.round(mapCanvas.width*sc));c.height=Math.max(1,Math.round(mapCanvas.height*sc));const g=c.getContext('2d');g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(mapCanvas,0,0,c.width,c.height);source=c;}
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,terrain3d.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,0);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
}
function scheduleTerrain3DTextureRefresh(){
  if(!state.view3d?.active||terrain3d.building)return;clearTimeout(terrain3d.refreshTimer);terrain3d.refreshTimer=setTimeout(()=>{try{uploadTerrain3DTexture();renderTerrain3D();}catch(e){console.warn('Textura 3D',e)}},180);
}
async function buildTerrain3D({resetCamera=false}={}){
  if(terrain3d.building)return;const dem=chooseDemRasterFor3D();if(!dem){toast('Para la vista 3D necesitas un GeoTIFF MDT/LiDAR con elevaciones',5200);return false;}
  if(!ensureTerrain3DGl()){toast('Este dispositivo/WebView no ofrece WebGL para la vista 3D',5200);return false;}
  terrain3d.building=true;showTerrain3DLoading('Muestreando MDT/LiDAR…');
  try{
    drawAll();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const {w,h}=screenSize();if(w<20||h<20)throw Error('Vista de mapa no disponible');
    const cols=Math.max(48,Math.min(112,Math.round(w/13))),rows=Math.max(36,Math.min(90,Math.round(cols*h/w)));
    const screenPts=[],worldPts=[];
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const sx=i/(cols-1)*w,sy=j/(rows-1)*h,world=screenToWorld({x:sx,y:sy});screenPts.push({sx,sy,world});worldPts.push(world);}
    const sampled=await sampleDemMosaic(worldPts,{onProgress:q=>{const el=$('#terrain3dLoading');if(el)el.textContent=`Muestreando MDT/LiDAR… ${Math.round(q*100)} %`;}}),vals=sampled.values;
    const valid=vals.filter(Number.isFinite);if(valid.length<Math.max(20,vals.length*.18))throw Error('La vista actual queda fuera de la cobertura útil del MDT/LiDAR');
    const minZ=Math.min(...valid),maxZ=Math.max(...valid),centerZ=(minZ+maxZ)/2,viewW=w/state.view.scale,viewH=h/state.view.scale,maxDim=Math.max(viewW,viewH,1);
    const pos=new Float32Array(cols*rows*3),uv=new Float32Array(cols*rows*2),ok=new Uint8Array(cols*rows);
    for(let k=0;k<vals.length;k++){const j=Math.floor(k/cols),i=k-j*cols,u=i/(cols-1),v=j/(rows-1),z=vals[k];pos[k*3]=(u-.5)*2*viewW/maxDim;pos[k*3+1]=(.5-v)*2*viewH/maxDim;pos[k*3+2]=Number.isFinite(z)?(z-centerZ)*2/maxDim:0;uv[k*2]=u;uv[k*2+1]=v;ok[k]=Number.isFinite(z)?1:0;}
    const ind=[];for(let j=0;j<rows-1;j++)for(let i=0;i<cols-1;i++){const a=j*cols+i,b=a+1,c=a+cols,d=c+1;if(ok[a]&&ok[b]&&ok[c])ind.push(a,c,b);if(ok[b]&&ok[c]&&ok[d])ind.push(b,c,d);}
    if(ind.length<6)throw Error('No hay suficientes celdas válidas para construir la malla 3D');
    const gl=terrain3d.gl;gl.bindBuffer(gl.ARRAY_BUFFER,terrain3d.posBuffer);gl.bufferData(gl.ARRAY_BUFFER,pos,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,terrain3d.uvBuffer);gl.bufferData(gl.ARRAY_BUFFER,uv,gl.STATIC_DRAW);
    const useUint32=(cols*rows)>65535&&!!gl.getExtension('OES_element_index_uint'),idx=useUint32?new Uint32Array(ind):new Uint16Array(ind);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,terrain3d.indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);terrain3d.indexCount=idx.length;terrain3d.indexType=useUint32?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT;
    terrain3d.mesh={cols,rows,minZ,maxZ,centerZ,viewW,viewH,maxDim};terrain3d.dem=dem;uploadTerrain3DTexture();if(resetCamera)resetTerrain3DCamera();
    const res=activeDemGroup()?demGroupResolution(activeDemGroup()):sourceResolution(dem);$('#terrain3dSource').textContent=`${activeDemGroup()?.name||dem.name}${Number.isFinite(res)?` · ${formatNum(res,2)} m/píxel`:''}`;renderTerrain3D();return true;
  }catch(e){console.error(e);toast(`No se pudo generar la vista 3D: ${e.message||e}`,6500);return false;}
  finally{terrain3d.building=false;hideTerrain3DLoading();}
}
function renderTerrain3D(){
  if(!state.view3d?.active&&!terrain3d.mesh)return;const gl=terrain3d.gl;if(!gl||!terrain3d.mesh||!terrain3d.indexCount)return;resizeTerrain3DCanvas();
  gl.viewport(0,0,terrain3dCanvas.width,terrain3dCanvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(terrain3d.program);
  const cam=terrain3d.camera,p=cam.pitch,y=cam.yaw,d=cam.distance,ct=Math.cos(p),eye=[cam.targetX+d*ct*Math.sin(y),cam.targetY-d*ct*Math.cos(y),d*Math.sin(p)],center=[cam.targetX,cam.targetY,0];
  const proj=mat4Perspective(45*Math.PI/180,terrain3dCanvas.width/Math.max(1,terrain3dCanvas.height),.04,30),view=mat4LookAt(eye,center,[0,0,1]),mvp=mat4Mul(proj,view);
  gl.uniformMatrix4fv(gl.getUniformLocation(terrain3d.program,'uMvp'),false,mvp);gl.uniform1f(gl.getUniformLocation(terrain3d.program,'uZScale'),Number(state.view3d.exaggeration)||1);
  const aPos=gl.getAttribLocation(terrain3d.program,'aPos'),aUv=gl.getAttribLocation(terrain3d.program,'aUv');gl.bindBuffer(gl.ARRAY_BUFFER,terrain3d.posBuffer);gl.enableVertexAttribArray(aPos);gl.vertexAttribPointer(aPos,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,terrain3d.uvBuffer);gl.enableVertexAttribArray(aUv);gl.vertexAttribPointer(aUv,2,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,terrain3d.indexBuffer);gl.bindTexture(gl.TEXTURE_2D,terrain3d.texture);gl.drawElements(gl.TRIANGLES,terrain3d.indexCount,terrain3d.indexType,0);
}
async function enter3DMode(){
  if(state.view3d?.active)return;showTerrain3DLoading();const ok=await buildTerrain3D({resetCamera:true});if(!ok){hideTerrain3DLoading();return;}
  state.view3d.active=true;$('#mapScreen').classList.add('view-3d');terrain3dCanvas.classList.remove('hidden');$('#terrain3dHud').classList.remove('hidden');$('#view3dBtn').classList.add('active');$('#terrain3dExaggeration').value=String(state.view3d.exaggeration||1);resizeTerrain3DCanvas();renderTerrain3D();updateCompass();toast('Vista 3D de inspección · ortofoto/topográfico = capas visibles en 2D',4300);
}
function exit3DMode({quiet=false}={}){if(!state.view3d?.active)return;state.view3d.active=false;$('#mapScreen').classList.remove('view-3d');terrain3dCanvas.classList.add('hidden');$('#terrain3dHud').classList.add('hidden');$('#view3dBtn').classList.remove('active');updateCompass();if(!quiet)toast('Vista 2D');}
async function toggle3DMode(){if(state.view3d?.active)exit3DMode();else await enter3DMode();}
function installTerrain3DInteractions(){
  if(!terrain3dCanvas||terrain3dCanvas._installed)return;terrain3dCanvas._installed=true;terrain3dCanvas.style.touchAction='none';
  const pt=e=>{const r=terrain3dCanvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
  terrain3dCanvas.addEventListener('pointerdown',e=>{if(!state.view3d.active)return;e.preventDefault();terrain3dCanvas.setPointerCapture?.(e.pointerId);terrain3d.pointers.set(e.pointerId,pt(e));const a=[...terrain3d.pointers.values()];if(a.length===1)terrain3d.gesture={type:'pan',p:{...a[0]},targetX:terrain3d.camera.targetX,targetY:terrain3d.camera.targetY,yaw:terrain3d.camera.yaw};else if(a.length===2){const dx=a[1].x-a[0].x,dy=a[1].y-a[0].y;terrain3d.gesture={type:'multi',dist:Math.hypot(dx,dy),angle:Math.atan2(dy,dx),midY:(a[0].y+a[1].y)/2,distance:terrain3d.camera.distance,yaw:terrain3d.camera.yaw,pitch:terrain3d.camera.pitch};}});
  terrain3dCanvas.addEventListener('pointermove',e=>{if(!state.view3d.active||!terrain3d.pointers.has(e.pointerId))return;e.preventDefault();terrain3d.pointers.set(e.pointerId,pt(e));const a=[...terrain3d.pointers.values()],g=terrain3d.gesture;if(!g)return;if(a.length===1&&g.type==='pan'){const dx=a[0].x-g.p.x,dy=a[0].y-g.p.y,k=.0028*terrain3d.camera.distance,cy=Math.cos(g.yaw),sy=Math.sin(g.yaw),rx=dx*k,ry=-dy*k;terrain3d.camera.targetX=g.targetX-(rx*cy-ry*sy);terrain3d.camera.targetY=g.targetY-(rx*sy+ry*cy);renderTerrain3D();}else if(a.length>=2){if(g.type!=='multi'){const dx=a[1].x-a[0].x,dy=a[1].y-a[0].y;terrain3d.gesture={type:'multi',dist:Math.hypot(dx,dy),angle:Math.atan2(dy,dx),midY:(a[0].y+a[1].y)/2,distance:terrain3d.camera.distance,yaw:terrain3d.camera.yaw,pitch:terrain3d.camera.pitch};return;}const dx=a[1].x-a[0].x,dy=a[1].y-a[0].y,dist=Math.max(8,Math.hypot(dx,dy)),ang=Math.atan2(dy,dx),midY=(a[0].y+a[1].y)/2;terrain3d.camera.distance=Math.max(1.35,Math.min(8,g.distance*g.dist/dist));terrain3d.camera.yaw=normAngle(g.yaw-(ang-g.angle));terrain3d.camera.pitch=Math.max(.22,Math.min(1.38,g.pitch-(midY-g.midY)*.0045));updateCompass();renderTerrain3D();}});
  const end=e=>{terrain3d.pointers.delete(e.pointerId);const a=[...terrain3d.pointers.values()];if(a.length===1)terrain3d.gesture={type:'pan',p:{...a[0]},targetX:terrain3d.camera.targetX,targetY:terrain3d.camera.targetY,yaw:terrain3d.camera.yaw};else terrain3d.gesture=null;};terrain3dCanvas.addEventListener('pointerup',end);terrain3dCanvas.addEventListener('pointercancel',end);
  terrain3dCanvas.addEventListener('wheel',e=>{if(!state.view3d.active)return;e.preventDefault();terrain3d.camera.distance=Math.max(1.35,Math.min(8,terrain3d.camera.distance*Math.exp(e.deltaY*.001)));renderTerrain3D();},{passive:false});
}
// ---------- fin vista 3D ----------

function makePattern(id,ctx,anchor={x:0,y:0}) {
  // V0.8: patrón en unidades de pantalla. No crece ni encoge al hacer zoom.
  // La fase se ancla al propio elemento para que el patrón no "nade" dentro
  // del polígono cuando se desplaza o cambia de escala.
  const tile=28;
  const c=document.createElement('canvas'); c.width=c.height=tile;
  const g=c.getContext('2d');
  g.fillStyle='rgba(238,224,188,.46)'; g.fillRect(0,0,tile,tile);
  g.strokeStyle='rgba(47,51,47,.82)'; g.fillStyle='rgba(47,51,47,.82)'; g.lineWidth=1.05;
  if(id==='fine'||id==='coarse'){
    const step=id==='fine'?7:9,rad=id==='fine'?.75:1.25;
    for(let y=3;y<tile;y+=step) for(let x=3;x<tile;x+=step){g.beginPath();g.arc(x+(y%2?2:0),y,rad,0,Math.PI*2);g.fill();}
  } else if(['gravel','pebbles','conglomerate','weak','clast','mixed','blocks'].includes(id)){
    const rad=id==='blocks'?6:id==='pebbles'||id==='clast'?4.5:2.8;
    for(let y=7;y<tile;y+=14) for(let x=7;x<tile;x+=14){g.beginPath();g.ellipse(x,y,rad,Math.max(2,rad*.7),.3,0,Math.PI*2);g.stroke();}
    if(id==='mixed') for(let y=3;y<tile;y+=8) for(let x=3;x<tile;x+=8) g.fillRect(x,y,1.3,1.3);
  } else if(id==='matrix'||id==='breccia'||id==='colluvium'){
    for(let i=-tile;i<tile*2;i+=10){g.beginPath();g.moveTo(i,tile);g.lineTo(i+tile,0);g.stroke();}
    if(id==='breccia') for(let i=-tile;i<tile*2;i+=18){g.beginPath();g.moveTo(i,0);g.lineTo(i+18,tile);g.stroke();}
  } else if(id==='alluvium'){
    for(let y=5;y<tile;y+=8){g.beginPath();g.moveTo(0,y);g.lineTo(tile,y);g.stroke();}
  }
  const pattern=ctx.createPattern(c,'repeat');
  if(pattern?.setTransform && typeof DOMMatrix!=='undefined'){
    const tx=((anchor.x%tile)+tile)%tile, ty=((anchor.y%tile)+tile)%tile;
    pattern.setTransform(new DOMMatrix().translate(tx,ty));
  }
  return pattern;
}

function rawPolygonArea(pts) {
  if(!pts || pts.length<3) return 0;
  let a=0;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++) a += pts[j].x*pts[i].y - pts[i].x*pts[j].y;
  return Math.abs(a/2);
}
function featureArea(f) {
  if(!f.closed || f.points.length<3) return null;
  if(!f.erasures?.length) return rawPolygonArea(f.points);
  // El borrado de zona es una máscara no destructiva. Estimamos el área visible con una malla.
  const b=featureBounds(f), W=b.maxX-b.minX, H=b.maxY-b.minY;
  if(!W || !H) return 0;
  const nx=90, ny=Math.min(140,Math.max(20,Math.round(nx*H/W)));
  let inside=0,total=nx*ny;
  for(let iy=0;iy<ny;iy++) for(let ix=0;ix<nx;ix++){
    const p={x:b.minX+(ix+.5)*W/nx,y:b.minY+(iy+.5)*H/ny};
    if(pointInPoly(p,f.points) && !pointErased(f,p)) inside++;
  }
  return W*H*(inside/total);
}
function featurePolylines(f){if(f?.type==='watercourse'&&Array.isArray(f.fragments)&&f.fragments.length)return f.fragments.filter(a=>Array.isArray(a)&&a.length>1);return f?.points?.length?[f.points]:[];}
function featureLength(f){let d=0;for(const pts of featurePolylines(f)){for(let i=1;i<pts.length;i++)d+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);}return d;}
function polygonCentroid(pts){let x=0,y=0;for(const p of pts){x+=p.x;y+=p.y}return{x:x/pts.length,y:y/pts.length};}

function featureLineStyle(f,def={color:'#2e78ad',width:3,dash:'solid'}){const dashName=f?.styleDash||def.dash||'solid';const dash=dashName==='dash'?[10,6]:dashName==='dot'?[2,5]:dashName==='dashdot'?[10,5,2,5]:[];return{color:f?.styleColor||def.color,width:Number.isFinite(+f?.styleWidth)?Math.max(.5,Math.min(14,+f.styleWidth)):def.width,dash};}
function drawFeatureBase(ctx,f,{ghost=false}={}) {
  const pts=f.points.map(worldToScreen);
  if(!pts.length) return;
  ctx.save();
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
  for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x,pts[i].y);
  if(f.closed) ctx.closePath();

  if(f.paint){
    ctx.strokeStyle=makePattern(f.material,ctx,pts[0]);
    ctx.lineWidth=18;
    ctx.stroke();
    ctx.strokeStyle='rgba(40,45,40,.45)';ctx.lineWidth=1;ctx.stroke();
  } else {
    if(f.closed&&f.filled){ctx.fillStyle=makePattern(f.material,ctx,pts[0]);ctx.fill();}
    if(f.type==='basin'){
      const st=featureLineStyle(f,{color:'#416d55',width:2.2,dash:'dash'});ctx.lineWidth=st.width;ctx.strokeStyle=st.color;ctx.setLineDash(st.dash);ctx.stroke();ctx.setLineDash([]);
    } else if(f.type==='watercourse'){
      const st=featureLineStyle(f,{color:f.id===state.activeCourseId?'#155c96':'#2e78ad',width:f.id===state.activeCourseId?5:3.2,dash:'solid'});ctx.lineWidth=st.width;ctx.strokeStyle=st.color;ctx.setLineDash(st.dash);
      for(const frag of featurePolylines(f)){const sp=frag.map(worldToScreen);if(sp.length<2)continue;ctx.beginPath();ctx.moveTo(sp[0].x,sp[0].y);for(let i=1;i<sp.length;i++)ctx.lineTo(sp[i].x,sp[i].y);ctx.stroke();}
    } else if(f.type==='reach'){
      const st=featureLineStyle(f,{color:'#d58425',width:5.5,dash:'solid'});ctx.lineWidth=st.width;ctx.strokeStyle=st.color;ctx.setLineDash(st.dash);ctx.stroke();ctx.setLineDash([]);
    } else if(f.type==='channel'){
      const st=featureLineStyle(f,{color:'#2464a4',width:3,dash:'dash'});ctx.lineWidth=st.width;ctx.strokeStyle=st.color;ctx.setLineDash(st.dash);ctx.stroke();ctx.setLineDash([]);
    } else if(f.type==='section'){
      ctx.lineWidth=3;ctx.strokeStyle='#752c2c';ctx.stroke();
      const anchor=f.anchorPoint?worldToScreen(f.anchorPoint):pts[Math.floor(pts.length/2)];ctx.fillStyle='#752c2c';ctx.beginPath();ctx.arc(anchor.x,anchor.y,4.5,0,Math.PI*2);ctx.fill();ctx.font='600 13px "Segoe Print",cursive';ctx.fillText(f.sectionName||f.id,anchor.x+7,anchor.y-8);
    } else {
      ctx.lineWidth=2;ctx.strokeStyle='#252a26';ctx.stroke();
    }
  }

  if(!ghost && f.id===state.selectedId){
    ctx.lineWidth=4;ctx.strokeStyle='#1668e8';ctx.setLineDash([]);
    if(f.type==='watercourse'){
      for(const frag of featurePolylines(f)){const sp=frag.map(worldToScreen);if(sp.length<2)continue;ctx.beginPath();ctx.moveTo(sp[0].x,sp[0].y);for(let i=1;i<sp.length;i++)ctx.lineTo(sp[i].x,sp[i].y);ctx.stroke();}
    }else{
      ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);if(f.closed)ctx.closePath();ctx.stroke();
    }
  }
  ctx.restore();
}
function applyFeatureErasures(ctx,f){
  if(!f.erasures?.length) return;
  ctx.save();ctx.globalCompositeOperation='destination-out';ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='rgba(0,0,0,1)';
  for(const er of f.erasures){
    const pts=er.points.map(worldToScreen);if(!pts.length)continue;
    ctx.lineWidth=Math.max(2,(er.widthWorld||1)*state.view.scale);
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.stroke();
  }
  ctx.restore();
}
let mapMotionUntil=0,mapMotionTimer=null;
function markMapMotion(ms=140){mapMotionUntil=performance.now()+ms;clearTimeout(mapMotionTimer);mapMotionTimer=setTimeout(()=>{if(performance.now()>=mapMotionUntil&&state.screen==='map')drawAll();},ms+24);}
function mapInMotion(){return performance.now()<mapMotionUntil;}
function currentViewBoundsWorld(marginPx=80){const {w,h}=screenSize(),pts=[screenToWorld({x:-marginPx,y:-marginPx}),screenToWorld({x:w+marginPx,y:-marginPx}),screenToWorld({x:w+marginPx,y:h+marginPx}),screenToWorld({x:-marginPx,y:h+marginPx})];let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(const p of pts){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}return{minX,maxX,minY,maxY};}
function quickFeatureBounds(f){let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,found=false;for(const path of featurePolylines(f)){for(const p of path){if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y))continue;found=true;if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;if(p.y<minY)minY=p.y;if(p.y>maxY)maxY=p.y;}}return found?{minX,maxX,minY,maxY}:null;}
function featureVisibleInBounds(f,vb){const b=quickFeatureBounds(f);return !!b&&boundsIntersect(b,vb);}
function drawFeature(f,{ghost=false,opacity=1}={}){
  if(!(f.erasures?.length)){mapCtx.save();mapCtx.globalAlpha=ghost?opacity:1;drawFeatureBase(mapCtx,f,{ghost});mapCtx.restore();}
  else{clearCtx(featureCtx,featureCanvas);drawFeatureBase(featureCtx,f,{ghost});applyFeatureErasures(featureCtx,f);mapCtx.save();mapCtx.setTransform(1,0,0,1,0,0);mapCtx.globalAlpha=ghost?opacity:1;mapCtx.drawImage(featureCanvas,0,0);mapCtx.restore();applyDpr(mapCtx,mapCanvas);}
  if(!ghost && f.closed && !f.paint && f.type!=='basin'){
    const c=polygonCentroid(f.points);if(pointErased(f,c))return;
    const s=worldToScreen(c);mapCtx.font='600 15px "Segoe Print",cursive';mapCtx.fillStyle='#252a26';mapCtx.fillText(f.id,s.x-26,s.y);
  }
}
function drawGnss(){
  if(!state.gnss)return;
  const p=worldToScreen(state.gnss);
  mapCtx.save();mapCtx.fillStyle='#1a73e8';mapCtx.strokeStyle='white';mapCtx.lineWidth=3;
  mapCtx.beginPath();mapCtx.arc(p.x,p.y,7,0,Math.PI*2);mapCtx.fill();mapCtx.stroke();
  if(state.gnss.accuracy){mapCtx.globalAlpha=.15;mapCtx.fillStyle='#1a73e8';mapCtx.beginPath();mapCtx.arc(p.x,p.y,state.gnss.accuracy*state.view.scale,0,Math.PI*2);mapCtx.fill();}
  mapCtx.restore();
}

function reachBoundaryScreenGeometry(course,b){const frag=courseFragments(course)[b.fragmentIndex];if(!frag)return null;const p=worldToScreen(b.point),eps=Math.max(.2,8/state.view.scale),a=worldToScreen(pointAtAlong(frag,Math.max(0,b.along-eps))),z=worldToScreen(pointAtAlong(frag,Math.min(polylineLength(frag),b.along+eps))),dx=z.x-a.x,dy=z.y-a.y,L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L;return{p,nx,ny};}
function drawReachBoundaryMarkers(){mapCtx.save();const used=[];for(const c of hydroCourses()){const active=c.id===state.activeCourseId;for(const b of reachBoundaryRecords(c.id)){const g=reachBoundaryScreenGeometry(c,b);if(!g)continue;const shared=(b.starts.length+b.ends.length)>1;mapCtx.strokeStyle=active?'#8c4d0c':'rgba(140,77,12,.65)';mapCtx.fillStyle=shared?'#f2a53a':'#fff8eb';mapCtx.lineWidth=active?2.2:1.5;const half=active?7:5;mapCtx.beginPath();mapCtx.moveTo(g.p.x-g.nx*half,g.p.y-g.ny*half);mapCtx.lineTo(g.p.x+g.nx*half,g.p.y+g.ny*half);mapCtx.stroke();mapCtx.beginPath();mapCtx.arc(g.p.x,g.p.y,active?3.6:2.8,0,Math.PI*2);mapCtx.fill();mapCtx.stroke();}
    const rs=orderedCourseReaches(c.id);for(let i=0;i<rs.length;i++){const r=rs[i];if(!r.points?.length)continue;const mid=reachLabelPoint(r),m=worldToScreen(mid),label=r.reachCode||r.id;mapCtx.font=`700 ${active?11:10}px system-ui,sans-serif`;const tw=mapCtx.measureText(label).width,side=i%2?1:-1;let x=m.x+6,y=m.y+side*9,box;for(let k=0;k<5;k++){box={x:x-2,y:y-7,w:tw+4,h:14};if(!used.some(q=>box.x<q.x+q.w&&box.x+box.w>q.x&&box.y<q.y+q.h&&box.y+box.h>q.y))break;y+=side*12;}used.push(box);mapCtx.lineWidth=3;mapCtx.strokeStyle='rgba(255,255,255,.92)';mapCtx.strokeText(label,x,y);mapCtx.fillStyle='#7b4612';mapCtx.fillText(label,x,y);}}
  mapCtx.restore();}
function nearestReachBoundary(sp){let best=null;const courses=hydroCourses().slice().sort((a,b)=>(a.id===state.activeCourseId?-1:0)-(b.id===state.activeCourseId?-1:0));for(const c of courses){for(const b of reachBoundaryRecords(c.id)){const q=worldToScreen(b.point),d=Math.hypot(sp.x-q.x,sp.y-q.y);if(d<=14&&(!best||d<best.d))best={...b,courseId:c.id,d};}}return best;}
function drawMapInk(){
  if(!(state.mapInk||[]).length)return;mapCtx.save();mapCtx.lineCap='round';mapCtx.lineJoin='round';for(const st of state.mapInk){if(!st?.points?.length)continue;mapCtx.strokeStyle=st.color||'#d73a49';mapCtx.lineWidth=Math.max(1,+st.width||4);mapCtx.beginPath();const pts=st.points.map(worldToScreen);mapCtx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)mapCtx.lineTo(pts[i].x,pts[i].y);if(pts.length===1)mapCtx.lineTo(pts[0].x+.01,pts[0].y+.01);mapCtx.stroke();}mapCtx.restore();
}
function eraseMapInkAlong(screenPts){if(!(state.mapInk||[]).length)return false;const tol=Math.max(8,(+state.mapInkWidth||4)*2.2),before=state.mapInk.length;state.mapInk=state.mapInk.filter(st=>{const sp=(st.points||[]).map(worldToScreen);for(const a of screenPts||[])for(let i=0;i<sp.length;i++){if(Math.hypot(a.x-sp[i].x,a.y-sp[i].y)<=tol)return false;}return true;});return state.mapInk.length!==before;}
function syncMapInkPanel(){const p=$('#mapInkPanel');if(!p)return;p.classList.toggle('hidden',state.tool!=='mapInk');$('#mapInkWidth').value=String(state.mapInkWidth||4);$('#mapInkColor').value=state.mapInkColor||'#d73a49';$$('[data-map-ink-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mapInkMode===state.mapInkMode));$$('[data-map-ink-color]').forEach(b=>b.classList.toggle('active',String(b.dataset.mapInkColor).toLowerCase()===String(state.mapInkColor).toLowerCase()));}
function mapPinScreenPoint(pin){return pin&&Number.isFinite(+pin.x)&&Number.isFinite(+pin.y)?worldToScreen(pin):null;}
function drawMapPins(){
  const pins=(state.mapPins||[]).filter(p=>campaignLineageIds().has(p.campaignId||state.campaign));if(!pins.length)return;
  mapCtx.save();mapCtx.textAlign='center';mapCtx.textBaseline='middle';
  for(const pin of pins){const s=mapPinScreenPoint(pin);if(!s)continue;const isPhoto=pin.kind==='photo',isNote=pin.kind==='note';
    mapCtx.beginPath();mapCtx.fillStyle=isPhoto?'#2473a7':isNote?'#d5892f':'#6846c7';mapCtx.strokeStyle='#fff';mapCtx.lineWidth=3;mapCtx.arc(s.x,s.y,10,0,Math.PI*2);mapCtx.fill();mapCtx.stroke();
    mapCtx.fillStyle='#fff';mapCtx.font='700 11px system-ui,sans-serif';mapCtx.fillText(isPhoto?'●':isNote?'N':'P',s.x,s.y+.5);
    if(pin.kind==='stop'&&pin.label){mapCtx.font='700 11px system-ui,sans-serif';const linked=(state.historicalPhotoPoints||[]).some(h=>h.linkedStopId===pin.id),txt=String(pin.label)+(linked?' · 🧲':'');const tw=mapCtx.measureText(txt).width;mapCtx.fillStyle='rgba(255,255,255,.92)';mapCtx.fillRect(s.x+14,s.y-10,tw+9,20);mapCtx.fillStyle='#1f2b31';mapCtx.textAlign='left';mapCtx.fillText(txt,s.x+18,s.y+.5);mapCtx.textAlign='center';}
  }mapCtx.restore();
}
function nearestMapPin(sp){let best=null;for(const p of state.mapPins||[]){const s=mapPinScreenPoint(p);if(!s)continue;const d=Math.hypot(sp.x-s.x,sp.y-s.y);if(d<22&&(!best||d<best.d))best={...p,d};}return best;}
function hideMapContextMenu(){const m=$('#mapContextMenu');if(m)m.classList.add('hidden');state.mapContextPoint=null;}
function showMapContextMenu(sp){
  if(!isEditableCampaign()){toast('Día anterior bloqueado · usa Nuevo día para editar');return;}
  state.mapContextPoint=screenToWorld(sp);const m=$('#mapContextMenu');if(!m)return;m.classList.remove('hidden');
  requestAnimationFrame(()=>{const host=$('#mapScreen').getBoundingClientRect(),r=m.getBoundingClientRect(),pad=10,gap=14;let x=sp.x-r.width/2,y=sp.y+gap;if(y+r.height>host.height-pad)y=sp.y-r.height-gap;x=Math.max(pad,Math.min(host.width-r.width-pad,x));y=Math.max(pad,Math.min(host.height-r.height-pad,y));m.style.left=`${x}px`;m.style.top=`${y}px`;});
}
function nextStopLabel(){const n=(state.mapPins||[]).filter(p=>p.kind==='stop').length+1;return`Parada ${String(n).padStart(2,'0')}`;}
function addMapStopAt(point){if(!point||!requireEditable('afegir un punt de parada'))return;const def=nextStopLabel(),label=(prompt('Nom del punt de parada',def)||def).trim()||def;state.mapPins=state.mapPins||[];state.mapPins.push({id:'mp'+Date.now().toString(36),kind:'stop',x:point.x,y:point.y,label,campaignId:state.campaign,createdAt:Date.now()});persistState();drawAll();toast(`${label} afegida`);}
function mapStopById(id){return (state.mapPins||[]).find(p=>p.id===id&&p.kind==='stop')||null;}
function openMapStop(id){const pin=mapStopById(id);if(!pin)return;state.currentStopId=id;const linked=(state.historicalPhotoPoints||[]).filter(p=>p.linkedStopId===id);$('#mapStopTitle').textContent=pin.label||'Punt de parada';$('#mapStopSubtitle').textContent=linked.length?`${linked.length} punt${linked.length===1?'':'s'} històric${linked.length===1?'':'s'} vinculat${linked.length===1?'':'s'}`:'Sense punts històrics vinculats';$('#mapStopModal').classList.remove('hidden');}
function closeMapStop(){state.currentStopId=null;$('#mapStopModal').classList.add('hidden');}
function deleteMapStop(id=state.currentStopId){const pin=mapStopById(id);if(!pin||!requireEditable('eliminar un punt de parada'))return;const linked=(state.historicalPhotoPoints||[]).filter(p=>p.linkedStopId===pin.id);const extra=linked.length?`

${linked.length} punt${linked.length===1?'':'s'} històric${linked.length===1?'':'s'} quedarà${linked.length===1?'':'an'} desvinculat${linked.length===1?'':'s'}, però no s'eliminarà${linked.length===1?'':'an'}.`:'';if(!confirm(`Eliminar ${pin.label||'aquesta parada'}?${extra}`))return;for(const p of linked)delete p.linkedStopId;state.mapPins=(state.mapPins||[]).filter(p=>p.id!==pin.id);closeMapStop();persistState();drawAll();toast('Punt de parada eliminat');}
function addQuickNoteAt(point){if(!point||!requireEditable('afegir una nota ràpida'))return;const text=(prompt('Nota ràpida','')||'').trim();if(!text)return;state.mapPins=state.mapPins||[];state.mapPins.push({id:'mp'+Date.now().toString(36),kind:'note',x:point.x,y:point.y,text,campaignId:state.campaign,createdAt:Date.now()});persistState();drawAll();toast('Nota ràpida guardada');}
function createNotebookPageAt(point){if(!point||!requireEditable('crear una pàgina vinculada'))return;ensureNotebook();commitNotebookPage();const p=makeNotebookPage();p.campaignId=state.editableCampaign;p.links=[{type:'position',x:point.x,y:point.y}];state.notebook.pages.push(p);state.notebook.currentPageId=p.id;persistState();drawAll();openNotebook(p.id);toast('Pàgina nova vinculada al punt del mapa');}
function choosePhotoAt(point){if(!point||!requireEditable('afegir fotografies'))return;state.pendingPhotoFor=null;state.pendingPhotoLocation={x:point.x,y:point.y,crs:workingMapEpsg()};$('#photoInput').click();}
function handleMapContextAction(action){const p=state.mapContextPoint?{...state.mapContextPoint}:null;hideMapContextMenu();if(!p)return;if(action==='photo')choosePhotoAt(p);else if(action==='page')createNotebookPageAt(p);else if(action==='note')addQuickNoteAt(p);else if(action==='stop')addMapStopAt(p);}
function historicalPointById(id){return (state.historicalPhotoPoints||[]).find(p=>p.id===id)||null;}
function historicalPointLabel(point){return point?.name||point?.code||'Punt històric';}
function drawHistoricalPhotoPoints(){
  if(state.showHistoricalPhotoPoints===false)return;const pts=state.historicalPhotoPoints||[];if(!pts.length)return;mapCtx.save();mapCtx.textAlign='center';mapCtx.textBaseline='middle';
  for(const p of pts){const s=worldToScreen(p),n=(p.photos||[]).length;mapCtx.beginPath();mapCtx.fillStyle='#1768c5';mapCtx.strokeStyle='#fff';mapCtx.lineWidth=3;mapCtx.arc(s.x,s.y,13,0,Math.PI*2);mapCtx.fill();mapCtx.stroke();mapCtx.fillStyle='#fff';mapCtx.fillRect(s.x-7,s.y-5,14,10);mapCtx.beginPath();mapCtx.arc(s.x,s.y,3.6,0,Math.PI*2);mapCtx.fillStyle='#1768c5';mapCtx.fill();mapCtx.fillStyle='#fff';mapCtx.fillRect(s.x-4,s.y-8,7,3);if(p.linkedStopId){mapCtx.font='700 10px system-ui,sans-serif';mapCtx.fillStyle='#fff';mapCtx.strokeStyle='#1768c5';mapCtx.lineWidth=3;mapCtx.strokeText('🧲',s.x-15,s.y-15);mapCtx.fillText('🧲',s.x-15,s.y-15);}if(n){mapCtx.beginPath();mapCtx.fillStyle='#1f2b31';mapCtx.strokeStyle='#fff';mapCtx.lineWidth=2;mapCtx.arc(s.x+11,s.y-11,8,0,Math.PI*2);mapCtx.fill();mapCtx.stroke();mapCtx.font='700 9px system-ui,sans-serif';mapCtx.fillStyle='#fff';mapCtx.fillText(String(Math.min(99,n)),s.x+11,s.y-10.5);}}
  mapCtx.restore();
}
function nearestHistoricalPhotoPoint(sp){if(state.showHistoricalPhotoPoints===false)return null;let best=null;for(const p of state.historicalPhotoPoints||[]){const s=worldToScreen(p),d=Math.hypot(sp.x-s.x,sp.y-s.y);if(d<=25&&(!best||d<best.d))best={...p,d};}return best;}
function nextHistoricalPhotoPointName(){return `Punt històric ${String((state.historicalPhotoPoints||[]).length+1).padStart(2,'0')}`;}
function addHistoricalPhotoPointAt(point){if(!point||!requireEditable('crear un punt fotogràfic històric'))return;const def=nextHistoricalPhotoPointName(),name=(prompt('Nom del punt fotogràfic',def)||'').trim();if(!name)return;const p={id:'hp'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),name,x:point.x,y:point.y,crs:workingMapEpsg(),photos:[],createdAt:Date.now(),campaignId:state.campaign};state.historicalPhotoPoints=state.historicalPhotoPoints||[];state.historicalPhotoPoints.push(p);persistState();drawAll();openHistoricalPhotoPoint(p.id);if(shouldReturnToPan())setTimeout(()=>setTool('pan',{quiet:true}),80);}
let historicalPhotoObjectUrls=[];
function clearHistoricalPhotoUrls(){for(const u of historicalPhotoObjectUrls)try{URL.revokeObjectURL(u);}catch{}historicalPhotoObjectUrls=[];}
async function openHistoricalPhotoPoint(id,index=0){const p=historicalPointById(id);if(!p)return;state.currentHistoricalPointId=id;clearHistoricalPhotoUrls();$('#historicalPhotoTitle').textContent=historicalPointLabel(p);const linked=mapStopById(p.linkedStopId);$('#historicalPhotoSubtitle').textContent=`${(p.photos||[]).length} foto${(p.photos||[]).length===1?'':'s'} en aquest punt${linked?' · 🧲 '+(linked.label||'Parada'):''}`;const linkBtn=$('#historicalPhotoLinkStop');if(linkBtn){linkBtn.classList.toggle('active',!!linked);const sp=linkBtn.querySelector('span');if(sp)sp.textContent=linked?'Canviar parada':'Vincular parada';}const records=[];for(const pid of p.photos||[]){const rec=await dbGet('photos',pid);if(rec)records.push(rec);}records.sort((a,b)=>{const ta=a.historicalDate?Date.parse(a.historicalDate+'T00:00:00'):Number(a.date||0),tb=b.historicalDate?Date.parse(b.historicalDate+'T00:00:00'):Number(b.date||0);return ta-tb;});const strip=$('#historicalPhotoStrip');strip.innerHTML='';const main=$('#historicalPhotoMain');const empty=$('#historicalPhotoEmpty');const meta=$('#historicalPhotoMeta');if(!records.length){main.removeAttribute('src');main.classList.add('hidden');empty.classList.remove('hidden');meta.textContent='Encara no hi ha fotografies';}else{index=Math.max(0,Math.min(records.length-1,index));const rec=records[index],url=URL.createObjectURL(rec.blob);historicalPhotoObjectUrls.push(url);main.src=url;main.classList.remove('hidden');empty.classList.add('hidden');const d=rec.historicalDate?displayDate(rec.historicalDate):new Date(rec.date).toLocaleDateString('es-ES');meta.textContent=[d,Number.isFinite(rec.heading)?`Direcció ${Math.round(rec.heading)}°`:'',rec.gnss?.accuracy?`GNSS ±${Math.round(rec.gnss.accuracy)} m`:'' ].filter(Boolean).join(' · ');for(let i=0;i<records.length;i++){const r=records[i],u=URL.createObjectURL(r.blob);historicalPhotoObjectUrls.push(u);const b=document.createElement('button');b.type='button';b.className='historical-photo-thumb'+(i===index?' active':'');const label=r.historicalDate?displayDate(r.historicalDate):new Date(r.date).toLocaleDateString('es-ES');b.innerHTML=`<img src="${u}" alt=""><span>${escapeHtml(label)}</span>`;b.onclick=()=>openHistoricalPhotoPoint(id,i);strip.appendChild(b);}$('#historicalPhotoPrev').disabled=index<=0;$('#historicalPhotoNext').disabled=index>=records.length-1;$('#historicalPhotoPrev').onclick=()=>openHistoricalPhotoPoint(id,index-1);$('#historicalPhotoNext').onclick=()=>openHistoricalPhotoPoint(id,index+1);}
  $('#historicalPhotoModal').classList.remove('hidden');
}
function closeHistoricalPhotoPoint(){clearHistoricalPhotoUrls();state.currentHistoricalPointId=null;$('#historicalPhotoModal').classList.add('hidden');}
function beginHistoricalStopLink(){const p=historicalPointById(state.currentHistoricalPointId);if(!p||!requireEditable('vincular un punt històric amb una parada'))return;state.historicalLinkPointId=p.id;closeHistoricalPhotoPoint();hideMapContextMenu();toast('🧲 Toca la parada que vols vincular · toca fora d’una parada per continuar buscant',4200);drawAll();}
function cancelHistoricalStopLink(){if(!state.historicalLinkPointId)return;state.historicalLinkPointId=null;drawAll();toast('Vinculació cancel·lada');}
function handleHistoricalLinkTap(sp){const point=historicalPointById(state.historicalLinkPointId);if(!point){state.historicalLinkPointId=null;return false;}const pin=nearestMapPin(sp);if(!pin||pin.kind!=='stop'){toast('🧲 Toca directament un punt de parada');return true;}point.linkedStopId=pin.id;point.x=pin.x;point.y=pin.y;point.crs=workingMapEpsg();state.historicalLinkPointId=null;persistState();drawAll();toast(`${historicalPointLabel(point)} vinculat a ${pin.label||'la parada'}`);setTimeout(()=>openHistoricalPhotoPoint(point.id),80);return true;}
async function deleteHistoricalPhotoPoint(id=state.currentHistoricalPointId){const p=historicalPointById(id);if(!p||!requireEditable('eliminar un punt fotogràfic històric'))return;const n=(p.photos||[]).length;if(!confirm(`Eliminar ${historicalPointLabel(p)}${n?` i les seves ${n} foto${n===1?'':'s'}`:''}?`))return;for(const pid of p.photos||[]){try{await dbDelete('photos',pid);}catch{}if(ANDROID_NATIVE)nativeCall('deletePhoto',state.projectId,pid);}state.historicalPhotoPoints=(state.historicalPhotoPoints||[]).filter(x=>x.id!==p.id);if(state.historicalLinkPointId===p.id)state.historicalLinkPointId=null;closeHistoricalPhotoPoint();persistState();drawAll();toast('Punt fotogràfic històric eliminat');}
function chooseHistoricalPhoto(mode){const id=state.currentHistoricalPointId,p=historicalPointById(id);if(!p||!requireEditable('afegir fotografies històriques'))return;state.pendingHistoricalPhotoPointId=id;state.pendingHistoricalPhotoMode=mode;(mode==='camera'?$('#historicalPhotoCameraInput'):$('#historicalPhotoImportInput')).click();}
async function historicalPhotoChosen(file,mode){const pointId=state.pendingHistoricalPhotoPointId,p=historicalPointById(pointId);state.pendingHistoricalPhotoPointId=null;state.pendingHistoricalPhotoMode=null;if(!file||!p)return;let histDate=isoToday();if(mode==='import'){const v=(prompt('Data de la fotografia històrica (AAAA-MM-DD)',isoToday())||'').trim();if(v&&/^\d{4}-\d{2}-\d{2}$/.test(v))histDate=v;else if(v){toast('Data no vàlida; s’ha usat la data d’avui');}}
  const id='p'+Date.now()+Math.random().toString(36).slice(2,5),g=state.gnss,rec={id,blob:file,name:file.name||`foto_${Date.now()}.jpg`,date:Date.now(),historicalDate:histDate,campaignId:state.campaign,featureId:null,historicalPointId:p.id,source:mode==='camera'?'camera':'device',heading:appSettings.photoHeading?(Number.isFinite(state.deviceHeading)?state.deviceHeading:(Number.isFinite(g?.heading)?g.heading:null)):null,gnss:{x:p.x,y:p.y,crs:p.crs||workingMapEpsg(),lat:null,lon:null,accuracy:g?.accuracy??null,altitude:appSettings.gpsAltitude?(g?.altitude??null):null,timestamp:Date.now(),source:'historicalPoint'}};await dbPut('photos',rec);nativeSyncPhotoMeta(rec);p.photos=p.photos||[];p.photos.push(id);persistState();drawAll();await openHistoricalPhotoPoint(p.id,(p.photos||[]).length-1);toast(mode==='camera'?'Foto afegida al punt històric':'Fotografia històrica importada');}
function syncHistoricalPhotoToggle(){const b=$('#historicalPhotoToggle');if(!b)return;const on=state.showHistoricalPhotoPoints!==false;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));const span=b.querySelector('span');if(span)span.textContent=on?'Punts fotogràfics · visibles':'Punts fotogràfics · ocults';}
function drawAll(){
  if(!mapCanvas.width)return;
  clearCtx(mapCtx,mapCanvas);
  if(!state.rasters.length) drawPlaceholder(); else state.rasters.forEach(drawRaster);
  const viewBounds=currentViewBoundsWorld(mapInMotion()?45:90);
  drawReferenceLayers(viewBounds);
  drawVectorExtraction();
  const prev=getPreviousCampaign();
  if(state.comparePrevious&&prev)for(const f of materializeCampaign(prev.id)){if(featureVisibleInBounds(f,viewBounds))drawFeature(f,{ghost:true,opacity:state.compareOpacity});}
  for(const f of state.features){if(featureVisibleInBounds(f,viewBounds))drawFeature(f);}
  drawMapInk();
  if(!mapInMotion())drawReachBoundaryMarkers();
  drawMapPins();
  drawHistoricalPhotoPoints();
  drawNoteMarkers();
  drawGnss();
  drawCurrentStroke();
  drawPendingReachMarker();
  updateScaleBar();
  updateCompass();
  const selected=state.features.find(x=>x.id===state.selectedId);if(selected&&!$('#featureCard').classList.contains('hidden'))positionFeatureCard(selected);
  $('#emptyMapHint').classList.toggle('hidden',state.rasters.length>0);
  if(state.view3d?.active)scheduleTerrain3DTextureRefresh();
}
function drawCurrentStroke(){
  clearCtx(inkCtx,inkCanvas);
  const st=state.currentStroke;if(!st||st.points.length<2)return;
  const isSection=st.tool==='section';
  // Una sección transversal se previsualiza siempre como un único segmento recto
  // entre el punto de apoyo inicial y la posición actual del lápiz.
  const drawPts=isSection?[st.points[0],st.points[st.points.length-1]]:st.points;
  inkCtx.beginPath();inkCtx.moveTo(drawPts[0].x,drawPts[0].y);for(const p of drawPts.slice(1))inkCtx.lineTo(p.x,p.y);
  inkCtx.lineCap='round';inkCtx.lineJoin='round';
  inkCtx.lineWidth=st.tool==='mapInk'?Math.max(1,+state.mapInkWidth||4):st.tool==='mapInkErase'?Math.max(10,(+state.mapInkWidth||4)*2.2):st.tool==='paint'?18:st.tool==='erase'?state.eraseSize:isSection?3:2.5;
  inkCtx.strokeStyle=st.tool==='mapInk'?(state.mapInkColor||'#d73a49'):st.tool==='mapInkErase'?'rgba(255,255,255,.75)':st.tool==='channel'?'#2464a4':st.tool==='paint'?'rgba(190,150,83,.45)':st.tool==='erase'?'rgba(255,255,255,.72)':isSection?'#172d42':'#1f2722';
  if(isSection){inkCtx.setLineDash([9,5]);}
  if(st.tool==='erase'){inkCtx.shadowColor='rgba(30,30,30,.45)';inkCtx.shadowBlur=2;}
  inkCtx.stroke();inkCtx.setLineDash([]);inkCtx.shadowBlur=0;
  if(isSection){
    const a=drawPts[0],b=drawPts[1],wa=screenToWorld(a),wb=screenToWorld(b);
    const len=Math.hypot(wb.x-wa.x,wb.y-wa.y);
    const az=((Math.atan2(wb.x-wa.x,wb.y-wa.y)*180/Math.PI)%360+360)%360;
    // Marcas de inicio/fin para hacer evidente que se está definiendo un segmento.
    for(const q of [a,b]){inkCtx.beginPath();inkCtx.fillStyle='#fff';inkCtx.strokeStyle='#172d42';inkCtx.lineWidth=2.5;inkCtx.arc(q.x,q.y,5.5,0,Math.PI*2);inkCtx.fill();inkCtx.stroke();}
    const label=`${Number.isFinite(len)?formatNum(len,2):'—'} m · ${Number.isFinite(az)?Math.round(az):'—'}°`;
    inkCtx.save();inkCtx.font='600 13px system-ui, sans-serif';inkCtx.textBaseline='middle';
    const padX=8,h=26,w=inkCtx.measureText(label).width+padX*2;
    let x=(a.x+b.x)/2-w/2,y=(a.y+b.y)/2-34;
    x=Math.max(6,Math.min(inkCanvas.clientWidth-w-6,x));y=Math.max(16,Math.min(inkCanvas.clientHeight-h-6,y));
    inkCtx.fillStyle='rgba(255,255,255,.94)';inkCtx.strokeStyle='rgba(23,45,66,.35)';inkCtx.lineWidth=1;
    if(inkCtx.roundRect){inkCtx.beginPath();inkCtx.roundRect(x,y,w,h,7);inkCtx.fill();inkCtx.stroke();}
    else{inkCtx.fillRect(x,y,w,h);inkCtx.strokeRect(x,y,w,h);}
    inkCtx.fillStyle='#172d42';inkCtx.fillText(label,x+padX,y+h/2);inkCtx.restore();
  }
  if(st.tool==='editContour'){
    for(const q of [st.snapStart?.screen,st.snapEnd?.screen].filter(Boolean)){inkCtx.beginPath();inkCtx.fillStyle='#ffb300';inkCtx.strokeStyle='white';inkCtx.lineWidth=2;inkCtx.arc(q.x,q.y,7,0,Math.PI*2);inkCtx.fill();inkCtx.stroke();}
  }
}
function updateScaleBar(){
  if(!state.rasters.some(r=>r.georef)){ $('#scaleBar b').textContent='sin escala';return; }
  const targetPx=120,targetM=targetPx/state.view.scale,p10=Math.pow(10,Math.floor(Math.log10(targetM))),n=targetM/p10,nice=(n<2?1:n<5?2:5)*p10,px=nice*state.view.scale;
  $('#scaleBar span').style.width=`${Math.max(35,px)}px`;
  $('#scaleBar b').textContent=nice>=1000?`${formatNum(nice/1000,2)} km`:`${formatNum(nice,2)} m`;
}

function pointInPoly(p,vs){let inside=false;for(let i=0,j=vs.length-1;i<vs.length;j=i++){const xi=vs[i].x,yi=vs[i].y,xj=vs[j].x,yj=vs[j].y;const inter=((yi>p.y)!==(yj>p.y))&&(p.x<(xj-xi)*(p.y-yi)/(yj-yi+1e-20)+xi);if(inter)inside=!inside}return inside;}
function distanceToPolyline(p,pts){let min=Infinity;for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));min=Math.min(min,Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy)))}return min;}
function pointErased(f,p){return (f.erasures||[]).some(er=>distanceToPolyline(p,er.points)<=((er.widthWorld||0)/2));}
function nearestFeatureToPoint(f,p,tol=0){
  if(!f?.points?.length||!p||pointErased(f,p))return false;
  const t=Math.max(0,Number(tol)||0);
  if(f.closed){
    if(pointInPoly(p,f.points))return true;
    const ring=[...f.points,f.points[0]];
    return ring.length>2&&distanceToPolyline(p,ring)<=t;
  }
  return featurePolylines(f).some(pts=>pts?.length>1&&distanceToPolyline(p,pts)<=t);
}
function erasureHitsFeature(f,er){
  if(!f?.points?.length||!er?.points?.length)return false;
  const rad=(er.widthWorld||0)/2;
  if(f.closed && er.points.some(p=>pointInPoly(p,f.points))) return true;
  if(er.points.some(p=>distanceToPolyline(p,f.points)<=rad)) return true;
  if(f.points.some(p=>distanceToPolyline(p,er.points)<=rad)) return true;
  return false;
}
function nearestFeature(world,closedOnly=false){
  let hit=null;
  for(let i=state.features.length-1;i>=0;i--){
    const f=state.features[i];if(closedOnly&&!f.closed)continue;if(pointErased(f,world))continue;
    const tol=(f.paint?Math.max(12,(f.width||0)*state.view.scale/2):12)/state.view.scale;
    if(f.closed){
      // La conca és un contorn de referència: només es selecciona tocant la línia, mai l'interior.
      if(f.type==='basin'){const ring=[...(f.points||[]),f.points?.[0]].filter(Boolean);if(ring.length>2&&distanceToPolyline(world,ring)<tol){hit=f;break;}}
      else if(pointInPoly(world,f.points)){hit=f;break;}
    }
    if(!f.closed&&featurePolylines(f).some(pts=>distanceToPolyline(world,pts)<tol)){hit=f;break;}
  }
  return hit;
}

function nearestPointOnClosedRing(sp,f){
  if(!f?.closed||f.points.length<3)return null;
  const pts=f.points.map(worldToScreen);let best=null;
  for(let i=0;i<pts.length;i++){
    const a=pts[i],b=pts[(i+1)%pts.length],dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy||1;
    const t=Math.max(0,Math.min(1,((sp.x-a.x)*dx+(sp.y-a.y)*dy)/den));
    const q={x:a.x+t*dx,y:a.y+t*dy},d=Math.hypot(sp.x-q.x,sp.y-q.y);
    if(!best||d<best.d)best={segment:i,t,screen:q,world:screenToWorld(q),d};
  }
  return best;
}
function ringArcLength(pts,startSeg,endSeg,forward=true){
  let len=0,i=forward?(startSeg+1)%pts.length:(startSeg+pts.length)%pts.length,guard=0;
  while(guard++<pts.length+2){const j=forward?(i+1)%pts.length:(i-1+pts.length)%pts.length;len+=Math.hypot(pts[j].x-pts[i].x,pts[j].y-pts[i].y);if(i===endSeg)break;i=j;}return len;
}
function replaceContourSegment(f,startSnap,endSnap,newPts){
  const ring=f.points,n=ring.length;if(n<3)return false;
  // Build two arcs between snap points. The shorter old arc is replaced by the new stroke.
  const forward=[];let i=(startSnap.segment+1)%n,guard=0;forward.push(startSnap.world);
  while(guard++<n+2){forward.push(ring[i]);if(i===endSnap.segment)break;i=(i+1)%n;}forward.push(endSnap.world);
  const backward=[];i=(startSnap.segment+n)%n;guard=0;backward.push(startSnap.world);
  while(guard++<n+2){backward.push(ring[i]);if(((i-1+n)%n)===endSnap.segment)break;i=(i-1+n)%n;}backward.push(endSnap.world);
  const pathLen=a=>a.slice(1).reduce((z,p,k)=>z+Math.hypot(p.x-a[k].x,p.y-a[k].y),0);
  const replaceForward=pathLen(forward)<=pathLen(backward);
  const keep=replaceForward?backward:forward;
  const replacement=[startSnap.world,...newPts.slice(1,-1),endSnap.world];
  let out;
  if(replaceForward){out=[...replacement,...keep.slice(1,-1).reverse()];}
  else{out=[...replacement,...keep.slice(1,-1).reverse()];}
  // remove accidental duplicates
  f.points=out.filter((p,idx,a)=>idx===0||Math.hypot(p.x-a[idx-1].x,p.y-a[idx-1].y)>1e-9);
  f.erasures=(f.erasures||[]).filter(er=>!er.points.some(p=>distanceToPolyline(p,replacement)<=((er.widthWorld||0)/2+10/state.view.scale)));
  return f.points.length>=3;
}

function setTool(tool,{quiet=false}={}){
  if(['mapInk','boundary','editContour','fill','paint','basin','watercourse','reach','channel','section','photo','historicalPhoto','erase'].includes(tool)&&!requireEditable('usar esta herramienta'))return;
  state.tool=tool;
  const labels={mapInk:'Anotar mapa',pan:'Mover',boundary:'Límite',editContour:'Editar contorno',fill:'Rellenar',paint:'Pintar',basin:'Conca',watercourse:'Curs / canal',reach:'Trams',channel:'Canal',section:'Sección',photo:'Foto',historicalPhoto:'Punt fotogràfic',gps:'GPS',select:'Seleccionar',erase:'Borrador'};
  $('#activeToolBtn span').textContent=labels[tool]||tool;
  const ai=$('#activeToolIcon');if(ai)ai.src=ICONS[tool]||ICONS.pan;
  $$('#toolMenu button[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
  $('#toolMenu').classList.add('hidden');
  $('#eraserMenu').classList.toggle('hidden',tool!=='erase');
  inkCanvas.style.cursor=tool==='pan'?'grab':tool==='erase'?'crosshair':tool==='select'||tool==='fill'?'pointer':'crosshair';syncMapInkPanel();
  if(tool==='editContour'){const f=state.features.find(x=>x.id===state.selectedId&&x.closed);if(!f){toast('Selecciona primero un depósito o polígono cerrado');state.tool='select';$('#activeToolBtn span').textContent='Seleccionar';$('#activeToolIcon').src=ICONS.select;return;}state.editContourFeatureId=f.id;toast('Dibuja desde un borde hasta otro. El imán cerrará el nuevo tramo.');}
  if(tool==='photo')choosePhoto();
  if(tool==='gps')locateMe();
  if(tool==='reach'&&!activeCourse()){setTimeout(openHydroPicker,0);}
  state.pendingReachStart=tool==='reach'?state.pendingReachStart:null;state.pendingReachBoundaryMove=tool==='reach'?state.pendingReachBoundaryMove:null;updateHydroFab();
  updateMaterialButton();
  persistState();
  if(!quiet && tool==='pan') toast('Mover mapa');
}
function updateMaterialButton(){
  const m=materialById(state.material);
  $('#materialBtn span').textContent=m.name;
  const a=$('#activeToolBtn');
  if(['fill','paint'].includes(state.tool))a.querySelector('span').textContent=`${state.tool==='fill'?'Rellenar':'Pintar'} · ${m.name}`;
  if(state.tool==='erase')a.querySelector('span').textContent=`Borrar ${state.eraseMode==='zone'?'zona':'elemento'}`;
}
function renderMaterials(){
  const root=$('#materialList');root.innerHTML='';let g='';
  for(const m of materials){
    if(m.group!==g){g=m.group;const grp=document.createElement('div');grp.className='material-group';grp.innerHTML=`<h4>${g}</h4>`;root.appendChild(grp);}
    const row=document.createElement('div');row.className='material-item'+(m.id===state.material?' selected':'');
    row.innerHTML=`<div class="pattern-swatch" data-pattern="${m.id}"></div><span>${m.name}</span><b>${m.id===state.material?'✓':''}</b>`;
    row.onclick=()=>{state.material=m.id;renderMaterials();updateMaterialButton();$('#materialPanel').classList.add('hidden');persistState();toast(m.name);};
    root.lastElementChild.appendChild(row);
  }
}

function beginPan(p,pointerId){state.pointerPan={pointerId,p,center:{...state.view}};inkCanvas.setPointerCapture?.(pointerId);inkCanvas.style.cursor='grabbing';}
function movePan(p){if(!state.pointerPan)return;markMapMotion();const dx=p.x-state.pointerPan.p.x,dy=p.y-state.pointerPan.p.y,d=screenOffsetToWorld(dx,dy,state.pointerPan.center.scale,state.pointerPan.center.rotation||0);state.view.cx=state.pointerPan.center.cx-d.x;state.view.cy=state.pointerPan.center.cy-d.y;drawAll();}
function endPan(){if(state.pointerPan){state.pointerPan=null;inkCanvas.style.cursor=state.tool==='pan'?'grab':'crosshair';persistState();}}

function selectAt(sp){
  if(state.historicalLinkPointId){handleHistoricalLinkTap(sp);return;}
  const hp=nearestHistoricalPhotoPoint(sp);if(hp){openHistoricalPhotoPoint(hp.id);return;}
  const pin=nearestMapPin(sp);if(pin){if(pin.kind==='photo'&&pin.photoId){openPhotoEditor(pin.photoId);return;}if(pin.kind==='note'){alert(pin.text||'Nota ràpida');return;}if(pin.kind==='stop'){openMapStop(pin.id);return;}}
  const note=nearestNoteMarker(sp);if(note){openNotebook(note.pageId);return;}
  const rb=nearestReachBoundary(sp);if(rb){const id=rb.starts?.[0]||rb.ends?.[0],f=state.features.find(x=>x.id===id);if(f){state.selectedId=f.id;state.activeCourseId=f.courseId;updateHydroFab();showFeatureCard(f);drawAll();return;}}
  const f=nearestFeature(screenToWorld(sp),false);if(f){state.selectedId=f.id;if(f.type==='watercourse')state.activeCourseId=f.id;else if(f.type==='reach')state.activeCourseId=f.courseId||state.activeCourseId;updateHydroFab();showFeatureCard(f);}else{state.selectedId=null;hideFeatureCard();}drawAll();
}
function startMapAction(e,p){
  if(state.historicalLinkPointId){handleHistoricalLinkTap(p);return;}
  if(state.vectorExtract){if(beginVectorEndpointDrag(p,e.pointerId))return;handleVectorExtractTap(p);return;}
  if(state.tool==='pan' || e.button===1 || e.button===2){beginPan(p,e.pointerId);return;}
  if(['mapInk','boundary','editContour','fill','paint','basin','watercourse','reach','channel','section','photo','historicalPhoto','erase'].includes(state.tool)&&!isEditableCampaign()){beginPan(p,e.pointerId);toast('Día anterior bloqueado · usa Nuevo día para editar');return;}
  if(state.tool==='fill'||state.tool==='select'){handleTapAction(p);return;}
  if(state.tool==='historicalPhoto'){addHistoricalPhotoPointAt(screenToWorld(p));return;}
  if(state.tool==='reach'){handleReachTap(p);return;}
  if(state.tool==='erase'&&state.eraseMode==='feature'){eraseFeatureAt(p);return;}
  if(state.tool==='photo'||state.tool==='gps')return;
  if(state.tool==='editContour'){
    const f=state.features.find(x=>x.id===state.editContourFeatureId&&x.closed);if(!f){toast('Selecciona un polígono cerrado');return;}
    const snap=nearestPointOnClosedRing(p,f);if(!snap||snap.d>28){toast('Empieza cerca del borde para activar el imán');return;}
    state.currentStroke={tool:'editContour',points:[snap.screen],pressure:[e.pressure||.5],snapStart:snap,snapEnd:null};inkCanvas.setPointerCapture?.(e.pointerId);drawCurrentStroke();return;
  }
  const activeTool=state.tool==='mapInk'?(state.mapInkMode==='eraser'?'mapInkErase':'mapInk'):state.tool;state.currentStroke={tool:activeTool,points:[p],pressure:[e.pressure||.5],pointerId:e.pointerId};
  inkCanvas.setPointerCapture?.(e.pointerId);
}
function beginTouchNavigation(e,p){
  hideMapContextMenu();state.touches.set(e.pointerId,p);state.touchTapCandidates=state.touchTapCandidates||new Map();const candidate={start:{...p},last:{...p},time:Date.now(),multi:false,held:false,holdTimer:null};state.touchTapCandidates.set(e.pointerId,candidate);inkCanvas.setPointerCapture?.(e.pointerId);candidate.holdTimer=setTimeout(()=>{if(candidate.multi||Math.hypot(candidate.last.x-candidate.start.x,candidate.last.y-candidate.start.y)>9||state.touches.size!==1)return;candidate.held=true;state.panStart=null;showMapContextMenu(candidate.start);},620);
  if(state.touches.size===2){
    for(const c of state.touchTapCandidates.values()){c.multi=true;if(c.holdTimer){clearTimeout(c.holdTimer);c.holdTimer=null;}}
    const vals=[...state.touches.values()],mid={x:(vals[0].x+vals[1].x)/2,y:(vals[0].y+vals[1].y)/2};
    state.pinch={dist:Math.hypot(vals[1].x-vals[0].x,vals[1].y-vals[0].y),angle:Math.atan2(vals[1].y-vals[0].y,vals[1].x-vals[0].x),scale:state.view.scale,rotation:state.view.rotation||0,center:{...state.view},mid,world:screenToWorld(mid)};
  } else state.panStart={p,center:{...state.view}};
}
function moveTouchNavigation(e,p){
  if(!state.touches.has(e.pointerId))return;state.touches.set(e.pointerId,p);const c=state.touchTapCandidates?.get(e.pointerId);if(c){c.last={...p};if(Math.hypot(c.last.x-c.start.x,c.last.y-c.start.y)>9&&c.holdTimer){clearTimeout(c.holdTimer);c.holdTimer=null;}if(c.held)return;}
  if(state.touches.size===2&&state.pinch){
    const vals=[...state.touches.values()],dist=Math.hypot(vals[1].x-vals[0].x,vals[1].y-vals[0].y),mid={x:(vals[0].x+vals[1].x)/2,y:(vals[0].y+vals[1].y)/2},ang=Math.atan2(vals[1].y-vals[0].y,vals[1].x-vals[0].x);
    markMapMotion();state.view.scale=Math.max(.002,Math.min(1000,state.pinch.scale*dist/state.pinch.dist));state.view.rotation=normAngle(state.pinch.rotation+(ang-state.pinch.angle));keepWorldAtScreen(state.pinch.world,mid);drawAll();
  } else if(state.panStart){
    markMapMotion();const d=screenOffsetToWorld(p.x-state.panStart.p.x,p.y-state.panStart.p.y,state.panStart.center.scale,state.panStart.center.rotation||0);state.view.cx=state.panStart.center.cx-d.x;state.view.cy=state.panStart.center.cy-d.y;drawAll();
  }
}
function endTouchNavigation(e){
  const c=state.touchTapCandidates?.get(e.pointerId),wasPenMode=appSettings.inputMode==='pen';
  if(c?.holdTimer)clearTimeout(c.holdTimer);state.touches.delete(e.pointerId);state.touchTapCandidates?.delete(e.pointerId);if(state.touches.size<2)state.pinch=null;if(state.touches.size===1){const [rp]=state.touches.values();state.panStart={p:{...rp},center:{...state.view}};}if(state.touches.size===0){state.panStart=null;persistState();}
  if(wasPenMode&&c&&!c.multi&&!c.held&&Date.now()-c.time<420&&Math.hypot(c.last.x-c.start.x,c.last.y-c.start.y)<8)selectAt(c.last);
}
function onMapPointerDown(e){
  if($('#mapScreen').classList.contains('hidden'))return;if(!$('#mapContextMenu')?.classList.contains('hidden'))hideMapContextMenu();
  const p=eventPoint(e,inkCanvas);
  if(e.pointerType==='touch' && appSettings.inputMode==='pen'){beginTouchNavigation(e,p);return;}
  if(e.pointerType==='touch' && appSettings.inputMode==='finger' && state.tool==='pan'){beginTouchNavigation(e,p);return;}
  startMapAction(e,p);
}
function onMapPointerMove(e){
  const p=eventPoint(e,inkCanvas);
  if(e.pointerType==='touch' && (appSettings.inputMode==='pen'||(appSettings.inputMode==='finger'&&state.tool==='pan'))){moveTouchNavigation(e,p);return;}
  if(state.pointerPan && state.pointerPan.pointerId===e.pointerId){movePan(p);return;}
  if(moveVectorEndpointDrag(p,e.pointerId))return;
  if(state.currentStroke){
    if(state.currentStroke.tool==='section'){state.currentStroke.points.length=1;state.currentStroke.points.push(p);}else state.currentStroke.points.push(p);
    if(state.currentStroke.tool==='editContour'){const f=state.features.find(x=>x.id===state.editContourFeatureId);const q=nearestPointOnClosedRing(p,f);state.currentStroke.snapEnd=q&&q.d<=28?q:null;}
    drawCurrentStroke();
  }
}
function onMapPointerUp(e){
  if(e.pointerType==='touch' && (appSettings.inputMode==='pen'||(appSettings.inputMode==='finger'&&state.tool==='pan'))){endTouchNavigation(e);return;}
  if(state.pointerPan && state.pointerPan.pointerId===e.pointerId){endPan();return;}
  if(endVectorEndpointDrag(e.pointerId))return;
  if(!state.currentStroke)return;
  const st=state.currentStroke;state.currentStroke=null;clearCtx(inkCtx,inkCanvas);
  if(st.points.length<2){if(st.tool==='section'){createAutoSectionAtPoint(screenToWorld(st.points[0]));}return;}
  const worldPts=st.points.filter((_,i)=>i%2===0||i===st.points.length-1).map(screenToWorld);
  let returnToPan=false;
  if(st.tool==='mapInk'){state.mapInk=state.mapInk||[];state.mapInk.push({id:uid('map-ink'),color:state.mapInkColor||'#d73a49',width:Math.max(1,+state.mapInkWidth||4),points:worldPts,createdAt:Date.now()});toast('Anotació guardada');
  } else if(st.tool==='mapInkErase'){eraseMapInkAlong(st.points);
  } else if(st.tool==='editContour'){
    const f=state.features.find(x=>x.id===state.editContourFeatureId&&x.closed);const endSnap=st.snapEnd||nearestPointOnClosedRing(st.points[st.points.length-1],f);
    if(!f||!st.snapStart||!endSnap||endSnap.d>28){toast('Termina cerca del borde para cerrar con el imán');drawAll();return;}
    pushHistory();const pts=[st.snapStart.world,...worldPts.slice(1,-1),endSnap.world];replaceContourSegment(f,st.snapStart,endSnap,pts);state.selectedId=f.id;showFeatureCard(f);toast(`${f.id}: contorno actualizado`);returnToPan=shouldReturnToPan();
  } else if(st.tool==='boundary'){
    pushHistory();const f={id:uid('deposit'),type:'deposit',points:worldPts,closed:true,filled:false,material:state.material,campaign:state.campaign,date:today(),ink:[],photos:[],erasures:[]};state.features.push(f);state.selectedId=f.id;showFeatureCard(f);toast('Límite creado. Usa Rellenar para aplicar el material.');returnToPan=shouldReturnToPan();
  } else if(st.tool==='paint'){
    pushHistory();const f={id:uid('deposit'),type:'deposit',points:worldPts,closed:false,paint:true,material:state.material,campaign:state.campaign,date:today(),ink:[],photos:[],erasures:[]};state.features.push(f);toast(`Pintado: ${materialById(state.material).name}`);returnToPan=shouldReturnToPan();
  } else if(st.tool==='basin'){
    if(worldPts.length<3){toast('La conca necessita un contorn tancat');drawAll();return;}const name=(prompt('Nom de la conca','Conca '+(state.project?.torrent||state.project?.name||''))||'').trim();if(!name){drawAll();return;}pushHistory();const f={id:nextHydroId('BAS'),type:'basin',name,points:worldPts,closed:true,filled:false,material:null,campaign:state.campaign,date:today(),ink:[],photos:[],erasures:[]};state.features.push(f);state.selectedId=f.id;persistState();showFeatureCard(f);toast('Conca delimitada');
  } else if(st.tool==='watercourse'){
    if(worldPts.length<2){drawAll();return;}finishWatercourseStroke(worldPts);return;
  } else if(st.tool==='channel'){
    pushHistory();const f={id:uid('channel'),type:'channel',points:worldPts,closed:false,material:null,campaign:state.campaign,date:today(),ink:[],photos:[],erasures:[]};state.features.push(f);state.selectedId=f.id;showFeatureCard(f);toast('Canal guardado');returnToPan=shouldReturnToPan();
  } else if(st.tool==='section'){
    const a=worldPts[0],b=worldPts[worldPts.length-1];if(Math.hypot(b.x-a.x,b.y-a.y)<.25){createAutoSectionAtPoint(a);return;}
    const assoc=sectionAssociationFromLine(a,b),fit=fitSectionLineToBasin(a,b,assoc);pushHistory();createSectionFeature(fit.a,fit.b,assoc);return;
  } else if(st.tool==='erase'&&state.eraseMode==='zone'){
    const pts=worldPts;let changed=false;pushHistory();for(const f of state.features){const hit=pts.some(p=>nearestFeatureToPoint(f,p,state.eraseSize/state.view.scale));if(hit){f.erasures=f.erasures||[];f.erasures.push({points:cloneAny(pts),widthWorld:state.eraseSize/state.view.scale});changed=true;}}if(!changed)state.history.pop();else toast('Zona borrada');
  }
  persistState();drawAll();renderSectionList();if(returnToPan)setTimeout(()=>setTool('pan',{quiet:true}),80);
}

function handleTapAction(sp){
  const w=screenToWorld(sp);
  if(state.tool==='fill'){
    if(!requireEditable('rellenar'))return;
    const f=nearestFeature(w,true);if(!f){toast('Toca dentro de un límite cerrado');return;}
    pushHistory();f.material=state.material;f.filled=true;state.selectedId=f.id;persistState();showFeatureCard(f);drawAll();toast(`Rellenado: ${materialById(state.material).name}`);if(shouldReturnToPan())setTimeout(()=>setTool('pan',{quiet:true}),80);
  } else if(state.tool==='select'){selectAt(sp);
  }
}
function eraseFeatureAt(sp){
  const f=nearestFeature(screenToWorld(sp),false);if(!f){toast('Toca el elemento que quieras eliminar');return;}
  deleteFeature(f.id,true);
}
function deleteFeature(id,ask=true){
  if(!requireEditable('eliminar elementos'))return;
  const f=state.features.find(x=>x.id===id);if(!f)return;
  const related=f.type==='watercourse'?courseReaches(f.id).length:0;
  const label=f.type==='watercourse'?`${f.abbr||f.id} i els seus ${related} trams`:f.reachCode||f.id;
  if(ask && !confirm(`¿Eliminar ${label} completo?`))return;
  pushHistory();
  if(f.type==='watercourse'){state.features=state.features.filter(x=>x.id!==id&&x.courseId!==id);if(state.activeCourseId===id)state.activeCourseId=null;}
  else{state.features=state.features.filter(x=>x.id!==id);if(f.type==='reach'&&f.courseId)renumberCourseReaches(f.courseId);if(f.type==='basin')state.features.filter(x=>x.type==='watercourse'&&x.basinId===id).forEach(x=>x.basinId=null);}
  if(state.selectedId===id)state.selectedId=null;hideFeatureCard();persistState();updateHydroFab();drawAll();renderSectionList();toast(`${label} eliminado`);
}
function eventPoint(e,el){const r=el.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}

function featureCardPresentation(f){
  const material=f.material?materialById(f.material):null;
  const course=f.type==='reach'?state.features.find(x=>x.id===f.courseId&&x.type==='watercourse'):null;
  const map={
    deposit:{type:'Dipòsit',icon:'icons/ficha.png'},
    basin:{type:'Conca',icon:'icons/mapa.png'},
    watercourse:{type:f.kind==='tributary'?'Afluent':f.kind==='secondary'?'Canal secundari':f.kind==='preferential'?'Flux preferent':'Curs d’aigua',icon:'icons/rio.png'},
    reach:{type:'Tram',icon:'icons/etiqueta.png'},
    channel:{type:'Canal',icon:'icons/canal.png'},
    section:{type:'Secció',icon:'icons/seccion.svg'}
  };
  const cfg=map[f.type]||{type:'Element',icon:'icons/ficha.png'};
  let title=f.id||'Element';
  if(f.type==='deposit') title=`${f.id}${material?' · '+material.name:''}`;
  else if(f.type==='basin') title=`Conca · ${f.name||state.project?.torrent||state.project?.name||f.id}`;
  else if(f.type==='watercourse') title=`${f.abbr||f.id} · ${f.name||'Curs d’aigua'}`;
  else if(f.type==='reach') title=`${f.reachCode||f.id} · ${course?.name||'Tram'}`;
  else if(f.type==='channel') title=`${f.id} · Canal`;
  else if(f.type==='section'){const r=sectionReach(f);title=`${f.sectionName||f.sheetIII?.sectionName||f.id} · ${r?.reachCode||'Secció transversal'}`;}
  const area=featureArea(f),len=!f.closed?featureLength(f):null;
  const measureLabel=area!==null?'Superfície':'Longitud';
  const measureValue=area!==null?`${f.erasures?.length?'≈ ':''}${formatAreaUnit(area)}`:Number.isFinite(len)?formatLengthUnit(len):'—';
  return{...cfg,title,measureLabel,measureValue,course};
}
function featureCardDateText(v){
  if(!v)return'—';
  const d=new Date(v);
  if(!Number.isNaN(d.getTime())&&String(v).includes('T'))return d.toLocaleString('es-ES',{dateStyle:'short',timeStyle:'short'});
  return String(v);
}
async function showFeatureCard(f){
  if(!f)return;
  const card=$('#featureCard'),view=featureCardPresentation(f),wasHidden=card.classList.contains('hidden'),changed=card.dataset.featureId!==f.id;
  if(wasHidden||changed)card.dataset.manualPosition='0';
  card.dataset.featureId=f.id;
  card.className=`feature-card feature-card-rich feature-card-universal feature-type-${f.type}`;
  card.classList.add('hidden');
  $('#featureCardTitle').textContent=view.title;
  $('#featureCardType').textContent=view.type;
  $('#featureArea').textContent=view.measureValue;
  $('#featureMeasureLabel').textContent=view.measureLabel;
  $('#featureCampaign').textContent=campaignLabel(state.campaign);
  const isSection=f.type==='section',isProfile=['watercourse','reach'].includes(f.type);
  $('#openPrimaryIcon').src=view.icon;
  $('#openSheetBtn').querySelector('span').textContent='Abrir';
  $('#openSheetBtn').title=f.type==='reach'?'Obrir la FITXA II del tram':isProfile?'Obrir la FITXA I associada':isSection?'Obrir la FITXA III de la secció':'Obrir la fitxa de l’element';

  const ro=!isEditableCampaign();
  $('#featurePhotoBtn').disabled=false;
  $('#deleteFeatureBtn').disabled=ro;
  $('#editContourBtn').disabled=ro||(!(f.closed&&f.type!=='basin')&&f.type!=='reach');$('#editContourBtn span').textContent=f.type==='reach'?'Editar tram':'Editar';
  $('#featureMoreBtn').disabled=false;
  $('#featureMoreBtn').setAttribute('aria-expanded','false');
  const noteCount=(state.notebook?.pages||[]).filter(p=>(p.links||[]).some(l=>l.type==='feature'&&l.featureId===f.id)).length;
  $('#notesBtn span').textContent=noteCount?`Nota (${noteCount})`:'Nota';
  $('#featurePhotoBtn span').textContent=(f.photos||[]).length?`Fotos (${f.photos.length})`:'Fotos';
  card.classList.toggle('read-only',ro);
  $('#featureMoreMenu').classList.add('hidden');

  const preview=$('#featurePreviewWrap'),img=$('#featurePreviewImg'),photoCount=$('#featurePhotoCount');
  const dateTile=$('#featureDateTile'),headTile=$('#featureHeadingTile'),gnssTile=$('#featureGnssTile');
  const dateEl=$('#featureCardDate'),headEl=$('#featureCardHeading'),gnssEl=$('#featureCardGnss');
  preview.classList.add('hidden');photoCount.classList.add('hidden');headTile.classList.add('hidden');gnssTile.classList.add('hidden');
  card.classList.add('no-photo');
  dateTile.classList.remove('hidden');
  dateEl.textContent=featureCardDateText(currentCampaign()?.date||f.date);
  if(card._photoUrl){URL.revokeObjectURL(card._photoUrl);card._photoUrl=null;}
  const token=Date.now()+Math.random();card._renderToken=token;
  const photoIds=f.photos||[],photoId=photoIds.at(-1);
  if(photoId){
    try{
      const rec=await dbGet('photos',photoId);
      if(rec&&card._renderToken===token&&card.dataset.featureId===f.id){
        if(rec.blob){const url=URL.createObjectURL(rec.blob);card._photoUrl=url;img.src=url;preview.classList.remove('hidden');card.classList.remove('no-photo');}
        dateEl.textContent=featureCardDateText(rec.date||currentCampaign()?.date||f.date);
        if(Number.isFinite(rec.heading)){headEl.textContent=`${Math.round(rec.heading)}°`;headTile.classList.remove('hidden');}
        if(Number.isFinite(rec.gnss?.accuracy)){gnssEl.textContent=`±${formatNum(rec.gnss.accuracy,1)} m`;gnssTile.classList.remove('hidden');}
        if(photoIds.length){photoCount.textContent=`${photoIds.length} foto${photoIds.length===1?'':'s'}`;photoCount.classList.remove('hidden');}
      }
    }catch(e){console.warn('Preview foto',e);}
  }
  card.classList.remove('hidden');
  positionFeatureCard(f);
}
function positionFeatureCard(f){
  const card=$('#featureCard');if(!f?.points?.length||card.classList.contains('hidden')||card.dataset.manualPosition==='1')return;
  const wp=f.closed?polygonCentroid(f.points):f.points[Math.floor(f.points.length/2)],sp=worldToScreen(wp),vw=inkCanvas.clientWidth||innerWidth,vh=inkCanvas.clientHeight||innerHeight;
  requestAnimationFrame(()=>{const r=card.getBoundingClientRect(),cw=r.width||450,ch=r.height||360,margin=14;let x=sp.x+28,y=sp.y-ch*.45;if(x+cw>vw-margin)x=sp.x-cw-28;if(x<margin)x=margin;y=Math.max(70,Math.min(vh-ch-72,y));card.style.left=`${x}px`;card.style.top=`${y}px`;});
}
function hideFeatureCard(){const card=$('#featureCard');card.classList.add('hidden');$('#featureMoreMenu')?.classList.add('hidden');if(card._photoUrl){URL.revokeObjectURL(card._photoUrl);card._photoUrl=null;}}
function installFeatureCardDrag(){
  const card=$('#featureCard'),bar=$('#featureCardDragBar');if(!card||!bar||bar._dragInstalled)return;bar._dragInstalled=true;let drag=null;
  bar.addEventListener('pointerdown',e=>{if(e.button!=null&&e.button!==0)return;e.preventDefault();e.stopPropagation();const r=card.getBoundingClientRect(),pr=(card.offsetParent||document.body).getBoundingClientRect();drag={id:e.pointerId,dx:e.clientX-r.left,dy:e.clientY-r.top,parent:pr};bar.setPointerCapture?.(e.pointerId);card.dataset.manualPosition='1';card.classList.add('is-dragging');});
  bar.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();const pr=(card.offsetParent||document.body).getBoundingClientRect(),r=card.getBoundingClientRect(),m=8;let left=e.clientX-pr.left-drag.dx,top=e.clientY-pr.top-drag.dy;left=Math.max(m,Math.min(pr.width-r.width-m,left));top=Math.max(m,Math.min(pr.height-r.height-m,top));card.style.left=`${left}px`;card.style.top=`${top}px`;card.style.bottom='auto';card.style.transform='none';});
  const end=e=>{if(!drag||(e&&drag.id!==e.pointerId))return;if(e){e.preventDefault();e.stopPropagation();}drag=null;card.classList.remove('is-dragging');};bar.addEventListener('pointerup',end);bar.addEventListener('pointercancel',end);
}

function openSelectedPrimary(){
  const f=state.features.find(x=>x.id===state.selectedId);if(!f)return;
  if(f.type==='section')openSection(f); else if(f.type==='watercourse')openProfileSheet(f.id); else if(f.type==='reach')openReachSheet(f.id); else openSheet(f);
}
function openSheet(f){
  if(!f)return;
  const readOnly=!isEditableCampaign();
  $('#sheetId').textContent=f.id;$('#sheetMaterial').textContent=f.material?materialById(f.material).name.toUpperCase():f.type.toUpperCase();$('#sheetDate').textContent=currentCampaign()?.date||f.date;$('#sheetCamp').textContent=campaignLabel(state.campaign);
  const a=featureArea(f);$('#sheetArea').textContent=a!==null?`${f.erasures?.length?'≈ ':''}${formatAreaUnit(a)}`:'—';
  state.sheetFeature=f.id;$('#sheetModal').classList.remove('hidden');$('#sheetModal').classList.toggle('read-only',readOnly);
  const banner=$('#sheetReadOnlyBanner');if(banner)banner.classList.toggle('hidden',!readOnly);
  $$('#sheetModal [data-sheet-tool], #sheetUndo').forEach(b=>b.disabled=readOnly);renderSheetPhotos(f);
  setTimeout(()=>{const c=$('#sheetCanvas');resizeDrawCanvas(c);c._readOnly=readOnly;c._inkStore=cloneAny(f.ink||[]);redrawInkStore(c);},10);
}
function closeSheet(){const c=$('#sheetCanvas'),f=state.features.find(x=>x.id===state.sheetFeature);if(f&&!c._readOnly){f.ink=cloneAny(c._inkStore||[]);persistState();}$('#sheetModal').classList.add('hidden');}
function renderSheetPhotos(f){const root=$('#sheetPhotos');root.innerHTML='';(f.photos||[]).slice(0,3).forEach(async pid=>{const rec=await dbGet('photos',pid);if(rec){const img=new Image();img.src=URL.createObjectURL(rec.blob);root.appendChild(img);}});}

function invertAffinePoint(a,p){
  const det=a.A*a.E-a.B*a.D;if(Math.abs(det)<1e-20)return null;
  const x=p.x-a.C,y=p.y-a.F;
  return{x:(a.E*x-a.B*y)/det,y:(-a.D*x+a.A*y)/det};
}
function sourceResolution(r){const a=r?.meta?.sourceAffine||r?.affine;if(!a)return null;return Math.min(Math.hypot(a.A,a.D),Math.hypot(a.B,a.E));}
function pointInBounds(p,b){return p.x>=b.minX&&p.x<=b.maxX&&p.y>=b.minY&&p.y<=b.maxY;}
function chooseDemRasterForSection(f){
  if(!f?.points?.length)return null;const a=f.points[0],b=f.points[f.points.length-1],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  const candidates=demGroupRasters().filter(r=>r.sourceBlob&&r.meta?.validPercent!==0).sort((r1,r2)=>(sourceResolution(r1)||Infinity)-(sourceResolution(r2)||Infinity));
  return candidates.find(r=>{const bb=rasterBounds(r);return pointInBounds(mid,bb)||pointInBounds(a,bb)||pointInBounds(b,bb);})||candidates[0]||null;
}
function linePoint(a,b,t){return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}

function projectPointToSegment(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l2)),q={x:a.x+dx*t,y:a.y+dy*t};return{t,point:q,dist:Math.hypot(p.x-q.x,p.y-q.y)};}
function segmentIntersectionT(a,b,c,d){
  const rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y,den=rx*sy-ry*sx;if(Math.abs(den)<1e-12)return null;
  const qx=c.x-a.x,qy=c.y-a.y,t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
  return t>=-1e-9&&t<=1+1e-9&&u>=-1e-9&&u<=1+1e-9?Math.max(0,Math.min(1,t)):null;
}
function sectionReferences(f){
  if(!f?.points?.length)return[];const a=f.points[0],b=f.points[f.points.length-1],refs=[];
  for(const g of state.features){
    if(g.id===f.id||!g.points?.length)continue;
    if(g.type==='basin'&&g.closed&&g.points.length>=3){
      const st=featureLineStyle(g,{color:'#416d55',width:2.2,dash:'dash'});for(let i=0;i<g.points.length;i++){const t=segmentIntersectionT(a,b,g.points[i],g.points[(i+1)%g.points.length]);if(t!=null)refs.push({type:'mapref',source:'basin',id:g.id,label:g.name||g.id,t,color:st.color});}
      continue;
    }
    if(g.closed&&g.points.length>=3){
      const ts=[0,1];for(let i=0;i<g.points.length;i++){const t=segmentIntersectionT(a,b,g.points[i],g.points[(i+1)%g.points.length]);if(t!=null)ts.push(t);}
      ts.sort((x,y)=>x-y);const uniq=ts.filter((t,i)=>!i||Math.abs(t-ts[i-1])>1e-5);
      for(let i=0;i<uniq.length-1;i++){const t0=uniq[i],t1=uniq[i+1];if(t1-t0<1e-5)continue;const tm=(t0+t1)/2,q=linePoint(a,b,tm);if(pointInPoly(q,g.points)&&!pointErased(g,q)){const mat=g.material?materialById(g.material):null;refs.push({type:'area',id:g.id,material:g.material||null,label:mat?.name||g.id,t0,t1});}}
    }
  }
  for(const g of state.features){
    if(!['watercourse','channel'].includes(g.type)||!g.points?.length)continue;const def=g.type==='watercourse'?{color:'#2e78ad',width:3.2,dash:'solid'}:{color:'#2464a4',width:3,dash:'dash'},st=featureLineStyle(g,def),paths=g.type==='watercourse'?courseFragments(g):[g.points];
    for(const path of paths)for(let i=1;i<path.length;i++){const t=segmentIntersectionT(a,b,path[i-1],path[i]);if(t!=null)refs.push({type:'mapref',source:'hydro',id:g.id,label:g.name||g.courseName||g.id,t,color:st.color});}
  }
  for(const layer of state.referenceLayers||[]){
    if(!layer.visible||!(layer.features||[]).length)continue;const st=vectorStyleDefault(layer),color=st.kind==='point'?(st.pointColor||layer.color):(st.strokeColor||layer.color)||'#6b5d82',label=layer.name||layer.sourceName||'SHP';
    for(const vf of layer.features||[])for(const path of vf.paths||[]){for(let i=1;i<path.length;i++){const t=segmentIntersectionT(a,b,path[i-1],path[i]);if(t!=null)refs.push({type:'mapref',source:'shp',id:layer.id,label,t,color});}if(st.kind==='point')for(const q of path){const prj=projectPointToSegment(q,a,b);const tol=Math.max(.25,(f.sectionProfile?.resolution||1)*1.5);if(prj&&prj.dist<=tol)refs.push({type:'mapref',source:'shp',id:layer.id,label,t:prj.t,color});}}
  }
  return refs;
}
async function ensureSectionReferenceLayersLoaded(){const jobs=[];for(const layer of state.referenceLayers||[]){if(layer.visible&&!(layer.features||[]).length)jobs.push(ensureReferenceLayerFeatures(layer));}if(jobs.length)await Promise.allSettled(jobs);}
async function ensureSectionProfile(f,{force=false,preserveManual=true}={}){
  if(!f||f.type!=='section'||f.points.length<2)return;
  const raster=chooseDemRasterForSection(f),status=$('#sectionDemStatus'),metaEl=$('#sectionDemMeta'),grp=activeDemGroup();
  if(!raster){if(status)status.textContent='Sin MDT/LiDAR disponible';if(metaEl)metaEl.textContent='Importa un GeoTIFF de elevación para generar el perfil automáticamente.';redrawInkStore($('#sectionCanvas'));return;}
  const sourceKey=grp?`group:${grp.id}`:raster.id,same=f.sectionProfile?.sourceRasterId===sourceKey;
  if(f.sectionProfile?.samples?.length&&!force&&same){updateSectionProfileStatus(f,raster);redrawInkStore($('#sectionCanvas'));return;}
  if(status)status.textContent='Calculando perfil topográfico…';if(metaEl)metaEl.textContent=grp?grp.name:raster.name;
  try{
    const a=f.points[0],b=f.points[f.points.length-1],len=Math.hypot(b.x-a.x,b.y-a.y),res=Math.max(.001,demGroupResolution(grp)||sourceResolution(raster)||len/200),step=Math.max(res,len/700),n=Math.max(2,Math.min(800,Math.ceil(len/step)+1)),world=[];
    for(let i=0;i<n;i++){const t=i/(n-1);world.push(linePoint(a,b,t));}
    const sampled=await sampleDemMosaic(world),vals=sampled.values;
    const samples=vals.map((z,i)=>({d:len*(i/(n-1)),z:Number.isFinite(z)?z:null,x:world[i].x,y:world[i].y}));
    const valid=samples.filter(x=>Number.isFinite(x.z));if(valid.length<2)throw Error('La línea de sección no atraviesa datos de elevación válidos');
    const oldManual=preserveManual?f.sectionProfile?.manual:null,oldEdits=preserveManual?cloneAny(f.sectionProfile?.manualEdits||[]):[];
    f.sectionProfile={sourceRasterId:sourceKey,sourceName:sampled.sourceName||raster.name,resolution:Number.isFinite(sampled.resolution)?sampled.resolution:res,length:len,samples,manual:oldManual||null,manualEdits:oldEdits,generatedAt:Date.now()};
    if(isEditableCampaign())persistState();updateSectionProfileStatus(f,raster);redrawInkStore($('#sectionCanvas'));
  }catch(e){console.warn(e);if(status)status.textContent='No se pudo generar el perfil';if(metaEl)metaEl.textContent=e.message||String(e);redrawInkStore($('#sectionCanvas'));}
}
function updateSectionProfileStatus(f,raster=null){
  const p=f?.sectionProfile,status=$('#sectionDemStatus'),metaEl=$('#sectionDemMeta');raster=raster||state.rasters.find(r=>r.id===p?.sourceRasterId);
  if(!p?.samples?.length){if(status)status.textContent='Perfil topográfico';if(metaEl)metaEl.textContent='Sin perfil calculado';return;}
  const valid=p.samples.filter(s=>Number.isFinite(s.z)),zs=valid.map(s=>s.z);if(status)status.textContent=`MDT/LiDAR · ${p.sourceName||raster?.name||'elevación'}`;
  if(metaEl)metaEl.textContent=`${formatNum(p.length||featureLength(f),1)} m · ${formatNum(p.resolution||0,2)} m/píxel · ${formatNum(Math.min(...zs),1)}–${formatNum(Math.max(...zs),1)} m`;
}
function sectionView(f){f.sectionView=f.sectionView||{gridStep:1,verticalScale:'1',zoomX:1,centerD:null};if(f.sectionView.gridStep==null)f.sectionView.gridStep=1;if(!f.sectionView.verticalScale||f.sectionView.verticalScale==='auto')f.sectionView.verticalScale='1';if(!Number.isFinite(+f.sectionView.zoomX))f.sectionView.zoomX=1;f.sectionView.zoomX=Math.max(1,Math.min(20,+f.sectionView.zoomX||1));return f.sectionView;}
function sectionGridStep(f){const v=Number(sectionView(f).gridStep);return Number.isFinite(v)&&v>0?v:0;}
function sectionVisibleWindow(f){const len=f?.sectionProfile?.length||featureLength(f)||1,v=sectionView(f),zoom=Math.max(1,Math.min(20,+v.zoomX||1)),span=Math.max(.05,len/zoom);let center=Number.isFinite(+v.centerD)?+v.centerD:len/2;center=Math.max(span/2,Math.min(len-span/2,center));v.centerD=center;return{len,zoom,span,start:Math.max(0,center-span/2),end:Math.min(len,center+span/2),center};}
function updateSectionZoomUi(f){if(!f)return;const w=sectionVisibleWindow(f),el=$('#sectionZoomBadge');if(el)el.textContent=`Vista: ${formatNum(w.span,w.span<20?1:0)} m · ×${formatNum(w.zoom,w.zoom<10?1:0)}`;}
function sectionPlotRect(c){const r=c.getBoundingClientRect();return{left:66,top:42,right:Math.max(110,r.width-28),bottom:Math.max(110,r.height-44),width:Math.max(10,r.width-94),height:Math.max(10,r.height-86)};}
function sectionRawRange(f){
  const p=f?.sectionProfile,vals=[],vw=sectionVisibleWindow(f),inside=s=>Number.isFinite(s.z)&&(!Number.isFinite(s.d)||(s.d>=vw.start-.001&&s.d<=vw.end+.001));(p?.samples||[]).forEach(s=>inside(s)&&vals.push(s.z));(p?.manual||[]).forEach(s=>inside(s)&&vals.push(s.z));if(vals.length<2){(p?.samples||[]).forEach(s=>Number.isFinite(s.z)&&vals.push(s.z));(p?.manual||[]).forEach(s=>Number.isFinite(s.z)&&vals.push(s.z));}if(vals.length<2)return null;
  let lo=Math.min(...vals),hi=Math.max(...vals);if(hi-lo<.05){lo-=.5;hi+=.5;}return{lo,hi,mid:(lo+hi)/2,span:Math.max(.01,hi-lo)};
}
function sectionDisplayRange(f,c){
  const raw=sectionRawRange(f);if(!raw)return null;const view=sectionView(f),step=sectionGridStep(f),pr=sectionPlotRect(c),len=sectionVisibleWindow(f).span;
  const pad=Math.max(step||.25,raw.span*.12);let lo=raw.lo-pad,hi=raw.hi+pad;
  if(view.verticalScale!=='auto'){
    const ex=Math.max(.1,Number(view.verticalScale)||1),sx=pr.width/Math.max(.001,len),sy=sx*ex,span=Math.max(raw.span+2*pad,pr.height/Math.max(.001,sy));lo=raw.mid-span/2;hi=raw.mid+span/2;
  }
  if(step>0){lo=Math.floor(lo/step)*step;hi=Math.ceil(hi/step)*step;if(hi<=lo)hi=lo+step;}
  return{lo,hi,span:hi-lo};
}
function updateSectionCanvasMetricSize(f){
  const c=$('#sectionCanvas'),area=$('#sectionDrawingArea');if(!c||!area||!f)return;
  // Mantén estable el lienzo: la escala cambia la transformación métrica, no el tamaño
  // del canvas. Así árboles, polígonos, medidas y tinta no se deforman al cambiar ×1/×2/×5.
  const desired=Math.max(300,Math.min(470,window.innerHeight*.46));
  c.style.height=`${Math.round(desired)}px`;c.style.width='100%';resizeDrawCanvas(c);
}
function sectionXYFromData(f,c,d,z){const p=f.sectionProfile,pr=sectionPlotRect(c),rg=sectionDisplayRange(f,c),vw=sectionVisibleWindow(f);if(!p||!rg||d<vw.start-.001||d>vw.end+.001)return null;return{x:pr.left+((d-vw.start)/Math.max(.001,vw.span))*pr.width,y:pr.bottom-((z-rg.lo)/(rg.hi-rg.lo))*pr.height};}
function sectionDataFromNorm(f,c,np){const p=f?.sectionProfile,rg=sectionDisplayRange(f,c),pr=sectionPlotRect(c),r=c.getBoundingClientRect(),vw=sectionVisibleWindow(f);if(!p||!rg)return null;const x=np.x*r.width,y=np.y*r.height;if(x<pr.left-10||x>pr.right+10||y<pr.top-20||y>pr.bottom+20)return null;const tx=Math.max(0,Math.min(1,(x-pr.left)/pr.width)),ty=Math.max(0,Math.min(1,(pr.bottom-y)/pr.height));return{d:vw.start+tx*vw.span,z:rg.lo+ty*(rg.hi-rg.lo)};}
function remapSectionNormPointForRange(np,c,oldRg,newRg){
  if(!np||!oldRg||!newRg)return np;const r=c.getBoundingClientRect(),pr=sectionPlotRect(c),y=np.y*r.height;
  // Fuera del área métrica dejamos la anotación intacta.
  if(y<pr.top-30||y>pr.bottom+30)return np;
  const z=oldRg.lo+((pr.bottom-y)/Math.max(1,pr.height))*(oldRg.hi-oldRg.lo);
  const ny=(pr.bottom-((z-newRg.lo)/(newRg.hi-newRg.lo||1))*pr.height)/Math.max(1,r.height);
  return{x:np.x,y:ny};
}
function remapSectionDrawingForRange(f,c,oldRg,newRg){
  if(!f||!c||!oldRg||!newRg)return;const mapPt=p=>remapSectionNormPointForRange(p,c,oldRg,newRg);
  const mapRec=rec=>{if(Array.isArray(rec?.pts))rec.pts=rec.pts.map(mapPt);};
  (f.sectionInk||[]).forEach(mapRec);
  for(const o of f.sectionObjects||[]){if(o.a)o.a=mapPt(o.a);if(o.b)o.b=mapPt(o.b);if(Array.isArray(o.pts))o.pts=o.pts.map(mapPt);}
  c._inkStore=cloneAny(f.sectionInk||[]);c._sectionSelection=null;
}
function remapSectionDrawingForWindow(f,c,oldVw,newVw){
  if(!f||!c||!oldVw||!newVw||Math.abs(oldVw.start-newVw.start)<1e-9&&Math.abs(oldVw.span-newVw.span)<1e-9)return;const r=c.getBoundingClientRect(),pr=sectionPlotRect(c);
  const mapPt=p=>{if(!p)return p;const x=p.x*r.width;if(x<pr.left-30||x>pr.right+30)return p;const d=oldVw.start+((x-pr.left)/Math.max(1,pr.width))*oldVw.span,nx=(pr.left+((d-newVw.start)/Math.max(.001,newVw.span))*pr.width)/Math.max(1,r.width);return{x:nx,y:p.y};};
  const mapRec=rec=>{if(Array.isArray(rec?.pts))rec.pts=rec.pts.map(mapPt);};(f.sectionInk||[]).forEach(mapRec);for(const o of f.sectionObjects||[]){if(o.a)o.a=mapPt(o.a);if(o.b)o.b=mapPt(o.b);if(Array.isArray(o.pts))o.pts=o.pts.map(mapPt);}c._inkStore=cloneAny(f.sectionInk||[]);c._sectionSelection=null;
}
function profileStrokeToData(f,c,pts){const out=[];for(const np of pts||[]){const q=sectionDataFromNorm(f,c,np);if(q)out.push(q);}out.sort((a,b)=>a.d-b.d);const clean=[];for(const q of out){if(!clean.length||Math.abs(q.d-clean[clean.length-1].d)>.01)clean.push(q);else clean[clean.length-1]=q;}return clean;}
function ensureProfileManualEdits(profile){
  if(!profile)return[];
  if(!Array.isArray(profile.manualEdits)){
    profile.manualEdits=[];
    if(Array.isArray(profile.manual)&&profile.manual.length>1)profile.manualEdits.push({id:uid('profile-edit'),pts:cloneAny(profile.manual),legacy:true});
  }
  return profile.manualEdits;
}
function mergeProfileSeries(base,segment){
  const seg=(segment||[]).filter(q=>Number.isFinite(q.d)&&Number.isFinite(q.z)).sort((a,b)=>a.d-b.d);if(seg.length<2)return base||[];
  const lo=seg[0].d,hi=seg.at(-1).d;return[...(base||[]).filter(q=>Number.isFinite(q.d)&&Number.isFinite(q.z)&&(q.d<lo||q.d>hi)),...seg].sort((a,b)=>a.d-b.d);
}
function rebuildProfileManual(profile){
  if(!profile)return;const edits=ensureProfileManualEdits(profile);if(!edits.length){profile.manual=null;return;}
  let base=(profile.samples||[]).filter(q=>Number.isFinite(q.d)&&Number.isFinite(q.z)).map(q=>({d:q.d,z:q.z}));
  for(const e of edits)base=mergeProfileSeries(base,e.pts);profile.manual=base;
}
function commitProfileManualEdit(profile,segment,{replaceId=null}={}){
  if(!profile)return null;const seg=(segment||[]).filter(q=>Number.isFinite(q.d)&&Number.isFinite(q.z)).sort((a,b)=>a.d-b.d);if(seg.length<2)return null;
  const edits=ensureProfileManualEdits(profile);if(replaceId){const i=edits.findIndex(e=>e.id===replaceId);if(i>=0)edits.splice(i,1);}
  const rec={id:uid('profile-edit'),pts:cloneAny(seg),createdAt:Date.now()};edits.push(rec);rebuildProfileManual(profile);return rec;
}
function deleteProfileManualEdit(profile,id){const edits=ensureProfileManualEdits(profile),i=edits.findIndex(e=>e.id===id);if(i<0)return false;edits.splice(i,1);rebuildProfileManual(profile);return true;}
function mergeManualProfile(f,segment,replaceId=null){if(!f?.sectionProfile||!segment?.length)return null;return commitProfileManualEdit(f.sectionProfile,segment,{replaceId});}
function materialReferenceStyle(id){const map={fine:'#d8c9a8',coarse:'#c9ad7d',gravel:'#9f9a8d',pebbles:'#888579',blocks:'#696d68',mixed:'#b09b78',alluvium:'#b9c9b1',colluvium:'#c6b89c',conglomerate:'#9f8c70',weak:'#b8aa91',breccia:'#8d7d70',clast:'#8d806c',matrix:'#a29077'};return map[id]||'#b4aa94';}
function drawMetricSectionGrid(ctx,f,c,pr,rg){
  const p=f.sectionProfile,vw=sectionVisibleWindow(f),len=vw.len,step=sectionGridStep(f);ctx.save();ctx.font='10px sans-serif';ctx.fillStyle='#6c6961';
  if(step>0){
    const pxX=pr.width/Math.max(.001,vw.span)*step,skipX=Math.max(1,Math.ceil(42/Math.max(1,pxX)));let ix=0,d0=Math.ceil(vw.start/step)*step;
    for(let d=d0;d<=vw.end+step*.001;d+=step,ix++){const x=pr.left+((d-vw.start)/vw.span)*pr.width;ctx.strokeStyle=Math.round(d/step)%5===0?'rgba(105,105,100,.28)':'rgba(120,118,110,.14)';ctx.lineWidth=Math.round(d/step)%5===0?1.1:.7;ctx.beginPath();ctx.moveTo(x,pr.top);ctx.lineTo(x,pr.bottom);ctx.stroke();if(ix%skipX===0||d+step>vw.end){ctx.textAlign='center';ctx.fillText(`${formatNum(Math.min(d,len),step<1?1:0)} m`,x,pr.bottom+17);}}
    const y0=Math.ceil(rg.lo/step)*step,pxY=pr.height/(rg.hi-rg.lo)*step,skipY=Math.max(1,Math.ceil(26/Math.max(1,pxY)));let iy=0;
    for(let z=y0;z<=rg.hi+step*.001;z+=step,iy++){const y=pr.bottom-((z-rg.lo)/(rg.hi-rg.lo))*pr.height;ctx.strokeStyle=iy%5===0?'rgba(105,105,100,.28)':'rgba(120,118,110,.14)';ctx.lineWidth=iy%5===0?1.1:.7;ctx.beginPath();ctx.moveTo(pr.left,y);ctx.lineTo(pr.right,y);ctx.stroke();if(iy%skipY===0){ctx.textAlign='right';ctx.fillText(`${formatNum(z,step<1?1:0)} m`,pr.left-7,y+3);}}
  }else{
    ctx.textAlign='right';for(let i=0;i<=4;i++){const z=rg.lo+(rg.hi-rg.lo)*i/4,y=pr.bottom-pr.height*i/4;ctx.strokeStyle='rgba(120,115,105,.13)';ctx.beginPath();ctx.moveTo(pr.left,y);ctx.lineTo(pr.right,y);ctx.stroke();ctx.fillText(formatNum(z,1)+' m',pr.left-7,y+4);}ctx.textAlign='center';for(let i=0;i<=4;i++){const d=vw.start+vw.span*i/4,x=pr.left+pr.width*i/4;ctx.fillText(formatNum(d,1)+' m',x,pr.bottom+17);}
  }
  ctx.restore();
}
function drawSectionBase(c,tempManual=null){
  if(!c||!c.width)return;const f=state.features.find(x=>x.id===state.currentSection);if(!f)return;const ctx=c.getContext('2d'),r=c.getBoundingClientRect(),dpr=c._dpr||1;ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);const pr=sectionPlotRect(c),p=f.sectionProfile,rg=sectionDisplayRange(f,c);
  ctx.fillStyle='rgba(255,253,248,.97)';ctx.fillRect(0,0,r.width,r.height);ctx.strokeStyle='#8f8b82';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pr.left,pr.top);ctx.lineTo(pr.left,pr.bottom);ctx.lineTo(pr.right,pr.bottom);ctx.stroke();
  if(!p?.samples?.length||!rg){ctx.fillStyle='#777268';ctx.font='14px sans-serif';ctx.fillText('Sin perfil MDT/LiDAR. Importa una capa de elevación o pulsa Recalcular.',pr.left+20,pr.top+35);ctx.restore();return;}
  drawMetricSectionGrid(ctx,f,c,pr,rg);
  if($('#showSectionRefs')?.checked!==false){const refs=sectionReferences(f),vw=sectionVisibleWindow(f),showLabels=vw.zoom>1.25;for(const ref of refs){
    if(ref.type==='area'){const d0=ref.t0*vw.len,d1=ref.t1*vw.len;if(d1<vw.start||d0>vw.end)continue;const x0=pr.left+((Math.max(vw.start,d0)-vw.start)/vw.span)*pr.width,x1=pr.left+((Math.min(vw.end,d1)-vw.start)/vw.span)*pr.width,y=pr.top+13,col=materialReferenceStyle(ref.material);ctx.fillStyle=col;ctx.globalAlpha=.78;ctx.fillRect(x0,y,Math.max(2,x1-x0),8);ctx.globalAlpha=1;if(showLabels){ctx.fillStyle='#3f3c36';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText(`${ref.id} · ${ref.label}`,Math.max(pr.left+35,Math.min(pr.right-35,(x0+x1)/2)),y-3);}}
    else{const d=ref.t*vw.len;if(d<vw.start-.001||d>vw.end+.001)continue;const x=pr.left+((d-vw.start)/vw.span)*pr.width,col=ref.color||'#2473a7';ctx.fillStyle=col;ctx.strokeStyle='rgba(255,255,255,.96)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,pr.top+20,5,0,Math.PI*2);ctx.fill();ctx.stroke();if(showLabels){const txt=ref.label||ref.id;ctx.font='600 10px sans-serif';ctx.textAlign='center';const tw=ctx.measureText(txt).width;ctx.fillStyle='rgba(255,253,248,.94)';ctx.fillRect(Math.max(pr.left,Math.min(pr.right-tw-10,x-tw/2-5)),pr.top+2,tw+10,14);ctx.fillStyle=col;ctx.fillText(txt,Math.max(pr.left+tw/2+5,Math.min(pr.right-tw/2-5,x)),pr.top+12);}}
  }}
  function drawProfile(arr,style,width,dash=[]){ctx.strokeStyle=style;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();let started=false;for(const s of arr||[]){if(!Number.isFinite(s.z)){started=false;continue;}const q=sectionXYFromData(f,c,s.d,s.z);if(!q)continue;if(!started){ctx.moveTo(q.x,q.y);started=true;}else ctx.lineTo(q.x,q.y);}ctx.stroke();ctx.setLineDash([]);}
  if($('#showDemProfile')?.checked!==false)drawProfile(p.samples,'#879097',2,[6,4]);const manual=tempManual||p.manual;if($('#showManualProfile')?.checked!==false&&manual?.length>1)drawProfile(manual,'#1f2b31',3,[]);if(c._sectionSelection?.kind==='profileEdit'){const ed=ensureProfileManualEdits(p).find(x=>x.id===c._sectionSelection.id);if(ed)drawProfile(ed.pts,'#d76c2d',4,[7,4]);}
  ctx.textAlign='left';ctx.font='11px sans-serif';ctx.fillStyle='#879097';ctx.fillText('┄ MDT/LiDAR',pr.left+8,pr.bottom-8);if(manual?.length>1){ctx.fillStyle='#1f2b31';ctx.fillText('━ Perfil de campo',pr.left+100,pr.bottom-8);}ctx.restore();
}
function syncSectionControls(f){
  const v=sectionView(f),grid=$('#sectionGridSelect'),custom=$('#sectionGridCustom'),wrap=$('#sectionGridCustomWrap');const common=[0,.5,1,2];const n=Number(v.gridStep)||0;if(common.includes(n)){grid.value=String(n);wrap.classList.add('hidden');}else{grid.value='custom';custom.value=String(n||1);wrap.classList.remove('hidden');}
  $('#sectionVerticalScale').value=String(v.verticalScale||'1');updateSectionZoomUi(f);const len=f.sectionProfile?.length||featureLength(f)||0;$('#sectionLengthBadge').textContent=`Longitud: ${formatLengthUnit(len,2)}`;$('#sectionLengthField').textContent=formatLengthUnit(len,2);$('#sectionFillOpacity').value=String(state.sectionFillOpacity||.45);if($('#sectionStraightToggle'))$('#sectionStraightToggle').classList.toggle('active',state.sectionStraightSegments!==false);if($('#sectionGeoClass'))$('#sectionGeoClass').value=state.sectionGeoClass||'none';if($('#sectionZoneClass'))$('#sectionZoneClass').value=state.sectionZoneClass||'channel';if($('#sectionZoneCustom'))$('#sectionZoneCustom').value=state.sectionZoneCustom||'';const zoneOn=state.sectionTool==='zone';$('#sectionZoneSelectorWrap')?.classList.toggle('hidden',!zoneOn);$('#sectionZoneCustom')?.classList.toggle('hidden',!zoneOn||state.sectionZoneClass!=='custom');renderSectionColorChips();$$('[data-section-material]').forEach(b=>b.classList.toggle('active',b.dataset.sectionMaterial===state.sectionMaterial));$$('[data-section-tool]').forEach(b=>b.classList.toggle('active',b.dataset.sectionTool===state.sectionTool));updateSectionToolHint();updateSectionMeasureSummary(f);
}
function ensureSectionMeasurements(f){
  if(!f)return null;f.sectionMeasurements=f.sectionMeasurements||{width:'',depth:'',note:'',widthInk:[],depthInk:[],noteInk:[]};
  for(const k of ['widthInk','depthInk','noteInk'])if(!Array.isArray(f.sectionMeasurements[k]))f.sectionMeasurements[k]=[];return f.sectionMeasurements;
}
function updateSectionMeasureSummary(f){
  const el=$('#sectionMeasureSummary');if(!el||!f)return;const m=ensureSectionMeasurements(f),bits=[];
  if(m.width!==''&&m.width!=null)bits.push(`Anchura ${formatLengthUnit(+m.width,2)}`);else if(m.widthInk?.length)bits.push('Anchura manuscrita');
  if(m.depth!==''&&m.depth!=null)bits.push(`Prof. ${formatLengthUnit(+m.depth,2)}`);else if(m.depthInk?.length)bits.push('Prof. manuscrita');
  if((m.note||'').trim()||m.noteInk?.length)bits.push('Nota');el.textContent=bits.length?bits.join(' · '):'Sin medidas añadidas';
}
function loadMeasureCanvas(canvas,ink,readOnly){
  if(!canvas)return;canvas._readOnly=!!readOnly;canvas._inkStore=cloneAny(ink||[]);canvas._redoStore=[];setTimeout(()=>{resizeDrawCanvas(canvas);redrawInkStore(canvas);},25);
}
function openSectionMeasures(){
  const f=state.features.find(x=>x.id===state.currentSection);if(!f)return;const m=ensureSectionMeasurements(f),readOnly=!isEditableCampaign();
  const factor=metersFactor(appSettings.lengthUnit);$('#sectionChannelWidthInput').value=m.width!==''&&m.width!=null?formatNum((+m.width)*factor,3).replace(/\./g,'').replace(',','.'):'';$('#sectionMaxDepthInput').value=m.depth!==''&&m.depth!=null?formatNum((+m.depth)*factor,3).replace(/\./g,'').replace(',','.'):'';$('#sectionNoteInput').value=m.note||'';if($('#sectionWidthUnit'))$('#sectionWidthUnit').textContent=appSettings.lengthUnit;if($('#sectionDepthUnit'))$('#sectionDepthUnit').textContent=appSettings.lengthUnit;
  $('#sectionMeasuresModal').classList.remove('hidden');$('#sectionMeasuresReadOnly').classList.toggle('hidden',!readOnly);$('.section-measures-card')?.classList.toggle('read-only',readOnly);
  for(const el of [$('#sectionChannelWidthInput'),$('#sectionMaxDepthInput'),$('#sectionNoteInput')])el.disabled=readOnly;
  $$('[data-measure-tool]').forEach(b=>{b.disabled=readOnly;b.classList.toggle('active',b.dataset.measureTool===state.sectionMeasureTool);});$$('[data-clear-measure]').forEach(b=>b.disabled=readOnly);
  loadMeasureCanvas($('#sectionWidthInk'),m.widthInk,readOnly);loadMeasureCanvas($('#sectionDepthInk'),m.depthInk,readOnly);loadMeasureCanvas($('#sectionNoteInk'),m.noteInk,readOnly);
}
function saveSectionMeasures(close=true){
  const f=state.features.find(x=>x.id===state.currentSection);if(!f||!isEditableCampaign()){if(close)$('#sectionMeasuresModal').classList.add('hidden');return;}const m=ensureSectionMeasurements(f);
  const factor=metersFactor(appSettings.lengthUnit);m.width=$('#sectionChannelWidthInput').value===''?'':(+$('#sectionChannelWidthInput').value/factor);m.depth=$('#sectionMaxDepthInput').value===''?'':(+$('#sectionMaxDepthInput').value/factor);m.note=$('#sectionNoteInput').value;m.widthInk=cloneAny($('#sectionWidthInk')._inkStore||[]);m.depthInk=cloneAny($('#sectionDepthInk')._inkStore||[]);m.noteInk=cloneAny($('#sectionNoteInk')._inkStore||[]);persistState();updateSectionMeasureSummary(f);if(close)$('#sectionMeasuresModal').classList.add('hidden');
}

function setSectionFitxaPage(page){const n=Math.max(1,Math.min(3,+page||1));$$('[data-section-fitxa-page]').forEach(x=>x.classList.toggle('hidden',x.dataset.sectionFitxaPage!==String(n)));[['#sectionPage1Btn',1],['#sectionPage2Btn',2],['#sectionPage3Btn',3]].forEach(([sel,p])=>$(sel)?.classList.toggle('active',p===n));if(n===1){const f=state.features.find(x=>x.id===state.currentSection);if(f)requestAnimationFrame(()=>{updateSectionCanvasMetricSize(f);redrawInkStore($('#sectionCanvas'));});}if(n===2)renderSectionFieldTable(state.features.find(x=>x.id===state.currentSection));if(n===3)renderSectionFic(state.features.find(x=>x.id===state.currentSection));}
function sectionTableCell(d,row,col){d.table[row]=d.table[row]||{};return d.table[row][col]??'';}
function sectionTableInkCell(d,row,col){d.tableInk=d.tableInk||{};d.tableInk[row]=d.tableInk[row]||{};if(!Array.isArray(d.tableInk[row][col]))d.tableInk[row][col]=[];return d.tableInk[row][col];}
function redrawSectionTableInkCanvas(c,records,active=null){
  if(!c)return;const r=c.getBoundingClientRect();if(!r.width||!r.height)return;const dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));
  if(c.width!==w||c.height!==h){c.width=w;c.height=h;c._dpr=dpr;}const g=c.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,c.width,c.height);
  const draw=st=>{if(!st?.pts?.length)return;g.save();g.setTransform(dpr,0,0,dpr,0,0);g.lineCap='round';g.lineJoin='round';g.globalCompositeOperation=st.tool==='eraser'?'destination-out':'source-over';g.strokeStyle=st.color||'#1f2b31';g.lineWidth=st.tool==='eraser'?18:2.2;g.beginPath();const pts=st.pts;g.moveTo(pts[0].x*r.width,pts[0].y*r.height);for(let i=1;i<pts.length;i++)g.lineTo(pts[i].x*r.width,pts[i].y*r.height);if(pts.length===1){g.lineTo(pts[0].x*r.width+.01,pts[0].y*r.height+.01);}g.stroke();g.restore();};
  (records||[]).forEach(draw);if(active)draw(active);
}
function sectionTableInkNorm(e,c){const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)/Math.max(1,r.width),y:(e.clientY-r.top)/Math.max(1,r.height)};}
function installSectionTableInkCanvas(c,f,row,col){
  if(!c||c._tableInkInstalled)return;c._tableInkInstalled=true;c.dataset.row=row;c.dataset.col=col;
  const data=()=>sectionTableInkCell(ensureSectionSheetData(f),row,col);
  c.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||!isEditableCampaign())return;e.preventDefault();e.stopPropagation();state.sectionTableActiveCell={row,col};c._active={tool:state.sectionTableInkTool||'pen',color:state.sectionTableInkColor||state.notebookPenColor||'#1f2b31',pts:[sectionTableInkNorm(e,c)],pointerId:e.pointerId};c.setPointerCapture?.(e.pointerId);redrawSectionTableInkCanvas(c,data(),c._active);});
  c.addEventListener('pointermove',e=>{if(!c._active||c._active.pointerId!==e.pointerId)return;e.preventDefault();e.stopPropagation();c._active.pts.push(sectionTableInkNorm(e,c));redrawSectionTableInkCanvas(c,data(),c._active);});
  const finish=e=>{if(!c._active||c._active.pointerId!==e.pointerId)return;const rec={...c._active};delete rec.pointerId;c._active=null;data().push(rec);persistState();redrawSectionTableInkCanvas(c,data());};
  c.addEventListener('pointerup',finish);c.addEventListener('pointercancel',()=>{c._active=null;redrawSectionTableInkCanvas(c,data());});
  requestAnimationFrame(()=>redrawSectionTableInkCanvas(c,data()));
}
function renderSectionTableQuickColors(){
  const root=$('#sectionTableQuickColors');if(!root)return;root.innerHTML='';const cols=appSettings.notebookQuickColors||DEFAULT_APP_SETTINGS.notebookQuickColors;state.sectionTableInkColor=state.sectionTableInkColor||state.notebookPenColor||cols[0];
  for(const col of cols){const b=document.createElement('button');b.type='button';b.style.background=col;b.classList.toggle('active',String(col).toLowerCase()===String(state.sectionTableInkColor).toLowerCase());b.onclick=()=>{state.sectionTableInkColor=col;renderSectionTableQuickColors();};root.appendChild(b);}
}
function setSectionTableZoom(value){
  const z=Math.max(.75,Math.min(2.5,Number(value)||1)),page=document.querySelector('[data-section-fitxa-page="2"]');state.sectionTableZoom=z;if(page)page.style.zoom=String(z);if($('#sectionTableZoomLabel'))$('#sectionTableZoomLabel').textContent=`${Math.round(z*100)}%`;
  requestAnimationFrame(()=>document.querySelectorAll('.section-table-ink-canvas').forEach(c=>{const f=state.features.find(x=>x.id===state.currentSection);if(f)redrawSectionTableInkCanvas(c,sectionTableInkCell(ensureSectionSheetData(f),c.dataset.row,c.dataset.col));}));
}
function renderSectionFieldTable(f){
  const root=$('#sectionFieldTable');if(!root||!f)return;const d=ensureSectionSheetData(f);let html='<table><thead><tr><th></th>'+SECTION_TABLE_COLS.map(([,lab])=>`<th>${escapeHtml(lab)}</th>`).join('')+'</tr></thead><tbody>';
  for(const row of SECTION_TABLE_ROWS){html+=`<tr><th>${escapeHtml(row.label)}</th>`;for(const [col] of SECTION_TABLE_COLS){const val=sectionTableCell(d,row.key,col),area=['erosionEvidence','accumulationEvidence','grainClasses'].includes(row.key);html+=`<td><div class="section-table-cell-editor"><canvas class="section-table-ink-canvas ${area?'tall':''}" data-section-table-ink-row="${row.key}" data-section-table-ink-col="${col}"></canvas>${area?`<textarea data-section-table-row="${row.key}" data-section-table-col="${col}" placeholder="Text opcional">${escapeHtml(val)}</textarea>`:`<input type="text" data-section-table-row="${row.key}" data-section-table-col="${col}" value="${escapeHtml(val)}" placeholder="Text opcional">`}</div></td>`;}html+='</tr>';}html+='</tbody></table>';root.innerHTML=html;
  root.querySelectorAll('[data-section-table-row]').forEach(el=>{el.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')e.stopPropagation();});el.oninput=e=>{const dd=ensureSectionSheetData(f),r=e.target.dataset.sectionTableRow,c=e.target.dataset.sectionTableCol;dd.table[r]=dd.table[r]||{};dd.table[r][c]=e.target.value;persistState();};});
  root.querySelectorAll('[data-section-table-ink-row]').forEach(c=>installSectionTableInkCanvas(c,f,c.dataset.sectionTableInkRow,c.dataset.sectionTableInkCol));renderSectionTableQuickColors();setSectionTableZoom(state.sectionTableZoom||1);
}
function ficCanvasNormGeneric(e,c){const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};}
function installSectionFicNoteCanvas(c,f,key){if(c._sectionFicInstalled)return;c._sectionFicInstalled=true;c.style.touchAction='none';const rec=ensureSectionSheetData(f).fic[key];c.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||!isEditableCampaign())return;e.preventDefault();c._active={tool:state.ficNoteTool||'pen',kind:'stroke',color:state.ficNoteColor||'#1f2b31',pts:[ficCanvasNormGeneric(e,c)],pointerId:e.pointerId};c.setPointerCapture?.(e.pointerId);redrawFicNoteCanvas(c,rec);});c.addEventListener('pointermove',e=>{if(!c._active||c._active.pointerId!==e.pointerId)return;e.preventDefault();c._active.pts.push(ficCanvasNormGeneric(e,c));redrawFicNoteCanvas(c,rec);});const finish=e=>{if(!c._active||c._active.pointerId!==e.pointerId)return;const a={...c._active};delete a.pointerId;c._active=null;rec.noteInk.push(a);persistState();redrawFicNoteCanvas(c,rec);};c.addEventListener('pointerup',finish);c.addEventListener('pointercancel',()=>{c._active=null;redrawFicNoteCanvas(c,rec);});requestAnimationFrame(()=>redrawFicNoteCanvas(c,rec));}
function renderSectionFic(f){const root=$('#sectionFicTable');if(!root||!f)return;const data=ensureSectionSheetData(f);let html='<div class="reach-sheet-fic-head"><div></div><div>Rang</div><div>Puntuació</div><div>notes</div></div>';for(const row of REACH_FIC_ROWS){if(row.group){html+=`<div class="reach-sheet-fic-row"><div class="criterion"><b>${escapeHtml(row.group)}</b></div><div></div><div></div><div></div></div>`;continue;}const rec=data.fic[row.key]||{},opts=['<option value="">—</option>',...row.options.map(o=>`<option value="${o.score}" ${optionalScore(rec.score)===o.score?'selected':''}>${o.score} · ${escapeHtml(o.text)}</option>`)].join('');html+=`<div class="reach-sheet-fic-row"><div class="criterion">${row.prefix?`<div><b>${escapeHtml(row.prefix)}</b></div>`:''}<b>${escapeHtml(row.label)}</b>${row.note?`<div class="reach-sheet-fic-small" style="margin-top:8px;font-style:italic">${escapeHtml(row.note)}</div>`:''}</div><div class="range-cell">${row.options.map(o=>`<div>${escapeHtml(o.text)}</div>`).join('')}</div><div class="score-cell"><select data-section-fic-select="${row.key}">${opts}</select></div><div class="fic-note-cell"><canvas class="fic-note-canvas" data-section-fic-note="${row.key}"></canvas></div></div>`;}const total=calcSectionFicTotal(f);html+=`<div class="reach-sheet-fic-total"><div><i>Total, puntuació del component pendent avall **</i><div class="reach-sheet-fic-small">Notes: ** Es proporciona la puntuació total del component de pendent ascendent. per: Sd=Ad+ Bd+Cd+ WdDd1 +(1 − Wd)Dd2</div></div><div class="value">${total==null?'—':total}</div><div></div></div><div class="reach-sheet-fic-final"><div class="fic-final-text">L’índex de connectivitat del camp ve donat per FIC=(Su+Sd)/2</div></div>`;root.innerHTML=html;root.querySelectorAll('[data-section-fic-select]').forEach(sel=>{sel.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')e.stopPropagation();});sel.onclick=e=>e.stopPropagation();sel.onchange=e=>{const k=e.target.dataset.sectionFicSelect,dd=ensureSectionSheetData(f);dd.fic[k].score=e.target.value===''?null:+e.target.value;persistState();renderSectionFic(f);};});root.querySelectorAll('[data-section-fic-note]').forEach(c=>installSectionFicNoteCanvas(c,f,c.dataset.sectionFicNote));}
function saveSectionFitxaHeader(){const f=state.features.find(x=>x.id===state.currentSection);if(!f||!isEditableCampaign())return;const d=ensureSectionSheetData(f);d.sectionName=$('#sectionNameInput')?.value.trim()||f.sectionName||f.id;d.visitDate=$('#sectionVisitDate')?.value||'';d.sectionType=$('#sectionTypeInput')?.value||'';d.observations=$('#sectionObservations')?.value||'';f.sectionName=d.sectionName;persistState();drawAll();renderSectionList();}
function openCodesReference(){$('#codesReferenceModal')?.classList.remove('hidden');}
function openSection(f){
  if(!f)return;associateSectionIfNeeded(f);const readOnly=!isEditableCampaign();state.currentSection=f.id;sectionView(f);ensureSectionMeasurements(f);const d=ensureSectionSheetData(f),reach=sectionReach(f),course=sectionCourse(f);$('#sectionId').textContent=d.sectionName||f.sectionName||f.id;const sc=$('#sectionCampaign');sc.innerHTML=`<option>${escapeHtml(campaignLabel(state.campaign))}</option>`;$('#sectionTorrentName').textContent=course?`${course.abbr||''}, ${course.name||''}`:'—';$('#sectionReachName').textContent=reach?.reachCode||reach?.id||'—';$('#sectionNameInput').value=d.sectionName||f.sectionName||f.id;$('#sectionVisitDate').value=d.visitDate||currentCampaign()?.date||'';if($('#sectionTypeInput'))$('#sectionTypeInput').value=d.sectionType||'';$('#sectionObservations').value=d.observations||'';$('#sectionModal').classList.remove('hidden');$('#sectionModal').classList.toggle('read-only',readOnly);const banner=$('#sectionReadOnlyBanner');if(banner)banner.classList.toggle('hidden',!readOnly);
  $$('#sectionModal [data-section-tool]').forEach(b=>b.disabled=readOnly);for(const el of [$('#sectionNameInput'),$('#sectionVisitDate'),$('#sectionTypeInput'),$('#sectionObservations')])if(el)el.disabled=readOnly;$('#sectionRebuildProfile').disabled=readOnly;$('#sectionResetProfile').disabled=readOnly;syncSectionControls(f);renderSectionFieldTable(f);renderSectionFic(f);setSectionFitxaPage(1);const c=$('#sectionCanvas');if(c){c._sectionBuilder=null;c._sectionHover=null;c._sectionObjectActive=null;c._hoverSnap=null;c._sectionSelection=null;syncSectionBuilderButtons();syncSectionSelectionUi();}
  setTimeout(()=>{const c=$('#sectionCanvas');c._readOnly=readOnly;c._inkStore=cloneAny(f.sectionInk||[]);c._profileActive=null;updateSectionProfileStatus(f);updateSectionCanvasMetricSize(f);redrawInkStore(c);ensureSectionProfile(f).then(async()=>{await ensureSectionReferenceLayersLoaded();updateSectionCanvasMetricSize(f);syncSectionControls(f);redrawInkStore(c);});},30);
}
function closeSection(){const c=$('#sectionCanvas'),f=state.features.find(x=>x.id===state.currentSection);if(f&&!c._readOnly){f.sectionInk=cloneAny(c._inkStore||[]);saveSectionFitxaHeader();persistState();}if(c){c._sectionBuilder=null;c._sectionHover=null;c._sectionObjectActive=null;c._hoverSnap=null;c._sectionSelection=null;syncSectionSelectionUi();}$('#sectionMaterialPopover')?.classList.add('hidden');$('#sectionColorPopover')?.classList.add('hidden');$('#sectionMeasuresModal')?.classList.add('hidden');$('#sectionModal').classList.add('hidden');renderSectionList();if(shouldReturnToPan())setTool('pan',{quiet:true});}

function installSectionViewportGestures(){
  const c=$('#sectionCanvas');if(!c||c._viewportGesturesInstalled)return;c._viewportGesturesInstalled=true;const touches=new Map();let gesture=null;
  const pos=e=>eventPoint(e,c);
  c.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;const f=state.features.find(x=>x.id===state.currentSection);if(!f)return;e.preventDefault();const p=pos(e);touches.set(e.pointerId,p);c.setPointerCapture?.(e.pointerId);if(touches.size===2){const a=[...touches.values()],mid=(a[0].x+a[1].x)/2,pr=sectionPlotRect(c),vw=sectionVisibleWindow(f),anchor=vw.start+Math.max(0,Math.min(1,(mid-pr.left)/Math.max(1,pr.width)))*vw.span;gesture={kind:'pinch',dist:Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y),zoom:vw.zoom,anchor,midX:mid};}else if(touches.size===1){const vw=sectionVisibleWindow(f);gesture={kind:'pan',x:p.x,center:vw.center,span:vw.span};}}, {passive:false});
  c.addEventListener('pointermove',e=>{if(e.pointerType!=='touch'||!touches.has(e.pointerId))return;const f=state.features.find(x=>x.id===state.currentSection);if(!f)return;e.preventDefault();const p=pos(e);touches.set(e.pointerId,p);const v=sectionView(f),pr=sectionPlotRect(c);if(touches.size===2){const a=[...touches.values()],dist=Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y),mid=(a[0].x+a[1].x)/2;if(!gesture||gesture.kind!=='pinch'){const vw=sectionVisibleWindow(f);gesture={kind:'pinch',dist,zoom:vw.zoom,anchor:vw.center,midX:mid};}const oldVw=sectionVisibleWindow(f),oldRg=sectionDisplayRange(f,c),nz=Math.max(1,Math.min(20,gesture.zoom*dist/Math.max(1,gesture.dist)));v.zoomX=nz;let nw=sectionVisibleWindow(f),ratio=Math.max(0,Math.min(1,(mid-pr.left)/Math.max(1,pr.width)));v.centerD=gesture.anchor+(0.5-ratio)*nw.span;nw=sectionVisibleWindow(f);const newRg=sectionDisplayRange(f,c);remapSectionDrawingForWindow(f,c,oldVw,nw);remapSectionDrawingForRange(f,c,oldRg,newRg);updateSectionZoomUi(f);redrawInkStore(c);}else if(touches.size===1&&gesture?.kind==='pan'&&sectionVisibleWindow(f).zoom>1){const oldVw=sectionVisibleWindow(f),oldRg=sectionDisplayRange(f,c),dx=p.x-gesture.x;v.centerD=gesture.center-dx/Math.max(1,pr.width)*gesture.span;const newVw=sectionVisibleWindow(f),newRg=sectionDisplayRange(f,c);remapSectionDrawingForWindow(f,c,oldVw,newVw);remapSectionDrawingForRange(f,c,oldRg,newRg);gesture={kind:'pan',x:p.x,center:newVw.center,span:newVw.span};updateSectionZoomUi(f);redrawInkStore(c);}}, {passive:false});
  const end=e=>{if(e.pointerType!=='touch')return;touches.delete(e.pointerId);const f=state.features.find(x=>x.id===state.currentSection);if(f&&touches.size===1){const p=[...touches.values()][0],vw=sectionVisibleWindow(f);gesture={kind:'pan',x:p.x,center:vw.center,span:vw.span};}else if(!touches.size){gesture=null;if(f&&isEditableCampaign())persistState();}};c.addEventListener('pointerup',end);c.addEventListener('pointercancel',end);
}
function installInkCanvas(canvas,mode){
  canvas._inkStore=[];canvas._active=null;
  const getTool=()=>mode==='sheet'?state.sheetTool:mode==='notebook'?state.notebookTool:mode.startsWith('measure')?state.sectionMeasureTool:state.sectionTool;
  canvas.addEventListener('pointerdown',e=>{
    if(e.pointerType==='touch'||canvas._readOnly)return;const p=eventPoint(e,canvas),tool=getTool();
    if(mode==='section'){
      const f=state.features.find(x=>x.id===state.currentSection);if(!f)return;const raw=normPoint(p,canvas),snap=sectionSnapNorm(f,canvas,raw),np=snap.np;
      canvas._hoverSnap=snap.d<Infinity?snap:null;
      if(tool==='select'){const hit=selectSectionDrawingAt(canvas,raw);if(!hit)toast('No hi ha cap objecte sota el llapis');return;}
      if(tool==='profile'){
        if(!f.sectionProfile?.samples?.length){toast('Primer genera el perfil MDE/LiDAR');return;}canvas._active={tool:'profile',profile:true,pts:[np],replaceId:canvas._sectionSelection?.kind==='profileEdit'?canvas._sectionSelection.id:null};canvas.setPointerCapture?.(e.pointerId);return;
      }
      if(tool==='zone'){
        if(!f.sectionProfile?.samples?.length){toast('Primer genera el perfil MDE/LiDAR');return;}
        const q=sectionProfileSnapPoint(f,canvas,raw);if(!q){toast('Toca dins del perfil topogràfic');return;}
        if(!canvas._sectionBuilder||canvas._sectionBuilder.tool!=='zone')canvas._sectionBuilder={tool:'zone',pts:[],zoneClass:state.sectionZoneClass||'channel',zoneLabel:sectionZoneLabel(),color:state.sectionColor};
        canvas._sectionBuilder.zoneClass=state.sectionZoneClass||'channel';canvas._sectionBuilder.zoneLabel=sectionZoneLabel();canvas._sectionBuilder.pts.push(q.np);canvas._sectionHover=null;canvas._hoverSnap={np:q.np,d:0,kind:'perfil'};syncSectionBuilderButtons();redrawInkStore(canvas);
        if(canvas._sectionBuilder.pts.length>=2)finishSectionBuilder();
        else toast(`Inici de ${sectionZoneLabel()} · toca el final`);
        return;
      }
      if((tool==='line'||tool==='polygon')&&state.sectionStraightSegments!==false){
        if(!canvas._sectionBuilder||canvas._sectionBuilder.tool!==tool)canvas._sectionBuilder={tool,pts:[],geoClass:state.sectionGeoClass||'none',color:state.sectionColor};canvas._sectionBuilder.pts.push(np);canvas._sectionBuilder.geoClass=state.sectionGeoClass||'none';canvas._sectionBuilder.color=state.sectionColor;canvas._sectionHover=null;syncSectionBuilderButtons();redrawInkStore(canvas);return;
      }
      if(['tree','shrub','rockSymbol','measure','height'].includes(tool)){
        canvas._sectionObjectActive={kind:tool,a:np,b:np,color:state.sectionColor,geoClass:state.sectionGeoClass||'none'};canvas.setPointerCapture?.(e.pointerId);redrawInkStore(canvas);return;
      }
      if((tool==='line'||tool==='polygon')&&state.sectionStraightSegments===false){canvas._sectionObjectActive={kind:tool==='polygon'?'polygon':'polyline',pts:[np],geoClass:state.sectionGeoClass||'none',color:state.sectionColor,freehand:true};canvas.setPointerCapture?.(e.pointerId);return;}
    }
    const rec={tool,kind:mode==='section'&&tool==='fill'?'fill':'stroke',pts:[normPoint(p,canvas)],pressure:[e.pressure||.5]};
    if(mode==='section'){rec.color=state.sectionColor;rec.material=state.sectionMaterial;rec.opacity=state.sectionFillOpacity;}
    if(mode==='notebook'&&tool!=='eraser')rec.color=state.notebookPenColor||appSettings.notebookPenColor||'#1f2b31';
    canvas._active=rec;canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    const p=eventPoint(e,canvas);
    if(mode==='section'){
      const f=state.features.find(x=>x.id===state.currentSection);if(!f)return;const raw=normPoint(p,canvas),tool=getTool();
      if(canvas._sectionObjectActive){const o=canvas._sectionObjectActive;if(o.freehand){o.pts.push(sectionSnapNorm(f,canvas,raw,{threshold:12}).np);}else if(o.kind==='height'){const v=sectionVerticalTarget(f,canvas,o.a,raw);o.b={x:o.a.x,y:v.y};canvas._hoverSnap={np:o.b,d:0,kind:v.kind||'vertical'};}else{let q=sectionSnapNorm(f,canvas,raw).np;if(o.kind==='measure'){const r=canvas.getBoundingClientRect();if(Math.abs((q.y-o.a.y)*r.height)<=14)q={x:q.x,y:o.a.y};}o.b=q;canvas._hoverSnap={np:q,d:0,kind:'imant'};}redrawInkStore(canvas);return;}
      if(canvas._sectionBuilder?.pts?.length){const q=canvas._sectionBuilder.tool==='zone'?(sectionProfileSnapPoint(f,canvas,raw)||{np:raw,d:Infinity,kind:''}):sectionSnapNorm(f,canvas,raw);canvas._sectionHover=q.np;canvas._hoverSnap=(canvas._sectionBuilder.tool==='zone'||q.d<Infinity)?{...q,d:Number.isFinite(q.d)?q.d:0}:null;redrawInkStore(canvas);return;}
      if(!canvas._active&&e.pointerType==='pen'&&e.buttons===0){const q=tool==='zone'?(sectionProfileSnapPoint(f,canvas,raw)||{np:raw,d:Infinity,kind:''}):sectionSnapNorm(f,canvas,raw);canvas._hoverSnap=((tool==='zone'&&q.np)||q.d<Infinity)?{...q,d:Number.isFinite(q.d)?q.d:0}:null;redrawInkStore(canvas);return;}
    }
    if(!canvas._active)return;canvas._active.pts.push(normPoint(p,canvas));
    if(mode==='section'){redrawInkStore(canvas);return;}drawInkStroke(canvas,canvas._active,true);
  });
  canvas.addEventListener('pointerup',()=>{
    if(mode==='section'&&canvas._sectionObjectActive){
      const f=state.features.find(x=>x.id===state.currentSection),o=canvas._sectionObjectActive;canvas._sectionObjectActive=null;if(!f){redrawInkStore(canvas);return;}f.sectionObjects=f.sectionObjects||[];
      if(o.freehand){if(o.pts?.length>=(o.kind==='polygon'?3:2))f.sectionObjects.push({kind:o.kind,pts:o.pts,geoClass:o.geoClass,color:o.color});}
      else{const r=canvas.getBoundingClientRect(),dist=Math.hypot((o.b.x-o.a.x)*r.width,(o.b.y-o.a.y)*r.height);if(dist>=4){o.valueM=(o.kind==='measure'||o.kind==='height')?sectionMetricValue(f,canvas,o.a,o.b,o.kind):null;f.sectionObjects.push(o);}}
      persistState();redrawInkStore(canvas);return;
    }
    if(!canvas._active)return;
    if(canvas._active.profile){const f=state.features.find(x=>x.id===state.currentSection),active=canvas._active,manual=f?profileStrokeToData(f,canvas,active.pts):[];canvas._active=null;if(f&&manual.length>1){mergeManualProfile(f,manual,active.replaceId||null);canvas._sectionSelection=null;syncSectionSelectionUi();persistState();toast(active.replaceId?'Correcció del perfil modificada':'Perfil de camp actualitzat');}redrawInkStore(canvas);return;}
    const rec=canvas._active;canvas._active=null;if(rec.kind==='fill'&&rec.pts.length<3){redrawInkStore(canvas);return;}canvas._inkStore=canvas._inkStore||[];canvas._inkStore.push(rec);redrawInkStore(canvas);canvas._onchange?.();
  });
  canvas.addEventListener('pointercancel',()=>{canvas._active=null;canvas._sectionObjectActive=null;redrawInkStore(canvas);});
  if(mode==='section')canvas.addEventListener('pointerleave',e=>{if(e.pointerType==='pen'&&e.buttons===0&&!canvas._sectionBuilder){canvas._hoverSnap=null;redrawInkStore(canvas);}});
}
function normPoint(p,c){const r=c.getBoundingClientRect();return{x:p.x/r.width,y:p.y/r.height};}
function sectionLegacyColor(tool){if(tool==='sand')return'#c49a61';if(tool==='pebbles')return'#77736a';if(tool==='blocks')return'#5f625e';if(tool==='rock')return'#59615b';return'#1f2b31';}
function polygonPixels(st,r){return(st.pts||[]).map(p=>({x:p.x*r.width,y:p.y*r.height}));}
function drawSectionPattern(ctx,pts,material,color,opacity=.55){
  if(!material||material==='none'||pts.length<3)return;let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const p of pts){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}ctx.save();ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.closePath();ctx.clip();ctx.globalAlpha=Math.min(.9,Math.max(.3,opacity+.18));ctx.strokeStyle='#30342f';ctx.fillStyle='#30342f';ctx.lineWidth=1.1;
  if(material==='sand'){for(let y=minY-8;y<=maxY+8;y+=9)for(let x=minX-8;x<=maxX+8;x+=9){ctx.beginPath();ctx.arc(x+(Math.round(y/9)%2?3:0),y,1.15,0,Math.PI*2);ctx.fill();}}
  else if(material==='pebbles'){for(let y=minY-14;y<=maxY+14;y+=17)for(let x=minX-18;x<=maxX+18;x+=21){ctx.beginPath();ctx.ellipse(x+(Math.round(y/17)%2?7:0),y,5.5,3.8,0,0,Math.PI*2);ctx.stroke();}}
  else if(material==='blocks'){for(let y=minY-20;y<=maxY+20;y+=28)for(let x=minX-24;x<=maxX+24;x+=31){const xx=x+(Math.round(y/28)%2?12:0);ctx.beginPath();for(let k=0;k<6;k++){const a=Math.PI/3*k+.2,px=xx+8*Math.cos(a),py=y+7*Math.sin(a);k?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.stroke();}}
  else if(material==='rock'){for(let x=minX-(maxY-minY)-20;x<=maxX+20;x+=13){ctx.beginPath();ctx.moveTo(x,maxY+10);ctx.lineTo(x+(maxY-minY)+30,minY-10);ctx.stroke();}}
  else if(material==='water'){for(let y=minY-10;y<=maxY+10;y+=10){ctx.beginPath();for(let x=minX-10;x<=maxX+10;x+=8){const yy=y+Math.sin((x-minX)/9)*1.8;x===minX-10?ctx.moveTo(x,yy):ctx.lineTo(x,yy);}ctx.stroke();}}
  ctx.restore();
}

function sectionProfileValueAt(f,d){
  const p=f?.sectionProfile;if(!p)return null;const arr=(p.manual?.length?p.manual:p.samples||[]).filter(q=>Number.isFinite(q.z)).sort((a,b)=>a.d-b.d);if(!arr.length)return null;if(d<=arr[0].d)return arr[0].z;if(d>=arr.at(-1).d)return arr.at(-1).z;
  for(let i=1;i<arr.length;i++){if(arr[i].d<d)continue;const a=arr[i-1],b=arr[i],t=(d-a.d)/Math.max(1e-9,b.d-a.d);return a.z+(b.z-a.z)*t;}return null;
}
function sectionProfileSnapPoint(f,c,np){
  const r=c.getBoundingClientRect(),pr=sectionPlotRect(c),x=np.x*r.width;if(x<pr.left||x>pr.right)return null;const vw=sectionVisibleWindow(f),d=vw.start+((x-pr.left)/pr.width)*vw.span,z=sectionProfileValueAt(f,d);if(!Number.isFinite(z))return null;const q=sectionXYFromData(f,c,d,z);return q?{np:{x:q.x/r.width,y:q.y/r.height},px:q,d,z}:null;
}
function closestPointNormToSegment(p,a,b,r){const ax=a.x*r.width,ay=a.y*r.height,bx=b.x*r.width,by=b.y*r.height,px=p.x*r.width,py=p.y*r.height,dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/den)),x=ax+t*dx,y=ay+t*dy;return{np:{x:x/r.width,y:y/r.height},d:Math.hypot(px-x,py-y),t};}
function sectionObjectSegments(obj){const p=obj?.pts||[];if(obj?.kind==='measure'||obj?.kind==='height'||obj?.kind==='tree'||obj?.kind==='shrub'||obj?.kind==='rockSymbol'||obj?.kind==='zoneLabel')return obj.a&&obj.b?[[obj.a,obj.b]]:[];const out=[];for(let i=1;i<p.length;i++)out.push([p[i-1],p[i]]);if(obj?.kind==='polygon'&&p.length>2)out.push([p.at(-1),p[0]]);return out;}
function sectionSnapNorm(f,c,np,{includeProfile=true,includeObjects=true,threshold=18}={}){
  const r=c.getBoundingClientRect(),px={x:np.x*r.width,y:np.y*r.height};let best={np:{...np},d:Infinity,kind:''};
  if(includeProfile){const q=sectionProfileSnapPoint(f,c,np);if(q){const d=Math.hypot(px.x-q.px.x,px.y-q.px.y);if(d<best.d)best={np:q.np,d,kind:'perfil'};}}
  if(includeObjects){for(const obj of f.sectionObjects||[]){for(const pt of obj.pts||[obj.a,obj.b].filter(Boolean)){const d=Math.hypot(px.x-pt.x*r.width,px.y-pt.y*r.height);if(d<best.d)best={np:{...pt},d,kind:'punt'};}for(const [a,b] of sectionObjectSegments(obj)){const q=closestPointNormToSegment(np,a,b,r);if(q.d<best.d)best={np:q.np,d:q.d,kind:'línia'};}}}
  const builder=c._sectionBuilder;for(const pt of builder?.pts||[]){const d=Math.hypot(px.x-pt.x*r.width,px.y-pt.y*r.height);if(d<best.d)best={np:{...pt},d,kind:'vèrtex'};}
  return best.d<=threshold?best:{np:{...np},d:Infinity,kind:''};
}
function sectionVerticalTarget(f,c,start,np){
  const r=c.getBoundingClientRect(),x=start.x,targetY=np.y,cands=[];const ps=sectionProfileSnapPoint(f,c,{x,y:targetY});if(ps)cands.push({np:{x,y:ps.np.y},kind:'perfil'});
  for(const obj of f.sectionObjects||[]){for(const [a,b] of sectionObjectSegments(obj)){const min=Math.min(a.x,b.x),max=Math.max(a.x,b.x);if(x<min-1e-6||x>max+1e-6||Math.abs(b.x-a.x)<1e-9)continue;const t=(x-a.x)/(b.x-a.x);if(t>=0&&t<=1)cands.push({np:{x,y:a.y+(b.y-a.y)*t},kind:'línia'});}}
  if(!cands.length)return{x,y:targetY,kind:''};cands.sort((u,v)=>Math.abs(u.np.y-targetY)-Math.abs(v.np.y-targetY));return{...cands[0].np,kind:cands[0].kind};
}
function sectionMetricValue(f,c,a,b,kind='measure'){
  const da=sectionDataFromNorm(f,c,a),db=sectionDataFromNorm(f,c,b);if(!da||!db)return null;return kind==='height'?Math.abs(db.z-da.z):Math.hypot(db.d-da.d,db.z-da.z);
}
function sectionGeoStyle(cls){return cls==='rock'?{fill:'rgba(150,150,145,.24)',stroke:'#6b6963',label:'Roca'}:cls==='colluvium'?{fill:'rgba(184,151,95,.25)',stroke:'#8d6e3f',label:'Col·luvi'}:cls==='alluvium'?{fill:'rgba(86,150,176,.20)',stroke:'#4f8195',label:'Al·luvi'}:{fill:'rgba(120,120,120,.10)',stroke:'#666',label:''};}
function drawSectionStructuredObject(ctx,r,obj,dpr=1,active=false,c=null,f=null){
  if(!obj)return;const P=q=>({x:q.x*r.width,y:q.y*r.height});ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.lineCap='round';ctx.lineJoin='round';
  if(obj.kind==='polygon'){const pts=(obj.pts||[]).map(P);if(pts.length<2){ctx.restore();return;}const st=sectionGeoStyle(obj.geoClass);ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);if(!obj.preview)ctx.closePath();ctx.fillStyle=st.fill;if(pts.length>2&&!obj.preview)ctx.fill();ctx.strokeStyle=obj.color||st.stroke;ctx.lineWidth=active?3:2;ctx.setLineDash(obj.preview?[6,5]:[]);ctx.stroke();ctx.setLineDash([]);if(st.label&&pts.length>2){const x=pts.reduce((a,p)=>a+p.x,0)/pts.length,y=pts.reduce((a,p)=>a+p.y,0)/pts.length;ctx.fillStyle=st.stroke;ctx.font='700 12px system-ui';ctx.fillText(st.label,x+4,y-4);}ctx.restore();return;}
  if(obj.kind==='polyline'){const pts=(obj.pts||[]).map(P);if(pts.length<2){ctx.restore();return;}ctx.strokeStyle=obj.color||'#1f2b31';ctx.lineWidth=active?3.2:2.2;ctx.setLineDash(obj.preview?[6,5]:[]);ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.stroke();ctx.setLineDash([]);ctx.restore();return;}
  if(['tree','shrub'].includes(obj.kind)){const a=P(obj.a),b=P(obj.b),dx=b.x-a.x,dy=b.y-a.y,L=Math.max(8,Math.hypot(dx,dy)),ux=dx/L,uy=dy/L,nx=-uy,ny=ux;ctx.strokeStyle=obj.color||'#486a45';ctx.fillStyle='rgba(92,132,75,.16)';ctx.lineWidth=active?3:2;if(obj.kind==='tree'){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();const rad=Math.max(8,L*.22);for(const off of [-.18,0,.18]){const cx=b.x+nx*L*off,cy=b.y+ny*L*off;ctx.beginPath();ctx.arc(cx,cy,rad,0,Math.PI*2);ctx.fill();ctx.stroke();}}else{const rad=Math.max(6,L*.18),center={x:a.x+dx*.62,y:a.y+dy*.62};for(const off of [-.28,0,.28]){ctx.beginPath();ctx.arc(center.x+nx*L*off,center.y+ny*L*off,rad,0,Math.PI*2);ctx.fill();ctx.stroke();}}ctx.restore();return;}
  if(obj.kind==='rockSymbol'){const a=P(obj.a),b=P(obj.b),rad=Math.max(5,Math.hypot(b.x-a.x,b.y-a.y));ctx.strokeStyle=obj.color||'#6d6860';ctx.fillStyle='rgba(110,105,96,.14)';ctx.lineWidth=active?3:2;ctx.beginPath();for(let i=0;i<11;i++){const ang=Math.PI*2*i/11,rr=rad*(.86+.12*Math.sin(i*3.17)),x=a.x+Math.cos(ang)*rr,y=a.y+Math.sin(ang)*rr;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();return;}
  if(obj.kind==='zoneLabel'){
    const a=P(obj.a),b=P(obj.b),x0=Math.min(a.x,b.x),x1=Math.max(a.x,b.x),pr=c?sectionPlotRect(c):{bottom:r.height-44,left:66,right:r.width-28};let maxY=Math.max(a.y,b.y);
    if(f&&c){const da=sectionDataFromNorm(f,c,obj.a),db=sectionDataFromNorm(f,c,obj.b);if(da&&db){const lo=Math.min(da.d,db.d),hi=Math.max(da.d,db.d);for(let i=0;i<=28;i++){const d=lo+(hi-lo)*i/28,z=sectionProfileValueAt(f,d),q=Number.isFinite(z)?sectionXYFromData(f,c,d,z):null;if(q)maxY=Math.max(maxY,q.y);}}}
    const y=Math.min(pr.bottom-25,maxY+24),labelY=Math.min(pr.bottom-7,y+17),label=obj.label||sectionZoneLabel(obj.zoneClass,obj.customLabel);
    ctx.strokeStyle=active?'#2d5f49':'#777872';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=active?2.6:1.7;ctx.setLineDash(active?[]:[4,3]);ctx.beginPath();ctx.moveTo(a.x,a.y+2);ctx.lineTo(a.x,y);ctx.moveTo(b.x,b.y+2);ctx.lineTo(b.x,y);ctx.moveTo(x0,y);ctx.lineTo(x1,y);ctx.moveTo(x0,y-5);ctx.lineTo(x0,y+5);ctx.moveTo(x1,y-5);ctx.lineTo(x1,y+5);ctx.stroke();ctx.setLineDash([]);
    ctx.font='700 11px system-ui';ctx.textAlign='center';const cx=(x0+x1)/2,tw=ctx.measureText(label).width;ctx.fillStyle='rgba(255,253,248,.94)';ctx.fillRect(cx-tw/2-4,labelY-12,tw+8,15);ctx.fillStyle=active?'#2d5f49':'#555751';ctx.fillText(label,cx,labelY);ctx.restore();return;
  }
  if(obj.kind==='measure'||obj.kind==='height'){const a=P(obj.a),b=P(obj.b),latest=!!obj.latest;ctx.strokeStyle=active?'#2d5f49':latest?'#4c4c49':'#8c8b86';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=active?3:latest?2.4:1.7;ctx.setLineDash(active?[]:[5,4]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);const ang=Math.atan2(b.y-a.y,b.x-a.x),head=7;for(const [x,y,sgn] of [[a.x,a.y,1],[b.x,b.y,-1]]){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(ang+.55)*head*sgn,y+Math.sin(ang+.55)*head*sgn);ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(ang-.55)*head*sgn,y+Math.sin(ang-.55)*head*sgn);ctx.stroke();}const val=Number.isFinite(obj.valueM)?obj.valueM:(f&&c?sectionMetricValue(f,c,obj.a,obj.b,obj.kind):null);if(Number.isFinite(val)){const tx=(a.x+b.x)/2+6,ty=(a.y+b.y)/2-6,label=`${obj.kind==='height'?'h ':''}${formatNum(val,2)} m`;ctx.font='700 12px system-ui';const tw=ctx.measureText(label).width;ctx.fillStyle='rgba(255,255,255,.9)';ctx.fillRect(tx-3,ty-12,tw+6,17);ctx.fillStyle=active?'#2d5f49':'#555';ctx.fillText(label,tx,ty);}ctx.restore();return;}
  ctx.restore();
}
function sectionPointSegmentDistancePx(p,a,b,r){
  const px=p.x*r.width,py=p.y*r.height,ax=a.x*r.width,ay=a.y*r.height,bx=b.x*r.width,by=b.y*r.height,dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/l2)),x=ax+t*dx,y=ay+t*dy;return Math.hypot(px-x,py-y);
}
function sectionObjectHitDistance(o,np,r){
  if(!o)return Infinity;if(o.kind==='polyline'||o.kind==='polygon'){const pts=o.pts||[];let best=Infinity;for(let i=1;i<pts.length;i++)best=Math.min(best,sectionPointSegmentDistancePx(np,pts[i-1],pts[i],r));if(o.kind==='polygon'&&pts.length>2){best=Math.min(best,sectionPointSegmentDistancePx(np,pts.at(-1),pts[0],r));const pp={x:np.x*r.width,y:np.y*r.height},poly=pts.map(q=>({x:q.x*r.width,y:q.y*r.height}));if(pointInPoly(pp,poly))best=0;}return best;}
  if(o.a&&o.b){if(o.kind==='rockSymbol'){const cx=o.a.x*r.width,cy=o.a.y*r.height,rad=Math.hypot((o.b.x-o.a.x)*r.width,(o.b.y-o.a.y)*r.height),d=Math.abs(Math.hypot(np.x*r.width-cx,np.y*r.height-cy)-rad);return Math.min(d,Math.hypot(np.x*r.width-cx,np.y*r.height-cy));}return sectionPointSegmentDistancePx(np,o.a,o.b,r);}
  return Infinity;
}
function sectionInkHitDistance(st,np,r){
  if(st?.tool==='eraser')return Infinity;const pts=st?.pts||[];if(!pts.length)return Infinity;if(st.kind==='fill'&&pts.length>2){const pp={x:np.x*r.width,y:np.y*r.height},poly=pts.map(q=>({x:q.x*r.width,y:q.y*r.height}));if(pointInPoly(pp,poly))return 0;}
  let best=Infinity;for(let i=1;i<pts.length;i++)best=Math.min(best,sectionPointSegmentDistancePx(np,pts[i-1],pts[i],r));if(pts.length===1)best=Math.hypot((np.x-pts[0].x)*r.width,(np.y-pts[0].y)*r.height);return best;
}
function sectionProfileEditHitDistance(f,canvas,edit,np){const r=canvas.getBoundingClientRect(),pts=(edit?.pts||[]).filter(q=>Number.isFinite(q.d)&&Number.isFinite(q.z)).map(q=>{const p=sectionXYFromData(f,canvas,q.d,q.z);return p?{x:p.x/r.width,y:p.y/r.height}:null;}).filter(Boolean);let best=Infinity;for(let i=1;i<pts.length;i++)best=Math.min(best,sectionPointSegmentDistancePx(np,pts[i-1],pts[i],r));return best;}
function selectSectionDrawingAt(canvas,np){
  const f=state.features.find(x=>x.id===state.currentSection);if(!f)return null;const r=canvas.getBoundingClientRect(),hits=[];(f.sectionObjects||[]).forEach((o,i)=>hits.push({kind:'object',index:i,d:sectionObjectHitDistance(o,np,r)}));(canvas._inkStore||f.sectionInk||[]).forEach((st,i)=>hits.push({kind:'ink',index:i,d:sectionInkHitDistance(st,np,r)}));if(f.sectionProfile)ensureProfileManualEdits(f.sectionProfile).forEach(ed=>hits.push({kind:'profileEdit',id:ed.id,d:sectionProfileEditHitDistance(f,canvas,ed,np)}));hits.sort((a,b)=>a.d-b.d);const hit=hits[0]?.d<=18?hits[0]:null;canvas._sectionSelection=hit;syncSectionSelectionUi();redrawInkStore(canvas);return hit;
}
function syncSectionSelectionUi(){const c=$('#sectionCanvas'),b=$('#sectionDeleteObject');b?.classList.toggle('hidden',!c?._sectionSelection);if(b)b.disabled=!c?._sectionSelection||!isEditableCampaign();}
function deleteSectionSelectedObject(){
  const c=$('#sectionCanvas'),f=state.features.find(x=>x.id===state.currentSection),sel=c?._sectionSelection;if(!c||!f||!sel||!requireEditable('eliminar l’objecte'))return;
  if(sel.kind==='object'&&f.sectionObjects?.[sel.index])f.sectionObjects.splice(sel.index,1);else if(sel.kind==='ink'){const store=c._inkStore||[];if(store[sel.index])store.splice(sel.index,1);f.sectionInk=cloneAny(store);}else if(sel.kind==='profileEdit'&&f.sectionProfile)deleteProfileManualEdit(f.sectionProfile,sel.id);
  c._sectionSelection=null;persistState();syncSectionSelectionUi();redrawInkStore(c);toast('Objecte eliminat');
}
function drawSectionInkSelection(ctx,r,st,dpr){
  if(!st?.pts?.length)return;ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.strokeStyle='#d76c2d';ctx.lineWidth=3;ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(st.pts[0].x*r.width,st.pts[0].y*r.height);for(let i=1;i<st.pts.length;i++)ctx.lineTo(st.pts[i].x*r.width,st.pts[i].y*r.height);if(st.kind==='fill'&&st.pts.length>2)ctx.closePath();ctx.stroke();ctx.restore();
}
function drawSectionObjects(canvas,ctx,r,dpr){const f=state.features.find(x=>x.id===state.currentSection);if(!f)return;const objs=f.sectionObjects||[],sel=canvas._sectionSelection;objs.forEach((o,i)=>drawSectionStructuredObject(ctx,r,{...o,latest:i===objs.length-1&&(o.kind==='measure'||o.kind==='height')},dpr,sel?.kind==='object'&&sel.index===i,canvas,f));if(canvas._sectionBuilder?.pts?.length){const b=canvas._sectionBuilder,pts=[...b.pts];if(canvas._sectionHover)pts.push(canvas._sectionHover);if(b.tool==='zone'&&pts.length>=1){const end=pts[1]||pts[0];drawSectionStructuredObject(ctx,r,{kind:'zoneLabel',a:pts[0],b:end,zoneClass:b.zoneClass,label:b.zoneLabel,color:b.color,preview:true},dpr,true,canvas,f);}else drawSectionStructuredObject(ctx,r,{kind:b.tool==='polygon'?'polygon':'polyline',pts,geoClass:b.geoClass,color:b.color,preview:true},dpr,true,canvas,f);}if(canvas._sectionObjectActive)drawSectionStructuredObject(ctx,r,canvas._sectionObjectActive,dpr,true,canvas,f);if(canvas._hoverSnap?.np){const q={x:canvas._hoverSnap.np.x*r.width,y:canvas._hoverSnap.np.y*r.height};ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.strokeStyle='#d76c2d';ctx.fillStyle='rgba(255,255,255,.75)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(q.x,q.y,7,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(q.x,q.y,2,0,Math.PI*2);ctx.fillStyle='#d76c2d';ctx.fill();ctx.restore();}}
function syncSectionBuilderButtons(){const c=$('#sectionCanvas'),has=!!c?._sectionBuilder?.pts?.length,isZone=c?._sectionBuilder?.tool==='zone';$('#sectionFinishObject')?.classList.toggle('hidden',!has||isZone);$('#sectionCancelObject')?.classList.toggle('hidden',!has);}
function finishSectionBuilder(){const c=$('#sectionCanvas'),f=state.features.find(x=>x.id===state.currentSection),b=c?._sectionBuilder;if(!c||!f||!b)return;const need=b.tool==='polygon'?3:2;if(b.pts.length<need){toast(b.tool==='polygon'?'Calen almenys 3 punts':'Calen almenys 2 punts');return;}f.sectionObjects=f.sectionObjects||[];if(b.tool==='zone'){f.sectionObjects.push({kind:'zoneLabel',a:cloneAny(b.pts[0]),b:cloneAny(b.pts[1]),zoneClass:b.zoneClass||state.sectionZoneClass||'channel',customLabel:b.zoneClass==='custom'?(state.sectionZoneCustom||''):'',label:b.zoneLabel||sectionZoneLabel(b.zoneClass),color:b.color||state.sectionColor});toast(`${b.zoneLabel||sectionZoneLabel(b.zoneClass)} marcada al perfil`);}else f.sectionObjects.push({kind:b.tool==='polygon'?'polygon':'polyline',pts:cloneAny(b.pts),geoClass:b.tool==='polygon'?b.geoClass:'none',color:b.color||state.sectionColor});c._sectionBuilder=null;c._sectionHover=null;syncSectionBuilderButtons();persistState();redrawInkStore(c);}
function cancelSectionBuilder(){const c=$('#sectionCanvas');if(!c)return;c._sectionBuilder=null;c._sectionHover=null;c._sectionObjectActive=null;syncSectionBuilderButtons();redrawInkStore(c);}
function drawInkRecord(ctx,r,st,dpr=1,preview=false){
  if(!st||!st.pts?.length)return;ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.lineCap='round';ctx.lineJoin='round';const tool=st.tool||'pen';
  if(st.kind==='fill'||tool==='fill'){
    const pts=polygonPixels(st,r);if(pts.length<3){ctx.restore();return;}ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.closePath();ctx.fillStyle=st.color||state.sectionColor||'#c58f45';ctx.globalAlpha=Number.isFinite(+st.opacity)?+st.opacity:.45;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=st.color||'#444';ctx.lineWidth=preview?1.5:1;ctx.setLineDash(preview?[5,4]:[]);ctx.stroke();ctx.setLineDash([]);drawSectionPattern(ctx,pts,st.material||'none',st.color,Number.isFinite(+st.opacity)?+st.opacity:.45);ctx.restore();return;
  }
  const er=tool==='eraser';ctx.globalCompositeOperation=er?'destination-out':'source-over';ctx.strokeStyle=st.color||sectionLegacyColor(tool);let width=2.2;if(tool==='paint')width=14;else if(['sand','pebbles','blocks','rock'].includes(tool))width=10;else if(er)width=24;ctx.lineWidth=width;ctx.globalAlpha=tool==='paint'?.82:1;ctx.beginPath();const pts=st.pts;ctx.moveTo(pts[0].x*r.width,pts[0].y*r.height);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x*r.width,pts[i].y*r.height);ctx.stroke();ctx.restore();
}
function drawInkStroke(c,st,incremental=false){if(!st||st.pts.length<2)return;const ctx=c.getContext('2d'),r=c.getBoundingClientRect(),dpr=c._dpr||1;if(c.id==='sectionCanvas'){redrawInkStore(c);return;}ctx.save();applyDpr(ctx,c);ctx.lineCap='round';ctx.lineJoin='round';const er=st.tool==='eraser';ctx.globalCompositeOperation=er?'destination-out':'source-over';ctx.strokeStyle=st.color||sectionLegacyColor(st.tool);ctx.lineWidth=er?20:(st.tool==='black'||st.tool==='pen'?2.2:10);ctx.beginPath();const pts=st.pts,start=incremental?Math.max(0,pts.length-3):0;ctx.moveTo(pts[start].x*r.width,pts[start].y*r.height);for(let i=start+1;i<pts.length;i++)ctx.lineTo(pts[i].x*r.width,pts[i].y*r.height);ctx.stroke();ctx.restore();}
function redrawInkStore(c){
  if(!c||!c.width)return;const ctx=c.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,c.width,c.height);
  if(c.id==='sectionCanvas'){
    const f=state.features.find(x=>x.id===state.currentSection),tmp=c._active?.profile&&f?profileStrokeToData(f,c,c._active.pts):null;drawSectionBase(c,tmp);const layer=c._userLayer||(c._userLayer=document.createElement('canvas'));if(layer.width!==c.width||layer.height!==c.height){layer.width=c.width;layer.height=c.height;}const lctx=layer.getContext('2d');lctx.setTransform(1,0,0,1,0,0);lctx.clearRect(0,0,layer.width,layer.height);const r=c.getBoundingClientRect(),dpr=c._dpr||1;(c._inkStore||[]).forEach(st=>drawInkRecord(lctx,r,st,dpr,false));if(c._active&&!c._active.profile)drawInkRecord(lctx,r,c._active,dpr,true);drawSectionObjects(c,lctx,r,dpr);if(c._sectionSelection?.kind==='ink'){const st=(c._inkStore||[])[c._sectionSelection.index];if(st)drawSectionInkSelection(lctx,r,st,dpr);}ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(layer,0,0);return;
  }
  (c._inkStore||[]).forEach(st=>drawInkStroke(c,st,false));
}

function parseWorldFile(text){const v=text.trim().split(/\s+/).map(Number);if(v.length<6||v.some(n=>!Number.isFinite(n)))throw Error('World file inválido');return{A:v[0],D:v[1],B:v[2],E:v[3],C:v[4],F:v[5]};}
function dummyAffine(img){return{A:1,D:0,B:0,E:-1,C:0,F:img.height};}
function rasterCorners(r){const a=r.affine,w=r.image.width,h=r.image.height;return[[0,0],[w,0],[w,h],[0,h]].map(([x,y])=>({x:a.A*x+a.B*y+a.C,y:a.D*x+a.E*y+a.F}));}

// ---------- Capes vectorials de referència (SHP) · v0.16.8 ----------
function projectCrsEpsg(){const m=String(state.project?.crs||'EPSG:25831').match(/(\d{4,6})/);return m?+m[1]:25831;}
function projectCrsDisplayName(){const epsg=projectCrsEpsg();if(epsg>=25801&&epsg<=25860)return `ETRS89 UTM ${epsg-25800}N`;if(epsg>=32601&&epsg<=32660)return `WGS84 UTM ${epsg-32600}N`;if(epsg>=32701&&epsg<=32760)return `WGS84 UTM ${epsg-32700}S`;return `EPSG:${epsg}`;}
function supportedGpsEpsg(epsg){return epsg===4326||epsg===4258||(epsg>=25801&&epsg<=25860)||(epsg>=32601&&epsg<=32660)||(epsg>=32701&&epsg<=32760);}
function workingMapEpsg(){
  // El GPS ha d'entrar al mateix espai de coordenades que els rasters que es veuen.
  // Això també repara projectes antics creats com 25831 però que en realitat contenen
  // cartografia 25830, una combinació possible abans que el selector permetés zona 30.
  const unique=rs=>[...new Set((rs||[]).map(r=>+r?.meta?.epsg).filter(supportedGpsEpsg))];
  const dem=unique(demGroupRasters(activeDemGroup(),{visibleOnly:true}));if(dem.length===1)return dem[0];
  const visible=unique((state.rasters||[]).filter(r=>r.visible&&r.georef));if(visible.length===1)return visible[0];
  const all=unique((state.rasters||[]).filter(r=>r.georef));if(all.length===1)return all[0];
  return projectCrsEpsg();
}
function utmZoneForEpsg(epsg){if(epsg>=25801&&epsg<=25860)return epsg-25800;if(epsg>=32601&&epsg<=32660)return epsg-32600;if(epsg>=32701&&epsg<=32760)return epsg-32700;return null;}
function lonLatToUtmZone(lon,lat,zone,south=false){
  const a=6378137,f=1/298.257223563,k0=.9996,e2=f*(2-f),ep2=e2/(1-e2),rad=Math.PI/180,phi=lat*rad,lam=lon*rad,lam0=((zone-1)*6-180+3)*rad,N=a/Math.sqrt(1-e2*Math.sin(phi)**2),T=Math.tan(phi)**2,C=ep2*Math.cos(phi)**2,A=Math.cos(phi)*(lam-lam0),M=a*((1-e2/4-3*e2**2/64-5*e2**3/256)*phi-(3*e2/8+3*e2**2/32+45*e2**3/1024)*Math.sin(2*phi)+(15*e2**2/256+45*e2**3/1024)*Math.sin(4*phi)-(35*e2**3/3072)*Math.sin(6*phi));
  const x=k0*N*(A+(1-T+C)*A**3/6+(5-18*T+T*T+72*C-58*ep2)*A**5/120)+500000;let y=k0*(M+N*Math.tan(phi)*(A*A/2+(5-T+9*C+4*C*C)*A**4/24+(61-58*T+T*T+600*C-330*ep2)*A**6/720));if(south||lat<0)y+=10000000;return{x,y};
}
function lonLatToMapCoords(lon,lat,epsg=workingMapEpsg()){
  epsg=+epsg||25831;if(epsg===4326||epsg===4258)return{x:+lon,y:+lat,epsg};const zone=utmZoneForEpsg(epsg);if(zone)return{...lonLatToUtmZone(+lon,+lat,zone,epsg>=32701&&epsg<=32760),epsg};return{...lonLatToUtmZone(+lon,+lat,31,false),epsg:25831};
}
function isDemRaster(r){return !!(r&&r.meta?.sourceType==='geotiff'&&r.meta?.kind==='dem'&&r.georef&&r.image);}
function normalizeDemGroups(){
  const ids=new Set(state.rasters.filter(isDemRaster).map(r=>r.id));
  state.demGroups=(state.demGroups||[]).map(g=>({...g,rasterIds:(g.rasterIds||[]).filter(id=>ids.has(id))})).filter(g=>g.rasterIds.length);
  if(state.activeDemGroupId&&!state.demGroups.some(g=>g.id===state.activeDemGroupId))state.activeDemGroupId=null;
}
function activeDemGroup(){normalizeDemGroups();return state.demGroups.find(g=>g.id===state.activeDemGroupId)||null;}
function demGroupRasters(group=activeDemGroup(),{visibleOnly=false}={}){
  normalizeDemGroups();
  if(group){const set=new Set(group.rasterIds||[]);return state.rasters.filter(r=>set.has(r.id)&&isDemRaster(r)&&(!visibleOnly||r.visible));}
  let rs=state.rasters.filter(r=>isDemRaster(r)&&(!visibleOnly||r.visible));
  if(!rs.length&&visibleOnly)rs=state.rasters.filter(isDemRaster);
  return rs;
}
function demWorkingBounds({visibleOnly=false}={}){const rs=demGroupRasters(activeDemGroup(),{visibleOnly});return rs.length?combineBounds(rs.map(rasterBounds)):null;}
function demWorkingPolygons(){return demGroupRasters().map(r=>rasterCorners(r));}
function demGroupLabel(){const g=activeDemGroup();return g?g.name||'Mosaic DEM':(demGroupRasters().length>1?'DEMs visibles':'DEM');}
function demGroupResolution(group=activeDemGroup()){const vals=demGroupRasters(group).map(sourceResolution).filter(Number.isFinite);return vals.length?Math.min(...vals):null;}
function rasterContainsWorldPoint(r,p){const b=rasterBounds(r);return pointInBounds(p,b);}
function chooseBestDemForPoint(p){return demGroupRasters().filter(r=>rasterContainsWorldPoint(r,p)).sort((a,b)=>(sourceResolution(a)||Infinity)-(sourceResolution(b)||Infinity))[0]||null;}
async function ensureDemRasterSampler(r){if(!r?.sourceBlob)return false;r._bufferPromise=r._bufferPromise||r.sourceBlob.arrayBuffer();const ab=await r._bufferPromise;r._tiffMeta=r._tiffMeta||GeoCauceGeoTIFF.parse(ab);return true;}
async function sampleDemMosaic(worldPoints,{onProgress=null}={}){
  const vals=new Array((worldPoints||[]).length).fill(null),groups=new Map(),rasters=demGroupRasters(),ranked=demGroupRasters().map(r=>({r,b:rasterBounds(r),res:sourceResolution(r)||Infinity})).sort((a,b)=>a.res-b.res);
  if(!rasters.length)return{values:vals,sourceName:'',resolution:null,rasterIds:[]};
  for(let i=0;i<worldPoints.length;i++){const p=worldPoints[i],r=ranked.find(x=>pointInBounds(p,x.b))?.r;if(!r)continue;if(!groups.has(r.id))groups.set(r.id,{r,idx:[],pix:[]});const g=groups.get(r.id),aff=r.meta?.sourceAffine||r.affine,q=invertAffinePoint(aff,p);if(!q)continue;g.idx.push(i);g.pix.push(q);}
  let done=0,total=[...groups.values()].reduce((n,g)=>n+g.idx.length,0)||1;
  for(const g of groups.values()){await ensureDemRasterSampler(g.r);const out=await GeoCauceGeoTIFF.samplePoints(g.r._tiffMeta,g.pix,{});for(let j=0;j<g.idx.length;j++)vals[g.idx[j]]=Number.isFinite(out[j])?out[j]:null;done+=g.idx.length;if(onProgress)onProgress(Math.min(1,done/total));}
  const group=activeDemGroup(),used=[...groups.values()].map(g=>g.r);return{values:vals,sourceName:group?`${group.name||'Mosaic DEM'} · ${used.length} DEM`:(used.length>1?`${used.length} DEM`:used[0]?.name||''),resolution:used.length?Math.min(...used.map(r=>sourceResolution(r)||Infinity)):null,rasterIds:used.map(r=>r.id)};
}
function projectRasterBounds({visibleOnly=false}={}){
  const dem=demWorkingBounds({visibleOnly});if(dem)return dem;
  let rs=state.rasters.filter(r=>r.georef&&r.image&&(!visibleOnly||r.visible));
  if(!rs.length&&visibleOnly)rs=state.rasters.filter(r=>r.georef&&r.image);
  return rs.length?combineBounds(rs.map(rasterBounds)):null;
}
function boundsIntersect(a,b){return !!a&&!!b&&a.minX<=b.maxX&&a.maxX>=b.minX&&a.minY<=b.maxY&&a.maxY>=b.minY;}
function pointsBounds(paths){const pts=(paths||[]).flat();if(!pts.length)return null;let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(const p of pts){if(!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}return Number.isFinite(minX)?{minX,maxX,minY,maxY}:null;}
function parsePrjEpsg(txt=''){
  const s=String(txt||'');let m=s.match(/(?:AUTHORITY|ID)\s*\[\s*["']EPSG["']\s*,\s*["']?(\d{4,6})/i);if(m)return +m[1];
  if(/ETRS(?:[_ ]?(?:1989|89)).*UTM.*30|ETRS89\s*\/\s*UTM zone 30N/i.test(s))return 25830;
  if(/ETRS(?:[_ ]?(?:1989|89)).*UTM.*31|ETRS89\s*\/\s*UTM zone 31N/i.test(s))return 25831;
  if(/WGS[_ ]?84.*UTM.*30|WGS 84 \/ UTM zone 30N/i.test(s))return 32630;
  if(/WGS[_ ]?84.*UTM.*31|WGS 84 \/ UTM zone 31N/i.test(s))return 32631;
  if(/WGS[_ ]?84|WGS 84/i.test(s)&&/(GEOGCS|GEOGCRS)/i.test(s))return 4326;
  if(/ETRS[_ ]?89/i.test(s)&&/(GEOGCS|GEOGCRS)/i.test(s))return 4258;
  return null;
}
function lonLatToUtm31(lon,lat){return lonLatToUtmZone(lon,lat,31,false);}
function transformVectorPoint(p,src,dst){
  if(!src||src===dst)return{x:p.x,y:p.y};
  if((src===4326||src===4258)&&supportedGpsEpsg(dst)){const q=lonLatToMapCoords(p.x,p.y,dst);return{x:q.x,y:q.y};}
  if((src===32630&&dst===25830)||(src===32631&&dst===25831))return{x:p.x,y:p.y};
  throw Error(`CRS SHP EPSG:${src} no compatible automàticament amb EPSG:${dst}`);
}
function parseShpBuffer(ab){
  const dv=new DataView(ab);if(dv.byteLength<100||dv.getInt32(0,false)!==9994)throw Error('Capçalera SHP no vàlida');const out=[];let off=100,idx=0;
  while(off+12<=dv.byteLength){const recNo=dv.getInt32(off,false),len=dv.getInt32(off+4,false)*2,start=off+8,end=Math.min(dv.byteLength,start+len);if(start+4>end)break;const type=dv.getInt32(start,true);let paths=[];
    if(type===0){/* null */}
    else if(type===1||type===11){if(start+20<=end)paths=[[{x:dv.getFloat64(start+4,true),y:dv.getFloat64(start+12,true)}]];}
    else if([3,5,13,15].includes(type)){
      if(start+44<=end){const nParts=dv.getInt32(start+36,true),nPoints=dv.getInt32(start+40,true),parts=[];for(let i=0;i<nParts;i++)parts.push(dv.getInt32(start+44+i*4,true));const po=start+44+nParts*4,pts=[];for(let i=0;i<nPoints&&po+i*16+16<=end;i++)pts.push({x:dv.getFloat64(po+i*16,true),y:dv.getFloat64(po+i*16+8,true)});for(let i=0;i<parts.length;i++){const a=parts[i],b=i+1<parts.length?parts[i+1]:pts.length;if(b>a)paths.push(pts.slice(a,b));}}
    }else if(type===8||type===18){if(start+40<=end){const n=dv.getInt32(start+36,true),pts=[];for(let i=0;i<n;i++){const q=start+40+i*16;if(q+16<=end)pts.push({x:dv.getFloat64(q,true),y:dv.getFloat64(q+8,true)});}paths=pts.map(p=>[p]);}}
    if(paths.length)out.push({recordIndex:idx,recordNo:recNo,shapeType:type,paths});idx++;off=end;
  }return out;
}
function dbfDecoder(label){try{return new TextDecoder(label||'windows-1252');}catch{return new TextDecoder('windows-1252');}}
function parseDbfBuffer(ab,cpg=''){const dv=new DataView(ab);if(dv.byteLength<32)return[];const count=dv.getUint32(4,true),headerLen=dv.getUint16(8,true),recordLen=dv.getUint16(10,true),fields=[];let o=32;while(o+32<=headerLen&&dv.getUint8(o)!==0x0D){let name='';for(let i=0;i<11&&dv.getUint8(o+i);i++)name+=String.fromCharCode(dv.getUint8(o+i));fields.push({name:name.trim(),type:String.fromCharCode(dv.getUint8(o+11)),len:dv.getUint8(o+16),dec:dv.getUint8(o+17)});o+=32;}let label=/65001|utf-?8/i.test(cpg)?'utf-8':/1252|ansi/i.test(cpg)?'windows-1252':'windows-1252',dec=dbfDecoder(label),rows=[];for(let r=0;r<count;r++){const base=headerLen+r*recordLen;if(base+recordLen>dv.byteLength)break;if(dv.getUint8(base)===0x2A){rows.push({});continue;}let pos=base+1,obj={};for(const f of fields){const raw=new Uint8Array(ab,pos,f.len),txt=dec.decode(raw).replace(/\0/g,'').trim();pos+=f.len;if(!txt){obj[f.name]='';continue;}if(['N','F'].includes(f.type)){const n=Number(txt);obj[f.name]=Number.isFinite(n)?n:txt;}else if(f.type==='L')obj[f.name]=/^[YTS1]/i.test(txt);else obj[f.name]=txt;}rows.push(obj);}return rows;}
function vectorFeatureLabel(attrs={}){const keys=Object.keys(attrs),pref=keys.find(k=>/^(nom|nombre|name|label|codi|codigo|code|id)/i.test(k));return pref?String(attrs[pref]??''):'';}

// ZIP SHP support. Android file pickers are much more reliable when a complete
// shapefile is delivered as one .zip instead of asking the user to multi-select
// .shp/.dbf/.shx/.prj separately. We read the ZIP central directory here and
// inflate only the shapefile companion files that we need. Nested folders are
// supported (for example "Nueva carpeta/Conques_Hidro.shp").
function zipLeafName(path=''){return String(path).replace(/\\/g,'/').split('/').filter(Boolean).pop()||'';}
function zipStemPath(path=''){const p=String(path).replace(/\\/g,'/');return p.replace(/\.[^./]+$/,'');}
function zipExtension(path=''){const m=String(path).match(/(\.[^./]+)$/);return m?m[1].toLowerCase():'';}
function readZipCentralDirectory(ab){
  const dv=new DataView(ab);let eocd=-1;const min=Math.max(0,dv.byteLength-65557);
  for(let i=dv.byteLength-22;i>=min;i--){if(dv.getUint32(i,true)===0x06054b50){eocd=i;break;}}
  if(eocd<0)throw Error('ZIP no vàlid: no trobo el directori central');
  const count=dv.getUint16(eocd+10,true),cdOffset=dv.getUint32(eocd+16,true);
  if(count===0xffff||cdOffset===0xffffffff)throw Error('Aquest ZIP utilitza ZIP64, que encara no està suportat');
  const utf8=new TextDecoder('utf-8'),ansi=dbfDecoder('windows-1252'),entries=[];let o=cdOffset;
  for(let i=0;i<count;i++){
    if(o+46>dv.byteLength||dv.getUint32(o,true)!==0x02014b50)throw Error('Directori ZIP corrupte');
    const flags=dv.getUint16(o+8,true),method=dv.getUint16(o+10,true),compressedSize=dv.getUint32(o+20,true),uncompressedSize=dv.getUint32(o+24,true),nameLen=dv.getUint16(o+28,true),extraLen=dv.getUint16(o+30,true),commentLen=dv.getUint16(o+32,true),localOffset=dv.getUint32(o+42,true);
    if(compressedSize===0xffffffff||uncompressedSize===0xffffffff||localOffset===0xffffffff)throw Error('Aquest ZIP utilitza ZIP64, que encara no està suportat');
    const rawName=new Uint8Array(ab,o+46,nameLen),name=((flags&0x800)?utf8:ansi).decode(rawName).replace(/\\/g,'/');
    entries.push({name,flags,method,compressedSize,uncompressedSize,localOffset,isDirectory:name.endsWith('/')});
    o+=46+nameLen+extraLen+commentLen;
  }
  return entries;
}
async function extractZipEntry(ab,entry){
  const dv=new DataView(ab),o=entry.localOffset;if(o+30>dv.byteLength||dv.getUint32(o,true)!==0x04034b50)throw Error(`Entrada ZIP no vàlida: ${entry.name}`);
  if(entry.flags&1)throw Error(`El ZIP està xifrat: ${entry.name}`);
  const nameLen=dv.getUint16(o+26,true),extraLen=dv.getUint16(o+28,true),start=o+30+nameLen+extraLen,end=start+entry.compressedSize;if(end>dv.byteLength)throw Error(`Entrada ZIP incompleta: ${entry.name}`);
  const packed=new Uint8Array(ab,start,entry.compressedSize);let out;
  if(entry.method===0)out=packed.slice().buffer;
  else if(entry.method===8){
    if(typeof DecompressionStream!=='function')throw Error('El WebView no permet descomprimir ZIP. Actualitza Android System WebView.');
    const stream=new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));out=await new Response(stream).arrayBuffer();
  }else throw Error(`Compressió ZIP no suportada (${entry.method}) a ${entry.name}`);
  if(entry.uncompressedSize&&out.byteLength!==entry.uncompressedSize)console.warn('ZIP size mismatch',entry.name,out.byteLength,entry.uncompressedSize);
  return out;
}
async function shapefilePackagesFromZip(file){
  const ab=await file.arrayBuffer(),entries=readZipCentralDirectory(ab),allowed=new Set(['.shp','.shx','.dbf','.prj','.cpg','.qmd']),groups=new Map();
  for(const e of entries){if(e.isDirectory)continue;const ext=zipExtension(e.name);if(!allowed.has(ext))continue;const key=zipStemPath(e.name).toLowerCase();if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}
  const packages=[];
  for(const es of groups.values()){if(!es.some(e=>zipExtension(e.name)==='.shp'))continue;const files=[];for(const e of es){const data=await extractZipEntry(ab,e),name=zipLeafName(e.name);files.push(new File([data],name,{type:'application/octet-stream',lastModified:file.lastModified||Date.now()}));}packages.push(files);}
  if(!packages.length)throw Error('El ZIP no conté cap paquet SHP (.shp + fitxers auxiliars)');
  return packages;
}
async function importVectorComponentFiles(files,{sourceZip='',color=null,role='reference',customRole='',displayName=''}={}){
  const byName=new Map(files.map(f=>[f.name.toLowerCase(),f])),shps=files.filter(f=>/\.shp$/i.test(f.name));if(!shps.length)return 0;
  const projectBounds=projectRasterBounds();let imported=0;
  for(const shp of shps){try{const base=shp.name.replace(/\.shp$/i,''),find=ext=>byName.get((base+ext).toLowerCase()),prj=find('.prj'),dbf=find('.dbf'),cpg=find('.cpg');const prjText=prj?await prj.text():'',srcEpsg=parsePrjEpsg(prjText)||projectCrsEpsg(),dstEpsg=projectCrsEpsg(),cpgText=cpg?await cpg.text():'',attrs=dbf?parseDbfBuffer(await dbf.arrayBuffer(),cpgText):[],records=parseShpBuffer(await shp.arrayBuffer()),features=[];
      for(const rec of records){let paths=[];for(const path of rec.paths){const t=[];for(const q of path)t.push(transformVectorPoint(q,srcEpsg,dstEpsg));if(t.length)paths.push(t);}const bounds=pointsBounds(paths);if(!bounds)continue;if(projectBounds&&!boundsIntersect(bounds,projectBounds))continue;features.push({paths,shapeType:rec.shapeType,attrs:attrs[rec.recordIndex]||{},label:vectorFeatureLabel(attrs[rec.recordIndex]||{}),bounds});}
      const shapeTypes=[...new Set(records.map(r=>+r.shapeType).filter(Boolean))],geometryType=shapeTypes.some(t=>[5,15].includes(t))?'polygon':shapeTypes.some(t=>[1,8,11,18].includes(t))&&!shapeTypes.some(t=>[3,5,13,15].includes(t))?'point':'line';
      const layerName=(displayName||'').trim()||base;const baseColor=normalizeVectorColor(color||appSettings.vectorImportColor),layer={id:'v'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:layerName,sourceName:base,role:role||'reference',customRole:(customRole||'').trim(),sourceType:'shapefile',sourcePackage:sourceZip||'',sourceEpsg:srcEpsg,projectEpsg:dstEpsg,geometryType,visible:true,opacity:.85,color:baseColor,strokeWidth:2.5,vectorStyle:{kind:geometryType,strokeColor:baseColor,strokeWidth:2.5,strokeUnit:'px',strokeOpacity:1,strokeDash:'dash',strokeOffset:0,offsetUnit:'px',lineCap:'round',lineJoin:'round',fillColor:baseColor,fillStyle:'none',fillOpacity:0,pointColor:baseColor,pointOpacity:1,pointSize:6,pointUnit:'px',pointShape:'circle'},features,importedAt:Date.now(),clippedToRasterExtent:!!projectBounds};await replaceReferenceLayerInState(layer);await optimizeImportedReferenceLayer(layer);imported++;toast(`${layerName}: ${features.length} geometries importades${layer.lightMode?' · mapa lleuger':''}`,4200);
    }catch(e){console.error('Import SHP',e);toast(`No puc importar ${shp.name}: ${e.message||e}`,7500);}}
  return imported;
}
async function importVectorFiles(fileList){
  const files=[...fileList||[]];if(!files.length)return;const zipFiles=files.filter(f=>/\.zip$/i.test(f.name)),direct=files.filter(f=>!/\.zip$/i.test(f.name));
  const directHasShp=direct.some(f=>/\.shp$/i.test(f.name));if(!projectRasterBounds())toast('Consell: importa primer els mapes. Així GeoCauce només conserva del SHP la zona real del projecte.',6500);
  const importColor=normalizeVectorColor($('#vectorImportColor')?.value||appSettings.vectorImportColor),role=$('#vectorImportRole')?.value||'reference',customRole=($('#vectorImportCustomRole')?.value||'').trim(),displayName=($('#vectorImportName')?.value||'').trim();appSettings.vectorImportColor=importColor;saveAppSettings();
  let imported=0,foundPackage=directHasShp||zipFiles.length>0;
  if(directHasShp)imported+=await importVectorComponentFiles(direct,{color:importColor,role,customRole,displayName});
  for(const zip of zipFiles){try{toast(`Obrint ${zip.name}…`,2400);const packs=await shapefilePackagesFromZip(zip);for(let i=0;i<packs.length;i++){const pack=packs[i],packName=packs.length>1&&displayName?`${displayName} · ${i+1}`:displayName;imported+=await importVectorComponentFiles(pack,{sourceZip:zip.name,color:importColor,role,customRole,displayName:packName});}}
    catch(e){console.error('Import ZIP SHP',e);toast(`No puc importar ${zip.name}: ${e.message||e}`,8500);}}
  if(!foundPackage){toast('Selecciona un .zip amb el SHP o bé els fitxers .shp + .dbf + .prj',6000);return;}
  if(imported){persistState();renderLayers();drawAll();}
}
function normalizeVectorColor(color){const c=String(color||'').trim();return /^#[0-9a-f]{6}$/i.test(c)?c.toLowerCase():'#6b5d82';}
function normalizeVectorStrokeWidth(v){const n=Number(v);return Number.isFinite(n)?Math.max(.1,Math.min(40,n)):2.5;}

// ---------- Capes SHP optimitzades (v0.16.30) ----------
// La geometria completa es desa a IndexedDB. L'estat del projecte només conserva
// metadades lleugeres, i una capa apagada allibera tant la geometria com el bitmap.
function referenceLayerBounds(layer){
  if(layer?.fullBounds&&Number.isFinite(layer.fullBounds.minX))return layer.fullBounds;
  let b=null;for(const f of layer?.features||[]){const q=f.bounds||pointsBounds(f.paths||[]);if(!q)continue;b=b?{minX:Math.min(b.minX,q.minX),maxX:Math.max(b.maxX,q.maxX),minY:Math.min(b.minY,q.minY),maxY:Math.max(b.maxY,q.maxY)}:{...q};}
  if(b)layer.fullBounds=b;return b;
}
function referenceLayerPointCount(layer){let n=0;for(const f of layer?.features||[])for(const path of f.paths||[])n+=path.length;return n;}
function referenceLayerStateRecord(layer){
  if(!layer)return layer;const x={...layer};
  x.featureCount=Number.isFinite(+layer.featureCount)?+layer.featureCount:(layer.features||[]).length;
  x.pointCount=Number.isFinite(+layer.pointCount)?+layer.pointCount:referenceLayerPointCount(layer);
  x.fullBounds=layer.fullBounds||referenceLayerBounds(layer)||null;
  x.features=[];x.featuresLoaded=false;
  delete x._renderImage;delete x._renderLoading;delete x._loadingFeatures;delete x._routeGraph;delete x.renderBlob;
  return x;
}
function referenceLayerDbRecord(layer,previous=null){
  const x={...(previous||{}),...referenceLayerStateRecord(layer)};
  if(Array.isArray(layer?.features)&&layer.features.length)x.features=cloneAny(layer.features);
  else if(Array.isArray(previous?.features))x.features=previous.features;
  x.featureCount=Number.isFinite(+layer?.featureCount)?+layer.featureCount:(x.features||[]).length;
  x.pointCount=Number.isFinite(+layer?.pointCount)?+layer.pointCount:referenceLayerPointCount({features:x.features||[]});
  x.fullBounds=layer?.fullBounds||referenceLayerBounds({features:x.features||[]})||previous?.fullBounds||null;
  if(layer?.renderBlob instanceof Blob)x.renderBlob=layer.renderBlob;else if(previous?.renderBlob instanceof Blob)x.renderBlob=previous.renderBlob;
  return x;
}
async function persistReferenceLayerRecord(layer){
  if(!layer?.id)return;let prev=null;try{prev=await dbGet('vectorLayers',layer.id);}catch{}
  const rec=referenceLayerDbRecord(layer,prev);await dbPut('vectorLayers',rec);
  layer.featureCount=rec.featureCount;layer.pointCount=rec.pointCount;layer.fullBounds=rec.fullBounds;
}
function releaseReferenceLayerMemory(layer,{geometry=true,render=true}={}){
  if(!layer)return;if(render&&layer._renderImage){try{layer._renderImage.close?.();}catch{}delete layer._renderImage;}
  if(geometry){layer.features=[];layer.featuresLoaded=false;delete layer._routeGraph;}
}
async function ensureReferenceLayerFeatures(layer){
  if(!layer)return false;if(Array.isArray(layer.features)&&layer.features.length){layer.featuresLoaded=true;return true;}
  if(layer._loadingFeatures)return layer._loadingFeatures;
  layer._loadingFeatures=(async()=>{try{const rec=await dbGet('vectorLayers',layer.id);if(!rec?.features?.length)return false;layer.features=rec.features;layer.featuresLoaded=true;layer.featureCount=rec.featureCount||rec.features.length;layer.pointCount=rec.pointCount||referenceLayerPointCount(layer);layer.fullBounds=rec.fullBounds||referenceLayerBounds(layer);return true;}catch(e){console.warn('SHP load',e);return false;}finally{delete layer._loadingFeatures;}})();
  return layer._loadingFeatures;
}
function vectorLightAuto(layer){return (layer?.featureCount||0)>=1200||(layer?.pointCount||0)>=75000;}
function vectorRenderSignature(layer){const st=vectorStyleDefault(layer);return JSON.stringify({st,opacity:1,kind:st.kind,featureCount:layer.featureCount||0});}
function vectorRenderDimensions(bounds,maxSide=4096){const W=Math.max(1e-9,bounds.maxX-bounds.minX),H=Math.max(1e-9,bounds.maxY-bounds.minY),ratio=W/H;let w,h;if(ratio>=1){w=maxSide;h=Math.max(256,Math.round(maxSide/ratio));}else{h=maxSide;w=Math.max(256,Math.round(maxSide*ratio));}return{w:Math.min(4096,w),h:Math.min(4096,h)};}
function drawReferenceFeaturesToContext(ctx,layer,project,{scaleStroke=1}={}){
  const st=vectorStyleDefault(layer),kind=st.kind,layerOpacity=1;
  for(const f of layer.features||[]){
    if(kind==='polygon'){
      const rings=(f.paths||[]).filter(p=>p.length>2).map(path=>path.map(project)).filter(p=>p.length>2);
      if(rings.length&&st.fillStyle!=='none'&&st.fillOpacity>0){ctx.save();ctx.globalAlpha=layerOpacity*st.fillOpacity;ctx.fillStyle=vectorFillPattern(ctx,st);ctx.beginPath();for(const pts of rings){ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.closePath();}try{ctx.fill('evenodd');}catch{ctx.fill();}ctx.restore();}
      ctx.save();ctx.globalAlpha=layerOpacity*st.strokeOpacity;ctx.strokeStyle=st.strokeColor;ctx.lineWidth=Math.max(.6,vectorStyleStrokeWidthPx(st)*scaleStroke);ctx.lineCap=st.lineCap;ctx.lineJoin=st.lineJoin;ctx.setLineDash((VECTOR_DASHES[st.strokeDash]||[]).map(v=>v*scaleStroke));for(const ring of rings){beginCanvasPath(ctx,offsetPolylineScreen(ring,vectorStyleOffsetPx(st)*scaleStroke,true),true);ctx.stroke();}ctx.restore();continue;
    }
    for(const path of f.paths||[]){if(!path.length)continue;if(path.length===1||kind==='point'){for(const p of path){const q=project(p),pst={...st,pointSize:vectorStylePointSizePx(st)*scaleStroke,pointUnit:'px',strokeWidth:vectorStyleStrokeWidthPx(st)*scaleStroke,strokeUnit:'px'};drawVectorPointSymbol(ctx,q,pst,layerOpacity);}continue;}const base=path.map(project);if(base.length<2)continue;ctx.save();ctx.globalAlpha=layerOpacity*st.strokeOpacity;ctx.strokeStyle=st.strokeColor;ctx.lineWidth=Math.max(.6,vectorStyleStrokeWidthPx(st)*scaleStroke);ctx.lineCap=st.lineCap;ctx.lineJoin=st.lineJoin;ctx.setLineDash((VECTOR_DASHES[st.strokeDash]||[]).map(v=>v*scaleStroke));beginCanvasPath(ctx,offsetPolylineScreen(base,vectorStyleOffsetPx(st)*scaleStroke,false),false);ctx.stroke();ctx.restore();}
  }
}
async function buildReferenceLayerRenderCache(layer,{quiet=false}={}){
  if(!layer?.id)return false;const ok=await ensureReferenceLayerFeatures(layer);if(!ok)return false;const b=referenceLayerBounds(layer);if(!b)return false;
  if(!quiet)toast(`Generant mapa transparent · ${layer.name}`,2200);
  await new Promise(r=>setTimeout(r,0));const {w,h}=vectorRenderDimensions(b),pad=8,c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d',{alpha:true});g.clearRect(0,0,w,h);const sx=(w-pad*2)/Math.max(1e-9,b.maxX-b.minX),sy=(h-pad*2)/Math.max(1e-9,b.maxY-b.minY),sc=Math.min(sx,sy),dw=(b.maxX-b.minX)*sc,dh=(b.maxY-b.minY)*sc,ox=(w-dw)/2,oy=(h-dh)/2;
  const project=p=>({x:ox+(p.x-b.minX)*sc,y:oy+(b.maxY-p.y)*sc});drawReferenceFeaturesToContext(g,layer,project,{scaleStroke:1});
  const blob=await new Promise((res,rej)=>c.toBlob(x=>x?res(x):rej(Error('No s’ha pogut crear el mapa transparent')),'image/png'));
  const cacheBounds={minX:b.minX-ox/sc,maxX:b.minX+(w-ox)/sc,minY:b.maxY-(h-oy)/sc,maxY:b.maxY+oy/sc};layer.renderBlob=blob;layer.renderCache={bounds:cacheBounds,width:w,height:h,inner:{ox,oy,scale:sc},sourceBounds:{...b},createdAt:Date.now(),signature:vectorRenderSignature(layer)};layer.lightMode=true;
  await persistReferenceLayerRecord(layer);if(layer._renderImage){try{layer._renderImage.close?.();}catch{}}layer._renderImage=await createImageBitmap(blob);delete layer.renderBlob;if(!quiet)toast(`Mapa lleuger creat · ${formatBytes(blob.size)}`);return true;
}
async function ensureReferenceLayerRender(layer){
  if(!layer?.lightMode)return false;if(layer._renderImage)return true;if(layer._renderLoading)return layer._renderLoading;
  layer._renderLoading=(async()=>{try{const rec=await dbGet('vectorLayers',layer.id);if(rec?.renderBlob&&rec?.renderCache?.signature===vectorRenderSignature(layer)){layer.renderCache=rec.renderCache;layer._renderImage=await createImageBitmap(rec.renderBlob);return true;}return await buildReferenceLayerRenderCache(layer,{quiet:true});}catch(e){console.warn('SHP render cache',e);return false;}finally{delete layer._renderLoading;}})();return layer._renderLoading;
}
async function setReferenceLayerVisible(layer,on){
  if(!layer)return;layer.visible=!!on;if(!layer.visible){await persistReferenceLayerRecord(layer);releaseReferenceLayerMemory(layer,{geometry:true,render:true});persistState();renderLayers();drawAll();return;}
  if(layer.lightMode){await ensureReferenceLayerRender(layer);releaseReferenceLayerMemory(layer,{geometry:true,render:false});}else await ensureReferenceLayerFeatures(layer);persistState();renderLayers();drawAll();
}
async function setReferenceLayerLightMode(layer,on){
  if(!layer)return;if(on){layer.lightMode=true;await buildReferenceLayerRenderCache(layer);releaseReferenceLayerMemory(layer,{geometry:true,render:!layer.visible});}else{layer.lightMode=false;if(layer._renderImage){try{layer._renderImage.close?.();}catch{}delete layer._renderImage;}if(layer.visible)await ensureReferenceLayerFeatures(layer);await persistReferenceLayerRecord(layer);if(!layer.visible)releaseReferenceLayerMemory(layer,{geometry:true,render:true});}persistState();renderLayers();drawAll();
}
async function invalidateReferenceLayerRender(layer,{regenerate=true}={}){
  if(!layer)return;const rec=await dbGet('vectorLayers',layer.id).catch(()=>null);if(rec){delete rec.renderBlob;delete rec.renderCache;await dbPut('vectorLayers',rec);}delete layer.renderCache;if(layer._renderImage){try{layer._renderImage.close?.();}catch{}delete layer._renderImage;}if(regenerate&&layer.lightMode)await buildReferenceLayerRenderCache(layer,{quiet:true});
}
async function replaceReferenceLayerInState(layer){const old=(state.referenceLayers||[]).filter(l=>l.id!==layer.id&&l.sourceName===layer.sourceName&&l.sourcePackage===(layer.sourcePackage||''));for(const l of old){releaseReferenceLayerMemory(l,{geometry:true,render:true});try{await dbDelete('vectorLayers',l.id);}catch{}}state.referenceLayers=(state.referenceLayers||[]).filter(l=>!old.includes(l)&&l.id!==layer.id);state.referenceLayers.push(layer);}
async function optimizeImportedReferenceLayer(layer){
  layer.featureCount=(layer.features||[]).length;layer.pointCount=referenceLayerPointCount(layer);layer.fullBounds=referenceLayerBounds(layer);layer.featuresLoaded=true;if(layer.lightMode==null)layer.lightMode=vectorLightAuto(layer);await persistReferenceLayerRecord(layer);if(layer.lightMode){await buildReferenceLayerRenderCache(layer,{quiet:true});releaseReferenceLayerMemory(layer,{geometry:true,render:false});}
}
async function hydrateReferenceLayersAfterOpen(){
  for(const layer of state.referenceLayers||[]){
    // Migració transparent de projectes antics que encara portaven la geometria al JSON.
    if(Array.isArray(layer.features)&&layer.features.length){layer.featureCount=layer.features.length;layer.pointCount=referenceLayerPointCount(layer);layer.fullBounds=referenceLayerBounds(layer);layer.featuresLoaded=true;if(layer.lightMode==null)layer.lightMode=vectorLightAuto(layer);await persistReferenceLayerRecord(layer);}else layer.features=[];
    if(!layer.visible){releaseReferenceLayerMemory(layer,{geometry:true,render:true});continue;}
    if(layer.lightMode){await ensureReferenceLayerRender(layer);releaseReferenceLayerMemory(layer,{geometry:true,render:false});}else await ensureReferenceLayerFeatures(layer);
  }
  persistStateLocalOnly();renderLayers();drawAll();
}
function drawReferenceLayerRenderCache(layer,viewBounds=currentViewBoundsWorld()){
  const img=layer?._renderImage,rc=layer?.renderCache,b=rc?.bounds;if(!img||!b||!boundsIntersect(b,viewBounds))return false;const W=Math.max(1e-9,b.maxX-b.minX),H=Math.max(1e-9,b.maxY-b.minY),a={A:W/img.width,B:0,C:b.minX,D:0,E:-H/img.height,F:b.maxY};const {w,h}=screenSize(),s=state.view.scale,rn=state.view.rotation||0,c=Math.cos(rn),sn=Math.sin(rn);const mA=s*(c*a.A+sn*a.D),mC=s*(c*a.B+sn*a.E),mE=w/2+s*(c*(a.C-state.view.cx)+sn*(a.F-state.view.cy)),mB=s*(sn*a.A-c*a.D),mD=s*(sn*a.B-c*a.E),mF=h/2+s*(sn*(a.C-state.view.cx)-c*(a.F-state.view.cy));mapCtx.save();mapCtx.globalAlpha=Number.isFinite(+layer.opacity)?+layer.opacity:.85;mapCtx.imageSmoothingEnabled=true;mapCtx.setTransform(mA*mapCanvas._dpr,mB*mapCanvas._dpr,mC*mapCanvas._dpr,mD*mapCanvas._dpr,mE*mapCanvas._dpr,mF*mapCanvas._dpr);mapCtx.drawImage(img,0,0);mapCtx.restore();applyDpr(mapCtx,mapCanvas);return true;
}
const VECTOR_DASHES={solid:[],dash:[9,6],dot:[2,5],dashdot:[10,5,2,5]};
let vectorStyleEditingId=null,vectorStyleDraft=null,vectorColorTarget=null,vectorColorDraft=null;
function vectorLayerGeometryKind(layer){
  if(['point','line','polygon'].includes(layer?.geometryType))return layer.geometryType;
  const fs=layer?.features||[];let points=0,lines=0,polys=0;
  for(const f of fs){const st=+f.shapeType||0;if([1,8,11,18].includes(st))points++;else if([5,15].includes(st))polys++;else if([3,13].includes(st))lines++;
    for(const path of f.paths||[]){if(path.length===1)points++;else if(path.length>3&&pointDistance(path[0],path.at(-1))<1e-7)polys++;else if(path.length>1)lines++;}}
  if(polys>=lines&&polys>=points&&polys)return'polygon';if(points>lines&&points>polys)return'point';return'line';
}
function vectorUnitToPx(v,unit='px'){const n=Number(v)||0;return unit==='mm'?n*3.7795275591:n;}
function vectorStyleDefault(layer){
  const st=layer?.vectorStyle||{},kind=vectorLayerGeometryKind(layer),legacy=normalizeVectorColor(layer?.color),legacyW=normalizeVectorStrokeWidth(layer?.strokeWidth);
  return{
    kind,strokeColor:normalizeVectorColor(st.strokeColor||legacy),strokeWidth:Number.isFinite(+st.strokeWidth)?Math.max(.1,+st.strokeWidth):legacyW,strokeUnit:st.strokeUnit==='mm'?'mm':'px',
    strokeOpacity:Number.isFinite(+st.strokeOpacity)?Math.max(0,Math.min(1,+st.strokeOpacity)):1,strokeDash:VECTOR_DASHES[st.strokeDash]?st.strokeDash:'dash',
    strokeOffset:Number.isFinite(+st.strokeOffset)?+st.strokeOffset:0,offsetUnit:st.offsetUnit==='mm'?'mm':'px',lineCap:['round','butt','square'].includes(st.lineCap)?st.lineCap:'round',lineJoin:['round','bevel','miter'].includes(st.lineJoin)?st.lineJoin:'round',
    fillColor:normalizeVectorColor(st.fillColor||legacy),fillStyle:['none','solid','diagonal','cross','dots'].includes(st.fillStyle)?st.fillStyle:'none',fillOpacity:Number.isFinite(+st.fillOpacity)?Math.max(0,Math.min(1,+st.fillOpacity)):(kind==='polygon'&&layer?.role!=='basin'?0:0),
    pointColor:normalizeVectorColor(st.pointColor||legacy),pointOpacity:Number.isFinite(+st.pointOpacity)?Math.max(0,Math.min(1,+st.pointOpacity)):1,pointSize:Number.isFinite(+st.pointSize)?Math.max(1,+st.pointSize):6,pointUnit:st.pointUnit==='mm'?'mm':'px',pointShape:['circle','square','diamond','cross'].includes(st.pointShape)?st.pointShape:'circle'
  };
}
function vectorStyleStrokeWidthPx(st){return Math.max(.35,vectorUnitToPx(st.strokeWidth,st.strokeUnit));}
function vectorStyleOffsetPx(st){return vectorUnitToPx(st.strokeOffset,st.offsetUnit);}
function vectorStylePointSizePx(st){return Math.max(1,vectorUnitToPx(st.pointSize,st.pointUnit));}
function vectorScreenPoints(path){const out=[];let last=null;for(let i=0;i<(path||[]).length;i++){const q=worldToScreen(path[i]);if(mapInMotion()&&last&&i<path.length-1&&Math.hypot(q.x-last.x,q.y-last.y)<1.2)continue;out.push(q);last=q;}return out;}
function offsetPolylineScreen(pts,offset=0,closed=false){
  if(!offset||pts.length<2)return pts.map(p=>({...p}));const n=pts.length,out=[];
  for(let i=0;i<n;i++){const prev=pts[i?i-1:(closed?n-2:0)],next=pts[i<n-1?i+1:(closed?1:n-1)],dx=next.x-prev.x,dy=next.y-prev.y,L=Math.hypot(dx,dy)||1;out.push({x:pts[i].x-dy/L*offset,y:pts[i].y+dx/L*offset});}
  return out;
}
function beginCanvasPath(ctx,pts,closed=false){if(!pts.length)return;ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);if(closed)ctx.closePath();}
function vectorFillPattern(ctx,st){
  if(st.fillStyle==='solid')return st.fillColor;
  const c=document.createElement('canvas');c.width=c.height=16;const g=c.getContext('2d');g.clearRect(0,0,16,16);g.strokeStyle=st.fillColor;g.fillStyle=st.fillColor;g.lineWidth=2;
  if(st.fillStyle==='diagonal'){g.beginPath();g.moveTo(-2,14);g.lineTo(14,-2);g.moveTo(2,18);g.lineTo(18,2);g.stroke();}
  else if(st.fillStyle==='cross'){g.beginPath();g.moveTo(0,8);g.lineTo(16,8);g.moveTo(8,0);g.lineTo(8,16);g.stroke();}
  else if(st.fillStyle==='dots'){g.beginPath();g.arc(4,4,1.6,0,Math.PI*2);g.arc(12,12,1.6,0,Math.PI*2);g.fill();}
  return ctx.createPattern(c,'repeat');
}
function drawVectorPointSymbol(ctx,q,st,layerOpacity=1){
  const sz=vectorStylePointSizePx(st),r=sz/2;ctx.save();ctx.globalAlpha=layerOpacity*st.pointOpacity;ctx.fillStyle=st.pointColor;ctx.strokeStyle=st.strokeColor;ctx.lineWidth=Math.max(1,vectorStyleStrokeWidthPx(st)*.65);ctx.setLineDash([]);
  if(st.pointShape==='square'){ctx.beginPath();ctx.rect(q.x-r,q.y-r,sz,sz);ctx.fill();ctx.stroke();}
  else if(st.pointShape==='diamond'){ctx.beginPath();ctx.moveTo(q.x,q.y-r);ctx.lineTo(q.x+r,q.y);ctx.lineTo(q.x,q.y+r);ctx.lineTo(q.x-r,q.y);ctx.closePath();ctx.fill();ctx.stroke();}
  else if(st.pointShape==='cross'){ctx.beginPath();ctx.moveTo(q.x-r,q.y);ctx.lineTo(q.x+r,q.y);ctx.moveTo(q.x,q.y-r);ctx.lineTo(q.x,q.y+r);ctx.stroke();}
  else{ctx.beginPath();ctx.arc(q.x,q.y,r,0,Math.PI*2);ctx.fill();ctx.stroke();}ctx.restore();
}
function drawReferenceLayers(viewBounds=currentViewBoundsWorld()){
  for(const layer of state.referenceLayers||[]){if(!layer.visible)continue;if(layer.lightMode){if(layer.renderCache?.bounds&&!boundsIntersect(layer.renderCache.bounds,viewBounds))continue;if(drawReferenceLayerRenderCache(layer,viewBounds))continue;if(!layer._renderLoading)ensureReferenceLayerRender(layer).then(()=>drawAll());continue;}if(!(layer.features||[]).length){if(!layer._loadingFeatures)ensureReferenceLayerFeatures(layer).then(()=>drawAll());continue;}const st=vectorStyleDefault(layer),kind=st.kind,layerOpacity=Number.isFinite(+layer.opacity)?Math.max(0,Math.min(1,+layer.opacity)):.85;
    for(const f of layer.features||[]){if(f.bounds&&!boundsIntersect(f.bounds,viewBounds))continue;
      if(kind==='polygon'){
        const rings=(f.paths||[]).filter(p=>p.length>2).map(vectorScreenPoints).filter(p=>p.length>2);
        if(rings.length&&st.fillStyle!=='none'&&st.fillOpacity>0){mapCtx.save();mapCtx.globalAlpha=layerOpacity*st.fillOpacity;mapCtx.fillStyle=vectorFillPattern(mapCtx,st);mapCtx.beginPath();for(const pts of rings){mapCtx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)mapCtx.lineTo(pts[i].x,pts[i].y);mapCtx.closePath();}try{mapCtx.fill('evenodd');}catch{mapCtx.fill();}mapCtx.restore();}
        mapCtx.save();mapCtx.globalAlpha=layerOpacity*st.strokeOpacity;mapCtx.strokeStyle=st.strokeColor;mapCtx.lineWidth=vectorStyleStrokeWidthPx(st);mapCtx.lineCap=st.lineCap;mapCtx.lineJoin=st.lineJoin;mapCtx.setLineDash(VECTOR_DASHES[st.strokeDash]||[]);for(const ring of rings){const pts=offsetPolylineScreen(ring,vectorStyleOffsetPx(st),true);beginCanvasPath(mapCtx,pts,true);mapCtx.stroke();}mapCtx.restore();continue;
      }
      for(const path of f.paths||[]){if(!path.length)continue;if(path.length===1||kind==='point'){for(const p of path)drawVectorPointSymbol(mapCtx,worldToScreen(p),st,layerOpacity);continue;}const base=vectorScreenPoints(path);if(base.length<2)continue;mapCtx.save();mapCtx.globalAlpha=layerOpacity*st.strokeOpacity;mapCtx.strokeStyle=st.strokeColor;mapCtx.lineWidth=vectorStyleStrokeWidthPx(st);mapCtx.lineCap=st.lineCap;mapCtx.lineJoin=st.lineJoin;mapCtx.setLineDash(VECTOR_DASHES[st.strokeDash]||[]);const pts=offsetPolylineScreen(base,vectorStyleOffsetPx(st),false);beginCanvasPath(mapCtx,pts,false);mapCtx.stroke();mapCtx.restore();}
    }
  }
}
function rgbToHsv(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let h=0;if(d){if(mx===r)h=60*((g-b)/d%6);else if(mx===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4);}if(h<0)h+=360;return[h,mx?d/mx*100:0,mx*100];}
function hsvToRgb(h,s,v){h=((+h%360)+360)%360;s=Math.max(0,Math.min(100,+s))/100;v=Math.max(0,Math.min(100,+v))/100;const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;let q=[0,0,0];if(h<60)q=[c,x,0];else if(h<120)q=[x,c,0];else if(h<180)q=[0,c,x];else if(h<240)q=[0,x,c];else if(h<300)q=[x,0,c];else q=[c,0,x];return q.map(n=>Math.round((n+m)*255));}
function vectorStyleFieldOpacityKey(target){return target==='fillColor'?'fillOpacity':target==='pointColor'?'pointOpacity':'strokeOpacity';}
function updateVectorStyleColorButton(id,color){const b=$(id);if(!b)return;b.querySelector('.vector-color-swatch').style.background=color;b.querySelector('code').textContent=color.toUpperCase();}
function drawVectorStylePreview(){
  const c=$('#vectorStylePreview');if(!c||!vectorStyleDraft)return;const g=c.getContext('2d'),st=vectorStyleDraft,w=c.width,h=c.height,layerOpacity=Math.max(0,Math.min(1,+$('#vectorLayerOpacity')?.value||0));g.clearRect(0,0,w,h);g.fillStyle='#fafafa';g.fillRect(0,0,w,h);g.strokeStyle='#e2e2de';g.lineWidth=1;for(let x=0;x<w;x+=40){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}for(let y=0;y<h;y+=40){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
  if(st.kind==='polygon'){const pts=[{x:80,y:285},{x:130,y:95},{x:275,y:60},{x:455,y:135},{x:485,y:285},{x:80,y:285}];if(st.fillStyle!=='none'&&st.fillOpacity>0){g.save();g.globalAlpha=layerOpacity*st.fillOpacity;g.fillStyle=vectorFillPattern(g,st);beginCanvasPath(g,pts,true);g.fill();g.restore();}g.save();g.globalAlpha=layerOpacity*st.strokeOpacity;g.strokeStyle=st.strokeColor;g.lineWidth=vectorStyleStrokeWidthPx(st);g.lineCap=st.lineCap;g.lineJoin=st.lineJoin;g.setLineDash(VECTOR_DASHES[st.strokeDash]||[]);beginCanvasPath(g,offsetPolylineScreen(pts,vectorStyleOffsetPx(st),true),true);g.stroke();g.restore();}
  else if(st.kind==='point'){for(const [x,y] of [[120,110],[280,180],[430,100],[390,280],[160,275]])drawVectorPointSymbol(g,{x,y},st,layerOpacity);}
  else{const pts=[{x:55,y:245},{x:130,y:155},{x:230,y:205},{x:345,y:85},{x:505,y:145}];g.save();g.globalAlpha=layerOpacity*st.strokeOpacity;g.strokeStyle=st.strokeColor;g.lineWidth=vectorStyleStrokeWidthPx(st);g.lineCap=st.lineCap;g.lineJoin=st.lineJoin;g.setLineDash(VECTOR_DASHES[st.strokeDash]||[]);beginCanvasPath(g,offsetPolylineScreen(pts,vectorStyleOffsetPx(st),false),false);g.stroke();g.restore();}
}
function currentVectorStyleFromUi(){
  if(!vectorStyleDraft)return null;const st={...vectorStyleDraft};st.strokeWidth=Math.max(.1,+$('#vectorStrokeWidth').value||.1);st.strokeUnit=$('#vectorStrokeUnit').value;st.strokeOffset=+$('#vectorStrokeOffset').value||0;st.offsetUnit=$('#vectorOffsetUnit').value;st.strokeDash=$('#vectorStrokeDash').value;st.lineCap=$('#vectorLineCap').value;st.lineJoin=$('#vectorLineJoin').value;st.fillStyle=$('#vectorFillStyle').value;st.fillOpacity=+$('#vectorFillOpacity').value||0;st.pointSize=Math.max(1,+$('#vectorPointSize').value||1);st.pointUnit=$('#vectorPointUnit').value;st.pointShape=$('#vectorPointShape').value;return st;
}
function syncVectorStyleDraftFromUi(){const st=currentVectorStyleFromUi();if(st)vectorStyleDraft=st;const op=+$('#vectorLayerOpacity').value;$('#vectorLayerOpacityOut').value=`${Math.round(op*100)}%`;$('#vectorFillOpacityOut').value=`${Math.round((vectorStyleDraft?.fillOpacity||0)*100)}%`;drawVectorStylePreview();}
function openVectorStyleEditor(layer){
  if(!layer)return;vectorStyleEditingId=layer.id;vectorStyleDraft=cloneAny(vectorStyleDefault(layer));const st=vectorStyleDraft,kind=st.kind;
  $('#vectorStyleSubtitle').textContent=layer.name;$('#vectorStyleGeomInfo').textContent=`${kind==='polygon'?'Polígon':kind==='point'?'Punt':'Línia'} · ${layer.featureCount??(layer.features||[]).length} geometries · EPSG:${layer.projectEpsg||projectCrsEpsg()}${layer.lightMode?' · mapa lleuger':''}`;
  $('#vectorLineStylePanel').classList.toggle('hidden',kind==='point');$('#vectorFillStylePanel').classList.toggle('hidden',kind!=='polygon');$('#vectorPointStylePanel').classList.toggle('hidden',kind!=='point');
  $('#vectorStrokeWidth').value=st.strokeWidth;$('#vectorStrokeUnit').value=st.strokeUnit;$('#vectorStrokeOffset').value=st.strokeOffset;$('#vectorOffsetUnit').value=st.offsetUnit;$('#vectorStrokeDash').value=st.strokeDash;$('#vectorLineCap').value=st.lineCap;$('#vectorLineJoin').value=st.lineJoin;
  $('#vectorFillStyle').value=st.fillStyle;$('#vectorFillOpacity').value=st.fillOpacity;$('#vectorFillOpacityOut').value=`${Math.round(st.fillOpacity*100)}%`;$('#vectorPointSize').value=st.pointSize;$('#vectorPointUnit').value=st.pointUnit;$('#vectorPointShape').value=st.pointShape;$('#vectorLayerOpacity').value=Number.isFinite(+layer.opacity)?+layer.opacity:.85;$('#vectorLayerOpacityOut').value=`${Math.round((+$('#vectorLayerOpacity').value)*100)}%`;
  updateVectorStyleColorButton('#vectorStrokeColorBtn',st.strokeColor);updateVectorStyleColorButton('#vectorFillColorBtn',st.fillColor);updateVectorStyleColorButton('#vectorPointColorBtn',st.pointColor);$('#vectorStyleStatus').textContent='';$('#vectorStyleModal').classList.remove('hidden');drawVectorStylePreview();
}
function closeVectorStyleEditor(){vectorStyleEditingId=null;vectorStyleDraft=null;$('#vectorStyleModal')?.classList.add('hidden');}
async function saveVectorStyle(){
  const layer=state.referenceLayers.find(l=>l.id===vectorStyleEditingId);if(!layer||!vectorStyleDraft)return;syncVectorStyleDraftFromUi();layer.vectorStyle=cloneAny(vectorStyleDraft);layer.geometryType=vectorStyleDraft.kind;layer.color=vectorStyleDraft.strokeColor;layer.strokeWidth=vectorStyleStrokeWidthPx(vectorStyleDraft);layer.opacity=Math.max(0,Math.min(1,+$('#vectorLayerOpacity').value||0));await ensureReferenceLayerFeatures(layer);await persistReferenceLayerRecord(layer);if(layer.lightMode){$('#vectorStyleStatus').textContent='Regenerant mapa transparent…';await invalidateReferenceLayerRender(layer,{regenerate:true});releaseReferenceLayerMemory(layer,{geometry:true,render:!layer.visible});}else if(!layer.visible)releaseReferenceLayerMemory(layer,{geometry:true,render:true});persistState();renderLayers();drawAll();closeVectorStyleEditor();toast('Simbologia de la capa guardada');
}
function resetVectorStyleEditor(){
  const layer=state.referenceLayers.find(l=>l.id===vectorStyleEditingId);if(!layer)return;const old=layer.vectorStyle;layer.vectorStyle=null;vectorStyleDraft=vectorStyleDefault(layer);layer.vectorStyle=old;const st=vectorStyleDraft;$('#vectorStrokeWidth').value=st.strokeWidth;$('#vectorStrokeUnit').value=st.strokeUnit;$('#vectorStrokeOffset').value=st.strokeOffset;$('#vectorOffsetUnit').value=st.offsetUnit;$('#vectorStrokeDash').value=st.strokeDash;$('#vectorLineCap').value=st.lineCap;$('#vectorLineJoin').value=st.lineJoin;$('#vectorFillStyle').value=st.fillStyle;$('#vectorFillOpacity').value=st.fillOpacity;$('#vectorPointSize').value=st.pointSize;$('#vectorPointUnit').value=st.pointUnit;$('#vectorPointShape').value=st.pointShape;updateVectorStyleColorButton('#vectorStrokeColorBtn',st.strokeColor);updateVectorStyleColorButton('#vectorFillColorBtn',st.fillColor);updateVectorStyleColorButton('#vectorPointColorBtn',st.pointColor);syncVectorStyleDraftFromUi();$('#vectorStyleStatus').textContent='Valors predeterminats carregats; prem Guardar per aplicar-los.';
}
function openVectorColorEditor(target){
  if(!vectorStyleDraft)return;vectorColorTarget=target;const color=normalizeVectorColor(vectorStyleDraft[target]||'#6b5d82'),opacity=Math.round((vectorStyleDraft[vectorStyleFieldOpacityKey(target)]??1)*100);vectorColorDraft={color,opacity};const [r,g,b]=hexRgb(color),[h,sv,v]=rgbToHsv(r,g,b);
  $('#vectorColorNative').value=color;$('#vectorColorHex').value=color.toUpperCase();$('#vectorColorR').value=r;$('#vectorColorG').value=g;$('#vectorColorB').value=b;$('#vectorColorH').value=Math.round(h);$('#vectorColorS').value=Math.round(sv);$('#vectorColorV').value=Math.round(v);$('#vectorColorOpacity').value=opacity;updateVectorColorUi(false);$('#vectorColorModal').classList.remove('hidden');
}
function updateVectorColorUi(from='rgb'){
  if(!vectorColorDraft)return;let color=vectorColorDraft.color;
  if(from==='native'||from==='hex'){const raw=from==='native'?$('#vectorColorNative').value:$('#vectorColorHex').value;if(/^#[0-9a-f]{6}$/i.test(raw))color=raw.toLowerCase();}
  else if(from==='rgb'){color=rgbHex(+$('#vectorColorR').value,+$('#vectorColorG').value,+$('#vectorColorB').value);}
  else if(from==='hsv'){color=rgbHex(...hsvToRgb(+$('#vectorColorH').value,+$('#vectorColorS').value,+$('#vectorColorV').value));}
  vectorColorDraft.color=normalizeVectorColor(color);vectorColorDraft.opacity=Math.max(0,Math.min(100,+$('#vectorColorOpacity').value||0));const [r,g,b]=hexRgb(vectorColorDraft.color),[h,sat,val]=rgbToHsv(r,g,b);
  $('#vectorColorNative').value=vectorColorDraft.color;$('#vectorColorHex').value=vectorColorDraft.color.toUpperCase();$('#vectorColorR').value=r;$('#vectorColorG').value=g;$('#vectorColorB').value=b;$('#vectorColorH').value=Math.round(h);$('#vectorColorS').value=Math.round(sat);$('#vectorColorV').value=Math.round(val);$('#vectorColorHOut').value=`${Math.round(h)}°`;$('#vectorColorSOut').value=`${Math.round(sat)}%`;$('#vectorColorVOut').value=`${Math.round(val)}%`;$('#vectorColorOpacityOut').value=`${vectorColorDraft.opacity}%`;$('#vectorColorCurrent').style.background=vectorColorDraft.color;$('#vectorColorCurrent').style.opacity=String(vectorColorDraft.opacity/100);$('#vectorColorHexText').textContent=vectorColorDraft.color.toUpperCase();
}
function closeVectorColorEditor(){vectorColorTarget=null;vectorColorDraft=null;$('#vectorColorModal')?.classList.add('hidden');}
function applyVectorColorEditor(){if(!vectorStyleDraft||!vectorColorTarget||!vectorColorDraft)return closeVectorColorEditor();vectorStyleDraft[vectorColorTarget]=vectorColorDraft.color;vectorStyleDraft[vectorStyleFieldOpacityKey(vectorColorTarget)]=vectorColorDraft.opacity/100;updateVectorStyleColorButton(vectorColorTarget==='strokeColor'?'#vectorStrokeColorBtn':vectorColorTarget==='fillColor'?'#vectorFillColorBtn':'#vectorPointColorBtn',vectorColorDraft.color);if(vectorColorTarget==='fillColor'){$('#vectorFillOpacity').value=vectorStyleDraft.fillOpacity;$('#vectorFillOpacityOut').value=`${Math.round(vectorStyleDraft.fillOpacity*100)}%`;}drawVectorStylePreview();closeVectorColorEditor();}
function installVectorColorPalette(){const root=$('#vectorColorPalette');if(!root||root.childElementCount)return;const cols=['#000000','#ffffff','#7d8b8f','#6b5d82','#2464a4','#2e78ad','#00a6a6','#2f8f46','#8bbf3f','#f2d447','#f39a2f','#e34a12','#b2182b','#7b3294','#c51b7d','#8c510a'];for(const c of cols){const b=document.createElement('button');b.type='button';b.title=c;b.style.background=c;b.onclick=()=>{$('#vectorColorHex').value=c;updateVectorColorUi('hex');};root.appendChild(b);}}

function vectorRoleLabel(layer){const role=layer?.role||'reference';return role==='watercourse'?'Riu / cauce':role==='basin'?'Conca':role==='limit'?'Límit':role==='path'?'Camí / traçat':role==='other'?(layer.customRole||'Altres'):'Referència';}
function vectorConversionAvailable(layer){return ['watercourse','basin'].includes(layer?.role);}
function nearestReferenceProjection(sp,layer){
  if(!layer)return null;const w=screenToWorld(sp),tol=30/state.view.scale;let best=null;
  (layer.features||[]).forEach((f,featureIndex)=>(f.paths||[]).forEach((path,pathIndex)=>{if(path.length<2)return;const q=projectPointToPolyline(w,path);if(!q||q.d>tol)return;const screen=worldToScreen(q.point),rec={...q,screen,featureIndex,pathIndex,path};if(!best||q.d<best.d)best=rec;}));
  if(!best)return null;const pxTol=18/state.view.scale,path=best.path,ends=[{point:path[0],along:0,kind:'vertex'},{point:path.at(-1),along:polylineLength(path),kind:'vertex'}];
  for(const e of ends){const d=pointDistance(best.point,e.point);if(d<=pxTol){best={...best,point:{...e.point},along:e.along,snapped:e.kind};break;}}
  return best;
}
function extractionEndpoints(){const out=[];for(const seg of state.vectorExtract?.segments||[]){if(seg?.points?.length){out.push(seg.points[0],seg.points.at(-1));}}for(const c of hydroCourses())for(const e of courseEndpointCandidates(c))out.push(e.point);return out;}
function snapExtractedEndpoint(p){let best=null;const tol=Math.min(5,Math.max(.3,28/state.view.scale));for(const q of extractionEndpoints()){const d=pointDistance(p,q);if(d<=tol&&(!best||d<best.d))best={point:q,d};}return best?{...best.point}:{...p};}
function addVectorExtractSegment(path,d0,d1,meta={}){let pts=slicePolylineByAlong(path,d0,d1);if(pts.length<2)return false;pts[0]=snapExtractedEndpoint(pts[0]);pts[pts.length-1]=snapExtractedEndpoint(pts.at(-1));state.vectorExtract.segments.push({points:pts,alongStart:d0,alongEnd:d1,...meta});state.vectorExtract.anchor=null;drawAll();updateVectorExtractBar();toast(`Fragment afegit · ${formatLengthUnit(polylineLength(pts),1)}`);return true;}
function useWholeVectorLine(){const ex=state.vectorExtract,a=ex?.anchor;if(!ex||!a||ex.selectionMode==='route')return;const rec={points:cloneAny(a.path),featureIndex:a.featureIndex,pathIndex:a.pathIndex};ex.anchor=null;if(ex.segments.length){openVectorTraceChoice({...a,path:rec.points});drawAll();updateVectorExtractBar();return;}addDirectVectorTrace(rec,{connect:false});toast('Primera geometria completa afegida · selecciona’n una altra o prem Crear');}
const VECTOR_ROUTE_NODE_TOL=.08;
function vectorRouteGraph(layer){
  if(layer?._routeGraph)return layer._routeGraph;const nodes=[],edges=[],grid=new Map(),tol=VECTOR_ROUTE_NODE_TOL,cell=(x,y)=>`${x}|${y}`;
  const nodeFor=p=>{const gx=Math.round(p.x/tol),gy=Math.round(p.y/tol);let best=-1,bd=Infinity;for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const ids=grid.get(cell(gx+dx,gy+dy))||[];for(const i of ids){const d=pointDistance(p,nodes[i].point);if(d<=tol&&d<bd){best=i;bd=d;}}}if(best>=0)return best;const i=nodes.length;nodes.push({point:{...p},edges:[]});const k=cell(gx,gy);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);return i;};
  (layer?.features||[]).forEach((f,featureIndex)=>(f.paths||[]).forEach((path,pathIndex)=>{if(path.length<2)return;const length=polylineLength(path);if(!(length>0))return;const a=nodeFor(path[0]),b=nodeFor(path.at(-1)),ei=edges.length;edges.push({a,b,length,path,featureIndex,pathIndex});nodes[a].edges.push(ei);nodes[b].edges.push(ei);}));
  const byPath=new Map(edges.map((e,i)=>[`${e.featureIndex}:${e.pathIndex}`,i]));layer._routeGraph={nodes,edges,byPath};return layer._routeGraph;
}
function vectorRouteDijkstra(graph,start,end){
  if(start===end)return{distance:0,steps:[]};const n=graph.nodes.length,dist=new Float64Array(n);dist.fill(Infinity);dist[start]=0;const prev=new Array(n),heap=[];
  const push=(d,node)=>{heap.push([d,node]);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p][0]<=d)break;heap[i]=heap[p];i=p;}heap[i]=[d,node];};
  const pop=()=>{if(!heap.length)return null;const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){let l=i*2+1,r=l+1;if(l>=heap.length)break;let c=r<heap.length&&heap[r][0]<heap[l][0]?r:l;if(heap[c][0]>=last[0])break;heap[i]=heap[c];i=c;}heap[i]=last;}return top;};push(0,start);
  while(heap.length){const [d,u]=pop();if(d!==dist[u])continue;if(u===end)break;for(const ei of graph.nodes[u].edges){const e=graph.edges[ei],v=e.a===u?e.b:e.a,nd=d+e.length;if(nd<dist[v]){dist[v]=nd;prev[v]={from:u,edgeIndex:ei};push(nd,v);}}}
  if(!Number.isFinite(dist[end]))return null;const steps=[];let v=end;while(v!==start){const pr=prev[v];if(!pr)return null;const e=graph.edges[pr.edgeIndex];steps.push({edgeIndex:pr.edgeIndex,from:pr.from,to:v,reversed:e.b===pr.from});v=pr.from;}steps.reverse();return{distance:dist[end],steps};
}
function appendRoutePiece(out,piece){if(!piece?.length)return;const p=piece.map(q=>({...q}));if(!out.length){out.push(...p);return;}if(pointDistance(out.at(-1),p[0])<=VECTOR_ROUTE_NODE_TOL)p[0]={...out.at(-1)};if(pointDistance(out.at(-1),p[0])<1e-9)out.push(...p.slice(1));else out.push(...p);}
function vectorRoutePartial(pr,side,fromProjection){const L=polylineLength(pr.path);if(fromProjection){return side===0?slicePolylineByAlong(pr.path,0,pr.along).reverse():slicePolylineByAlong(pr.path,pr.along,L);}return side===0?slicePolylineByAlong(pr.path,0,pr.along):slicePolylineByAlong(pr.path,pr.along,L).reverse();}
function routeBetweenReferencePoints(layer,a,b){
  const graph=vectorRouteGraph(layer),ea=graph.edges[graph.byPath.get(`${a.featureIndex}:${a.pathIndex}`)],eb=graph.edges[graph.byPath.get(`${b.featureIndex}:${b.pathIndex}`)];if(!ea||!eb)return null;let best=null;
  if(a.featureIndex===b.featureIndex&&a.pathIndex===b.pathIndex){let pts=slicePolylineByAlong(a.path,a.along,b.along);if(b.along<a.along)pts=pts.reverse();const distance=Math.abs(b.along-a.along);best={distance,points:pts};}
  for(const sa of [0,1])for(const sb of [0,1]){const na=sa===0?ea.a:ea.b,nb=sb===0?eb.a:eb.b,net=vectorRouteDijkstra(graph,na,nb);if(!net)continue;const da=sa===0?a.along:ea.length-a.along,db=sb===0?b.along:eb.length-b.along,total=da+net.distance+db;if(best&&best.distance<=total)continue;const points=[];appendRoutePiece(points,vectorRoutePartial(a,sa,true));for(const st of net.steps){const e=graph.edges[st.edgeIndex];appendRoutePiece(points,st.reversed?[...e.path].reverse():e.path);}appendRoutePiece(points,vectorRoutePartial(b,sb,false));if(points.length>1)best={distance:total,points};}
  return best;
}
function vectorRoutePointRecord(pr){return{point:{...pr.point},along:pr.along,featureIndex:pr.featureIndex,pathIndex:pr.pathIndex,path:pr.path};}
function handleVectorRouteTap(ex,layer,pr){
  ex.routePoints=ex.routePoints||[];if(!ex.routePoints.length){ex.routePoints.push(vectorRoutePointRecord(pr));drawAll();updateVectorExtractBar();toast('Primer punt fixat · toca altres punts del recorregut');return;}
  const a=ex.routePoints.at(-1),route=routeBetweenReferencePoints(layer,a,pr);if(!route){toast('Aquests punts no estan connectats dins del SHP. GeoCauce no crearà cap connexió artificial.',5200);return;}if(route.distance<.05){toast('El punt és massa proper a l’anterior');return;}const pts=route.points;pts[0]=snapExtractedEndpoint(pts[0]);pts[pts.length-1]=snapExtractedEndpoint(pts.at(-1));ex.segments.push({points:pts,routed:true});ex.routePoints.push(vectorRoutePointRecord(pr));drawAll();updateVectorExtractBar();toast(`Ruta afegida · ${formatLengthUnit(route.distance,1)}`);
}
function openVectorTraceChoice(pr){const ex=state.vectorExtract;if(!ex)return;ex.pendingMapTrace={points:cloneAny(pr.path),featureIndex:pr.featureIndex,pathIndex:pr.pathIndex};const layer=(state.referenceLayers||[]).find(l=>l.id===ex.layerId);$('#vectorTraceChoiceTitle').textContent=`Nou traç · ${layer?.name||'SHP'}`;$('#vectorTraceChoiceModal').classList.remove('hidden');}
function addDirectVectorTrace(rec,{connect=false}={}){const ex=state.vectorExtract;if(!ex||!rec?.points?.length)return;let pts=cloneAny(rec.points);if(connect){pts[0]=snapExtractedEndpoint(pts[0]);pts[pts.length-1]=snapExtractedEndpoint(pts.at(-1));}ex.segments.push({points:pts,featureIndex:rec.featureIndex,pathIndex:rec.pathIndex,whole:true,directMap:true});ex.anchor=null;drawAll();updateVectorExtractBar();}
function chooseVectorTraceAction(mode){const ex=state.vectorExtract,rec=ex?.pendingMapTrace;if(!ex||!rec){$('#vectorTraceChoiceModal').classList.add('hidden');return;}$('#vectorTraceChoiceModal').classList.add('hidden');ex.pendingMapTrace=null;if(mode==='pick'){ex.mapPick=true;updateVectorExtractBar();toast('Toca una altra geometria visible del SHP');return;}if(mode==='connect'||mode==='same'){addDirectVectorTrace(rec,{connect:mode==='connect'});toast(mode==='connect'?'Traç afegit intentant encaixar-lo amb l’element actual':'Traç afegit com a fragment separat');return;}if(mode==='new'){const layer=(state.referenceLayers||[]).find(l=>l.id===ex.layerId);if(ex.mode==='watercourse'){openCourseModal(rec.points);toast('Defineix el nou curs per a aquesta geometria');return;}let pts=cloneAny(rec.points),tol=Math.min(5,Math.max(.3,30/state.view.scale));if(pointDistance(pts[0],pts.at(-1))>tol){toast('Aquesta geometria no és un contorn tancat; no es pot crear una conca nova directament');return;}pts[pts.length-1]={...pts[0]};pts.pop();const name=(prompt('Nom de la nova conca',layer?.name||'Conca')||'').trim();if(!name)return;pushHistory();const f={id:nextHydroId('BAS'),type:'basin',name,points:pts,closed:true,filled:false,material:null,campaign:state.campaign,date:today(),ink:[],photos:[],erasures:[],source:{type:'referenceLayer',layerId:layer?.id||null,layerName:layer?.name||''}};state.features.push(f);state.selectedId=f.id;persistState();drawAll();toast(`Conca ${name} creada`);}}
function toggleVectorMapPick(){const ex=state.vectorExtract;if(!ex)return;ex.mapPick=!ex.mapPick;ex.anchor=null;updateVectorExtractBar();toast(ex.mapPick?'Toca directament una geometria visible del SHP':'Selecció directa desactivada');}
function handleDirectVectorMapPick(ex,pr){const rec={points:cloneAny(pr.path),featureIndex:pr.featureIndex,pathIndex:pr.pathIndex};if(!ex.segments.length){addDirectVectorTrace(rec,{connect:false});toast('Primera geometria afegida · toca’n una altra o prem Crear');return;}openVectorTraceChoice({...pr,path:rec.points});}
function handleVectorExtractTap(sp){const ex=state.vectorExtract;if(!ex)return;const layer=(state.referenceLayers||[]).find(l=>l.id===ex.layerId);if(!layer){cancelVectorExtraction();return;}const pr=nearestReferenceProjection(sp,layer);if(!pr){toast('Toca sobre una línia de la capa importada');return;}if(ex.mapPick){handleDirectVectorMapPick(ex,pr);return;}if(ex.mode==='watercourse'&&ex.selectionMode==='route'){handleVectorRouteTap(ex,layer,pr);return;}if(!ex.anchor){ex.anchor=pr;drawAll();updateVectorExtractBar();toast('Inici fixat amb imán · toca el final sobre la mateixa línia');return;}const a=ex.anchor;if(a.featureIndex!==pr.featureIndex||a.pathIndex!==pr.pathIndex){toast('El final ha d’estar sobre la mateixa línia. Finalitza aquest fragment i després selecciona la següent.');return;}if(Math.abs(pr.along-a.along)<.05){toast('El fragment és massa curt');return;}addVectorExtractSegment(a.path,a.along,pr.along,{featureIndex:a.featureIndex,pathIndex:a.pathIndex});}
function nearestVectorExtractEndpoint(sp){
  const ex=state.vectorExtract;if(!ex)return null;let best=null;
  (ex.segments||[]).forEach((seg,segmentIndex)=>{if(!seg?.points?.length)return;[['start',seg.points[0]],['end',seg.points.at(-1)]].forEach(([end,p])=>{const q=worldToScreen(p),d=Math.hypot(sp.x-q.x,sp.y-q.y);if(d<=15&&(!best||d<best.d))best={segmentIndex,end,d};});});
  return best;
}
function beginVectorEndpointDrag(sp,pointerId){if(state.vectorExtract?.selectionMode==='route')return false;const hit=nearestVectorExtractEndpoint(sp);if(!hit)return false;state.vectorExtract.dragEndpoint={...hit,pointerId};inkCanvas.setPointerCapture?.(pointerId);return true;}
function moveVectorEndpointDrag(sp,pointerId){const ex=state.vectorExtract,drag=ex?.dragEndpoint;if(!drag||drag.pointerId!==pointerId)return false;const layer=(state.referenceLayers||[]).find(l=>l.id===ex.layerId),seg=ex.segments?.[drag.segmentIndex];if(!layer||!seg)return false;const path=layer.features?.[seg.featureIndex]?.paths?.[seg.pathIndex];if(!path?.length)return false;const pr=projectPointToPolyline(screenToWorld(sp),path);if(!pr)return false;let d0=Number.isFinite(+seg.alongStart)?+seg.alongStart:0,d1=Number.isFinite(+seg.alongEnd)?+seg.alongEnd:polylineLength(path);if(drag.end==='start')d0=pr.along;else d1=pr.along;if(Math.abs(d1-d0)<.05)return true;let pts=slicePolylineByAlong(path,d0,d1);if(pts.length<2)return true;const endpointIndex=drag.end==='start'?0:pts.length-1,other=[];(ex.segments||[]).forEach((s,i)=>{if(!s?.points?.length)return;[['start',s.points[0]],['end',s.points.at(-1)]].forEach(([which,p])=>{if(i===drag.segmentIndex&&which===drag.end)return;other.push(p);});});for(const c of hydroCourses())for(const e of courseEndpointCandidates(c))other.push(e.point);let snap=null,tol=Math.min(5,Math.max(.3,28/state.view.scale));for(const p of other){const dd=pointDistance(pts[endpointIndex],p);if(dd<=tol&&(!snap||dd<snap.d))snap={p,d:dd};}if(snap)pts[endpointIndex]={...snap.p};seg.points=pts;seg.alongStart=d0;seg.alongEnd=d1;drawAll();updateVectorExtractBar();return true;}
function endVectorEndpointDrag(pointerId){const ex=state.vectorExtract,drag=ex?.dragEndpoint;if(!drag||drag.pointerId!==pointerId)return false;ex.dragEndpoint=null;persistState();drawAll();updateVectorExtractBar();toast('Límit del fragment actualitzat');return true;}
function reversePts(pts){return cloneAny(pts).reverse();}
function chainExtractSegments(segments,{close=false}={}){const remain=(segments||[]).map(s=>cloneAny(s.points)).filter(p=>p.length>1);if(!remain.length)return null;let chain=remain.shift(),tol=.08,guard=0;while(remain.length&&guard++<10000){let found=-1,mode='';const a=chain[0],z=chain.at(-1);for(let i=0;i<remain.length;i++){const p=remain[i],p0=p[0],p1=p.at(-1);if(pointDistance(z,p0)<=tol){found=i;mode='append';break;}if(pointDistance(z,p1)<=tol){found=i;mode='append-rev';break;}if(pointDistance(a,p1)<=tol){found=i;mode='prepend';break;}if(pointDistance(a,p0)<=tol){found=i;mode='prepend-rev';break;}}if(found<0)break;let p=remain.splice(found,1)[0];if(mode.endsWith('rev'))p=reversePts(p);if(mode.startsWith('append')){p[0]={...chain.at(-1)};chain.push(...p.slice(1));}else{p[p.length-1]={...chain[0]};chain=[...p.slice(0,-1),...chain];}}
  if(remain.length)return null;if(close){const tolClose=Math.min(5,Math.max(.3,30/state.view.scale));if(pointDistance(chain[0],chain.at(-1))>tolClose)return null;chain[chain.length-1]={...chain[0]};chain.pop();}return chain;
}
async function startVectorExtraction(layer){if(!requireEditable('crear geometria des d’una capa'))return;if(!vectorConversionAvailable(layer)){toast('Aquesta capa no està definida com a riu/cauce o conca');return;}if(!layer.visible)await setReferenceLayerVisible(layer,true);const ok=await ensureReferenceLayerFeatures(layer);if(!ok){toast('No s’ha pogut carregar la geometria original del SHP');return;}state.vectorExtract={layerId:layer.id,mode:layer.role,segments:[],anchor:null,dragEndpoint:null,selectionMode:layer.role==='watercourse'?'route':'manual',routePoints:[],mapPick:false,pendingMapTrace:null,releaseAfter:!!layer.lightMode};$('#layersPanel').classList.add('hidden');ensureVectorExtractBar();updateVectorExtractBar();drawAll();toast(layer.role==='basin'?'Selecciona línies del contorn de la conca':'Ruta per punts: toca tants punts com vulguis sobre els trams connectats');}
function cancelVectorExtraction(){const ex=state.vectorExtract,layer=(state.referenceLayers||[]).find(l=>l.id===ex?.layerId);state.vectorExtract=null;document.querySelector('#vectorExtractBar')?.remove();if(layer&&ex?.releaseAfter)releaseReferenceLayerMemory(layer,{geometry:true,render:false});drawAll();}
function undoVectorExtract(){const ex=state.vectorExtract;if(!ex)return;if(ex.mode==='watercourse'&&ex.selectionMode==='route'){if(ex.segments.length){ex.segments.pop();ex.routePoints?.pop();}else if(ex.routePoints?.length)ex.routePoints.pop();}else if(ex.anchor)ex.anchor=null;else ex.segments.pop();drawAll();updateVectorExtractBar();}
function finishVectorExtraction(){const ex=state.vectorExtract;if(!ex||!ex.segments.length){toast('Encara no has seleccionat geometria');return;}const layer=(state.referenceLayers||[]).find(l=>l.id===ex.layerId);if(ex.mode==='watercourse'){const chained=ex.selectionMode==='route'?chainExtractSegments(ex.segments,{close:false}):null,frags=chained?[chained]:ex.segments.map(s=>s.points);state.vectorExtract=null;document.querySelector('#vectorExtractBar')?.remove();state.pendingImportedCourseFragments=cloneAny(frags);openCourseModal(frags[0]);if(layer&&ex.releaseAfter)releaseReferenceLayerMemory(layer,{geometry:true,render:false});toast(`Geometria de ${layer?.name||'la capa'} preparada · ${frags.length===1?'curs connectat':'fragments separats'} · defineix el nou curs`);drawAll();return;}
  const chain=chainExtractSegments(ex.segments,{close:true});if(!chain){toast('La conca encara no forma un contorn tancat. Afegeix les línies que falten perquè els extrems encaixin.');return;}const name=(prompt('Nom de la conca',layer?.name||'Conca')||'').trim();if(!name)return;pushHistory();const f={id:nextHydroId('BAS'),type:'basin',name,points:chain,closed:true,filled:false,material:null,campaign:state.campaign,date:today(),ink:[],photos:[],erasures:[],source:{type:'referenceLayer',layerId:layer?.id||null,layerName:layer?.name||''}};state.features.push(f);state.selectedId=f.id;state.vectorExtract=null;document.querySelector('#vectorExtractBar')?.remove();if(layer&&ex.releaseAfter)releaseReferenceLayerMemory(layer,{geometry:true,render:false});persistState();showFeatureCard(f);drawAll();toast(`Conca ${name} creada des de la capa importada`);}
function ensureVectorExtractBar(){let bar=$('#vectorExtractBar');if(bar)return bar;bar=document.createElement('div');bar.id='vectorExtractBar';bar.className='vector-extract-bar';bar.innerHTML='<div><b class="vector-extract-title">Seleccionar geometria</b><small class="vector-extract-status"></small></div><div class="vector-extract-actions"><button type="button" class="secondary vector-mode">Ruta per punts</button><button type="button" class="secondary vector-map-pick">Seleccionar del mapa</button><button type="button" class="secondary vector-whole">Línia completa</button><button type="button" class="secondary vector-undo">Desfer</button><button type="button" class="primary vector-finish">Crear</button><button type="button" class="ghost vector-cancel">Cancel·lar</button></div>';$('#mapScreen').appendChild(bar);bar.querySelector('.vector-mode').onclick=toggleVectorExtractMode;bar.querySelector('.vector-map-pick').onclick=toggleVectorMapPick;bar.querySelector('.vector-whole').onclick=useWholeVectorLine;bar.querySelector('.vector-undo').onclick=undoVectorExtract;bar.querySelector('.vector-finish').onclick=finishVectorExtraction;bar.querySelector('.vector-cancel').onclick=cancelVectorExtraction;return bar;}
function toggleVectorExtractMode(){const ex=state.vectorExtract;if(!ex||ex.mode!=='watercourse')return;if(ex.segments.length||ex.anchor||ex.routePoints?.length){if(!confirm('Canviar de mode esborrarà la selecció actual. Continuar?'))return;}ex.selectionMode=ex.selectionMode==='route'?'manual':'route';ex.segments=[];ex.anchor=null;ex.routePoints=[];drawAll();updateVectorExtractBar();}
function updateVectorExtractBar(){const ex=state.vectorExtract;if(!ex)return;const bar=ensureVectorExtractBar(),layer=(state.referenceLayers||[]).find(l=>l.id===ex.layerId),route=ex.mode==='watercourse'&&ex.selectionMode==='route',modeBtn=bar.querySelector('.vector-mode');bar.querySelector('.vector-extract-title').textContent=`${ex.mode==='basin'?'Conca':'Cauce'} · ${layer?.name||''}`;if(modeBtn){modeBtn.classList.toggle('hidden',ex.mode!=='watercourse');modeBtn.textContent=route?'Ruta per punts':'Fragments manuals';}bar.querySelector('.vector-extract-status').textContent=route?`${ex.routePoints?.length||0} punts · ${ex.segments.length} connexions · GeoCauce només segueix trams realment connectats`:ex.anchor?`${ex.segments.length} fragments · inici fixat, toca el final`:`${ex.segments.length} fragments seleccionats · toca inici i final · arrossega les boles per ajustar`;const pickBtn=bar.querySelector('.vector-map-pick');if(pickBtn){pickBtn.classList.toggle('active',!!ex.mapPick);pickBtn.textContent=ex.mapPick?'Toca una geometria…':'Seleccionar del mapa';}bar.querySelector('.vector-whole').classList.toggle('hidden',route||ex.mapPick);bar.querySelector('.vector-whole').disabled=route||ex.mapPick||!ex.anchor;}
function drawVectorExtraction(){const ex=state.vectorExtract;if(!ex)return;mapCtx.save();mapCtx.lineCap='round';mapCtx.lineJoin='round';mapCtx.strokeStyle='#0f7a5a';mapCtx.lineWidth=5;mapCtx.setLineDash([]);for(const seg of ex.segments||[]){if(!seg.points?.length)continue;mapCtx.beginPath();seg.points.forEach((p,i)=>{const q=worldToScreen(p);i?mapCtx.lineTo(q.x,q.y):mapCtx.moveTo(q.x,q.y);});mapCtx.stroke();for(const p of [seg.points[0],seg.points.at(-1)]){const q=worldToScreen(p);mapCtx.fillStyle='#fff';mapCtx.strokeStyle='#0f7a5a';mapCtx.lineWidth=3;mapCtx.beginPath();mapCtx.arc(q.x,q.y,6,0,Math.PI*2);mapCtx.fill();mapCtx.stroke();}}
  if(ex.anchor){const q=worldToScreen(ex.anchor.point);mapCtx.fillStyle='#f3a22a';mapCtx.strokeStyle='#fff';mapCtx.lineWidth=3;mapCtx.beginPath();mapCtx.arc(q.x,q.y,8,0,Math.PI*2);mapCtx.fill();mapCtx.stroke();}if(ex.selectionMode==='route'){(ex.routePoints||[]).forEach((rp,i)=>{const q=worldToScreen(rp.point);mapCtx.fillStyle='#fff';mapCtx.strokeStyle='#0f7a5a';mapCtx.lineWidth=3;mapCtx.beginPath();mapCtx.arc(q.x,q.y,7,0,Math.PI*2);mapCtx.fill();mapCtx.stroke();mapCtx.fillStyle='#0f7a5a';mapCtx.font='700 10px system-ui';mapCtx.textAlign='center';mapCtx.textBaseline='middle';mapCtx.fillText(String(i+1),q.x,q.y+.5);});}mapCtx.restore();}

async function deleteReferenceLayer(layer){if(!confirm(`Eliminar la capa vectorial ${layer.name}?`))return;releaseReferenceLayerMemory(layer,{geometry:true,render:true});state.referenceLayers=state.referenceLayers.filter(l=>l.id!==layer.id);try{await dbDelete('vectorLayers',layer.id);}catch{}persistState();renderLayers();drawAll();}

function rasterBounds(r){const c=rasterCorners(r),xs=c.map(p=>p.x),ys=c.map(p=>p.y);return{minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};}
function featureBounds(f){const pts=featurePolylines(f).flat();if(!pts.length)return{minX:0,maxX:0,minY:0,maxY:0};const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);return{minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};}
function combineBounds(bounds){if(!bounds.length)return null;return{minX:Math.min(...bounds.map(b=>b.minX)),maxX:Math.max(...bounds.map(b=>b.maxX)),minY:Math.min(...bounds.map(b=>b.minY)),maxY:Math.max(...bounds.map(b=>b.maxY))};}
function zoomAtCenter(factor){state.view.scale=Math.max(.002,Math.min(1000,state.view.scale*factor));persistState();drawAll();}
function fitBounds(b,pad=.90){
  if(!b)return;const {w,h}=screenSize(),bw=Math.max(1e-9,b.maxX-b.minX),bh=Math.max(1e-9,b.maxY-b.minY),r=state.view.rotation||0,c=Math.abs(Math.cos(r)),sn=Math.abs(Math.sin(r));
  const rw=bw*c+bh*sn,rh=bw*sn+bh*c;state.view.cx=(b.minX+b.maxX)/2;state.view.cy=(b.minY+b.maxY)/2;state.view.scale=Math.max(.002,Math.min(1000,Math.min(w/rw,h/rh)*pad));persistState();drawAll();
}
function fitRaster(r){if(!r)return;fitBounds(rasterBounds(r));}
function fitVisibleRasters(){const b=projectRasterBounds({visibleOnly:true});if(!b){toast('No hay mapas visibles');return;}fitBounds(b);}
function fitAllContent(){const bs=[],rb=projectRasterBounds({visibleOnly:true});if(rb)bs.push(rb);state.features.forEach(f=>f.points?.length&&bs.push(featureBounds(f)));if(!bs.length){toast('Aún no hay cartografía');return;}fitBounds(combineBounds(bs));}
function resolutionText(r){const a=r.affine,rx=Math.hypot(a.A,a.D),ry=Math.hypot(a.B,a.E);return `${formatNum(rx,3)} × ${formatNum(ry,3)} m/píxel`;}
function sourceResolutionText(r){const a=r?.meta?.sourceAffine||sourceAffine(r),rx=Math.hypot(a.A,a.D),ry=Math.hypot(a.B,a.E);return `${formatNum(rx,3)} × ${formatNum(ry,3)} m/píxel`;}
function currentRasterDetailText(r){
  if(r?.meta?.sourceType!=='geotiff'||!r.sourceBlob)return 'Vista general';
  const sa=sourceAffine(r),res=Math.max(Math.hypot(sa.A,sa.D),Math.hypot(sa.B,sa.E)),cssPx=res*state.view.scale,dpr=mapCanvas._dpr||1,phys=cssPx*dpr;
  if(r.rasterStyle?.renderer&&r.rasterStyle.renderer!=='original'){if(r.styleCache?.ready)return `Render guardat ✓ · ${formatNum(res,2)} m/píxel màxim`;return 'Vista estilitzada · cal regenerar el render HD';}
  const step=chooseDetailStep(cssPx,r.meta?.downsample||1);
  if(step==null)return `Vista general · ${formatNum(res*(r.meta?.downsample||1),2)} m/píxel aprox.`;
  const effective=res*step;
  if(step===1)return `Detalle original ✓ · ${formatNum(res,2)} m/píxel · ${formatNum(phys,2)} px físicos/píxel`;
  return `Detalle ${formatNum(effective,2)} m/píxel · nivel ${step}×`;
}
async function rgbaToPngBlob(width,height,rgba){const c=document.createElement('canvas');c.width=width;c.height=height;const g=c.getContext('2d',{alpha:true});g.putImageData(new ImageData(rgba,width,height),0,0);return await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('No se pudo crear la vista del GeoTIFF')),'image/png'));}


// ---------- Cua d'importació no bloquejant · v0.16.18 ----------
let importQueue=[];
let importQueueRunning=false;
function importQueueId(){return 'iq'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function queueStatusLabel(item){return item.status==='queued'?'Esperant':item.status==='processing'?'Processant':item.status==='ready'?'Preparat':item.status==='loading'?'Carregant':item.status==='loaded'?'Carregat':item.status==='error'?'Error':item.status==='cancelled'?'Cancel·lat':'Pendent';}
function updateImportQueueBadge(){const n=importQueue.filter(x=>!['loaded','cancelled'].includes(x.status)).length,b=$('#layersQueueBadge');if(!b)return;b.textContent=String(n);b.classList.toggle('hidden',n===0);}
function queueSet(item,{status=item.status,progress=item.progress,message=item.message,error=item.error}={}){item.status=status;if(progress!=null)item.progress=Math.max(0,Math.min(1,+progress||0));if(message!=null)item.message=message;if(error!==undefined)item.error=error;renderImportQueue();}
function importItemKindLabel(item){return item.kind==='raster'?(item.geoKind||'MAPA'):item.kind==='vector'?'SHP / ZIP':'FITXER';}
function renderImportQueue(){
  const sec=$('#importQueueSection'),root=$('#importQueueList'),loadAll=$('#loadReadyImportsBtn');if(!sec||!root)return;
  const shown=importQueue.filter(x=>!['loaded','cancelled'].includes(x.status));sec.classList.toggle('hidden',shown.length===0);root.innerHTML='';
  for(const item of shown){const row=document.createElement('div');row.className=`import-queue-item ${item.status==='ready'?'ready':''} ${item.status==='error'?'error':''}`;const pct=Math.round((item.progress||0)*100);row.innerHTML=`<div class="import-queue-row"><span class="import-kind">${escapeHtml(importItemKindLabel(item))}</span><span class="import-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span><span class="import-state">${escapeHtml(queueStatusLabel(item))}${item.status==='processing'?` · ${pct}%`:''}</span></div><div class="import-queue-progress"><span style="width:${pct}%"></span></div><div class="import-queue-meta">${escapeHtml(item.message||'')}</div>${item.error?`<div class="import-queue-error">${escapeHtml(item.error)}</div>`:''}<div class="import-queue-config"></div><div class="import-queue-actions"></div>`;
    const cfg=row.querySelector('.import-queue-config'),actions=row.querySelector('.import-queue-actions');
    if(item.kind==='vector'&&['queued','processing','ready','error'].includes(item.status)){
      cfg.innerHTML=`<input class="iq-name" type="text" value="${escapeHtml(item.config?.displayName||'')}" placeholder="Nom de la capa"><select class="iq-role"><option value="reference">Referència</option><option value="watercourse">Riu / cauce</option><option value="basin">Conca</option><option value="limit">Límit</option><option value="path">Camí / traçat</option><option value="other">Altres…</option></select><input class="iq-custom ${item.config?.role==='other'?'':'hidden'}" type="text" value="${escapeHtml(item.config?.customRole||'')}" placeholder="Tipus personalitzat"><input class="iq-color" type="color" value="${normalizeVectorColor(item.config?.color)}">`;
      const rs=cfg.querySelector('.iq-role'),custom=cfg.querySelector('.iq-custom');rs.value=item.config?.role||'reference';cfg.querySelector('.iq-name').onchange=e=>item.config.displayName=e.target.value.trim();rs.onchange=e=>{item.config.role=e.target.value;custom.classList.toggle('hidden',item.config.role!=='other');};custom.onchange=e=>item.config.customRole=e.target.value.trim();cfg.querySelector('.iq-color').oninput=e=>item.config.color=normalizeVectorColor(e.target.value);
    }
    if(item.status==='ready'){const b=document.createElement('button');b.className='primary-small';b.textContent='Carregar';b.onclick=()=>loadPreparedImport(item);actions.appendChild(b);}
    if(item.status==='error'){const retry=document.createElement('button');retry.className='secondary';retry.textContent='Reintentar';retry.onclick=()=>{item.error='';item.status='queued';item.progress=0;processImportQueue();renderImportQueue();};actions.appendChild(retry);}
    const remove=document.createElement('button');remove.className='ghost';remove.textContent=item.status==='processing'?'Cancel·lar':'Treure';remove.onclick=()=>{item.cancelled=true;item.status='cancelled';disposePreparedImport(item);renderImportQueue();processImportQueue();};actions.appendChild(remove);root.appendChild(row);
  }
  if(loadAll)loadAll.disabled=!shown.some(x=>x.status==='ready');updateImportQueueBadge();
}
function disposePreparedImport(item){if(item?.prepared?.kind==='raster'){try{item.prepared.raster?.image?.close?.()}catch{}}item.prepared=null;}
function enqueueMapImports(fileList){
  const files=[...fileList||[]],imgs=files.filter(f=>/\.(png|jpe?g|webp|svg|tiff?|cog)$/i.test(f.name)),worlds=files.filter(f=>/\.(pgw|jgw|tfw|wld)$/i.test(f.name));
  if(!imgs.length){toast('Selecciona almenys un mapa compatible');return;}
  for(const file of imgs){const stem=file.name.replace(/\.[^.]+$/,'').toLowerCase(),wf=worlds.find(w=>w.name.replace(/\.[^.]+$/,'').toLowerCase()===stem)||((imgs.length===1&&worlds.length===1)?worlds[0]:null);importQueue.push({id:importQueueId(),kind:'raster',name:file.name,files:[file],file,wf,status:'queued',progress:0,message:'A la cua',error:'',prepared:null,cancelled:false,geoKind:/\.(tiff?|cog)$/i.test(file.name)?'GeoTIFF / COG':'MAPA'});}
  renderImportQueue();processImportQueue();
}
function enqueueVectorImports(fileList){
  const files=[...fileList||[]];if(!files.length)return;const zips=files.filter(f=>/\.zip$/i.test(f.name)),direct=files.filter(f=>!/\.zip$/i.test(f.name));const baseCfg={color:normalizeVectorColor($('#vectorImportColor')?.value||appSettings.vectorImportColor),role:$('#vectorImportRole')?.value||'reference',customRole:($('#vectorImportCustomRole')?.value||'').trim(),displayName:($('#vectorImportName')?.value||'').trim()};
  for(const z of zips)importQueue.push({id:importQueueId(),kind:'vector',name:z.name,files:[z],zip:z,status:'queued',progress:0,message:'ZIP a la cua',error:'',prepared:null,cancelled:false,config:{...baseCfg}});
  if(direct.some(f=>/\.shp$/i.test(f.name)))importQueue.push({id:importQueueId(),kind:'vector',name:direct.filter(f=>/\.shp$/i.test(f.name)).map(f=>f.name).join(', '),files:direct,status:'queued',progress:0,message:'Paquet SHP a la cua',error:'',prepared:null,cancelled:false,config:{...baseCfg}});
  if(!zips.length&&!direct.some(f=>/\.shp$/i.test(f.name))){toast('Selecciona un ZIP amb SHP o els fitxers .shp + auxiliars');return;}
  renderImportQueue();processImportQueue();
}
async function processImportQueue(){if(importQueueRunning)return;const item=importQueue.find(x=>x.status==='queued'&&!x.cancelled);if(!item)return;importQueueRunning=true;queueSet(item,{status:'processing',progress:.02,message:'Preparant…',error:''});
  try{if(item.kind==='raster')item.prepared=await prepareQueuedRaster(item);else item.prepared=await prepareQueuedVector(item);if(item.cancelled){disposePreparedImport(item);item.status='cancelled';}else queueSet(item,{status:'ready',progress:1,message:item.kind==='raster'?'Mapa preparat · encara no visible':'Capa preparada · encara no visible'});}catch(e){console.error('Import queue',e);if(!item.cancelled)queueSet(item,{status:'error',progress:0,message:'No s’ha pogut preparar',error:e?.message||String(e)});}finally{importQueueRunning=false;renderImportQueue();setTimeout(processImportQueue,0);}}
async function prepareQueuedRaster(item){
  const file=item.file,wf=item.wf;let bitmap,blob,sourceBlob=null,affine,georef=false,meta={sourceType:'image'};const progress=(p,msg)=>{if(item.cancelled)throw Error('Importació cancel·lada');item.progress=p;item.message=msg;renderImportQueue();};progress(.05,'Llegint fitxer…');
  if(/\.(tiff?|cog)$/i.test(file.name)){
    if(!window.GeoCauceGeoTIFF)throw Error('El lector GeoTIFF no s’ha carregat');const ab=await file.arrayBuffer();progress(.12,'Llegint GeoTIFF / COG…');const dec=await GeoCauceGeoTIFF.decode(ab,{maxDimension:3072,onProgress:p=>progress(.12+p*.72,`Creant vista general · ${Math.round(p*100)}%`)});affine=dec.affine;georef=dec.georef;meta={sourceType:'geotiff',epsg:dec.epsg,kind:dec.kind,originalKind:dec.kind,sourceWidth:dec.sourceWidth,sourceHeight:dec.sourceHeight,displayWidth:dec.width,displayHeight:dec.height,downsample:dec.downsample,compression:dec.compression,predictor:dec.predictor,range:dec.range,noData:dec.noData,validPercent:dec.validPercent,validCount:dec.validCount,samplesPerPixel:dec.samplesPerPixel,bitsPerSample:dec.bitsPerSample,sampleFormat:dec.sampleFormat,photometric:dec.photometric,extraSamples:dec.extraSamples,hillshadeAzimuth:dec.kind==='dem'?315:null,hillshadeRenderVersion:dec.kind==='dem'?2:null,cogCompatible:true,overviewWidth:dec.overviewWidth||null,overviewHeight:dec.overviewHeight||null};const comp=dec.compression===7?'JPEG':dec.compression===5?'LZW':(dec.compression===8||dec.compression===32946)?'Deflate':dec.compression===32773?'PackBits':'sense compressió';progress(.88,`${dec.overviewWidth&&dec.overviewWidth!==dec.sourceWidth?'COG · overview '+dec.overviewWidth+'×'+dec.overviewHeight+' · ':''}${comp}`);if(wf){affine=parseWorldFile(await wf.text());georef=true;meta.worldFileOverride=true;}progress(.90,'Preparant multiresolució…');blob=await rgbaToPngBlob(dec.width,dec.height,dec.rgba);bitmap=await createImageBitmap(blob);meta.sourceAffine=dec.sourceAffine;meta.hdTiles=true;sourceBlob=file.slice(0,file.size,file.type||'image/tiff');
  }else{bitmap=await createImageBitmap(file);blob=file.slice(0,file.size,file.type);affine=dummyAffine(bitmap);if(wf){affine=parseWorldFile(await wf.text());georef=true;}progress(.92,'Preparant imatge…');}
  const id='r'+Date.now()+Math.random().toString(16).slice(2),largeRaster=meta.sourceType==='geotiff'&&(file.size>48*1024*1024||(meta.sourceWidth||0)*(meta.sourceHeight||0)>50000000),r={id,name:file.name,blob,sourceBlob,image:bitmap,affine,georef,visible:true,opacity:1,renderMode:meta.sourceType==='geotiff'?'auto':'smooth',lightMode:!!largeRaster,meta};normalizeRasterOrientation(r);return{kind:'raster',raster:r};
}
async function prepareVectorLayersFromComponentFiles(files,{sourceZip='',color=null,role='reference',customRole='',displayName=''}={}){
  const byName=new Map(files.map(f=>[f.name.toLowerCase(),f])),shps=files.filter(f=>/\.shp$/i.test(f.name));if(!shps.length)return[];const projectBounds=projectRasterBounds(),layers=[];
  for(const shp of shps){const base=shp.name.replace(/\.shp$/i,''),find=ext=>byName.get((base+ext).toLowerCase()),prj=find('.prj'),dbf=find('.dbf'),cpg=find('.cpg'),prjText=prj?await prj.text():'',srcEpsg=parsePrjEpsg(prjText)||projectCrsEpsg(),dstEpsg=projectCrsEpsg(),cpgText=cpg?await cpg.text():'',attrs=dbf?parseDbfBuffer(await dbf.arrayBuffer(),cpgText):[],records=parseShpBuffer(await shp.arrayBuffer()),features=[];for(const rec of records){let paths=[];for(const path of rec.paths){const t=[];for(const q of path)t.push(transformVectorPoint(q,srcEpsg,dstEpsg));if(t.length)paths.push(t);}const bounds=pointsBounds(paths);if(!bounds)continue;if(projectBounds&&!boundsIntersect(bounds,projectBounds))continue;features.push({paths,shapeType:rec.shapeType,attrs:attrs[rec.recordIndex]||{},label:vectorFeatureLabel(attrs[rec.recordIndex]||{}),bounds});}const shapeTypes=[...new Set(records.map(r=>+r.shapeType).filter(Boolean))],geometryType=shapeTypes.some(t=>[5,15].includes(t))?'polygon':shapeTypes.some(t=>[1,8,11,18].includes(t))&&!shapeTypes.some(t=>[3,5,13,15].includes(t))?'point':'line',layerName=(displayName||'').trim()||base,baseColor=normalizeVectorColor(color||appSettings.vectorImportColor);layers.push({id:'v'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:layerName,sourceName:base,role:role||'reference',customRole:(customRole||'').trim(),sourceType:'shapefile',sourcePackage:sourceZip||'',sourceEpsg:srcEpsg,projectEpsg:dstEpsg,geometryType,visible:true,opacity:.85,color:baseColor,strokeWidth:2.5,vectorStyle:{kind:geometryType,strokeColor:baseColor,strokeWidth:2.5,strokeUnit:'px',strokeOpacity:1,strokeDash:'dash',strokeOffset:0,offsetUnit:'px',lineCap:'round',lineJoin:'round',fillColor:baseColor,fillStyle:'none',fillOpacity:0,pointColor:baseColor,pointOpacity:1,pointSize:6,pointUnit:'px',pointShape:'circle'},features,importedAt:Date.now(),clippedToRasterExtent:!!projectBounds});}return layers;
}
async function prepareQueuedVector(item){const cfg=item.config||{},layers=[];if(item.zip){item.progress=.12;item.message='Obrint ZIP…';renderImportQueue();const packs=await shapefilePackagesFromZip(item.zip);for(let i=0;i<packs.length;i++){item.progress=.25+.65*(i/Math.max(1,packs.length));item.message=`Processant SHP ${i+1}/${packs.length}`;renderImportQueue();const name=packs.length>1&&cfg.displayName?`${cfg.displayName} · ${i+1}`:cfg.displayName;layers.push(...await prepareVectorLayersFromComponentFiles(packs[i],{sourceZip:item.zip.name,...cfg,displayName:name}));}}else{item.progress=.30;item.message='Llegint SHP…';renderImportQueue();layers.push(...await prepareVectorLayersFromComponentFiles(item.files,cfg));}if(!layers.length)throw Error('No s’ha trobat cap geometria SHP compatible');return{kind:'vector',layers};}
async function loadPreparedImport(item,{silent=false}={}){if(item.status!=='ready'||!item.prepared)return false;item.status='loading';renderImportQueue();try{if(item.prepared.kind==='raster'){const r=item.prepared.raster,previous=state.rasters.find(x=>x.name===r.name);if(previous){state.rasters=state.rasters.filter(x=>x.id!==previous.id);await dbDelete('rasters',previous.id);await dbDeleteRasterStyleTiles(previous.id);try{previous.image?.close?.()}catch{}}state.rasters.push(r);await dbPut('rasters',stripRaster(r));nativeSyncRasterMeta(r);}else{for(const layer of item.prepared.layers||[]){const cfg=item.config||{};if(cfg.displayName&&item.prepared.layers.length===1)layer.name=cfg.displayName;layer.role=cfg.role||layer.role;layer.customRole=cfg.customRole||'';layer.color=normalizeVectorColor(cfg.color||layer.color);const vst=vectorStyleDefault(layer);layer.vectorStyle={...vst,strokeColor:layer.color,pointColor:layer.color,fillColor:vst.fillStyle==='none'?layer.color:vst.fillColor};await replaceReferenceLayerInState(layer);await optimizeImportedReferenceLayer(layer);}}item.status='loaded';item.progress=1;persistState();renderLayers();drawAll();if(!silent)toast(`${item.name} carregat al mapa`);return true;}catch(e){item.status='error';item.error=e?.message||String(e);renderImportQueue();return false;}}
async function loadReadyImports(){const ready=importQueue.filter(x=>x.status==='ready');let lastRaster=null,count=0;for(const item of ready){if(await loadPreparedImport(item,{silent:true})){count++;if(item.prepared?.kind==='raster')lastRaster=item.prepared.raster;}}renderImportQueue();if(lastRaster)fitRaster(lastRaster);if(count)toast(`${count} element${count===1?'':'s'} carregat${count===1?'':'s'} al mapa`);}

function showImportProgress(name,p=0,text='Preparando…'){$('#importProgressTitle').textContent=`Importando ${name}`;$('#importProgressBar').style.width=`${Math.max(2,Math.round(p*100))}%`;$('#importProgressText').textContent=text;$('#importProgress').classList.remove('hidden');}
function hideImportProgress(){setTimeout(()=>$('#importProgress').classList.add('hidden'),180);}

async function importMaps(files){
  const arr=[...files],imgs=arr.filter(f=>/\.(png|jpe?g|webp|svg|tiff?)$/i.test(f.name)),worlds=arr.filter(f=>/\.(pgw|jgw|tfw|wld)$/i.test(f.name));
  let lastImported=null;
  for(const file of imgs){
    const stem=file.name.replace(/\.[^.]+$/,'').toLowerCase(),wf=worlds.find(w=>w.name.replace(/\.[^.]+$/,'').toLowerCase()===stem)||((imgs.length===1&&worlds.length===1)?worlds[0]:null);
    let bitmap,blob,sourceBlob=null,affine,georef=false,meta={sourceType:'image'};
    try{
      showImportProgress(file.name,.03,'Leyendo archivo…');
      if(/\.tiff?$/i.test(file.name)){
        if(!window.GeoCauceGeoTIFF)throw Error('El lector GeoTIFF no se ha cargado');
        const ab=await file.arrayBuffer();
        showImportProgress(file.name,.12,'Leyendo GeoTIFF…');
        const dec=await GeoCauceGeoTIFF.decode(ab,{maxDimension:3072,onProgress:p=>showImportProgress(file.name,.12+p*.72,`Creando vista general · ${Math.round(p*100)}%`)});
        affine=dec.affine;georef=dec.georef;
        meta={sourceType:'geotiff',epsg:dec.epsg,kind:dec.kind,originalKind:dec.kind,sourceWidth:dec.sourceWidth,sourceHeight:dec.sourceHeight,displayWidth:dec.width,displayHeight:dec.height,downsample:dec.downsample,compression:dec.compression,predictor:dec.predictor,range:dec.range,noData:dec.noData,validPercent:dec.validPercent,validCount:dec.validCount,samplesPerPixel:dec.samplesPerPixel,bitsPerSample:dec.bitsPerSample,sampleFormat:dec.sampleFormat,photometric:dec.photometric,extraSamples:dec.extraSamples,hillshadeAzimuth:dec.kind==='dem'?315:null,hillshadeRenderVersion:dec.kind==='dem'?2:null};
        if(wf){affine=parseWorldFile(await wf.text());georef=true;meta.worldFileOverride=true;}
        showImportProgress(file.name,.90,'Preparando mapa multirresolución…');
        blob=await rgbaToPngBlob(dec.width,dec.height,dec.rgba);bitmap=await createImageBitmap(blob);meta.sourceAffine=dec.sourceAffine;meta.hdTiles=true;sourceBlob=file.slice(0,file.size,file.type||'image/tiff');
        if(dec.epsg&&dec.epsg!==projectCrsEpsg())toast(`Aviso: ${file.name} declara EPSG:${dec.epsg}. El proyecto está configurado como EPSG:${projectCrsEpsg()}. El GPS seguirá el CRS de la cartografía visible.`,7000);
      } else {
        bitmap=await createImageBitmap(file);blob=file.slice(0,file.size,file.type);affine=dummyAffine(bitmap);if(wf){affine=parseWorldFile(await wf.text());georef=true;}
      }
      const previous=state.rasters.find(x=>x.name===file.name);if(previous){state.rasters=state.rasters.filter(x=>x.id!==previous.id);await dbDelete('rasters',previous.id);try{previous.image?.close?.()}catch{}}
      const id='r'+Date.now()+Math.random().toString(16).slice(2),r={id,name:file.name,blob,sourceBlob,image:bitmap,affine,georef,visible:true,opacity:1,renderMode:meta.sourceType==='geotiff'?'auto':'smooth',meta};
      state.rasters.push(r);await dbPut('rasters',stripRaster(r));nativeSyncRasterMeta(r);lastImported=r;
      showImportProgress(file.name,1,'Mapa cargado');
      if(meta.sourceType==='geotiff' && meta.validPercent===0) toast(`⚠ ${file.name}: GeoTIFF sin datos válidos (NoData ${meta.noData??'—'})`,8000);
      else if(meta.sourceType==='geotiff' && Number.isFinite(meta.validPercent) && meta.validPercent<5) toast(`⚠ ${file.name}: solo ${formatNum(meta.validPercent,2)}% de cobertura válida`,6000);
    } catch(e){console.error(e);toast(`No puedo abrir ${file.name}: ${e.message||e}`,7000);}
  }
  hideImportProgress();renderLayers();persistState();
  if(lastImported){
    // Siempre llevar al usuario al mapa recién añadido.
    requestAnimationFrame(()=>{fitRaster(lastImported);toast(`Mapa cargado · 🎯 centrado en ${lastImported.name}`,3500);});
  } else drawAll();
}
async function rebuildStoredDemHillshade(rec){
  if(!rec?.sourceBlob||rec.meta?.sourceType!=='geotiff'||rec.meta?.kind!=='dem'||(rec.rasterStyle?.renderer&&rec.rasterStyle.renderer!=='original'))return rec;
  if(Number(rec.meta?.hillshadeAzimuth)===315&&Number(rec.meta?.hillshadeRenderVersion||0)>=2)return rec;
  try{
    const ab=await rec.sourceBlob.arrayBuffer();
    const dec=await GeoCauceGeoTIFF.decode(ab,{maxDimension:3072});
    if(dec.kind!=='dem')return rec;
    const blob=await rgbaToPngBlob(dec.width,dec.height,dec.rgba);
    const meta={...(rec.meta||{}),range:dec.range,validPercent:dec.validPercent,validCount:dec.validCount,displayWidth:dec.width,displayHeight:dec.height,downsample:dec.downsample,hillshadeAzimuth:315,hillshadeRenderVersion:2};
    return{...rec,blob,meta};
  }catch(e){console.warn('No s’ha pogut regenerar el hillshade 2D',rec.name,e);return rec;}
}
let editingDemGroupId=null;
function renderDemGroups(){
  normalizeDemGroups();const root=$('#demGroupsList');if(!root)return;root.innerHTML='';
  const dems=state.rasters.filter(isDemRaster);if(!dems.length){root.innerHTML='<p class="muted compact-note">Importa DEM GeoTIFF per crear un mosaic.</p>';return;}
  if(!(state.demGroups||[]).length){const p=document.createElement('p');p.className='muted compact-note';p.textContent=dems.length>1?'Pots agrupar els DEM en un mosaic virtual.':'Hi ha un únic DEM; no cal crear mosaic.';root.appendChild(p);return;}
  for(const g of state.demGroups){const rs=demGroupRasters(g),b=rs.length?combineBounds(rs.map(rasterBounds)):null,res=demGroupResolution(g),row=document.createElement('div');row.className='dem-group-row'+(g.id===state.activeDemGroupId?' active':'');row.innerHTML=`<div class="dem-group-row-top"><b>${escapeHtml(g.name||'Mosaic DEM')}</b><span class="geo-badge">${rs.length} DEM</span></div><small>${Number.isFinite(res)?formatNum(res,2)+' m/píxel · ':''}${g.id===state.activeDemGroupId?'ACTIU · ':''}${b?`${formatNum(b.maxX-b.minX,0)} × ${formatNum(b.maxY-b.minY,0)} m`:''}</small><div class="dem-group-actions"><button class="dem-group-use ${g.id===state.activeDemGroupId?'secondary':'primary-small'}">${g.id===state.activeDemGroupId?'Actiu':'Fer actiu'}</button><button class="dem-group-fit secondary">Veure</button><button class="dem-group-edit secondary">Editar</button><button class="dem-group-delete danger-action">Eliminar grup</button></div>`;
    row.querySelector('.dem-group-use').onclick=()=>{state.activeDemGroupId=g.id;persistState();renderDemGroups();drawAll();toast(`Mosaic DEM actiu: ${g.name}`);};row.querySelector('.dem-group-fit').onclick=()=>{if(b)fitBounds(b,.9);drawAll();};row.querySelector('.dem-group-edit').onclick=()=>openDemGroupModal(g.id);row.querySelector('.dem-group-delete').onclick=()=>{if(!confirm(`Eliminar el mosaic ${g.name}? Els DEM originals es conservaran.`))return;state.demGroups=state.demGroups.filter(x=>x.id!==g.id);if(state.activeDemGroupId===g.id)state.activeDemGroupId=null;persistState();renderLayers();drawAll();};root.appendChild(row);
  }
}
function openDemGroupModal(groupId=null){
  normalizeDemGroups();const dems=state.rasters.filter(isDemRaster);if(!dems.length){toast('Importa almenys un DEM GeoTIFF');return;}editingDemGroupId=groupId;const g=state.demGroups.find(x=>x.id===groupId)||null;$('#demGroupName').value=g?.name||`Mosaic DEM ${state.demGroups.length+1}`;$('#demGroupActive').checked=g?g.id===state.activeDemGroupId:true;const selected=new Set(g?.rasterIds||dems.map(r=>r.id)),root=$('#demGroupMembers');root.innerHTML='';for(const r of dems){const b=rasterBounds(r),res=sourceResolution(r),lab=document.createElement('label');lab.className='dem-group-member';lab.innerHTML=`<input type="checkbox" value="${r.id}" ${selected.has(r.id)?'checked':''}><span><b>${escapeHtml(r.name)}</b><small>${mDemMeta(r)}</small></span><em>${Number.isFinite(res)?formatNum(res,2)+' m':'DEM'}</em>`;root.appendChild(lab);}$('#demGroupModal').classList.remove('hidden');}
function mDemMeta(r){const b=rasterBounds(r);return `EPSG:${r.meta?.epsg||projectCrsEpsg()} · ${formatNum(b.maxX-b.minX,0)} × ${formatNum(b.maxY-b.minY,0)} m`;}
function saveDemGroup(){const ids=$$('#demGroupMembers input:checked').map(x=>x.value);if(!ids.length){toast('Selecciona almenys un DEM');return;}const name=$('#demGroupName').value.trim()||'Mosaic DEM';let g=state.demGroups.find(x=>x.id===editingDemGroupId);if(g){g.name=name;g.rasterIds=ids;g.updatedAt=Date.now();}else{g={id:'demg_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),name,rasterIds:ids,createdAt:Date.now(),updatedAt:Date.now()};state.demGroups.push(g);}if($('#demGroupActive').checked||!state.activeDemGroupId)state.activeDemGroupId=g.id;persistState();$('#demGroupModal').classList.add('hidden');editingDemGroupId=null;renderLayers();drawAll();toast(`Mosaic DEM guardat · ${ids.length} fitxers`);}

async function loadRasters(){
  const all=await dbAll('rasters');
  for(const saved of all){try{const rec=await rebuildStoredDemHillshade(saved),image=await createImageBitmap(rec.blob),r={...rec,image};if(r.lightMode==null&&r.meta?.sourceType==='geotiff'&&r.sourceBlob?.size>48*1024*1024)r.lightMode=true;normalizeRasterOrientation(r);state.rasters.push(r);if(rec!==saved||r.meta?.displayNorthUpFix||r.lightMode!==saved.lightMode)await dbPut('rasters',stripRaster(r));}catch(e){console.warn('Raster guardado no legible',saved.name,e);}}
  normalizeDemGroups();renderLayers();drawAll();
}
function renderLayers(){
  syncHistoricalPhotoToggle();renderImportQueue();renderDemGroups();
  const root=$('#layersList');root.innerHTML='';if(!state.rasters.length&&!(state.referenceLayers||[]).length)root.innerHTML='<p class="muted">Aún no hay mapas o capas importados.</p>';
  for(const layer of state.referenceLayers||[]){
    layer.role=layer.role||'reference';layer.customRole=layer.customRole||'';layer.geometryType=vectorLayerGeometryKind(layer);
    const st=vectorStyleDefault(layer),row=document.createElement('div');row.className='layer-row vector-layer-row';const n=Number.isFinite(+layer.featureCount)?+layer.featureCount:(layer.features||[]).length,color=st.strokeColor,kind=st.kind,light=!!layer.lightMode;
    row.innerHTML=`<div class="layer-row-top"><button class="vector-eye icon-only ${layer.visible?'is-visible':'is-hidden'}" title="${layer.visible?'Ocultar':'Mostrar'}">${iconImg('icons/invisible.png')}</button><input class="vector-color" type="color" value="${color}" title="Color ràpid del traç" aria-label="Color de ${escapeHtml(layer.name)}"><input class="vector-name" type="text" value="${escapeHtml(layer.name)}" aria-label="Nom de la capa"><span class="geo-badge">${light?'SHP→MAPA':'SHP'}</span></div><div class="vector-role-line"><select class="vector-role" aria-label="Ús de la capa"><option value="reference">Referència</option><option value="watercourse">Riu / cauce</option><option value="basin">Conca</option><option value="limit">Límit</option><option value="path">Camí / traçat</option><option value="other">Altres…</option></select><input class="vector-custom-role ${layer.role==='other'?'':'hidden'}" type="text" value="${escapeHtml(layer.customRole||'')}" placeholder="Tipus personalitzat"></div><small class="layer-info">${escapeHtml(vectorRoleLabel(layer))} · ${kind==='polygon'?'polígons':kind==='point'?'punts':'línies'} · ${n} geometries · EPSG:${layer.projectEpsg||projectCrsEpsg()}${light?' · mapa transparent lleuger':''}${!layer.visible?' · descarregada de RAM':''}</small><div class="layer-opacity-line"><input class="vector-opacity" type="range" min="0" max="1" step="0.05" value="${layer.opacity??.85}"><output>${Math.round((layer.opacity??.85)*100)}%</output></div><div class="layer-actions">${vectorConversionAvailable(layer)?'<button class="vector-convert primary-small" title="Crear geometria GeoCauce des d’aquesta capa">Usar geometria</button>':''}<button class="vector-style-edit" title="Editar simbologia">${iconImg('icons/material.png')}<span>Estil</span></button><button class="vector-light-toggle ${light?'active':''}" title="${light?'Tornar a vector':'Convertir visualment a mapa transparent'}">${light?'Vector':'Mapa lleuger'}</button><button class="vector-info icon-only" title="Informació">${iconImg('icons/info.png')}</button><button class="vector-delete danger-action icon-only" title="Eliminar capa">${iconImg('icons/eliminar.svg')}</button></div><div class="layer-details hidden">Origen: SHP${layer.sourceEpsg?` · EPSG:${layer.sourceEpsg}`:''}<br>CRS projecte: EPSG:${layer.projectEpsg||projectCrsEpsg()}<br>Ús: <span class="vector-role-label">${escapeHtml(vectorRoleLabel(layer))}</span><br>Geometria: ${kind==='polygon'?'polígon':kind==='point'?'punt':'línia'}<br>Traç: <span class="vector-color-code">${st.strokeColor.toUpperCase()}</span> · ${st.strokeWidth.toFixed(1)} ${st.strokeUnit} · ${escapeHtml(st.strokeDash)}<br>${kind==='polygon'?`Relleno: ${st.fillStyle==='none'?'sense relleno':st.fillColor.toUpperCase()+' · '+Math.round(st.fillOpacity*100)+'%'}<br>`:''}${layer.clippedToRasterExtent?'Filtrada a l’extensió dels mapes del projecte':'Sense retall d’extensió'}<br>${light?'Mode lleuger: es dibuixa un PNG transparent precalculat. La geometria SHP queda desada a IndexedDB i només es carrega quan l’edites o la converteixes.':'Mode vector: la geometria es carrega en RAM mentre la capa és visible.'}<br>Quan apagues la capa, GeoCauce allibera geometria i bitmap de la RAM.</div>`;
    const eye=row.querySelector('.vector-eye'),range=row.querySelector('.vector-opacity'),out=row.querySelector('.vector-opacity-line output'),colorInput=row.querySelector('.vector-color'),nameInput=row.querySelector('.vector-name'),roleSel=row.querySelector('.vector-role'),custom=row.querySelector('.vector-custom-role');roleSel.value=layer.role;
    eye.onclick=async()=>{eye.disabled=true;await setReferenceLayerVisible(layer,!layer.visible);};
    range.oninput=()=>{layer.opacity=+range.value;out.value=`${Math.round(layer.opacity*100)}%`;drawAll();};range.onchange=async()=>{await persistReferenceLayerRecord(layer);persistState();};
    colorInput.oninput=()=>{const c=normalizeVectorColor(colorInput.value);layer.color=c;layer.vectorStyle={...vectorStyleDefault(layer),strokeColor:c};if(!layer.lightMode)drawAll();};colorInput.onchange=async()=>{await ensureReferenceLayerFeatures(layer);await persistReferenceLayerRecord(layer);if(layer.lightMode){await invalidateReferenceLayerRender(layer,{regenerate:true});releaseReferenceLayerMemory(layer,{geometry:true,render:!layer.visible});}else if(!layer.visible)releaseReferenceLayerMemory(layer,{geometry:true,render:true});persistState();renderLayers();drawAll();};
    nameInput.onchange=async()=>{const v=nameInput.value.trim();if(v)layer.name=v;else nameInput.value=layer.name;await persistReferenceLayerRecord(layer);persistState();renderLayers();};
    roleSel.onchange=async()=>{layer.role=roleSel.value;custom.classList.toggle('hidden',layer.role!=='other');await persistReferenceLayerRecord(layer);persistState();renderLayers();drawAll();};
    custom.onchange=async()=>{layer.customRole=custom.value.trim();await persistReferenceLayerRecord(layer);persistState();renderLayers();};
    row.querySelector('.vector-convert')?.addEventListener('click',()=>startVectorExtraction(layer));
    row.querySelector('.vector-style-edit').onclick=()=>openVectorStyleEditor(layer);
    row.querySelector('.vector-light-toggle').onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{await setReferenceLayerLightMode(layer,!layer.lightMode);}catch(err){console.error(err);toast(`No s’ha pogut generar el mapa lleuger: ${err.message||err}`,5000);}finally{b.disabled=false;}};
    row.querySelector('.vector-info').onclick=()=>row.querySelector('.layer-details').classList.toggle('hidden');
    row.querySelector('.vector-delete').onclick=()=>deleteReferenceLayer(layer);root.appendChild(row);
  }
  state.rasters.forEach((r,index)=>{
    const row=document.createElement('div');row.className='layer-row';const m=r.meta||{},b=rasterBounds(r);
    const empty=m.sourceType==='geotiff'&&m.validPercent===0;
    const info=m.sourceType==='geotiff'?`GeoTIFF${m.kind==='dem'?' · relieve':''}${m.epsg?' · EPSG:'+m.epsg:''}${m.downsample>1.02?(r.sourceBlob?' · multirresolución':' · vista previa'):''}${empty?' · ⚠ sin datos':''}`:(r.georef?'georreferenciado':'sin georreferenciar');
    row.innerHTML=`
      <div class="layer-row-top"><button class="layer-eye icon-only ${r.visible?'is-visible':'is-hidden'}" title="${r.visible?'Ocultar':'Mostrar'}">${iconImg('icons/invisible.png')}</button><b title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</b><span class="geo-badge">${r.georef?'⌖':'□'}</span></div>
      <small class="layer-info ${empty?'warning':''}">${info}${r.rasterStyle?.renderer&&r.rasterStyle.renderer!=='original'?` <span class="raster-style-chip">${escapeHtml(r.rasterStyle.renderer==='unique'?'valors únics':r.rasterStyle.renderer==='pseudocolor'?'pseudocolor':r.rasterStyle.renderer==='rgb'?'multibanda':'gris')}</span>`:''}</small>
      <div class="layer-opacity-line"><input class="layer-opacity" type="range" min="0" max="1" step="0.05" value="${r.opacity}"><output>${Math.round(r.opacity*100)}%</output></div>
      <div class="layer-actions"><button class="zoom-layer icon-only" title="Ir a este mapa">${iconImg('icons/centrar.png')}</button><button class="info-layer icon-only" title="Información">${iconImg('icons/info.png')}</button>${m.sourceType==='geotiff'?`<button class="raster-style-edit" title="Editar simbologia">${iconImg('icons/material.png')}<span>Estil</span></button>`:''}<button class="up-layer" title="Subir capa">↑</button><button class="down-layer" title="Bajar capa">↓</button><button class="delete-layer danger-action icon-only" title="Eliminar mapa">${iconImg('icons/eliminar.svg')}</button></div>
      <div class="layer-details hidden">
        <b>${m.sourceType==='geotiff'?'GeoTIFF':'Imagen'}</b><br>
        ${m.epsg?`CRS: EPSG:${m.epsg}<br>`:(r.georef?`CRS: no identificado (proyecto EPSG:${projectCrsEpsg()})<br>`:'Sin georreferenciación<br>')}
        ${m.sourceType==='geotiff'?`Resolución original: ${r.georef?sourceResolutionText(r):'—'}<br>Resolución vista general: ${r.georef?resolutionText(r):'—'}<br>Estado al zoom actual: <span class="raster-detail-state">${currentRasterDetailText(r)}</span><br>`:`Resolución: ${r.georef?resolutionText(r):'—'}<br>`}
        Vista general: ${r.image.width} × ${r.image.height} px${m.sourceWidth?` · original ${m.sourceWidth} × ${m.sourceHeight} px`:''}<br>${m.sourceType==='geotiff'?`Detalle al zoom: ${r.rasterStyle?.renderer&&r.rasterStyle.renderer!=='original'?(r.styleCache?.ready?'render visual pre-generat ✓':'render visual pendent de regenerar ⚠'):(r.sourceBlob?'píxel original conservado ✓':'reimporta el TIFF para activar HD ⚠')}<br><label class="raster-light-label"><input class="raster-light-mode" type="checkbox" ${r.lightMode?'checked':''}> Mode lleuger · no carregar tiles originals HD</label><br><label class="raster-render-label">Renderizado: <select class="raster-render-mode"><option value="auto" ${r.renderMode==='auto'||!r.renderMode?'selected':''}>Automático</option><option value="sharp" ${r.renderMode==='sharp'?'selected':''}>Nítido</option><option value="smooth" ${r.renderMode==='smooth'?'selected':''}>Suave</option></select></label><br><span class="raster-dem-extent-note">${m.kind==='dem'?(state.demGroups?.some(g=>(g.rasterIds||[]).includes(r.id))?'Inclòs en mosaic DEM':'DEM disponible per mosaic'):(demWorkingBounds()?'Limitat automàticament a l’extensió DEM':'Sense límit DEM actiu')}</span><br>`:''}
        ${m.sourceType==='geotiff'?`NoData: ${m.noData??'—'}<br>Cobertura válida: ${Number.isFinite(m.validPercent)?formatNum(m.validPercent,2)+' %':'—'}<br>${m.range?`Rango visible: ${formatNum(m.range[0],2)} → ${formatNum(m.range[1],2)}<br>`:''}`:''}
        X: ${formatNum(b.minX,2)} → ${formatNum(b.maxX,2)}<br>
        Y: ${formatNum(b.minY,2)} → ${formatNum(b.maxY,2)}
      </div>`;
    const eye=row.querySelector('.layer-eye'),range=row.querySelector('.layer-opacity'),out=row.querySelector('output');
    eye.onclick=()=>{r.visible=!r.visible;if(!r.visible)releaseRasterHeavyMemory(r);dbPut('rasters',stripRaster(r));nativeSyncRasterMeta(r);renderLayers();drawAll();};
    range.oninput=()=>{r.opacity=+range.value;out.value=`${Math.round(r.opacity*100)}%`;dbPut('rasters',stripRaster(r));nativeSyncRasterMeta(r);drawAll();};
    row.querySelector('.zoom-layer').onclick=()=>{fitRaster(r);$('#layersPanel').classList.add('hidden');toast(`Centrado en ${r.name}`);};
    row.querySelector('.info-layer').onclick=()=>{const d=row.querySelector('.layer-details');d.classList.toggle('hidden');const st=d.querySelector('.raster-detail-state');if(st)st.textContent=currentRasterDetailText(r);};
    row.querySelector('.raster-style-edit')?.addEventListener('click',()=>openRasterStyleEditor(r));
    const renderSel=row.querySelector('.raster-render-mode');if(renderSel)renderSel.onchange=()=>{r.renderMode=renderSel.value;dbPut('rasters',stripRaster(r));drawAll();toast(`Renderizado ${renderSel.options[renderSel.selectedIndex].text.toLowerCase()}`);};const light=row.querySelector('.raster-light-mode');if(light)light.onchange=()=>{setRasterLightMode(r,light.checked);toast(light.checked?'Mode lleuger activat':'Detalle HD activat');};
    row.querySelector('.up-layer').onclick=()=>moveRaster(index,+1);
    row.querySelector('.down-layer').onclick=()=>moveRaster(index,-1);
    row.querySelector('.delete-layer').onclick=()=>deleteRaster(r);
    root.appendChild(row);
  });
  renderSectionList();
}
function renderSectionList(){
  const root=$('#sectionList');if(!root)return;const secs=state.features.filter(f=>f.type==='section');root.innerHTML='';
  if(!secs.length){root.innerHTML='<p class="muted compact-note">Aún no hay secciones.</p>';return;}
  for(const f of secs){const row=document.createElement('div');row.className='section-list-row';const r=sectionReach(f),label=f.sectionName||f.sheetIII?.sectionName||f.id,sub=r?`${r.reachCode||r.id}`:campaignLabel(state.campaign);row.innerHTML=`${iconImg('icons/seccion.svg')}<b>${escapeHtml(label)}</b><span>${escapeHtml(sub)}</span><button class="section-open icon-only" title="Obrir FITXA III">${iconImg('icons/ficha.png')}</button><button class="section-fit icon-only" title="Anar a la secció">${iconImg('icons/centrar.png')}</button><button class="section-del icon-only danger-action" title="Eliminar">${iconImg('icons/eliminar.svg')}</button>`;
    row.querySelector('.section-open').onclick=()=>{state.selectedId=f.id;openSection(f);$('#layersPanel').classList.add('hidden');};
    row.querySelector('.section-fit').onclick=()=>{fitBounds(featureBounds(f),.72);state.selectedId=f.id;showFeatureCard(f);$('#layersPanel').classList.add('hidden');drawAll();};
    const del=row.querySelector('.section-del');del.disabled=!isEditableCampaign();del.onclick=()=>deleteFeature(f.id,true);root.appendChild(row);
  }
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function cropRasterToCurrentView(r){
  if(!r?.image||!r?.affine)return false;const vb=currentViewportWorldBounds(),rb=rasterBounds(r);if(!boundsOverlap(vb,rb)){toast('Aquest mapa no intersecta la vista actual');return false;}
  const corners=[{x:vb.minX,y:vb.minY},{x:vb.maxX,y:vb.minY},{x:vb.maxX,y:vb.maxY},{x:vb.minX,y:vb.maxY}].map(q=>invertAffine(r.affine,q)).filter(Boolean);if(!corners.length)return false;
  const x0=Math.max(0,Math.floor(Math.min(...corners.map(q=>q.x)))),y0=Math.max(0,Math.floor(Math.min(...corners.map(q=>q.y)))),x1=Math.min(r.image.width,Math.ceil(Math.max(...corners.map(q=>q.x)))),y1=Math.min(r.image.height,Math.ceil(Math.max(...corners.map(q=>q.y))));
  const cw=x1-x0,ch=y1-y0;if(cw<2||ch<2){toast('La zona visible és massa petita per retallar');return false;}
  const c=document.createElement('canvas');c.width=cw;c.height=ch;const g=c.getContext('2d');g.drawImage(r.image,x0,y0,cw,ch,0,0,cw,ch);const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('No s’ha pogut crear el retall')),'image/png'));
  const image=await createImageBitmap(blob),a=r.affine,affine={A:a.A,B:a.B,C:a.A*x0+a.B*y0+a.C,D:a.D,E:a.E,F:a.D*x0+a.E*y0+a.F};
  const nr={id:'r'+Date.now()+Math.random().toString(16).slice(2),name:`${r.name.replace(/\.[^.]+$/,'')} · retall.png`,blob,sourceBlob:null,image,affine,georef:r.georef,visible:true,opacity:r.opacity,renderMode:r.renderMode||'auto',lightMode:true,meta:{sourceType:'image',croppedFrom:r.name,cropCreatedAt:Date.now()}};
  r.visible=false;releaseRasterHeavyMemory(r);state.rasters.push(nr);await dbPut('rasters',stripRaster(r));await dbPut('rasters',stripRaster(nr));nativeSyncRasterMeta(r);nativeSyncRasterMeta(nr);renderLayers();drawAll();toast('Retall creat · mapa original ocult');return true;
}
function setRasterLightMode(r,on){r.lightMode=!!on;if(r.lightMode)releaseRasterHeavyMemory(r);dbPut('rasters',stripRaster(r));nativeSyncRasterMeta(r);drawAll();}
function stripRaster(r){return{id:r.id,name:r.name,blob:r.blob,sourceBlob:r.sourceBlob||null,affine:r.affine,georef:r.georef,visible:r.visible,opacity:r.opacity,renderMode:r.renderMode||'auto',lightMode:!!r.lightMode,meta:r.meta||null,rasterStyle:r.rasterStyle||null,styleCache:r.styleCache||null};}
function moveRaster(index,dir){const ni=index+dir;if(ni<0||ni>=state.rasters.length)return;const [r]=state.rasters.splice(index,1);state.rasters.splice(ni,0,r);renderLayers();drawAll();}
async function deleteRaster(r){if(!confirm(`¿Eliminar el mapa ${r.name}?`))return;releaseRasterHeavyMemory(r,{keepPreview:false});state.rasters=state.rasters.filter(x=>x.id!==r.id);state.demGroups=(state.demGroups||[]).map(g=>({...g,rasterIds:(g.rasterIds||[]).filter(id=>id!==r.id)})).filter(g=>g.rasterIds.length);if(state.activeDemGroupId&&!state.demGroups.some(g=>g.id===state.activeDemGroupId))state.activeDemGroupId=null;await dbDelete('rasters',r.id);await dbDeleteRasterStyleTiles(r.id);if(ANDROID_NATIVE)nativeCall('deleteMap',state.projectId,r.id);persistState();renderLayers();drawAll();toast('Mapa eliminado');}

const pageMarkerImg=new Image();pageMarkerImg.onload=()=>{if(state.screen==='map')drawAll();};pageMarkerImg.src='icons/pagina.png';
const NOTEBOOK_PAGE_BASE={portrait:{w:820,h:1160},landscape:{w:1160,h:820}};
function ensureNotebookView(){
  state.notebookView=state.notebookView||{zoom:1,touches:new Map(),pinch:null,pan:null};
  if(!(state.notebookView.touches instanceof Map))state.notebookView.touches=new Map();
  if(!Number.isFinite(state.notebookView.zoom))state.notebookView.zoom=1;
  return state.notebookView;
}
function normalizeNotebookPage(p){
  if(!p)return p;p.bg=p.bg||appSettings.notebookBg||'white';p.ink=Array.isArray(p.ink)?p.ink:[];p.redo=Array.isArray(p.redo)?p.redo:[];p.links=Array.isArray(p.links)?p.links:[];p.orientation=p.orientation==='landscape'?'landscape':'portrait';return p;
}
function ensureNotebook(){
  state.notebook=state.notebook||{pages:[],currentPageId:null};
  state.notebook.pages=(state.notebook.pages||[]).map(normalizeNotebookPage);
  if(!state.notebook.pages.length){const p=makeNotebookPage();state.notebook.pages.push(p);state.notebook.currentPageId=p.id;}
  if(!state.notebook.currentPageId||!state.notebook.pages.some(p=>p.id===state.notebook.currentPageId))state.notebook.currentPageId=state.notebook.pages[0].id;
  ensureNotebookView();
}
function makeNotebookPage(copy=null){const n=state.notebook?.pages?.length||0;return normalizeNotebookPage({id:'N'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),number:n+1,createdAt:Date.now(),campaignId:state.campaign,author:currentCampaign()?.author||state.project?.author||'',bg:copy?.bg||appSettings.notebookBg||'white',orientation:copy?.orientation||'portrait',ink:copy?cloneAny(copy.ink||[]):[],redo:[],links:copy?cloneAny(copy.links||[]):[]});}
function currentNotebookPage(){ensureNotebook();return normalizeNotebookPage(state.notebook.pages.find(p=>p.id===state.notebook.currentPageId)||state.notebook.pages[0]);}
function notebookPageEditable(p=currentNotebookPage()){return isEditableCampaign()&&p.campaignId===state.editableCampaign;}
function notebookPageDimensions(p=currentNotebookPage()){const base=NOTEBOOK_PAGE_BASE[p?.orientation==='landscape'?'landscape':'portrait'],z=Math.max(.55,Math.min(2.5,ensureNotebookView().zoom||1));return{w:base.w*z,h:base.h*z,zoom:z};}
function applyNotebookPageGeometry(p=currentNotebookPage(),redraw=true){
  const paper=$('#notebookPaper'),c=$('#notebookCanvas');if(!paper||!c||!p)return;const d=notebookPageDimensions(p);
  paper.classList.toggle('portrait',p.orientation!=='landscape');paper.classList.toggle('landscape',p.orientation==='landscape');paper.style.width=`${Math.round(d.w)}px`;paper.style.height=`${Math.round(d.h)}px`;
  paper.style.setProperty('--notebook-rule-step',`${39*d.zoom}px`);paper.style.setProperty('--notebook-grid-step',`${32*d.zoom}px`);paper.style.setProperty('--notebook-dot-step',`${22*d.zoom}px`);
  const o=$('#notebookOrientationBtn span');if(o)o.textContent=p.orientation==='landscape'?'Horizontal':'Vertical';const z=$('#notebookZoomLabel');if(z)z.textContent=`${Math.round(d.zoom*100)}%`;
  if(redraw)requestAnimationFrame(()=>{resizeDrawCanvas(c);redrawInkStore(c);});
}
function commitNotebookPage(){const c=$('#notebookCanvas');if(!c||$('#notebookModal').classList.contains('hidden'))return;const p=currentNotebookPage();if(p&&notebookPageEditable(p)){p.ink=cloneAny(c._inkStore||[]);p.bg=$('#notebookBg').value||p.bg;p.redo=cloneAny(c._redoStore||[]);persistState();}}
function openNotebook(pageId=null){ensureNotebook();if(pageId&&state.notebook.pages.some(p=>p.id===pageId))state.notebook.currentPageId=pageId;ensureNotebookView().zoom=1;$('#notebookModal').classList.remove('hidden');setTimeout(()=>{renderNotebook();const v=$('#notebookPageViewport');if(v){v.scrollLeft=0;v.scrollTop=0;}},25);}
function closeNotebook(){commitNotebookPage();$('#notebookModal').classList.add('hidden');drawAll();}
function renderNotebookColors(){
  const root=$('#notebookQuickColors');if(!root)return;root.innerHTML='';const colors=Array.isArray(appSettings.notebookQuickColors)?appSettings.notebookQuickColors:DEFAULT_APP_SETTINGS.notebookQuickColors;const current=state.notebookPenColor||appSettings.notebookPenColor||colors[0];
  colors.forEach((color,i)=>{const b=document.createElement('button');b.className='notebook-color-slot'+(String(color).toLowerCase()===String(current).toLowerCase()?' active':'');b.type='button';b.title='Toca para usar · mantén pulsado para cambiar';b.style.setProperty('--swatch',color);b.innerHTML='<span></span>';let timer=null,long=false;
    b.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;long=false;timer=setTimeout(()=>{long=true;state.notebookEditingColorSlot=i;const pick=$('#notebookColorPicker');pick.value=color;pick.click();},520);});
    const stop=()=>{if(timer){clearTimeout(timer);timer=null;}};b.addEventListener('pointerleave',stop);b.addEventListener('pointercancel',stop);b.addEventListener('pointerup',()=>{stop();if(long)return;setNotebookPenColor(color);});root.appendChild(b);});
  const full=$('#notebookFullColorBtn');if(full)full.classList.toggle('active',!colors.some(c=>String(c).toLowerCase()===String(current).toLowerCase()));
}
function setNotebookPenColor(color){if(!/^#[0-9a-f]{6}$/i.test(String(color||'')))return;state.notebookPenColor=color;appSettings.notebookPenColor=color;saveAppSettings();renderNotebookColors();if(state.notebookTool!=='pen'){state.notebookTool='pen';$$('[data-notebook-tool]').forEach(x=>x.classList.toggle('active',x.dataset.notebookTool==='pen'));}}
function rotateInkStore(store,clockwise=true){return (store||[]).map(st=>{const r=cloneAny(st);r.pts=(r.pts||[]).map(p=>clockwise?{x:1-p.y,y:p.x}:{x:p.y,y:1-p.x});return r;});}
function rotateNotebookPage(){const p=currentNotebookPage();if(!notebookPageEditable(p)){toast('Esta página es de solo lectura');return;}commitNotebookPage();const clockwise=p.orientation!=='landscape';p.ink=rotateInkStore(p.ink,clockwise);p.redo=rotateInkStore(p.redo,clockwise);p.orientation=clockwise?'landscape':'portrait';ensureNotebookView().zoom=1;persistState();renderNotebook();const v=$('#notebookPageViewport');if(v){v.scrollLeft=0;v.scrollTop=0;}toast(p.orientation==='landscape'?'Página horizontal':'Página vertical');}
function renderNotebook(){
  ensureNotebook();const p=currentNotebookPage(),pages=state.notebook.pages,idx=pages.findIndex(x=>x.id===p.id),ro=!notebookPageEditable(p);$('#notebookPageCount').textContent=`Página ${idx+1} / ${pages.length}`;$('#notebookReadOnly').classList.toggle('hidden',!ro);$('#notebookBg').value=p.bg||'white';const paper=$('#notebookPaper');paper.className=`notebook-paper bg-${p.bg||'white'} ${p.orientation==='landscape'?'landscape':'portrait'}`;applyNotebookPageGeometry(p,false);const c=$('#notebookCanvas');resizeDrawCanvas(c);c._readOnly=ro;c._inkStore=cloneAny(p.ink||[]);c._redoStore=cloneAny(p.redo||[]);redrawInkStore(c);renderNotebookColors();$$('#notebookModal [data-notebook-tool],#notebookUndo,#notebookRedo,#notebookBg,#duplicateNotebookPage,#deleteNotebookPage,#notebookOrientationBtn').forEach(x=>x.disabled=ro);$('#linkPositionBtn').disabled=ro;$('#linkFeatureBtn').disabled=ro||!state.selectedId;const chips=$('#pageChips');chips.innerHTML='';pages.forEach((pg,i)=>{const b=document.createElement('button');b.textContent=i+1;b.className=pg.id===p.id?'active':'';b.onclick=()=>{commitNotebookPage();state.notebook.currentPageId=pg.id;ensureNotebookView().zoom=1;renderNotebook();const v=$('#notebookPageViewport');if(v){v.scrollLeft=0;v.scrollTop=0;}};chips.appendChild(b);});$('#notebookLinkSummary').textContent=(p.links||[]).length?`${p.links.length} vínculo${p.links.length===1?'':'s'}`:'Sin vínculos';requestAnimationFrame(()=>applyNotebookPageGeometry(p,true));
}
function newNotebookPage(copy=false){commitNotebookPage();if(!isEditableCampaign()){toast('Crea un Nuevo día para añadir páginas');return;}const src=copy?currentNotebookPage():null,p=makeNotebookPage(src);p.campaignId=state.editableCampaign;state.notebook.pages.push(p);state.notebook.currentPageId=p.id;ensureNotebookView().zoom=1;persistState();renderNotebook();}
function deleteNotebookPage(){const p=currentNotebookPage();if(!notebookPageEditable(p))return;if(state.notebook.pages.length===1){p.ink=[];p.links=[];p.redo=[];renderNotebook();persistState();return;}if(!confirm(`¿Eliminar la página ${state.notebook.pages.indexOf(p)+1}?`))return;const i=state.notebook.pages.indexOf(p);state.notebook.pages.splice(i,1);state.notebook.currentPageId=state.notebook.pages[Math.max(0,i-1)].id;ensureNotebookView().zoom=1;persistState();renderNotebook();drawAll();}
function gotoNotebookPage(delta){commitNotebookPage();const pages=state.notebook.pages,p=currentNotebookPage(),i=pages.indexOf(p),ni=Math.max(0,Math.min(pages.length-1,i+delta));state.notebook.currentPageId=pages[ni].id;ensureNotebookView().zoom=1;renderNotebook();const v=$('#notebookPageViewport');if(v){v.scrollLeft=0;v.scrollTop=0;}}
function installNotebookViewportGestures(){
  const vp=$('#notebookPageViewport');if(!vp||vp._gcGestures)return;vp._gcGestures=true;const view=ensureNotebookView();
  function points(){return [...view.touches.values()];}
  function beginPinch(){const ps=points();if(ps.length<2)return;const a=ps[0],b=ps[1],cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,dist=Math.max(10,Math.hypot(a.x-b.x,a.y-b.y)),paper=$('#notebookPaper'),r=paper.getBoundingClientRect();view.pinch={dist,zoom:view.zoom,cx,cy,nx:Math.max(0,Math.min(1,(cx-r.left)/Math.max(1,r.width))),ny:Math.max(0,Math.min(1,(cy-r.top)/Math.max(1,r.height)))};view.pan=null;}
  vp.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;e.preventDefault();view.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});vp.setPointerCapture?.(e.pointerId);if(view.touches.size===1)view.pan={id:e.pointerId,x:e.clientX,y:e.clientY};else if(view.touches.size===2)beginPinch();});
  vp.addEventListener('pointermove',e=>{if(e.pointerType!=='touch'||!view.touches.has(e.pointerId))return;e.preventDefault();const prev=view.touches.get(e.pointerId);view.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(view.touches.size>=2){if(!view.pinch)beginPinch();const ps=points(),a=ps[0],b=ps[1],dist=Math.max(10,Math.hypot(a.x-b.x,a.y-b.y)),cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,pinch=view.pinch,newZoom=Math.max(.55,Math.min(2.5,pinch.zoom*dist/pinch.dist));if(Math.abs(newZoom-view.zoom)>.002){view.zoom=newZoom;applyNotebookPageGeometry(currentNotebookPage(),true);const paper=$('#notebookPaper'),r=paper.getBoundingClientRect();vp.scrollLeft+=r.left+pinch.nx*r.width-cx;vp.scrollTop+=r.top+pinch.ny*r.height-cy;}return;}if(view.pan&&view.pan.id===e.pointerId){vp.scrollLeft-=e.clientX-prev.x;vp.scrollTop-=e.clientY-prev.y;view.pan.x=e.clientX;view.pan.y=e.clientY;}});
  const end=e=>{if(e.pointerType!=='touch')return;view.touches.delete(e.pointerId);if(view.touches.size<2)view.pinch=null;if(view.touches.size===1){const [id,p]=[...view.touches.entries()][0];view.pan={id,x:p.x,y:p.y};}else if(!view.touches.size)view.pan=null;};vp.addEventListener('pointerup',end);vp.addEventListener('pointercancel',end);
}
function campaignLineageIds(id=state.campaign){const set=new Set();let c=campaignById(id),guard=0;while(c&&guard++<100){set.add(c.id);c=c.parentId?campaignById(c.parentId):null;}return set;}
function collectNoteMarkers(){ensureNotebook();const out=[],allowed=campaignLineageIds();for(const p of state.notebook.pages){if(!allowed.has(p.campaignId))continue;for(const l of p.links||[]){if(l.type==='position')out.push({pageId:p.id,x:l.x,y:l.y});else if(l.type==='feature'){const f=state.features.find(x=>x.id===l.featureId);if(f?.points?.length){const q=f.closed?polygonCentroid(f.points):f.points[Math.floor(f.points.length/2)];out.push({pageId:p.id,x:q.x,y:q.y,featureId:f.id});}}}}return out;}
function drawNoteMarkers(){const marks=collectNoteMarkers();if(!marks.length)return;const grouped=[];for(const m of marks){const s=worldToScreen(m),g=grouped.find(x=>Math.hypot(x.s.x-s.x,x.s.y-s.y)<18);if(g)g.items.push(m);else grouped.push({s,items:[m]});}for(const g of grouped){mapCtx.save();if(pageMarkerImg.complete)mapCtx.drawImage(pageMarkerImg,g.s.x-12,g.s.y-12,24,24);else{mapCtx.fillStyle='#fff';mapCtx.strokeStyle='#25334a';mapCtx.fillRect(g.s.x-10,g.s.y-12,20,24);mapCtx.strokeRect(g.s.x-10,g.s.y-12,20,24);}if(g.items.length>1){mapCtx.fillStyle='#24324b';mapCtx.font='700 10px sans-serif';mapCtx.fillText(`×${g.items.length}`,g.s.x+8,g.s.y-8);}mapCtx.restore();}}
function nearestNoteMarker(sp){let best=null;for(const m of collectNoteMarkers()){const s=worldToScreen(m),d=Math.hypot(sp.x-s.x,sp.y-s.y);if(d<20&&(!best||d<best.d))best={...m,d};}return best;}
function openLinkPages(type){ensureNotebook();if(type==='position'&&!state.gnss){if(ANDROID_NATIVE){state.pendingNativeLinkPosition=true;toast('Obteniendo posición GNSS…');nativeCall('requestLocation');return;}if(!navigator.geolocation){toast('Geolocalización no disponible');return;}toast('Obteniendo posición actual…');navigator.geolocation.getCurrentPosition(pos=>{const u=lonLatToMapCoords(pos.coords.longitude,pos.coords.latitude);state.gnss={x:u.x,y:u.y,crs:u.epsg,lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy,altitude:pos.coords.altitude,heading:pos.coords.heading,speed:pos.coords.speed,timestamp:pos.timestamp||Date.now()};updateGnssUi();openLinkPages('position');drawAll();},err=>toast(`No se pudo obtener GNSS: ${err.message}`,3500),{enableHighAccuracy:true,timeout:12000,maximumAge:2000});return;}const target=type==='position'?{type:'position',x:state.gnss.x,y:state.gnss.y}:(state.selectedId?{type:'feature',featureId:state.selectedId}:null);if(!target){toast('Selecciona primero un elemento del mapa');return;}state.notebookLinkTarget=target;$('#linkPagesTitle').textContent=type==='position'?'Vincular páginas con posición actual':`Vincular páginas con ${target.featureId}`;const root=$('#linkPagesList');root.innerHTML='';state.notebook.pages.forEach((p,i)=>{const l=document.createElement('label');l.className='link-page-row';l.innerHTML=`<input type="checkbox" value="${p.id}" ${p.id===state.notebook.currentPageId?'checked':''}><img src="icons/pagina.png"><span><b>Página ${i+1}</b><small>${displayDate(campaignById(p.campaignId)?.date)||campaignLabel(p.campaignId)}</small></span>`;root.appendChild(l);});$('#linkPagesModal').classList.remove('hidden');}
function applyPageLinks(){const t=state.notebookLinkTarget;if(!t)return;const ids=$$('#linkPagesList input:checked').map(x=>x.value);if(!ids.length){toast('Selecciona al menos una página');return;}for(const id of ids){const p=state.notebook.pages.find(x=>x.id===id);if(!p)continue;p.links=p.links||[];const same=l=>l.type===t.type&&(t.type==='feature'?l.featureId===t.featureId:Math.hypot(l.x-t.x,l.y-t.y)<.01);if(!p.links.some(same))p.links.push(cloneAny(t));}persistState();$('#linkPagesModal').classList.add('hidden');renderNotebook();if(t.type==='feature'&&state.selectedId===t.featureId){const f=state.features.find(x=>x.id===t.featureId);if(f)showFeatureCard(f);}drawAll();toast(`${ids.length} página${ids.length===1?'':'s'} vinculada${ids.length===1?'':'s'}`);}
function openNotesForSelected(){ensureNotebook();const ids=state.notebook.pages.filter(p=>(p.links||[]).some(l=>l.type==='feature'&&l.featureId===state.selectedId));if(ids.length)openNotebook(ids[0].id);else{openNotebook();toast('No hay notas vinculadas todavía. Puedes vincular páginas desde la libreta.');}}

function choosePhoto(){if(!requireEditable('añadir fotografías'))return;state.pendingPhotoFor=state.selectedId;state.pendingPhotoLocation=null;$('#photoInput').click();setTimeout(()=>setTool('select'),100);}
async function photoChosen(file){
  if(!file){state.pendingPhotoLocation=null;return;}if(!requireEditable('añadir fotografías'))return;
  const id='p'+Date.now()+Math.random().toString(36).slice(2,5),g=state.gnss,loc=state.pendingPhotoLocation?{...state.pendingPhotoLocation}:null;
  const mapGnss=loc?{x:loc.x,y:loc.y,crs:loc.crs||workingMapEpsg(),lat:null,lon:null,accuracy:null,altitude:null,timestamp:Date.now(),source:'map'}:null;
  const rec={id,blob:file,name:file.name||`foto_${Date.now()}.jpg`,date:Date.now(),campaignId:state.campaign,featureId:state.pendingPhotoFor||null,heading:appSettings.photoHeading?(Number.isFinite(state.deviceHeading)?state.deviceHeading:(Number.isFinite(g?.heading)?g.heading:null)):null,gnss:mapGnss||(g?{x:g.x,y:g.y,crs:g.crs||workingMapEpsg(),lat:g.lat,lon:g.lon,accuracy:g.accuracy,altitude:appSettings.gpsAltitude?(g.altitude??null):null,timestamp:g.timestamp||Date.now()}:null)};
  await dbPut('photos',rec);nativeSyncPhotoMeta(rec);
  const f=state.features.find(x=>x.id===state.pendingPhotoFor);
  if(loc){state.mapPins=state.mapPins||[];state.mapPins.push({id:'mp'+Date.now().toString(36),kind:'photo',x:loc.x,y:loc.y,photoId:id,campaignId:state.campaign,createdAt:Date.now()});}
  state.pendingPhotoLocation=null;
  if(f){f.photos=f.photos||[];f.photos.push(id);persistState();toast(`Foto asociada a ${f.id}`);if(state.selectedId===f.id)showFeatureCard(f);if(!$('#photoGalleryModal').classList.contains('hidden'))openPhotoGallery(f.id);}
  else{persistState();drawAll();toast(loc?'Foto guardada en el punt del mapa':'Foto guardada sin elemento asociado');}
}
function gnssQuality(acc){return !Number.isFinite(acc)?'unknown':acc<=5?'good':acc<=12?'mid':'poor';}
function updateGnssUi(){
  const b=$('#gnssBadge');if(!b)return;const g=state.gnss;if(!g){b.classList.add('hidden');return;}
  const q=gnssQuality(g.accuracy);b.className=`gnss-badge quality-${q}`;b.classList.toggle('hidden',!appSettings.showAccuracy);b.textContent=`⌖ ±${Number.isFinite(g.accuracy)?Math.round(g.accuracy):'?'} m`;
  const d=$('#gnssDetails');if(d){const coordMode=appSettings.coordMode==='project'?((g.crs===4326||g.crs===4258)?'latlon':'utm'):appSettings.coordMode;let coordHtml='';if(coordMode==='latlon')coordHtml=`<dt>Latitud</dt><dd>${Number.isFinite(g.lat)?g.lat.toFixed(6):'—'}</dd><dt>Longitud</dt><dd>${Number.isFinite(g.lon)?g.lon.toFixed(6):'—'}</dd>`;else coordHtml=`<dt>UTM X</dt><dd>${formatNum(g.x,2)} m</dd><dt>UTM Y</dt><dd>${formatNum(g.y,2)} m</dd><dt>CRS GPS</dt><dd>EPSG:${g.crs||workingMapEpsg()}</dd>`;d.innerHTML=`<dl><dt>Precisión</dt><dd>${Number.isFinite(g.accuracy)?`±${formatNum(g.accuracy,1)} m`:'—'}</dd>${coordHtml}<dt>Altitud GNSS</dt><dd>${Number.isFinite(g.altitude)?formatLengthUnit(g.altitude,1):'—'}</dd><dt>Dirección</dt><dd>${Number.isFinite(state.deviceHeading)?Math.round(state.deviceHeading)+'°':'—'}</dd>${ANDROID_NATIVE?`<dt>Satélites visibles</dt><dd>${Number.isFinite(g.satellitesVisible)?g.satellitesVisible:'—'}</dd><dt>Usados en solución</dt><dd>${Number.isFinite(g.satellitesUsed)?g.satellitesUsed:'—'}</dd>`:''}<dt>Hora</dt><dd>${g.timestamp?new Date(g.timestamp).toLocaleTimeString('es-ES'):'—'}</dd></dl><div class="backup-note">${ANDROID_NATIVE?'GNSS obtenido mediante Android nativo.':'En la PWA el navegador no expone el número de satélites.'}</div>`;}
}
function gnssAccuracyWarning(g){const lim=+appSettings.gpsMinAccuracy||0;return lim>0&&Number.isFinite(g?.accuracy)&&g.accuracy>lim?`Precisión ±${Math.round(g.accuracy)} m · peor que el límite configurado (${lim} m)`:'';}
function gnssOutsideRasterMessage(g){const b=projectRasterBounds({visibleOnly:true})||projectRasterBounds();if(!b||!g)return'';return pointInBounds(g,b)?'':`La posición GNSS (EPSG:${g.crs||workingMapEpsg()}) queda fuera de la cartografía visible`; }

function locateMe(){
  if(ANDROID_NATIVE){state.nativeCenterOnNextGnss=true;toast('Buscando posición GNSS…');nativeCall('requestLocation');return;}
  if(!navigator.geolocation){toast('Geolocalización no disponible');return;}
  toast('Buscando posición…');navigator.geolocation.getCurrentPosition(pos=>{const u=lonLatToMapCoords(pos.coords.longitude,pos.coords.latitude);state.gnss={x:u.x,y:u.y,crs:u.epsg,lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy,altitude:pos.coords.altitude,heading:pos.coords.heading,speed:pos.coords.speed,timestamp:pos.timestamp||Date.now()};updateGnssUi();state.view.cx=u.x;state.view.cy=u.y;drawAll();const warn=gnssAccuracyWarning(state.gnss),outside=gnssOutsideRasterMessage(state.gnss);toast(warn||outside||`GNSS ±${Math.round(pos.coords.accuracy)} m · EPSG:${u.epsg}`,warn?4200:(outside?4200:2200));},err=>toast(`No se pudo obtener GNSS: ${err.message}`,3500),{enableHighAccuracy:true,timeout:12000,maximumAge:1000});
}

function closeFloatingPanels(except=''){for(const id of ['projectPanel','toolMenu','eraserMenu','materialPanel','layersPanel','campaignPanel','searchPanel','legendPanel'])if(id!==except)$('#'+id)?.classList.add('hidden');}

function featureSearchText(f){const m=materialById(f.material);return [f.id,f.type,m?.name,f.material,f.sectionProfile?.sourceName].filter(Boolean).join(' ').toLowerCase();}
function centerFeature(f){if(!f?.points?.length)return;fitBounds(featureBounds(f),.72);state.selectedId=f.id;showFeatureCard(f);drawAll();}
function renderSearchResults(){
  const root=$('#searchResults'),q=($('#searchInput')?.value||'').trim().toLowerCase();if(!root)return;root.innerHTML='';
  if(!q){root.innerHTML='<p class="muted">Busca por ID, material o tipo de elemento.</p>';return;}
  const hits=state.features.filter(f=>featureSearchText(f).includes(q)).slice(0,60);
  const pages=(state.notebook?.pages||[]).filter((p,i)=>`pagina ${i+1} ${campaignLabel(p.campaignId)}`.toLowerCase().includes(q)).slice(0,20);
  if(!hits.length&&!pages.length){root.innerHTML='<p class="muted">Sin resultados en la campaña actual.</p>';return;}
  for(const f of hits){const b=document.createElement('button');b.className='search-result';const icon=f.type==='section'?'icons/seccion.svg':f.type==='channel'?'icons/rio.png':'icons/material.png';b.innerHTML=`${iconImg(icon)}<span><b>${escapeHtml(f.id)}</b><small>${escapeHtml(materialById(f.material)?.name||f.type||'Elemento')}</small></span><em>${f.type==='section'?'Sección':f.type==='channel'?'Canal':'Mapa'}</em>`;b.onclick=()=>{centerFeature(f);$('#searchPanel').classList.add('hidden');};root.appendChild(b);}
  for(const p of pages){const i=state.notebook.pages.indexOf(p);const b=document.createElement('button');b.className='search-result';b.innerHTML=`${iconImg('icons/pagina.png')}<span><b>Página ${i+1}</b><small>${escapeHtml(campaignLabel(p.campaignId))}</small></span><em>Nota</em>`;b.onclick=()=>{openNotebook(p.id);$('#searchPanel').classList.add('hidden');};root.appendChild(b);}
}
function renderLegend(){
  const root=$('#legendList');if(!root)return;root.innerHTML='';const counts=new Map();
  for(const f of state.features){if(f.type==='section'||f.type==='channel')continue;const k=f.material||'coarse';counts.set(k,(counts.get(k)||0)+1);}
  if(!counts.size){root.innerHTML='<p class="muted">Todavía no hay unidades cartografiadas.</p>';return;}
  let last='';for(const m of materials.filter(m=>counts.has(m.id))){if(m.group!==last){const h=document.createElement('div');h.className='legend-group-title';h.textContent=m.group;root.appendChild(h);last=m.group;}const row=document.createElement('div');row.className='legend-row';row.innerHTML=`<span class="legend-swatch material-${m.id}"></span><b>${escapeHtml(m.name)}</b><span>${counts.get(m.id)}</span>`;root.appendChild(row);}
  const ch=state.features.filter(f=>f.type==='channel').length,se=state.features.filter(f=>f.type==='section').length;if(ch||se){const h=document.createElement('div');h.className='legend-group-title';h.textContent='OTROS';root.appendChild(h);if(ch){const r=document.createElement('div');r.className='legend-row';r.innerHTML='<span class="legend-swatch" style="background:linear-gradient(#fff,#fff);border-top:3px dashed #2464a4;height:8px"></span><b>Canales</b><span>'+ch+'</span>';root.appendChild(r);}if(se){const r=document.createElement('div');r.className='legend-row';r.innerHTML='<span class="legend-swatch" style="background:linear-gradient(#fff,#fff);border-top:3px solid #752c2c;height:8px"></span><b>Secciones</b><span>'+se+'</span>';root.appendChild(r);}}
}

function ensurePhotoEditorState(){
  state.photoEditor=state.photoEditor||{photoId:null,tool:'pen',color:state.notebookPenColor||appSettings.notebookPenColor||'#1f2b31',zoom:1,touches:new Map(),pinch:null,pan:null,objectUrl:null};
  state.photoEditor.touches=state.photoEditor.touches instanceof Map?state.photoEditor.touches:new Map();return state.photoEditor;
}
function photoInkRecordDraw(ctx,rec,w,h,active=false){const pts=rec?.pts||[];if(!pts.length)return;ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.globalCompositeOperation=rec.tool==='eraser'?'destination-out':'source-over';ctx.strokeStyle=rec.color||'#1f2b31';ctx.lineWidth=(rec.tool==='eraser'?24:3.2)*Math.max(1,Math.min(w,h)/900);ctx.beginPath();for(let i=0;i<pts.length;i++){const x=pts[i].x*w,y=pts[i].y*h;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}if(active&&pts.length===1){const q=pts[0];ctx.lineTo(q.x*w+.01,q.y*h+.01);}ctx.stroke();ctx.restore();}
function redrawPhotoEditorCanvas(){const c=$('#photoEditorCanvas'),st=ensurePhotoEditorState();if(!c)return;const ctx=c.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,c.width,c.height);for(const rec of c._inkStore||[])photoInkRecordDraw(ctx,rec,c.width,c.height,false);if(c._active)photoInkRecordDraw(ctx,c._active,c.width,c.height,true);}
function applyPhotoEditorGeometry(){const st=ensurePhotoEditorState(),img=$('#photoEditorImage'),stage=$('#photoEditorStage'),c=$('#photoEditorCanvas');if(!img||!stage||!c||!img.naturalWidth)return;const maxW=1100,maxH=760,base=Math.min(1,maxW/img.naturalWidth,maxH/img.naturalHeight),w=Math.max(240,Math.round(img.naturalWidth*base*st.zoom)),h=Math.max(180,Math.round(img.naturalHeight*base*st.zoom));stage.style.width=`${w}px`;stage.style.height=`${h}px`;c.width=Math.max(1,Math.round(w*Math.min(devicePixelRatio||1,2)));c.height=Math.max(1,Math.round(h*Math.min(devicePixelRatio||1,2)));if($('#photoEditorZoomLabel'))$('#photoEditorZoomLabel').textContent=`${Math.round(st.zoom*100)}%`;redrawPhotoEditorCanvas();}
function photoEditorNormPoint(e){const c=$('#photoEditorCanvas'),r=c.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/Math.max(1,r.width))),y:Math.max(0,Math.min(1,(e.clientY-r.top)/Math.max(1,r.height)))};}
function renderPhotoEditorColors(){const root=$('#photoEditorQuickColors'),st=ensurePhotoEditorState();if(!root)return;root.innerHTML='';const colors=Array.isArray(appSettings.notebookQuickColors)?appSettings.notebookQuickColors:DEFAULT_APP_SETTINGS.notebookQuickColors;for(const color of colors){const b=document.createElement('button');b.type='button';b.className='notebook-color-slot'+(String(color).toLowerCase()===String(st.color).toLowerCase()?' active':'');b.style.setProperty('--swatch',color);b.innerHTML='<span></span>';b.title='Color';b.onclick=()=>{st.color=color;st.tool='pen';syncPhotoEditorToolbar();renderPhotoEditorColors();};root.appendChild(b);}const full=$('#photoEditorFullColorBtn');if(full){full.style.setProperty('--swatch',st.color);full.classList.toggle('active',!colors.some(c=>String(c).toLowerCase()===String(st.color).toLowerCase()));}}
function syncPhotoEditorToolbar(){const st=ensurePhotoEditorState();$('#photoEditorPen')?.classList.toggle('active',st.tool==='pen');$('#photoEditorEraser')?.classList.toggle('active',st.tool==='eraser');}
function setPhotoEditorZoom(v,{center=null}={}){const st=ensurePhotoEditorState(),vp=$('#photoEditorViewport'),stage=$('#photoEditorStage');const old=st.zoom;st.zoom=Math.max(.45,Math.min(4,Number(v)||1));if(Math.abs(old-st.zoom)<.001)return;let nx=.5,ny=.5,cx=null,cy=null;if(center&&stage&&vp){const r=stage.getBoundingClientRect();nx=Math.max(0,Math.min(1,(center.x-r.left)/Math.max(1,r.width)));ny=Math.max(0,Math.min(1,(center.y-r.top)/Math.max(1,r.height)));cx=center.x;cy=center.y;}applyPhotoEditorGeometry();if(cx!=null)requestAnimationFrame(()=>{const r=stage.getBoundingClientRect();vp.scrollLeft+=r.left+nx*r.width-cx;vp.scrollTop+=r.top+ny*r.height-cy;});}
async function savePhotoEditor(){const st=ensurePhotoEditorState();if(!st.photoId)return false;const rec=await dbGet('photos',st.photoId);if(!rec)return false;const c=$('#photoEditorCanvas');rec.photoInk=cloneAny(c?._inkStore||[]);rec.photoRedo=cloneAny(c?._redoStore||[]);rec.photoInkUpdatedAt=Date.now();await dbPut('photos',rec);nativeSyncPhotoMeta(rec);return true;}
async function openPhotoEditor(photoId){const rec=await dbGet('photos',photoId);if(!rec){toast('No s’ha trobat la fotografia');return;}const st=ensurePhotoEditorState();if(st.objectUrl){URL.revokeObjectURL(st.objectUrl);st.objectUrl=null;}st.photoId=photoId;st.zoom=1;st.touches.clear();st.pinch=null;st.pan=null;st.objectUrl=URL.createObjectURL(rec.blob);$('#photoEditorTitle').textContent=rec.name||'Fotografia';const when=rec.date?new Date(rec.date).toLocaleString('es-ES'):'';$('#photoEditorMeta').textContent=[when,rec.gnss?.accuracy?`GNSS ±${Math.round(rec.gnss.accuracy)} m`:'',Number.isFinite(rec.heading)?`${Math.round(rec.heading)}°`:'' ].filter(Boolean).join(' · ');const img=$('#photoEditorImage'),c=$('#photoEditorCanvas');c._inkStore=cloneAny(rec.photoInk||[]);c._redoStore=cloneAny(rec.photoRedo||[]);c._active=null;img.onload=()=>{applyPhotoEditorGeometry();const vp=$('#photoEditorViewport');vp.scrollLeft=0;vp.scrollTop=0;};img.src=st.objectUrl;renderPhotoEditorColors();syncPhotoEditorToolbar();$('#photoEditorModal').classList.remove('hidden');}
async function closePhotoEditor({save=true}={}){if(save)await savePhotoEditor();const st=ensurePhotoEditorState();$('#photoEditorModal').classList.add('hidden');const c=$('#photoEditorCanvas');if(c)c._active=null;st.touches.clear();st.pinch=null;st.pan=null;if(st.objectUrl){URL.revokeObjectURL(st.objectUrl);st.objectUrl=null;}st.photoId=null;}
function installPhotoEditorInteractions(){const c=$('#photoEditorCanvas'),vp=$('#photoEditorViewport');if(!c||c._photoEditorInstalled)return;c._photoEditorInstalled=true;c.addEventListener('pointerdown',e=>{const st=ensurePhotoEditorState();if(e.pointerType==='touch')return;if(!isEditableCampaign())return;e.preventDefault();e.stopPropagation();c._active={tool:st.tool,color:st.color,pts:[photoEditorNormPoint(e)],pointerId:e.pointerId};c.setPointerCapture?.(e.pointerId);redrawPhotoEditorCanvas();});c.addEventListener('pointermove',e=>{if(!c._active||c._active.pointerId!==e.pointerId)return;e.preventDefault();e.stopPropagation();c._active.pts.push(photoEditorNormPoint(e));redrawPhotoEditorCanvas();});const finish=e=>{if(!c._active||(e&&c._active.pointerId!==e.pointerId))return;if(e){e.preventDefault();e.stopPropagation();}const rec={...c._active};delete rec.pointerId;c._inkStore=c._inkStore||[];c._inkStore.push(rec);c._redoStore=[];c._active=null;redrawPhotoEditorCanvas();};c.addEventListener('pointerup',finish);c.addEventListener('pointercancel',e=>{if(c._active?.pointerId===e.pointerId)c._active=null;redrawPhotoEditorCanvas();});
  if(vp&&!vp._photoGestures){vp._photoGestures=true;const st=ensurePhotoEditorState(),pt=e=>({x:e.clientX,y:e.clientY}),points=()=>[...st.touches.values()];vp.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;e.preventDefault();st.touches.set(e.pointerId,pt(e));vp.setPointerCapture?.(e.pointerId);if(st.touches.size===1)st.pan={id:e.pointerId,x:e.clientX,y:e.clientY,left:vp.scrollLeft,top:vp.scrollTop};else if(st.touches.size===2){const a=points()[0],b=points()[1];st.pinch={dist:Math.max(10,Math.hypot(a.x-b.x,a.y-b.y)),zoom:st.zoom,center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};st.pan=null;}});vp.addEventListener('pointermove',e=>{if(e.pointerType!=='touch'||!st.touches.has(e.pointerId))return;e.preventDefault();st.touches.set(e.pointerId,pt(e));if(st.touches.size>=2){const ps=points(),a=ps[0],b=ps[1];if(!st.pinch)st.pinch={dist:Math.max(10,Math.hypot(a.x-b.x,a.y-b.y)),zoom:st.zoom,center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};const dist=Math.max(10,Math.hypot(a.x-b.x,a.y-b.y)),center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};setPhotoEditorZoom(st.pinch.zoom*dist/st.pinch.dist,{center});return;}if(st.pan&&st.pan.id===e.pointerId){vp.scrollLeft=st.pan.left-(e.clientX-st.pan.x);vp.scrollTop=st.pan.top-(e.clientY-st.pan.y);}});const end=e=>{if(e.pointerType!=='touch')return;st.touches.delete(e.pointerId);if(st.touches.size<2)st.pinch=null;if(st.touches.size===1){const [id,p]=[...st.touches.entries()][0];st.pan={id,x:p.x,y:p.y,left:vp.scrollLeft,top:vp.scrollTop};}else if(!st.touches.size)st.pan=null;};vp.addEventListener('pointerup',end);vp.addEventListener('pointercancel',end);}}
function photoCompositeDataUrl(rec,maxSize=1800){return new Promise((resolve,reject)=>{if(!rec?.blob){resolve('');return;}const url=URL.createObjectURL(rec.blob),img=new Image();img.onload=()=>{try{const s=Math.min(1,maxSize/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*s));c.height=Math.max(1,Math.round(img.naturalHeight*s));const g=c.getContext('2d');g.drawImage(img,0,0,c.width,c.height);for(const ink of rec.photoInk||[])photoInkRecordDraw(g,ink,c.width,c.height,false);URL.revokeObjectURL(url);resolve(c.toDataURL('image/jpeg',.92));}catch(e){URL.revokeObjectURL(url);reject(e);}};img.onerror=()=>{URL.revokeObjectURL(url);resolve('');};img.src=url;});}

async function openPhotoGallery(featureId=state.selectedId){
  const f=state.features.find(x=>x.id===featureId);if(!f){toast('Selecciona primero un elemento');return;}state.pendingPhotoFor=f.id;
  $('#photoGalleryTitle').textContent=`Fotografías · ${f.id}`;const root=$('#photoGalleryGrid');root.innerHTML='';let shown=0;
  for(const pid of f.photos||[]){const rec=await dbGet('photos',pid);if(!rec)continue;shown++;const url=URL.createObjectURL(rec.blob),card=document.createElement('article');card.className='photo-card';const when=rec.date?new Date(rec.date).toLocaleString('es-ES'):'';const gn=rec.gnss?.accuracy?`GNSS ±${Math.round(rec.gnss.accuracy)} m`:'';const hd=Number.isFinite(rec.heading)?` · ${Math.round(rec.heading)}°`:'';card.innerHTML=`<img src="${url}" alt="${escapeHtml(rec.name||'Foto')}" title="Obrir fotografia"><div class="photo-card-meta"><b>${escapeHtml(rec.name||'Foto')}</b><span>${escapeHtml(when)}</span><span>${escapeHtml(gn+hd)}${rec.photoInk?.length?' · ✎ anotada':''}</span></div><div class="photo-card-actions"><button class="secondary photo-open">Obrir</button><button class="ghost danger-action photo-delete">Eliminar</button></div>`;const im=card.querySelector('img');im.onload=()=>URL.revokeObjectURL(url);im.onclick=()=>openPhotoEditor(pid);card.querySelector('.photo-open').onclick=()=>openPhotoEditor(pid);card.querySelector('.photo-delete').onclick=async()=>{if(!requireEditable('eliminar fotografías'))return;if(!confirm('¿Eliminar esta fotografía del proyecto?'))return;f.photos=f.photos.filter(x=>x!==pid);await dbDelete('photos',pid);if(ANDROID_NATIVE)nativeCall('deletePhoto',state.projectId,pid);persistState();if(state.selectedId===f.id)showFeatureCard(f);openPhotoGallery(f.id);};root.appendChild(card);}
  if(!shown)root.innerHTML='<div class="project-empty"><img src="icons/camara.png"><b>Sin fotografías</b><span>Añade la primera fotografía de este elemento.</span></div>';
  $('#photoGallerySummary').textContent=`${shown} fotografía${shown===1?'':'s'} · ${campaignLabel(state.campaign)}`;$('#addFeaturePhotoBtn').disabled=!isEditableCampaign();$('#photoGalleryModal').classList.remove('hidden');
}

const PACKAGE_MAGIC='GEOCAUCE11\n';
async function exportProjectPackage(){
  if(!state.projectId)return;persistState();toast('Preparando copia completa…',1800);
  const sv=JSON.parse(localStorage.getItem(projectStateKey(state.projectId))||'{}'),rasters=await dbAll('rasters'),photos=await dbAll('photos'),vectorLayers=await dbAll('vectorLayers'),assets=[];
  const addAsset=(blob,name)=>{if(!(blob instanceof Blob))return null;const idx=assets.length;assets.push({blob,name:name||`asset_${idx}`,type:blob.type||'application/octet-stream',size:blob.size});return idx;};
  const rr=rasters.map(r=>{const x={...r};delete x.blob;delete x.sourceBlob;return{...x,blobAsset:addAsset(r.blob,r.name+'.preview'),sourceAsset:addAsset(r.sourceBlob,r.name)};});
  const pp=photos.map(r=>{const x={...r};delete x.blob;return{...x,blobAsset:addAsset(r.blob,r.name)};});
  const vv=vectorLayers.map(r=>{const x={...r};delete x.features;delete x.renderBlob;const geom=new Blob([JSON.stringify(r.features||[])],{type:'application/json'});return{...x,featuresAsset:addAsset(geom,(r.name||r.id)+'.geometry.json'),renderAsset:addAsset(r.renderBlob,(r.name||r.id)+'.vector.png')};});
  const header={format:'GeoCaucePackage',containerVersion:1,appVersion:'0.16.36',exportedAt:Date.now(),project:cloneAny(state.project),state:sv,sectionPalette:cloneAny(sectionPalette),rasters:rr,photos:pp,vectorLayers:vv,assets:assets.map(a=>({name:a.name,type:a.type,size:a.size}))};
  const enc=new TextEncoder(),magic=enc.encode(PACKAGE_MAGIC),hb=enc.encode(JSON.stringify(header)),len=new ArrayBuffer(4);new DataView(len).setUint32(0,hb.length,true);const parts=[magic,len,hb,...assets.map(a=>a.blob)];
  const blob=new Blob(parts,{type:'application/octet-stream'});downloadBlob(blob,`${safeSlug(state.project?.name)}_${isoToday()}.geocauce`);toast(`Copia creada · ${formatBytes(blob.size)}`,3600);
}
function formatBytes(n){if(!Number.isFinite(n))return '—';const u=['B','KB','MB','GB'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++;}return `${n.toFixed(i?1:0)} ${u[i]}`;}
async function importProjectPackage(file){
  if(!file)return;try{toast('Leyendo proyecto…',1800);const enc=new TextEncoder(),magic=enc.encode(PACKAGE_MAGIC),prefix=new Uint8Array(await file.slice(0,magic.length+4).arrayBuffer());for(let i=0;i<magic.length;i++)if(prefix[i]!==magic[i])throw Error('No es una copia GeoCauce V0.11 válida');const hlen=new DataView(prefix.buffer,prefix.byteOffset+magic.length,4).getUint32(0,true);if(hlen<=0||hlen>20_000_000)throw Error('Cabecera de proyecto inválida');const hstart=magic.length+4,h=JSON.parse(new TextDecoder().decode(await file.slice(hstart,hstart+hlen).arrayBuffer()));if(h.format!=='GeoCaucePackage')throw Error('Formato no reconocido');let offset=hstart+hlen;const assetBlobs=[];for(const a of h.assets||[]){assetBlobs.push(file.slice(offset,offset+a.size,a.type||'application/octet-stream'));offset+=a.size;}
    if(state.projectId)persistState();const id='P'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),base=h.project||{},name0=base.name||'Proyecto importado',same=projectCatalog.some(p=>p.name===name0),meta={...base,id,name:same?`${name0} (importado)`:name0,createdAt:Date.now(),updatedAt:Date.now(),dbName:`GeoCauceDB_${id}`};projectCatalog.push(meta);saveProjectCatalog();localStorage.setItem(ACTIVE_PROJECT_KEY,id);const sv={...(h.state||{}),appVersion:'0.16.36',projectId:id};localStorage.setItem(projectStateKey(id),JSON.stringify(sv));if(Array.isArray(h.sectionPalette)&&h.sectionPalette.length){sectionPalette=h.sectionPalette;saveSectionPalette();}
    if(dbp){try{const d=await dbp;d.close();}catch{}dbp=null;dbpName=null;}state.projectId=id;state.project=meta;
    for(const r of h.rasters||[]){const rec={...r,blob:r.blobAsset!=null?assetBlobs[r.blobAsset]:null,sourceBlob:r.sourceAsset!=null?assetBlobs[r.sourceAsset]:null};delete rec.blobAsset;delete rec.sourceAsset;if(rec.styleCache)rec.styleCache={...rec.styleCache,ready:false,missing:true};if(rec.blob){await dbPut('rasters',rec);nativeSyncRasterMeta(rec);}}
    for(const ph of h.photos||[]){const rec={...ph,blob:ph.blobAsset!=null?assetBlobs[ph.blobAsset]:null};delete rec.blobAsset;if(rec.blob){await dbPut('photos',rec);nativeSyncPhotoMeta(rec);}}
    for(const vl of h.vectorLayers||[]){let features=[];if(vl.featuresAsset!=null&&assetBlobs[vl.featuresAsset]){try{features=JSON.parse(await assetBlobs[vl.featuresAsset].text());}catch(e){console.warn('Geometria vectorial de la còpia',e);}}else if(Array.isArray(vl.features))features=vl.features;const rec={...vl,features,renderBlob:vl.renderAsset!=null?assetBlobs[vl.renderAsset]:null};delete rec.renderAsset;delete rec.featuresAsset;await dbPut('vectorLayers',rec);}
    await openProject(id,{skipSave:true});toast(`Proyecto “${meta.name}” importado`,3800);
  }catch(e){console.error(e);toast(`No se pudo importar: ${e.message||e}`,6500);}
}

function makeRootCampaign(features=[],opts={}){
  const normalized=(features||[]).map(f=>normalizeFeature(f,'D01'));
  return {id:'D01',name:'Día 01',date:opts.date||today(),author:opts.author||state.project?.author||'',event:opts.event||'initial',notes:opts.notes||'',parentId:null,upserts:cloneAny(normalized),deleted:[],order:normalized.map(f=>f.id),createdAt:Date.now()};
}
function persistState(){
  if(!state.projectId)return;
  try{persistStateLocalOnly();scheduleCloudSync();}
  catch(e){console.warn('No se pudo guardar el estado',e);toast('⚠ No se pudo guardar el estado local. Haz una copia del proyecto.',4200);}
}

function restoreState(projectId=state.projectId){
  try{
    resetStateForProject(state.project);
    let rawState=localStorage.getItem(projectStateKey(projectId));
    if(!rawState&&ANDROID_NATIVE){try{const pack=JSON.parse(nativeCall('getProjectSnapshot',projectId)||'{}');if(pack?.state){rawState=JSON.stringify(pack.state);localStorage.setItem(projectStateKey(projectId),rawState);if(Array.isArray(pack.palette)&&pack.palette.length){sectionPalette=pack.palette;saveSectionPalette();}}}catch(e){console.warn('No se pudo restaurar SQLite',e);}}
    const sv=JSON.parse(rawState||'null');
    if(!sv){return;}
    state.tool=sv.appVersion?sv.tool||state.tool:'pan';state.material=sv.material||state.material;state.mapInk=Array.isArray(sv.mapInk)?sv.mapInk:[];state.mapInkColor=sv.mapInkColor||'#d73a49';state.mapInkWidth=Math.max(1,+sv.mapInkWidth||4);state.mapInkMode=sv.mapInkMode==='eraser'?'eraser':'pen';state.mapPins=Array.isArray(sv.mapPins)?sv.mapPins:[];state.historicalPhotoPoints=Array.isArray(sv.historicalPhotoPoints)?sv.historicalPhotoPoints:[];state.showHistoricalPhotoPoints=sv.showHistoricalPhotoPoints!==false;state.notebook=sv.notebook||state.notebook;state.activeCourseId=sv.activeCourseId||null;state.referenceLayers=Array.isArray(sv.referenceLayers)?sv.referenceLayers:[];state.demGroups=Array.isArray(sv.demGroups)?sv.demGroups:[];state.activeDemGroupId=sv.activeDemGroupId||null;state.view={...(sv.view||state.view),rotation:sv.view?.rotation||0};state.eraseMode=sv.eraseMode||state.eraseMode;state.eraseSize=sv.eraseSize||state.eraseSize;state.autoPanAfterDraw=sv.autoPanAfterDraw!==false;state.comparePrevious=!!sv.comparePrevious;state.compareOpacity=Number.isFinite(+sv.compareOpacity)?+sv.compareOpacity:.35;
    const alreadyIncremental=Array.isArray(sv.campaigns)&&sv.campaigns.length&&sv.campaigns.every(c=>Array.isArray(c.upserts)&&Array.isArray(c.deleted)&&Array.isArray(c.order));
    if(alreadyIncremental){
      state.campaigns=sv.campaigns.map(c=>({...c,parentId:c.parentId||null,author:c.author||'',event:c.event||'none',notes:c.notes||'',upserts:(c.upserts||[]).map(f=>normalizeFeature(f,c.id)),deleted:[...(c.deleted||[])],order:[...(c.order||[])],createdAt:c.createdAt||Date.now()}));
    }else if(Array.isArray(sv.campaigns)&&sv.campaigns.length){
      const old=sv.campaigns;state.campaigns=[];
      old.forEach((oc,i)=>{const parentId=(oc.parentId&&state.campaigns.some(c=>c.id===oc.parentId))?oc.parentId:(i?state.campaigns[i-1].id:null);const rec={id:oc.id||`D${String(i+1).padStart(2,'0')}`,name:oc.name||`Día ${String(i+1).padStart(2,'0')}`,date:oc.date||today(),author:oc.author||'',event:oc.event||'none',notes:oc.notes||'',parentId,upserts:[],deleted:[],order:[],createdAt:oc.createdAt||Date.now()};state.campaigns.push(rec);const curr=(oc.features||[]).map(f=>normalizeFeature(f,rec.id));computeCampaignDelta(rec,curr);});
    }else{const legacy=(sv.features||[]).map(f=>normalizeFeature(f,'D01'));state.campaigns=[makeRootCampaign(legacy,{date:displayDate(state.project?.startDate)||today(),author:state.project?.author||''})];}
    if(!state.campaigns.length)state.campaigns=[makeRootCampaign([],{date:displayDate(state.project?.startDate)||today(),author:state.project?.author||''})];
    const ids=new Set(state.campaigns.map(c=>c.id));state.editableCampaign=ids.has(sv.editableCampaign)?sv.editableCampaign:state.campaigns[state.campaigns.length-1].id;state.campaign=ids.has(sv.campaign)?sv.campaign:state.editableCampaign;state.features=materializeCampaign(state.campaign);if(state.activeCourseId&&!state.features.some(f=>f.id===state.activeCourseId&&f.type==='watercourse'))state.activeCourseId=null;
  }catch(e){console.warn(e);resetStateForProject(state.project);}
}

function geoJsonGeometry(f){if(f.closed)return{type:'Polygon',coordinates:[[...f.points,f.points[0]].map(p=>[p.x,p.y])]};if(f.type==='watercourse'&&courseFragments(f).length>1)return{type:'MultiLineString',coordinates:courseFragments(f).map(a=>a.map(p=>[p.x,p.y]))};return{type:'LineString',coordinates:(f.points||[]).map(p=>[p.x,p.y])};}
function exportGeoJSON(){
  const fc={type:'FeatureCollection',geocauce:{version:'0.16.36',project:state.project?{id:state.project.id,name:state.project.name,zone:state.project.zone,torrent:state.project.torrent,author:state.project.author,institution:state.project.institution,startDate:state.project.startDate,crs:state.project.crs,objective:state.project.objective,methodology:state.project.methodology,notes:state.project.notes}:null,campaign:cloneAny(currentCampaign())},features:state.features.map(f=>({type:'Feature',properties:{id:f.id,type:f.type,material:f.material||null,campaign:state.campaign,created_campaign:f.createdCampaign||null,date:f.date,area_m2:featureArea(f),erased_zones:(f.erasures||[]).length,dem_source:f.sectionProfile?.sourceName||f.longitudinalProfile?.sourceName||null,section_length_m:f.sectionProfile?.length||null,profile_edited:!!f.sectionProfile?.manual?.length},geometry:geoJsonGeometry(f)}))};
  downloadBlob(new Blob([JSON.stringify(fc,null,2)],{type:'application/geo+json'}),`${safeSlug(state.project?.name)}_${state.campaign}.geojson`);
}
async function downloadBlob(blob,name){
  if(ANDROID_NATIVE&&window.GeoCauceNative?.beginFileSave){
    const token=nativeCall('beginFileSave',name,blob.type||'application/octet-stream');if(!token){toast('No se pudo crear el archivo en Android');return;}
    try{const chunk=256*1024;for(let off=0;off<blob.size;off+=chunk){const data=await blob.slice(off,Math.min(blob.size,off+chunk)).arrayBuffer();const u=new Uint8Array(data);let bin='';for(let i=0;i<u.length;i+=0x8000)bin+=String.fromCharCode(...u.subarray(i,Math.min(i+0x8000,u.length)));if(!nativeCall('appendFileChunk',token,btoa(bin)))throw Error('Error escribiendo el archivo');}const uri=nativeCall('finishFileSave',token);toast(uri?'Guardado en Descargas/GeoCauce':'No se pudo finalizar el archivo',3600);}
    catch(e){nativeCall('cancelFileSave',token);console.error(e);toast('Error guardando: '+(e.message||e),5000);}return;
  }
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function clearProject(){if(!state.projectId||!confirm(`¿Vaciar todos los mapas, fotos, campañas y dibujos de “${state.project?.name||'este proyecto'}”? La información general del proyecto se conservará.`))return;localStorage.removeItem(projectStateKey(state.projectId));await dbClear('rasters');await dbClear('photos');await dbClear('rasterStyleTiles');await dbClear('vectorLayers');resetStateForProject(state.project);hideFeatureCard();updateCampaignUi();renderLayers();renderSectionList();drawAll();persistState();toast('Datos del proyecto vaciados');}

let dbp=null,dbpName=null;
function db(){const name=state.project?.dbName||'GeoCauceDB_scratch';if(dbp&&dbpName===name)return dbp;if(dbp){dbp.then(d=>{try{d.close();}catch{}}).catch(()=>{});dbp=null;}dbpName=name;dbp=new Promise((resolve,reject)=>{const req=indexedDB.open(name,3);req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains('rasters'))d.createObjectStore('rasters',{keyPath:'id'});if(!d.objectStoreNames.contains('photos'))d.createObjectStore('photos',{keyPath:'id'});if(!d.objectStoreNames.contains('rasterStyleTiles')){const st=d.createObjectStore('rasterStyleTiles',{keyPath:'key'});st.createIndex('rasterId','rasterId',{unique:false});}if(!d.objectStoreNames.contains('vectorLayers'))d.createObjectStore('vectorLayers',{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});return dbp;}
async function dbPut(store,obj){const d=await db();return new Promise((res,rej)=>{const tx=d.transaction(store,'readwrite');tx.objectStore(store).put(obj);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function dbGet(store,key){const d=await db();return new Promise((res,rej)=>{const r=d.transaction(store).objectStore(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function dbAll(store){const d=await db();return new Promise((res,rej)=>{const r=d.transaction(store).objectStore(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function dbClear(store){const d=await db();return new Promise((res,rej)=>{const tx=d.transaction(store,'readwrite');tx.objectStore(store).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function dbDelete(store,key){const d=await db();return new Promise((res,rej)=>{const tx=d.transaction(store,'readwrite');tx.objectStore(store).delete(key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function dbDeleteRasterStyleTiles(rasterId){const d=await db();if(!d.objectStoreNames.contains('rasterStyleTiles'))return;return new Promise((res,rej)=>{const tx=d.transaction('rasterStyleTiles','readwrite'),st=tx.objectStore('rasterStyleTiles'),idx=st.index('rasterId'),req=idx.openCursor(IDBKeyRange.only(rasterId));req.onsuccess=()=>{const cur=req.result;if(cur){cur.delete();cur.continue();}};tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}


// ---------- Cursos, tramos y FITXA I (v0.16.8) ----------
function hydroCourses(){return state.features.filter(f=>f.type==='watercourse');}
function hydroBasins(){return state.features.filter(f=>f.type==='basin');}
function activeCourse(){return state.features.find(f=>f.type==='watercourse'&&f.id===state.activeCourseId)||null;}
function nextHydroId(prefix){let n=0;for(const f of state.features){const m=String(f.id||'').match(new RegExp('^'+prefix+'-(\\d+)$'));if(m)n=Math.max(n,+m[1]);}return `${prefix}-${String(n+1).padStart(3,'0')}`;}
function courseFragments(course){if(!course)return[];if(!Array.isArray(course.fragments)||!course.fragments.length)course.fragments=course.points?.length?[cloneAny(course.points)]:[];course.fragments=course.fragments.filter(a=>Array.isArray(a)&&a.length>1);course.points=cloneAny(course.fragments[0]||[]);return course.fragments;}
function setCourseFragments(course,frags){course.fragments=(frags||[]).filter(a=>Array.isArray(a)&&a.length>1).map(a=>cloneAny(a));course.points=cloneAny(course.fragments[0]||[]);course.longitudinalProfile=null;}
function polylineLength(pts){let d=0;for(let i=1;i<(pts||[]).length;i++)d+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);return d;}
function courseReaches(courseId){return state.features.filter(f=>f.type==='reach'&&f.courseId===courseId);}
function reachPattern(){const p=String(appSettings.reachPattern||'{CURS}-{N}').trim();return p.includes('{N}')?p:'{CURS}-{N}';}
function reachCodeFor(course,n){return reachPattern().replaceAll('{CURS}',course?.abbr||'TR').replaceAll('{N}',String(n));}
const COURSE_NODE_TOL=0.18;
function pointDistance(a,b){return(!a||!b)?Infinity:Math.hypot(a.x-b.x,a.y-b.y);}
function captureCourseReachAnchors(course){const frags=courseFragments(course);return courseReaches(course.id).map(r=>{const fi=Number.isInteger(r.fragmentIndex)?r.fragmentIndex:0,frag=frags[fi],start=frag&&Number.isFinite(+r.startAlong)?pointAtAlong(frag,+r.startAlong):r.points?.[0],end=frag&&Number.isFinite(+r.endAlong)?pointAtAlong(frag,+r.endAlong):r.points?.at(-1);return{id:r.id,start:start?{...start}:null,end:end?{...end}:null};});}
function remapCourseReaches(course,anchors){const frags=courseFragments(course);for(const a of anchors||[]){const r=state.features.find(f=>f.id===a.id&&f.type==='reach'&&f.courseId===course.id);if(!r||!a.start||!a.end)continue;let best=null;for(let fi=0;fi<frags.length;fi++){const ps=projectPointToPolyline(a.start,frags[fi]),pe=projectPointToPolyline(a.end,frags[fi]);if(!ps||!pe)continue;const score=ps.d+pe.d;if(!best||score<best.score)best={fi,ps,pe,score};}if(!best)continue;const d0=Math.min(best.ps.along,best.pe.along),d1=Math.max(best.ps.along,best.pe.along);r.fragmentIndex=best.fi;r.startAlong=d0;r.endAlong=d1;r.points=slicePolylineByAlong(frags[best.fi],d0,d1);r.mdeStats=null;delete r.topologyIssue;}}
function normalizeCourseFragments(course,{remapReaches=true}={}){
  if(!course)return{changed:false,components:0,ambiguous:false};
  const source=courseFragments(course).map((pts,index)=>({index,pts:cloneAny(pts)}));if(source.length<2){course.topologyIssue='';return{changed:false,components:source.length,ambiguous:false};}
  const anchors=remapReaches?captureCourseReachAnchors(course):[];
  const nodes=[];const nodeFor=p=>{let best=-1,bd=Infinity;for(let i=0;i<nodes.length;i++){const d=pointDistance(p,nodes[i].point);if(d<=COURSE_NODE_TOL&&d<bd){best=i;bd=d;}}if(best<0){nodes.push({point:{...p},edges:[]});best=nodes.length-1;}return best;};
  const edges=source.map(item=>{const a=nodeFor(item.pts[0]),b=nodeFor(item.pts.at(-1)),e={index:item.index,pts:item.pts,a,b};nodes[a].edges.push(e.index);nodes[b].edges.push(e.index);return e;});
  const edgeByIndex=new Map(edges.map(e=>[e.index,e])),seen=new Set(),components=[];
  for(const e0 of edges){if(seen.has(e0.index))continue;const q=[e0.index],ids=[],nodeIds=new Set();seen.add(e0.index);while(q.length){const ei=q.pop(),e=edgeByIndex.get(ei);if(!e)continue;ids.push(ei);nodeIds.add(e.a);nodeIds.add(e.b);for(const ni of [e.a,e.b])for(const ej of nodes[ni].edges)if(!seen.has(ej)){seen.add(ej);q.push(ej);}}components.push({ids:ids.sort((a,b)=>a-b),nodeIds:[...nodeIds],minIndex:Math.min(...ids)});}
  const merged=[];let ambiguous=false;
  for(const comp of components.sort((a,b)=>a.minIndex-b.minIndex)){
    const compSet=new Set(comp.ids),deg=new Map(comp.nodeIds.map(ni=>[ni,nodes[ni].edges.filter(ei=>compSet.has(ei)).length]));
    if([...deg.values()].some(v=>v>2)){ambiguous=true;for(const ei of comp.ids)merged.push(cloneAny(edgeByIndex.get(ei).pts));continue;}
    const anchor=edgeByIndex.get(comp.minIndex),ends=comp.nodeIds.filter(ni=>(deg.get(ni)||0)===1);
    const traverse=start=>{const used=new Set(),parts=[],pts=[];let current=start;while(used.size<comp.ids.length){const opts=nodes[current].edges.filter(ei=>compSet.has(ei)&&!used.has(ei));if(opts.length!==1)break;const ei=opts[0],e=edgeByIndex.get(ei),rev=e.b===current,next=rev?e.a:e.b,seg=rev?[...e.pts].reverse():cloneAny(e.pts);seg[0]={...nodes[current].point};seg[seg.length-1]={...nodes[next].point};parts.push({edgeIndex:ei,reversed:rev});if(!pts.length)pts.push(...seg);else pts.push(...seg.slice(1));used.add(ei);current=next;}return{used,parts,pts};};
    let choices=ends.length?ends:[anchor.a];let best=null;for(const start of choices){const t=traverse(start),anchorPart=t.parts.find(x=>x.edgeIndex===anchor.index),score=t.used.size*1000+(anchorPart&&!anchorPart.reversed?10:0);if(!best||score>best.score)best={...t,score};}
    if(!best||best.used.size!==comp.ids.length||best.pts.length<2){ambiguous=true;for(const ei of comp.ids)merged.push(cloneAny(edgeByIndex.get(ei).pts));continue;}
    merged.push(best.pts);
  }
  const before=JSON.stringify(source.map(x=>x.pts)),after=JSON.stringify(merged),changed=before!==after;
  if(changed)setCourseFragments(course,merged);course.topologyIssue=ambiguous?'S’han detectat connexions amb bifurcació o ordre ambigu. Revisa el curs.':'';course.topologyComponents=merged.length;
  if(changed&&remapReaches)remapCourseReaches(course,anchors);
  return{changed,components:merged.length,ambiguous};
}
function fragmentOriented(item,reversed=false){return{...item,pts:reversed?[...item.pts].reverse():cloneAny(item.pts),reversed:!!reversed};}
function fragmentGap(a,b){return pointDistance(a?.pts?.at(-1),b?.pts?.[0]);}
function spatiallyOrderedCourseFragments(course){
  normalizeCourseFragments(course,{remapReaches:true});
  const raw=courseFragments(course).map((pts,fragmentIndex)=>({fragmentIndex,pts:cloneAny(pts),reversed:false}));
  if(raw.length<2)return raw;
  const n=raw.length,EPS=.000001;
  // Per a pocs fragments podem trobar la cadena que minimitza la suma dels buits entre extrems.
  // Això evita concatenar "part baixa -> part alta" només per l'ordre en què s'han dibuixat.
  if(n<=9){
    const key=(mask,last,rev)=>`${mask}|${last}|${rev?1:0}`,dp=new Map();
    for(let i=0;i<n;i++)for(let rev=0;rev<2;rev++){
      const item=fragmentOriented(raw[i],!!rev);
      dp.set(key(1<<i,i,rev),{cost:0,path:[item]});
    }
    for(let mask=1;mask<(1<<n);mask++){
      for(let last=0;last<n;last++)for(let rev=0;rev<2;rev++){
        const cur=dp.get(key(mask,last,rev));if(!cur)continue;
        const tail=cur.path.at(-1);
        for(let j=0;j<n;j++)if(!(mask&(1<<j)))for(let rj=0;rj<2;rj++){
          const next=fragmentOriented(raw[j],!!rj),cost=cur.cost+fragmentGap(tail,next),nk=key(mask|(1<<j),j,rj),prev=dp.get(nk);
          if(!prev||cost<prev.cost-EPS)dp.set(nk,{cost,path:[...cur.path,next]});
        }
      }
    }
    const full=(1<<n)-1,candidates=[];
    for(let last=0;last<n;last++)for(let rev=0;rev<2;rev++){const v=dp.get(key(full,last,rev));if(v)candidates.push(v);}
    candidates.sort((a,b)=>{
      const da=a.cost-b.cost;if(Math.abs(da)>EPS)return da;
      const fa=a.path.find(x=>x.fragmentIndex===0),fb=b.path.find(x=>x.fragmentIndex===0);
      // En empat, mantenim el sentit original del primer fragment creat.
      return Number(!!fa?.reversed)-Number(!!fb?.reversed);
    });
    return candidates[0]?.path||raw;
  }
  // Fallback escalable: parteix del primer fragment i afegeix sempre el fragment més proper
  // a qualsevol dels dos extrems de la cadena, preservant quan es pot el sentit del primer.
  let chain=[fragmentOriented(raw[0],false)],remaining=raw.slice(1);
  while(remaining.length){
    let best=null;
    for(let i=0;i<remaining.length;i++)for(let rev=0;rev<2;rev++){
      const item=fragmentOriented(remaining[i],!!rev);
      const tailCost=fragmentGap(chain.at(-1),item);
      const headItem={...item,pts:[...item.pts].reverse(),reversed:!item.reversed};
      const headCost=fragmentGap(headItem,chain[0]);
      for(const cand of [{i,where:'tail',item,cost:tailCost},{i,where:'head',item:headItem,cost:headCost}])if(!best||cand.cost<best.cost)best=cand;
    }
    const [picked]=remaining.splice(best.i,1);
    if(best.where==='tail')chain.push(best.item);else chain.unshift(best.item);
  }
  return chain;
}
function chainedCourseFragments(course){return spatiallyOrderedCourseFragments(course);}
function orderedCourseReaches(courseId){
  const c=state.features.find(f=>f.id===courseId&&f.type==='watercourse');const rs=courseReaches(courseId).slice();
  if(c?.direction==='entry'){rs.sort((a,b)=>(a.createdOrder||a.createdAt||0)-(b.createdOrder||b.createdAt||0));return rs;}
  const seq=courseProfileFragments(c),rank=new Map(seq.map((x,i)=>[x.fragmentIndex,{i,reversed:x.reversed,length:polylineLength(courseFragments(c)[x.fragmentIndex]||[])}]));
  rs.sort((a,b)=>{const ra=rank.get(a.fragmentIndex||0)||{i:999,reversed:false,length:0},rb=rank.get(b.fragmentIndex||0)||{i:999,reversed:false,length:0},ma=(a.startAlong+a.endAlong)/2,mb=(b.startAlong+b.endAlong)/2,pa=ra.reversed?ra.length-ma:ma,pb=rb.reversed?rb.length-mb:mb;return ra.i-rb.i||pa-pb;});return rs;
}
function renumberCourseReaches(courseId){const c=state.features.find(f=>f.id===courseId&&f.type==='watercourse');if(!c)return;orderedCourseReaches(courseId).forEach((r,i)=>r.reachCode=reachCodeFor(c,i+1));}
function updateHydroFab(){const f=$('#profileSheetFab');if(!f)return;const c=activeCourse(),show=!!c&&['watercourse','reach'].includes(state.tool);f.classList.toggle('hidden',!show);if(c)$('#profileSheetFabLabel').textContent=`Fitxa ${c.abbr||c.name||''}`;if(show&&$('#activeToolBtn span'))$('#activeToolBtn span').textContent=`${state.tool==='reach'?'Trams':'Curs'} · ${c.abbr||c.name}`;let b=$('#hydroActiveBadge');if(show&&!b){b=document.createElement('div');b.id='hydroActiveBadge';b.className='hydro-active-badge';$('#mapScreen').appendChild(b);}if(b){b.classList.toggle('hidden',!show);if(c)b.textContent=`${state.tool==='reach'?'Trams':'Curs'} · ${c.abbr||c.name}`;}}
function projectPointToPolyline(p,pts){let best=null,total=0;const seg=[];for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],len=Math.hypot(b.x-a.x,b.y-a.y);seg.push(len);total+=len;}for(let i=1,base=0;i<pts.length;i++){const a=pts[i-1],b=pts[i],dx=b.x-a.x,dy=b.y-a.y,len=seg[i-1]||0,den=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/den)),q={x:a.x+t*dx,y:a.y+t*dy},d=Math.hypot(p.x-q.x,p.y-q.y),aDist=base+t*len;if(!best||d<best.d)best={segment:i-1,t,point:q,d,along:aDist,total};base+=len;}return best;}
function projectPointToCourse(p,course){let best=null;courseFragments(course).forEach((pts,fragmentIndex)=>{const q=projectPointToPolyline(p,pts);if(q&&(!best||q.d<best.d))best={...q,fragmentIndex};});return best;}
function nearestReachAssociation(p,tolWorld=null){
  const tol=Number.isFinite(tolWorld)?tolWorld:Math.max(1.5,18/Math.max(.001,state.view.scale));let best=null;
  for(const r of state.features.filter(x=>x.type==='reach'&&x.points?.length>1)){
    const q=projectPointToPolyline(p,r.points);if(!q||q.d>tol)continue;
    if(!best||q.d<best.projection.d)best={reach:r,course:reachCourse(r),projection:q,point:{...q.point},ratio:q.total?Math.max(0,Math.min(1,q.along/q.total)):0};
  }
  return best;
}
function sectionAssociationFromLine(a,b){
  const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};let best=null;
  for(const r of state.features.filter(x=>x.type==='reach'&&x.points?.length>1)){
    for(let i=1;i<r.points.length;i++){
      const t=segmentIntersectionT(a,b,r.points[i-1],r.points[i]);if(t==null)continue;const q=linePoint(a,b,t),pr=projectPointToPolyline(q,r.points),score=Math.hypot(q.x-mid.x,q.y-mid.y);
      if(!best||score<best.score)best={reach:r,course:reachCourse(r),projection:pr,point:q,ratio:pr?.total?pr.along/pr.total:0,score};
    }
  }
  return best||nearestReachAssociation(mid,Math.max(2.5,24/Math.max(.001,state.view.scale)));
}
function nextSectionNameForReach(reach,ratio=.5){
  if(!reach)return'';const used=new Set(state.features.filter(x=>x.type==='section'&&x.reachId===reach.id).map(x=>String(x.sectionName||x.sheetIII?.sectionName||'').toUpperCase()));
  if(ratio<=.18&&!used.has('S1'))return'S1';if(ratio>=.82&&!used.has('S2'))return'S2';let n=3;while(used.has('S'+n))n++;return'S'+n;
}
function createSectionFeature(a,b,assoc=null){
  const f={id:uid('section'),type:'section',points:[a,b],closed:false,material:null,campaign:state.campaign,date:today(),ink:[],photos:[],erasures:[],sectionInk:[],sectionObjects:[],sectionProfile:null,sectionView:{gridStep:1,verticalScale:'1',zoomX:1,centerD:null},sectionMeasurements:{width:'',depth:'',note:'',widthInk:[],depthInk:[],noteInk:[]},sheetIII:defaultSectionSheetIII()};
  if(assoc?.reach){f.reachId=assoc.reach.id;f.courseId=assoc.reach.courseId;f.reachAlong=assoc.projection?.along??null;f.anchorPoint=assoc.point?{...assoc.point}:null;f.sectionName=nextSectionNameForReach(assoc.reach,assoc.ratio);f.sheetIII.sectionName=f.sectionName;const old=assoc.reach.sheetII?.fic;if(old&&!state.features.some(x=>x.type==='section'&&x.reachId===assoc.reach.id&&x.sheetIII?.fic)){f.sheetIII.fic=cloneAny(normalizeSectionSheetIII({fic:old}).fic);}}
  else{f.sectionName=f.id;f.sheetIII.sectionName=f.id;}
  state.features.push(f);state.selectedId=f.id;persistState();drawAll();renderSectionList();openSection(f);return f;
}
function associateSectionIfNeeded(f){if(!f||f.type!=='section'||f.reachId||!f.points?.length)return null;const a=f.points[0],b=f.points.at(-1),assoc=sectionAssociationFromLine(a,b);if(!assoc?.reach)return null;f.reachId=assoc.reach.id;f.courseId=assoc.reach.courseId;f.reachAlong=assoc.projection?.along??null;f.anchorPoint=assoc.point?{...assoc.point}:null;f.sectionName=f.sectionName&&f.sectionName!==f.id?f.sectionName:nextSectionNameForReach(assoc.reach,assoc.ratio);const d=ensureSectionSheetData(f);d.sectionName=f.sectionName;const old=assoc.reach.sheetII?.fic,hasOld=old&&['ad','bd','cd','dd1','dd2'].some(k=>optionalScore(old?.[k]?.score)!==null||(old?.[k]?.noteInk?.length));const hasNew=['ad','bd','cd','dd1','dd2'].some(k=>optionalScore(d.fic?.[k]?.score)!==null||(d.fic?.[k]?.noteInk?.length));if(hasOld&&!hasNew)d.fic=cloneAny(normalizeSectionSheetIII({fic:old}).fic);persistState();return assoc;}
function polygonSignedArea(pts){let a=0;for(let i=0,j=pts.length-1;i<pts.length;j=i++)a+=(pts[j].x*pts[i].y-pts[i].x*pts[j].y);return a/2;}
function sectionBasinAtPoint(p){
  const list=state.features.filter(f=>f.type==='basin'&&f.closed&&f.points?.length>=3&&pointInPoly(p,f.points));
  if(!list.length)return null;
  list.sort((a,b)=>Math.abs(polygonSignedArea(a.points))-Math.abs(polygonSignedArea(b.points)));
  return list[0];
}
function basinLongAxis(basin){
  const pts=basin?.points||[];if(pts.length<2)return null;
  let cx=0,cy=0;for(const q of pts){cx+=q.x;cy+=q.y;}cx/=pts.length;cy/=pts.length;
  let xx=0,xy=0,yy=0;for(const q of pts){const x=q.x-cx,y=q.y-cy;xx+=x*x;xy+=x*y;yy+=y*y;}
  const ang=.5*Math.atan2(2*xy,xx-yy),ax=Math.cos(ang),ay=Math.sin(ang);
  return{x:ax,y:ay,cx,cy};
}
function lineAcrossBasin(basin,anchor,dir){
  if(!basin?.points?.length||!anchor||!dir)return null;const L=Math.hypot(dir.x,dir.y)||1,n={x:dir.x/L,y:dir.y/L},hits=[];
  const cross=(a,b)=>a.x*b.y-a.y*b.x,pts=basin.points;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const q=pts[j],r=pts[i],e={x:r.x-q.x,y:r.y-q.y},den=cross(n,e);if(Math.abs(den)<1e-10)continue;
    const qp={x:q.x-anchor.x,y:q.y-anchor.y},t=cross(qp,e)/den,u=cross(qp,n)/den;
    if(u>=-1e-8&&u<=1+1e-8&&Number.isFinite(t))hits.push(t);
  }
  hits.sort((a,b)=>a-b);const uniq=[];for(const t of hits)if(!uniq.length||Math.abs(t-uniq.at(-1))>1e-6)uniq.push(t);
  let neg=null,pos=null;for(const t of uniq){if(t<0&&(neg==null||t>neg))neg=t;if(t>0&&(pos==null||t<pos))pos=t;}
  if(neg==null||pos==null)return null;
  return{a:{x:anchor.x+n.x*neg,y:anchor.y+n.y*neg},b:{x:anchor.x+n.x*pos,y:anchor.y+n.y*pos}};
}
function fitSectionLineToBasin(a,b,assoc=null){
  const anchor=assoc?.point||{x:(a.x+b.x)/2,y:(a.y+b.y)/2},basin=sectionBasinAtPoint(anchor);if(!basin)return{a,b,basin:null};
  const dx=b.x-a.x,dy=b.y-a.y;if(Math.hypot(dx,dy)<1e-8)return{a,b,basin};
  const cut=lineAcrossBasin(basin,anchor,{x:dx,y:dy});return cut?{...cut,basin}:{a,b,basin};
}
function createAutoSectionAtPoint(p){
  const assoc=nearestReachAssociation(p,Math.max(2.5,26/Math.max(.001,state.view.scale)));if(!assoc){toast('Toca sobre un tram del riu, o arrossega una línia de secció');return null;}
  const c=assoc.point,basin=sectionBasinAtPoint(c);let a,b;
  if(basin){
    const axis=basinLongAxis(basin),nx=axis?-axis.y:1,ny=axis?axis.x:0,cut=lineAcrossBasin(basin,c,{x:nx,y:ny});
    if(cut){a=cut.a;b=cut.b;}
  }
  if(!a||!b){
    const pts=assoc.reach.points,pr=assoc.projection,i=Math.max(0,Math.min(pts.length-2,pr.segment||0)),u=pts[i],v=pts[i+1],dx=v.x-u.x,dy=v.y-u.y,L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L,half=Math.max(6,Math.min(45,95/Math.max(.2,state.view.scale)));
    a={x:c.x-nx*half,y:c.y-ny*half};b={x:c.x+nx*half,y:c.y+ny*half};
    if(!basin)toast('No hi ha una conca tancada en aquest punt: faig una secció local.');
  }
  pushHistory();return createSectionFeature(a,b,assoc);
}

function reachBoundaryRecords(courseId){const c=state.features.find(f=>f.id===courseId&&f.type==='watercourse');if(!c)return[];const frags=courseFragments(c),out=[];for(const r of courseReaches(courseId)){const fi=Number.isInteger(r.fragmentIndex)?r.fragmentIndex:0,frag=frags[fi];if(!frag)continue;for(const [kind,along] of [['start',r.startAlong],['end',r.endAlong]]){if(!Number.isFinite(+along))continue;let rec=out.find(x=>x.fragmentIndex===fi&&Math.abs(x.along-along)<.03);if(!rec){rec={fragmentIndex:fi,along:+along,point:pointAtAlong(frag,+along),starts:[],ends:[]};out.push(rec);}rec[kind==='start'?'starts':'ends'].push(r.id);}}return out.sort((a,b)=>a.fragmentIndex-b.fragmentIndex||a.along-b.along);}
function snapProjectionToReachBoundary(course,pr,tolWorld){if(!course||!pr)return pr;let best=null;for(const b of reachBoundaryRecords(course.id)){if(b.fragmentIndex!==pr.fragmentIndex)continue;const d=Math.hypot(pr.point.x-b.point.x,pr.point.y-b.point.y);if(d<=tolWorld&&(!best||d<best.d))best={...b,d};}return best?{...pr,along:best.along,point:{...best.point},snappedBoundary:best}:pr;}
function pointAtAlong(pts,d){if(!pts.length)return null;if(d<=0)return{...pts[0]};let base=0;for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],len=Math.hypot(b.x-a.x,b.y-a.y);if(base+len>=d){const t=len?(d-base)/len:0;return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}base+=len;}return{...pts.at(-1)};}
function slicePolylineByAlong(pts,d0,d1){if(d1<d0)[d0,d1]=[d1,d0];const out=[pointAtAlong(pts,d0)],seg=[];let base=0;for(let i=1;i<pts.length;i++){const len=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);seg.push([base,base+len]);base+=len;}for(let i=1;i<pts.length-1;i++){const d=seg.slice(0,i).reduce((a,x)=>a+(x[1]-x[0]),0);if(d>d0&&d<d1)out.push({...pts[i]});}out.push(pointAtAlong(pts,d1));return out;}

function reachHasFieldData(r){return !!((r?.fieldSlopeInk?.length)||(r?.changeCodeInk?.length)||(r?.observationsInk?.length)||(r?.photos?.length)||(r?.ink?.length));}
function updateReachGeometryFromInterval(reach,course,fragmentIndex,d0,d1){
  const frag=courseFragments(course)[fragmentIndex];if(!frag)return false;
  const a=Math.max(0,Math.min(+d0,+d1)),b=Math.min(polylineLength(frag),Math.max(+d0,+d1));if(!(b-a>.05))return false;
  reach.fragmentIndex=fragmentIndex;reach.startAlong=a;reach.endAlong=b;reach.points=slicePolylineByAlong(frag,a,b);reach.mdeStats=null;return true;
}
function blankReachPieceFrom(source,course,fragmentIndex,d0,d1,id=nextHydroId('TRM')){
  const now=Date.now(),r={id,type:'reach',courseId:course.id,fragmentIndex,startAlong:d0,endAlong:d1,points:[],closed:false,campaign:state.campaign,date:today(),createdAt:now,createdOrder:(source?.createdOrder||now)+.0001,ink:[],photos:[],erasures:[],fieldSlopeInk:[],changeCodeInk:[],observationsInk:[],splitFrom:source?.id||null};
  updateReachGeometryFromInterval(r,course,fragmentIndex,d0,d1);return r;
}
function redefineCourseReach(course,fragmentIndex,d0,d1){
  const tol=.03,existing=courseReaches(course.id).filter(r=>(r.fragmentIndex||0)===fragmentIndex&&Math.min(r.endAlong,d1)-Math.max(r.startAlong,d0)>tol);
  if(existing.some(reachHasFieldData)){
    const names=existing.filter(reachHasFieldData).map(r=>r.reachCode||r.id).join(', ');
    if(!confirm(`Aquest nou tram redefineix ${names}, que ja conté dades de camp. La part que desaparegui s’eliminarà; si un tram es divideix, les anotacions es conservaran a la part més llarga. Vols continuar?`))return null;
  }
  pushHistory();
  let nextReachN=0;for(const q of state.features){const m=String(q.id||'').match(/^TRM-(\d+)$/);if(m)nextReachN=Math.max(nextReachN,+m[1]);}
  const allocReachId=()=>`TRM-${String(++nextReachN).padStart(3,'0')}`;
  const remove=new Set(),add=[];
  for(const r of existing){
    const a=Math.min(+r.startAlong,+r.endAlong),b=Math.max(+r.startAlong,+r.endAlong),parts=[];
    if(a<d0-tol)parts.push([a,Math.min(b,d0)]);
    if(b>d1+tol)parts.push([Math.max(a,d1),b]);
    const valid=parts.filter(x=>x[1]-x[0]>.05);
    if(!valid.length){remove.add(r.id);continue;}
    if(valid.length===1){updateReachGeometryFromInterval(r,course,fragmentIndex,valid[0][0],valid[0][1]);continue;}
    // Si el nou tram parteix un tram antic en dos, conservem les anotacions en el tros més llarg
    // i generem l'altre tros sense dades per evitar duplicar observacions de camp.
    valid.sort((x,y)=>(y[1]-y[0])-(x[1]-x[0]));
    updateReachGeometryFromInterval(r,course,fragmentIndex,valid[0][0],valid[0][1]);
    add.push(blankReachPieceFrom(r,course,fragmentIndex,valid[1][0],valid[1][1],allocReachId()));
  }
  if(remove.size)state.features=state.features.filter(f=>!remove.has(f.id));
  state.features.push(...add);
  const now=Date.now(),f={id:allocReachId(),type:'reach',courseId:course.id,fragmentIndex,startAlong:d0,endAlong:d1,points:[],closed:false,campaign:state.campaign,date:today(),createdAt:now,createdOrder:now+state.features.length/1000,ink:[],photos:[],erasures:[],fieldSlopeInk:[],changeCodeInk:[],observationsInk:[]};
  updateReachGeometryFromInterval(f,course,fragmentIndex,d0,d1);state.features.push(f);
  course.longitudinalProfile=null;renumberCourseReaches(course.id);return f;
}
function openReachEditModal(reach){
  if(!reach||reach.type!=='reach')return;state.editReachId=reach.id;
  $('#reachEditTitle').textContent=`Editar ${reach.reachCode||reach.id}`;
  $('#reachEditSubtitle').textContent='Mou un límit sobre el curs. Si és compartit, els dos trams s’actualitzen alhora.';
  $('#reachEditModal').classList.remove('hidden');
}
function closeReachEditModal(){state.editReachId=null;$('#reachEditModal').classList.add('hidden');}
function beginReachBoundaryMove(which){
  const r=state.features.find(f=>f.id===state.editReachId&&f.type==='reach'),c=r&&state.features.find(f=>f.id===r.courseId&&f.type==='watercourse');if(!r||!c){closeReachEditModal();return;}
  const along=which==='start'?+r.startAlong:+r.endAlong,frag=courseFragments(c)[r.fragmentIndex||0];if(!frag)return;
  state.pendingReachBoundaryMove={courseId:c.id,fragmentIndex:r.fragmentIndex||0,along,point:pointAtAlong(frag,along),reachId:r.id,which};state.pendingReachStart=null;
  closeReachEditModal();state.activeCourseId=c.id;setTool('reach',{quiet:true});hideFeatureCard();drawAll();
  toast(`Moure límit ${which==='start'?'inicial':'final'} · toca amb l’S Pen la nova posició sobre el curs`,4200);
}
function applyReachBoundaryMove(course,pr){
  const m=state.pendingReachBoundaryMove;if(!m||m.courseId!==course.id)return false;
  if(pr.fragmentIndex!==m.fragmentIndex){toast('El límit només es pot moure dins del mateix fragment connectat del curs');return true;}
  const old=+m.along,tol=.04,affected=courseReaches(course.id).filter(r=>(r.fragmentIndex||0)===m.fragmentIndex&&(Math.abs(+r.startAlong-old)<tol||Math.abs(+r.endAlong-old)<tol));
  if(!affected.length){state.pendingReachBoundaryMove=null;toast('No s’ha trobat el límit que volies editar');return true;}
  const otherBounds=reachBoundaryRecords(course.id).filter(b=>b.fragmentIndex===m.fragmentIndex&&Math.abs(b.along-old)>=tol).map(b=>b.along).sort((a,b)=>a-b);
  const prev=[...otherBounds].reverse().find(x=>x<old),next=otherBounds.find(x=>x>old),minGap=.20;
  let target=+pr.along;
  if(Number.isFinite(prev))target=Math.max(target,prev+minGap);
  if(Number.isFinite(next))target=Math.min(target,next-minGap);
  if(Math.abs(target-old)<.03){state.pendingReachBoundaryMove=null;toast('El límit pràcticament no ha canviat');drawAll();return true;}
  // No permetem invertir cap dels trams adjacents.
  for(const r of affected){
    const a=Math.abs(+r.startAlong-old)<tol?target:+r.startAlong,b=Math.abs(+r.endAlong-old)<tol?target:+r.endAlong;
    if(Math.abs(b-a)<minGap){toast('No es pot moure el límit més enllà del límit veí');return true;}
  }
  pushHistory();
  for(const r of affected){
    const a=Math.abs(+r.startAlong-old)<tol?target:+r.startAlong,b=Math.abs(+r.endAlong-old)<tol?target:+r.endAlong;
    updateReachGeometryFromInterval(r,course,m.fragmentIndex,a,b);
  }
  course.longitudinalProfile=null;state.pendingReachBoundaryMove=null;renumberCourseReaches(course.id);persistState();drawAll();
  const focus=state.features.find(f=>f.id===m.reachId);if(focus){state.selectedId=focus.id;showFeatureCard(focus);}
  toast(`Límit mogut · ${affected.length>1?'els trams adjacents comparteixen exactament el nou punt':'tram actualitzat'}`);
  return true;
}
function reachLabelPoint(reach){return reach?.points?.length?pointAtAlong(reach.points,polylineLength(reach.points)/2)||reach.points[0]:null;}
function openHydroPicker(){renderHydroPicker();$('#hydroPickerModal').classList.remove('hidden');}
function renderHydroPicker(){const root=$('#hydroCourseList');if(!root)return;root.innerHTML='';const cs=hydroCourses();if(!cs.length){root.innerHTML='<p class="muted">Encara no hi ha cap curs. Crea el primer traçant-lo al mapa.</p>';return;}for(const c of cs){const row=document.createElement('div');row.className='hydro-course-row'+(c.id===state.activeCourseId?' active':'');row.innerHTML=`<span><b>${escapeHtml(c.abbr||'—')} · ${escapeHtml(c.name||c.id)}</b><small>${c.kind==='tributary'?'Afluent':c.kind==='secondary'?'Canal secundari':c.kind==='preferential'?'Flux preferent':'Principal'} · ${courseReaches(c.id).length} trams</small></span><div><button class="secondary hydro-select">Seleccionar</button> <button class="ghost hydro-edit">Editar</button></div>`;row.querySelector('.hydro-select').onclick=()=>{state.activeCourseId=c.id;persistState();$('#hydroPickerModal').classList.add('hidden');updateHydroFab();drawAll();toast(`Curs actiu: ${c.abbr||c.name}`);};row.querySelector('.hydro-edit').onclick=()=>openCourseEditor(c);root.appendChild(row);}}
function fillCourseBasinOptions(){const sel=$('#courseBasin');sel.innerHTML='<option value="">Sense conca assignada</option>';for(const b of hydroBasins()){const o=document.createElement('option');o.value=b.id;o.textContent=b.name||b.id;sel.appendChild(o);}}
function openCourseModal(stroke=null){state.pendingCourseStroke=stroke?cloneAny(stroke):null;if(!state.pendingImportedCourseFragments)state.pendingImportedCourseFragments=null;fillCourseBasinOptions();$('#courseName').value='';$('#courseAbbr').value='';$('#courseKind').value=hydroCourses().length?'tributary':'main';$('#courseDirection').value='entry';$('#courseModal').classList.remove('hidden');setTimeout(()=>$('#courseName').focus(),40);}
function openCourseEditor(c){if(!c)return;state.editCourseId=c.id;state.pendingCourseStroke=null;fillCourseBasinOptions();$('#courseName').value=c.name||'';$('#courseAbbr').value=c.abbr||'';$('#courseKind').value=c.kind||'main';$('#courseBasin').value=c.basinId||'';$('#courseDirection').value=c.direction||'entry';$('#courseModal').classList.remove('hidden');$('#hydroPickerModal').classList.add('hidden');}
function closeCourseModal(){state.pendingCourseStroke=null;state.pendingImportedCourseFragments=null;state.editCourseId=null;$('#courseModal').classList.add('hidden');}
function suggestAbbr(name){return String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/\s+/).filter(w=>w&&!/^(de|del|la|el|torrent|riu|riera)$/i.test(w)).map(w=>w[0]).join('').slice(0,5).toUpperCase()||'TR';}
function saveNewCourse(){
  const name=$('#courseName').value.trim(),abbr=$('#courseAbbr').value.trim().toUpperCase();if(!name||!abbr){toast('Indica nom i abreviatura');return false;}
  if(state.editCourseId){const f=state.features.find(x=>x.id===state.editCourseId&&x.type==='watercourse');if(!f)return false;pushHistory();Object.assign(f,{name,abbr,kind:$('#courseKind').value,basinId:$('#courseBasin').value||null,direction:$('#courseDirection').value});renumberCourseReaches(f.id);state.activeCourseId=f.id;state.editCourseId=null;persistState();$('#courseModal').classList.add('hidden');updateHydroFab();drawAll();toast(`Curs ${abbr} actualitzat`);return true;}
  const pts=state.pendingCourseStroke;if(!pts?.length){toast('Primer traça un tros del curs al mapa');return false;}const importedFrags=state.pendingImportedCourseFragments?.length?cloneAny(state.pendingImportedCourseFragments):null;pushHistory();const frags=importedFrags||[cloneAny(pts)],f={id:nextHydroId('CUR'),type:'watercourse',name,abbr,kind:$('#courseKind').value,basinId:$('#courseBasin').value||null,direction:$('#courseDirection').value,points:cloneAny(frags[0]),fragments:frags,closed:false,campaign:state.campaign,date:today(),ink:[],photos:[],erasures:[],longitudinalProfile:null,source:importedFrags?{type:'referenceLayer'}:null};state.features.push(f);if(importedFrags)normalizeCourseFragments(f,{remapReaches:false});state.activeCourseId=f.id;state.selectedId=f.id;state.pendingCourseStroke=null;state.pendingImportedCourseFragments=null;persistState();$('#courseModal').classList.add('hidden');updateHydroFab();showFeatureCard(f);drawAll();toast(`Curs ${abbr} creat`);return true;
}
function courseEndpointCandidates(course){const out=[];courseFragments(course).forEach((frag,fragmentIndex)=>{if(!frag.length)return;out.push({fragmentIndex,end:'start',point:frag[0]},{fragmentIndex,end:'end',point:frag.at(-1)});});return out;}
function courseEndpointSnapTolerance(){return Math.min(5,Math.max(.35,34/state.view.scale));}
function snapStrokeToCourseEndpoints(course,pts){const out=cloneAny(pts),ends=courseEndpointCandidates(course);if(out.length<2||!ends.length)return{points:out,snaps:[]};const maxWorld=courseEndpointSnapTolerance(),used=new Set(),snaps=[];const assign=(idx)=>{const p=out[idx],rank=ends.map((e,i)=>({e,i,d:pointDistance(p,e.point)})).filter(x=>!used.has(x.i)).sort((a,b)=>a.d-b.d);if(!rank.length)return;const q=rank[0];if(q.d>maxWorld)return;out[idx]={...q.e.point};used.add(q.i);snaps.push({...q.e,d:q.d,strokeEnd:idx===0?'start':'end'});};const r0=ends.map((e,i)=>({i,d:pointDistance(out[0],e.point)})).sort((a,b)=>a.d-b.d)[0],r1=ends.map((e,i)=>({i,d:pointDistance(out.at(-1),e.point)})).sort((a,b)=>a.d-b.d)[0];if((r0?.d??Infinity)<=(r1?.d??Infinity)){assign(0);assign(out.length-1);}else{assign(out.length-1);assign(0);}return{points:out,snaps,maxWorld};}
function addCourseFragment(course,pts,{connect=false}={}){if(!course||!pts?.length)return;const frags=courseFragments(course).map(cloneAny),res=connect?snapStrokeToCourseEndpoints(course,pts):{points:cloneAny(pts),snaps:[]};frags.push(res.points);setCourseFragments(course,frags);if(connect)res.topology=normalizeCourseFragments(course,{remapReaches:true});course.updatedAt=Date.now();return res;}
function openCourseJoinModal(course,worldPts){state.pendingCourseJoin={courseId:course.id,points:cloneAny(worldPts)};const ends=courseEndpointCandidates(course),a=worldPts[0],b=worldPts.at(-1),d=Math.min(...ends.flatMap(e=>[pointDistance(a,e.point),pointDistance(b,e.point)])),tol=courseEndpointSnapTolerance();$('#courseJoinTitle').textContent=`Nou traç prop de ${course.abbr||course.name}`;$('#courseJoinDistance').textContent=Number.isFinite(d)?`Extrem més proper: ${formatLengthUnit(d,1)}${d>tol?' · fora de la tolerància d’encaix automàtic':''}`:'';$('#courseJoinModal').classList.remove('hidden');}
function closeCourseJoinModal(){state.pendingCourseJoin=null;$('#courseJoinModal').classList.add('hidden');}
function applyCourseJoinChoice(mode){const q=state.pendingCourseJoin,c=q&&state.features.find(f=>f.id===q.courseId&&f.type==='watercourse');if(!q||!c){closeCourseJoinModal();return;}const pts=cloneAny(q.points);$('#courseJoinModal').classList.add('hidden');state.pendingCourseJoin=null;if(mode==='new'){openCourseModal(pts);return;}pushHistory();const res=addCourseFragment(c,pts,{connect:mode==='connect'});persistState();state.activeCourseId=c.id;state.selectedId=c.id;showFeatureCard(c);drawAll();updateHydroFab();if(mode==='connect'){if(!res?.snaps?.length)toast(`Cap extrem prou proper: el traç s’ha guardat dins ${c.abbr} però queda separat`,4200);else if(res?.topology?.ambiguous)toast(`Traç connectat, però la topologia de ${c.abbr} necessita revisió`,4200);else toast(res.snaps.length>1?`Traç connectat pels dos extrems a ${c.abbr}`:`Traç connectat a ${c.abbr}`);}else toast(`Fragment guardat dins ${c.abbr} sense connectar`);}
function finishWatercourseStroke(worldPts){const c=activeCourse();if(!c){openCourseModal(worldPts);drawAll();return;}openCourseJoinModal(c,worldPts);drawAll();}
function handleReachTap(sp){
  const c=activeCourse();if(!c){openHydroPicker();return;}
  const repair=normalizeCourseFragments(c,{remapReaches:true});if(repair.changed)persistState();
  const w=screenToWorld(sp),tol=26/state.view.scale;let pr=projectPointToCourse(w,c);
  if(!pr||pr.d>tol){toast('Toca sobre el curs actiu');return;}
  if(state.pendingReachBoundaryMove){applyReachBoundaryMove(c,pr);return;}
  pr=snapProjectionToReachBoundary(c,pr,Math.min(3,24/state.view.scale));
  if(!state.pendingReachStart){state.pendingReachStart=pr;drawAll();toast(pr.snappedBoundary?'Inici encaixat exactament al canvi de tram existent · toca ara el final':'Inici del tram fixat · toca ara el final');return;}
  let a=state.pendingReachStart;state.pendingReachStart=null;
  pr=snapProjectionToReachBoundary(c,pr,Math.min(3,24/state.view.scale));
  if(a.fragmentIndex!==pr.fragmentIndex){toast('Aquests punts són en fragments del curs que encara estan desconnectats. Defineix cada tram dins d’un fragment o completa abans el buit.');drawAll();return;}
  if(Math.abs(pr.along-a.along)<.2){toast('El tram és massa curt');drawAll();return;}
  const frag=courseFragments(c)[pr.fragmentIndex];if(!frag){toast('No s’ha trobat el fragment del curs');return;}
  const d0=Math.min(a.along,pr.along),d1=Math.max(a.along,pr.along),f=redefineCourseReach(c,pr.fragmentIndex,d0,d1);
  if(!f){drawAll();return;}
  state.selectedId=f.id;persistState();showFeatureCard(f);drawAll();updateHydroFab();
  toast(`Tram ${f.reachCode} creat${courseReaches(c.id).length>1?' · els solapaments anteriors s’han redefinit':''}`);
}
function drawPendingReachMarker(){
  if(state.tool!=='reach')return;
  const rec=state.pendingReachBoundaryMove||state.pendingReachStart;if(!rec?.point)return;
  const p=worldToScreen(rec.point);mapCtx.save();mapCtx.fillStyle=state.pendingReachBoundaryMove?'#b24b3d':'#f3a22a';mapCtx.strokeStyle='#fff';mapCtx.lineWidth=3;mapCtx.beginPath();mapCtx.arc(p.x,p.y,8,0,Math.PI*2);mapCtx.fill();mapCtx.stroke();
  if(state.pendingReachBoundaryMove){mapCtx.font='700 11px system-ui,sans-serif';mapCtx.fillStyle='#6c3027';mapCtx.strokeStyle='white';mapCtx.lineWidth=3;mapCtx.strokeText('moure límit',p.x+12,p.y-10);mapCtx.fillText('moure límit',p.x+12,p.y-10);}
  mapCtx.restore();
}
function formatXY(p){if(!p)return'—';return `X ${Math.round(p.x)}\nY ${Math.round(p.y)}`;}
function resizeProfileInkCanvas(c){const r=c.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);c.width=Math.max(1,Math.round(r.width*dpr));c.height=Math.max(1,Math.round(r.height*dpr));c._dpr=dpr;redrawProfileInk(c);}
function redrawProfileInk(c){const ctx=c.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,c.width,c.height);const r=c.getBoundingClientRect(),dpr=c._dpr||1;(c._inkStore||[]).forEach(st=>drawInkRecord(ctx,r,st,dpr,false));if(c._active)drawInkRecord(ctx,r,c._active,dpr,true);}
function profilePointerNorm(e,c){const r=c.getBoundingClientRect(),x=Math.max(0,Math.min(r.width,e.clientX-r.left)),y=Math.max(0,Math.min(r.height,e.clientY-r.top));return{x:r.width?x/r.width:0,y:r.height?y/r.height:0};}
function installProfileInk(c,reach,field){
  c._inkStore=cloneAny(reach[field]||[]);c.style.touchAction='none';
  c.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||!isEditableCampaign())return;e.preventDefault();e.stopPropagation();resizeProfileInkCanvas(c);c._active={tool:state.profileInkTool,kind:'stroke',pts:[profilePointerNorm(e,c)],color:'#1f2b31',pointerId:e.pointerId};c.setPointerCapture?.(e.pointerId);redrawProfileInk(c);});
  c.addEventListener('pointermove',e=>{if(!c._active||c._active.pointerId!==e.pointerId)return;e.preventDefault();e.stopPropagation();c._active.pts.push(profilePointerNorm(e,c));redrawProfileInk(c);});
  const up=e=>{if(!c._active||(e&&c._active.pointerId!==e.pointerId))return;if(e){e.preventDefault();e.stopPropagation();}const rec={...c._active};delete rec.pointerId;c._inkStore.push(rec);c._active=null;reach[field]=cloneAny(c._inkStore);persistState();redrawProfileInk(c);};
  c.addEventListener('pointerup',up);c.addEventListener('pointercancel',e=>{if(c._active?.pointerId===e.pointerId)c._active=null;redrawProfileInk(c);});requestAnimationFrame(()=>resizeProfileInkCanvas(c));
}
function profileStatsKey(reach,dem){const a=reach?.points?.[0],b=reach?.points?.at(-1),len=featureLength(reach||{points:[]});return `${dem?.id||dem?.name||'none'}|${reach?.points?.length||0}|${len.toFixed(3)}|${a?.x?.toFixed?.(2)||''},${a?.y?.toFixed?.(2)||''}|${b?.x?.toFixed?.(2)||''},${b?.y?.toFixed?.(2)||''}`;}
function evenlySamplePolyline(pts,count){const len=featureLength({points:pts||[]});if(!pts?.length)return[];if(count<=1||len<=0)return[{...pts[0]}];const out=[];for(let i=0;i<count;i++)out.push(pointAtAlong(pts,len*i/(count-1)));return out;}
async function ensureReachMdeStats(reach,{force=false}={}){
  const lengthM=featureLength(reach||{points:[]}),dem=chooseDemRasterForSection(reach),grp=activeDemGroup(),sourceKey=grp?`group:${grp.id}`:(dem?.id||'none'),key=`${sourceKey}|${profileStatsKey(reach,dem)}`;
  if(!force&&reach?.mdeStats?.key===key)return reach.mdeStats;
  const base={key,lengthM,minElevation:null,maxElevation:null,mdeSlopePct:null,startElevation:null,endElevation:null,sourceName:grp?.name||dem?.name||null,sourceResolution:grp?demGroupResolution(grp):(dem?sourceResolution(dem):null)};
  if(!reach||!dem||!reach.points?.length||lengthM<=0){reach.mdeStats=base;return base;}
  try{
    const res=Math.max(.05,base.sourceResolution||1),targetStep=Math.max(.5,res*2,lengthM/120),count=Math.max(3,Math.min(140,Math.ceil(lengthM/targetStep)+1));
    const world=evenlySamplePolyline(reach.points,count),sampled=await sampleDemMosaic(world),vals=sampled.values,valid=vals.filter(Number.isFinite);
    if(valid.length){const first=vals.find(Number.isFinite),last=[...vals].reverse().find(Number.isFinite);Object.assign(base,{sourceName:sampled.sourceName||base.sourceName,sourceResolution:sampled.resolution||base.sourceResolution,minElevation:Math.min(...valid),maxElevation:Math.max(...valid),startElevation:Number.isFinite(first)?first:null,endElevation:Number.isFinite(last)?last:null,mdeSlopePct:Number.isFinite(first)&&Number.isFinite(last)&&lengthM>0?Math.abs(first-last)/lengthM*100:null});}
  }catch(e){console.warn('FITXA I · càlcul MDE del tram',reach.id,e);}
  reach.mdeStats=base;return base;
}
function setProfileAutoCell(cell,value,{digits=1,suffix=''}={}){if(!cell)return;cell.classList.remove('pending','unavailable');if(!Number.isFinite(value)){cell.textContent='—';cell.classList.add('unavailable');return;}cell.textContent=`${formatNum(value,digits)}${suffix}`;}
function applyReachStatsToProfileRow(tr,stats){if(!tr||!stats)return;setProfileAutoCell(tr.querySelector('[data-auto="length"]'),stats.lengthM,{digits:1});setProfileAutoCell(tr.querySelector('[data-auto="min"]'),stats.minElevation,{digits:1});setProfileAutoCell(tr.querySelector('[data-auto="max"]'),stats.maxElevation,{digits:1});setProfileAutoCell(tr.querySelector('[data-auto="mdeSlope"]'),stats.mdeSlopePct,{digits:1,suffix:' %'});}
async function refreshProfileAutomaticValues(courseId){const body=$('#profileSheetRows'),rs=orderedCourseReaches(courseId);await Promise.all(rs.map(async r=>{const stats=await ensureReachMdeStats(r);const tr=[...(body?.querySelectorAll('tr[data-reach-id]')||[])].find(x=>x.dataset.reachId===r.id);applyReachStatsToProfileRow(tr,stats);}));persistState();}
function renderProfileSheetRows(course){
  renumberCourseReaches(course.id);$('#profileSheetSubtitle').textContent=`${course.abbr} · ${course.name}`;$('#profileCourseName').textContent=`${course.abbr}, ${course.name}`;if($('#profileCrsLabel'))$('#profileCrsLabel').textContent=projectCrsDisplayName();$('#profileOrderSelect').value=course.direction||'entry';
  const body=$('#profileSheetRows');body.innerHTML='';
  for(const r of orderedCourseReaches(course.id)){
    const tr=document.createElement('tr');tr.dataset.reachId=r.id;const p0=r.points[0],p1=r.points.at(-1),lengthM=featureLength(r);
    tr.innerHTML=`<td class="reach-code">${escapeHtml(r.reachCode||r.id)}</td><td class="coord">${escapeHtml(formatXY(p0))}</td><td class="coord">${escapeHtml(formatXY(p1))}</td><td class="profile-auto-cell" data-auto="length">${escapeHtml(formatNum(lengthM,1))}</td><td class="profile-auto-cell pending" data-auto="min">…</td><td class="profile-auto-cell pending" data-auto="max">…</td><td class="profile-auto-cell pending" data-auto="mdeSlope">…</td><td class="profile-ink-cell slope"><canvas data-field="fieldSlopeInk"></canvas></td><td class="profile-ink-cell code"><canvas data-field="changeCodeInk"></canvas></td><td class="profile-ink-cell obs"><canvas data-field="observationsInk"></canvas></td>`;
    body.appendChild(tr);tr.querySelectorAll('canvas').forEach(cv=>installProfileInk(cv,r,cv.dataset.field));if(r.mdeStats)applyReachStatsToProfileRow(tr,r.mdeStats);
  }
  if(!body.children.length)body.innerHTML='<tr><td colspan="10" class="muted">Encara no has definit cap tram per aquest curs.</td></tr>';
  requestAnimationFrame(()=>$$('#profileSheetRows canvas').forEach(resizeProfileInkCanvas));
}
function setProfileSheetZoom(value){const z=Math.max(.65,Math.min(2.25,Number(value)||1)),doc=$('#profileSheetDoc');state.profileSheetZoom=z;if(doc)doc.style.zoom=String(z);if($('#profileZoomLabel'))$('#profileZoomLabel').textContent=`${Math.round(z*100)}%`;requestAnimationFrame(()=>$$('#profileSheetRows canvas').forEach(resizeProfileInkCanvas));}
function installProfileSheetGestures(){const vp=$('#profileSheetViewport');if(!vp||vp._gestureInstalled)return;vp._gestureInstalled=true;const pt=e=>({x:e.clientX,y:e.clientY});vp.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;e.preventDefault();vp.setPointerCapture?.(e.pointerId);state.profileSheetTouches.set(e.pointerId,pt(e));const a=[...state.profileSheetTouches.values()];if(a.length===1)state.profileSheetGesture={type:'pan',p:{...a[0]},left:vp.scrollLeft,top:vp.scrollTop};else if(a.length===2){const dx=a[1].x-a[0].x,dy=a[1].y-a[0].y;state.profileSheetGesture={type:'pinch',dist:Math.max(10,Math.hypot(dx,dy)),zoom:state.profileSheetZoom};}});vp.addEventListener('pointermove',e=>{if(e.pointerType!=='touch'||!state.profileSheetTouches.has(e.pointerId))return;e.preventDefault();state.profileSheetTouches.set(e.pointerId,pt(e));const a=[...state.profileSheetTouches.values()],g=state.profileSheetGesture;if(!g)return;if(a.length===1&&g.type==='pan'){vp.scrollLeft=g.left-(a[0].x-g.p.x);vp.scrollTop=g.top-(a[0].y-g.p.y);}else if(a.length>=2){const d=Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y);if(g.type!=='pinch'){state.profileSheetGesture={type:'pinch',dist:Math.max(10,d),zoom:state.profileSheetZoom};return;}setProfileSheetZoom(g.zoom*d/g.dist);}});const end=e=>{if(e.pointerType!=='touch')return;state.profileSheetTouches.delete(e.pointerId);const a=[...state.profileSheetTouches.values()];if(a.length===1)state.profileSheetGesture={type:'pan',p:{...a[0]},left:vp.scrollLeft,top:vp.scrollTop};else if(!a.length)state.profileSheetGesture=null;};vp.addEventListener('pointerup',end);vp.addEventListener('pointercancel',end);}
function openProfileSheet(courseId=state.activeCourseId){const c=state.features.find(f=>f.id===courseId&&f.type==='watercourse');if(!c){toast('Selecciona un curs d’aigua');return;}const repair=normalizeCourseFragments(c,{remapReaches:true});if(repair.changed)persistState();state.activeCourseId=c.id;state.currentProfileCourseId=c.id;renderProfileSheetRows(c);$('#profileSheetModal').classList.remove('hidden');setProfileSheetZoom(state.profileSheetZoom||1);updateHydroFab();refreshProfileAutomaticValues(c.id);}
function closeProfileSheet(){state.profileSheetTouches.clear();state.profileSheetGesture=null;state.longProfileReachStart=null;$('#profileSheetModal').classList.add('hidden');}
function installReachSheetGestures(){const vp=$('#reachSheetViewport');if(!vp||vp._gestureInstalled)return;vp._gestureInstalled=true;const pt=e=>({x:e.clientX,y:e.clientY});vp.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'||e.target.closest?.('select,input,textarea,button,label'))return;e.preventDefault();vp.setPointerCapture?.(e.pointerId);state.reachSheetTouches.set(e.pointerId,pt(e));const a=[...state.reachSheetTouches.values()];if(a.length===1)state.reachSheetGesture={type:'pan',p:{...a[0]},left:vp.scrollLeft,top:vp.scrollTop};else if(a.length===2){const dx=a[1].x-a[0].x,dy=a[1].y-a[0].y;state.reachSheetGesture={type:'pinch',dist:Math.max(10,Math.hypot(dx,dy)),zoom:state.reachSheetZoom};}});vp.addEventListener('pointermove',e=>{if(e.pointerType!=='touch'||!state.reachSheetTouches.has(e.pointerId))return;e.preventDefault();state.reachSheetTouches.set(e.pointerId,pt(e));const a=[...state.reachSheetTouches.values()],g=state.reachSheetGesture;if(!g)return;if(a.length===1&&g.type==='pan'){vp.scrollLeft=g.left-(a[0].x-g.p.x);vp.scrollTop=g.top-(a[0].y-g.p.y);}else if(a.length===2){const dx=a[1].x-a[0].x,dy=a[1].y-a[0].y,dist=Math.max(10,Math.hypot(dx,dy));setReachSheetZoom(g.zoom*dist/g.dist);}});const done=e=>{state.reachSheetTouches.delete(e.pointerId);if(state.reachSheetTouches.size===0)state.reachSheetGesture=null;};vp.addEventListener('pointerup',done);vp.addEventListener('pointercancel',done);}
function reachSheetPointerNorm(e,c){const r=c.getBoundingClientRect(),x=Math.max(0,Math.min(r.width,e.clientX-r.left)),y=Math.max(0,Math.min(r.height,e.clientY-r.top));return{x:r.width?x/r.width:0,y:r.height?y/r.height:0};}
function drawReachSheetStroke(ctx,r,st,dpr,active=false){const pts=st?.pts||[];if(!pts.length)return;ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.lineWidth=(st.tool==='eraser'?18:2.2)*(dpr||1);ctx.strokeStyle=st.color||'#1f2b31';if(st.tool==='eraser')ctx.globalCompositeOperation='destination-out';ctx.beginPath();pts.forEach((p,i)=>{const x=p.x*r.width*(dpr||1),y=p.y*r.height*(dpr||1);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});if(active&&pts.length===1){const p=pts[0];const x=p.x*r.width*(dpr||1),y=p.y*r.height*(dpr||1);ctx.lineTo(x+.01,y+.01);}ctx.stroke();ctx.restore();}
function currentReachSheetReach(){return state.features.find(f=>f.id===state.currentReachSheetId&&f.type==='reach')||null;}
function resizeReachSheetSchemeCanvas(){const c=$('#reachSheetSchemeCanvas');if(!c)return;const r=c.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);c.width=Math.max(1,Math.round(r.width*dpr));c.height=Math.max(1,Math.round(r.height*dpr));c._dpr=dpr;redrawReachSheetSchemeCanvas();}
function redrawReachSheetSchemeCanvas(){const c=$('#reachSheetSchemeCanvas');if(!c)return;const reach=currentReachSheetReach();const data=ensureReachSheetData(reach);const ctx=c.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);const rect={width:c.width/(c._dpr||1),height:c.height/(c._dpr||1)};(data.schemeInk||[]).forEach(st=>drawReachSheetStroke(ctx,rect,st,c._dpr||1,false));if(c._active)drawReachSheetStroke(ctx,rect,c._active,c._dpr||1,true);ctx.strokeStyle='rgba(0,0,0,.18)';ctx.lineWidth=1;ctx.strokeRect(.5,.5,c.width-1,c.height-1);}
function installReachSheetSchemeCanvas(){const c=$('#reachSheetSchemeCanvas');if(!c||c._installed)return;c._installed=true;c.style.touchAction='none';c.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||!isEditableCampaign())return;const reach=currentReachSheetReach();if(!reach)return;e.preventDefault();e.stopPropagation();resizeReachSheetSchemeCanvas();const tool=state.reachSheetSchemeTool||'pen';c._active={tool,color:'#1f2b31',pts:[reachSheetPointerNorm(e,c)],pointerId:e.pointerId};c.setPointerCapture?.(e.pointerId);redrawReachSheetSchemeCanvas();});c.addEventListener('pointermove',e=>{if(!c._active||c._active.pointerId!==e.pointerId)return;e.preventDefault();e.stopPropagation();c._active.pts.push(reachSheetPointerNorm(e,c));redrawReachSheetSchemeCanvas();});const finish=e=>{if(!c._active||(e&&c._active.pointerId!==e.pointerId))return;if(e){e.preventDefault();e.stopPropagation();}const reach=currentReachSheetReach();if(!reach){c._active=null;return;}const data=ensureReachSheetData(reach),rec={...c._active};delete rec.pointerId;data.schemeInk.push(rec);c._active=null;persistState();redrawReachSheetSchemeCanvas();};c.addEventListener('pointerup',finish);c.addEventListener('pointercancel',e=>{if(c._active?.pointerId===e.pointerId)c._active=null;redrawReachSheetSchemeCanvas();});window.addEventListener('resize',()=>{if(!$('#reachSheetModal').classList.contains('hidden'))resizeReachSheetSchemeCanvas();});}
function syncReachSheetMirrors(){if($('#reachSheetObserverMirror'))$('#reachSheetObserverMirror').textContent=$('#reachSheetObserver').value||'—';if($('#reachSheetVisitDateMirror'))$('#reachSheetVisitDateMirror').textContent=$('#reachSheetVisitDate').value||'—';}
function subsetReachProfileSeries(profile,reach){const interval=reachProfileInterval(profile,reach);if(!interval)return[];const base=(profile?.manual?.length?profile.manual:profile?.samples)||[];return base.filter(q=>Number.isFinite(q.z)&&q.d>=interval.from-.01&&q.d<=interval.to+.01).map(q=>({d:q.d-interval.from,z:q.z}));}
function reachSheetSchemeDataUrl(reach,w=1500,h=900){const data=ensureReachSheetData(reach);const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,w,h);const rect={width:w,height:h};(data.schemeInk||[]).forEach(st=>drawReachSheetStroke(g,rect,st,1,false));g.strokeStyle='rgba(0,0,0,.18)';g.lineWidth=1;g.strokeRect(.5,.5,w-1,h-1);return c.toDataURL('image/png');}
async function reachLongProfileDataUrl(reach,course){const c=document.createElement('canvas');const ok=await drawReachProfileCanvas(c,reach,course,{width:1600,height:1000,forExport:true});return ok?c.toDataURL('image/png'):'';}
function bindReachSheetInput(id,handler){const el=$(id);if(el)el.oninput=handler;}
function saveReachSheetFields(){const reach=currentReachSheetReach();if(!reach)return;const d=ensureReachSheetData(reach);d.observer=$('#reachSheetObserver').value||'';d.visitDate=$('#reachSheetVisitDate').value||'';d.fieldSlope=$('#reachSheetFieldSlope').value||'';d.lithology=$('#reachSheetLithology').value||'';d.profileType=$('#reachSheetProfileType').value||'';d.vegetationCover=$('#reachSheetVegetationCover').value||'';d.vegetationType=$('#reachSheetVegetationType').value||'';d.anthropic=$('#reachSheetAnthropic').value||'';persistState();syncReachSheetMirrors();}
function closeReachSheet(){state.reachSheetTouches.clear();state.reachSheetGesture=null;saveReachSheetFields();$('#reachSheetModal').classList.add('hidden');}
function nativeExportReachSheetPdf(payload){const json=JSON.stringify(payload||{});if(window.GeoCauceNative?.beginReachSheetExport&&window.GeoCauceNative?.appendReachSheetExportChunk&&window.GeoCauceNative?.finishReachSheetExport){const token=nativeCall('beginReachSheetExport');if(!token)return'';const size=160000;for(let i=0;i<json.length;i+=size){if(!nativeCall('appendReachSheetExportChunk',token,json.slice(i,i+size))){nativeCall('cancelReachSheetExport',token);return'';}}return nativeCall('finishReachSheetExport',token)||'';}return nativeCall('exportReachSheetPdf',json)||'';}
function renderInkToDataUrl(store,w=420,h=90){const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d'),r={width:w,height:h};(store||[]).forEach(st=>drawInkRecord(ctx,r,st,1,false));return c.toDataURL('image/png');}

function courseProfileFragments(course){
  let arr=chainedCourseFragments(course);
  if(course?.direction==='reverse')arr=arr.reverse().map(x=>({...x,pts:[...x.pts].reverse(),reversed:!x.reversed}));
  return arr.map((x,i)=>({...x,gapBefore:i>0,gapBeforeM:i>0?fragmentGap(arr[i-1],x):0}));
}
async function ensureCourseLongitudinalProfile(course,{force=false,preserveManual=true}={}){
  if(!course)return null;
  const frags=courseProfileFragments(course),first=frags[0]?.pts||[],dem=chooseDemRasterForSection({points:first}),grp=activeDemGroup(),sourceKey=grp?`group:${grp.id}`:(dem?.id||'none');
  const signature=`${sourceKey}|${course?.direction||'entry'}|${JSON.stringify(frags.map(x=>[x.fragmentIndex,x.reversed,x.pts.length,polylineLength(x.pts).toFixed(2),x.gapBeforeM?.toFixed?.(2)||'0',x.pts[0],x.pts.at(-1)]))}`;
  if(!force&&course.longitudinalProfile?.signature===signature)return course.longitudinalProfile;
  const oldManual=preserveManual?cloneAny(course.longitudinalProfile?.manual||null):null,oldEdits=preserveManual?cloneAny(course.longitudinalProfile?.manualEdits||[]):[],oldScale=String(course.longitudinalProfile?.verticalScale||'1'),res0=grp?demGroupResolution(grp):(dem?sourceResolution(dem):null);
  const result={signature,sourceRasterId:sourceKey,sourceName:grp?.name||dem?.name||null,resolution:res0,samples:[],segments:[],gaps:[],length:0,componentCount:frags.length,topologyIssue:course.topologyIssue||'',generatedAt:Date.now(),manual:oldManual,manualEdits:oldEdits,verticalScale:['1','2','5'].includes(oldScale)?oldScale:'1'};
  if(!dem||!frags.length){course.longitudinalProfile=result;return result;}
  try{
    let offset=0;
    for(const item of frags){
      const len=polylineLength(item.pts);if(len<=0)continue;const gap=Number.isFinite(+item.gapBeforeM)&&item.gapBefore?Math.max(0,+item.gapBeforeM):0;if(gap>.02){result.gaps.push({from:offset,to:offset+gap,length:gap,beforeFragmentIndex:item.fragmentIndex});offset+=gap;}
      const res=Math.max(.05,res0||1),step=Math.max(.5,res*2,len/220),count=Math.max(3,Math.min(240,Math.ceil(len/step)+1)),world=evenlySamplePolyline(item.pts,count),sampled=await sampleDemMosaic(world),vals=sampled.values;
      if(sampled.sourceName)result.sourceName=sampled.sourceName;if(Number.isFinite(sampled.resolution))result.resolution=sampled.resolution;
      const seg={fragmentIndex:item.fragmentIndex,offset,length:len,reversed:item.reversed,gapBefore:!!item.gapBefore,gapBeforeM:gap};result.segments.push(seg);
      vals.forEach((z,i)=>result.samples.push({d:offset+len*i/(count-1),z:Number.isFinite(z)?z:null,x:world[i].x,y:world[i].y,fragmentIndex:item.fragmentIndex,gapStart:i===0&&gap>.02}));offset+=len;
    }
    result.length=offset;course.longitudinalProfile=result;if(isEditableCampaign())persistState();return result;
  }catch(e){console.warn('Perfil longitudinal del curs',e);course.longitudinalProfile=result;return result;}
}
function profileBoundaryDistance(profile,b){const seg=profile?.segments?.find(x=>x.fragmentIndex===b.fragmentIndex);if(!seg)return null;return seg.offset+(seg.reversed?seg.length-b.along:b.along);}
function profileDistanceForAlong(profile,fragmentIndex,along){const seg=profile?.segments?.find(x=>x.fragmentIndex===fragmentIndex);if(!seg||!Number.isFinite(+along))return null;return seg.offset+(seg.reversed?seg.length-(+along):(+along));}
function reachProfileInterval(profile,reach){
  if(!profile||!reach)return null;const fi=Number.isInteger(reach.fragmentIndex)?reach.fragmentIndex:0;
  const a=profileDistanceForAlong(profile,fi,reach.startAlong),b=profileDistanceForAlong(profile,fi,reach.endAlong);
  if(!Number.isFinite(a)||!Number.isFinite(b))return null;return{from:Math.min(a,b),to:Math.max(a,b),mid:(a+b)/2};
}
function profileGapAt(profile,d){return (profile?.gaps||[]).find(g=>d>g.from&&d<g.to)||null;}
function profileIntervalCrossesGap(profile,a,b){const lo=Math.min(a,b),hi=Math.max(a,b);return (profile?.gaps||[]).some(g=>g.from<hi&&g.to>lo);}
function courseLongProfileRange(profile,tempManual=null){
  const vals=[];(profile?.samples||[]).forEach(q=>Number.isFinite(q.z)&&vals.push(q.z));(profile?.manual||[]).forEach(q=>Number.isFinite(q.z)&&vals.push(q.z));(tempManual||[]).forEach(q=>Number.isFinite(q.z)&&vals.push(q.z));
  if(vals.length<2)return null;let lo=Math.min(...vals),hi=Math.max(...vals);if(hi-lo<1){lo-=.5;hi+=.5;}const pad=Math.max(1,(hi-lo)*.08);return{lo:lo-pad,hi:hi+pad};
}
function courseLongProfileGeometry(canvas,profile,{width=null,height=null,tempManual=null}={}){
  const r=canvas?.getBoundingClientRect?.()||{width:900,height:420},w=Math.max(620,Math.round(width||r.width||900)),h=Math.max(330,Math.round(height||r.height||420));
  const pad={l:66,r:28,t:42,b:52},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b,raw=courseLongProfileRange(profile,tempManual);
  if(!raw)return{w,h,pad,pw,ph,rg:null,xd:d=>pad.l,yz:z=>pad.t};
  // Escala real ×1 per defecte. ×2 i ×5 només exageren verticalment; els objectes es guarden en metres.
  const ex=Math.max(.1,Number(profile?.verticalScale)||1),mid=(raw.lo+raw.hi)/2,rawSpan=raw.hi-raw.lo,targetSpan=(profile?.length||1)*(ph/Math.max(1,pw))/ex,span=Math.max(rawSpan*1.16,targetSpan),rg={lo:mid-span/2,hi:mid+span/2};
  return{w,h,pad,pw,ph,rg,ex,xd:d=>pad.l+(d/Math.max(1,profile?.length||1))*pw,yz:z=>pad.t+(rg.hi-z)/(rg.hi-rg.lo)*ph};
}
function courseProfileDataFromNorm(course,profile,canvas,np){
  if(!profile?.length)return null;const geo=courseLongProfileGeometry(canvas,profile),r=canvas.getBoundingClientRect();if(!geo.rg)return null;
  const x=np.x*r.width,y=np.y*r.height;if(x<geo.pad.l-10||x>geo.w-geo.pad.r+10||y<geo.pad.t-18||y>geo.pad.t+geo.ph+18)return null;
  const tx=Math.max(0,Math.min(1,(x-geo.pad.l)/geo.pw)),ty=Math.max(0,Math.min(1,(y-geo.pad.t)/geo.ph)),d=tx*profile.length;
  if(profileGapAt(profile,d))return null;return{d,z:geo.rg.hi-ty*(geo.rg.hi-geo.rg.lo)};
}
function courseProfileStrokeToData(course,profile,canvas,pts){
  const out=[];for(const np of pts||[]){const q=courseProfileDataFromNorm(course,profile,canvas,np);if(q)out.push(q);}
  out.sort((a,b)=>a.d-b.d);const clean=[];for(const q of out){if(!clean.length||Math.abs(q.d-clean.at(-1).d)>.02)clean.push(q);else clean[clean.length-1]=q;}return clean;
}
function mergeCourseManualProfile(profile,segment,replaceId=null){return commitProfileManualEdit(profile,segment,{replaceId});}

function resetCourseManualProfileInterval(profile,interval){
  if(!profile||!interval)return false;const from=Math.min(interval.from,interval.to),to=Math.max(interval.from,interval.to),eps=.001,edits=ensureProfileManualEdits(profile);
  const before=edits.length;profile.manualEdits=edits.filter(e=>{const p=(e.pts||[]).filter(q=>Number.isFinite(q.d));if(!p.length)return false;const lo=Math.min(...p.map(q=>q.d)),hi=Math.max(...p.map(q=>q.d));return hi<from-eps||lo>to+eps;});
  if(before!==profile.manualEdits.length){rebuildProfileManual(profile);return true;}
  if(!profile.manual?.length)return false;const dem=(profile.samples||[]).filter(q=>Number.isFinite(q.d)&&Number.isFinite(q.z)&&q.d>=from-eps&&q.d<=to+eps).map(q=>({d:q.d,z:q.z}));if(dem.length<2)return false;const outside=profile.manual.filter(q=>Number.isFinite(q.d)&&Number.isFinite(q.z)&&(q.d<from-eps||q.d>to+eps));profile.manual=[...outside,...dem].sort((a,b)=>a.d-b.d);return true;
}
function renderCourseLongProfileColorChips(){
  const root=$('#courseLongProfileColorChips');if(!root)return;root.innerHTML='';
  const palette=(sectionPalette?.length?sectionPalette:DEFAULT_SECTION_COLORS).slice(0,7);
  if(!palette.some(c=>String(c.hex).toLowerCase()===String(state.longProfileColor).toLowerCase()))state.longProfileColor=palette[0]?.hex||'#1f2b31';
  for(const col of palette){const b=document.createElement('button');b.type='button';b.className='course-long-profile-color';b.style.background=col.hex;b.title=col.name;b.classList.toggle('active',String(col.hex).toLowerCase()===String(state.longProfileColor).toLowerCase());b.onclick=()=>{state.longProfileColor=col.hex;renderCourseLongProfileColorChips();};root.appendChild(b);}
}
function courseProfilePositionAtDistance(profile,d){
  if(!profile||!Number.isFinite(d))return null;const seg=(profile.segments||[]).find(x=>d>=x.offset-.0001&&d<=x.offset+x.length+.0001);if(!seg)return null;const local=Math.max(0,Math.min(seg.length,d-seg.offset)),along=seg.reversed?seg.length-local:local;return{fragmentIndex:seg.fragmentIndex,along};
}
function setCourseLongProfileTool(tool){
  state.longProfileTool=tool;if(tool!=='reach')state.longProfileReachStart=null;$$('[data-long-profile-tool]').forEach(b=>b.classList.toggle('active',b.dataset.longProfileTool===tool));$('.course-long-profile-card')?.classList.toggle('edit-profile',tool==='profile');syncCourseLongSelectionUi();redrawCourseLongProfileEditor();
}
function drawCourseProfileSeries(g,profile,series,xd,yz,{color='#2d5f49',width=2.4,dash=[],alpha=1}={}){
  const pts=(series||[]).filter(q=>Number.isFinite(q.d)&&Number.isFinite(q.z)).sort((a,b)=>a.d-b.d);if(pts.length<2)return;
  g.save();g.strokeStyle=color;g.lineWidth=width;g.globalAlpha=alpha;g.setLineDash(dash);g.beginPath();let prev=null;
  for(const q of pts){const br=!prev||profileIntervalCrossesGap(profile,prev.d,q.d)||(q.fragmentIndex!=null&&prev.fragmentIndex!=null&&q.fragmentIndex!==prev.fragmentIndex);if(br)g.moveTo(xd(q.d),yz(q.z));else g.lineTo(xd(q.d),yz(q.z));prev=q;}g.stroke();g.restore();
}
function drawCourseLongProfileInk(g,canvas,course,activeInk=null,dpr=1){
  const store=course?.longitudinalProfileInk||[];if(!store.length&&!activeInk)return;
  const layer=document.createElement('canvas');layer.width=canvas.width;layer.height=canvas.height;const lctx=layer.getContext('2d'),r={width:canvas.width/dpr,height:canvas.height/dpr};
  for(const st of store)drawInkRecord(lctx,r,st,dpr,false);if(activeInk)drawInkRecord(lctx,r,activeInk,dpr,true);
  g.save();g.setTransform(1,0,0,1,0,0);g.drawImage(layer,0,0);g.restore();
}
function profileSeriesValueAt(profile,d){const arr=(profile?.manual?.length?profile.manual:profile?.samples||[]).filter(q=>Number.isFinite(q.d)&&Number.isFinite(q.z)).sort((a,b)=>a.d-b.d);if(!arr.length)return null;if(d<=arr[0].d)return arr[0].z;if(d>=arr.at(-1).d)return arr.at(-1).z;for(let i=1;i<arr.length;i++){if(arr[i].d<d)continue;const a=arr[i-1],b=arr[i],t=(d-a.d)/Math.max(1e-9,b.d-a.d);return a.z+(b.z-a.z)*t;}return null;}
function longProfileObjectPixel(obj,geo,offset=0){const cv=q=>q?{x:geo.xd(q.d-offset),y:geo.yz(q.z)}:null;return{...obj,a:cv(obj.a),b:cv(obj.b),pts:(obj.pts||[]).map(cv)};}
function drawLongProfileObject(g,obj,geo,{active=false,offset=0,latest=false}={}){if(!obj)return;const o=longProfileObjectPixel(obj,geo,offset),a=o.a,b=o.b;g.save();g.lineCap='round';g.lineJoin='round';const color=active?'#d76c2d':(obj.color||'#486a45');g.strokeStyle=color;g.fillStyle=color;g.lineWidth=active?3:2;
  if(['tree','shrub'].includes(obj.kind)&&a&&b){const dx=b.x-a.x,dy=b.y-a.y,L=Math.max(8,Math.hypot(dx,dy)),ux=dx/L,uy=dy/L,nx=-uy,ny=ux;g.fillStyle='rgba(92,132,75,.16)';if(obj.kind==='tree'){g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke();const rad=Math.max(8,L*.22);for(const off of[-.18,0,.18]){g.beginPath();g.arc(b.x+nx*L*off,b.y+ny*L*off,rad,0,Math.PI*2);g.fill();g.stroke();}}else{const rad=Math.max(6,L*.18),cx=a.x+dx*.62,cy=a.y+dy*.62;for(const off of[-.28,0,.28]){g.beginPath();g.arc(cx+nx*L*off,cy+ny*L*off,rad,0,Math.PI*2);g.fill();g.stroke();}}g.restore();return;}
  if(obj.kind==='rockSymbol'&&a&&b){const rad=Math.max(5,Math.hypot(b.x-a.x,b.y-a.y));g.fillStyle='rgba(110,105,96,.14)';g.beginPath();for(let i=0;i<11;i++){const ang=Math.PI*2*i/11,rr=rad*(.86+.12*Math.sin(i*3.17)),x=a.x+Math.cos(ang)*rr,y=a.y+Math.sin(ang)*rr;i?g.lineTo(x,y):g.moveTo(x,y);}g.closePath();g.fill();g.stroke();g.restore();return;}
  if(obj.kind==='vegetation'&&a&&b){const x0=Math.min(a.x,b.x),x1=Math.max(a.x,b.x),base=Math.max(a.y,b.y),top=Math.min(a.y,b.y),h=Math.max(9,base-top),step=Math.max(12,Math.min(24,(x1-x0)/6||14));g.strokeStyle=color;g.lineWidth=active?2.8:1.8;for(let x=x0;x<=x1+1;x+=step){const hh=h*(.55+.35*Math.sin((x-x0)*.11+1.2));g.beginPath();g.moveTo(x,base);g.lineTo(x,base-hh);g.moveTo(x,base-hh*.55);g.lineTo(x-5,base-hh*.78);g.moveTo(x,base-hh*.45);g.lineTo(x+5,base-hh*.66);g.stroke();}g.restore();return;}
  if(obj.kind==='measure'&&a&&b){g.strokeStyle=active?'#d76c2d':latest?'#4c4c49':'#8c8b86';g.setLineDash(active?[]:[5,4]);g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke();g.setLineDash([]);const val=Number.isFinite(obj.valueM)?obj.valueM:Math.hypot((obj.b?.d||0)-(obj.a?.d||0),(obj.b?.z||0)-(obj.a?.z||0)),tx=(a.x+b.x)/2+6,ty=(a.y+b.y)/2-6,label=`${formatNum(val,2)} m`;g.font='700 12px system-ui';const tw=g.measureText(label).width;g.fillStyle='rgba(255,255,255,.92)';g.fillRect(tx-3,ty-12,tw+6,17);g.fillStyle=active?'#d76c2d':'#555';g.fillText(label,tx,ty);g.restore();return;}g.restore();}
function longProfilePointSegDistance(px,py,a,b){const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((px-a.x)*dx+(py-a.y)*dy)/l2)),x=a.x+t*dx,y=a.y+t*dy;return Math.hypot(px-x,py-y);}
function longProfileObjectHit(obj,geo,px,py,offset=0){const o=longProfileObjectPixel(obj,geo,offset),a=o.a,b=o.b;if(!a||!b)return Infinity;if(obj.kind==='rockSymbol'){const rad=Math.hypot(b.x-a.x,b.y-a.y),d=Math.abs(Math.hypot(px-a.x,py-a.y)-rad);return Math.min(d,Math.hypot(px-a.x,py-a.y));}if(obj.kind==='vegetation'){const x0=Math.min(a.x,b.x),x1=Math.max(a.x,b.x),y0=Math.min(a.y,b.y),y1=Math.max(a.y,b.y);if(px>=x0-8&&px<=x1+8&&py>=y0-8&&py<=y1+8)return 0;}return longProfilePointSegDistance(px,py,a,b);}
function longProfileEditHit(edit,geo,px,py,offset=0){const pts=(edit?.pts||[]).filter(q=>Number.isFinite(q.d)&&Number.isFinite(q.z)).map(q=>({x:geo.xd(q.d-offset),y:geo.yz(q.z)}));let best=Infinity;for(let i=1;i<pts.length;i++)best=Math.min(best,longProfilePointSegDistance(px,py,pts[i-1],pts[i]));return best;}
function drawLongProfileEditSelection(g,edit,geo,offset=0){const pts=(edit?.pts||[]).filter(q=>Number.isFinite(q.d)&&Number.isFinite(q.z));if(pts.length<2)return;g.save();g.strokeStyle='#d76c2d';g.lineWidth=4;g.setLineDash([7,4]);g.beginPath();pts.forEach((q,i)=>{const x=geo.xd(q.d-offset),y=geo.yz(q.z);i?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();g.restore();}
function syncCourseLongSelectionUi(){const c=$('#courseLongProfileCanvas'),b=$('#courseLongProfileDelete');b?.classList.toggle('hidden',!c?._longSelection);if(b)b.disabled=!c?._longSelection||!isEditableCampaign();}
function syncReachLongSelectionUi(){const c=$('#reachSheetProfileEditCanvas'),b=$('#reachProfileDelete');b?.classList.toggle('hidden',!c?._reachSelection);if(b)b.disabled=!c?._reachSelection||!isEditableCampaign();}
function remapCourseProfileInkScale(canvas,profile,store,oldScale,newScale){if(!canvas||!profile||String(oldScale)===String(newScale))return;const saved=profile.verticalScale;profile.verticalScale=String(oldScale);const oldGeo=courseLongProfileGeometry(canvas,profile);profile.verticalScale=String(newScale);const newGeo=courseLongProfileGeometry(canvas,profile);profile.verticalScale=saved;const r=canvas.getBoundingClientRect();for(const st of store||[]){for(const p of st.pts||[]){const x=p.x*r.width,y=p.y*r.height;if(x<oldGeo.pad.l-20||x>oldGeo.w-oldGeo.pad.r+20||y<oldGeo.pad.t-30||y>oldGeo.pad.t+oldGeo.ph+30)continue;const d=Math.max(0,Math.min(profile.length,(x-oldGeo.pad.l)/oldGeo.pw*profile.length)),z=oldGeo.rg.hi-((y-oldGeo.pad.t)/oldGeo.ph)*(oldGeo.rg.hi-oldGeo.rg.lo),nx=newGeo.xd(d)/Math.max(1,r.width),ny=newGeo.yz(z)/Math.max(1,r.height);p.x=nx;p.y=ny;}}}
function remapReachProfileInkScale(canvas,view,store,oldScale,newScale){if(!canvas||!view||String(oldScale)===String(newScale))return;const r=canvas.getBoundingClientRect(),oldGeo=reachProfileGeometry(r.width,r.height,{...view,verticalScale:String(oldScale)}),newGeo=reachProfileGeometry(r.width,r.height,{...view,verticalScale:String(newScale)});for(const st of store||[]){for(const p of st.pts||[]){const x=p.x*r.width,y=p.y*r.height;if(x<oldGeo.pad.l-20||x>r.width-oldGeo.pad.r+20||y<oldGeo.pad.t-30||y>oldGeo.pad.t+oldGeo.ph+30)continue;const d=Math.max(0,Math.min(view.length,(x-oldGeo.pad.l)/oldGeo.pw*view.length)),z=oldGeo.hi-((y-oldGeo.pad.t)/oldGeo.ph)*(oldGeo.hi-oldGeo.lo);p.x=newGeo.xd(d)/Math.max(1,r.width);p.y=newGeo.yz(z)/Math.max(1,r.height);}}}
function paintCourseLongProfile(canvas,course,profile,{width=null,height=null,pixelRatio=null,tempManual=null,activeInk=null,includeInk=true}={}){
  if(!canvas)return;
  const geo=courseLongProfileGeometry(canvas,profile,{width,height,tempManual}),w=geo.w,h=geo.h,dpr=pixelRatio||Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  const g=canvas.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);g.fillStyle='#fff';g.fillRect(0,0,w,h);
  const valid=(profile?.samples||[]).filter(x=>Number.isFinite(x.z));
  if(valid.length<2){g.fillStyle='#6b716d';g.font='15px sans-serif';g.fillText('No hi ha dades MDE suficients per generar el perfil.',30,48);return;}
  const {pad,pw,ph,rg,xd,yz}=geo;
  g.strokeStyle='#d5d9d4';g.lineWidth=1;
  for(let i=0;i<=5;i++){const y=pad.t+ph*i/5;g.beginPath();g.moveTo(pad.l,y);g.lineTo(w-pad.r,y);g.stroke();g.fillStyle='#65706a';g.font='11px sans-serif';g.fillText(formatNum(rg.hi-(rg.hi-rg.lo)*i/5,1)+' m',6,y+4);}
  for(let i=0;i<=6;i++){const x=pad.l+pw*i/6;g.beginPath();g.moveTo(x,pad.t);g.lineTo(x,pad.t+ph);g.stroke();g.fillStyle='#65706a';g.fillText(formatNum(profile.length*i/6,0)+' m',x-12,h-17);}
  for(const gap of profile?.gaps||[]){
    if(!(gap.length>.02))continue;const x0=xd(gap.from),x1=xd(gap.to),gw=Math.max(1,x1-x0);
    g.fillStyle='rgba(185,139,74,.08)';g.fillRect(x0,pad.t,gw,ph);g.save();g.setLineDash([5,4]);g.strokeStyle='rgba(147,103,45,.45)';g.beginPath();g.moveTo(x0,pad.t);g.lineTo(x0,pad.t+ph);g.moveTo(x1,pad.t);g.lineTo(x1,pad.t+ph);g.stroke();g.restore();
    const label=`buit ~${formatNum(gap.length,1)} m`;g.font='600 10px sans-serif';const tw=g.measureText(label).width;if(gw>tw+8){g.fillStyle='#7a6040';g.fillText(label,x0+(gw-tw)/2,pad.t+29);}
  }
  const hasManual=profile?.manual?.length>1;
  drawCourseProfileSeries(g,profile,profile.samples,xd,yz,{color:'#2d5f49',width:hasManual?1.7:2.5,dash:hasManual?[6,4]:[],alpha:hasManual?.62:1});
  if(hasManual)drawCourseProfileSeries(g,profile,profile.manual,xd,yz,{color:'#1f2b31',width:2.7});
  if(tempManual?.length>1)drawCourseProfileSeries(g,profile,tempManual,xd,yz,{color:'#b46b1f',width:2.5});
  const sel=canvas._longSelection,edits=ensureProfileManualEdits(profile);if(sel?.kind==='profileEdit'){const e=edits.find(x=>x.id===sel.id);if(e)drawLongProfileEditSelection(g,e,geo,0);}
  course.longitudinalProfileObjects=Array.isArray(course.longitudinalProfileObjects)?course.longitudinalProfileObjects:[];course.longitudinalProfileObjects.forEach((o,i)=>drawLongProfileObject(g,o,geo,{active:sel?.kind==='object'&&sel.index===i,latest:i===course.longitudinalProfileObjects.length-1&&o.kind==='measure'}));if(canvas._longObjectActive)drawLongProfileObject(g,canvas._longObjectActive,geo,{active:true});
  const bounds=reachBoundaryRecords(course.id);for(const b of bounds){const d=profileBoundaryDistance(profile,b);if(!Number.isFinite(d))continue;const x=xd(d);g.strokeStyle='rgba(162,95,21,.68)';g.lineWidth=1.25;g.beginPath();g.moveTo(x,pad.t);g.lineTo(x,pad.t+ph);g.stroke();}
  if(state.longProfileTool==='reach'&&state.longProfileReachStart&&Number.isFinite(state.longProfileReachStart.d)){const x=xd(state.longProfileReachStart.d);g.save();g.strokeStyle='#d97706';g.lineWidth=2.5;g.setLineDash([5,4]);g.beginPath();g.moveTo(x,pad.t);g.lineTo(x,pad.t+ph);g.stroke();g.fillStyle='#fff';g.strokeStyle='#d97706';g.setLineDash([]);g.beginPath();g.arc(x,pad.t+8,5,0,Math.PI*2);g.fill();g.stroke();g.restore();}
  // Etiquetes centrades exactament entre els límits de cada tram.
  const reaches=orderedCourseReaches(course.id);g.textAlign='center';g.textBaseline='middle';
  for(const r of reaches){const it=reachProfileInterval(profile,r);if(!it||it.to-it.from<.05)continue;const x=xd(it.mid),spanPx=Math.abs(xd(it.to)-xd(it.from)),label=r.reachCode||r.id, fontSize=spanPx<42?9:spanPx<68?10:11;g.font=`700 ${fontSize}px sans-serif`;const tw=Math.min(spanPx-4,g.measureText(label).width+10);if(tw>8){g.fillStyle='rgba(255,255,255,.88)';g.fillRect(x-tw/2,pad.t+4,tw,17);g.fillStyle='#7b4612';g.fillText(label,x,pad.t+12.5);}}
  g.textAlign='left';g.textBaseline='alphabetic';g.fillStyle='#263e31';g.font='700 13px sans-serif';g.fillText(`${course.abbr} · ${course.name}`,pad.l,pad.t-13);
  g.font='10px sans-serif';g.fillStyle='#718078';g.fillText(hasManual?'┄ MDE   ━ perfil corregit':'━ MDE',pad.l,pad.t+ph+35);
  if(includeInk){drawCourseLongProfileInk(g,canvas,course,activeInk,dpr);if(sel?.kind==='ink'&&course.longitudinalProfileInk?.[sel.index]){const st=course.longitudinalProfileInk[sel.index],r={width:w,height:h};g.save();g.setTransform(dpr,0,0,dpr,0,0);g.strokeStyle='#d76c2d';g.lineWidth=3;g.setLineDash([6,4]);g.beginPath();(st.pts||[]).forEach((p,i)=>{const x=p.x*r.width,y=p.y*r.height;i?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();g.restore();}}
}
function redrawCourseLongProfileEditor(){
  const canvas=$('#courseLongProfileCanvas'),course=state.features.find(f=>f.id===state.currentLongProfileCourseId&&f.type==='watercourse');if(!canvas||!course?.longitudinalProfile)return;
  const active=canvas._longActive,temp=active?.profile?courseProfileStrokeToData(course,course.longitudinalProfile,canvas,active.pts):null,ink=active&&!active.profile?active:null;
  paintCourseLongProfile(canvas,course,course.longitudinalProfile,{tempManual:temp,activeInk:ink});
}
function installCourseLongProfileEditor(){
  const canvas=$('#courseLongProfileCanvas');if(!canvas||canvas._longEditorInstalled)return;canvas._longEditorInstalled=true;canvas._longActive=null;canvas._longObjectActive=null;canvas._longSelection=null;
  canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||!isEditableCampaign())return;const course=state.features.find(f=>f.id===state.currentLongProfileCourseId&&f.type==='watercourse'),profile=course?.longitudinalProfile;if(!profile?.samples?.length)return;e.preventDefault();e.stopPropagation();const p=eventPoint(e,canvas),np=normPoint(p,canvas),tool=state.longProfileTool||'profile';
    if(tool==='reach'){const d=profileDistanceFromPointer(canvas,profile,e);if(d==null){toast('Toca dins del perfil MDE/LiDAR');return;}applyReachFromLongProfile(course,profile,d);return;}
    if(tool==='select'){
      const geo=courseLongProfileGeometry(canvas,profile),hits=[],objs=course.longitudinalProfileObjects||[],r=canvas.getBoundingClientRect();objs.forEach((o,i)=>hits.push({kind:'object',index:i,d:longProfileObjectHit(o,geo,p.x,p.y,0)}));ensureProfileManualEdits(profile).forEach(ed=>hits.push({kind:'profileEdit',id:ed.id,d:longProfileEditHit(ed,geo,p.x,p.y,0)}));(course.longitudinalProfileInk||[]).forEach((st,i)=>hits.push({kind:'ink',index:i,d:sectionInkHitDistance(st,np,r)}));hits.sort((a,b)=>a.d-b.d);canvas._longSelection=hits[0]?.d<=18?hits[0]:null;syncCourseLongSelectionUi();redrawCourseLongProfileEditor();if(!canvas._longSelection)toast('No hi ha cap objecte sota el llapis');return;
    }
    if(tool==='profile'){canvas._longActive={profile:true,tool,pts:[np],pointerId:e.pointerId,replaceId:canvas._longSelection?.kind==='profileEdit'?canvas._longSelection.id:null};canvas.setPointerCapture?.(e.pointerId);redrawCourseLongProfileEditor();return;}
    if(['tree','shrub','rockSymbol','vegetation','measure'].includes(tool)){let q=courseProfileDataFromNorm(course,profile,canvas,np);if(!q)return;if(tool!=='measure'){const z=profileSeriesValueAt(profile,q.d);if(Number.isFinite(z))q={...q,z};}canvas._longObjectActive={kind:tool,a:{d:q.d,z:q.z},b:{d:q.d,z:q.z},color:state.longProfileColor||'#1f2b31',pointerId:e.pointerId};canvas.setPointerCapture?.(e.pointerId);redrawCourseLongProfileEditor();return;}
    canvas._longActive={profile:false,tool,kind:'stroke',pts:[np],color:state.longProfileColor,pointerId:e.pointerId};canvas.setPointerCapture?.(e.pointerId);redrawCourseLongProfileEditor();
  });
  canvas.addEventListener('pointermove',e=>{const course=state.features.find(f=>f.id===state.currentLongProfileCourseId&&f.type==='watercourse'),profile=course?.longitudinalProfile;if(!profile)return;if(canvas._longObjectActive&&canvas._longObjectActive.pointerId===e.pointerId){const np=normPoint(eventPoint(e,canvas),canvas),q=courseProfileDataFromNorm(course,profile,canvas,np);if(!q)return;e.preventDefault();e.stopPropagation();const o=canvas._longObjectActive;o.b={d:q.d,z:q.z};if(o.kind==='measure'){const geo=courseLongProfileGeometry(canvas,profile),a={x:geo.xd(o.a.d),y:geo.yz(o.a.z)},b={x:geo.xd(o.b.d),y:geo.yz(o.b.z)};if(Math.abs(b.y-a.y)<14)o.b.z=o.a.z;}redrawCourseLongProfileEditor();return;}const a=canvas._longActive;if(!a||a.pointerId!==e.pointerId)return;e.preventDefault();e.stopPropagation();a.pts.push(normPoint(eventPoint(e,canvas),canvas));redrawCourseLongProfileEditor();});
  const finish=e=>{const course=state.features.find(f=>f.id===state.currentLongProfileCourseId&&f.type==='watercourse'),profile=course?.longitudinalProfile;if(canvas._longObjectActive&&(!e||canvas._longObjectActive.pointerId===e.pointerId)){const o=canvas._longObjectActive;canvas._longObjectActive=null;if(course&&profile){delete o.pointerId;const geo=courseLongProfileGeometry(canvas,profile),distPx=Math.hypot(geo.xd(o.b.d)-geo.xd(o.a.d),geo.yz(o.b.z)-geo.yz(o.a.z));if(distPx>=4){if(o.kind==='measure')o.valueM=Math.hypot(o.b.d-o.a.d,o.b.z-o.a.z);course.longitudinalProfileObjects=course.longitudinalProfileObjects||[];course.longitudinalProfileObjects.push(o);persistState();}}redrawCourseLongProfileEditor();return;}const a=canvas._longActive;if(!a||(e&&a.pointerId!==e.pointerId))return;if(e){e.preventDefault();e.stopPropagation();}canvas._longActive=null;if(!course||!profile){redrawCourseLongProfileEditor();return;}if(a.profile){const seg=courseProfileStrokeToData(course,profile,canvas,a.pts);if(seg.length>1){mergeCourseManualProfile(profile,seg,a.replaceId||null);canvas._longSelection=null;syncCourseLongSelectionUi();persistState();toast(a.replaceId?'Correcció del perfil modificada':'Perfil longitudinal corregit');}}else{const rec={...a};delete rec.pointerId;delete rec.replaceId;course.longitudinalProfileInk=course.longitudinalProfileInk||[];course.longitudinalProfileInk.push(rec);persistState();}redrawCourseLongProfileEditor();};
  canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',e=>{if(canvas._longObjectActive?.pointerId===e.pointerId)canvas._longObjectActive=null;if(canvas._longActive?.pointerId===e.pointerId)canvas._longActive=null;redrawCourseLongProfileEditor();});
}
function courseLongProfileDataUrl(course,profile){
  if(!course||!profile?.samples?.length)return'';const c=document.createElement('canvas');paintCourseLongProfile(c,course,profile,{width:1200,height:560,pixelRatio:1,includeInk:true});return c.toDataURL('image/png');
}
function deleteCourseLongSelected(){const canvas=$('#courseLongProfileCanvas'),course=state.features.find(f=>f.id===state.currentLongProfileCourseId&&f.type==='watercourse'),sel=canvas?._longSelection;if(!canvas||!course||!sel||!requireEditable('eliminar l’element del perfil'))return;if(sel.kind==='object'&&course.longitudinalProfileObjects?.[sel.index])course.longitudinalProfileObjects.splice(sel.index,1);else if(sel.kind==='ink'&&course.longitudinalProfileInk?.[sel.index])course.longitudinalProfileInk.splice(sel.index,1);else if(sel.kind==='profileEdit'&&course.longitudinalProfile)deleteProfileManualEdit(course.longitudinalProfile,sel.id);canvas._longSelection=null;syncCourseLongSelectionUi();persistState();redrawCourseLongProfileEditor();toast('Element del perfil eliminat');}
function deleteReachLongSelected(){const canvas=$('#reachSheetProfileEditCanvas'),reach=currentReachSheetReach(),course=reachCourse(reach),sel=canvas?._reachSelection;if(!canvas||!reach||!course||!sel||!requireEditable('eliminar l’element del perfil'))return;const d=ensureReachSheetData(reach);if(sel.kind==='object'&&d.profileObjects?.[sel.index])d.profileObjects.splice(sel.index,1);else if(sel.kind==='ink'&&d.profileInk?.[sel.index])d.profileInk.splice(sel.index,1);else if(sel.kind==='profileEdit'&&course.longitudinalProfile)deleteProfileManualEdit(course.longitudinalProfile,sel.id);canvas._reachSelection=null;syncReachLongSelectionUi();persistState();renderReachProfileEditor();toast('Element del perfil eliminat');}
async function openCourseLongProfile(courseId=state.currentProfileCourseId||state.activeCourseId,{force=false}={}){
  const c=state.features.find(f=>f.id===courseId&&f.type==='watercourse');if(!c)return;state.currentLongProfileCourseId=c.id;
  $('#courseLongProfileModal').classList.remove('hidden');$('#courseLongProfileSubtitle').textContent=`${c.abbr} · ${c.name}`;$('#courseLongProfileStatus').textContent='Calculant perfil del MDE…';
  const p=await ensureCourseLongitudinalProfile(c,{force,preserveManual:true}),valid=(p?.samples||[]).filter(x=>Number.isFinite(x.z)),topologyNote=p?.topologyIssue?` · ⚠ ${p.topologyIssue}`:(p?.componentCount>1?` · ${p.componentCount} fragments desconnectats`:'');
  $('#courseLongProfileStatus').textContent=valid.length?`${formatNum(p.length,1)} m · ${p.sourceName||'MDE'}${Number.isFinite(p.resolution)?` · ${formatNum(p.resolution,2)} m/píxel`:''}${topologyNote}`:'Sense dades MDE disponibles'+topologyNote;if($('#courseLongProfileScale'))$('#courseLongProfileScale').value=String(p.verticalScale||'1');
  installCourseLongProfileEditor();renderCourseLongProfileColorChips();setCourseLongProfileTool(state.longProfileTool||'profile');syncCourseLongSelectionUi();requestAnimationFrame(redrawCourseLongProfileEditor);
}

function expandedBounds(raw,margin=.12,minSize=30){if(!raw)return null;const cx=(raw.minX+raw.maxX)/2,cy=(raw.minY+raw.maxY)/2,rx=Math.max(minSize,raw.maxX-raw.minX),ry=Math.max(minSize,raw.maxY-raw.minY);return{minX:cx-rx*(.5+margin),maxX:cx+rx*(.5+margin),minY:cy-ry*(.5+margin),maxY:cy+ry*(.5+margin)};}
function drawExportRasterStack(g,bounds,cw,ch,pad){const bw=bounds.maxX-bounds.minX,bh=bounds.maxY-bounds.minY,availW=cw-pad*2,availH=ch-pad*2,sc=Math.min(availW/bw,availH/bh),drawW=bw*sc,drawH=bh*sc,offX=pad+(availW-drawW)/2,offY=pad+(availH-drawH)/2;g.save();g.beginPath();g.rect(pad,pad,availW,availH);g.clip();for(const r of state.rasters.filter(x=>x.visible&&x.image&&x.affine)){try{const a=r.affine;g.save();g.globalAlpha=Number.isFinite(+r.opacity)?+r.opacity:1;g.setTransform(sc*a.A,-sc*a.D,sc*a.B,-sc*a.E,offX+sc*(a.C-bounds.minX),offY+drawH+sc*(bounds.minY-a.F));g.drawImage(r.image,0,0);g.restore();}catch(e){console.warn('Mapa exportació',e);}}g.restore();return{sc,tx:x=>offX+(x-bounds.minX)*sc,ty:y=>offY+drawH-(y-bounds.minY)*sc};}
function drawReferenceLayersExport(g,tx,ty,clipBounds){
  for(const layer of state.referenceLayers||[]){if(!layer.visible)continue;if(layer.lightMode&&layer._renderImage&&layer.renderCache?.bounds){const b=layer.renderCache.bounds;if(!clipBounds||boundsIntersect(b,clipBounds)){g.save();g.globalAlpha=Number.isFinite(+layer.opacity)?Math.max(0,Math.min(1,+layer.opacity)):.85;const x0=tx(b.minX),x1=tx(b.maxX),y0=ty(b.maxY),y1=ty(b.minY);g.drawImage(layer._renderImage,x0,y0,x1-x0,y1-y0);g.restore();}continue;}const st=vectorStyleDefault(layer),kind=st.kind,layerOpacity=Number.isFinite(+layer.opacity)?Math.max(0,Math.min(1,+layer.opacity)):.85,scale=1.8;
    for(const f of layer.features||[]){if(f.bounds&&clipBounds&&!boundsIntersect(f.bounds,clipBounds))continue;
      if(kind==='polygon'){
        const rings=(f.paths||[]).filter(p=>p.length>2).map(path=>path.map(p=>({x:tx(p.x),y:ty(p.y)}))).filter(p=>p.length>2);
        if(rings.length&&st.fillStyle!=='none'&&st.fillOpacity>0){g.save();g.globalAlpha=layerOpacity*st.fillOpacity;g.fillStyle=vectorFillPattern(g,st);g.beginPath();for(const pts of rings){g.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)g.lineTo(pts[i].x,pts[i].y);g.closePath();}try{g.fill('evenodd');}catch{g.fill();}g.restore();}
        g.save();g.globalAlpha=layerOpacity*st.strokeOpacity;g.strokeStyle=st.strokeColor;g.lineWidth=Math.max(1,vectorStyleStrokeWidthPx(st)*scale);g.lineCap=st.lineCap;g.lineJoin=st.lineJoin;g.setLineDash((VECTOR_DASHES[st.strokeDash]||[]).map(v=>v*scale));for(const ring of rings){const pts=offsetPolylineScreen(ring,vectorStyleOffsetPx(st)*scale,true);beginCanvasPath(g,pts,true);g.stroke();}g.restore();continue;
      }
      for(const path of f.paths||[]){if(!path.length)continue;if(path.length===1||kind==='point'){for(const p of path){const q={x:tx(p.x),y:ty(p.y)},pst={...st,pointSize:vectorStylePointSizePx(st)*scale,pointUnit:'px',strokeWidth:vectorStyleStrokeWidthPx(st)*scale,strokeUnit:'px'};drawVectorPointSymbol(g,q,pst,layerOpacity);}continue;}const base=path.map(p=>({x:tx(p.x),y:ty(p.y)}));g.save();g.globalAlpha=layerOpacity*st.strokeOpacity;g.strokeStyle=st.strokeColor;g.lineWidth=Math.max(1,vectorStyleStrokeWidthPx(st)*scale);g.lineCap=st.lineCap;g.lineJoin=st.lineJoin;g.setLineDash((VECTOR_DASHES[st.strokeDash]||[]).map(v=>v*scale));const pts=offsetPolylineScreen(base,vectorStyleOffsetPx(st)*scale,false);beginCanvasPath(g,pts,false);g.stroke();g.restore();}
    }
  }
}
function longestCourseFragment(c){const fr=courseFragments(c);return fr.slice().sort((a,b)=>polylineLength(b)-polylineLength(a))[0]||[];}
function courseLabelPoint(c){const f=longestCourseFragment(c);return f.length?pointAtAlong(f,polylineLength(f)/2):null;}
function drawCourseNamesExport(g,courses,tx,ty,{activeId=null}={}){const used=[];g.textBaseline='middle';for(let i=0;i<courses.length;i++){const wc=courses[i],m=courseLabelPoint(wc);if(!m)continue;const label=`${wc.abbr||''}${wc.name?` · ${wc.name}`:''}`.trim();if(!label)continue;const fs=wc.id===activeId?13:11;g.font=`700 ${fs}px system-ui,sans-serif`;const tw=g.measureText(label).width;let x=tx(m.x)+7,y=ty(m.y)+(i%2?12:-12),box;for(let k=0;k<7;k++){box={x:x-4,y:y-9,w:tw+8,h:18};if(!used.some(b=>box.x<b.x+b.w&&box.x+box.w>b.x&&box.y<b.y+b.h&&box.y+box.h>b.y))break;y+=(i%2?14:-14);}used.push(box);g.lineWidth=3.5;g.strokeStyle='rgba(255,255,255,.95)';g.strokeText(label,x,y);g.fillStyle=wc.id===activeId?'#164e79':'#28495d';g.fillText(label,x,y);}}
function renderProjectMapImage(bounds,{width=1400,height=900,activeCourse=null,showReaches=false,showCourseNames=false,showTitle=true}={}){const c=document.createElement('canvas');c.width=width;c.height=height;const g=c.getContext('2d');g.fillStyle='#faf9f4';g.fillRect(0,0,c.width,c.height);if(!bounds)return c;const pad=52,{sc,tx,ty}=drawExportRasterStack(g,bounds,c.width,c.height,pad);drawReferenceLayersExport(g,tx,ty,bounds);const courses=hydroCourses().filter(w=>boundsIntersect(featureBounds(w),bounds));g.lineCap='round';g.lineJoin='round';for(const wc of courses){const wst=featureLineStyle(wc,{color:wc.id===activeCourse?.id?'#105c96':'#3a6987',width:wc.id===activeCourse?.id?5:2.4,dash:'solid'});g.strokeStyle=wst.color;g.lineWidth=wst.width;g.setLineDash(wst.dash);for(const frag of courseFragments(wc)){if(frag.length<2)continue;g.beginPath();frag.forEach((p,i)=>i?g.lineTo(tx(p.x),ty(p.y)):g.moveTo(tx(p.x),ty(p.y)));g.stroke();}}
  if(activeCourse&&showReaches){for(const rr of orderedCourseReaches(activeCourse.id)){if(!rr.points?.length)continue;const rst=featureLineStyle(rr,{color:'#d58425',width:5.5,dash:'solid'});g.save();g.strokeStyle=rst.color;g.lineWidth=rst.width;g.setLineDash(rst.dash);g.beginPath();rr.points.forEach((p,i)=>i?g.lineTo(tx(p.x),ty(p.y)):g.moveTo(tx(p.x),ty(p.y)));g.stroke();g.restore();}for(const b of reachBoundaryRecords(activeCourse.id)){const frag=courseFragments(activeCourse)[b.fragmentIndex];if(!frag)continue;const q=b.point,eps=Math.max(.15,8/sc),a=pointAtAlong(frag,Math.max(0,b.along-eps)),z=pointAtAlong(frag,Math.min(polylineLength(frag),b.along+eps)),dx=(z.x-a.x)*sc,dy=-(z.y-a.y)*sc,L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L,x=tx(q.x),y=ty(q.y);g.strokeStyle='#8d510f';g.lineWidth=2;g.beginPath();g.moveTo(x-nx*7,y-ny*7);g.lineTo(x+nx*7,y+ny*7);g.stroke();g.fillStyle='#f4a43b';g.beginPath();g.arc(x,y,3,0,Math.PI*2);g.fill();}const used=[];const reaches=orderedCourseReaches(activeCourse.id);g.font='700 12px system-ui,sans-serif';g.textBaseline='middle';for(let i=0;i<reaches.length;i++){const r=reaches[i],m=reachLabelPoint(r),label=r.reachCode||r.id,tw=g.measureText(label).width,side=i%2?1:-1;let x=tx(m.x)+7,y=ty(m.y)+side*11,box;for(let k=0;k<7;k++){box={x:x-3,y:y-8,w:tw+6,h:16};if(!used.some(b=>box.x<b.x+b.w&&box.x+box.w>b.x&&box.y<b.y+b.h&&box.y+box.h>b.y))break;y+=side*14;}used.push(box);g.lineWidth=3.5;g.strokeStyle='rgba(255,255,255,.94)';g.strokeText(label,x,y);g.fillStyle='#7b4612';g.fillText(label,x,y);}}
  if(showCourseNames)drawCourseNamesExport(g,courses,tx,ty,{activeId:activeCourse?.id||null});if(showTitle&&activeCourse){g.fillStyle='#20352a';g.font='700 18px system-ui,sans-serif';g.fillText(`${activeCourse.abbr} · ${activeCourse.name}`,54,31);}g.font='15px system-ui,sans-serif';g.fillStyle='#20352a';g.fillText('N',c.width-58,34);g.beginPath();g.moveTo(c.width-51,70);g.lineTo(c.width-51,42);g.lineTo(c.width-59,53);g.moveTo(c.width-51,42);g.lineTo(c.width-43,53);g.strokeStyle='#20352a';g.lineWidth=2;g.stroke();return c;}
function basinMapDataUrl(course){const raw=featureBounds(course),bounds=expandedBounds(raw,.14,45),c=renderProjectMapImage(bounds,{width:1100,height:1450,activeCourse:course,showReaches:true,showCourseNames:false,showTitle:true});const g=c.getContext('2d'),dem=state.rasters.filter(r=>r.meta?.kind==='dem').sort((a,b)=>(sourceResolution(a)||Infinity)-(sourceResolution(b)||Infinity))[0];if(dem){const res=sourceResolution(dem);g.font='13px system-ui,sans-serif';g.fillStyle='rgba(42,52,46,.75)';g.fillText(`MDE: ${dem.name}${Number.isFinite(res)?` · ${formatNum(res,2)} m/píxel`:''}`,54,c.height-18);}return c.toDataURL('image/jpeg',.9);}
function generalMapDataUrl(){const raw=projectRasterBounds();if(!raw)return'';const bounds=expandedBounds(raw,.015,1),c=renderProjectMapImage(bounds,{width:1800,height:1250,activeCourse:null,showReaches:false,showCourseNames:true,showTitle:false});const g=c.getContext('2d');g.fillStyle='rgba(250,249,244,.92)';g.fillRect(38,22,Math.min(620,c.width-76),42);g.fillStyle='#20352a';g.font='700 23px system-ui,sans-serif';g.fillText(`Mapa general · ${state.project?.name||'GeoCauce'}`,54,50);return c.toDataURL('image/jpeg',.92);}
function dataUrlBlob(url){const [head,b64]=String(url||'').split(',');if(!b64)return null;const mime=(head.match(/data:([^;]+)/)||[])[1]||'image/jpeg',bin=atob(b64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new Blob([u],{type:mime});}

function safeExportInk(store,w,h){try{return renderInkToDataUrl(store,w,h);}catch(e){console.warn('FITXA I · tinta exportació',e);return'';}}
function safeExportMap(course){try{return basinMapDataUrl(course);}catch(e){console.warn('FITXA I · mapa exportació',e);return'';}}
function safeExportProfile(course,profile){try{return courseLongProfileDataUrl(course,profile);}catch(e){console.warn('FITXA I · perfil exportació',e);return'';}}
async function profileExportPayload(course){
  const repair=normalizeCourseFragments(course,{remapReaches:true});if(repair.changed)persistState();renumberCourseReaches(course.id);
  const reaches=orderedCourseReaches(course.id);
  // Una fallada del MDE d'un sol tram no ha d'impedir exportar tota la fitxa.
  await Promise.allSettled(reaches.map(r=>ensureReachMdeStats(r)));
  let longProfile=null;try{longProfile=await ensureCourseLongitudinalProfile(course,{preserveManual:true});}catch(e){console.warn('FITXA I · perfil longitudinal',e);}
  const profilePng=longProfile?safeExportProfile(course,longProfile):'';
  persistState();
  return{title:'FITXA I - PERFIL LONGITUDINAL',projectName:state.project?.name||'',torrentName:course.name||'',abbr:course.abbr||'',crs:state.project?.crs||'EPSG:25831',author:state.project?.author||currentCampaign()?.author||'',organization:state.project?.institution||'',exportDate:today(),campaignDate:currentCampaign()?.date||'',campaignName:currentCampaign()?.name||state.campaign,mapPng:safeExportMap(course),profilePng,profileSource:longProfile?.sourceName||'',profileResolution:Number.isFinite(longProfile?.resolution)?longProfile.resolution:null,rows:reaches.map(r=>({code:r.reachCode||r.id,startX:Math.round(r.points[0]?.x||0),startY:Math.round(r.points[0]?.y||0),endX:Math.round(r.points.at(-1)?.x||0),endY:Math.round(r.points.at(-1)?.y||0),lengthM:r.mdeStats?.lengthM??featureLength(r),minElevation:r.mdeStats?.minElevation??null,maxElevation:r.mdeStats?.maxElevation??null,mdeSlopePct:r.mdeStats?.mdeSlopePct??null,slopePng:safeExportInk(r.fieldSlopeInk,150,300),changePng:safeExportInk(r.changeCodeInk,110,300),obsPng:safeExportInk(r.observationsInk,900,300)}))};}
function updateDownloadExportButton(){const btn=$('#downloadContentsExport'),checked=$$('#downloadContentsList input:checked').length;if(btn)btn.disabled=checked===0;const st=$('#downloadContentsStatus');if(st&&!btn?.disabled&&st.dataset.busy!=='1')st.textContent=`${checked} contingut${checked===1?'':'s'} seleccionat${checked===1?'':'s'}`;}
function openDownloadContents(){
  const root=$('#downloadContentsList'),btn=$('#downloadContentsExport'),st=$('#downloadContentsStatus');root.innerHTML='';if(btn){btn.disabled=false;btn.textContent='Exportar seleccionades';}if(st){st.dataset.busy='0';st.textContent='';st.classList.add('hidden');}
  if(projectRasterBounds()){const row=document.createElement('label');row.className='download-item';row.innerHTML=`<input type="checkbox" value="__general_map__" checked><img src="icons/mapa.png" alt=""><span><b>MAPA GENERAL · ${escapeHtml(state.project?.name||'Projecte')}</b><small>Extensió definida pels mapes del projecte · cursos i noms · sense trams</small></span>`;row.querySelector('input').addEventListener('change',updateDownloadExportButton);root.appendChild(row);}
  const listedSections=new Set();
  for(const c of hydroCourses()){
    const row=document.createElement('label');row.className='download-item';row.innerHTML=`<input type="checkbox" value="course:${c.id}" checked><img src="icons/ficha.png" alt=""><span><b>FITXA I · ${escapeHtml(c.abbr)} · ${escapeHtml(c.name)}</b><small>${courseReaches(c.id).length} trams · mapa enquadrat automàticament al torrent</small></span>`;row.querySelector('input').addEventListener('change',updateDownloadExportButton);root.appendChild(row);
    for(const r of orderedCourseReaches(c.id)){
      const sub=document.createElement('label');sub.className='download-item';sub.style.paddingLeft='46px';sub.innerHTML=`<input type="checkbox" value="reachsheet:${r.id}" checked><img src="icons/pagina.png" alt=""><span><b>FITXA II · ${escapeHtml(r.reachCode||r.id)}</b><small>${escapeHtml(c.abbr||'')} · ${escapeHtml(c.name||'')} · perfil longitudinal del tram</small></span>`;sub.querySelector('input').addEventListener('change',updateDownloadExportButton);root.appendChild(sub);
      for(const sec of reachSections(r.id)){listedSections.add(sec.id);const secRow=document.createElement('label');secRow.className='download-item';secRow.style.paddingLeft='78px';secRow.innerHTML=`<input type="checkbox" value="sectionsheet:${sec.id}" checked><img src="icons/seccion.svg" alt=""><span><b>FITXA III · ${escapeHtml(sec.sectionName||sec.sheetIII?.sectionName||sec.id)}</b><small>${escapeHtml(r.reachCode||r.id)} · secció transversal</small></span>`;secRow.querySelector('input').addEventListener('change',updateDownloadExportButton);root.appendChild(secRow);}
    }
  }
  for(const sec of state.features.filter(f=>f.type==='section'&&!listedSections.has(f.id))){const secRow=document.createElement('label');secRow.className='download-item';secRow.innerHTML=`<input type="checkbox" value="sectionsheet:${sec.id}" checked><img src="icons/seccion.svg" alt=""><span><b>FITXA III · ${escapeHtml(sec.sectionName||sec.sheetIII?.sectionName||sec.id)}</b><small>Secció transversal</small></span>`;secRow.querySelector('input').addEventListener('change',updateDownloadExportButton);root.appendChild(secRow);}
  if(!root.children.length)root.innerHTML='<p class="muted">Encara no hi ha continguts exportables.</p>';$('#downloadContentsModal').classList.remove('hidden');updateDownloadExportButton();
}

function exportWrapText(ctx,text,x,y,maxW,lineH,maxLines=99){
  const words=String(text??'').split(/\s+/).filter(Boolean);let line='',yy=y,lines=0;
  for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>maxW&&line){ctx.fillText(line,x,yy);yy+=lineH;lines++;line=word;if(lines>=maxLines)return yy;}else line=test;}
  if(line&&lines<maxLines){ctx.fillText(line,x,yy);yy+=lineH;}return yy;
}
function exportCell(ctx,x,y,w,h,{fill='#fff',stroke='#333'}={}){ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);ctx.strokeStyle=stroke;ctx.lineWidth=1.3;ctx.strokeRect(x,y,w,h);}
function exportFitxaIIIMeta(ctx,f,d,y=92){const course=sectionCourse(f),reach=sectionReach(f),x=55,w=1130,h=46;ctx.fillStyle='#111';const rows=[['Nom torrent:',course?`${course.abbr||''}, ${course.name||''}`:'—','Nom tram:',reach?.reachCode||reach?.id||'—'],['Nom secció:',d.sectionName||f.sectionName||f.id,'Data visita:',d.visitDate||'—'],['Fotografia:','↑ (riu amunt)   ↓ (riu avall)','','']];for(const row of rows){exportCell(ctx,x,y,w,h);ctx.fillStyle='#111';ctx.font='700 18px sans-serif';ctx.fillText(row[0],x+10,y+29);ctx.font='18px sans-serif';ctx.fillText(row[1],x+155,y+29);if(row[2]){ctx.font='700 18px sans-serif';ctx.fillText(row[2],x+620,y+29);ctx.font='18px sans-serif';ctx.fillText(row[3],x+765,y+29);}y+=h;}return y;}
async function renderFitxaIIIPage1(f){
  const previousSection=state.currentSection;state.currentSection=f.id;try{await ensureSectionProfile(f);}catch{}finally{state.currentSection=previousSection;}const d=ensureSectionSheetData(f),c=document.createElement('canvas');c.width=1240;c.height=1754;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.fillStyle='#666';g.font='700 30px sans-serif';g.textAlign='center';g.fillText('FITXA III- SECCIÓ TRANSVERSAL',620,54);g.textAlign='left';let y=exportFitxaIIIMeta(g,f,d,78);g.font='700 22px sans-serif';g.fillStyle='#111';g.fillText('Esquema (geometria amb acotacions de pendent, bancs, riu)',55,y+36);y+=56;
  const sc=document.createElement('canvas');sc.width=1120;sc.height=820;sc._dpr=1;sc.getBoundingClientRect=()=>({left:0,top:0,right:1120,bottom:820,width:1120,height:820});const sg=sc.getContext('2d'),prev=state.currentSection;state.currentSection=f.id;try{drawSectionBase(sc);const rr={width:1120,height:820};for(const st of f.sectionInk||[])drawInkRecord(sg,rr,st,1,false);(f.sectionObjects||[]).forEach((o,i)=>drawSectionStructuredObject(sg,rr,{...o,latest:i===(f.sectionObjects||[]).length-1&&(o.kind==='measure'||o.kind==='height')},1,false,sc,f));}finally{state.currentSection=prev;}g.strokeStyle='#333';g.lineWidth=1.5;g.strokeRect(55,y,1130,830);g.drawImage(sc,60,y+5,1120,820);y+=855;
  const m=ensureSectionMeasurements(f);g.font='700 19px sans-serif';g.fillStyle='#111';g.fillText('Mesures / observacions',55,y);g.font='17px sans-serif';const bits=[];if(m.width!==''&&m.width!=null)bits.push(`Amplada canal: ${formatLengthUnit(+m.width,2)}`);if(m.depth!==''&&m.depth!=null)bits.push(`Prof. màxima: ${formatLengthUnit(+m.depth,2)}`);if(bits.length)g.fillText(bits.join('   ·   '),55,y+30);if((m.note||'').trim()){g.font='16px sans-serif';exportWrapText(g,m.note,55,y+58,1130,22,5);}if((d.observations||'').trim()){g.font='700 18px sans-serif';g.fillText('Observacions:',55,y+118);g.font='16px sans-serif';exportWrapText(g,d.observations,180,y+118,1005,22,5);}return c.toDataURL('image/png');
}
function renderFitxaIIIPage2(f){
  const d=ensureSectionSheetData(f),c=document.createElement('canvas');c.width=1240;c.height=1754;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.fillStyle='#666';g.font='700 30px sans-serif';g.textAlign='center';g.fillText('FITXA III- SECCIÓ TRANSVERSAL',620,54);g.textAlign='left';let y=exportFitxaIIIMeta(g,f,d,78)+28;g.fillStyle='#111';g.font='700 23px sans-serif';g.fillText('Taula de camp',55,y);y+=24;const x0=45,labelW=275,colW=181,headerH=72;exportCell(g,x0,y,labelW,headerH,{fill:'#f1efe9'});SECTION_TABLE_COLS.forEach(([,lab],i)=>{const x=x0+labelW+i*colW;exportCell(g,x,y,colW,headerH,{fill:'#f1efe9'});g.fillStyle='#111';g.font='700 16px sans-serif';g.textAlign='center';exportWrapText(g,lab,x+8,y+28,colW-16,19,2);});g.textAlign='left';y+=headerH;
  const rowH=86;for(const row of SECTION_TABLE_ROWS){exportCell(g,x0,y,labelW,rowH,{fill:'#faf9f5'});g.fillStyle='#111';g.font='700 15px sans-serif';exportWrapText(g,row.label,x0+9,y+23,labelW-18,18,4);SECTION_TABLE_COLS.forEach(([col],i)=>{const x=x0+labelW+i*colW;exportCell(g,x,y,colW,rowH);const val=d.table?.[row.key]?.[col]??'',ink=d.tableInk?.[row.key]?.[col]||[];if(ink.length){const ic=document.createElement('canvas');ic.width=colW-12;ic.height=rowH-12;const ig=ic.getContext('2d'),rr={width:ic.width,height:ic.height};for(const st of ink)drawInkRecord(ig,rr,st,1,false);g.drawImage(ic,x+6,y+6);}if(val){g.fillStyle='#222';g.font='13px sans-serif';exportWrapText(g,val,x+8,y+rowH-18,colW-16,15,2);}});y+=rowH;}
  g.fillStyle='#333';g.font='14px sans-serif';exportWrapText(g,'Codis certesa: A = observació directa / mesura; B = estimació raonable; C = interpretació / estimada / assumit; D = incert; X = no possible.',55,1690,1130,18,2);return c.toDataURL('image/png');
}
function renderFitxaIIIPage3(f){
  const d=ensureSectionSheetData(f),c=document.createElement('canvas');c.width=1240;c.height=1754;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.fillStyle='#666';g.font='700 30px sans-serif';g.textAlign='center';g.fillText('FITXA III- SECCIÓ TRANSVERSAL',620,54);g.textAlign='left';let y=78;g.fillStyle='#111';g.font='700 25px sans-serif';g.fillText('FIC (field index Connectivity)',55,y+26);y+=48;const x=[40,430,790,930,1200],hh=42;g.font='700 17px sans-serif';for(let i=0;i<4;i++)exportCell(g,x[i],y,x[i+1]-x[i],hh,{fill:'#f1efe9'});g.fillStyle='#111';g.fillText('Criteri',x[0]+8,y+27);g.fillText('Rang',x[1]+8,y+27);g.fillText('Puntuació',x[2]+8,y+27);g.fillText('notes',x[3]+8,y+27);y+=hh;
  for(const row of REACH_FIC_ROWS){if(row.group){exportCell(g,x[0],y,x[4]-x[0],38,{fill:'#f6f4ef'});g.font='700 16px sans-serif';g.fillStyle='#111';g.fillText(row.group,x[0]+8,y+25);y+=38;continue;}const rec=d.fic?.[row.key]||{},h=Math.max(142,row.options.length*28);for(let i=0;i<4;i++)exportCell(g,x[i],y,x[i+1]-x[i],h);g.fillStyle='#111';g.font='700 14px sans-serif';exportWrapText(g,(row.prefix?row.prefix+' ':'')+row.label,x[0]+8,y+21,x[1]-x[0]-16,17,6);if(row.note){g.font='italic 12px sans-serif';exportWrapText(g,row.note,x[0]+8,y+h-43,x[1]-x[0]-16,15,3);}g.font='14px sans-serif';let ry=y+21;for(const o of row.options){g.fillText(o.text,x[1]+8,ry);ry+=24;}const score=optionalScore(rec.score);g.font='700 25px sans-serif';g.textAlign='center';g.fillText(score===null?'—':String(score),(x[2]+x[3])/2,y+h/2);g.textAlign='left';if(rec.noteInk?.length){const nc=document.createElement('canvas');nc.width=x[4]-x[3]-10;nc.height=h-10;const ng=nc.getContext('2d');ng.fillStyle='#fff';ng.fillRect(0,0,nc.width,nc.height);const rr={width:nc.width,height:nc.height};for(const st of rec.noteInk)drawInkRecord(ng,rr,st,1,false);g.drawImage(nc,x[3]+5,y+5);}else if(rec.note){g.font='13px sans-serif';exportWrapText(g,rec.note,x[3]+7,y+21,x[4]-x[3]-14,16,6);}y+=h;}
  exportCell(g,x[0],y,x[4]-x[0],82,{fill:'#faf9f5'});g.font='italic 15px sans-serif';g.fillStyle='#111';g.fillText('Total, puntuació del component pendent avall **',x[0]+8,y+23);g.font='13px sans-serif';exportWrapText(g,'Notes: ** Es proporciona la puntuació total del component de pendent ascendent. per: Sd=Ad+ Bd+Cd+ WdDd1 +(1 − Wd)Dd2',x[0]+8,y+46,x[2]-x[0]-15,16,2);g.font='700 25px sans-serif';const total=calcSectionFicTotal(f);g.fillText(total===null?'—':String(total),x[2]+35,y+50);y+=82;exportCell(g,x[0],y,x[4]-x[0],46,{fill:'#e4e4e4'});g.font='17px sans-serif';g.fillStyle='#111';g.fillText("L’índex de connectivitat del camp ve donat per FIC=(Su+Sd)/2",x[0]+8,y+30);return c.toDataURL('image/png');
}
async function buildSectionSheetExportPayload(f){const course=sectionCourse(f),reach=sectionReach(f),d=ensureSectionSheetData(f);return{title:'FITXA III - SECCIÓ TRANSVERSAL',projectName:state.project?.name||'',abbr:course?.abbr||'SEC',torrentName:course?.name||'',reachCode:reach?.reachCode||reach?.id||'',sectionName:d.sectionName||f.sectionName||f.id,page1Png:await renderFitxaIIIPage1(f),page2Png:renderFitxaIIIPage2(f),page3Png:renderFitxaIIIPage3(f)};}
function nativeExportSectionSheetPdf(payload){
  if(!ANDROID_NATIVE)return'';const json=JSON.stringify(payload);
  if(window.GeoCauceNative?.beginSectionSheetExport&&window.GeoCauceNative?.appendSectionSheetExportChunk&&window.GeoCauceNative?.finishSectionSheetExport){
    const token=nativeCall('beginSectionSheetExport');if(!token)return'';const size=160000;
    for(let i=0;i<json.length;i+=size){if(!nativeCall('appendSectionSheetExportChunk',token,json.slice(i,i+size))){nativeCall('cancelSectionSheetExport',token);return'';}}
    return nativeCall('finishSectionSheetExport',token)||'';
  }
  return window.GeoCauceNative?.exportSectionSheetPdf?nativeCall('exportSectionSheetPdf',json)||'':'';
}
function nativeExportProfileSheetPdf(payload){
  if(!ANDROID_NATIVE)return'';const json=JSON.stringify(payload);
  if(window.GeoCauceNative?.beginProfileSheetExport&&window.GeoCauceNative?.appendProfileSheetExportChunk&&window.GeoCauceNative?.finishProfileSheetExport){
    const token=nativeCall('beginProfileSheetExport');if(!token)return'';const size=160000;
    for(let i=0;i<json.length;i+=size){if(!nativeCall('appendProfileSheetExportChunk',token,json.slice(i,i+size))){nativeCall('cancelProfileSheetExport',token);return'';}}
    return nativeCall('finishProfileSheetExport',token)||'';
  }
  return window.GeoCauceNative?.exportProfileSheetPdf?nativeCall('exportProfileSheetPdf',json)||'':'';
}
async function exportSelectedContents(){
  const ids=$$('#downloadContentsList input:checked').map(x=>x.value);if(!ids.length){toast('Selecciona almenys un contingut');return;}
  const btn=$('#downloadContentsExport'),st=$('#downloadContentsStatus'),oldLabel=btn?.textContent||'Exportar seleccionades';let ok=0,failed=[];
  if(btn){btn.disabled=true;btn.textContent='Preparant…';}if(st){st.dataset.busy='1';st.classList.remove('hidden');st.textContent='Preparant l’exportació…';}
  try{
    for(let n=0;n<ids.length;n++){
      const id=ids[n];await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));
      if(id==='__general_map__'){
        try{if(st)st.textContent=`Generant mapa general · ${n+1}/${ids.length}…`;const url=generalMapDataUrl(),blob=dataUrlBlob(url);if(!blob)throw Error('No hi ha mapes georeferenciats visibles');await downloadBlob(blob,`MAPA_GENERAL_${safeSlug(state.project?.name||'GeoCauce')}.jpg`);ok++;}catch(e){console.error('Mapa general',e);failed.push(`Mapa general: ${e?.message||String(e)}`);}continue;
      }
      if(id.startsWith('course:')){
        const c=state.features.find(f=>f.id===id.slice(7)&&f.type==='watercourse');if(!c)continue;if(st)st.textContent=`Preparant ${c.abbr||c.name||'fitxa'} · ${n+1}/${ids.length}…`;
        try{const payload=await profileExportPayload(c);if(st)st.textContent=`Generant PDF ${c.abbr||c.name||''} · ${n+1}/${ids.length}…`;await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));
          if(ANDROID_NATIVE&&(window.GeoCauceNative?.finishProfileSheetExport||window.GeoCauceNative?.exportProfileSheetPdf)){const uri=nativeExportProfileSheetPdf(payload);if(uri)ok++;else failed.push(`${c.abbr||c.id}: ${nativeCall('getLastExportError')||'error natiu desconegut'}`);}
          else{const html=`<!doctype html><meta charset="utf-8"><title>${escapeHtml(payload.title)}</title><h2>${escapeHtml(payload.title)}</h2><b>Nom torrent:</b> ${escapeHtml(c.abbr)}, ${escapeHtml(c.name)}<br><small>Autor: ${escapeHtml(payload.author||'—')} · Organització: ${escapeHtml(payload.organization||'—')} · Data: ${escapeHtml(payload.exportDate||'—')}</small><br>${payload.mapPng?`<img style="width:100%;max-width:1000px" src="${payload.mapPng}">`:''}<pre>${escapeHtml(JSON.stringify(payload.rows,null,2))}</pre>${payload.profilePng?`<h3>Perfil longitudinal</h3><img style="width:100%;max-width:1000px" src="${payload.profilePng}">`:''}`;await downloadBlob(new Blob([html],{type:'text/html'}),`FITXA_I_${safeSlug(c.abbr+'_'+c.name)}.html`);ok++;}
        }catch(e){console.error('FITXA I · exportació',c?.id,e);failed.push(`${c.abbr||c.id}: ${e?.message||String(e)}`);}continue;
      }
      if(id.startsWith('reachsheet:')){
        const r=state.features.find(f=>f.id===id.slice(11)&&f.type==='reach');if(!r)continue;const c=reachCourse(r);if(st)st.textContent=`Preparant ${r.reachCode||r.id} · ${n+1}/${ids.length}…`;
        try{const payload=await buildReachSheetExportPayload(r);if(st)st.textContent=`Generant FITXA II ${r.reachCode||r.id} · ${n+1}/${ids.length}…`;await new Promise(r2=>requestAnimationFrame(()=>setTimeout(r2,0)));
          if(ANDROID_NATIVE&&(window.GeoCauceNative?.finishReachSheetExport||window.GeoCauceNative?.exportReachSheetPdf)){const uri=nativeExportReachSheetPdf(payload);if(uri)ok++;else failed.push(`${r.reachCode||r.id}: ${nativeCall('getLastExportError')||'error natiu desconegut'}`);}
          else{const html=`<!doctype html><meta charset="utf-8"><title>${escapeHtml(payload.title)}</title><h2>${escapeHtml(payload.title)} · ${escapeHtml(r.reachCode||r.id)}</h2><b>Nom torrent:</b> ${escapeHtml(c?.abbr||'')}, ${escapeHtml(c?.name||'')}<br><b>Observador:</b> ${escapeHtml(payload.observer||'—')}<br><b>Data visita:</b> ${escapeHtml(payload.visitDate||'—')}<br>${payload.schemePng?`<img style="width:100%;max-width:1000px" src="${payload.schemePng}">`:''}${payload.profilePng?`<h3>Perfil longitudinal</h3><img style="width:100%;max-width:1000px" src="${payload.profilePng}">`:''}<pre>${escapeHtml(JSON.stringify(payload,null,2))}</pre>`;await downloadBlob(new Blob([html],{type:'text/html'}),`FITXA_II_${safeSlug((c?.abbr||'TR')+'_'+(r.reachCode||r.id))}.html`);ok++;}
        }catch(e){console.error('FITXA II · exportació',r?.id,e);failed.push(`${r.reachCode||r.id}: ${e?.message||String(e)}`);}continue;
      }
      if(id.startsWith('sectionsheet:')){
        const sec=state.features.find(f=>f.id===id.slice(13)&&f.type==='section');if(!sec)continue;const sd=ensureSectionSheetData(sec);if(st)st.textContent=`Preparant FITXA III ${sd.sectionName||sec.id} · ${n+1}/${ids.length}…`;
        try{const payload=await buildSectionSheetExportPayload(sec);if(st)st.textContent=`Generant FITXA III ${sd.sectionName||sec.id} · ${n+1}/${ids.length}…`;await new Promise(r2=>requestAnimationFrame(()=>setTimeout(r2,0)));
          if(ANDROID_NATIVE&&(window.GeoCauceNative?.finishSectionSheetExport||window.GeoCauceNative?.exportSectionSheetPdf)){const uri=nativeExportSectionSheetPdf(payload);if(uri)ok++;else failed.push(`${sd.sectionName||sec.id}: ${nativeCall('getLastExportError')||'error natiu desconegut'}`);}
          else{const html=`<!doctype html><meta charset="utf-8"><title>${escapeHtml(payload.title)}</title><h2>${escapeHtml(payload.title)} · ${escapeHtml(sd.sectionName||sec.id)}</h2>${payload.page1Png?`<img style="width:100%;max-width:1000px" src="${payload.page1Png}">`:''}${payload.page2Png?`<img style="width:100%;max-width:1000px" src="${payload.page2Png}">`:''}${payload.page3Png?`<img style="width:100%;max-width:1000px" src="${payload.page3Png}">`:''}`;await downloadBlob(new Blob([html],{type:'text/html'}),`FITXA_III_${safeSlug((payload.abbr||'SEC')+'_'+(payload.reachCode||'TRAM')+'_'+(sd.sectionName||sec.id))}.html`);ok++;}
        }catch(e){console.error('FITXA III · exportació',sec?.id,e);failed.push(`${sd.sectionName||sec.id}: ${e?.message||String(e)}`);}continue;
      }
    }
  }finally{if(btn){btn.disabled=false;btn.textContent=oldLabel;}if(st){st.dataset.busy='0';st.textContent=failed.length?`${ok} exportat/s · ${failed.length} amb error`:`${ok} contingut${ok===1?'':'s'} exportat${ok===1?'':'s'}`;}updateDownloadExportButton();}
  if(ok&&!failed.length)$('#downloadContentsModal').classList.add('hidden');if(failed.length)toast(`${ok?ok+' exportat/s · ':''}No s’ha pogut exportar: ${failed.join(' · ')}`,8000);else toast(`${ok} contingut${ok===1?'':'s'} exportat${ok===1?'':'s'} a Descargas/GeoCauce`,4200);
}


function initUi(){
  $('#enterBtn').onclick=$('#openCampaignBtn').onclick=enterApp;
  $('#authCloseBtn').onclick=closeAuthModal;$('#authOfflineBtn').onclick=chooseOfflineEntry;$('#authSwitchMode').onclick=()=>setAuthMode(authUiMode==='signin'?'signup':'signin');$('#authTogglePassword').onclick=()=>{const i=$('#authPassword');i.type=i.type==='password'?'text':'password';};$('#authForm').onsubmit=e=>{e.preventDefault();submitAuth();};
  $('#projectAccountBtn').onclick=()=>showSettings('projects');if($('#projectCreateAccountBtn'))$('#projectCreateAccountBtn').onclick=openAccountManage;$('#projectSettingsBtn').onclick=()=>showSettings('projects');$('#settingsFromMapBtn').onclick=()=>{closeFloatingPanels();showSettings('map');};$('#accountManageClose').onclick=closeAccountManage;
  $('#settingsBackBtn').onclick=closeSettings;$('#settingsAccountChip').onclick=openAccountManage;$('#settingsAccountAction').onclick=openAccountManage;$('#settingsSyncAction').onclick=()=>accountState().kind==='account'?syncCurrentProjectToCloud({manual:true}):openAuthModal('manage','signin');$('#settingsCloudSyncBtn').onclick=()=>syncCurrentProjectToCloud({manual:true});$('#settingsExportBackup').onclick=()=>state.projectId?exportProjectPackage():toast('Abre un proyecto para exportar una copia');$('#settingsImportBackup').onclick=()=>$('#projectImportInput').click();
  const settingBindings={settingInputMode:['inputMode','value'],settingPersistentTool:['persistentTool','checked'],settingLengthUnit:['lengthUnit','value'],settingClastUnit:['clastUnit','value'],settingAreaUnit:['areaUnit','value'],settingVolumeUnit:['volumeUnit','value'],settingCoordMode:['coordMode','value'],settingGpsAccuracy:['gpsMinAccuracy','number'],settingPhotoHeading:['photoHeading','checked'],settingGpsAltitude:['gpsAltitude','checked'],settingShowAccuracy:['showAccuracy','checked'],settingNotebookBg:['notebookBg','value'],settingNotebookAutosave:['notebookAutosave','checked'],settingReachPattern:['reachPattern','value'],settingReachCodes:['reachCodes','value'],settingMobileUi:['mobileUi','value']};
  for(const [id,[key,kind]] of Object.entries(settingBindings)){const el=$('#'+id);if(!el)continue;el.onchange=()=>{appSettings[key]=kind==='checked'?el.checked:kind==='number'?+el.value:el.value;saveAppSettings();if(key==='inputMode'&&appSettings.inputMode==='finger'&&state.tool!=='pan')toast('Modo dedo activo · selecciona Mover para navegar con un dedo');if(['lengthUnit','areaUnit','coordMode','showAccuracy'].includes(key)){updateGnssUi();drawAll();const f=state.features.find(x=>x.id===state.selectedId);if(f)showFeatureCard(f);}};}

  $('#projectHomeBack').onclick=()=>{$('#projectScreen').classList.add('hidden');$('#splash').classList.remove('hidden');state.screen='splash';};
  $('#projectHomeNew').onclick=()=>showProjectCreate(null,'projects');$('#projectHomeImport').onclick=()=>$('#projectImportInput').click();
  $('#projectCreateBack').onclick=$('#projectFormCancel').onclick=leaveProjectCreate;
  $('#projectForm').onsubmit=e=>{e.preventDefault();saveProjectForm();};
  $('#projectBtn').onclick=()=>{$('#projectPanel').classList.toggle('hidden');$('#toolMenu').classList.add('hidden');$('#eraserMenu').classList.add('hidden');$('#materialPanel').classList.add('hidden');$('#layersPanel').classList.add('hidden');$('#campaignPanel').classList.add('hidden');$('#searchPanel').classList.add('hidden');$('#legendPanel').classList.add('hidden');updateProjectUi();};
  $('#editProjectBtn').onclick=showCurrentProjectInfo;$('#switchProjectBtn').onclick=closeCurrentProject;$('#createProjectFromMapBtn').onclick=()=>showProjectCreate(null,'map');$('#backupProjectBtn').onclick=exportProjectPackage;$('#importProjectBtn').onclick=()=>$('#projectImportInput').click();
  $('#toolBtn').onclick=()=>{$('#projectPanel').classList.add('hidden');$('#toolMenu').classList.toggle('hidden');$('#eraserMenu').classList.add('hidden');$('#materialPanel').classList.add('hidden');$('#layersPanel').classList.add('hidden');$('#campaignPanel').classList.add('hidden');$('#searchPanel').classList.add('hidden');$('#legendPanel').classList.add('hidden');};
  $$('#toolMenu button[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
  $$('#toolMenu button[data-action="undo"]').forEach(b=>b.onclick=()=>{undoLast();$('#toolMenu').classList.add('hidden');});
  $('#materialBtn').onclick=()=>{$('#projectPanel').classList.add('hidden');$('#materialPanel').classList.toggle('hidden');$('#toolMenu').classList.add('hidden');$('#eraserMenu').classList.add('hidden');$('#layersPanel').classList.add('hidden');$('#campaignPanel').classList.add('hidden');$('#searchPanel').classList.add('hidden');$('#legendPanel').classList.add('hidden');};
  $('#layersBtn').onclick=()=>{$('#projectPanel').classList.add('hidden');$('#layersPanel').classList.toggle('hidden');$('#toolMenu').classList.add('hidden');$('#eraserMenu').classList.add('hidden');$('#materialPanel').classList.add('hidden');$('#campaignPanel').classList.add('hidden');$('#searchPanel').classList.add('hidden');$('#legendPanel').classList.add('hidden');};$('#demGroupsBtn').onclick=()=>openDemGroupModal();$('#demGroupClose').onclick=$('#demGroupCancel').onclick=()=>{$('#demGroupModal').classList.add('hidden');editingDemGroupId=null;};$('#demGroupSave').onclick=saveDemGroup;
  $('#campaignBtn').onclick=()=>{$('#projectPanel').classList.add('hidden');$('#campaignPanel').classList.toggle('hidden');$('#toolMenu').classList.add('hidden');$('#eraserMenu').classList.add('hidden');$('#materialPanel').classList.add('hidden');$('#layersPanel').classList.add('hidden');$('#searchPanel').classList.add('hidden');$('#legendPanel').classList.add('hidden');};
  $('#searchBtn').onclick=()=>{const opening=$('#searchPanel').classList.contains('hidden');closeFloatingPanels(opening?'searchPanel':'');$('#searchPanel').classList.toggle('hidden',!opening);if(opening){$('#searchInput').value='';renderSearchResults();setTimeout(()=>$('#searchInput').focus(),40);}};$('#legendBtn').onclick=()=>{const opening=$('#legendPanel').classList.contains('hidden');closeFloatingPanels(opening?'legendPanel':'');$('#legendPanel').classList.toggle('hidden',!opening);if(opening)renderLegend();};$('#searchInput').oninput=renderSearchResults;
  $$('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).classList.add('hidden'));
  $('#activeToolBtn').onclick=()=>{if(state.tool==='erase')$('#eraserMenu').classList.toggle('hidden');else if(['watercourse','reach'].includes(state.tool))openHydroPicker();else setTool(state.tool);};
  $('#newDayBtn').onclick=openNewDayModal;$('#newDayClose').onclick=$('#newDayCancel').onclick=()=>$('#newDayModal').classList.add('hidden');$('#newDayForm').onsubmit=e=>{e.preventDefault();newDay({date:$('#newDayDate').value,author:$('#newDayAuthor').value.trim(),event:$('#newDayEvent').value,notes:$('#newDayNotes').value.trim()});};$('#comparePreviousToggle').onchange=e=>{state.comparePrevious=e.target.checked;persistState();drawAll();};$('#compareOpacity').oninput=e=>{state.compareOpacity=+e.target.value;persistState();drawAll();};$('#compassBtn').onclick=resetRotation;$('#view3dBtn').onclick=toggle3DMode;$('#terrain3dExaggeration').onchange=e=>{state.view3d.exaggeration=+e.target.value||1;renderTerrain3D();};$('#terrain3dRefresh').onclick=()=>buildTerrain3D({resetCamera:false});$('#terrain3dReset').onclick=resetTerrain3DCamera;installTerrain3DInteractions();
  $('#mapFileInput').onchange=e=>{enqueueMapImports(e.target.files);e.target.value='';};
  $('#vectorImportColor').value=normalizeVectorColor(appSettings.vectorImportColor);$('#vectorImportColor').oninput=e=>{appSettings.vectorImportColor=normalizeVectorColor(e.target.value);saveAppSettings();};$('#vectorImportRole').onchange=()=>$('#vectorImportCustomRole').classList.toggle('hidden',$('#vectorImportRole').value!=='other');
  $('#vectorFileInput').onchange=e=>{enqueueVectorImports(e.target.files);e.target.value='';};
  $('#fitAllBtn').onclick=fitAllContent;$('#zoomInBtn').onclick=()=>zoomAtCenter(1.35);$('#zoomOutBtn').onclick=()=>zoomAtCenter(1/1.35);$('#locateQuickBtn').onclick=locateMe;$('#fitVisibleBtn').onclick=()=>{fitVisibleRasters();$('#layersPanel').classList.add('hidden');};
  $('#exportGeojsonBtn').onclick=exportGeoJSON;$('#clearProjectBtn').onclick=clearProject;
  $('#loadReadyImportsBtn').onclick=loadReadyImports;
  $('#downloadContentsBtn').onclick=openDownloadContents;$('#downloadContentsClose').onclick=$('#downloadContentsCancel').onclick=()=>$('#downloadContentsModal').classList.add('hidden');$('#downloadContentsExport').onclick=exportSelectedContents;
  $('#profileSheetFab').onclick=()=>openProfileSheet(state.activeCourseId);$('#profileSheetClose').onclick=closeProfileSheet;$('#profileInkPen').onclick=()=>{state.profileInkTool='pen';$('#profileInkPen').classList.add('active');$('#profileInkEraser').classList.remove('active');};$('#profileInkEraser').onclick=()=>{state.profileInkTool='eraser';$('#profileInkEraser').classList.add('active');$('#profileInkPen').classList.remove('active');};
  $('#profileZoomOut').onclick=()=>setProfileSheetZoom(state.profileSheetZoom-.15);$('#profileZoomIn').onclick=()=>setProfileSheetZoom(state.profileSheetZoom+.15);$('#profileOrderSelect').onchange=e=>{const c=state.features.find(f=>f.id===state.currentProfileCourseId&&f.type==='watercourse');if(!c)return;c.direction=e.target.value;renumberCourseReaches(c.id);persistState();renderProfileSheetRows(c);refreshProfileAutomaticValues(c.id);drawAll();};$('#courseLongProfileBtn').onclick=()=>openCourseLongProfile(state.currentProfileCourseId);installProfileSheetGestures();
  $('#reachSheetClose').onclick=closeReachSheet;$('#reachSheetPage1Btn').onclick=()=>setReachSheetPage(1);$('#reachSheetPage2Btn').onclick=()=>setReachSheetPage(2);$('#reachSheetZoomOut').onclick=()=>setReachSheetZoom(state.reachSheetZoom-.15);$('#reachSheetZoomIn').onclick=()=>setReachSheetZoom(state.reachSheetZoom+.15);['#reachSheetObserver','#reachSheetVisitDate','#reachSheetFieldSlope','#reachSheetLithology','#reachSheetProfileType','#reachSheetVegetationCover','#reachSheetVegetationType','#reachSheetAnthropic'].forEach(sel=>bindReachSheetInput(sel,saveReachSheetFields));installReachSheetGestures();
  $('#courseLongProfileClose').onclick=()=>{$('#courseLongProfileModal').classList.add('hidden');const c=$('#courseLongProfileCanvas');if(c){c._longActive=null;c._longObjectActive=null;c._longSelection=null;}syncCourseLongSelectionUi();};
  $('#courseLongProfileRecalc').onclick=()=>openCourseLongProfile(state.currentLongProfileCourseId||state.currentProfileCourseId,{force:true});
  $$('[data-long-profile-tool]').forEach(b=>b.onclick=()=>setCourseLongProfileTool(b.dataset.longProfileTool));
  if($('#courseLongProfileDelete'))$('#courseLongProfileDelete').onclick=deleteCourseLongSelected;
  if($('#courseLongProfileScale'))$('#courseLongProfileScale').onchange=e=>{const course=state.features.find(f=>f.id===state.currentLongProfileCourseId&&f.type==='watercourse'),profile=course?.longitudinalProfile,canvas=$('#courseLongProfileCanvas');if(!course||!profile||!canvas)return;const old=String(profile.verticalScale||'1'),next=String(e.target.value||'1');if(old===next)return;remapCourseProfileInkScale(canvas,profile,course.longitudinalProfileInk||[],old,next);profile.verticalScale=next;persistState();redrawCourseLongProfileEditor();};
  $('#courseLongProfileReset').onclick=()=>{const course=state.features.find(f=>f.id===state.currentLongProfileCourseId&&f.type==='watercourse');if(!course?.longitudinalProfile||!requireEditable('restablir el perfil longitudinal'))return;course.longitudinalProfile.manual=null;course.longitudinalProfile.manualEdits=[];const canvas=$('#courseLongProfileCanvas');if(canvas)canvas._longSelection=null;syncCourseLongSelectionUi();persistState();redrawCourseLongProfileEditor();toast('Perfil longitudinal restablert al MDE');};
  $('#courseModalClose').onclick=$('#courseModalCancel').onclick=closeCourseModal;$('#courseForm').onsubmit=e=>{e.preventDefault();saveNewCourse();};$('#courseName').oninput=()=>{if(!$('#courseAbbr').value.trim())$('#courseAbbr').value=suggestAbbr($('#courseName').value);};
  $('#courseJoinClose').onclick=$('#courseJoinCancel').onclick=closeCourseJoinModal;$('#courseJoinConnect').onclick=()=>applyCourseJoinChoice('connect');$('#courseJoinSame').onclick=()=>applyCourseJoinChoice('same');$('#courseJoinNew').onclick=()=>applyCourseJoinChoice('new');
  $('#hydroPickerClose').onclick=()=>$('#hydroPickerModal').classList.add('hidden');$('#hydroNewCourseBtn').onclick=()=>{$('#hydroPickerModal').classList.add('hidden');state.activeCourseId=null;setTool('watercourse',{quiet:true});toast('Traça el primer tros del nou curs amb l’S Pen');};$('#reachEditClose').onclick=$('#reachEditCancel').onclick=closeReachEditModal;$('#reachMoveStart').onclick=()=>beginReachBoundaryMove('start');$('#reachMoveEnd').onclick=()=>beginReachBoundaryMove('end');
  $('#featureCardClose').onclick=()=>{state.selectedId=null;hideFeatureCard();drawAll();};installFeatureCardDrag();
  $('#openSheetBtn').onclick=openSelectedPrimary;
  $('#featurePhotoBtn').onclick=()=>openPhotoGallery(state.selectedId);$('#featurePreviewOpen').onclick=()=>openPhotoGallery(state.selectedId);$('#photoGalleryClose').onclick=()=>$('#photoGalleryModal').classList.add('hidden');$('#addFeaturePhotoBtn').onclick=()=>{if(!requireEditable('añadir fotografías'))return;state.pendingPhotoFor=state.selectedId;$('#photoInput').click();};$('#photoEditorClose').onclick=()=>closePhotoEditor({save:true});$('#photoEditorSave').onclick=async()=>{if(await savePhotoEditor())toast('Anotacions de la fotografia guardades');};$('#photoEditorPen').onclick=()=>{const st=ensurePhotoEditorState();st.tool='pen';syncPhotoEditorToolbar();};$('#photoEditorEraser').onclick=()=>{const st=ensurePhotoEditorState();st.tool='eraser';syncPhotoEditorToolbar();};$('#photoEditorUndo').onclick=()=>{const c=$('#photoEditorCanvas');if(!c?._inkStore?.length)return;c._redoStore=c._redoStore||[];c._redoStore.push(c._inkStore.pop());redrawPhotoEditorCanvas();};$('#photoEditorRedo').onclick=()=>{const c=$('#photoEditorCanvas');if(!c?._redoStore?.length)return;c._inkStore=c._inkStore||[];c._inkStore.push(c._redoStore.pop());redrawPhotoEditorCanvas();};$('#photoEditorFullColorBtn').onclick=()=>{const st=ensurePhotoEditorState(),pick=$('#photoEditorColorPicker');pick.value=st.color||'#1f2b31';pick.click();};$('#photoEditorColorPicker').oninput=e=>{const st=ensurePhotoEditorState();st.color=e.target.value;st.tool='pen';syncPhotoEditorToolbar();renderPhotoEditorColors();};installPhotoEditorInteractions();
  $$('#mapContextMenu [data-map-context-action]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();handleMapContextAction(b.dataset.mapContextAction);});
  $('#historicalPhotoToggle').onclick=()=>{state.showHistoricalPhotoPoints=state.showHistoricalPhotoPoints===false;syncHistoricalPhotoToggle();persistState();drawAll();};syncHistoricalPhotoToggle();
  $('#historicalPhotoClose').onclick=closeHistoricalPhotoPoint;const historicalBackdrop=$('#historicalPhotoModal .modal-backdrop');if(historicalBackdrop)historicalBackdrop.onclick=closeHistoricalPhotoPoint;$('#historicalPhotoCamera').onclick=()=>chooseHistoricalPhoto('camera');$('#historicalPhotoImport').onclick=()=>chooseHistoricalPhoto('import');$('#historicalPhotoLinkStop').onclick=beginHistoricalStopLink;$('#historicalPhotoDelete').onclick=()=>deleteHistoricalPhotoPoint();$('#historicalPhotoCameraInput').onchange=e=>{historicalPhotoChosen(e.target.files[0],'camera');e.target.value='';};$('#historicalPhotoImportInput').onchange=e=>{historicalPhotoChosen(e.target.files[0],'import');e.target.value='';};$('#mapStopClose').onclick=closeMapStop;const stopBackdrop=$('#mapStopModal .modal-backdrop');if(stopBackdrop)stopBackdrop.onclick=closeMapStop;$('#mapStopDelete').onclick=()=>deleteMapStop();
  $('#vectorTraceConnect').onclick=()=>chooseVectorTraceAction('connect');$('#vectorTraceSame').onclick=()=>chooseVectorTraceAction('same');$('#vectorTraceNew').onclick=()=>chooseVectorTraceAction('new');$('#vectorTracePick').onclick=()=>chooseVectorTraceAction('pick');$('#vectorTraceCancel').onclick=()=>{$('#vectorTraceChoiceModal').classList.add('hidden');if(state.vectorExtract)state.vectorExtract.pendingMapTrace=null;};
  $('#mapInkWidth').oninput=e=>{state.mapInkWidth=Math.max(1,+e.target.value||4);persistState();};$('#mapInkColor').oninput=e=>{state.mapInkColor=e.target.value;state.mapInkMode='pen';syncMapInkPanel();persistState();};$$('[data-map-ink-color]').forEach(b=>b.onclick=()=>{state.mapInkColor=b.dataset.mapInkColor;state.mapInkMode='pen';syncMapInkPanel();persistState();});$$('[data-map-ink-mode]').forEach(b=>b.onclick=()=>{state.mapInkMode=b.dataset.mapInkMode;syncMapInkPanel();persistState();});$('#mapInkUndo').onclick=()=>{if(!(state.mapInk||[]).length)return;state.mapInk.pop();persistState();drawAll();};$('#mapInkClear').onclick=()=>{if(!(state.mapInk||[]).length||!confirm('Esborrar totes les anotacions dibuixades sobre el mapa?'))return;state.mapInk=[];persistState();drawAll();};
  $('#notesBtn').onclick=openNotesForSelected;$('#featureMoreBtn').onclick=()=>{const menu=$('#featureMoreMenu'),open=menu.classList.contains('hidden');menu.classList.toggle('hidden',!open);$('#featureMoreBtn').setAttribute('aria-expanded',String(open));};$('#editContourBtn').onclick=()=>{const f=state.features.find(x=>x.id===state.selectedId);if(f?.type==='reach'){openReachEditModal(f);$('#featureMoreMenu').classList.add('hidden');return;}if(!f?.closed){toast('La edición de contorno necesita un polígono cerrado');return;}$('#featureMoreMenu').classList.add('hidden');setTool('editContour');};
  $('#changesBtn').onclick=()=>{$('#campaignPanel').classList.remove('hidden');updateCampaignUi();};
  $('#deleteFeatureBtn').onclick=()=>state.selectedId&&deleteFeature(state.selectedId,true);
  $('#photoInput').onchange=e=>{photoChosen(e.target.files[0]);e.target.value='';};
  $('#projectImportInput').onchange=e=>{const f=e.target.files?.[0];e.target.value='';if(f)importProjectPackage(f);};$('#gnssBadge').onclick=()=>{updateGnssUi();$('#gnssPopover').classList.toggle('hidden');};$('#gnssPopoverClose').onclick=()=>$('#gnssPopover').classList.add('hidden');$('#gnssRefreshBtn').onclick=locateMe;
  $('#sheetClose').onclick=closeSheet;$('#sheetUndo').onclick=()=>{const c=$('#sheetCanvas');if(c._readOnly){toast('Ficha en solo lectura');return;}c._inkStore?.pop();redrawInkStore(c);};
  $$('[data-sheet-tool]').forEach(b=>b.onclick=()=>{if($('#sheetCanvas')._readOnly)return;state.sheetTool=b.dataset.sheetTool;$$('[data-sheet-tool]').forEach(x=>x.classList.toggle('active',x===b));});
  $('#sectionClose').onclick=closeSection;
  $('#sectionZoomReset').onclick=()=>{const f=state.features.find(x=>x.id===state.currentSection),c=$('#sectionCanvas');if(!f||!c)return;const oldVw=sectionVisibleWindow(f),oldRg=sectionDisplayRange(f,c),v=sectionView(f);v.zoomX=1;v.centerD=(f.sectionProfile?.length||featureLength(f)||1)/2;const newVw=sectionVisibleWindow(f),newRg=sectionDisplayRange(f,c);remapSectionDrawingForWindow(f,c,oldVw,newVw);remapSectionDrawingForRange(f,c,oldRg,newRg);updateSectionZoomUi(f);redrawInkStore(c);if(isEditableCampaign())persistState();};
  $$('[data-section-tool]').forEach(b=>b.onclick=()=>{if($('#sectionCanvas')._readOnly)return;const next=b.dataset.sectionTool;if(state.sectionTool!==next)cancelSectionBuilder();state.sectionTool=next;const c=$('#sectionCanvas');if(c&&!['select','profile'].includes(next))c._sectionSelection=null;syncSectionSelectionUi();$$('[data-section-tool]').forEach(x=>x.classList.toggle('active',x===b));const f=state.features.find(x=>x.id===state.currentSection);if(f)syncSectionControls(f);else updateSectionToolHint();});
  $('#sectionPage1Btn').onclick=()=>setSectionFitxaPage(1);$('#sectionPage2Btn').onclick=()=>setSectionFitxaPage(2);$('#sectionPage3Btn').onclick=()=>setSectionFitxaPage(3);
  $('#sectionStraightToggle').onclick=()=>{state.sectionStraightSegments=!state.sectionStraightSegments;$('#sectionStraightToggle').classList.toggle('active',state.sectionStraightSegments);cancelSectionBuilder();toast(state.sectionStraightSegments?'Segments rectes activats':'Traç lliure activat');};
  $('#sectionGeoClass').onchange=e=>{state.sectionGeoClass=e.target.value;if($('#sectionCanvas')._sectionBuilder)$('#sectionCanvas')._sectionBuilder.geoClass=state.sectionGeoClass;redrawInkStore($('#sectionCanvas'));};
  if($('#sectionZoneClass'))$('#sectionZoneClass').onchange=e=>{state.sectionZoneClass=e.target.value;$('#sectionZoneCustom')?.classList.toggle('hidden',state.sectionZoneClass!=='custom');const b=$('#sectionCanvas')?._sectionBuilder;if(b?.tool==='zone'){b.zoneClass=state.sectionZoneClass;b.zoneLabel=sectionZoneLabel();redrawInkStore($('#sectionCanvas'));}updateSectionToolHint();};
  if($('#sectionZoneCustom'))$('#sectionZoneCustom').oninput=e=>{state.sectionZoneCustom=e.target.value;const b=$('#sectionCanvas')?._sectionBuilder;if(b?.tool==='zone'){b.zoneLabel=sectionZoneLabel();redrawInkStore($('#sectionCanvas'));}};
  $('#sectionFinishObject').onclick=finishSectionBuilder;$('#sectionCancelObject').onclick=cancelSectionBuilder;
  $('#sectionCodesBtn').onclick=openCodesReference;$('#reachSheetCodesBtn').onclick=openCodesReference;if($('#profileSheetCodesBtn'))$('#profileSheetCodesBtn').onclick=openCodesReference;$('#codesReferenceClose').onclick=()=>$('#codesReferenceModal').classList.add('hidden');
  ['#sectionNameInput','#sectionVisitDate','#sectionTypeInput','#sectionObservations'].forEach(sel=>{const el=$(sel);if(el){el.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')e.stopPropagation();});el.oninput=saveSectionFitxaHeader;el.onchange=saveSectionFitxaHeader;}});
  $$('[data-section-material]').forEach(b=>b.onclick=()=>{state.sectionMaterial=b.dataset.sectionMaterial;$$('[data-section-material]').forEach(x=>x.classList.toggle('active',x===b));updateSectionToolHint();$('#sectionMaterialPopover')?.classList.add('hidden');});
  $('#sectionFillOpacity').oninput=e=>{state.sectionFillOpacity=+e.target.value;updateSectionToolHint();};
  $('#sectionMaterialToggle').onclick=()=>{$('#sectionColorPopover').classList.add('hidden');$('#sectionMaterialPopover').classList.toggle('hidden');};
  $('#sectionColorToggle').onclick=()=>{$('#sectionMaterialPopover').classList.add('hidden');$('#sectionColorPopover').classList.toggle('hidden');};
  $('#sectionMeasuresBtn').onclick=openSectionMeasures;$('#sectionMeasuresClose').onclick=()=>saveSectionMeasures(true);$('#sectionMeasuresSave').onclick=()=>saveSectionMeasures(true);
  $$('[data-measure-tool]').forEach(b=>b.onclick=()=>{state.sectionMeasureTool=b.dataset.measureTool;$$('[data-measure-tool]').forEach(x=>x.classList.toggle('active',x===b));});
  $$('[data-clear-measure]').forEach(b=>b.onclick=()=>{if(!isEditableCampaign())return;const map={width:'sectionWidthInk',depth:'sectionDepthInk',note:'sectionNoteInk'},c=$('#'+map[b.dataset.clearMeasure]);if(c){c._inkStore=[];redrawInkStore(c);}});
  $('#sectionGridSelect').onchange=e=>{const f=state.features.find(x=>x.id===state.currentSection);if(!f)return;const v=e.target.value,wrap=$('#sectionGridCustomWrap');if(v==='custom'){wrap.classList.remove('hidden');const n=Math.max(.05,+$('#sectionGridCustom').value||1);sectionView(f).gridStep=n;}else{wrap.classList.add('hidden');sectionView(f).gridStep=Math.max(0,+v||0);}if(isEditableCampaign())persistState();updateSectionCanvasMetricSize(f);redrawInkStore($('#sectionCanvas'));};
  $('#sectionGridCustom').oninput=e=>{const f=state.features.find(x=>x.id===state.currentSection);if(!f)return;sectionView(f).gridStep=Math.max(.05,+e.target.value||1);if(isEditableCampaign())persistState();redrawInkStore($('#sectionCanvas'));};
  $('#sectionVerticalScale').onchange=e=>{const f=state.features.find(x=>x.id===state.currentSection),c=$('#sectionCanvas');if(!f||!c)return;const oldRg=sectionDisplayRange(f,c);sectionView(f).verticalScale=e.target.value;const newRg=sectionDisplayRange(f,c);remapSectionDrawingForRange(f,c,oldRg,newRg);if(isEditableCampaign())persistState();updateSectionCanvasMetricSize(f);redrawInkStore(c);};
  $('#sectionEditColors').onclick=openSectionPaletteEditor;$('#sectionPaletteClose').onclick=()=>$('#sectionPaletteModal').classList.add('hidden');$('#sectionPaletteAdd').onclick=()=>{sectionPalette.push({id:'new'+Date.now(),name:`Color ${sectionPalette.length+1}`,hex:'#7a6a58'});renderSectionPaletteRows();};$('#sectionPaletteReset').onclick=()=>{sectionPalette=cloneAny(DEFAULT_SECTION_COLORS);renderSectionPaletteRows();};$('#sectionPaletteSave').onclick=()=>{sectionPalette=collectSectionPaletteRows();if(!sectionPalette.length)sectionPalette=cloneAny(DEFAULT_SECTION_COLORS);if(!sectionPalette.some(c=>String(c.hex).toLowerCase()===String(state.sectionColor).toLowerCase()))state.sectionColor=sectionPalette[0].hex;saveSectionPalette();$('#sectionPaletteModal').classList.add('hidden');updateSectionToolHint();toast('Paleta guardada para todos los proyectos');};
  $('#sectionRebuildProfile').onclick=async()=>{const f=state.features.find(x=>x.id===state.currentSection);if(!f||!requireEditable('recalcular la sección'))return;await ensureSectionProfile(f,{force:true,preserveManual:true});updateSectionCanvasMetricSize(f);syncSectionControls(f);redrawInkStore($('#sectionCanvas'));};$('#sectionResetProfile').onclick=()=>{const f=state.features.find(x=>x.id===state.currentSection);if(!f||!requireEditable('restablecer el perfil'))return;if(f.sectionProfile){f.sectionProfile.manual=null;f.sectionProfile.manualEdits=[];const c=$('#sectionCanvas');if(c)c._sectionSelection=null;syncSectionSelectionUi();persistState();updateSectionCanvasMetricSize(f);redrawInkStore(c);toast('Perfil de campo restablecido al MDT/LiDAR');}};['showDemProfile','showManualProfile','showSectionRefs'].forEach(id=>$('#'+id).onchange=()=>redrawInkStore($('#sectionCanvas')));
  $$('[data-erase-mode]').forEach(b=>b.onclick=()=>{state.eraseMode=b.dataset.eraseMode;$$('[data-erase-mode]').forEach(x=>x.classList.toggle('active',x===b));updateMaterialButton();persistState();toast(state.eraseMode==='zone'?'Borrador de zona: dibuja sobre lo que quieras quitar':'Borrador de elemento: toca el polígono o línea completa');});
  $('#eraserSize').oninput=e=>{state.eraseSize=+e.target.value;persistState();};
  $('#notebookBtn').onclick=()=>openNotebook();$('#notebookClose').onclick=closeNotebook;
  $$('[data-notebook-tool]').forEach(b=>b.onclick=()=>{if($('#notebookCanvas')._readOnly)return;state.notebookTool=b.dataset.notebookTool;$$('[data-notebook-tool]').forEach(x=>x.classList.toggle('active',x===b));});
  $('#notebookUndo').onclick=()=>{const c=$('#notebookCanvas');if(c._readOnly)return;const p=currentNotebookPage();if(!c._inkStore?.length)return;c._redoStore=c._redoStore||[];c._redoStore.push(c._inkStore.pop());redrawInkStore(c);p.ink=cloneAny(c._inkStore);p.redo=cloneAny(c._redoStore);persistState();};
  $('#notebookRedo').onclick=()=>{const c=$('#notebookCanvas');if(c._readOnly)return;c._redoStore=c._redoStore||[];if(!c._redoStore.length)return;c._inkStore.push(c._redoStore.pop());redrawInkStore(c);const p=currentNotebookPage();p.ink=cloneAny(c._inkStore);p.redo=cloneAny(c._redoStore);persistState();};
  $('#notebookBg').onchange=e=>{const p=currentNotebookPage();if(!notebookPageEditable(p))return;p.bg=e.target.value;persistState();renderNotebook();};
  $('#notebookOrientationBtn').onclick=rotateNotebookPage;
  $('#notebookFullColorBtn').onclick=()=>{state.notebookEditingColorSlot=-1;const pick=$('#notebookColorPicker');pick.value=state.notebookPenColor||appSettings.notebookPenColor||'#1f2b31';pick.click();};
  $('#notebookColorPicker').oninput=e=>{const color=e.target.value;if(Number.isInteger(state.notebookEditingColorSlot)&&state.notebookEditingColorSlot>=0){const arr=[...(appSettings.notebookQuickColors||DEFAULT_APP_SETTINGS.notebookQuickColors)];arr[state.notebookEditingColorSlot]=color;appSettings.notebookQuickColors=arr;}state.notebookEditingColorSlot=null;setNotebookPenColor(color);};
  $('#newNotebookPage').onclick=()=>newNotebookPage(false);$('#duplicateNotebookPage').onclick=()=>newNotebookPage(true);$('#deleteNotebookPage').onclick=deleteNotebookPage;$('#pagePrev').onclick=()=>gotoNotebookPage(-1);$('#pageNext').onclick=()=>gotoNotebookPage(1);$('#linkPositionBtn').onclick=()=>openLinkPages('position');$('#linkFeatureBtn').onclick=()=>openLinkPages('feature');$('#linkPagesClose').onclick=$('#linkPagesCancel').onclick=()=>$('#linkPagesModal').classList.add('hidden');$('#linkPagesApply').onclick=applyPageLinks;
  inkCanvas.addEventListener('pointerdown',onMapPointerDown);inkCanvas.addEventListener('pointermove',onMapPointerMove);inkCanvas.addEventListener('pointerup',onMapPointerUp);inkCanvas.addEventListener('pointercancel',onMapPointerUp);inkCanvas.addEventListener('contextmenu',e=>e.preventDefault());
  inkCanvas.addEventListener('wheel',e=>{e.preventDefault();markMapMotion(220);const p=eventPoint(e,inkCanvas),before=screenToWorld(p),factor=Math.exp(-e.deltaY*.001);state.view.scale=Math.max(.002,Math.min(1000,state.view.scale*factor));keepWorldAtScreen(before,p);drawAll();persistState();},{passive:false});
  installInkCanvas($('#sheetCanvas'),'sheet');installInkCanvas($('#sectionCanvas'),'section');installSectionViewportGestures();installInkCanvas($('#notebookCanvas'),'notebook');installNotebookViewportGestures();installInkCanvas($('#sectionWidthInk'),'measure-width');installInkCanvas($('#sectionDepthInk'),'measure-depth');installInkCanvas($('#sectionNoteInk'),'measure-note');$('#sectionCanvas')._onchange=()=>{const f=state.features.find(x=>x.id===state.currentSection);if(f&&isEditableCampaign()){f.sectionInk=cloneAny($('#sectionCanvas')._inkStore||[]);persistState();}};$('#notebookCanvas')._onchange=()=>{const p=currentNotebookPage();if(notebookPageEditable(p)){p.ink=cloneAny($('#notebookCanvas')._inkStore||[]);$('#notebookCanvas')._redoStore=[];if(appSettings.notebookAutosave)persistState();}};for(const c of [$('#sectionWidthInk'),$('#sectionDepthInk'),$('#sectionNoteInk')])c._onchange=()=>saveSectionMeasures(false);window.addEventListener('deviceorientationabsolute',e=>{if(Number.isFinite(e.alpha)){state.deviceHeading=((360-e.alpha)%360+360)%360;updateGnssUi();}});window.addEventListener('deviceorientation',e=>{if(state.deviceHeading==null&&Number.isFinite(e.webkitCompassHeading)){state.deviceHeading=e.webkitCompassHeading;updateGnssUi();}});window.addEventListener('resize',resize);
}

window.addEventListener('geocauce-native-gnss',e=>{const d=e.detail||{};if(!Number.isFinite(+d.lon)||!Number.isFinite(+d.lat))return;const u=lonLatToMapCoords(+d.lon,+d.lat);state.gnss={x:u.x,y:u.y,crs:u.epsg,lat:+d.lat,lon:+d.lon,accuracy:Number.isFinite(+d.accuracy)?+d.accuracy:null,altitude:Number.isFinite(+d.altitude)?+d.altitude:null,heading:Number.isFinite(+d.heading)?+d.heading:null,speed:Number.isFinite(+d.speed)?+d.speed:null,timestamp:+d.timestamp||Date.now(),satellitesVisible:Number.isFinite(+d.satellitesVisible)?+d.satellitesVisible:null,satellitesUsed:Number.isFinite(+d.satellitesUsed)?+d.satellitesUsed:null,provider:d.provider||'android'};if(Number.isFinite(state.gnss.heading))state.deviceHeading=state.gnss.heading;updateGnssUi();if(state.nativeCenterOnNextGnss){state.nativeCenterOnNextGnss=false;state.view.cx=u.x;state.view.cy=u.y;drawAll();const warn=gnssAccuracyWarning(state.gnss),outside=gnssOutsideRasterMessage(state.gnss);toast(warn||outside||`GNSS ±${Number.isFinite(state.gnss.accuracy)?Math.round(state.gnss.accuracy):'?'} m · EPSG:${u.epsg}`,warn?4200:(outside?4200:2200));}if(state.pendingNativeLinkPosition){state.pendingNativeLinkPosition=false;openLinkPages('position');}drawAll();});
function initNativeAndroidUi(){if(!ANDROID_NATIVE)return;const card=$('#nativeAndroidCard');card?.classList.remove('hidden');try{const info=JSON.parse(nativeCall('platformInfo')||'{}');if($('#nativeAndroidLabel'))$('#nativeAndroidLabel').textContent=`SQLite activo · ${info.model||'Android'}`;}catch{}const i=$('#nativeDbInfoBtn');if(i)i.onclick=()=>{try{const st=JSON.parse(nativeCall('databaseStats')||'{}');alert(`SQLite GeoCauce\n\nProyectos: ${st.projects||0}\nCampañas: ${st.campaigns||0}\nElementos: ${st.features||0}\nVersiones: ${st.feature_versions||0}\nPáginas: ${st.notebook_pages||0}\nFotos: ${st.photos||0}\nMapas: ${st.map_assets||0}`);}catch{alert('SQLite activo');}};const ex=$('#nativeDbExportBtn');if(ex)ex.onclick=()=>{const uri=nativeCall('exportDatabase');toast(uri?'Base SQLite exportada a Descargas/GeoCauce':'No se pudo exportar SQLite',3800);};}

// ===== v0.16.18 · refinaments FITXA II, FIC, trams i estil =====
function setReachSheetPage(page){const n=Math.max(1,Math.min(2,Number(page)||1));$$('[data-reach-sheet-page]').forEach(sec=>sec.classList.toggle('hidden',sec.dataset.reachSheetPage!==String(n)));[['#reachSheetPage1Btn',1],['#reachSheetPage2Btn',2]].forEach(([sel,p])=>$(sel)?.classList.toggle('active',p===n));if(n===1)requestAnimationFrame(renderReachProfileEditor);}
function setReachSheetZoom(value){const z=Math.max(.65,Math.min(2.25,Number(value)||1)),doc=$('#reachSheetDoc');state.reachSheetZoom=z;if(doc)doc.style.zoom=String(z);if($('#reachSheetZoomLabel'))$('#reachSheetZoomLabel').textContent=`${Math.round(z*100)}%`;requestAnimationFrame(()=>{renderReachProfileEditor();resizeFicNoteCanvases();});}
function renderReachProfileColors(){const root=$('#reachProfileColorChips');if(!root)return;root.innerHTML='';const cols=(sectionPalette?.length?sectionPalette:DEFAULT_SECTION_COLORS).slice(0,7);state.reachProfileColor=state.reachProfileColor||cols[0]?.hex||'#1f2b31';for(const col of cols){const b=document.createElement('button');b.type='button';b.className='course-long-profile-color';b.style.background=col.hex;b.title=col.name;b.classList.toggle('active',String(col.hex).toLowerCase()===String(state.reachProfileColor).toLowerCase());b.onclick=()=>{state.reachProfileColor=col.hex;renderReachProfileColors();};root.appendChild(b);}}
function setReachProfileTool(tool){state.reachProfileTool=tool;$$('[data-reach-profile-tool]').forEach(b=>b.classList.toggle('active',b.dataset.reachProfileTool===tool));syncReachLongSelectionUi();}
async function reachProfileView(reach,course){const profile=await ensureCourseLongitudinalProfile(course,{preserveManual:true}),interval=reachProfileInterval(profile,reach);if(!interval)return null;const base=(profile.manual?.length?profile.manual:profile.samples).filter(q=>Number.isFinite(q.z)&&q.d>=interval.from-.001&&q.d<=interval.to+.001).map(q=>({d:q.d-interval.from,z:q.z,globalD:q.d}));if(base.length<2)return null;const d=ensureReachSheetData(reach);return{profile,interval,series:base,length:interval.to-interval.from,verticalScale:d.profileVerticalScale||'1'};}
function reachProfileGeometry(w,h,view){const pad={l:72,r:24,t:38,b:48},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b;let lo=Math.min(...view.series.map(q=>q.z)),hi=Math.max(...view.series.map(q=>q.z));if(hi-lo<.5){lo-=.25;hi+=.25;}const ex=Math.max(.1,Number(view.verticalScale)||1),mid=(lo+hi)/2,actual=hi-lo,target=view.length*(ph/Math.max(1,pw))/ex,span=Math.max(actual*1.18,target);lo=mid-span/2;hi=mid+span/2;return{pad,pw,ph,lo,hi,ex,xd:d=>pad.l+d/Math.max(.001,view.length)*pw,yz:z=>pad.t+(hi-z)/(hi-lo)*ph};}
function drawReachProfileInk(g,canvas,reach){const d=ensureReachSheetData(reach),layer=document.createElement('canvas');layer.width=canvas.width;layer.height=canvas.height;const lg=layer.getContext('2d'),r={width:canvas.width,height:canvas.height};for(const st of d.profileInk||[])drawInkRecord(lg,r,st,1,false);if(canvas._active&&!canvas._active.profile)drawInkRecord(lg,r,canvas._active,1,true);g.drawImage(layer,0,0);const sel=canvas._reachSelection;if(sel?.kind==='ink'&&d.profileInk?.[sel.index]){const st=d.profileInk[sel.index];g.save();g.strokeStyle='#d76c2d';g.lineWidth=3;g.setLineDash([6,4]);g.beginPath();(st.pts||[]).forEach((p,i)=>{const x=p.x*canvas.width,y=p.y*canvas.height;i?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();g.restore();}}
async function drawReachProfileCanvas(canvas,reach,course,{width=null,height=null,forExport=false,includeInk=true}={}){if(!canvas||!reach||!course)return false;const view=await reachProfileView(reach,course);if(!view)return false;const w=Math.max(680,Math.round(width||canvas.width||1200)),h=Math.max(300,Math.round(height||canvas.height||430));canvas.width=w;canvas.height=h;canvas._reachProfileView=view;const g=canvas.getContext('2d');g.setTransform(1,0,0,1,0,0);g.fillStyle='#fff';g.fillRect(0,0,w,h);const geo=reachProfileGeometry(w,h,view),{pad,pw,ph,lo,hi,xd,yz}=geo;canvas._reachProfileGeo=geo;g.strokeStyle='#e0e0dc';g.lineWidth=1;g.font='12px system-ui,sans-serif';g.fillStyle='#555';for(let i=0;i<=4;i++){const y=pad.t+ph*i/4,val=hi-(hi-lo)*i/4;g.beginPath();g.moveTo(pad.l,y);g.lineTo(w-pad.r,y);g.stroke();g.fillText(formatNum(val,1),8,y+4);}for(let i=0;i<=6;i++){const x=pad.l+pw*i/6,val=view.length*i/6;g.beginPath();g.moveTo(x,pad.t);g.lineTo(x,h-pad.b);g.stroke();g.fillText(formatNum(val,1),x-8,h-16);}g.strokeStyle='#111';g.lineWidth=1.3;g.beginPath();g.moveTo(pad.l,pad.t);g.lineTo(pad.l,h-pad.b);g.lineTo(w-pad.r,h-pad.b);g.stroke();g.strokeStyle='#2d5f49';g.lineWidth=3;g.beginPath();view.series.forEach((q,i)=>{i?g.lineTo(xd(q.d),yz(q.z)):g.moveTo(xd(q.d),yz(q.z));});g.stroke();
  const data=ensureReachSheetData(reach),sel=canvas._reachSelection,edits=ensureProfileManualEdits(view.profile);if(sel?.kind==='profileEdit'){const ed=edits.find(x=>x.id===sel.id);if(ed)drawLongProfileEditSelection(g,ed,geo,view.interval.from);}data.profileObjects.forEach((o,i)=>drawLongProfileObject(g,o,geo,{active:sel?.kind==='object'&&sel.index===i,latest:i===data.profileObjects.length-1&&o.kind==='measure'}));if(canvas._reachObjectActive)drawLongProfileObject(g,canvas._reachObjectActive,geo,{active:true});
  g.fillStyle='#111';g.font='700 17px sans-serif';g.fillText(`Perfil longitudinal del tram ${reach.reachCode||reach.id}`,pad.l,23);g.font='12px sans-serif';g.fillText(`Distància (m) · escala vertical ×${view.verticalScale||'1'}`,w/2-70,h-10);g.save();g.translate(18,h/2+26);g.rotate(-Math.PI/2);g.fillText('Cota (m)',0,0);g.restore();if(includeInk)drawReachProfileInk(g,canvas,reach);return true;}
async function renderReachProfileEditor(){const canvas=$('#reachSheetProfileEditCanvas'),reach=currentReachSheetReach();if(!canvas||!reach||canvas.offsetParent===null)return;const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);await drawReachProfileCanvas(canvas,reach,reachCourse(reach),{width:Math.max(760,Math.round(rect.width*dpr)),height:Math.max(320,Math.round(rect.height*dpr)),includeInk:true});}
async function renderReachSheetProfileCanvas(){const canvas=$('#reachSheetProfileCanvas'),reach=currentReachSheetReach();if(!canvas||!reach||canvas.offsetParent===null)return;const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);await drawReachProfileCanvas(canvas,reach,reachCourse(reach),{width:Math.max(760,Math.round(rect.width*dpr)),height:Math.max(360,Math.round(rect.height*dpr)),includeInk:true});}
function reachProfilePointerData(canvas,e){const view=canvas._reachProfileView,geo=canvas._reachProfileGeo;if(!view||!geo)return null;const r=canvas.getBoundingClientRect(),sx=canvas.width/r.width,sy=canvas.height/r.height,x=(e.clientX-r.left)*sx,y=(e.clientY-r.top)*sy;if(x<geo.pad.l||x>canvas.width-geo.pad.r||y<geo.pad.t||y>canvas.height-geo.pad.b)return null;const d=(x-geo.pad.l)/geo.pw*view.length,z=geo.hi-(y-geo.pad.t)/geo.ph*(geo.hi-geo.lo);return{d,z,globalD:view.interval.from+d,np:{x:x/canvas.width,y:y/canvas.height}};}
function installReachProfileEditor(){const c=$('#reachSheetProfileEditCanvas');if(!c||c._reachInstalled)return;c._reachInstalled=true;c.style.touchAction='none';c._reachSelection=null;c._reachObjectActive=null;
  c.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||!isEditableCampaign())return;const reach=currentReachSheetReach(),course=reachCourse(reach),q=reachProfilePointerData(c,e);if(!reach||!course||!q)return;e.preventDefault();e.stopPropagation();const tool=state.reachProfileTool||'profile',view=c._reachProfileView,geo=c._reachProfileGeo,data=ensureReachSheetData(reach);
    if(tool==='select'){const p={x:q.np.x*c.width,y:q.np.y*c.height},hits=[];data.profileObjects.forEach((o,i)=>hits.push({kind:'object',index:i,d:longProfileObjectHit(o,geo,p.x,p.y,0)}));ensureProfileManualEdits(view.profile).filter(ed=>(ed.pts||[]).some(pt=>pt.d>=view.interval.from-.001&&pt.d<=view.interval.to+.001)).forEach(ed=>hits.push({kind:'profileEdit',id:ed.id,d:longProfileEditHit(ed,geo,p.x,p.y,view.interval.from)}));(data.profileInk||[]).forEach((st,i)=>hits.push({kind:'ink',index:i,d:sectionInkHitDistance(st,q.np,{width:c.width,height:c.height})}));hits.sort((a,b)=>a.d-b.d);c._reachSelection=hits[0]?.d<=20?hits[0]:null;syncReachLongSelectionUi();renderReachProfileEditor();if(!c._reachSelection)toast('No hi ha cap objecte sota el llapis');return;}
    if(tool==='profile'){c._active={profile:true,pointerId:e.pointerId,pts:[q],replaceId:c._reachSelection?.kind==='profileEdit'?c._reachSelection.id:null};c.setPointerCapture?.(e.pointerId);return;}
    if(['tree','shrub','rockSymbol','vegetation','measure'].includes(tool)){let z=q.z;if(tool!=='measure'){const zv=profileSeriesValueAt(view.profile,q.globalD);if(Number.isFinite(zv))z=zv;}c._reachObjectActive={kind:tool,a:{d:q.d,z},b:{d:q.d,z},color:state.reachProfileColor||'#1f2b31',pointerId:e.pointerId};c.setPointerCapture?.(e.pointerId);renderReachProfileEditor();return;}
    c._active={profile:false,pointerId:e.pointerId,tool,kind:'stroke',color:state.reachProfileColor||'#1f2b31',pts:[q.np]};c.setPointerCapture?.(e.pointerId);
  });
  c.addEventListener('pointermove',e=>{const q=reachProfilePointerData(c,e);if(c._reachObjectActive&&c._reachObjectActive.pointerId===e.pointerId&&q){e.preventDefault();const o=c._reachObjectActive;o.b={d:q.d,z:q.z};if(o.kind==='measure'){const geo=c._reachProfileGeo,a={x:geo.xd(o.a.d),y:geo.yz(o.a.z)},b={x:geo.xd(o.b.d),y:geo.yz(o.b.z)};if(Math.abs(b.y-a.y)<14)o.b.z=o.a.z;}renderReachProfileEditor();return;}if(!c._active||c._active.pointerId!==e.pointerId||!q)return;e.preventDefault();if(c._active.profile)c._active.pts.push(q);else c._active.pts.push(q.np);renderReachProfileEditor();});
  const finish=e=>{const reach=currentReachSheetReach(),course=reachCourse(reach),data=reach?ensureReachSheetData(reach):null;if(c._reachObjectActive&&(!e||c._reachObjectActive.pointerId===e.pointerId)){const o=c._reachObjectActive;c._reachObjectActive=null;if(data){delete o.pointerId;const geo=c._reachProfileGeo,dist=Math.hypot(geo.xd(o.b.d)-geo.xd(o.a.d),geo.yz(o.b.z)-geo.yz(o.a.z));if(dist>=4){if(o.kind==='measure')o.valueM=Math.hypot(o.b.d-o.a.d,o.b.z-o.a.z);data.profileObjects.push(o);persistState();}}renderReachProfileEditor();return;}if(!c._active||c._active.pointerId!==e.pointerId)return;const a=c._active;c._active=null;if(!reach||!course)return;if(a.profile&&a.pts.length>1){const p=course.longitudinalProfile;mergeCourseManualProfile(p,a.pts.map(q=>({d:q.globalD,z:q.z})),a.replaceId||null);c._reachSelection=null;syncReachLongSelectionUi();persistState();toast(a.replaceId?'Correcció del perfil modificada':'Perfil del tram corregit');}else if(!a.profile){data.profileInk.push({tool:a.tool,kind:'stroke',color:a.color,pts:a.pts});persistState();}renderReachProfileEditor();};
  c.addEventListener('pointerup',finish);c.addEventListener('pointercancel',e=>{if(c._reachObjectActive?.pointerId===e.pointerId)c._reachObjectActive=null;if(c._active?.pointerId===e.pointerId)c._active=null;renderReachProfileEditor();});}
function renderFicQuickColors(){const root=$('#ficNoteQuickColors');if(!root)return;root.innerHTML='';const cols=appSettings.notebookQuickColors||DEFAULT_APP_SETTINGS.notebookQuickColors;state.ficNoteColor=state.ficNoteColor||cols[0];for(const col of cols){const b=document.createElement('button');b.style.background=col;b.classList.toggle('active',String(col).toLowerCase()===String(state.ficNoteColor).toLowerCase());b.onclick=()=>{state.ficNoteColor=col;renderFicQuickColors();};root.appendChild(b);}}
function ficCanvasNorm(e,c){const r=c.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};}
function redrawFicNoteCanvas(c,rec){if(!c)return;const r=c.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);if(c.width!==Math.round(r.width*dpr)||c.height!==Math.round(r.height*dpr)){c.width=Math.max(1,Math.round(r.width*dpr));c.height=Math.max(1,Math.round(r.height*dpr));}const g=c.getContext('2d');g.setTransform(1,0,0,1,0,0);g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);const rr={width:r.width,height:r.height};for(const st of rec.noteInk||[])drawInkRecord(g,rr,st,dpr,false);if(c._active)drawInkRecord(g,rr,c._active,dpr,true);}
function installFicNoteCanvas(c,reach,key){if(c._ficInstalled)return;c._ficInstalled=true;c.style.touchAction='none';const rec=ensureReachSheetData(reach).fic[key];c.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||!isEditableCampaign())return;e.preventDefault();const tool=state.ficNoteTool||'pen';c._active={tool,kind:'stroke',color:state.ficNoteColor||'#1f2b31',pts:[ficCanvasNorm(e,c)],pointerId:e.pointerId};c.setPointerCapture?.(e.pointerId);redrawFicNoteCanvas(c,rec);});c.addEventListener('pointermove',e=>{if(!c._active||c._active.pointerId!==e.pointerId)return;e.preventDefault();c._active.pts.push(ficCanvasNorm(e,c));redrawFicNoteCanvas(c,rec);});const finish=e=>{if(!c._active||c._active.pointerId!==e.pointerId)return;const a={...c._active};delete a.pointerId;c._active=null;rec.noteInk.push(a);persistState();redrawFicNoteCanvas(c,rec);};c.addEventListener('pointerup',finish);c.addEventListener('pointercancel',()=>{c._active=null;redrawFicNoteCanvas(c,rec);});requestAnimationFrame(()=>redrawFicNoteCanvas(c,rec));}
function resizeFicNoteCanvases(){$$('#reachSheetFicTable .fic-note-canvas').forEach(c=>{const reach=currentReachSheetReach(),key=c.dataset.ficNoteCanvas;if(reach&&key)redrawFicNoteCanvas(c,ensureReachSheetData(reach).fic[key]);});}
function renderReachSheetFic(reach){const root=$('#reachSheetFicTable');if(!root||!reach)return;const data=ensureReachSheetData(reach);let html='<div class="reach-sheet-fic-head"><div></div><div>Rang</div><div>Puntuació</div><div>notes</div></div>';for(const row of REACH_FIC_ROWS){if(row.group){html+=`<div class="reach-sheet-fic-row"><div class="criterion"><b>${escapeHtml(row.group)}</b></div><div></div><div></div><div></div></div>`;continue;}const rec=data.fic[row.key]||{};const opts=['<option value="">—</option>',...row.options.map(o=>`<option value="${o.score}" ${optionalScore(rec.score)===o.score?'selected':''}>${o.score} · ${escapeHtml(o.text)}</option>`)].join('');html+=`<div class="reach-sheet-fic-row"><div class="criterion">${row.prefix?`<div><b>${escapeHtml(row.prefix)}</b></div>`:''}<b>${escapeHtml(row.label)}</b>${row.note?`<div class="reach-sheet-fic-small" style="margin-top:8px;font-style:italic">${escapeHtml(row.note)}</div>`:''}</div><div class="range-cell">${row.options.map(o=>`<div>${escapeHtml(o.text)}</div>`).join('')}</div><div class="score-cell"><select data-fic-select="${row.key}">${opts}</select></div><div class="fic-note-cell"><canvas class="fic-note-canvas" data-fic-note-canvas="${row.key}"></canvas></div></div>`;}const total=calcReachFicTotal(reach);html+=`<div class="reach-sheet-fic-total"><div><i>Total, puntuació del component pendent avall **</i><div class="reach-sheet-fic-small">Notes: ** Es proporciona la puntuació total del component de pendent ascendent. per: Sd=Ad+ Bd+Cd+ WdDd1 +(1 − Wa)Dd2</div></div><div class="value">${total==null?'—':total}</div><div></div></div><div class="reach-sheet-fic-final"><div class="fic-final-text">L’índex de connectivitat del camp ve donat per FIC=(Su+Sd)/2</div></div>`;root.innerHTML=html;root.querySelectorAll('[data-fic-select]').forEach(sel=>{sel.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')e.stopPropagation();});sel.onclick=e=>e.stopPropagation();sel.onchange=e=>{const k=e.target.dataset.ficSelect,d=ensureReachSheetData(reach);d.fic[k].score=e.target.value===''?null:+e.target.value;persistState();renderReachSheetFic(reach);};});root.querySelectorAll('.fic-note-canvas').forEach(c=>installFicNoteCanvas(c,reach,c.dataset.ficNoteCanvas));}
function ficNoteDataUrl(rec,w=420,h=170){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,w,h);const rr={width:w,height:h};for(const st of rec?.noteInk||[])drawInkRecord(g,rr,st,1,false);return c.toDataURL('image/png');}
function profileDistanceFromPointer(canvas,profile,e){const geo=courseLongProfileGeometry(canvas,profile),p=eventPoint(e,canvas);if(p.x<geo.pad.l||p.x>geo.w-geo.pad.r)return null;let d=Math.max(0,Math.min(profile.length,(p.x-geo.pad.l)/geo.pw*profile.length));const threshold=14/Math.max(1,geo.pw)*profile.length;let best=null;const course=state.features.find(f=>f.id===state.currentLongProfileCourseId&&f.type==='watercourse');if(course){for(const b of reachBoundaryRecords(course.id)){const bd=profileBoundaryDistance(profile,b);if(Number.isFinite(bd)&&Math.abs(bd-d)<=threshold&&(!best||Math.abs(bd-d)<best.diff))best={d:bd,diff:Math.abs(bd-d)};}if(best)d=best.d;}return profileGapAt(profile,d)?null:d;}
function applyReachFromLongProfile(course,profile,d){const pos=courseProfilePositionAtDistance(profile,d);if(!pos){toast('Aquest punt cau en un buit del curs');return;}const start=state.longProfileReachStart;if(!start){state.longProfileReachStart={d,...pos};redrawCourseLongProfileEditor();toast('Inici del tram fixat · toca qualsevol punt del perfil per marcar el final');return;}if(start.fragmentIndex!==pos.fragmentIndex){toast('No es pot crear un tram travessant un buit entre fragments');return;}const d0=Math.min(start.along,pos.along),d1=Math.max(start.along,pos.along);if(d1-d0<.2){toast('El tram és massa curt');return;}state.longProfileReachStart=null;const f=redefineCourseReach(course,pos.fragmentIndex,d0,d1);if(!f){redrawCourseLongProfileEditor();return;}state.selectedId=f.id;persistState();renderProfileSheetRows(course);refreshProfileAutomaticValues(course.id);redrawCourseLongProfileEditor();drawAll();toast(`Tram ${f.reachCode} creat · límits encaixats per imant`);}
function openFeatureStyleEditor(){const f=state.features.find(x=>x.id===state.selectedId);if(!f)return;const def=f.type==='reach'?{color:'#d58425',width:5.5,dash:'solid'}:f.type==='basin'?{color:'#416d55',width:2.2,dash:'dash'}:f.type==='channel'?{color:'#2464a4',width:3,dash:'dash'}:{color:'#2e78ad',width:3.2,dash:'solid'},st=featureLineStyle(f,def);$('#featureStyleColor').value=/^#[0-9a-f]{6}$/i.test(st.color)?st.color:'#2e78ad';$('#featureStyleWidth').value=st.width;$('#featureStyleWidthOut').value=`${Number(st.width).toFixed(1)} px`;$('#featureStyleDash').value=f.styleDash||def.dash;$('#featureStyleModal').classList.remove('hidden');}
function saveFeatureStyle(){const f=state.features.find(x=>x.id===state.selectedId);if(!f)return;f.styleColor=$('#featureStyleColor').value;f.styleWidth=+$(`#featureStyleWidth`).value;f.styleDash=$('#featureStyleDash').value;persistState();drawAll();$('#featureStyleModal').classList.add('hidden');}
async function openReachSheet(reachId=state.selectedId){const reach=state.features.find(f=>f.id===reachId&&f.type==='reach');if(!reach){toast('Selecciona un tram');return;}const course=reachCourse(reach);await ensureReachMdeStats(reach);state.currentReachSheetId=reach.id;const d=ensureReachSheetData(reach);$('#reachSheetSubtitle').textContent=`${reach.reachCode||reach.id} · ${course?.abbr||''} ${course?.name||''}`.trim();$('#reachSheetTorrentName').textContent=`${course?.abbr||'—'}, ${course?.name||'—'}`;$('#reachSheetReachName').textContent=reach.reachCode||reach.id;if($('#reachSheetSectionsPlaceholder'))$('#reachSheetSectionsPlaceholder').textContent=reachSectionNamesText(reach);$('#reachSheetObserver').value=d.observer||state.project?.author||currentCampaign()?.author||'';$('#reachSheetVisitDate').value=d.visitDate||currentCampaign()?.date||'';$('#reachSheetFieldSlope').value=d.fieldSlope||'';$('#reachSheetLithology').value=d.lithology||'';$('#reachSheetProfileType').value=d.profileType||'';$('#reachSheetVegetationCover').value=d.vegetationCover||'';$('#reachSheetVegetationType').value=d.vegetationType||'';$('#reachSheetAnthropic').value=d.anthropic||'';const deg=Number.isFinite(reach.mdeStats?.mdeSlopePct)?Math.atan((reach.mdeStats.mdeSlopePct||0)/100)*180/Math.PI:null;$('#reachSheetMdeSlope').textContent=Number.isFinite(deg)?formatNum(deg,1):'—';syncReachSheetMirrors();$('#reachSheetModal').classList.remove('hidden');setReachSheetPage(1);setReachSheetZoom(state.reachSheetZoom||1);renderReachProfileColors();if($('#reachProfileScale'))$('#reachProfileScale').value=String(d.profileVerticalScale||'1');setReachProfileTool(state.reachProfileTool||'profile');syncReachLongSelectionUi();requestAnimationFrame(renderReachProfileEditor);}
function simpleWrapCanvas(ctx,text,x,y,maxW,lineH,maxLines=4){const words=String(text||'').split(/\s+/),lines=[];let line='';for(const w of words){const t=line?line+' '+w:w;if(ctx.measureText(t)<=maxW||!line)line=t;else{lines.push(line);line=w;if(lines.length>=maxLines)break;}}if(line&&lines.length<maxLines)lines.push(line);for(const l of lines){ctx.fillText(l,x,y);y+=lineH;}return y;}
async function renderFitxaIIPage1(reach){
  const course=reachCourse(reach),d=ensureReachSheetData(reach),c=document.createElement('canvas');c.width=1240;c.height=1754;
  const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.fillStyle='#666';g.font='700 28px sans-serif';g.textAlign='center';g.fillText('FITXA II- PERFIL LONGITUDINAL TRAM',620,70);g.textAlign='left';
  const x=60,w=1120,y0=110,rowH=44;g.strokeStyle='#222';g.lineWidth=2;for(let i=0;i<3;i++)g.strokeRect(x,y0+i*rowH,w,rowH);
  g.font='700 18px sans-serif';g.fillStyle='#111';g.fillText('Nom torrent:',x+10,y0+28);g.fillText('Observador:',x+570,y0+28);g.fillText('Nom tram:',x+10,y0+72);g.fillText('Data visita:',x+570,y0+72);g.fillText('Nombre de seccions:',x+10,y0+116);g.fillText('Fotografia:',x+570,y0+116);
  g.font='18px sans-serif';g.fillStyle='#555';g.fillText(`${course?.abbr||''}, ${course?.name||''}`,x+150,y0+28);g.fillText(d.observer||'—',x+700,y0+28);g.fillText(reach.reachCode||reach.id,x+125,y0+72);g.fillText(d.visitDate||'—',x+700,y0+72);g.fillText(reachSectionNamesText(reach),x+220,y0+116);g.fillText('↑ (riu amunt)  ↓ (riu avall)',x+690,y0+116);
  g.font='700 20px sans-serif';g.fillStyle='#111';g.fillText('Esquema · perfil longitudinal del tram',x,272);
  const pc=document.createElement('canvas');await drawReachProfileCanvas(pc,reach,course,{width:1120,height:1040,includeInk:true});g.drawImage(pc,x,300,w,1040);g.strokeRect(x,300,w,1040);
  return c.toDataURL('image/png');
}
async function renderFitxaIIPage2(reach){
  const course=reachCourse(reach),d=ensureReachSheetData(reach),c=document.createElement('canvas');c.width=1240;c.height=1754;
  const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.fillStyle='#111';g.font='700 28px sans-serif';g.textAlign='center';g.fillText('FITXA II- PERFIL LONGITUDINAL TRAM',620,80);g.textAlign='left';
  g.font='700 20px sans-serif';g.fillText('Taula del tram',60,135);g.font='18px sans-serif';g.fillStyle='#555';g.fillText(`${course?.abbr||''}, ${course?.name||''} · ${reach.reachCode||reach.id}`,60,165);
  const x=60,w=1120,labelW=350,subW=230;let y=205;g.strokeStyle='#222';g.lineWidth=2;
  const deg=Number.isFinite(reach.mdeStats?.mdeSlopePct)?Math.atan(reach.mdeStats.mdeSlopePct/100)*180/Math.PI:null;
  const row=(label,value,h=78)=>{
    g.strokeRect(x,y,w,h);g.beginPath();g.moveTo(x+labelW,y);g.lineTo(x+labelW,y+h);g.stroke();g.fillStyle='#111';g.font='700 19px sans-serif';simpleWrapCanvas(g,label,x+12,y+29,labelW-24,23,2);g.font='18px sans-serif';simpleWrapCanvas(g,value||'—',x+labelW+14,y+29,w-labelW-28,23,3);y+=h;
  };
  row('Pendent mitjà MDE (º)',Number.isFinite(deg)?formatNum(deg,1):'—');
  row('Pendent a camp (º)',d.fieldSlope||'—');
  row('Litologia/Material',d.lithology||'—',90);
  row('Tipus perfil',d.profileType||'—',90);
  const vh=164;g.strokeRect(x,y,w,vh);g.beginPath();g.moveTo(x+labelW,y);g.lineTo(x+labelW,y+vh);g.moveTo(x+labelW+subW,y);g.lineTo(x+labelW+subW,y+vh);g.moveTo(x+labelW,y+vh/2);g.lineTo(x+w,y+vh/2);g.stroke();
  g.fillStyle='#111';g.font='700 19px sans-serif';g.fillText('Vegetació',x+12,y+34);g.font='700 17px sans-serif';g.fillText('Cobertura vegetal',x+labelW+12,y+31);g.fillText('Tipus dominant',x+labelW+12,y+vh/2+31);g.font='18px sans-serif';simpleWrapCanvas(g,d.vegetationCover||'—',x+labelW+subW+12,y+31,w-labelW-subW-24,23,2);simpleWrapCanvas(g,d.vegetationType||'—',x+labelW+subW+12,y+vh/2+31,w-labelW-subW-24,23,2);y+=vh;
  const ah=390;g.strokeRect(x,y,w,ah);g.beginPath();g.moveTo(x+labelW,y);g.lineTo(x+labelW,y+ah);g.stroke();g.font='700 19px sans-serif';g.fillText('Elements antròpics',x+12,y+34);g.font='18px sans-serif';simpleWrapCanvas(g,d.anthropic||'—',x+labelW+14,y+34,w-labelW-28,25,13);
  return c.toDataURL('image/png');
}
function renderFitxaIIPage3(reach){const d=ensureReachSheetData(reach),c=document.createElement('canvas');c.width=1240;c.height=2050;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.fillStyle='#111';g.font='700 28px sans-serif';g.fillText('FIC (field index Connectivity)',55,60);let y=90;const x=[40,430,790,930,1200];g.lineWidth=3;g.strokeStyle='#222';const headerH=42;for(let i=0;i<4;i++)g.strokeRect(x[i],y,x[i+1]-x[i],headerH);g.font='700 18px sans-serif';g.fillText('Criteri',x[0]+8,y+27);g.fillText('Rang',x[1]+8,y+27);g.fillText('Puntuació',x[2]+8,y+27);g.fillText('notes',x[3]+8,y+27);y+=headerH;for(const row of REACH_FIC_ROWS){if(row.group){g.strokeRect(x[0],y,x[4]-x[0],42);g.fillText(row.group,x[0]+8,y+27);y+=42;continue;}const rec=d.fic[row.key],h=Math.max(165,row.options.length*34);for(let i=0;i<4;i++)g.strokeRect(x[i],y,x[i+1]-x[i],h);g.font='700 16px sans-serif';simpleWrapCanvas(g,(row.prefix?row.prefix+' ':'')+row.label,x[0]+8,y+24,x[1]-x[0]-16,20,6);if(row.note){g.font='italic 14px sans-serif';simpleWrapCanvas(g,row.note,x[0]+8,y+115,x[1]-x[0]-16,18,3);}g.font='16px sans-serif';let ry=y+24;for(const o of row.options){g.fillText(o.text,x[1]+8,ry);ry+=30;}g.font='700 26px sans-serif';g.textAlign='center';g.fillText(optionalScore(rec.score)!==null?String(rec.score):'—',(x[2]+x[3])/2,y+h/2);g.textAlign='left';const nc=document.createElement('canvas');nc.width=x[4]-x[3]-10;nc.height=h-10;const ng=nc.getContext('2d');ng.fillStyle='#fff';ng.fillRect(0,0,nc.width,nc.height);const nrr={width:nc.width,height:nc.height};for(const st of rec.noteInk||[])drawInkRecord(ng,nrr,st,1,false);g.drawImage(nc,x[3]+5,y+5);y+=h;}g.strokeRect(x[0],y,x[4]-x[0],88);g.font='italic 16px sans-serif';g.fillText('Total, puntuació del component pendent avall **',x[0]+8,y+25);g.font='14px sans-serif';simpleWrapCanvas(g,'Notes: ** Es proporciona la puntuació total del component de pendent ascendent. per: Sd=Ad+ Bd+Cd+ WdDd1 +(1 − Wa)Dd2',x[0]+8,y+48,x[2]-x[0]-15,18,2);g.font='700 26px sans-serif';g.fillText(String(calcReachFicTotal(reach)??'—'),x[2]+35,y+52);y+=88;g.fillStyle='#ddd';g.fillRect(x[0],y,x[4]-x[0],48);g.strokeRect(x[0],y,x[4]-x[0],48);g.fillStyle='#111';g.font='18px sans-serif';g.fillText('L’índex de connectivitat del camp ve donat per FIC=(Su+Sd)/2',x[0]+8,y+31);return c.toDataURL('image/png');}
async function buildReachSheetExportPayload(reach){const course=reachCourse(reach);await ensureReachMdeStats(reach);return{title:'FITXA II - PERFIL LONGITUDINAL TRAM',filePrefix:'FITXA_II',projectName:state.project?.name||'',torrentName:course?.name||'',abbr:course?.abbr||'',reachCode:reach.reachCode||reach.id,page1Png:await renderFitxaIIPage1(reach),page2Png:await renderFitxaIIPage2(reach),page3Png:'',page4Png:''};}

loadSectionPalette();loadProjectCatalog();initUi();initNativeAndroidUi();refreshAccountUi();applyAppSettings();renderMaterials();renderSectionColorChips();updateMaterialButton();$('#eraserSize').value=state.eraseSize;$$('[data-erase-mode]').forEach(b=>b.classList.toggle('active',b.dataset.eraseMode===state.eraseMode));setTool(state.tool,{quiet:true});updateCompass();renderProjectHome();window.addEventListener('beforeunload',()=>{if(state.projectId)persistState();});

// Bindings added in v0.16.18
installReachProfileEditor();renderReachProfileColors();renderFicQuickColors();
$$('[data-reach-profile-tool]').forEach(b=>b.onclick=()=>setReachProfileTool(b.dataset.reachProfileTool));
if($('#reachProfileDelete'))$('#reachProfileDelete').onclick=deleteReachLongSelected;
if($('#reachProfileScale'))$('#reachProfileScale').onchange=async e=>{const reach=currentReachSheetReach(),course=reachCourse(reach),canvas=$('#reachSheetProfileEditCanvas');if(!reach||!course||!canvas)return;const data=ensureReachSheetData(reach),old=String(data.profileVerticalScale||'1'),next=String(e.target.value||'1');if(old===next)return;const view=await reachProfileView(reach,course);if(view)remapReachProfileInkScale(canvas,view,data.profileInk||[],old,next);data.profileVerticalScale=next;persistState();renderReachProfileEditor();};
if($('#reachProfileReset'))$('#reachProfileReset').onclick=async()=>{const r=currentReachSheetReach(),c=reachCourse(r);if(!r||!c||!requireEditable('restablir el perfil'))return;const p=await ensureCourseLongitudinalProfile(c,{preserveManual:true}),it=reachProfileInterval(p,r);if(!it){toast('No s’ha pogut localitzar aquest tram al perfil MDE');return;}if(resetCourseManualProfileInterval(p,it)){persistState();toast('Perfil del tram restablert al MDE');}else if(!p.manual?.length){toast('El perfil ja correspon al MDE');}else{toast('No hi ha prou mostres MDE per restablir aquest tram');}const canvas=$('#reachSheetProfileEditCanvas');if(canvas)canvas._reachSelection=null;syncReachLongSelectionUi();renderReachProfileEditor();};
if($('#ficNotePen'))$('#ficNotePen').onclick=()=>{state.ficNoteTool='pen';$('#ficNotePen').classList.add('active');$('#ficNoteEraser').classList.remove('active');};
if($('#ficNoteEraser'))$('#ficNoteEraser').onclick=()=>{state.ficNoteTool='eraser';$('#ficNoteEraser').classList.add('active');$('#ficNotePen').classList.remove('active');};
if($('#ficNoteColorPicker'))$('#ficNoteColorPicker').oninput=e=>{state.ficNoteColor=e.target.value;renderFicQuickColors();};
if($('#featureStyleBtn'))$('#featureStyleBtn').onclick=openFeatureStyleEditor;
if($('#featureStyleClose'))$('#featureStyleClose').onclick=()=>$('#featureStyleModal').classList.add('hidden');
if($('#featureStyleWidth'))$('#featureStyleWidth').oninput=e=>$('#featureStyleWidthOut').value=`${(+e.target.value).toFixed(1)} px`;
if($('#featureStyleSave'))$('#featureStyleSave').onclick=saveFeatureStyle;
if($('#featureStyleReset'))$('#featureStyleReset').onclick=()=>{const f=state.features.find(x=>x.id===state.selectedId);if(!f)return;delete f.styleColor;delete f.styleWidth;delete f.styleDash;persistState();drawAll();$('#featureStyleModal').classList.add('hidden');};

// Editor de simbologia vectorial SHP
installVectorColorPalette();
if($('#vectorStyleClose'))$('#vectorStyleClose').onclick=closeVectorStyleEditor;
if($('#vectorStyleCancel'))$('#vectorStyleCancel').onclick=closeVectorStyleEditor;
if($('#vectorStyleSave'))$('#vectorStyleSave').onclick=saveVectorStyle;
if($('#vectorStyleReset'))$('#vectorStyleReset').onclick=resetVectorStyleEditor;
for(const id of ['vectorStrokeWidth','vectorStrokeUnit','vectorStrokeOffset','vectorOffsetUnit','vectorStrokeDash','vectorLineCap','vectorLineJoin','vectorFillStyle','vectorFillOpacity','vectorPointSize','vectorPointUnit','vectorPointShape','vectorLayerOpacity']){
  const el=$('#'+id);if(el){const ev=el.matches('select')?'change':'input';el.addEventListener(ev,syncVectorStyleDraftFromUi);}
}
if($('#vectorFillStyle'))$('#vectorFillStyle').addEventListener('change',()=>{if($('#vectorFillStyle').value!=='none'&&+$('#vectorFillOpacity').value<=0){$('#vectorFillOpacity').value='0.35';}syncVectorStyleDraftFromUi();});
if($('#vectorStrokeColorBtn'))$('#vectorStrokeColorBtn').onclick=()=>openVectorColorEditor('strokeColor');
if($('#vectorFillColorBtn'))$('#vectorFillColorBtn').onclick=()=>openVectorColorEditor('fillColor');
if($('#vectorPointColorBtn'))$('#vectorPointColorBtn').onclick=()=>openVectorColorEditor('pointColor');
if($('#vectorColorClose'))$('#vectorColorClose').onclick=closeVectorColorEditor;
if($('#vectorColorCancel'))$('#vectorColorCancel').onclick=closeVectorColorEditor;
if($('#vectorColorApply'))$('#vectorColorApply').onclick=applyVectorColorEditor;
if($('#vectorColorNative'))$('#vectorColorNative').oninput=()=>updateVectorColorUi('native');
if($('#vectorColorHex')){$('#vectorColorHex').onchange=()=>updateVectorColorUi('hex');$('#vectorColorHex').onblur=()=>updateVectorColorUi('hex');}
for(const id of ['vectorColorR','vectorColorG','vectorColorB'])if($('#'+id))$('#'+id).oninput=()=>updateVectorColorUi('rgb');
for(const id of ['vectorColorH','vectorColorS','vectorColorV'])if($('#'+id))$('#'+id).oninput=()=>updateVectorColorUi('hsv');
if($('#vectorColorOpacity'))$('#vectorColorOpacity').oninput=()=>updateVectorColorUi(false);

// Editor de simbologia GeoTIFF
if($('#sectionDeleteObject'))$('#sectionDeleteObject').onclick=deleteSectionSelectedObject;
if($('#sectionTablePen'))$('#sectionTablePen').onclick=()=>{state.sectionTableInkTool='pen';$('#sectionTablePen').classList.add('active');$('#sectionTableEraser')?.classList.remove('active');};
if($('#sectionTableEraser'))$('#sectionTableEraser').onclick=()=>{state.sectionTableInkTool='eraser';$('#sectionTableEraser').classList.add('active');$('#sectionTablePen')?.classList.remove('active');};
if($('#sectionTableInkColor'))$('#sectionTableInkColor').oninput=e=>{state.sectionTableInkColor=e.target.value;renderSectionTableQuickColors();};
if($('#sectionTableUndo'))$('#sectionTableUndo').onclick=()=>{const f=state.features.find(x=>x.id===state.currentSection),a=state.sectionTableActiveCell;if(!f||!a)return;const arr=sectionTableInkCell(ensureSectionSheetData(f),a.row,a.col);if(!arr.length){toast('Aquesta casella no té tinta per desfer');return;}arr.pop();persistState();const c=document.querySelector(`.section-table-ink-canvas[data-section-table-ink-row="${a.row}"][data-section-table-ink-col="${a.col}"]`);if(c)redrawSectionTableInkCanvas(c,arr);};
if($('#sectionTableZoomOut'))$('#sectionTableZoomOut').onclick=()=>setSectionTableZoom((state.sectionTableZoom||1)-.25);
if($('#sectionTableZoomIn'))$('#sectionTableZoomIn').onclick=()=>setSectionTableZoom((state.sectionTableZoom||1)+.25);
if($('#sectionTableZoomReset'))$('#sectionTableZoomReset').onclick=()=>setSectionTableZoom(1);
(function installSectionTablePinch(){
  const page=document.querySelector('[data-section-fitxa-page="2"]');if(!page||page._pinchInstalled)return;page._pinchInstalled=true;let start=null;
  page.addEventListener('touchstart',e=>{if(e.touches.length===2){const a=e.touches[0],b=e.touches[1];start={dist:Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY),zoom:state.sectionTableZoom||1};}},{passive:true});
  page.addEventListener('touchmove',e=>{if(!start||e.touches.length!==2)return;e.preventDefault();const a=e.touches[0],b=e.touches[1],dist=Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY);setSectionTableZoom(start.zoom*dist/Math.max(1,start.dist));},{passive:false});
  page.addEventListener('touchend',e=>{if(e.touches.length<2)start=null;},{passive:true});
})();
if($('#rasterStyleClose'))$('#rasterStyleClose').onclick=closeRasterStyleEditor;
if($('#rasterStyleCancel'))$('#rasterStyleCancel').onclick=closeRasterStyleEditor;
if($('#rasterStyleRenderer'))$('#rasterStyleRenderer').onchange=updateRasterStylePanels;
if($('#rasterStyleClassify'))$('#rasterStyleClassify').onclick=classifyRasterValues;
if($('#rasterStylePseudoClassify'))$('#rasterStylePseudoClassify').onclick=classifyRasterPseudocolor;
if($('#rasterStyleUniqueRamp'))$('#rasterStyleUniqueRamp').onchange=recolorRasterStyleClasses;
if($('#rasterStyleRamp'))$('#rasterStyleRamp').onchange=recolorRasterStyleBreaks;
if($('#rasterStyleInvert'))$('#rasterStyleInvert').onchange=recolorRasterStyleBreaks;
if($('#rasterStyleInterpolation'))$('#rasterStyleInterpolation').onchange=updateRasterStylePreview;
if($('#rasterStyleClassMode'))$('#rasterStyleClassMode').onchange=()=>{$('#rasterStylePseudoStatus').textContent='Prem “Classificar” per recalcular els intervals amb aquest mode.';};
if($('#rasterStyleClassCount'))$('#rasterStyleClassCount').onchange=()=>{$('#rasterStyleClassCount').value=String(Math.max(2,Math.min(32,Math.round(+$('#rasterStyleClassCount').value||5))));$('#rasterStylePseudoStatus').textContent='Prem “Classificar” per aplicar el nou nombre de classes.';};
if($('#rasterStylePrecision'))$('#rasterStylePrecision').onchange=()=>{refreshRasterBreakLabels();renderRasterStyleBreaks();};
for(const id of ['rasterStyleMin','rasterStyleMax','rasterStyleGrayMin','rasterStyleGrayMax'])if($('#'+id))$('#'+id).oninput=updateRasterStylePreview;
for(const [id,out,digits] of [['rasterStyleBrightness','rasterStyleBrightnessOut',0],['rasterStyleContrast','rasterStyleContrastOut',0],['rasterStyleGamma','rasterStyleGammaOut',2],['rasterStyleSaturation','rasterStyleSaturationOut',0]]){const el=$('#'+id),o=$('#'+out);if(el)el.oninput=()=>{if(o)o.value=(+el.value).toFixed(digits);updateRasterStylePreview();};}
if($('#rasterStyleSave'))$('#rasterStyleSave').onclick=saveRasterStyle;
if($('#rasterStyleReset'))$('#rasterStyleReset').onclick=()=>{const r=state.rasters.find(x=>x.id===rasterStyleEditingId);if(!r)return;const st=rasterStyleDefault(r),lo=r.meta?.range?.[0]??st.min,hi=r.meta?.range?.[1]??st.max;$('#rasterStyleRenderer').value='original';$('#rasterStyleRamp').value='spectral';$('#rasterStyleUniqueRamp').value='spectral';$('#rasterStyleInterpolation').value='linear';$('#rasterStyleClassMode').value='continuous';$('#rasterStyleClassCount').value='5';$('#rasterStylePrecision').value='4';$('#rasterStyleMin').value=String(lo);$('#rasterStyleMax').value=String(hi);$('#rasterStyleGrayMin').value=String(lo);$('#rasterStyleGrayMax').value=String(hi);$('#rasterStyleInvert').checked=false;rasterStyleBreaks=makeRasterBreaks(+lo,+hi,5,'spectral',false);rasterStyleClasses=[];renderRasterStyleClasses();renderRasterStyleBreaks();$('#rasterStyleBrightness').value='0';$('#rasterStyleContrast').value='0';$('#rasterStyleGamma').value='1';$('#rasterStyleSaturation').value='0';$('#rasterStyleBrightnessOut').value='0';$('#rasterStyleContrastOut').value='0';$('#rasterStyleGammaOut').value='1.00';$('#rasterStyleSaturationOut').value='0';$('#rasterStyleIsDem').checked=(r.meta?.originalKind||r.meta?.kind)==='dem';$('#rasterStyleSaveStatus').textContent='Prem “Guardar” per restablir el raster original';updateRasterRampVisuals();updateRasterStylePanels();};

window.GeoCauceMobileApi={
  getState:()=>state,
  getSettings:()=>appSettings,
  getProjects:()=>projectCatalog,
  projectStats,
  openProject,
  showProjectHome,
  showProjectCreate,
  showSettings,
  openNotebook,
  locateMe,
  setTool,
  closeFloatingPanels,
  openHistoricalPhotoPoint,
  renderSettings,
  saveSettings:(patch)=>{Object.assign(appSettings,patch||{});saveAppSettings();},
  persist:()=>{if(state.projectId)persistState();}
};
if(!ANDROID_NATIVE&&'serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();

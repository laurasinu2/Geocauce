'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function extract(start, end) {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'No se encuentra la función a probar');
  return src.slice(a, b);
}

const createSource = extract('async function saveProjectForm(){', '\nfunction resetStateForProject(');
const openSource = extract('async function openProject(id,opt={}){', '\nfunction updateProjectUi(');

function buildCreationContext() {
  const catalog = [];
  const storage = new Map();
  const toasts = [];
  const errors = [];
  const state = {projectId: null, project: null, screen: 'create'};
  let failures = true;
  let openCount = 0;
  const ctx = {
    state, projectCatalog: catalog,
    readProjectForm: () => ({name: 'Prueba local', zone: 'Prueba'}),
    projectById: id => catalog.find(p => p.id === id),
    saveProjectCatalog: () => {},
    localStorage: {setItem: () => {}},
    ACTIVE_PROJECT_KEY: 'active',
    projectStateKey: id => id,
    projectStateStorage: {getItem: key => storage.get(key) || null},
    projectStateReadRecord: async (store, id) =>
      storage.has(id) ? {raw: storage.get(id)} : null,
    resetStateForProject: () => {},
    persistStateLocalOnly: () => ({projectId: state.projectId}),
    projectStateFlush: async id => {
      if (failures) throw Error('IndexedDB unavailable for test');
      storage.set(id, JSON.stringify({projectId: id}));
    },
    openProject: async id => {assert.equal(id, state.projectId); openCount++; state.screen = 'map';},
    persistState: () => {},
    canEditProjectInUi: () => true,
    canEditCurrentProject: () => true,
    projectCreateReturn: 'projects',
    toast: message => {toasts.push(message);},
    console: {error: (...args) => errors.push(args)},
  };
  vm.createContext(ctx);
  vm.runInContext('let editingProjectId=null, pendingNewProjectId=null, projectCreateSaveRunning=false;\n' + createSource, ctx);
  return {ctx, state, catalog, toasts, errors, setFailure(v) {failures=v;}, openCount() {return openCount;}};
}

test('failed IndexedDB write does not open or confirm a new project', async () => {
  const e = buildCreationContext();
  await e.ctx.saveProjectForm();
  assert.equal(e.openCount(), 0);
  assert.equal(e.state.screen, 'create');
  assert.equal(e.catalog.length, 1);
  assert.equal(e.catalog[0]._localSaveUnconfirmed, true);
  assert.ok(e.toasts.some(m => m.includes('NO guardado')));
  assert.ok(!e.toasts.some(m => m.includes('creado')));
  assert.equal(e.errors.length, 1);
});

test('retry of a failed creation reuses the same local ID and confirms durability', async () => {
  const e = buildCreationContext();
  await e.ctx.saveProjectForm();
  const id = e.catalog[0].id;
  e.setFailure(false);
  await e.ctx.saveProjectForm();
  assert.equal(e.catalog.length, 1);
  assert.equal(e.catalog[0].id, id);
  assert.equal(e.catalog[0]._localSaveUnconfirmed, undefined);
  assert.equal(e.openCount(), 1);
  assert.ok(e.toasts.some(m => m.includes('creado')));
});

test('a missing local state with no verified cloud backup cannot trigger cloud restore', async () => {
  const state = {projectId: null, view3d: {active: false}};
  const toasts = [];
  let roleCalls = 0;
  const ctx = {
    state,
    projectOpenInProgress: false,
    projectStateReady: async () => {},
    cloudRestoreRunning: false, cloudSyncRunning: false, cloudDeltaRunning: false,
    projectById: () => ({id:'P-example', cloudProjectId:'35f072bd-395c-4153-b071-8fd445575acd'}),
    projectStateStorage: {getItem: () => null},
    projectStateKey: id => id,
    projectStateFailures: new Map(),
    cloudProjectRole: async () => { roleCalls++; return 'owner'; },
    toast: text => {toasts.push(text);},
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(openSource, ctx);
  await ctx.openProject('P-example');
  assert.equal(roleCalls, 0);
  assert.equal(ctx.projectOpenInProgress, false);
  assert.equal(toasts.length, 1);
  assert.ok(toasts[0].includes('guardado local confirmado'));
});

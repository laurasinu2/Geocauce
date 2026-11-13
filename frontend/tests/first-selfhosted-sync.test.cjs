'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const begin = app.indexOf('async function syncCurrentProjectToCloud(');
const end = app.indexOf('\nfunction scheduleCloudSync(', begin);
assert.ok(begin >= 0 && end > begin, 'No se encuentra la rutina de subida R43');

function harness() {
  const calls = [];
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const p = {name: 'Cauce test', id: 'P-local', cloudProjectId: id, zone: 'Local', crs: 'EPSG:25831'};
  const state = {projectId: 'P-local', project: p};
  let uploaded = false;
  let saved = false;
  let shouldFailAssetUpload = false;
  let ownerDuringUpload;
  const session = {access_token: 'test-token', user: {id: userId}};
  const ctx = {
    state,
    canEditCurrentProject: () => true,
    loadCloudSession: () => session,
    cloudConfigured: () => true,
    cloudSyncRunning: false,
    cloudRestoreRunning: false,
    navigator: {onLine: true},
    refreshAccountUi: () => {},
    sessionExpired: () => false,
    cloudSchema: async () => 'modern',
    ensureCloudProjectId: () => id,
    projectStateKey: () => 'P-local',
    projectStateStorage: {getItem: () => '{"projectId":"P-local"}'},
    persistStateLocalOnly: () => {},
    projectStateFlush: async () => {},
    cloudPendingChanges: () => [],
    dbAll: async () => [],
    cloudFetch: async (url, options = {}) => {
      const method = options.method || 'GET';
      calls.push([method, url]);
      if (method === 'GET' && url.startsWith('/rest/v1/project_snapshots')) return [];
      if (method === 'POST' && url.startsWith('/rest/v1/projects')) {
        assert.equal(options.body[0].owner_id, userId);
        return [];
      }
      if (method === 'POST' && url.startsWith('/rest/v1/project_snapshots')) {
        assert.equal(options.body[0].owner_id, userId);
        assert.ok(uploaded, 'The asset upload must have completed before saving a snapshot');
        saved = true;
        return [{updated_at: '2026-11-13T18:00:00.123456+00:00'}];
      }
      throw Error('Unexpected API call: ' + method + ' ' + url);
    },
    cloudUploadProjectAssets: async () => {
      assert.ok(calls.some(([method, url]) => method === 'POST' && url.startsWith('/rest/v1/projects')),
        'Register the project before the first binary upload');
      ownerDuringUpload = p.ownerUserId;
      if (shouldFailAssetUpload) throw Error('Simulated upload interruption');
      uploaded = true;
      return {metadata: {photos: [{id: 'photo1'}], rasters: [{id: 'raster1'}], vectorLayers: []},
        steps: 2, total: 4, uploaded: 2, reused: 0};
    },
    cloudStructuredSnapshot: async (assets) => ({projectId: 'P-local', assetMetadata: assets}),
    cloudStableJson: JSON.stringify,
    cloudCollectObsoleteAssets: async () => {},
    sectionPalette: [],
    cloneAny: v => JSON.parse(JSON.stringify(v)),
    saveProjectCatalog: () => {},
    nativeSyncProject: () => {},
    cloudProgressUpdate: () => {},
    cloudProgressFinish: () => {},
    toast: () => {},
    cloudLastAssetManifest: null,
    cloudLastError: '',
    cloudLastSyncAt: 0,
    console: {warn: () => {}},
  };
  vm.createContext(ctx);
  vm.runInContext(app.slice(begin, end), ctx);
  return {ctx, p, calls, id, userId,
    failUploads: value => {shouldFailAssetUpload = value;},
    getSaved: () => saved,
    getOwnerDuringUpload: () => ownerDuringUpload};
}

test('first synchronization registers project before binary uploads and commits snapshot after', async () => {
  const h = harness();
  assert.equal(await h.ctx.syncCurrentProjectToCloud({manual: true}), true);
  assert.ok(h.getSaved());
  assert.equal(h.getOwnerDuringUpload(), undefined,
    'Do not mark local project cloud-owned before the snapshot is stored');
  assert.equal(h.p.ownerUserId, h.userId);
  assert.ok(h.p._cloudSyncedAt > 0);
  const createPos = h.calls.findIndex(x => x[0] === 'POST' && x[1].startsWith('/rest/v1/projects'));
  const snapshotPos = h.calls.findIndex(x => x[0] === 'POST' && x[1].startsWith('/rest/v1/project_snapshots'));
  assert.ok(createPos >= 0 && snapshotPos > createPos);
});

test('interrupted upload leaves project locally editable and can be retried', async () => {
  const h = harness();
  h.failUploads(true);
  assert.equal(await h.ctx.syncCurrentProjectToCloud({manual: false}), false);
  assert.equal(h.p.ownerUserId, undefined);
  assert.equal(h.p._cloudSyncedAt, undefined);
  h.failUploads(false);
  assert.equal(await h.ctx.syncCurrentProjectToCloud({manual: false}), true);
  assert.equal(h.p.ownerUserId, h.userId);
  assert.ok(h.getSaved());
});

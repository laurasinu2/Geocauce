'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function extract(start, end) {
  const begin = source.indexOf(start);
  const finish = source.indexOf(end, begin + start.length);
  assert.ok(begin >= 0 && finish > begin, 'Function not found: ' + start);
  return source.slice(begin, finish);
}
const functions = [
  extract('function cloudAssetParts(', '\nfunction cloudRemoteAssetIndex('),
  extract('async function cloudDownloadBlob(', '\nasync function cloudAssetDigest('),
  extract('async function cloudAssetDigest(', '\nasync function cloudUploadProjectAssets('),
].join('\n');

function harness(parts) {
  const responses = [];
  const ctx = {
    Blob,
    TextEncoder,
    Uint8Array,
    crypto: webcrypto,
    cloudBinaryFetch: async (url) => {
      const part = parts.get(url.split('/').pop());
      if (!part) throw Error('Missing test part: ' + url);
      const data = part instanceof Blob ? await part.arrayBuffer() : part;
      const response = new Response(data, {headers: {'Content-Type': 'application/octet-stream'}});
      responses.push(response.headers.get('Content-Type'));
      return response;
    },
    encodeURIComponent,
  };
  vm.createContext(ctx);
  vm.runInContext(functions, ctx);
  return {ctx, responses};
}

async function fingerprint(ctx, blob) {
  return 'sha256-chunks-v1:' + blob.size + ':' + blob.type + ':' + await ctx.cloudAssetDigest(blob);
}

test('photo: same JPEG bytes keep a matching SHA-256 after an octet-stream download', async () => {
  const original = new Blob([Uint8Array.from({length: 10817}, (_, i) => i % 251)],
                            {type: 'image/jpeg'});
  const {ctx, responses} = harness(new Map([['photo.jpg', original]]));
  const expected = await fingerprint(ctx, original);
  const restored = await ctx.cloudDownloadBlob('photo.jpg', null, 'image/jpeg');
  assert.deepEqual(responses, ['application/octet-stream']);
  assert.equal(restored.size, original.size);
  assert.equal(restored.type, 'image/jpeg');
  assert.equal(await fingerprint(ctx, restored), expected);
  assert.deepEqual(Buffer.from(await restored.arrayBuffer()), Buffer.from(await original.arrayBuffer()));
});

test('small GeoTIFF: original application/geotiff type is restored after download', async () => {
  const original = new Blob([Uint8Array.from({length: 512}, (_, i) => (i * 3) % 256)],
                            {type: 'image/tiff'});
  const {ctx} = harness(new Map([['terrain.tif', original]]));
  const expected = await fingerprint(ctx, original);
  const restored = await ctx.cloudDownloadBlob('terrain.tif', null, original.type);
  assert.equal(restored.type, 'image/tiff');
  assert.equal(await fingerprint(ctx, restored), expected);
});

test('multipart GeoTIFF: 8 MiB chunks reassemble to the same verified fingerprint', async () => {
  const bytes = new Uint8Array(8 * 1024 * 1024 + 8197);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 199;
  const original = new Blob([bytes], {type: 'image/tiff'});
  const split = 8 * 1024 * 1024;
  const partNames = ['map.part0000', 'map.part0001'];
  const {ctx, responses} = harness(new Map([
    [partNames[0], bytes.slice(0, split)],
    [partNames[1], bytes.slice(split)],
  ]));
  const restored = await ctx.cloudDownloadBlob(partNames[0], partNames, 'image/tiff');
  assert.equal(restored.type, original.type);
  assert.equal(restored.size, original.size);
  assert.deepEqual(responses, ['application/octet-stream', 'application/octet-stream']);
  assert.equal(await fingerprint(ctx, restored), await fingerprint(ctx, original));
});

test('tampered photo still fails SHA-256 verification; never bypass integrity checks', async () => {
  const original = new Blob([Uint8Array.from([1, 2, 3, 4, 5])], {type: 'image/jpeg'});
  const {ctx} = harness(new Map([['photo.jpg', Uint8Array.from([1, 2, 3, 0, 5])]]));
  const restored = await ctx.cloudDownloadBlob('photo.jpg', null, 'image/jpeg');
  assert.equal(restored.size, original.size);
  assert.equal(restored.type, original.type);
  assert.notEqual(await fingerprint(ctx, restored), await fingerprint(ctx, original));
});

test('an original blob with empty type remains empty type and retains fingerprint', async () => {
  const original = new Blob([Uint8Array.from([70, 71, 72, 73])]);
  const {ctx} = harness(new Map([['unknown', original]]));
  const restored = await ctx.cloudDownloadBlob('unknown', null, null);
  assert.equal(restored.type, '');
  assert.equal(await fingerprint(ctx, restored), await fingerprint(ctx, original));
});

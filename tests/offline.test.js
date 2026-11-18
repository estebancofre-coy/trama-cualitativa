import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import vm from 'node:vm';

test('build precaches all application assets and serves only its own files offline', async () => {
  const root = 'dist';
  async function filesIn(dir) {
    return (await Promise.all((await readdir(dir, { withFileTypes:true })).map(entry =>
      entry.isDirectory() ? filesIn(join(dir, entry.name)) : [join(dir, entry.name)]))).flat();
  }
  const files = (await filesIn(root)).map(file => relative(root, file).replaceAll('\\', '/')).filter(file => file !== 'sw.js').sort();
  const manifest = JSON.parse(await readFile(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, './');
  for (const icon of manifest.icons) assert.ok(files.includes(icon.src.slice(2)));
  const handlers = {};
  const entries = new Map();
  const scope = 'https://example.test/trama/';
  const cache = {
    async addAll(urls) { for (const url of urls) entries.set(url, `cached:${url}`); },
    async match(request) { return entries.get(typeof request === 'string' ? request : request.url); },
  };
  const caches = { async open() { return cache; }, async keys() { return []; }, async delete() {} };
  const self = { registration:{ scope }, addEventListener(type, handler) { handlers[type] = handler; } };
  vm.runInNewContext(await readFile(join(root, 'sw.js'), 'utf8'), { self, caches, URL, fetch() { throw new Error('offline'); } });
  let installation;
  handlers.install({ waitUntil(promise) { installation = promise; } });
  await installation;
  assert.deepEqual([...entries.keys()].sort(), files.map(file => new URL(file, scope).href).sort());
  for (const url of [`${scope}?mapWindow=1`, ...files.filter(file => /\.(js|css|woff2)$/.test(file)).map(file => new URL(file, scope).href)]) {
    let response;
    handlers.fetch({ request:{ url, method:'GET', mode:url.includes('?') ? 'navigate' : 'no-cors' }, respondWith(promise) { response = promise; } });
    assert.ok(response, `not intercepted: ${url}`);
    assert.match(await response, /^cached:/);
  }
  for (const request of [
    { url:'https://other.test/data', method:'GET', mode:'cors' },
    { url:`${scope}upload`, method:'POST', mode:'cors' },
    { url:`${scope}unknown`, method:'GET', mode:'cors' },
  ]) {
    let intercepted = false;
    handlers.fetch({ request, respondWith() { intercepted = true; } });
    assert.equal(intercepted, false);
  }
});

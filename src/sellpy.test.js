import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveCredentials } from './sellpy.js';

const SEARCH_PAGE = 'https://www.sellpy.se/search?query=x';
const CONFIG = 'const config={sv:{applicationId:"swedish-app",searchKey:"swedish-key",marketItemIndexSaleStartDescending:"swedish-index"},de:{applicationId:"german-app",searchKey:"german-key",marketItemIndexSaleStartDescending:"german-index"}};';

function mockFetch(t, responses) {
  return t.mock.method(globalThis, 'fetch', async (url) => {
    assert.ok(responses.has(url), `unexpected request: ${url}`);
    return responses.get(url);
  });
}

for (const directory of ['/market/', '/market/cached/']) {
  test(`resolves credentials from ${directory} production config`, async (t) => {
    const path = `${directory}config.prod.Bjq_wRrM-123.bundle.js`;
    const bundleUrl = `https://www.sellpy.se${path}`;
    const fetchMock = mockFetch(t, new Map([
      [SEARCH_PAGE, new Response(
        `<script src="/market/cached/index.123.bundle.js"></script>
         <link rel="modulepreload" crossorigin href="${path}">
         <link rel="modulepreload" href="/market/cached/config.456.bundle.js">`,
      )],
      [bundleUrl, new Response(CONFIG)],
    ]));

    assert.deepEqual(await resolveCredentials(), {
      appId: 'swedish-app',
      apiKey: 'swedish-key',
      index: 'swedish-index',
      locale: 'sv',
    });
    assert.equal(fetchMock.mock.callCount(), 2);
  });
}

test('selects credentials for the requested locale', async (t) => {
  const path = '/market/cached/config.prod.123.bundle.js';
  mockFetch(t, new Map([
    [SEARCH_PAGE, new Response(`<link rel="modulepreload" href="${path}">`)],
    [`https://www.sellpy.se${path}`, new Response(CONFIG)],
  ]));

  assert.deepEqual(await resolveCredentials('de'), {
    appId: 'german-app',
    apiKey: 'german-key',
    index: 'german-index',
    locale: 'de',
  });
});

test('rejects invalid locales before fetching', async (t) => {
  const fetchMock = mockFetch(t, new Map());
  await assert.rejects(resolveCredentials('swedish'), /invalid locale/);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('fails explicitly when the production config bundle is missing', async (t) => {
  mockFetch(t, new Map([
    [SEARCH_PAGE, new Response('<script src="/market/cached/config.123.bundle.js"></script>')],
  ]));
  await assert.rejects(resolveCredentials(), /could not locate config bundle in HTML/);
});

test('fails explicitly when the locale config is incomplete', async (t) => {
  const path = '/market/cached/config.prod.123.bundle.js';
  mockFetch(t, new Map([
    [SEARCH_PAGE, new Response(`<link rel="modulepreload" href="${path}">`)],
    [`https://www.sellpy.se${path}`, new Response('const config={sv:{applicationId:"app",searchKey:"key"}};')],
  ]));
  await assert.rejects(
    resolveCredentials(),
    /incomplete creds for locale "sv" \(appId=true apiKey=true index=false\)/,
  );
});

test('reports HTTP errors when fetching the config bundle', async (t) => {
  const path = '/market/cached/config.prod.123.bundle.js';
  mockFetch(t, new Map([
    [SEARCH_PAGE, new Response(`<link rel="modulepreload" href="${path}">`)],
    [`https://www.sellpy.se${path}`, new Response('', { status: 404 })],
  ]));
  await assert.rejects(resolveCredentials(), /GET .*config\.prod\.123\.bundle\.js -> HTTP 404/);
});

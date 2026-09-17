const SEARCH_PAGE =
  'https://www.sellpy.se/search?query=x';

const HITS_PER_PAGE = 200;
const DEFAULT_LOCALE = 'sv';

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

// `locale` picks which of Sellpy's per-country search configs to use (the
// site's own JS bundle keys them the same way, e.g. sv=Sweden, en=English,
// de=Germany, fr=France, ...).
export async function resolveCredentials(locale = DEFAULT_LOCALE) {
  if (!/^[a-z]{2}$/.test(locale)) {
    throw new Error(`invalid locale "${locale}" (expected a 2-letter code like "sv")`);
  }

  const html = await fetchText(SEARCH_PAGE);

  const bundleMatch = html.match(/\/market\/index\.[A-Za-z0-9_-]+\.bundle\.js/);
  if (!bundleMatch) throw new Error('could not locate index bundle in HTML');
  const bundleUrl = new URL(bundleMatch[0], 'https://www.sellpy.se').href;

  const bundle = await fetchText(bundleUrl);

  const localeMatch = bundle.match(new RegExp(`\\b${locale}:\\{([^}]*)\\}`));
  const localeConfig = localeMatch?.[1] ?? '';

  const appId = localeConfig.match(/applicationId:"([A-Z0-9]+)"/)?.[1];
  const apiKey = localeConfig.match(/searchKey:"([a-f0-9]+)"/)?.[1];
  const index = localeConfig.match(
    /marketItemIndexSaleStartDescending:"([^"]+)"/,
  )?.[1];

  if (!appId || !apiKey || !index) {
    throw new Error(
      `incomplete creds for locale "${locale}" (appId=${!!appId} apiKey=${!!apiKey} index=${!!index}) — does this locale exist on Sellpy?`,
    );
  }

  return { appId, apiKey, index, locale };
}

export async function queryAuthors(authors, creds) {
  const url = `https://${creds.appId}-dsn.algolia.net/1/indexes/*/queries`;

  const requests = authors.map((author) => ({
    indexName: creds.index,
    query: author,
    hitsPerPage: HITS_PER_PAGE,
  }));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-algolia-application-id': creds.appId,
      'x-algolia-api-key': creds.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Algolia multi-query -> HTTP ${res.status} ${text.slice(0, 200)}`,
    );
  }

  const data = await res.json();
  const results = Array.isArray(data.results) ? data.results : [];

  return results.map((result, i) => {
    const author = authors[i];
    const hits = Array.isArray(result.hits) ? result.hits : [];
    return hits
      .filter((h) => h.metadata?.authors?.indexOf(author) >= 0)
      .map(normalizeHit);
  });
}

function normalizeHit(h) {
  const priceOre = h.price_SE?.amount ?? (h.pricing?.amount ?? 0) * 100;
  return {
    objectID: h.objectID,
    metadata: h.metadata ?? {},
    priceSEK: Math.round(priceOre / 100),
    url: `https://www.sellpy.se/item/${h.objectID}`,
    saleStartedAt: h.saleStartedAt ?? null,
    image: h.images?.[0] ?? null,
  };
}

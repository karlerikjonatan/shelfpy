import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { resolveCredentials, queryAuthors } from './sellpy.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Override any of these per fork/run without touching source, e.g.:
//   SELLPY_LOCALE=en AUTHORS_PATH=./my-authors.json npm start
const LOCALE = process.env.SELLPY_LOCALE || 'sv';
const AUTHORS_PATH = process.env.AUTHORS_PATH
  ? resolve(process.env.AUTHORS_PATH)
  : join(ROOT, 'authors.json');
const OUT_PATH = process.env.OUT_PATH
  ? resolve(process.env.OUT_PATH)
  : join(ROOT, 'books.csv');

const BATCH_SIZE = 50;
const DELAY_MS = 200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, 'utf8'));
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

function csvCell(value) {
  let s;
  if (value == null) {
    s = '';
  } else if (Array.isArray(value)) {
    s = value.some((v) => v !== null && typeof v === 'object')
      ? JSON.stringify(value)
      : value.join('; ');
  } else if (typeof value === 'object') {
    s = JSON.stringify(value);
  } else {
    s = String(value);
  }
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const COLUMN_ORDER = [
  'author',
  'title',
  'authors',
  'type',
  'bookType',
  'condition',
  'priceSEK',
  'isbn',
  'publicationYear',
  'language',
  'brand',
  'countryOfOrigin',
  'defects',
  'purchaseDate',
  'quantity',
  'saleStartedAt',
  'url',
];

function renderCsv(items) {
  const knownColumns = new Set(['author', 'priceSEK', 'saleStartedAt', 'url']);
  const metaKeys = new Set(items.flatMap((item) => Object.keys(item.metadata)));
  const allColumns = new Set([...knownColumns, ...metaKeys]);

  const leftover = [...allColumns].filter((c) => !COLUMN_ORDER.includes(c)).sort();
  const columns = [...COLUMN_ORDER.filter((c) => allColumns.has(c)), ...leftover];

  const header = columns.join(',');
  const rows = items.map((item) => {
    const values = {
      author: item.author,
      priceSEK: item.priceSEK,
      saleStartedAt: item.saleStartedAt ? new Date(item.saleStartedAt).toISOString() : '',
      url: item.url,
      ...item.metadata,
    };
    return columns.map((col) => csvCell(values[col])).join(',');
  });

  return [header, ...rows].join('\n') + '\n';
}

async function main() {
  const creds = await resolveCredentials(LOCALE);
  console.log(`[sellpy] using locale ${creds.locale}, app ${creds.appId}, index ${creds.index}`);

  const authors = await readJson(AUTHORS_PATH, []);
  if (authors.length === 0) {
    console.warn(`[sellpy] no search terms found at ${AUTHORS_PATH} — nothing to do`);
  }
  const batches = chunk(authors, BATCH_SIZE);

  const byId = new Map();
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    try {
      const results = await queryAuthors(batch, creds);
      let count = 0;
      results.forEach((items, j) => {
        const author = batch[j];
        for (const item of items) {
          count++;
          if (!byId.has(item.objectID)) byId.set(item.objectID, { ...item, author });
        }
      });
      console.log(`[sellpy] batch ${i + 1}/${batches.length} (${batch.length} authors): ${count} listing(s)`);
    } catch (err) {
      console.warn(`[sellpy] batch ${i + 1}/${batches.length} failed, skipping: ${err.message}`);
    }
    if (i < batches.length - 1) await sleep(DELAY_MS);
  }

  const items = [...byId.values()].sort(
    (a, b) => (b.saleStartedAt ?? 0) - (a.saleStartedAt ?? 0),
  );

  await writeFile(OUT_PATH, renderCsv(items));
  console.log(`[sellpy] wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

# shelfpy

Generates a CSV of book listings from
[Sellpy](https://www.sellpy.se) matching a curated list of authors.

It queries Sellpy's public search index for each author listed in your
search-terms file (`authors.json` by default — the name/path is yours to
choose, see Configuration), dedupes the results, and renders them into a
single `books.csv` file sorted by newest listing first. Each hit's
`metadata` fields (title, ISBN, condition, book type, etc.) become their
own columns — no images are included.

## Usage

```bash
npm start
```

This writes `books.csv` in the project root.

## Configuration

Everything below is optional; defaults match the original Swedish-books setup.
Copy [`.env.example`](.env.example) to `.env` and run `npm run start:env`
(Node ≥ 20.6), or just export these in your shell before `npm start`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SELLPY_LOCALE` | `sv` | 2-letter Sellpy locale to search (`sv`=Sweden, `en`=international, `de`=Germany, `fr`=France, ...) |
| `AUTHORS_PATH` | `./authors.json` | Path to the JSON array of search terms — any filename/path works |
| `OUT_PATH` | `./books.csv` | Where the resulting CSV is written |

Whatever you name it, that file is a flat JSON array of strings, e.g.
`["Stephen King", "Agatha Christie"]`.

## How it works

No API keys or accounts are needed. `src/sellpy.js` resolves Algolia search
credentials fresh on every run by scraping Sellpy's public search page and
its JS bundle for the requested locale's application ID, search-only API
key, and index name. These are the same public, search-only credentials
Sellpy's own website uses client-side (not a private secret). If the site's
markup changes and resolution fails, the run fails with an error rather than
falling back to stale values.

`src/index.js` batches the search terms (50 per request) and queries them
via Algolia's multi-query endpoint in one HTTP call per batch, merges and
dedupes hits by listing ID, and renders the result as CSV — one column per
key found in the hits' `metadata` objects, plus the matched search term,
price, sale date, and item URL. A batch that fails is logged and skipped
rather than aborting the whole run.

## Requirements

- Node.js >= 20

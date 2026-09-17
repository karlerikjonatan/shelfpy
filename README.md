# shelfpy

Generates a CSV or Markdown image gallery of book listings from
[Sellpy](https://www.sellpy.se) matching a curated list of authors.

It queries Sellpy's public search index for each author listed in your
search-terms file (`data/authors.json` by default), dedupes the results, and renders them
sorted by newest listing first — either as a CSV, with each hit's `metadata`
fields (title, ISBN, condition, book type, etc.) as their own columns, or as a
Markdown table (4 columns by default) of cover images (each linking to the
item) with the title, author, and price underneath.

## Usage

```bash
npm start
```

This writes a timestamped file to `output/`, e.g. `output/20260914_193045_books.csv` — each run creates a new file. Set `OUTPUT_FORMAT=md` to get a Markdown table of cover images (with title, author, and price underneath each, `MD_COLUMNS` wide) instead (see [Configuration](#configuration)).

## Configuration

Everything below is optional; defaults match the original Swedish-books setup.
Copy [`.env.example`](.env.example) to `.env` and run `npm run start:env`
(Node ≥ 20.6), or just export these in your shell before `npm start`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SELLPY_LOCALE` | `sv` | 2-letter Sellpy locale to search (`sv`=Sweden, `en`=international, `de`=Germany, `fr`=France, ...) |
| `DATA_DIR` | `./data` | Folder holding your search-term list files |
| `AUTHORS_PATH` | `$DATA_DIR/authors.json` | Path to the JSON array of search terms — any filename/path works |
| `OUTPUT_DIR` | `./output` | Folder to write timestamped output files into |
| `OUTPUT_FORMAT` | `csv` | Output format: `csv` (one column per metadata field) or `md` (a Markdown table of cover images linking to each item, with title, author, and price underneath) |
| `MD_COLUMNS` | `4` | Number of columns in the Markdown gallery table (only used when `OUTPUT_FORMAT=md`) |

Whatever you name it, a search-terms file is a flat JSON array of strings,
e.g. `["Author", "Author"]`. Keep as many side by side in
`data/` as you like — see [`data/README.md`](data/README.md).

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
dedupes hits by listing ID, and renders the result as either CSV — one column
per key found in the hits' `metadata` objects, plus the matched search term,
price, sale date, and item URL — or a Markdown gallery of cover images, title,
author, and price, per `OUTPUT_FORMAT`. A batch that fails is logged and
skipped rather than aborting the whole run.

## Requirements

- Node.js >= 20

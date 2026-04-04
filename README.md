# News In Perspective

Monorepo for a news-comparison project that ingests RSS feeds from Kagi's public `kite_feeds.json` catalog, stores normalized article data in Postgres, clusters same-day coverage, and exposes lightweight NLP comparison signals to a Svelte frontend.

## Workspace
- `apps/api`: Fastify API plus ingestion jobs
- `apps/web`: Svelte + Vite frontend
- `packages/db`: Prisma schema and generated client
- `packages/shared`: shared DTOs and schemas

## Local setup
1. Select the repo Node version: `nvm use`
2. Enable Corepack and install the pinned package manager: `corepack enable && corepack install`
3. Install dependencies: `pnpm install`
4. Start Postgres: `docker compose up -d postgres`
5. Generate Prisma client: `pnpm db:generate`
6. Run migrations: `pnpm db:migrate`
7. Start the backend: `pnpm api:start`
8. Start the frontend: `pnpm web:start`

`package.json` pins `pnpm@10.32.1`, so once Corepack is enabled it will provision the correct `pnpm` version for this repo. If `nvm` is not already installed on your machine, install it first and then run `nvm use`.

API defaults to `http://localhost:4400`, the frontend defaults to `http://localhost:5317`, and Postgres is exposed on `localhost:55432`.

For the first few runs, the default `.env` sets `INGEST_FEED_LIMIT=50` so ingestion completes quickly while you validate the pipeline. Remove or increase that limit once you are ready for broader collection.

## Ingestion
Run a manual ingestion for a date:

```bash
curl -X POST http://localhost:4400/internal/ingest/run \
  -H 'content-type: application/json' \
  -d '{"date":"2026-03-23"}'
```

Or run ingestion directly from the CLI:

```bash
pnpm ingest 2026-03-23
```

Inspect dataset status:

```bash
pnpm data:status
```

Runtime logs are written to `logs/`, including:

- `logs/api.log`
- `logs/ingestion-YYYY-MM-DD.log`

Then inspect:

- `GET /api/dates`
- `GET /api/stories?date=2026-03-23`
- `GET /api/stories/:id`
- `GET /api/stories/:id/comparison`

## Validation
- `pnpm lint`
- `pnpm test`
- `pnpm build`

## Notebook workflow

For team NLP analysis in Jupyter, use the shared notebook workspace under `notebooks/`.

1. Create a Python virtualenv: `python3 -m venv .venv && source .venv/bin/activate`
2. Install notebook dependencies: `pip install -r notebooks/requirements.txt`
3. Export a date slice from the running API:

```bash
python notebooks/src/export_news_slice.py \
  --date 2026-03-23 \
  --api-base http://localhost:4400 \
  --output-dir notebooks/exports/2026-03-23
```

4. Convert the Jupytext template if needed: `jupytext --to ipynb notebooks/templates/nlp_analysis.py`
5. Open the notebook and point `EXPORT_DIR` at the exported slice.

The exporter writes flat JSONL files that load directly into pandas dataframes and work well for shared notebook analysis.

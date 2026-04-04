# NewsInPerspective v1

## Summary
Build a `pnpm` + `turbo` monorepo with a Svelte + Vite frontend and a Node/TypeScript backend using Prisma + Postgres.

The first implementation milestone is backend-first and focuses on collecting daily data reliably:

- fetch the Kagi feed catalog from `https://kite.kagi.com/kite.json` or its current equivalent
- ingest article-level RSS entries from those feeds
- normalize and deduplicate articles
- cluster same-story coverage per day
- compute lightweight NLP signals for cross-source similarity and framing analysis
- expose read APIs for the frontend to render daily stories and per-story comparisons

## Architecture
### Monorepo
- `apps/web`: Svelte + Vite frontend
- `apps/api`: backend API and ingestion jobs
- `packages/db`: Prisma schema, migrations, generated client
- `packages/shared`: shared types, schemas, and DTOs

### Backend runtime
Use a single backend service initially:

- HTTP API for frontend reads
- scheduled ingestion runner
- manual/internal ingestion trigger for testing and backfills

## Backend Implementation
### Ingestion flow
Implement a daily idempotent ingestion pipeline keyed by `ingestion_date`:

1. Fetch the Kagi feed catalog.
2. Extract feed definitions and source/category metadata.
3. Fetch RSS items from each configured feed.
4. Normalize article fields.
5. Deduplicate articles.
6. Persist raw fetch metadata and normalized article rows.
7. Build daily story clusters from newly ingested articles.
8. Compute lightweight NLP features used for comparison views.
9. Record feed-level and run-level success/failure state.

### Scheduling
Support:

- one automatic daily run
- one manual trigger endpoint for local development and backfills
- rerunning the same date without creating duplicate article rows or cluster rows

## Data Model
### Core tables
- `FeedSource`
- `IngestionRun`
- `FeedFetch`
- `Article`
- `ArticleRaw`
- `StoryCluster`
- `ClusterArticle`
- `SourceProfile`
- `NlpFeature`

## NLP v1
Use lightweight, explainable methods first:

- similarity features from title/body text overlap and entities
- keywords and named entities
- sentiment and subjectivity
- framing or bias indicators from lexicon/model-style heuristics
- stopword removal must be language-aware; keyword extraction must use the article language rather than an English-only stopword list

## API Surface
### Public endpoints
- `GET /api/dates`
- `GET /api/stories?date=YYYY-MM-DD`
- `GET /api/stories/:id`
- `GET /api/stories/:id/comparison`
- `GET /api/sources/:domain`

### Internal endpoints
- `POST /internal/ingest/run`
- `GET /internal/ingest/runs/:date`

## Acceptance Criteria
- a daily ingestion run can fetch feeds and persist normalized article data
- rerunning the same date does not create duplicates
- the backend deduplicates effectively when the same article text is republished by multiple sources or syndicated outlets
- related articles from multiple sources are grouped into the same story cluster
- the API can return a daily list of stories and a per-story comparison payload
- the frontend can render that data without depending on Kagi’s own story API

## Additional Product Requirements
- deduplicate substantially identical article text even when it appears under different URLs or on different domains
- add faceted navigation for category and region so the frontend can separate datasets such as Germany, Canada, and World instead of mixing them into one flat stream
- ensure keyword extraction and other token-based NLP features respect the language of the article

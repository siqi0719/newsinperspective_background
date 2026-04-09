# NewsInPerspective

NewsInPerspective is a university research project in Natural Language Processing (NLP). The goal of the project is to build
a web application which can show different perspectives on news stories. 

## Milestone 1: Ingestion, clustering and basic display

Goal: Build a `pnpm` + `turbo` monorepo with a Svelte + Vite frontend and a Node/TypeScript backend using Prisma + Postgres with the following capabilities:

- fetch the Kagi feed catalog from `https://kite.kagi.com/kite.json`
- ✅ Use Kagi clusters to group articles into stories
- ✅ Use source URLs to retrieve raw article text
- ✅ Normalize and deduplicate articles
- ✅ Command line-based ingestion runner
- ✅ Frontend can show today's 10 top news clusters.
- Infinite scroll: When reaching the bottom, the next day's top clusters are loaded and shown.
- ✅ Exporting of ingested clusters to a JSON file for student experimation in Jupyter notebooks (template provided and uploaded to Google Drive).
- ✅ Frontend looks visually appealing and is responsive.

## Current Status

Milestone 1 is mostly complete.

What is already in place:

- ✅ monorepo with `apps/web`, `apps/api`, `packages/db`, and `packages/shared`
- ✅ Fastify API backed by Prisma + Postgres
- ✅ browser-based publisher extraction using Playwright
- ✅ Kagi cluster export scripts
- ✅ Kagi cluster import into the application database
- ✅ ranked story API with a v1 `importanceScore`
- ✅ feed-style frontend with category chooser, settings panel, and infinite scroll pagination
- ✅ notebook export to a single `news.jsonl`
- ✅ Colab-ready notebook and Google Drive sync workflow

What is still incomplete or only partially complete:

- Kagi import is still a snapshot importer layered onto the older `StoryCluster` schema
- multilingual keyword extraction and language detection are not robust enough yet
- the UI is currently filtered to likely-English stories as a pragmatic v1 clamp
- there is now a single end-to-end `kagi:ingest` command, but notebook/Drive sync are still intentionally explicit follow-up steps
- the API and DB still reflect some legacy daily-cluster assumptions even though the UI now derives date ranges

## Architecture

### Monorepo

- `apps/web`: Svelte + Vite frontend
- `apps/api`: Fastify API, Kagi import/export scripts, ingestion jobs
- `packages/db`: Prisma schema, migrations, generated client
- `packages/shared`: shared DTOs and zod schemas
- `notebooks`: notebook template, export tooling, shared `news.jsonl`

### Runtime model

Use a single backend service initially:

- HTTP API for frontend reads
- manual CLI-based Kagi export/import workflows
- optional scheduled ingestion/backfill support
- notebook export as a secondary research workflow

## Backend Implementation

### Current ingestion / import flow

The repo currently supports two parallel data paths:

1. Legacy RSS ingestion path
   - fetch Kagi public feed catalog
   - fetch RSS items
   - normalize and deduplicate articles
   - locally cluster same-day coverage

2. Current Kagi-first path for V1
   - fetch Kagi News API categories and stories
   - export selected Kagi clusters to saved `cluster.json` snapshots
   - fetch publisher pages with Playwright and extract readable article text
   - import saved cluster snapshots into Postgres
   - compute lightweight NLP features for the imported articles

For V1, the Kagi-first path should be treated as the primary path.

### Scheduling and operations

Current scripts and workflows include:

- `pnpm kagi:top-clusters`
- `pnpm kagi:export-clusters`
- `pnpm kagi:import-clusters`
- `pnpm kagi:random-cluster`
- `pnpm kagi:repair-failures`
- `pnpm kagi:backfill-redirects`
- `pnpm export:kagi:notebook`
- `pnpm drive:push`

Recommended next step:

- keep data sync steps explicit and composable:
  - export Kagi clusters
  - import into Postgres
  - rebuild `notebooks/news.jsonl`
  - push to Google Drive only as a separate explicit action

## Data Model

### Current core tables

- `FeedSource`
- `IngestionRun`
- `FeedFetch`
- `Article`
- `ArticleRaw`
- `StoryCluster`
- `ClusterArticle`
- `SourceProfile`
- `NlpFeature`

### Current practical reality

The schema is still shaped around the original local-clustering design. Kagi-imported clusters are
currently backfilled into `StoryCluster` snapshots keyed by:

- `clusterKey` = Kagi story UUID
- `storyDate` = snapshot / import day

The frontend now derives `dateFrom` / `dateUntil` from linked article timestamps, but the storage
model is not yet fully Kagi-native.

### Recommended post-M1 schema direction

The product schema should stay product-owned and flexible enough to support:

- Kagi as an initial cluster source
- future in-house scraping and extraction
- future in-house clustering
- mixed provenance across imported and internally generated stories

Small provenance / import-tracking tables are fine, for example:

- `ImportedBatch`
- `ImportedStorySource`
- `ImportedArticleSource`

But Kagi should not dominate the core model. The central story/article/cluster schema should remain
generic enough to absorb future non-Kagi pipelines without a second major rewrite.

## NLP v1

Use lightweight, explainable methods first:

- keyword extraction
- named entities
- sentiment and subjectivity
- framing / bias indicators from heuristics
- simple comparison summaries for the UI

Current caveat:

- stopword removal exists for a few languages, but imported Kagi data does not always include a
  reliable language code
- because of that, multilingual keyword extraction is currently noisy
- the UI now filters to likely-English stories to keep v1 outputs usable

Recommended next step:

- add explicit per-article language detection during import and use that language signal throughout
  feature extraction

## API Surface

### Public endpoints

- `GET /api/dates`
- `GET /api/facets?date=YYYY-MM-DD`
- `GET /api/stories?date=YYYY-MM-DD&offset=0&limit=10`
- `GET /api/stories/:id`
- `GET /api/stories/:id/comparison`
- `GET /api/sources/:domain`

### Internal / operational workflows

These are currently CLI-first rather than API-first:

- Kagi cluster export/import scripts
- notebook export scripts
- Drive sync scripts

The older internal ingestion endpoints still exist for the RSS-based path, but they are no longer
the primary V1 workflow.

## Frontend v1

Current intended UX:

- default to the latest available date
- top-level category chooser across all available categories
- region/date preferences behind a settings control
- ranked story feed ordered by `importanceScore`
- infinite scroll loading the next 10 stories within the current date/category/region view
- sticky story detail pane for comparison across sources

Note:

- the original plan said infinite scroll should move to the next day after the first 10 stories
- the current implementation instead paginates more stories within the selected date
- this is a sensible v1 simplification and should stay unless cross-day feed blending is explicitly desired

## Notebook / Research Workflow

Current notebook workflow is part of Milestone 1, not an afterthought:

- flatten saved cluster exports or API slices into a single `notebooks/news.jsonl`
- keep a Colab-ready `notebooks/nlp_analysis.ipynb`
- keep the Jupytext source under `notebooks/templates/nlp_analysis.py`
- sync notebook assets to Google Drive so team members can open the notebook in Colab

Shared output for the team currently centers on:

- `notebooks/news.jsonl`
- `notebooks/nlp_analysis.ipynb`

## Acceptance Criteria For Milestone 1

Milestone 1 should be considered complete when:

- Kagi-based cluster export/import is the initial documented workflow for V1
- imported clusters are visible in the application UI through Postgres-backed APIs
- the frontend shows the latest ranked clusters in a responsive infinite-scroll feed
- article source pages are fetched via Playwright and readable text is stored where extraction succeeds
- notebook export produces a single denormalized `news.jsonl`
- the shared notebook works in Colab from the synced Drive folder
- the frontend and notebook workflow are aligned enough that the team can inspect the same underlying dataset

## Milestone 1 Todo List

These items still need work before Milestone 1 feels truly closed:

- update README setup and run docs so the current Kagi import workflow is documented clearly without implying it is the permanent architecture
- make notebook export regeneration part of the standard explicit export/import workflow
- keep Drive push as a separate explicit step rather than bundling it into ingestion/import
- improve or replace the heuristic English-only filter with actual language detection on import
- improve focus-term quality for non-English content before re-enabling multilingual stories in the UI
- decide whether the product should keep the legacy RSS ingestion path in-tree during V1 or isolate it more clearly as a fallback / legacy path
- consider adding a small API endpoint for top homepage categories or top stories so the frontend does not need to derive all homepage state client-side
- validate that current Postgres-backed imported clusters match the latest saved Kagi exports after a normal sync run

## Milestone 2 Todo List

- [ ] Use only OpenRouter for keyword tagging.
- [ ] Notebook export only uses Database
- [ ] Deduplicate substantially identical article texts.
- [ ] Integrate more LLM infrastructure to run "tasks" against all articles in a cluster
  - [ ] Summarize the entire cluster into a neutral single summary.
  - [ ] Identify notable 'unique' aspects and notable ommissions against the cluster for each article. 
  - [ ] Identify political leaning to party ideology in the particular country.
  - [ ] Fear-mongering and sensationalism index.
  - [ ] Tagging of NERs and topics.
  - [ ] Run only against most relevant cluster.
- [ ] Add news cluster page which shows one cluster in more detail:
  - Summary of the cluster as a whole.
  - How many sources? Which sources? Which countries? Which languages?
  - Sections for the tasks:
    - Notable unique aspects.
    - Notable omissions.
    - Poltical leanings.
    - Fear-mongering and sensationalism index.
    - NER and topic tags.

## Additional Product Requirements

- deduplicate substantially identical article text even when it appears under different URLs or domains
- preserve both original and final publisher URLs during extraction and export workflows
- keep UI ranking based on importance rather than raw source-count density alone
- keep notebook and app datasets reasonably synchronized so the research workflow reflects what the product shows

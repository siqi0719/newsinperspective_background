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
- [ ] Improve URL resolution so intermediary `google.com` links are reliably resolved to publisher final URLs, while preserving original URL.
- [ ] **Background Information Feature (Named Entity Recognition + Wikipedia Linking)**
  - [ ] Database Schema:
    - [ ] Add NamedEntity table (id, name, type, wikiId, wikipediaUrl, wikidataId, summary, imageUrl)
    - [ ] Add EntityMention table (id, articleId, entityId, startOffset, endOffset, context, confidence)
    - [ ] Add EntityStatistics table (id, entityId, totalMentions, uniqueArticles, mentions7Days, mentions30Days)
    - [ ] Add EntityCooccurrence table (id, entity1Id, entity2Id, cooccurrenceCount, lastDate)
  - [ ] NLP Services:
    - [ ] Implement entity-recognition.ts using spaCy (en_core_web_md) for PERSON, GPE, ORG, EVENT extraction
    - [ ] Implement entity-linker.ts for Wikipedia API integration with caching and disambiguation
    - [ ] Implement entity-statistics.ts for calculating occurrence frequency, co-occurrence relationships, and time-series data
    - [ ] Implement entity-query.ts for database query functions
  - [ ] Data Processing:
    - [ ] Create process-entities.ts script for batch processing existing articles
    - [ ] Create update-entity-stats.ts script for periodic statistics refresh
    - [ ] Add pnpm tasks: `entities:process`, `entities:update-stats`
  - [ ] API Endpoints:
    - [ ] GET /api/articles/:articleId/entities - Return entity list with mentions and Wikipedia summaries
    - [ ] GET /api/entities/:entityId - Return detailed entity info with quantified statistics (trend data, co-occurrences)
    - [ ] GET /api/entities/search?q=query - Search entities by name
  - [ ] Frontend Components:
    - [ ] Create ArticleContent.svelte - Display article text with highlighted entities
    - [ ] Create EntityMention.svelte - Styled highlighted entity spans with tooltip
    - [ ] Create EntityDetailModal.svelte - Modal showing entity details, statistics, trends, related entities
    - [ ] Add entities.css - Styling for highlights, tooltips, modals
    - [ ] Integrate chart.js/plotly.js for trend visualization
    - [ ] Modify StoryDetail.svelte - Integrate entity features and statistics panel
  - [ ] Background Jobs:
    - [ ] Create entity-update.ts worker for scheduled entity processing
    - [ ] Integrate with existing scheduler.ts
  - [ ] Quantifiable Metrics:
    - [ ] Total mentions per entity (global and per time period)
    - [ ] Unique article count
    - [ ] Co-occurrence frequency matrix
    - [ ] 7-day and 30-day trend data
    - [ ] Entity type distribution
    - [ ] Average position in articles (beginning/middle/end)

- [ ] Integrate more LLM infrastructure to run "tasks" against all articles in a cluster
  - [ ] Summarize the entire cluster into a neutral single summary.
  - [ ] Identify notable 'unique' aspects and notable ommissions against the cluster for each article. 
  - [ ] Identify political leaning to party ideology in the particular country.
  - [ ] Fear-mongering and sensationalism index.
  - [ ] Tagging of NERs and topics.
  - [ ] Run only against most relevant cluster.
    - Use current `importanceScore` ranking as the selector (top 1 cluster per active category/date by default).
- [ ] Add news cluster page which shows one cluster in more detail:
  - Summary of the cluster as a whole.
  - How many sources? Which sources? Which countries? Which languages?
  - Sections for the tasks:
    - Notable unique aspects.
    - Notable omissions.
    - Poltical leanings.
    - Fear-mongering and sensationalism index.
    - NER and topic tags.

### Milestone 2 Execution Rules

- OpenRouter failures must not block ingestion: retry with backoff (`5s`, `15s`, `60s`), then mark the record as `keywords_pending`.
- Reprocessing job should target only records with missing OpenRouter outputs (`keywords_pending` or null keyword fields).
- Notebook export must read from Postgres only; no direct export from raw Kagi snapshot folders.
- **Background Information Feature Rules:**
  - Wikipedia API failures must not block article ingestion: cache failures locally and retry with backoff
  - Entity processing should run as an asynchronous background job, not blocking the main ingestion pipeline
  - NER confidence scores below 0.6 should be marked as `pending_review` for manual verification
  - Duplicate entities (same name, different cases) should be automatically merged
  - Entity statistics should be updated daily, with trending data cached for 30 days

### Milestone 2 Acceptance Criteria

- `pnpm kagi:ingest` completes without manual intervention and logs OpenRouter success/failure counts.
- At least 95% of imported articles have keyword tags after one ingest run plus one retry pass.
- Duplicate-text handling removes or links near-identical article bodies across different URLs/domains.
- Cluster detail page renders summary, source/country/language counts, and task sections from stored DB results.
- V2 cluster tasks run only on clusters selected by the existing `importanceScore` rule.
- **Background Information Feature Acceptance Criteria:**
  - All articles have named entities extracted with spaCy (PERSON, GPE, ORG, EVENT types)
  - At least 80% of recognized entities are successfully linked to Wikipedia with cached summaries
  - Entity detail API returns quantified statistics: total mentions, unique articles, 7/30-day trends, co-occurrence matrix
  - Frontend displays highlighted entities in article text with clickable tooltips showing Wikipedia summary
  - Entity modal shows at least 5 key metrics: mentions trend, co-occurrences, article type distribution, temporal trends (7/30-day), related entities
  - Background entity update job runs successfully every 6 hours without blocking ingestion
  - Performance: Entity processing adds <500ms per article (batched operations)

## Milestone 2.5: Background Information Feature (Named Entity Recognition + Wikipedia Linking)

### Architecture Overview

**Data Pipeline:**
1. Article text → spaCy NER → Named entity candidates (PERSON, GPE, ORG, EVENT)
2. Entity candidates → Wikipedia/Wikidata API → Linked entities with metadata
3. Entity links + article context → Database storage (NamedEntity, EntityMention)
4. Batch statistics job → Calculate co-occurrences, trends, metrics → EntityStatistics table

**API Layer:**
- `/api/articles/:articleId/entities` - Return entity mentions in specific article
- `/api/entities/:entityId` - Return detailed entity with quantified statistics
- `/api/entities/search?q=query` - Search and filter entities

**Frontend Layer:**
- Article text → Highlight entity spans → Show tooltip on hover → Modal on click
- Modal displays: Wikipedia summary, entity image, statistics (mentions, trends, co-occurrences)

### Technology Stack

**Backend:**
- spaCy (en_core_web_md) for NER - fast, accurate, language-specific
- Wikipedia API + Wikidata API for entity linking and metadata
- PostgreSQL for entity and statistics storage
- Node.js TypeScript for service layer

**Frontend:**
- Svelte components for highlighting and interactive displays
- chart.js or plotly.js for trend visualization
- Tailwind CSS for styling

### Quantifiable Metrics (Non-LLM Based)

1. **Frequency Metrics:**
   - Total mentions (global)
   - Mentions in past 7/30 days
   - Unique articles containing entity
   - Average mentions per article

2. **Relationship Metrics:**
   - Co-occurrence frequency matrix (which entities appear together)
   - Top 10 related entities per entity
   - Strength score (0-1) for each relationship

3. **Distribution Metrics:**
   - Entity type distribution (PERSON/GPE/ORG/EVENT)
   - Article category distribution
   - Language distribution
   - Source/domain distribution

4. **Temporal Metrics:**
   - 7-day trend data (daily mention count)
   - 30-day trend data (daily mention count)
   - First mention date
   - Last mention date
   - Velocity (acceleration in mention rate)

5. **Quality Metrics:**
   - NER confidence scores (0-1)
   - Wikipedia link status (linked/pending/failed)
   - Entity disambiguation (if multiple Wikipedia entries exist)

### Key Implementation Details

**Entity Recognition (spaCy):**
- Use en_core_web_md (medium) or en_core_web_lg (large for better accuracy)
- Extract: PERSON, GPE (locations), ORG (organizations), EVENT (events)
- Store confidence scores for each recognized entity
- Mark low-confidence entities (<0.6) for manual review

**Wikipedia Linking:**
- Use MediaWiki Search API for initial lookup
- Implement fuzzy matching for partial matches
- Cache results in NamedEntity table to avoid redundant API calls
- Handle disambiguation pages (if multiple Wikipedia entries)
- Rate limit: 1 request per 100ms to respect Wikipedia API guidelines

**Statistics Calculation:**
- Run as background job every 6 hours
- Batch process: Calculate co-occurrences, update trends, aggregate metrics
- Use window functions (SQL) for efficient time-series calculations
- Maintain 30-day rolling window of daily statistics

**Database Indexing:**
- EntityMention.entityId, EntityMention.articleId
- EntityStatistics.entityId
- NamedEntity.name (for search)
- Create materialized views for frequently accessed aggregations

### File Structure

```
Backend:
apps/api/src/
  ├── services/
  │   ├── entity-recognition.ts      (NER using spaCy)
  │   ├── entity-linker.ts           (Wikipedia API integration)
  │   ├── entity-statistics.ts       (Statistics calculation)
  │   └── entity-query.ts            (DB queries)
  ├── scripts/
  │   ├── process-entities.ts        (Batch process articles)
  │   └── update-entity-stats.ts     (Periodic statistics update)
  ├── workers/
  │   └── entity-update.ts           (Background job)
  └── routes/
      └── api.ts                     (New entity endpoints)

Frontend:
apps/web/src/
  ├── components/
  │   ├── ArticleContent.svelte      (Text with highlighted entities)
  │   ├── EntityMention.svelte       (Highlighted span)
  │   └── EntityDetailModal.svelte   (Entity detail view)
  └── styles/
      └── entities.css               (Styling)

Database:
packages/db/prisma/
  ├── schema.prisma                  (New entity tables)
  └── migrations/
      └── add-entities.sql           (Migration)
```

### Testing Strategy

1. **Unit Tests:**
   - entity-recognition: Test NER on sample texts
   - entity-linker: Test Wikipedia lookup and caching
   - entity-statistics: Test metric calculations

2. **Integration Tests:**
   - Full pipeline: Article → NER → Linking → Stats → DB → API
   - Test on 100+ articles from different dates

3. **Performance Tests:**
   - Measure entity processing time per article
   - Target: <500ms per article (batched)
   - Test scalability with 1000+ articles

4. **Quality Tests:**
   - Compare NER results with manual annotations (sample 50 articles)
   - Verify Wikipedia linking accuracy (at least 80% successfully linked)
   - Check statistics correctness (sample calculations against raw data)

## Additional Product Requirements

- deduplicate substantially identical article text even when it appears under different URLs or domains
- preserve both original and final publisher URLs during extraction and export workflows
- keep UI ranking based on importance rather than raw source-count density alone
- keep notebook and app datasets reasonably synchronized so the research workflow reflects what the product shows

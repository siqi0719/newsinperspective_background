# Notebooks

This workspace is for exploratory NLP analysis on slices of data exported from the running app.

## Files

- `src/export_news_slice.py`: exports one date slice from the app API into flat JSONL tables
- `src/consolidate_kagi_exports.py`: optional snapshot flattener for legacy saved Kagi exports
- `templates/nlp_analysis.py`: Jupytext notebook template for shared analysis workflows
- `nlp_analysis.ipynb`: Colab-ready notebook entrypoint that reads `MyDrive/NewsInPerspective/news.jsonl`
- `requirements.txt`: Python dependencies for notebook work
- `news.jsonl`: denormalized article-level export written next to the notebook

## Setup

```bash
uv venv
source .venv/bin/activate
uv sync
uv pip install -r notebooks/requirements.txt
```

`source .venv/bin/activate` is required before running notebook tooling such as `jupytext`,
`jupyter`, or `pnpm drive:push`, because the push step rebuilds the shared `.ipynb`.

## Google Drive Sync

The notebooks workspace can be synced to Google Drive in either of two ways:

1. Mounted Drive folder:
   Set `NEWS_NOTEBOOKS_DRIVE_DIR` in `.drive-sync.env`
2. `rclone` remote:
   Set `NEWS_NOTEBOOKS_GDRIVE_REMOTE` and `NEWS_NOTEBOOKS_GDRIVE_PATH`

Bootstrap:

```bash
cp .drive-sync.env.example .drive-sync.env
```

Then use:

```bash
pnpm drive:status
pnpm drive:push
pnpm drive:pull
```

These commands sync the notebook workspace needed in Drive. The main shared files are
`nlp_analysis.ipynb` and `news.jsonl` at the root of the synced folder. `pnpm drive:push`
rebuilds the `.ipynb` from `templates/nlp_analysis.py` before syncing, so Colab always
gets the current notebook.
The intended shared Drive location is `MyDrive/NewsInPerspective`.

## Export a date slice

The backend must be running and have data for the date you want to analyze.

If you want original article text instead of just RSS title/summary fields, enrich that slice first:

```bash
pnpm enrich:text 2026-04-04 100
```

This enriches up to `100` articles for that date by fetching the publisher page, extracting readable article text, and storing it on the article record.

```bash
python notebooks/src/export_news_slice.py \
  --date 2026-04-04 \
  --api-base http://localhost:4400 \
  --output-dir notebooks
```

This writes `notebooks/news.jsonl`.

Each row is one article with denormalized cluster/story fields alongside article-level text,
signals, and metadata. The cluster UUID is exported as `cluster_id`. Kagi's numeric cluster
label is only kept as `kagi_cluster_number` where available.

## Export from database (recommended)

Generate `notebooks/news.jsonl` directly from Postgres:

```bash
pnpm export:kagi:notebook
```

Optional arguments:

```bash
pnpm export:kagi:notebook 2026-04-04 /tmp/news.jsonl
```

## Consolidate saved Kagi exports (legacy)

If you have already saved Kagi random-cluster exports, you can flatten all existing `cluster.json` files into `news.jsonl`:

```bash
pnpm export:kagi:snapshots
```

This scans:

- `notebooks/exports/kagi-random`
- `apps/api/notebooks/exports/kagi-random`

and writes:

- `notebooks/news.jsonl`

You can also override the scan roots manually:

```bash
python notebooks/src/consolidate_kagi_exports.py \
  --input-root apps/api/notebooks/exports/kagi-random \
  --input-root notebooks/exports/kagi-random \
  --output-dir notebooks
```

## Use the notebook template

Open `notebooks/nlp_analysis.ipynb` directly in Colab, or keep using the Jupytext source.
In Colab, the notebook mounts Drive and reads `MyDrive/NewsInPerspective/news.jsonl`.

```bash
source .venv/bin/activate
jupytext --to ipynb notebooks/templates/nlp_analysis.py
jupyter lab notebooks/nlp_analysis.ipynb
```

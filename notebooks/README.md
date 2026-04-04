# Notebooks

This workspace is for exploratory NLP analysis on slices of data exported from the running app.

## Files

- `src/export_news_slice.py`: exports one date slice from the app API into flat JSONL tables
- `templates/nlp_analysis.py`: Jupytext notebook template for shared analysis workflows
- `requirements.txt`: Python dependencies for notebook work
- `exports/`: default export destination for generated datasets

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r notebooks/requirements.txt
```

## Export a date slice

The backend must be running and have data for the date you want to analyze.

```bash
python notebooks/src/export_news_slice.py \
  --date 2026-04-04 \
  --api-base http://localhost:4400 \
  --output-dir notebooks/exports/2026-04-04
```

This writes:

- `metadata.json`
- `stories.jsonl`
- `articles.jsonl`
- `comparisons.jsonl`

Each JSONL file can be loaded directly into pandas with `pd.read_json(..., lines=True)`.

## Use the notebook template

```bash
jupytext --to ipynb notebooks/templates/nlp_analysis.py
jupyter lab notebooks/templates/nlp_analysis.ipynb
```

Or open the `.py` file directly in JupyterLab with the Jupytext extension installed.

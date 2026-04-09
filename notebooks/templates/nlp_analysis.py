# ---
# jupyter:
#   jupytext:
#     formats: py:percent,ipynb
#     text_representation:
#       extension: .py
#       format_name: percent
#       format_version: '1.3'
#       jupytext_version: 1.16.7
#   kernelspec:
#     display_name: Python 3
#     language: python
#     name: python3
# ---

# %% [markdown]
# # News In Perspective NLP Analysis
#
# Shared notebook template for team analysis on exported app data.
#
# Example notebook:
# 1. Export from Postgres with `pnpm export:kagi:notebook`
# 2. Sync the workspace to `MyDrive/NewsInPerspective`
# 3. Open `notebooks/nlp_analysis.ipynb` in Colab or run this template locally
#
# Colab path requirement:
# - This notebook expects the shared folder at `MyDrive/NewsInPerspective`
# - If your Drive path differs, update `WORKSPACE_DIR` in the setup cell below
# - This notebook expects `news.jsonl` next to the notebook file

# %%
from __future__ import annotations

import json
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
from IPython.display import display
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer

# %%
# Mount Google Drive in Colab and point the notebook at the shared folder.
from google.colab import drive  # type: ignore

drive.mount("/content/drive")

WORKSPACE_DIR = Path("/content/drive/MyDrive/NewsInPerspective")

NEWS_FILE = WORKSPACE_DIR / "news.jsonl"

# %%
# Load the single denormalized export file used throughout the notebook.
news_df = pd.read_json(NEWS_FILE, lines=True)
news_df["full_text"] = news_df["full_text"].fillna("")
news_df["analysis_text"] = news_df["analysis_text"].fillna("").str.strip()
news_df["published_at"] = pd.to_datetime(news_df["published_at"], errors="coerce")

# Backfill optional columns so older exports do not crash the example notebook.
for column in ["category", "region", "date"]:
    if column not in news_df.columns:
        news_df[column] = None

print(f"articles: {len(news_df)}")
print(f"articles with full text: {int(news_df['full_text_available'].sum())}")

# %% [markdown]
# ## Cluster View
# Example: derive one cluster-level table from the article-level export.

# %%
# Convert the exported date column into a real datetime before aggregation.
news_df["date"] = pd.to_datetime(news_df["date"], errors="coerce")


def first_non_null(series: pd.Series):
    """Return the first non-null value in a series, if one exists."""
    non_null = series.dropna()
    return non_null.iloc[0] if not non_null.empty else None


# Build one row per cluster and derive the time window from the article dates.
clusters_df = (
    news_df.groupby("cluster_id", dropna=False)
    .agg(
        cluster_title=("cluster_title", "first"),
        cluster_source_count=("cluster_source_count", "max"),
        cluster_article_count=("cluster_article_count", "max"),
        category=("category", first_non_null),
        region=("region", first_non_null),
        date_from=("date", "min"),
        date_until=("date", "max"),
    )
    .reset_index()
)

print(f"clusters: {clusters_df['cluster_id'].nunique()}")

# %% [markdown]
# ## Example: quick overview

# %%
clusters_df.sort_values(["cluster_source_count", "cluster_article_count"], ascending=False).head(10)

# %%
# Example: compare domain coverage and extracted-text volume.
news_df.groupby("domain").agg(
    article_count=("url", "count"),
    full_text_articles=("full_text_available", "sum"),
    mean_full_text_length=("full_text_length", "mean"),
).sort_values("article_count", ascending=False).head(15)

# %%
# Example: inspect how much of the corpus has extracted full text.
news_df["full_text_available"].value_counts(dropna=False)

# %% [markdown]
# ## Example: extraction quality

# %%
# Example: group by extraction result to see where scraping worked or failed.
quality_df = (
    news_df.groupby("extraction_status")
    .agg(article_count=("url", "count"), mean_text_length=("full_text_length", "mean"))
    .sort_values("article_count", ascending=False)
)

display(quality_df)
quality_df["article_count"].plot(kind="bar", title="Extraction status distribution")
plt.ylabel("Articles")
plt.tight_layout()

# %% [markdown]
# ## Example: failed extraction URLs
# These are example source URLs where browser-based extraction failed, so teammates can inspect them manually.

# %%
failed_examples_df = (
    news_df.loc[
        news_df["extraction_status"] == "FAILED",
        ["domain", "original_url", "final_url", "url", "extraction_error"],
    ]
    .drop_duplicates()
    .head(15)
    .reset_index(drop=True)
)

print(f"failed extraction examples: {len(failed_examples_df)}")
display(failed_examples_df)

# %% [markdown]
# ## Example: bi-gram analysis

# %%
# Build a text corpus from the denormalized analysis text column.
corpus = news_df["analysis_text"].loc[news_df["analysis_text"].str.len() > 0]

bigram_vectorizer = CountVectorizer(
    stop_words="english",
    ngram_range=(2, 2),
    min_df=2,
)
bigram_matrix = bigram_vectorizer.fit_transform(corpus)

bigram_counts = (
    pd.DataFrame(
        {
            "bigram": bigram_vectorizer.get_feature_names_out(),
            "count": bigram_matrix.sum(axis=0).A1,
        }
    )
    .sort_values("count", ascending=False)
    .reset_index(drop=True)
)

bigram_counts.head(25)

# %% [markdown]
# ## Example: TF-IDF terms
# This highlights terms that are distinctive in the current slice.

# %%
tfidf_vectorizer = TfidfVectorizer(
    stop_words="english",
    ngram_range=(1, 2),
    min_df=2,
    max_df=0.85,
)
tfidf_matrix = tfidf_vectorizer.fit_transform(corpus)
tfidf_scores = tfidf_matrix.mean(axis=0).A1

tfidf_df = (
    pd.DataFrame(
        {
            "term": tfidf_vectorizer.get_feature_names_out(),
            "mean_tfidf": tfidf_scores,
        }
    )
    .sort_values("mean_tfidf", ascending=False)
    .reset_index(drop=True)
)

tfidf_df.head(30)

# %% [markdown]
# ## Example: per-domain distinctive terms

# %%
# Look at the most frequent domains in the export first.
top_domains = news_df["domain"].value_counts().head(5).index.tolist()
print("Top domains:", top_domains)

for domain in top_domains:
    # Restrict to one domain and drop empty rows before vectorization.
    domain_text = news_df.loc[news_df["domain"] == domain, "analysis_text"]
    domain_text = domain_text.loc[domain_text.str.len() > 0]
    if len(domain_text) == 0:
        print(f"\nSkipping {domain}: no analysis_text rows")
        continue

    try:
        domain_vectorizer = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2),
            min_df=1,
            max_df=1.0,
        )
        domain_matrix = domain_vectorizer.fit_transform(domain_text)
        domain_scores = domain_matrix.mean(axis=0).A1
        domain_terms = (
            pd.DataFrame(
                {
                    "term": domain_vectorizer.get_feature_names_out(),
                    "score": domain_scores,
                }
            )
            .sort_values("score", ascending=False)
            .head(10)
        )
    except ValueError as error:
        print(f"\nSkipping {domain}: {error}")
        continue

    print(f"\nTop TF-IDF terms for {domain}")
    display(domain_terms)

# %% [markdown]
# ## Suggested next analyses
#
# - Compare bigrams or TF-IDF terms by category or region
# - Measure domain-level framing differences on the same story
# - Build your own sentiment model and compare it to the exported app sentiment
# - Add topic modeling or embeddings once the dataset and workflow settle

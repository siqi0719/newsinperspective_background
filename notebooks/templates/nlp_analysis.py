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
# Before running:
# 1. Start the backend and export a date slice with `python notebooks/src/export_news_slice.py --date YYYY-MM-DD`
# 2. Set `EXPORT_DIR` below to the generated directory

# %%
from __future__ import annotations

import json
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
from IPython.display import display
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer

# %%
EXPORT_DIR = Path("notebooks/exports/2026-04-04")

# %%
metadata = json.loads((EXPORT_DIR / "metadata.json").read_text(encoding="utf-8"))
stories_df = pd.read_json(EXPORT_DIR / "stories.jsonl", lines=True)
articles_df = pd.read_json(EXPORT_DIR / "articles.jsonl", lines=True)
comparisons_df = pd.read_json(EXPORT_DIR / "comparisons.jsonl", lines=True)

articles_df["summary"] = articles_df["summary"].fillna("")
articles_df["analysis_text"] = articles_df["analysis_text"].fillna("").str.strip()
articles_df["published_at"] = pd.to_datetime(articles_df["published_at"], errors="coerce")

print(metadata)
print(f"stories: {len(stories_df)}")
print(f"articles: {len(articles_df)}")
print(f"comparisons: {len(comparisons_df)}")

# %% [markdown]
# ## Quick slice overview

# %%
articles_df[["story_title", "domain", "sentiment", "subjectivity"]].head(10)

# %%
articles_df.groupby("domain").agg(
    article_count=("article_id", "count"),
    mean_sentiment=("sentiment", "mean"),
    mean_subjectivity=("subjectivity", "mean"),
).sort_values("article_count", ascending=False).head(15)

# %%
articles_df.groupby("category").agg(
    article_count=("article_id", "count"),
    mean_sentiment=("sentiment", "mean"),
).sort_values("article_count", ascending=False)

# %% [markdown]
# ## Sample sentiment analysis
#
# This uses the app's exported sentiment score as the baseline signal.

# %%
sentiment_by_domain = (
    articles_df.groupby("domain")
    .agg(article_count=("article_id", "count"), mean_sentiment=("sentiment", "mean"))
    .query("article_count >= 3")
    .sort_values("mean_sentiment")
)

sentiment_by_domain.tail(15).plot(
    kind="barh",
    y="mean_sentiment",
    figsize=(10, 7),
    legend=False,
    title="Average sentiment by domain",
)
plt.xlabel("Mean sentiment")
plt.tight_layout()

# %% [markdown]
# ## Bi-gram analysis

# %%
corpus = articles_df["analysis_text"].loc[articles_df["analysis_text"].str.len() > 0]

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
# ## TF-IDF terms
#
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
# ## Per-domain distinctive terms

# %%
top_domains = articles_df["domain"].value_counts().head(5).index.tolist()

for domain in top_domains:
    domain_text = articles_df.loc[articles_df["domain"] == domain, "analysis_text"]
    domain_text = domain_text.loc[domain_text.str.len() > 0]
    if len(domain_text) < 2:
        continue

    domain_vectorizer = TfidfVectorizer(
        stop_words="english",
        ngram_range=(1, 2),
        min_df=1,
        max_df=0.9,
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

    print(f"\nTop TF-IDF terms for {domain}")
    display(domain_terms)

# %% [markdown]
# ## Suggested next analyses
#
# - Compare bigrams or TF-IDF terms by category or region
# - Measure domain-level framing differences on the same story
# - Build your own sentiment model and compare it to the exported app sentiment
# - Add topic modeling or embeddings once the dataset and workflow settle

#!/usr/bin/env python3
"""Export one story-date slice from the app API into a single denormalized news.jsonl file.

The exporter is intentionally API-based so the notebook workflow stays stable
even if backend storage changes. It pulls:
- `/api/facets?date=...`
- `/api/stories?date=...`
- `/api/stories/:id`
- `/api/stories/:id/comparison`
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import urlopen


@dataclass(frozen=True)
class ExportConfig:
    api_base: str
    date: str
    output_dir: Path
    timeout_seconds: int


def fetch_json(api_base: str, path: str, timeout_seconds: int) -> Any:
    url = f"{api_base.rstrip('/')}{path}"
    try:
        with urlopen(url, timeout=timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise RuntimeError(f"Request failed for {url}: HTTP {exc.code}") from exc
    except URLError as exc:
        raise RuntimeError(f"Request failed for {url}: {exc.reason}") from exc


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def build_article_row(story: dict[str, Any], article: dict[str, Any], article_comparison: dict[str, Any] | None) -> dict[str, Any]:
    summary = article.get("summary")
    content_snippet = article.get("contentSnippet")
    full_text = article.get("fullText")
    analysis_source = full_text or content_snippet or summary or article["title"]
    analysis_text = " ".join(
        part.strip()
        for part in [article["title"], analysis_source or ""]
        if part and part.strip()
    )
    return {
        "cluster_id": story["id"],
        "cluster_title": story["title"],
        "cluster_article_count": story["articleCount"],
        "cluster_source_count": story["sourceCount"],
        "cluster_top_domains": story.get("topDomains", []),
        "cluster_keywords": story.get("keywords", []),
        "date": story["date"],
        "region": story.get("region"),
        "category": story.get("category"),
        "article_id": article["id"],
        "article_title": article["title"],
        "url": article["url"],
        "domain": article["domain"],
        "source_name": article["sourceName"],
        "published_at": article["publishedAt"],
        "summary": summary,
        "content_snippet": content_snippet,
        "full_text": full_text,
        "text_extraction_status": article.get("textExtractionStatus"),
        "full_text_available": bool(full_text),
        "keywords": article.get("keywords", []),
        "syndicated_domains": article.get("syndicatedDomains", []),
        "bias_signals": article.get("biasSignals", []),
        "sentiment": article.get("sentiment", 0 if article_comparison is None else article_comparison.get("sentiment", 0)),
        "subjectivity": article.get("subjectivity", 0 if article_comparison is None else article_comparison.get("subjectivity", 0)),
        "shared_keywords": [] if article_comparison is None else article_comparison.get("sharedKeywords", []),
        "analysis_text": analysis_text,
    }


def export_slice(config: ExportConfig) -> dict[str, Any]:
    facets = fetch_json(config.api_base, f"/api/facets?date={quote(config.date)}", config.timeout_seconds)
    stories = fetch_json(config.api_base, f"/api/stories?date={quote(config.date)}", config.timeout_seconds)

    article_rows: list[dict[str, Any]] = []

    for story_summary in stories:
        story = fetch_json(
            config.api_base,
            f"/api/stories/{quote(story_summary['id'])}",
            config.timeout_seconds,
        )
        comparison = fetch_json(
            config.api_base,
            f"/api/stories/{quote(story_summary['id'])}/comparison",
            config.timeout_seconds,
        )
        comparison_by_article_id = {
            row["articleId"]: row for row in comparison.get("articleComparisons", [])
        }

        for article in story.get("articles", []):
            article_rows.append(build_article_row(story, article, comparison_by_article_id.get(article["id"])))

    metadata = {
        "date": config.date,
        "api_base": config.api_base,
        "cluster_count": len(stories),
        "article_count": len(article_rows),
        "regions": facets.get("regions", []),
        "categories": facets.get("categories", []),
        "output_file": str(config.output_dir / "news.jsonl"),
    }

    write_jsonl(config.output_dir / "news.jsonl", article_rows)

    return metadata


def parse_args() -> ExportConfig:
    parser = argparse.ArgumentParser(description="Export one date slice from the News In Perspective API.")
    parser.add_argument("--date", required=True, help="Date to export in YYYY-MM-DD format.")
    parser.add_argument("--api-base", default="http://localhost:4400", help="Base URL of the running API.")
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Directory for exported files. Defaults to notebooks.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=30,
        help="Per-request timeout in seconds.",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir) if args.output_dir else Path("notebooks")

    return ExportConfig(
        api_base=args.api_base,
        date=args.date,
        output_dir=output_dir,
        timeout_seconds=args.timeout_seconds,
    )


def main() -> None:
    config = parse_args()
    metadata = export_slice(config)
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()

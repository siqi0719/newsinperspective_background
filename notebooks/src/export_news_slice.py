#!/usr/bin/env python3
"""Export one story-date slice from the app API into flat JSONL files.

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


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def build_story_row(story: dict[str, Any]) -> dict[str, Any]:
    return {
        "story_id": story["id"],
        "date": story["date"],
        "title": story["title"],
        "region": story.get("region"),
        "category": story.get("category"),
        "article_count": story["articleCount"],
        "source_count": story["sourceCount"],
        "top_domains": story.get("topDomains", []),
        "keywords": story.get("keywords", []),
    }


def build_article_row(story: dict[str, Any], article: dict[str, Any]) -> dict[str, Any]:
    summary = article.get("summary")
    analysis_text = " ".join(part.strip() for part in [article["title"], summary or ""] if part and part.strip())
    return {
        "story_id": story["id"],
        "story_title": story["title"],
        "date": story["date"],
        "region": story.get("region"),
        "category": story.get("category"),
        "article_id": article["id"],
        "title": article["title"],
        "url": article["url"],
        "domain": article["domain"],
        "source_name": article["sourceName"],
        "published_at": article["publishedAt"],
        "summary": summary,
        "keywords": article.get("keywords", []),
        "syndicated_domains": article.get("syndicatedDomains", []),
        "bias_signals": article.get("biasSignals", []),
        "sentiment": article.get("sentiment", 0),
        "subjectivity": article.get("subjectivity", 0),
        "analysis_text": analysis_text,
    }


def build_comparison_row(story: dict[str, Any], comparison: dict[str, Any], article_comparison: dict[str, Any]) -> dict[str, Any]:
    return {
        "story_id": story["id"],
        "story_title": story["title"],
        "date": story["date"],
        "category": story.get("category"),
        "region": story.get("region"),
        "article_id": article_comparison["articleId"],
        "article_title": article_comparison["title"],
        "domain": article_comparison["domain"],
        "published_at": article_comparison["publishedAt"],
        "sentiment": article_comparison["sentiment"],
        "subjectivity": article_comparison["subjectivity"],
        "bias_signals": article_comparison.get("biasSignals", []),
        "shared_keywords": article_comparison.get("sharedKeywords", []),
        "story_shared_keywords": comparison.get("sharedKeywords", []),
        "common_entities": comparison.get("commonEntities", []),
        "domain_spread": comparison.get("domainSpread", []),
        "framing_summary": comparison.get("framingSummary", []),
    }


def export_slice(config: ExportConfig) -> dict[str, Any]:
    facets = fetch_json(config.api_base, f"/api/facets?date={quote(config.date)}", config.timeout_seconds)
    stories = fetch_json(config.api_base, f"/api/stories?date={quote(config.date)}", config.timeout_seconds)

    story_rows: list[dict[str, Any]] = []
    article_rows: list[dict[str, Any]] = []
    comparison_rows: list[dict[str, Any]] = []

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

        story_rows.append(build_story_row(story))

        for article in story.get("articles", []):
            article_rows.append(build_article_row(story, article))

        for article_comparison in comparison.get("articleComparisons", []):
            comparison_rows.append(build_comparison_row(story, comparison, article_comparison))

    metadata = {
        "date": config.date,
        "api_base": config.api_base,
        "story_count": len(story_rows),
        "article_count": len(article_rows),
        "comparison_row_count": len(comparison_rows),
        "regions": facets.get("regions", []),
        "categories": facets.get("categories", []),
    }

    write_json(config.output_dir / "metadata.json", metadata)
    write_jsonl(config.output_dir / "stories.jsonl", story_rows)
    write_jsonl(config.output_dir / "articles.jsonl", article_rows)
    write_jsonl(config.output_dir / "comparisons.jsonl", comparison_rows)

    return metadata


def parse_args() -> ExportConfig:
    parser = argparse.ArgumentParser(description="Export one date slice from the News In Perspective API.")
    parser.add_argument("--date", required=True, help="Date to export in YYYY-MM-DD format.")
    parser.add_argument("--api-base", default="http://localhost:4400", help="Base URL of the running API.")
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Directory for exported files. Defaults to notebooks/exports/<date>.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=30,
        help="Per-request timeout in seconds.",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir) if args.output_dir else Path("notebooks") / "exports" / args.date

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

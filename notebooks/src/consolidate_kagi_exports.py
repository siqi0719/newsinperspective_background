#!/usr/bin/env python3
"""Flatten saved Kagi cluster exports into a single denormalized news.jsonl file."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Consolidate saved Kagi cluster exports into a single news.jsonl file.")
    parser.add_argument(
        "--input-root",
        action="append",
        dest="input_roots",
        default=[],
        help="Root directory to scan for cluster.json files. Can be passed multiple times.",
    )
    parser.add_argument(
        "--output-dir",
        default="notebooks",
        help="Directory for consolidated output files.",
    )
    return parser.parse_args()


def default_input_roots() -> list[Path]:
    return [
        Path("notebooks/exports/kagi-random"),
        Path("notebooks/exports/kagi-top"),
        Path("apps/api/notebooks/exports/kagi-random"),
        Path("apps/api/notebooks/exports/kagi-top"),
    ]


def load_cluster_files(roots: list[Path]) -> list[Path]:
    cluster_files: list[Path] = []
    seen: set[Path] = set()

    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("cluster.json"):
            resolved = path.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            cluster_files.append(path)

    return sorted(cluster_files)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def build_rows(cluster_payload: dict[str, Any], source_path: Path) -> list[dict[str, Any]]:
    cluster = cluster_payload["chosenCluster"]
    sources = cluster_payload.get("sources", [])

    article_rows: list[dict[str, Any]] = []
    for source in sources:
        full_text = normalize_text(source.get("fullText"))
        analysis_text = full_text or normalize_text(source.get("title")) or ""
        article_rows.append(
            {
                "cluster_id": cluster.get("storyId"),
                "cluster_title": cluster.get("title"),
                "cluster_summary": cluster.get("shortSummary"),
                "cluster_source_count": cluster.get("sourceCount"),
                "cluster_article_count": cluster.get("articleCount"),
                "kagi_cluster_number": cluster.get("clusterNumber"),
                # Keep a notebook-friendly normalized cluster context on every row.
                "date": normalize_text(source.get("date", "")).split("T")[0] if normalize_text(source.get("date")) else None,
                "category": cluster.get("categoryName"),
                "region": None,
                "export_file": str(source_path),
                "generated_at": cluster_payload.get("generatedAt"),
                "batch_id": cluster.get("batchId"),
                "category_id": cluster.get("categoryId"),
                "category_name": cluster.get("categoryName"),
                "story_id": cluster.get("storyId"),
                "article_title": source.get("title"),
                "url": source.get("finalUrl") or source.get("redirectUrl") or source.get("originalUrl") or source.get("link"),
                "original_url": source.get("originalUrl") or source.get("link"),
                "final_url": source.get("finalUrl") or source.get("redirectUrl") or source.get("originalUrl") or source.get("link"),
                "domain": source.get("domain"),
                "published_at": source.get("date"),
                "author": normalize_text(source.get("author")),
                "image": normalize_text(source.get("image")),
                "image_caption": normalize_text(source.get("image_caption")),
                "extraction_status": source.get("extractionStatus"),
                "extraction_error": normalize_text(source.get("extractionError")),
                "extraction_format": normalize_text(source.get("extractionFormat")),
                "full_text": full_text,
                "full_text_length": source.get("fullTextLength", 0),
                "full_text_available": bool(full_text),
                "analysis_text": analysis_text,
            }
        )

    return article_rows


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def main() -> None:
    args = parse_args()
    roots = [Path(value) for value in args.input_roots] if args.input_roots else default_input_roots()
    cluster_files = load_cluster_files(roots)

    article_rows: list[dict[str, Any]] = []

    for cluster_file in cluster_files:
        payload = read_json(cluster_file)
        article_rows.extend(build_rows(payload, cluster_file))

    output_dir = Path(args.output_dir)
    metadata = {
        "input_roots": [str(root) for root in roots],
        "cluster_file_count": len(cluster_files),
        "cluster_count": len({row.get("cluster_id") for row in article_rows}),
        "article_count": len(article_rows),
        "output_file": str(output_dir / "news.jsonl"),
    }

    write_jsonl(output_dir / "news.jsonl", article_rows)

    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()

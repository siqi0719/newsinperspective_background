import { env } from "../config/env.js";
import { buildTextFingerprint } from "../domain/fingerprint.js";
import Parser from "rss-parser";
import { canonicalizeUrl, extractDomain } from "../domain/url.js";
import { NormalizedArticleInput } from "../domain/types.js";

const parser = new Parser({
  timeout: env.RSS_FETCH_TIMEOUT_MS,
});

interface ParsedFeedResult {
  articles: NormalizedArticleInput[];
  rawItems: unknown[];
}

export async function fetchFeedEntries(
  url: string,
  category: string | null,
  sourceName: string | null,
): Promise<ParsedFeedResult> {
  const feed = await parser.parseURL(url);
  const articles: NormalizedArticleInput[] = [];

  for (const item of feed.items ?? []) {
    if (!item.link || !item.title) continue;
    const canonicalUrl = canonicalizeUrl(item.link);
    const summary = item.contentSnippet ?? item.summary ?? null;
    const contentSnippet = item.content ?? item.contentSnippet ?? null;
    articles.push({
      originalUrl: item.link,
      canonicalUrl,
      textFingerprint: buildTextFingerprint(item.title.trim(), summary, contentSnippet),
      title: item.title.trim(),
      summary,
      contentSnippet,
      publishedAt: item.isoDate ? new Date(item.isoDate) : item.pubDate ? new Date(item.pubDate) : null,
      sourceName: sourceName ?? feed.title ?? extractDomain(canonicalUrl),
      domain: extractDomain(canonicalUrl),
      language: feed.language ?? null,
      category,
      authorNames: item.creator ? [item.creator] : item.author ? [item.author] : [],
    });
  }

  return {
    articles,
    rawItems: feed.items ?? [],
  };
}

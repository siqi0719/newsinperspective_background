import { env } from "../config/env.js";
import { FeedCandidate } from "../domain/types.js";

function isRssUrl(value: string): boolean {
  return /^https?:\/\//.test(value) && /(rss|feed|xml)/i.test(value);
}

function parseKiteFeedsCatalog(payload: unknown): FeedCandidate[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const found: FeedCandidate[] = [];

  for (const [category, value] of Object.entries(record)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    const feeds = Array.isArray(entry.feeds) ? entry.feeds : [];

    for (const feed of feeds) {
      if (typeof feed !== "string" || !isRssUrl(feed)) continue;
      found.push({
        url: feed,
        category,
        sourceName: null,
      });
    }
  }

  return found;
}

function walkCatalog(
  value: unknown,
  categoryPath: string[] = [],
  sourceName: string | null = null,
  found: FeedCandidate[] = [],
): FeedCandidate[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      walkCatalog(item, categoryPath, sourceName, found);
    }
    return found;
  }

  if (typeof value === "string") {
    if (isRssUrl(value)) {
      found.push({
        url: value,
        category: categoryPath.at(-1) ?? null,
        sourceName,
      });
    }
    return found;
  }

  if (!value || typeof value !== "object") {
    return found;
  }

  const record = value as Record<string, unknown>;
  const nextSourceName =
    typeof record.sourceName === "string"
      ? record.sourceName
      : typeof record.name === "string"
        ? record.name
        : sourceName;

  if (Array.isArray(record.feeds)) {
    for (const item of record.feeds) {
      walkCatalog(item, categoryPath, nextSourceName, found);
    }
  }

  for (const [key, child] of Object.entries(record)) {
    if (["feeds", "url", "name", "sourceName"].includes(key)) continue;
    walkCatalog(child, [...categoryPath, key], nextSourceName, found);
  }

  if (typeof record.url === "string") {
    walkCatalog(record.url, categoryPath, nextSourceName, found);
  }

  return found;
}

export async function fetchFeedCatalog(kiteUrl: string): Promise<FeedCandidate[]> {
  const response = await fetch(kiteUrl, {
    signal: AbortSignal.timeout(env.RSS_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch feed catalog: ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const directFeeds = parseKiteFeedsCatalog(payload);
  const feeds = directFeeds.length > 0 ? directFeeds : walkCatalog(payload);
  const unique = new Map<string, FeedCandidate>();

  for (const feed of feeds) {
    unique.set(feed.url, feed);
  }

  return [...unique.values()];
}

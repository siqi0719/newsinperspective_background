import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

interface CachedFaviconMeta {
  domain: string;
  sourceUrl: string;
  fetchedAt: string;
  contentType: string;
  size: number;
}

export interface CachedFavicon {
  domain: string;
  contentType: string;
  sourceUrl: string;
  fetchedAt: string;
  buffer: Buffer;
}

const CACHE_DIR = resolve(process.cwd(), ".cache", "favicons");
const FETCH_TIMEOUT_MS = 10_000;

function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
}

function validateDomain(domain: string): string {
  const normalized = normalizeDomain(domain);
  if (!/^[a-z0-9.-]+$/.test(normalized) || !normalized.includes(".")) {
    throw new Error(`Invalid domain: ${domain}`);
  }
  return normalized;
}

function cacheKey(domain: string): string {
  return createHash("sha1").update(domain).digest("hex");
}

function metaPath(domain: string): string {
  return resolve(CACHE_DIR, `${cacheKey(domain)}.json`);
}

function dataPath(domain: string): string {
  return resolve(CACHE_DIR, `${cacheKey(domain)}.bin`);
}

function faviconCandidates(domain: string): string[] {
  return [
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`,
    `https://${domain}/favicon.ico`,
  ];
}

async function fetchBuffer(url: string): Promise<{ contentType: string; buffer: Buffer } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) return null;

    const contentType = (response.headers.get("content-type") ?? "image/x-icon").split(";")[0]!.trim().toLowerCase();
    if (!contentType.startsWith("image/")) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 32) return null;

    return { contentType, buffer };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function readFromCache(domain: string): Promise<CachedFavicon | null> {
  try {
    const meta = JSON.parse(await readFile(metaPath(domain), "utf8")) as CachedFaviconMeta;
    const buffer = await readFile(dataPath(domain));
    if (!meta.contentType.startsWith("image/")) return null;

    return {
      domain,
      contentType: meta.contentType,
      sourceUrl: meta.sourceUrl,
      fetchedAt: meta.fetchedAt,
      buffer,
    };
  } catch {
    return null;
  }
}

async function writeToCache(domain: string, sourceUrl: string, contentType: string, buffer: Buffer): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const meta: CachedFaviconMeta = {
    domain,
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    contentType,
    size: buffer.length,
  };

  await writeFile(dataPath(domain), buffer);
  await writeFile(metaPath(domain), JSON.stringify(meta, null, 2), "utf8");
}

export async function getCachedFavicon(
  inputDomain: string,
  options: { forceRefresh?: boolean } = {},
): Promise<CachedFavicon | null> {
  const domain = validateDomain(inputDomain);
  const forceRefresh = options.forceRefresh ?? false;

  if (!forceRefresh) {
    const cached = await readFromCache(domain);
    if (cached) return cached;
  }

  for (const candidate of faviconCandidates(domain)) {
    const fetched = await fetchBuffer(candidate);
    if (!fetched) continue;

    await writeToCache(domain, candidate, fetched.contentType, fetched.buffer);
    return {
      domain,
      contentType: fetched.contentType,
      sourceUrl: candidate,
      fetchedAt: new Date().toISOString(),
      buffer: fetched.buffer,
    };
  }

  return null;
}

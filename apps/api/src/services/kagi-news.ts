import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { Browser, chromium } from "playwright";

export interface KagiBatchCategoriesResponse {
  batchId: string;
  createdAt: string;
  categories: Array<{
    id: string;
    categoryId: string;
    categoryName: string;
    readCount: number;
    clusterCount: number;
  }>;
}

export interface KagiStoryArticle {
  title: string;
  link: string;
  domain: string;
  date?: string | undefined;
}

export interface KagiStory {
  id: string;
  cluster_number: number;
  title: string;
  short_summary: string;
  category?: string | undefined;
  unique_domains?: number | undefined;
  number_of_titles?: number | undefined;
  articles: KagiStoryArticle[];
}

interface KagiStoriesResponse {
  batchId: string;
  categoryId: string;
  categoryName: string;
  totalStories: number;
  stories: KagiStory[];
}

const KAGI_API_BASE = "https://news.kagi.com/api";
let kagiBrowserPromise: Promise<Browser> | null = null;
const CACHE_DIR = resolve(process.cwd(), ".cache", "kagi-api");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cachePathFor(url: string): string {
  const key = createHash("sha1").update(url).digest("hex");
  return resolve(CACHE_DIR, `${key}.json`);
}

async function getKagiBrowser(): Promise<Browser> {
  if (!kagiBrowserPromise) {
    kagiBrowserPromise = chromium
      .launch({
        headless: true,
      })
      .catch((error) => {
        kagiBrowserPromise = null;
        throw error;
      });
  }

  return kagiBrowserPromise;
}

export async function closeKagiBrowser(): Promise<void> {
  if (!kagiBrowserPromise) return;
  try {
    const browser = await kagiBrowserPromise;
    await browser.close();
  } finally {
    kagiBrowserPromise = null;
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${KAGI_API_BASE}${path}`;
  const cachePath = cachePathFor(url);

  try {
    const cached = JSON.parse(await readFile(cachePath, "utf8")) as { fetchedAt: number; bodyText: string };
    return JSON.parse(cached.bodyText) as T;
  } catch {}

  const browser = await getKagiBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await page.goto(url, {
          waitUntil: "commit",
          timeout: 30000,
        });
        const bodyText = await page.locator("body").textContent();
        if (!bodyText) {
          throw new Error(`Kagi API returned empty body for ${path}`);
        }

        if (bodyText.startsWith("429 ")) {
          throw new Error(`Kagi API rate limited request for ${path}: ${bodyText.slice(0, 80)}`);
        }

        const parsed = JSON.parse(bodyText) as T;
        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(cachePath, JSON.stringify({ fetchedAt: Date.now(), bodyText }), "utf8");
        return parsed;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < 3) {
          await sleep((attempt + 1) * 1500);
          continue;
        }
      }
    }

    throw lastError ?? new Error(`Kagi API request failed for ${path}`);
  } finally {
    await page.close();
    await context.close();
  }
}

export async function fetchLatestCategories(): Promise<KagiBatchCategoriesResponse> {
  return fetchJson<KagiBatchCategoriesResponse>("/batches/latest/categories");
}

export async function fetchLatestCategoryStories(categoryId: string, limit = 100): Promise<KagiStoriesResponse> {
  return fetchJson<KagiStoriesResponse>(`/batches/latest/categories/${encodeURIComponent(categoryId)}/stories?limit=${limit}`);
}

export interface KagiTopCluster {
  batchId: string;
  categoryId: string;
  categoryName: string;
  story: KagiStory;
}

export async function listTopClustersBySourceCount(limit = 10): Promise<KagiTopCluster[]> {
  const categories = await fetchLatestCategories();
  const categoryList = Array.isArray(categories.categories) ? categories.categories : [];

  if (categoryList.length === 0) {
    throw new Error(`Kagi categories response did not include a categories array: ${JSON.stringify(categories).slice(0, 500)}`);
  }

  const prioritizedCategories = categoryList
    .filter((category) => category.clusterCount > 0)
    .sort((left, right) => {
      const clusterDelta = right.clusterCount - left.clusterCount;
      if (clusterDelta !== 0) return clusterDelta;
      return right.readCount - left.readCount;
    })
    .slice(0, 30);

  const storyGroups: KagiTopCluster[][] = [];

  for (const category of prioritizedCategories) {
    try {
      const storiesResponse = await fetchLatestCategoryStories(category.id, Math.min(100, category.clusterCount || 100));
      const stories = Array.isArray(storiesResponse.stories) ? storiesResponse.stories : [];
      storyGroups.push(stories.map((story) => ({
        batchId: categories.batchId,
        categoryId: category.id,
        categoryName: category.categoryName,
        story,
      })));
      await sleep(250);
    } catch {}
  }

  return storyGroups
    .flat()
    .sort((left, right) => {
      const sourceDelta = (right.story.unique_domains ?? 0) - (left.story.unique_domains ?? 0);
      if (sourceDelta !== 0) return sourceDelta;
      return (right.story.articles.length ?? 0) - (left.story.articles.length ?? 0);
    })
    .slice(0, limit);
}

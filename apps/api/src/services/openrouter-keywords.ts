import { env } from "../config/env.js";

interface OpenRouterKeywordInput {
  title: string;
  summary: string | null;
  body: string | null;
  language: string | null;
  maxKeywords?: number;
  onAttemptLog?: (message: string) => void;
}

interface OpenRouterKeywordResult {
  keywords: string[];
  model: string;
  error: string | null;
}

const defaultFreeModels = [
  "qwen/qwen3.6-plus:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "qwen/qwen3-coder:free",
];
const openRouterTimeoutMs = 6_000;
const openRouterBackoffScheduleMs = [5_000, 15_000, 60_000];
const openRouterMaxBackoffMs = 120_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status < 600);
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;

  const numeric = Number(header);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return Math.floor(numeric * 1000);
  }

  const timestamp = Date.parse(header);
  if (Number.isNaN(timestamp)) return null;

  const delta = timestamp - Date.now();
  return delta > 0 ? delta : 0;
}

function computeBackoffMs(round: number, retryAfterMs: number | null): number {
  const scheduled = openRouterBackoffScheduleMs[round] ?? openRouterBackoffScheduleMs.at(-1) ?? 5_000;
  const base = retryAfterMs !== null ? Math.max(scheduled, retryAfterMs) : scheduled;
  const jitter = Math.floor(Math.random() * 1_500);
  return Math.min(base + jitter, openRouterMaxBackoffMs);
}

function rotateModels(models: string[], seed: string): string[] {
  if (models.length <= 1) return models;
  const hash = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const offset = hash % models.length;
  return [...models.slice(offset), ...models.slice(0, offset)];
}

function parseKeywordsFromResponse(content: string): string[] {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { keywords?: unknown };
    if (!Array.isArray(parsed.keywords)) return [];
    return parsed.keywords
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function extractKeywordsWithOpenRouter(
  input: OpenRouterKeywordInput,
): Promise<OpenRouterKeywordResult> {
  const log = input.onAttemptLog;
  const models = (
    env.OPENROUTER_MODEL
      ? env.OPENROUTER_MODEL.split(",").map((value) => value.trim())
      : defaultFreeModels
  ).filter((value): value is string => value.length > 0);
  const orderedModels = rotateModels(models, `${input.title}:${input.language ?? "unknown"}`);
  const primaryModel = models[0] ?? defaultFreeModels[0]!;
  const maxKeywords = input.maxKeywords ?? 8;

  if (!env.OPENROUTER_API_KEY) {
    return {
      keywords: [],
      model: primaryModel,
      error: "OPENROUTER_API_KEY missing",
    };
  }

  const prompt = [
    "Extract the most informative topical keywords from this news text.",
    "Return strict JSON only with this shape: {\"keywords\": [\"...\", \"...\"]}.",
    "Rules:",
    "- keep proper names if relevant",
    "- exclude stop words and generic discourse words",
    `- return at most ${maxKeywords} keywords`,
    "- preserve the text language",
    "",
    `Title: ${input.title}`,
    `Summary: ${input.summary ?? ""}`,
    `Body: ${input.body ?? ""}`,
  ].join("\n");

  let lastError = "OpenRouter request failed";
  const maxRounds = openRouterBackoffScheduleMs.length + 1;

  for (let round = 0; round < maxRounds; round += 1) {
    let sawRetryableError = false;
    let maxRetryAfterMs: number | null = null;
    log?.(`round ${round + 1}/${maxRounds}: trying ${orderedModels.length} model(s)`);

    for (const model of orderedModels) {
      log?.(`round ${round + 1}/${maxRounds}: -> model ${model}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), openRouterTimeoutMs);
      let response: Response | null = null;
      try {
        response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          }),
          signal: controller.signal,
        });
      } catch (error) {
        lastError = `OpenRouter request failed: ${error instanceof Error ? error.message : String(error)}`;
        log?.(`round ${round + 1}/${maxRounds}: ${model} network error: ${lastError.slice(0, 140)}`);
        sawRetryableError = true;
        continue;
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const details = await response.text();
        lastError = `OpenRouter error ${response.status}: ${details.slice(0, 240)}`;
        log?.(`round ${round + 1}/${maxRounds}: ${model} http ${response.status}`);
        if (isRetryableStatus(response.status)) {
          sawRetryableError = true;
          const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
          if (retryAfterMs !== null) {
            maxRetryAfterMs =
              maxRetryAfterMs === null ? retryAfterMs : Math.max(maxRetryAfterMs, retryAfterMs);
            log?.(
              `round ${round + 1}/${maxRounds}: ${model} retry-after ${Math.ceil(
                retryAfterMs / 1000,
              )}s`,
            );
          }
        }
        continue;
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content ?? "";
      const keywords = parseKeywordsFromResponse(content).slice(0, maxKeywords);

      if (keywords.length > 0) {
        log?.(`round ${round + 1}/${maxRounds}: ${model} success (${keywords.length} keywords)`);
        return {
          keywords,
          model,
          error: null,
        };
      }

      lastError = "No parseable keyword JSON in model response";
      log?.(`round ${round + 1}/${maxRounds}: ${model} parse failure`);
      sawRetryableError = true;
    }

    if (!sawRetryableError || round >= openRouterBackoffScheduleMs.length) {
      break;
    }

    const backoffMs = computeBackoffMs(round, maxRetryAfterMs);
    log?.(
      `round ${round + 1}/${maxRounds}: backing off for ${Math.ceil(backoffMs / 1000)}s before retry`,
    );
    await sleep(backoffMs);
  }

  return {
    keywords: [],
    model: primaryModel,
    error: lastError,
  };
}

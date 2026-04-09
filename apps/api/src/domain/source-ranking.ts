import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const defaultDatasetPath = resolve(moduleDir, "..", "..", "data", "domain_pc1.csv");

let cachedScores: Map<string, number> | null = null;
let datasetLoadedPath: string | null = null;

function normalizeDomain(input: string): string {
  const raw = input.trim().toLowerCase();
  if (!raw) return "";

  const candidate = raw.includes("://") ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return url.hostname.replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return raw
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
      .replace(/\.$/, "");
  }
}

function resolveDatasetPath(): string {
  const fromEnv = process.env.DOMAIN_QUALITY_DATA_PATH?.trim();
  if (fromEnv) return resolve(process.cwd(), fromEnv);

  const candidates = [
    defaultDatasetPath,
    resolve(process.cwd(), "data", "domain_pc1.csv"),
    resolve(process.cwd(), "apps", "api", "data", "domain_pc1.csv"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return defaultDatasetPath;
}

function loadDomainScores(): Map<string, number> {
  if (cachedScores) return cachedScores;

  const path = resolveDatasetPath();
  const map = new Map<string, number>();
  try {
    const raw = readFileSync(path, "utf8");
    const lines = raw.split(/\r?\n/);
    for (let index = 1; index < lines.length; index += 1) {
      const line = lines[index]?.trim();
      if (!line) continue;
      const separator = line.indexOf(",");
      if (separator <= 0) continue;

      const domain = normalizeDomain(line.slice(0, separator));
      const scoreValue = Number(line.slice(separator + 1).trim());
      if (!domain || !Number.isFinite(scoreValue)) continue;

      const score = Math.max(0, Math.min(1, scoreValue));
      map.set(domain, score);
    }
    datasetLoadedPath = path;
  } catch {
    datasetLoadedPath = null;
  }

  cachedScores = map;
  return map;
}

export function getDomainAuthorityDatasetStatus(): {
  path: string | null;
  loadedDomains: number;
} {
  const scores = loadDomainScores();
  return {
    path: datasetLoadedPath,
    loadedDomains: scores.size,
  };
}

export function scoreDomainAuthority(rawDomain: string): number {
  const domain = normalizeDomain(rawDomain);
  if (!domain) return 0;

  const scores = loadDomainScores();
  const exact = scores.get(domain);
  if (exact !== undefined) return exact;

  const labels = domain.split(".").filter(Boolean);
  for (let index = 1; index < labels.length - 1; index += 1) {
    const suffix = labels.slice(index).join(".");
    const suffixScore = scores.get(suffix);
    if (suffixScore !== undefined) {
      return suffixScore;
    }
  }

  return 0;
}

export function isGlobalTierDomain(value: string): boolean {
  return scoreDomainAuthority(value) >= 0.85;
}

export function computeAuthorityStats(domains: string[]): {
  average: number;
  best: number;
  globalTierCount: number;
} {
  const normalized = [...new Set(domains.map((domain) => normalizeDomain(domain)).filter(Boolean))];
  if (normalized.length === 0) {
    return {
      average: 0,
      best: 0,
      globalTierCount: 0,
    };
  }

  const scores = normalized.map((domain) => scoreDomainAuthority(domain));
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const best = scores.reduce((current, score) => Math.max(current, score), 0);
  const globalTierCount = normalized.filter((domain) => isGlobalTierDomain(domain)).length;

  return {
    average: Number(average.toFixed(4)),
    best,
    globalTierCount,
  };
}

import { createHash } from "node:crypto";
import { jaccardSimilarity, normalizeWhitespace } from "../domain/text.js";

export type DedupeStrategyId = "simhash" | "jaccard";

export interface DedupeDocumentInput {
  id: string;
  domain: string;
  title: string;
  summary?: string | null;
  body?: string | null;
  language?: string | null;
}

export interface DedupeMatch {
  leftId: string;
  rightId: string;
  score: number;
  strategy: DedupeStrategyId;
}

export interface DedupeGroup {
  groupId: string;
  memberIds: string[];
  domains: string[];
}

export interface DedupePlan {
  strategy: DedupeStrategyId;
  comparedCount: number;
  matchCount: number;
  groupCount: number;
  matchedArticleCount: number;
  groups: DedupeGroup[];
  updates: Array<{
    id: string;
    duplicateDomains: string[];
    duplicateCount: number;
  }>;
}

export interface DedupePlannerOptions {
  strategy?: DedupeStrategyId;
  minTextLength?: number;
  maxSimHashDistance?: number;
  simHashMinJaccardSimilarity?: number;
  minJaccardSimilarity?: number;
  mirrorDomainsOnAllMembers?: boolean;
}

interface PreparedDocument {
  id: string;
  domain: string;
  text: string;
  language: string | null;
}

interface DedupeStrategy {
  id: DedupeStrategyId;
  findMatches(docs: PreparedDocument[], options: Required<DedupePlannerOptions>): DedupeMatch[];
}

const defaultOptions: Required<DedupePlannerOptions> = {
  strategy: "simhash",
  minTextLength: 400,
  maxSimHashDistance: 3,
  simHashMinJaccardSimilarity: 0.9,
  minJaccardSimilarity: 0.88,
  mirrorDomainsOnAllMembers: true,
};

function normalizeForDedupe(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function joinText(parts: Array<string | null | undefined>): string {
  return parts
    .filter((value): value is string => Boolean(value && value.trim()))
    .join("\n\n");
}

function prepareDocuments(
  inputs: DedupeDocumentInput[],
  minTextLength: number,
): PreparedDocument[] {
  return inputs
    .map((item) => {
      const text = normalizeForDedupe(joinText([item.title, item.summary ?? null, item.body ?? null]));
      return {
        id: item.id,
        domain: item.domain.trim().toLowerCase(),
        text,
        language: item.language ?? null,
      };
    })
    .filter((item) => item.text.length >= minTextLength);
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function buildTermCounts(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function hashToken64(token: string): bigint {
  const hex = createHash("sha256").update(token).digest("hex").slice(0, 16);
  return BigInt(`0x${hex}`);
}

function buildSimHash(text: string): bigint {
  const terms = buildTermCounts(tokenize(text));
  const vector = new Array<number>(64).fill(0);

  for (const [token, weight] of terms.entries()) {
    const hashed = hashToken64(token);
    for (let bit = 0; bit < 64; bit += 1) {
      const mask = 1n << BigInt(bit);
      vector[bit] = (vector[bit] ?? 0) + ((hashed & mask) === 0n ? -weight : weight);
    }
  }

  let signature = 0n;
  for (let bit = 0; bit < 64; bit += 1) {
    if ((vector[bit] ?? 0) >= 0) {
      signature |= 1n << BigInt(bit);
    }
  }
  return signature;
}

function hammingDistance64(left: bigint, right: bigint): number {
  let distance = 0;
  let value = left ^ right;
  while (value !== 0n) {
    distance += Number(value & 1n);
    value >>= 1n;
  }
  return distance;
}

const simHashStrategy: DedupeStrategy = {
  id: "simhash",
  findMatches(docs, options) {
    const signatures = new Map(docs.map((doc) => [doc.id, buildSimHash(doc.text)]));
    const matches: DedupeMatch[] = [];

    for (let leftIndex = 0; leftIndex < docs.length; leftIndex += 1) {
      const left = docs[leftIndex]!;
      const leftSignature = signatures.get(left.id)!;
      for (let rightIndex = leftIndex + 1; rightIndex < docs.length; rightIndex += 1) {
        const right = docs[rightIndex]!;
        const rightSignature = signatures.get(right.id)!;
        const distance = hammingDistance64(leftSignature, rightSignature);
        if (distance > options.maxSimHashDistance) continue;
        const jaccard = jaccardSimilarity(
          left.text,
          right.text,
          left.language ?? right.language ?? null,
        );
        if (jaccard < options.simHashMinJaccardSimilarity) continue;
        const score = Number(((1 - distance / 64 + jaccard) / 2).toFixed(3));
        matches.push({
          leftId: left.id,
          rightId: right.id,
          score,
          strategy: "simhash",
        });
      }
    }

    return matches;
  },
};

const jaccardStrategy: DedupeStrategy = {
  id: "jaccard",
  findMatches(docs, options) {
    const matches: DedupeMatch[] = [];

    for (let leftIndex = 0; leftIndex < docs.length; leftIndex += 1) {
      const left = docs[leftIndex]!;
      for (let rightIndex = leftIndex + 1; rightIndex < docs.length; rightIndex += 1) {
        const right = docs[rightIndex]!;
        const similarity = jaccardSimilarity(left.text, right.text, left.language ?? right.language ?? null);
        if (similarity < options.minJaccardSimilarity) continue;
        matches.push({
          leftId: left.id,
          rightId: right.id,
          score: similarity,
          strategy: "jaccard",
        });
      }
    }

    return matches;
  },
};

class UnionFind {
  private parent = new Map<string, string>();

  makeSet(id: string): void {
    if (!this.parent.has(id)) {
      this.parent.set(id, id);
    }
  }

  find(id: string): string {
    const parent = this.parent.get(id);
    if (!parent) {
      this.parent.set(id, id);
      return id;
    }
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(left: string, right: string): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    this.parent.set(rightRoot, leftRoot);
  }
}

function buildGroups(
  docs: PreparedDocument[],
  matches: DedupeMatch[],
): DedupeGroup[] {
  const uf = new UnionFind();
  for (const doc of docs) {
    uf.makeSet(doc.id);
  }
  for (const match of matches) {
    uf.union(match.leftId, match.rightId);
  }

  const groupsByRoot = new Map<string, PreparedDocument[]>();
  for (const doc of docs) {
    const root = uf.find(doc.id);
    const bucket = groupsByRoot.get(root) ?? [];
    bucket.push(doc);
    groupsByRoot.set(root, bucket);
  }

  return [...groupsByRoot.values()]
    .filter((members) => members.length > 1)
    .map((members, index) => ({
      groupId: `dup-${index + 1}`,
      memberIds: members.map((member) => member.id),
      domains: [...new Set(members.map((member) => member.domain))],
    }));
}

function selectStrategy(id: DedupeStrategyId): DedupeStrategy {
  if (id === "jaccard") return jaccardStrategy;
  return simHashStrategy;
}

function buildUpdateMap(
  groups: DedupeGroup[],
  mirrorDomainsOnAllMembers: boolean,
): Map<string, string[]> {
  const updates = new Map<string, string[]>();

  for (const group of groups) {
    if (group.memberIds.length < 2) continue;
    if (mirrorDomainsOnAllMembers) {
      for (const memberId of group.memberIds) {
        const memberDomainSet = new Set(group.domains);
        updates.set(memberId, [...memberDomainSet]);
      }
      continue;
    }

    const canonicalId = group.memberIds[0]!;
    updates.set(canonicalId, group.domains);
  }

  return updates;
}

export function resolveDedupeStrategy(value: string | null | undefined): DedupeStrategyId {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "jaccard" ? "jaccard" : "simhash";
}

export function buildSoftDedupePlan(
  inputs: DedupeDocumentInput[],
  options?: DedupePlannerOptions,
): DedupePlan {
  const resolved: Required<DedupePlannerOptions> = {
    ...defaultOptions,
    ...options,
    strategy: options?.strategy ?? defaultOptions.strategy,
  };

  const docs = prepareDocuments(inputs, resolved.minTextLength);
  const strategy = selectStrategy(resolved.strategy);
  const matches = strategy.findMatches(docs, resolved);
  const groups = buildGroups(docs, matches);
  const updateMap = buildUpdateMap(groups, resolved.mirrorDomainsOnAllMembers);

  const updates = inputs.map((item) => {
    const candidateDomains = updateMap.get(item.id) ?? [];
    const duplicateDomains = candidateDomains
      .map((domain) => domain.trim().toLowerCase())
      .filter((domain) => Boolean(domain) && domain !== item.domain.trim().toLowerCase())
      .filter((domain, index, list) => list.indexOf(domain) === index)
      .sort((left, right) => left.localeCompare(right));
    return {
      id: item.id,
      duplicateDomains,
      duplicateCount: duplicateDomains.length,
    };
  });

  return {
    strategy: strategy.id,
    comparedCount: docs.length,
    matchCount: matches.length,
    groupCount: groups.length,
    matchedArticleCount: new Set(groups.flatMap((group) => group.memberIds)).size,
    groups,
    updates,
  };
}

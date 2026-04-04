import { describe, expect, it } from "vitest";
import { buildTextFingerprint } from "../src/domain/fingerprint.js";
import { extractKeywords, jaccardSimilarity } from "../src/domain/text.js";
import { canonicalizeUrl } from "../src/domain/url.js";
import { clusterArticles } from "../src/services/clustering.js";

describe("canonicalizeUrl", () => {
  it("removes tracking params and trailing slash", () => {
    expect(
      canonicalizeUrl("https://example.com/story/?utm_source=x&utm_medium=y#section"),
    ).toBe("https://example.com/story");
  });
});

describe("jaccardSimilarity", () => {
  it("scores similar titles above dissimilar titles", () => {
    const similar = jaccardSimilarity("Markets fall after tariff shock", "Tariff shock sends markets lower");
    const different = jaccardSimilarity("Markets fall after tariff shock", "Local team wins finals series");
    expect(similar).toBeGreaterThan(different);
  });
});

describe("clusterArticles", () => {
  it("groups similar headlines together", () => {
    const clusters = clusterArticles([
      {
        articleId: "a1",
        title: "Markets fall after tariff shock",
        domain: "a.com",
        category: "Business",
        publishedAt: new Date(),
      },
      {
        articleId: "a2",
        title: "Tariff shock sends markets lower",
        domain: "b.com",
        category: "Business",
        publishedAt: new Date(),
      },
      {
        articleId: "a3",
        title: "Local team wins finals series",
        domain: "c.com",
        category: "Sport",
        publishedAt: new Date(),
      },
    ]);

    expect(clusters).toHaveLength(2);
    expect(clusters[0]?.articleIds).toHaveLength(2);
  });
});

describe("extractKeywords", () => {
  it("uses language-aware German stopwords", () => {
    const keywords = extractKeywords(
      "de",
      "Der Kanzler und die Minister sprechen über das neue Gesetz",
      "Die Regierung stellt das Gesetz in Berlin vor",
    );

    expect(keywords).not.toContain("der");
    expect(keywords).not.toContain("die");
    expect(keywords).not.toContain("das");
    expect(keywords).toContain("gesetz");
    expect(keywords).toContain("berlin");
  });
});

describe("buildTextFingerprint", () => {
  it("matches equivalent article text across different formatting", () => {
    const left = buildTextFingerprint(
      "Breaking story",
      "This is the same syndicated article text repeated across multiple sources with minor punctuation changes.",
      "Markets reacted sharply after the announcement and officials confirmed the timeline would remain unchanged.",
    );
    const right = buildTextFingerprint(
      "Breaking story",
      "This is the same syndicated article text repeated across multiple sources, with minor punctuation changes.",
      "Markets reacted sharply after the announcement, and officials confirmed the timeline would remain unchanged.",
    );

    expect(left).toBeTruthy();
    expect(left).toBe(right);
  });
});

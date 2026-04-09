import { describe, expect, it } from "vitest";
import { buildSoftDedupePlan, resolveDedupeStrategy } from "../src/services/dedupe.js";

const sharedBodyLeft = `
  Markets fell sharply after the central bank update as bond yields rose.
  Analysts said the move was expected, but the timing still surprised traders.
  Officials repeated that inflation risks remain elevated through the next quarter.
  Investors rotated into defensive sectors after the policy briefing.
`;

const sharedBodyRight = `
  Markets fell sharply after the central bank update and bond yields climbed.
  Analysts said the move was expected, but the timing surprised many traders.
  Officials repeated inflation risks will remain elevated through next quarter.
  Investors rotated into defensive sectors after the policy briefing.
`;

describe("resolveDedupeStrategy", () => {
  it("defaults to simhash for unknown values", () => {
    expect(resolveDedupeStrategy(undefined)).toBe("simhash");
    expect(resolveDedupeStrategy("unknown")).toBe("simhash");
    expect(resolveDedupeStrategy("jaccard")).toBe("jaccard");
  });
});

describe("buildSoftDedupePlan", () => {
  it("finds near duplicates with simhash using a shared interface", () => {
    const plan = buildSoftDedupePlan(
      [
        {
          id: "a1",
          domain: "alpha.example",
          title: "Markets react after central bank update",
          body: sharedBodyLeft,
        },
        {
          id: "a2",
          domain: "beta.example",
          title: "Markets react after central bank update",
          body: sharedBodyRight,
        },
        {
          id: "a3",
          domain: "sports.example",
          title: "Local club wins national final",
          body: "The final ended with a late goal and a large celebration in the city center.",
        },
      ],
      {
        strategy: "simhash",
        minTextLength: 40,
        maxSimHashDistance: 12,
        simHashMinJaccardSimilarity: 0.75,
      },
    );

    expect(plan.strategy).toBe("simhash");
    expect(plan.groupCount).toBe(1);
    expect(plan.matchedArticleCount).toBe(2);
    expect(plan.updates.find((item) => item.id === "a1")?.duplicateDomains).toContain("beta.example");
  });

  it("finds near duplicates with jaccard using the same planner interface", () => {
    const plan = buildSoftDedupePlan(
      [
        {
          id: "b1",
          domain: "gamma.example",
          title: "Update: mission test reaches new milestone",
          body: "The mission test reached a new milestone as engineers completed critical checks.",
        },
        {
          id: "b2",
          domain: "delta.example",
          title: "Update mission test reaches new milestone",
          body: "The mission test reached a new milestone and engineers completed critical checks.",
        },
      ],
      {
        strategy: "jaccard",
        minTextLength: 20,
        minJaccardSimilarity: 0.7,
      },
    );

    expect(plan.strategy).toBe("jaccard");
    expect(plan.groupCount).toBe(1);
    expect(plan.matchCount).toBeGreaterThan(0);
  });
});

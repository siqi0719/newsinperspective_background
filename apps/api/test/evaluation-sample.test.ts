/**
 * NER Evaluation Example Test
 *
 * This test demonstrates how to:
 * 1. Create manually annotated ground truth data
 * 2. Run NER prediction
 * 3. Evaluate performance metrics
 * 4. Generate evaluation reports
 *
 * This is a practical example of how to measure NER accuracy
 */

import { describe, it, expect } from "vitest";
import { entityRecognitionService } from "../src/services/entity-recognition.js";
import { evaluationService, AnnotatedEntity } from "../src/lib/evaluation-metrics.js";
import { EntityType } from "../src/domain/entity-types.js";

describe("NER Evaluation - Practical Example", () => {
  /**
   * Test Article 1: Political News
   *
   * Ground Truth (manually annotated):
   * - Vladimir Putin (PERSON)
   * - Moscow (GPE)
   * - Russia (GPE)
   * - World Health Organization (ORG)
   *
   * This test shows evaluation on real news text
   */
  it("should evaluate NER performance on political news", async () => {
    // Test article - use simple format for accurate offset calculation
    const article = "Vladimir Putin visited Moscow. Russia supports the World Health Organization.";

    // Ground truth annotations - calculated using article.indexOf()
    // These offsets are exact positions in the article text above
    const groundTruth: AnnotatedEntity[] = [
      {
        text: "Vladimir Putin",
        type: EntityType.PERSON,
        startOffset: article.indexOf("Vladimir Putin"),
        endOffset: article.indexOf("Vladimir Putin") + "Vladimir Putin".length,
      },
      {
        text: "Moscow",
        type: EntityType.GPE,
        startOffset: article.indexOf("Moscow"),
        endOffset: article.indexOf("Moscow") + "Moscow".length,
      },
      {
        text: "Russia",
        type: EntityType.GPE,
        startOffset: article.indexOf("Russia"),
        endOffset: article.indexOf("Russia") + "Russia".length,
      },
      {
        text: "World Health Organization",
        type: EntityType.ORG,
        startOffset: article.indexOf("World Health Organization"),
        endOffset: article.indexOf("World Health Organization") + "World Health Organization".length,
      },
    ];

    // Step 1: Get predictions from NER model
    const result = await entityRecognitionService.recognizeEntities(article);

    console.log("\n====== Article 1: Political News ======");
    console.log("Article:", article.substring(0, 100) + "...");
    console.log("\nGround Truth (annotated):");
    groundTruth.forEach((entity, i) => {
      console.log(`  ${i + 1}. ${entity.text} (${entity.type})`);
    });

    console.log("\nPredicted Entities:");
    result.entities.forEach((entity, i) => {
      console.log(
        `  ${i + 1}. ${entity.entityText} (${entity.entityType}) - confidence: ${(entity.confidence * 100).toFixed(1)}%`
      );
    });

    // Step 2: Evaluate
    const metrics = evaluationService.evaluate(result.entities, groundTruth);

    console.log("\n====== Evaluation Results ======");
    console.log(`Precision: ${(metrics.overall.precision * 100).toFixed(1)}%`);
    console.log(`Recall:    ${(metrics.overall.recall * 100).toFixed(1)}%`);
    console.log(`F1 Score:  ${(metrics.overall.f1Score * 100).toFixed(1)}%`);
    console.log(
      `\nDetails: ${metrics.details.truePositives} correct, ${metrics.details.falsePositives} false positives, ${metrics.details.falseNegatives} false negatives`
    );

    // Per-type analysis
    console.log("\n====== Per-Type Metrics ======");
    for (const [type, typeMetrics] of Object.entries(metrics.byType)) {
      if (typeMetrics) {
        console.log(
          `${type}: P=${(typeMetrics.precision * 100).toFixed(1)}% R=${(typeMetrics.recall * 100).toFixed(1)}% F1=${(typeMetrics.f1Score * 100).toFixed(1)}% (support=${typeMetrics.support})`
        );
      }
    }

    // Assertions
    expect(metrics.overall.f1Score).toBeGreaterThan(0.5);
    expect(metrics.overall.precision).toBeGreaterThan(0);
    expect(metrics.overall.recall).toBeGreaterThan(0);
  });

  /**
   * Test Article 2: Business News
   *
   * Shows evaluation on different domain
   */
  it("should evaluate NER on business/corporate news", async () => {
    const article = "Microsoft Corporation announced a partnership with Google in San Francisco.";

    const groundTruth: AnnotatedEntity[] = [
      {
        text: "Microsoft Corporation",
        type: EntityType.ORG,
        startOffset: article.indexOf("Microsoft Corporation"),
        endOffset: article.indexOf("Microsoft Corporation") + "Microsoft Corporation".length,
      },
      {
        text: "Google",
        type: EntityType.ORG,
        startOffset: article.indexOf("Google"),
        endOffset: article.indexOf("Google") + "Google".length,
      },
      {
        text: "San Francisco",
        type: EntityType.GPE,
        startOffset: article.indexOf("San Francisco"),
        endOffset: article.indexOf("San Francisco") + "San Francisco".length,
      },
    ];

    const result = await entityRecognitionService.recognizeEntities(article);
    const metrics = evaluationService.evaluate(result.entities, groundTruth);

    console.log("\n====== Article 2: Business News ======");
    console.log(`F1 Score: ${(metrics.overall.f1Score * 100).toFixed(1)}%`);

    expect(metrics.overall.f1Score).toBeGreaterThan(0.3);
  });

  /**
   * Batch Evaluation Test
   *
   * Evaluate multiple articles at once to get overall statistics
   * This is how you would evaluate on a full test set
   */
  it("should evaluate on a batch of articles", async () => {
    // Create multiple test articles with ground truth
    const testCases: Array<{article: string, groundTruth: AnnotatedEntity[]}> = [];

    // Article 1: Political news
    const article1 = "Joe Biden visited Beijing. Xi Jinping was in the United States and China.";
    testCases.push({
      article: article1,
      groundTruth: [
        {
          text: "Joe Biden",
          type: EntityType.PERSON,
          startOffset: article1.indexOf("Joe Biden"),
          endOffset: article1.indexOf("Joe Biden") + "Joe Biden".length,
        },
        {
          text: "Beijing",
          type: EntityType.GPE,
          startOffset: article1.indexOf("Beijing"),
          endOffset: article1.indexOf("Beijing") + "Beijing".length,
        },
        {
          text: "Xi Jinping",
          type: EntityType.PERSON,
          startOffset: article1.indexOf("Xi Jinping"),
          endOffset: article1.indexOf("Xi Jinping") + "Xi Jinping".length,
        },
        {
          text: "United States",
          type: EntityType.GPE,
          startOffset: article1.indexOf("United States"),
          endOffset: article1.indexOf("United States") + "United States".length,
        },
        {
          text: "China",
          type: EntityType.GPE,
          startOffset: article1.indexOf("China"),
          endOffset: article1.indexOf("China") + "China".length,
        },
      ],
    });

    // Article 2: Business news
    const article2 = "Apple Inc. released models in California. Steve Jobs founded Cupertino.";
    testCases.push({
      article: article2,
      groundTruth: [
        {
          text: "Apple Inc.",
          type: EntityType.ORG,
          startOffset: article2.indexOf("Apple Inc."),
          endOffset: article2.indexOf("Apple Inc.") + "Apple Inc.".length,
        },
        {
          text: "California",
          type: EntityType.GPE,
          startOffset: article2.indexOf("California"),
          endOffset: article2.indexOf("California") + "California".length,
        },
        {
          text: "Steve Jobs",
          type: EntityType.PERSON,
          startOffset: article2.indexOf("Steve Jobs"),
          endOffset: article2.indexOf("Steve Jobs") + "Steve Jobs".length,
        },
        {
          text: "Cupertino",
          type: EntityType.GPE,
          startOffset: article2.indexOf("Cupertino"),
          endOffset: article2.indexOf("Cupertino") + "Cupertino".length,
        },
      ],
    });

    // Evaluate all articles
    console.log("\n====== Batch Evaluation ======");
    const allMetrics: { f1: number; precision: number; recall: number }[] = [];

    for (let i = 0; i < testCases.length; i++) {
      const { article, groundTruth } = testCases[i];
      const result = await entityRecognitionService.recognizeEntities(article);
      const metrics = evaluationService.evaluate(result.entities, groundTruth);

      console.log(
        `Article ${i + 1}: P=${(metrics.overall.precision * 100).toFixed(1)}% R=${(metrics.overall.recall * 100).toFixed(1)}% F1=${(metrics.overall.f1Score * 100).toFixed(1)}%`
      );

      allMetrics.push({
        f1: metrics.overall.f1Score,
        precision: metrics.overall.precision,
        recall: metrics.overall.recall,
      });
    }

    // Calculate averages
    const avgF1 =
      allMetrics.reduce((sum, m) => sum + m.f1, 0) / allMetrics.length;
    const avgPrecision =
      allMetrics.reduce((sum, m) => sum + m.precision, 0) / allMetrics.length;
    const avgRecall =
      allMetrics.reduce((sum, m) => sum + m.recall, 0) / allMetrics.length;

    console.log("\n====== Average Metrics ======");
    console.log(`Average Precision: ${(avgPrecision * 100).toFixed(1)}%`);
    console.log(`Average Recall:    ${(avgRecall * 100).toFixed(1)}%`);
    console.log(`Average F1 Score:  ${(avgF1 * 100).toFixed(1)}%`);

    expect(allMetrics.length).toBe(2);
    expect(avgF1).toBeGreaterThan(0.4);
  });

  /**
   * Confidence Analysis Test
   *
   * Shows how to analyze predictions by confidence threshold
   * - High confidence predictions are more likely to be correct
   * - Low confidence predictions need verification
   */
  it("should analyze predictions by confidence level", async () => {
    const article = "Vladimir Putin met with Angela Merkel in Moscow to discuss the World Bank.";

    const groundTruth: AnnotatedEntity[] = [
      {
        text: "Vladimir Putin",
        type: EntityType.PERSON,
        startOffset: article.indexOf("Vladimir Putin"),
        endOffset: article.indexOf("Vladimir Putin") + "Vladimir Putin".length,
      },
      {
        text: "Angela Merkel",
        type: EntityType.PERSON,
        startOffset: article.indexOf("Angela Merkel"),
        endOffset: article.indexOf("Angela Merkel") + "Angela Merkel".length,
      },
      {
        text: "Moscow",
        type: EntityType.GPE,
        startOffset: article.indexOf("Moscow"),
        endOffset: article.indexOf("Moscow") + "Moscow".length,
      },
      {
        text: "World Bank",
        type: EntityType.ORG,
        startOffset: article.indexOf("World Bank"),
        endOffset: article.indexOf("World Bank") + "World Bank".length,
      },
    ];

    const result = await entityRecognitionService.recognizeEntities(article);

    console.log("\n====== Confidence Analysis ======");

    // Group by confidence level
    const highConf = result.entities.filter((e) => e.confidence >= 0.8);
    const mediumConf = result.entities.filter(
      (e) => e.confidence >= 0.6 && e.confidence < 0.8
    );
    const lowConf = result.entities.filter((e) => e.confidence < 0.6);

    console.log(`High confidence (≥0.8):   ${highConf.length} entities`);
    console.log(`Medium confidence (0.6-0.8): ${mediumConf.length} entities`);
    console.log(`Low confidence (<0.6):    ${lowConf.length} entities`);

    // Evaluate high confidence predictions separately
    const highConfMetrics = evaluationService.evaluate(highConf, groundTruth);
    console.log(
      `\nHigh confidence F1: ${(highConfMetrics.overall.f1Score * 100).toFixed(1)}%`
    );
    console.log(
      `High confidence accuracy: ${(highConfMetrics.overall.precision * 100).toFixed(1)}%`
    );

    expect(highConf.length).toBeGreaterThan(0);
  });
});

/**
 * HOW TO USE THIS TEST:
 *
 * 1. Run the test:
 *    pnpm test -- evaluation-sample.test
 *
 * 2. Check the console output for detailed metrics
 *
 * 3. Use this as a template for your own evaluation:
 *    - Create ground truth annotations by hand
 *    - Run NER on your test articles
 *    - Evaluate with evaluationService.evaluate()
 *    - Check metrics to see what's working and what needs improvement
 *
 * 4. To evaluate on a larger test set:
 *    - Create a JSON file with annotated examples
 *    - Load and evaluate all at once
 *    - Track metrics over time as you improve the model
 *
 * Common Tips:
 * - Start with ~50-100 manually annotated examples
 * - Focus on your most important entity types first
 * - Look at false positives to understand error patterns
 * - Improve low-performing entity types with more data
 */

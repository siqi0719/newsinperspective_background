/**
 * NER Evaluation Metrics
 *
 * This module provides tools to evaluate the accuracy and performance of
 * the Named Entity Recognition (NER) service by comparing predicted entities
 * against manually annotated ground truth.
 *
 * Key Metrics:
 * - Precision: Correctness of predicted entities
 * - Recall: Completeness of predictions
 * - F1 Score: Harmonic mean of precision and recall
 * - Per-type metrics: Separate scores for each entity type
 */

import { EntityType, EntityMention } from "../domain/entity-types.js";

/**
 * Manually annotated entity for evaluation
 * This is the "gold standard" ground truth
 */
export interface AnnotatedEntity {
  text: string;                    // The entity text
  type: EntityType;                // Correct entity type
  startOffset: number;             // Position in text
  endOffset: number;
}

/**
 * Evaluation results including precision, recall, F1
 */
export interface EvaluationMetrics {
  overall: {
    precision: number;             // Overall precision (0-1)
    recall: number;                // Overall recall (0-1)
    f1Score: number;               // Overall F1 score (0-1)
    support: number;               // Total ground truth entities
  };
  byType: {                        // Metrics broken down by entity type
    [key in EntityType]?: {
      precision: number;
      recall: number;
      f1Score: number;
      support: number;             // Count of ground truth for this type
      predicted: number;           // Count of predicted for this type
    };
  };
  details: {
    truePositives: number;         // Correctly predicted
    falsePositives: number;        // Incorrectly predicted
    falseNegatives: number;        // Missed entities
  };
}

/**
 * Confusion matrix for detailed error analysis
 */
export interface ConfusionMatrix {
  [actualType: string]: {
    [predictedType: string]: number;
  };
}

/**
 * Evaluation Service
 * Compares predicted entities against ground truth annotations
 */
export class EvaluationService {
  /**
   * Compare predicted entities with ground truth
   * Calculates precision, recall, and F1 score
   *
   * Matching Strategy:
   * - Exact match: Same text, same type, same position
   * - Partial match: Same text and type, slight position difference
   * - Wrong type: Same text and position, but wrong entity type
   *
   * @param predicted - Entities predicted by the NER model
   * @param groundTruth - Manually annotated correct entities
   * @param allowPartialMatch - Whether to allow positions within 2 chars
   * @returns Evaluation metrics
   *
   * @example
   * const predicted = [
   *   { entityText: "Putin", entityType: "PERSON", startOffset: 0, endOffset: 5, confidence: 0.9, context: "" }
   * ];
   * const groundTruth = [
   *   { text: "Putin", type: "PERSON", startOffset: 0, endOffset: 5 }
   * ];
   * const metrics = service.evaluate(predicted, groundTruth);
   * console.log(metrics.overall.f1Score); // ~1.0 (perfect match)
   */
  evaluate(
    predicted: EntityMention[],
    groundTruth: AnnotatedEntity[],
    allowPartialMatch: boolean = true
  ): EvaluationMetrics {
    // Track matches
    const matchedPredicted = new Set<number>();
    const matchedGroundTruth = new Set<number>();
    let truePositives = 0;
    let wrongTypePredictions = 0;

    // Find matches between predicted and ground truth
    for (let i = 0; i < predicted.length; i++) {
      const pred = predicted[i];

      for (let j = 0; j < groundTruth.length; j++) {
        if (matchedGroundTruth.has(j)) continue; // Already matched

        const truth = groundTruth[j];

        // Check if this is a match
        if (this.isMatch(pred, truth, allowPartialMatch)) {
          truePositives++;
          matchedPredicted.add(i);
          matchedGroundTruth.add(j);
          break;
        }
      }
    }

    // Calculate metrics
    const falsePositives = predicted.length - truePositives;
    const falseNegatives = groundTruth.length - truePositives;

    const precision =
      predicted.length > 0 ? truePositives / predicted.length : 0;
    const recall =
      groundTruth.length > 0 ? truePositives / groundTruth.length : 0;
    const f1Score =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;

    // Per-type metrics
    const byType = this.calculatePerTypeMetrics(
      predicted,
      groundTruth,
      matchedPredicted,
      matchedGroundTruth
    );

    return {
      overall: {
        precision,
        recall,
        f1Score,
        support: groundTruth.length,
      },
      byType,
      details: {
        truePositives,
        falsePositives,
        falseNegatives,
      },
    };
  }

  /**
   * Check if a predicted entity matches a ground truth entity
   *
   * Matching criteria:
   * 1. Text must match (case-insensitive)
   * 2. Type must match
   * 3. Position must match (exact or within allowPartialMatch distance)
   *
   * @param predicted - Predicted entity
   * @param truth - Ground truth entity
   * @param allowPartial - Allow position within 2 characters
   * @returns True if entities match
   */
  private isMatch(
    predicted: EntityMention,
    truth: AnnotatedEntity,
    allowPartial: boolean
  ): boolean {
    // Text must match (case-insensitive)
    if (
      predicted.entityText.toLowerCase() !==
      truth.text.toLowerCase()
    ) {
      return false;
    }

    // Type must match
    if (predicted.entityType !== truth.type) {
      return false;
    }

    // Position must match
    if (allowPartial) {
      // Allow slight position differences (within 2 chars)
      const startDiff = Math.abs(predicted.startOffset - truth.startOffset);
      const endDiff = Math.abs(predicted.endOffset - truth.endOffset);
      return startDiff <= 2 && endDiff <= 2;
    } else {
      // Exact position match
      return (
        predicted.startOffset === truth.startOffset &&
        predicted.endOffset === truth.endOffset
      );
    }
  }

  /**
   * Calculate metrics for each entity type separately
   *
   * This helps identify which entity types are performing well
   * and which need improvement
   *
   * @returns Metrics grouped by entity type
   */
  private calculatePerTypeMetrics(
    predicted: EntityMention[],
    groundTruth: AnnotatedEntity[],
    matchedPredicted: Set<number>,
    matchedGroundTruth: Set<number>
  ) {
    const byType: {
      [key in EntityType]?: {
        precision: number;
        recall: number;
        f1Score: number;
        support: number;
        predicted: number;
      };
    } = {};

    // Process each entity type
    const types = Object.values(EntityType);

    for (const type of types) {
      const typePredicted = predicted.filter((p) => p.entityType === type);
      const typeGroundTruth = groundTruth.filter((g) => g.type === type);

      if (typeGroundTruth.length === 0 && typePredicted.length === 0) {
        continue; // Skip types with no instances
      }

      // Count matches for this type
      let typeMatches = 0;
      for (let i = 0; i < typePredicted.length; i++) {
        const predIdx = predicted.findIndex((p) => p === typePredicted[i]);
        if (matchedPredicted.has(predIdx)) {
          typeMatches++;
        }
      }

      const typePrecision =
        typePredicted.length > 0 ? typeMatches / typePredicted.length : 0;
      const typeRecall =
        typeGroundTruth.length > 0 ? typeMatches / typeGroundTruth.length : 0;
      const typeF1 =
        typePrecision + typeRecall > 0
          ? (2 * typePrecision * typeRecall) / (typePrecision + typeRecall)
          : 0;

      byType[type] = {
        precision: typePrecision,
        recall: typeRecall,
        f1Score: typeF1,
        support: typeGroundTruth.length,
        predicted: typePredicted.length,
      };
    }

    return byType;
  }

  /**
   * Build confusion matrix
   * Shows how often each entity type is confused with others
   *
   * Useful for understanding specific error patterns
   *
   * @param predicted - Predicted entities
   * @param groundTruth - Ground truth entities
   * @returns Confusion matrix
   *
   * @example
   * Confusion matrix:
   *         Predicted
   *      PERSON  GPE  ORG
   * Actual
   * PERSON   45    2    1    (45 correct PERSON, 2 confused with GPE, 1 with ORG)
   * GPE       1   38    2
   * ORG       0    1   42
   */
  confusionMatrix(
    predicted: EntityMention[],
    groundTruth: AnnotatedEntity[]
  ): ConfusionMatrix {
    const matrix: ConfusionMatrix = {};

    // Initialize matrix
    const types = Object.values(EntityType);
    for (const type of types) {
      matrix[type] = {};
      for (const predType of types) {
        matrix[type][predType] = 0;
      }
    }

    // Build confusion matrix by comparing each predicted to closest truth
    for (const pred of predicted) {
      // Find closest ground truth entity
      let closest: (AnnotatedEntity & { distance: number }) | null = null;
      let closestDistance = Infinity;

      for (const truth of groundTruth) {
        // Check if text matches
        if (
          pred.entityText.toLowerCase() ===
          truth.text.toLowerCase()
        ) {
          const distance =
            Math.abs(pred.startOffset - truth.startOffset) +
            Math.abs(pred.endOffset - truth.endOffset);

          if (distance < closestDistance) {
            closest = { ...truth, distance };
            closestDistance = distance;
          }
        }
      }

      // Record in matrix
      if (closest) {
        matrix[closest.type][pred.entityType]++;
      }
    }

    return matrix;
  }

  /**
   * Generate a human-readable evaluation report
   *
   * @param metrics - Evaluation metrics
   * @param confusionMat - Confusion matrix
   * @returns Formatted report string
   *
   * @example
   * ===== NER Evaluation Report =====
   *
   * Overall Metrics:
   * Precision: 85.5%
   * Recall:    82.3%
   * F1 Score:  83.8%
   * Support:   200 entities
   * ...
   */
  generateReport(metrics: EvaluationMetrics, confusionMat?: ConfusionMatrix): string {
    let report = "===== NER Evaluation Report =====\n\n";

    // Overall metrics
    report += "Overall Metrics:\n";
    report += `Precision: ${(metrics.overall.precision * 100).toFixed(1)}%\n`;
    report += `Recall:    ${(metrics.overall.recall * 100).toFixed(1)}%\n`;
    report += `F1 Score:  ${(metrics.overall.f1Score * 100).toFixed(1)}%\n`;
    report += `Support:   ${metrics.overall.support} entities\n\n`;

    // Per-type metrics
    if (Object.keys(metrics.byType).length > 0) {
      report += "Per-Type Metrics:\n";
      report += "────────────────────────────────────────\n";
      report += "Type     Precision  Recall   F1      Support\n";
      report += "────────────────────────────────────────\n";

      for (const [type, typeMetrics] of Object.entries(metrics.byType)) {
        if (typeMetrics) {
          report += `${type.padEnd(8)} ${(typeMetrics.precision * 100).toFixed(1).padEnd(8)}% ${(typeMetrics.recall * 100).toFixed(1).padEnd(7)}% ${(typeMetrics.f1Score * 100).toFixed(1).padEnd(7)}% ${typeMetrics.support}\n`;
        }
      }
      report += "\n";
    }

    // Error analysis
    report += "Error Analysis:\n";
    report += `True Positives:  ${metrics.details.truePositives}\n`;
    report += `False Positives: ${metrics.details.falsePositives}\n`;
    report += `False Negatives: ${metrics.details.falseNegatives}\n\n`;

    // Confusion matrix
    if (confusionMat) {
      report += "Confusion Matrix:\n";
      report += "(Rows: Ground Truth, Columns: Predicted)\n";
      // Format as table...
    }

    return report;
  }
}

// Export singleton
export const evaluationService = new EvaluationService();

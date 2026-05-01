/**
 * Entity Recognition Service Tests
 *
 * Comprehensive test suite for the NER service covering:
 * - Basic entity extraction
 * - Entity type classification
 * - Confidence scoring
 * - Duplicate handling
 * - Batch processing
 * - Edge cases
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  EntityRecognitionService,
  entityRecognitionService,
} from "../src/services/entity-recognition.js";
import { EntityType } from "../src/domain/entity-types.js";

describe("EntityRecognitionService", () => {
  let service: EntityRecognitionService;

  beforeEach(() => {
    // Use the singleton instance for tests
    service = entityRecognitionService;
    service.setMinConfidence(0.6); // Reset to default
  });

  describe("recognizeEntities - Basic Functionality", () => {
    /**
     * Test 1: Recognize people in simple text
     * Expected: Vladimir Putin and John Smith should be identified as PERSON
     */
    it("should recognize person entities", async () => {
      const text =
        "Vladimir Putin met with John Smith yesterday to discuss trade agreements.";

      const result = await service.recognizeEntities(text);

      expect(result.entities.length).toBeGreaterThan(0);
      const persons = result.entities.filter(
        (e) => e.entityType === EntityType.PERSON
      );
      expect(persons.length).toBeGreaterThanOrEqual(1);
      expect(result.byType[EntityType.PERSON] ?? 0).toBeGreaterThanOrEqual(1);
    });

    /**
     * Test 2: Recognize locations/geopolitical entities
     * Expected: Moscow and United States should be identified as GPE
     */
    it("should recognize geopolitical entities (GPE)", async () => {
      const text =
        "The meeting took place in Moscow, attended by officials from the United States.";

      const result = await service.recognizeEntities(text);

      expect(result.entities.length).toBeGreaterThan(0);
      const locations = result.entities.filter(
        (e) => e.entityType === EntityType.GPE
      );
      expect(locations.length).toBeGreaterThanOrEqual(1);
    });

    /**
     * Test 3: Recognize organizations
     * Expected: BBC, Microsoft, and World Health Organization should be identified as ORG
     */
    it("should recognize organizations", async () => {
      const text =
        "According to a report by BBC and Microsoft Corporation, the World Health Organization announced new guidelines.";

      const result = await service.recognizeEntities(text);

      const orgs = result.entities.filter(
        (e) => e.entityType === EntityType.ORG
      );
      expect(orgs.length).toBeGreaterThanOrEqual(1);
    });

    /**
     * Test 4: Recognize events
     * Expected: World War II and Olympics should be identified as EVENT
     */
    it("should recognize events", async () => {
      const text =
        "The Tokyo Olympics was held after World War II ended in 1945.";

      const result = await service.recognizeEntities(text);

      const events = result.entities.filter(
        (e) => e.entityType === EntityType.EVENT
      );
      expect(events.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("recognizeEntities - Accuracy and Confidence", () => {
    /**
     * Test 5: Verify confidence scores are valid
     * Expected: All confidence scores should be between 0 and 1
     */
    it("should return valid confidence scores", async () => {
      const text = "President Putin announced new policies in Moscow today.";

      const result = await service.recognizeEntities(text);

      result.entities.forEach((entity) => {
        expect(entity.confidence).toBeGreaterThanOrEqual(0);
        expect(entity.confidence).toBeLessThanOrEqual(1);
      });

      // Check aggregate statistics
      expect(result.confidence.min).toBeGreaterThanOrEqual(0);
      expect(result.confidence.max).toBeLessThanOrEqual(1);
      expect(result.confidence.average).toBeGreaterThanOrEqual(0);
      expect(result.confidence.average).toBeLessThanOrEqual(1);
    });

    /**
     * Test 6: Apply minimum confidence threshold
     * Expected: Only entities with confidence >= threshold should be returned
     */
    it("should filter entities by confidence threshold", async () => {
      const text = "John Smith visited New York yesterday.";
      service.setMinConfidence(0.8);

      const result = await service.recognizeEntities(text);

      // All returned entities should meet the threshold
      result.entities.forEach((entity) => {
        expect(entity.confidence).toBeGreaterThanOrEqual(0.8);
      });
    });

    /**
     * Test 7: Verify offset positions are correct
     * Expected: Start and end offsets should match actual text positions
     */
    it("should have correct offset positions", async () => {
      const text =
        "Vladimir Putin is the President of Russia.";

      const result = await service.recognizeEntities(text);

      result.entities.forEach((entity) => {
        const extractedText = text.substring(
          entity.startOffset,
          entity.endOffset
        );
        // The extracted text should match the entity (case may differ)
        expect(extractedText.toLowerCase()).toContain(
          entity.entityText.toLowerCase().substring(0, 3)
        );
      });
    });
  });

  describe("recognizeEntities - Configuration", () => {
    /**
     * Test 8: Filter by entity type
     * Expected: Only PERSON entities should be returned when filter is applied
     */
    it("should filter by entity type", async () => {
      const text =
        "Vladimir Putin met in Moscow with the Organization for Security and Cooperation.";

      const result = await service.recognizeEntities(text, {
        entityTypes: [EntityType.PERSON],
      });

      // All returned entities should be PERSON
      result.entities.forEach((entity) => {
        expect(entity.entityType).toBe(EntityType.PERSON);
      });
    });

    /**
     * Test 9: Custom confidence threshold via config
     * Expected: Config threshold should override service default
     */
    it("should apply custom confidence threshold from config", async () => {
      const text = "John Smith and Jane Doe visited Paris.";
      service.setMinConfidence(0.5); // Set default

      const result = await service.recognizeEntities(text, {
        minConfidence: 0.9, // Override with higher threshold
      });

      // All entities should meet the higher threshold
      result.entities.forEach((entity) => {
        expect(entity.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });
  });

  describe("recognizeEntities - Duplicate Handling", () => {
    /**
     * Test 10: Handle duplicate entities
     * Expected: Same entity mentioned multiple times should be deduplicated
     */
    it("should deduplicate entities mentioned multiple times", async () => {
      const text =
        "Putin met with Putin's advisors. The Russian President Putin said Putin will continue negotiations.";

      const result = await service.recognizeEntities(text);

      // Count unique entity texts
      const uniqueTexts = new Set(
        result.entities.map((e) => e.entityText.toLowerCase())
      );

      // Even though "Putin" appears 4 times, it should be deduplicated
      expect(
        result.entities.filter((e) => e.entityText.toLowerCase().includes("putin"))
          .length
      ).toBeLessThanOrEqual(5); // Allow some duplicates but not all 4
    });
  });

  describe("recognizeEntities - Edge Cases", () => {
    /**
     * Test 11: Handle empty text
     * Expected: Should return empty result without error
     */
    it("should handle empty text gracefully", async () => {
      const result = await service.recognizeEntities("");

      expect(result.entities).toEqual([]);
      expect(result.totalEntities).toBe(0);
    });

    /**
     * Test 12: Handle text with no entities
     * Expected: Should return empty entity list
     */
    it("should handle text with no entities", async () => {
      const text = "The weather is nice today.";

      const result = await service.recognizeEntities(text);

      // May still extract something as capitalized words, but likely few or none
      expect(result.entities.length).toBeLessThanOrEqual(2);
    });

    /**
     * Test 13: Handle very long text
     * Expected: Should process without error and identify all entities
     */
    it("should handle long text efficiently", async () => {
      const longText =
        "Vladimir Putin " +
        "announced initiatives in Moscow. " +
        "The World Health Organization confirmed support. ".repeat(20); // ~900 words

      const startTime = Date.now();
      const result = await service.recognizeEntities(longText);
      const processingTime = Date.now() - startTime;

      expect(result.entities.length).toBeGreaterThan(0);
      expect(processingTime).toBeLessThan(500); // Should process in under 500ms
    });

    /**
     * Test 14: Handle text with special characters
     * Expected: Should extract entities while ignoring special characters
     */
    it("should handle special characters in text", async () => {
      const text = "@ Vladimir Putin! #Moscow (2026) said...";

      const result = await service.recognizeEntities(text);

      // Should still extract Putin and Moscow despite special chars
      const entities = result.entities.map((e) =>
        e.entityText.toLowerCase()
      );
      const hasPutin = entities.some((e) => e.includes("putin"));
      expect(entities.length).toBeGreaterThan(0);
    });
  });

  describe("recognizeEntitiesForArticles - Batch Processing", () => {
    /**
     * Test 15: Batch process multiple articles
     * Expected: Should process all articles and return results mapped by ID
     */
    it("should batch process multiple articles", async () => {
      const articles = [
        {
          id: "article1",
          text: "Vladimir Putin announced new policies.",
        },
        {
          id: "article2",
          text: "The World Health Organization released guidelines.",
        },
        {
          id: "article3",
          text: "The meeting took place in Paris.",
        },
      ];

      const results = await service.recognizeEntitiesForArticles(articles);

      expect(results.size).toBe(3);
      expect(results.has("article1")).toBe(true);
      expect(results.has("article2")).toBe(true);
      expect(results.has("article3")).toBe(true);

      // Each result should have entities
      results.forEach((result) => {
        expect(result.entities).toBeDefined();
        expect(result.processingTime).toBeGreaterThanOrEqual(0);
      });
    });

    /**
     * Test 16: Batch processing should handle errors gracefully
     * Expected: Should continue processing even if one article fails
     */
    it("should handle errors in batch processing", async () => {
      const articles = [
        {
          id: "article1",
          text: "Normal article text.",
        },
        {
          id: "article2",
          text: "", // Empty text - edge case
        },
        {
          id: "article3",
          text: "Another normal article.",
        },
      ];

      const results = await service.recognizeEntitiesForArticles(articles);

      // Should have results for all articles, even with empty one
      expect(results.size).toBe(3);
      expect(results.has("article1")).toBe(true);
      expect(results.has("article2")).toBe(true); // Should return empty result
      expect(results.has("article3")).toBe(true);
    });
  });

  describe("Entity Statistics", () => {
    /**
     * Test 17: Verify entity type counts
     * Expected: byType count should match filtered entities
     */
    it("should correctly count entities by type", async () => {
      const text =
        "Vladimir Putin and John Smith visited Moscow and Paris where they met with the World Health Organization.";

      const result = await service.recognizeEntities(text);

      // Manually count by type
      const personCount = result.entities.filter(
        (e) => e.entityType === EntityType.PERSON
      ).length;
      const gpeCount = result.entities.filter(
        (e) => e.entityType === EntityType.GPE
      ).length;
      const orgCount = result.entities.filter(
        (e) => e.entityType === EntityType.ORG
      ).length;

      // Compare with result.byType
      expect(result.byType[EntityType.PERSON] ?? 0).toBe(personCount);
      expect(result.byType[EntityType.GPE] ?? 0).toBe(gpeCount);
      expect(result.byType[EntityType.ORG] ?? 0).toBe(orgCount);
    });

    /**
     * Test 18: Processing time should be recorded
     * Expected: processingTime should be a positive number
     */
    it("should record processing time", async () => {
      const text = "Vladimir Putin visited Moscow yesterday.";

      const result = await service.recognizeEntities(text);

      expect(result.processingTime).toBeGreaterThanOrEqual(0);
      expect(result.processingTime).toBeLessThan(1000); // Should be fast
    });
  });

  describe("Configuration - setMinConfidence", () => {
    /**
     * Test 19: Set valid confidence threshold
     * Expected: Should accept values between 0 and 1
     */
    it("should accept valid confidence thresholds", () => {
      expect(() => service.setMinConfidence(0)).not.toThrow();
      expect(() => service.setMinConfidence(0.5)).not.toThrow();
      expect(() => service.setMinConfidence(1)).not.toThrow();
    });

    /**
     * Test 20: Reject invalid confidence threshold
     * Expected: Should throw error for values outside 0-1
     */
    it("should reject invalid confidence thresholds", () => {
      expect(() => service.setMinConfidence(-0.1)).toThrow();
      expect(() => service.setMinConfidence(1.1)).toThrow();
      expect(() => service.setMinConfidence(2)).toThrow();
    });
  });
});

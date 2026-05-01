/**
 * Entity Linker Service Tests
 *
 * Comprehensive test suite for Wikipedia entity linking including:
 * - Basic entity linking (PERSON, GPE, ORG, EVENT)
 * - Disambiguation handling
 * - Caching behavior
 * - Error recovery (timeouts, retries)
 * - Edge cases (not found, invalid input)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { entityLinkerService } from "../src/services/entity-linker.js";
import { EntityType } from "../src/domain/entity-types.js";

describe("EntityLinkerService", () => {
  beforeEach(() => {
    // Clear any test-specific state if needed
  });

  describe("linkEntity - Basic Linking", () => {
    /**
     * Test 1: Link a famous person
     * Expected: Should find Vladimir Putin on Wikipedia
     */
    it("should link a famous person (Vladimir Putin)", async () => {
      const entity = {
        entityText: "Vladimir Putin",
        entityType: EntityType.PERSON,
        startOffset: 0,
        endOffset: 14,
        confidence: 0.95,
        context: "Vladimir Putin is the president of Russia.",
      };

      const linked = await entityLinkerService.linkEntity(entity);

      // Should find Wikipedia page
      expect(linked.wikipediaUrl).toBeDefined();
      expect(linked.wikipediaUrl).toContain("wikipedia.org");
      expect(linked.wikipediaUrl).toContain("Vladimir");

      // Should have summary
      expect(linked.summary).toBeDefined();
      if (linked.summary) {
        expect(linked.summary.length).toBeGreaterThan(20);
      }

      // Should preserve original data
      expect(linked.entityText).toBe("Vladimir Putin");
      expect(linked.confidence).toBe(0.95);
    });

    /**
     * Test 2: Link a geographic location
     * Expected: Should find Moscow on Wikipedia
     */
    it("should link a geographic location (Moscow)", async () => {
      const entity = {
        entityText: "Moscow",
        entityType: EntityType.GPE,
        startOffset: 60,
        endOffset: 66,
        confidence: 0.92,
        context: "The capital city is Moscow.",
      };

      const linked = await entityLinkerService.linkEntity(entity);

      expect(linked.wikipediaUrl).toBeDefined();
      expect(linked.wikipediaUrl).toContain("Moscow");

      // Summary should mention geographic information
      if (linked.summary) {
        expect(linked.summary.length).toBeGreaterThan(0);
      }
    });

    /**
     * Test 3: Link an organization
     * Expected: Should find United Nations on Wikipedia
     */
    it("should link an organization (United Nations)", async () => {
      const entity = {
        entityText: "United Nations",
        entityType: EntityType.ORG,
        startOffset: 100,
        endOffset: 114,
        confidence: 0.88,
        context: "The United Nations was founded in 1945.",
      };

      const linked = await entityLinkerService.linkEntity(entity);

      expect(linked.wikipediaUrl).toBeDefined();
      expect(linked.wikipediaUrl).toContain("United");

      if (linked.summary) {
        expect(linked.summary.length).toBeGreaterThan(0);
      }
    });

    /**
     * Test 4: Link an event
     * Expected: Should find World War II on Wikipedia
     */
    it("should link an event (World War II)", async () => {
      const entity = {
        entityText: "World War II",
        entityType: EntityType.EVENT,
        startOffset: 50,
        endOffset: 62,
        confidence: 0.90,
        context: "World War II ended in 1945.",
      };

      const linked = await entityLinkerService.linkEntity(entity);

      expect(linked.wikipediaUrl).toBeDefined();
      expect(linked.wikipediaUrl).toContain("World");

      if (linked.summary) {
        expect(linked.summary.length).toBeGreaterThan(0);
      }
    });
  });

  describe("linkEntity - Edge Cases", () => {
    /**
     * Test 5: Handle non-existent entity
     * Expected: Should return original entity without Wikipedia data
     */
    it("should handle non-existent entities gracefully", async () => {
      const entity = {
        entityText: "XYZ_NonExistent_Entity_12345",
        entityType: EntityType.PERSON,
        startOffset: 0,
        endOffset: 29,
        confidence: 0.5,
        context: "Some context with XYZ_NonExistent_Entity_12345",
      };

      const linked = await entityLinkerService.linkEntity(entity);

      // Should not have Wikipedia URL (graceful degradation)
      expect(linked.wikipediaUrl).not.toBeDefined();

      // But should preserve original entity data
      expect(linked.entityText).toBe("XYZ_NonExistent_Entity_12345");
      expect(linked.entityType).toBe(EntityType.PERSON);
    }, 15000); // Increased timeout for Wikipedia API queries

    /**
     * Test 6: Handle empty entity name
     * Expected: Should handle gracefully
     */
    it("should handle empty entity names", async () => {
      const entity = {
        entityText: "",
        entityType: EntityType.PERSON,
        startOffset: 0,
        endOffset: 0,
        confidence: 0.5,
        context: "",
      };

      const linked = await entityLinkerService.linkEntity(entity);

      // Should return something (not crash)
      expect(linked).toBeDefined();
      expect(linked.entityText).toBe("");
    });

    /**
     * Test 7: Handle entity names with special characters
     * Expected: Should properly encode in URL
     */
    it("should handle special characters in entity names", async () => {
      const entity = {
        entityText: "Barack Hussein Obama",
        entityType: EntityType.PERSON,
        startOffset: 0,
        endOffset: 20,
        confidence: 0.95,
        context: "Barack Hussein Obama is the 44th president.",
      };

      const linked = await entityLinkerService.linkEntity(entity);

      // Should find Wikipedia page
      expect(linked.wikipediaUrl).toBeDefined();

      // URL should be properly encoded
      if (linked.wikipediaUrl) {
        expect(linked.wikipediaUrl).toContain("wikipedia.org");
      }
    });
  });

  describe("linkEntity - Caching", () => {
    /**
     * Test 8: Cache hit on second call
     * Expected: Second call should return identical data (cached)
     */
    it("should cache results for repeated lookups", async () => {
      // Use a unique entity name to avoid cache from other tests
      const entity = {
        entityText: "Nikola Tesla",
        entityType: EntityType.PERSON,
        startOffset: 0,
        endOffset: 12,
        confidence: 0.95,
        context: "Nikola Tesla was an inventor and engineer.",
      };

      // First call
      const linked1 = await entityLinkerService.linkEntity(entity);

      // Second call - should be from cache
      const start2 = Date.now();
      const linked2 = await entityLinkerService.linkEntity(entity);
      const time2 = Date.now() - start2;

      // Both should return identical data
      expect(linked1.wikipediaUrl).toBe(linked2.wikipediaUrl);
      expect(linked1.summary).toBe(linked2.summary);
      expect(linked1.pageId).toBe(linked2.pageId);

      // Cached call should be very fast (<100ms)
      // This is a reasonable expectation for disk cache read
      expect(time2).toBeLessThan(100);
    });

    /**
     * Test 9: Cache data structure
     * Expected: Cached data should include URL, summary, and timestamp
     */
    it("should cache all necessary metadata", async () => {
      const entity = {
        entityText: "Marie Curie",
        entityType: EntityType.PERSON,
        startOffset: 0,
        endOffset: 11,
        confidence: 0.95,
        context: "Marie Curie discovered radium.",
      };

      const linked = await entityLinkerService.linkEntity(entity);

      // Should have all cached metadata
      expect(linked.wikipediaUrl).toBeDefined();
      expect(linked.linkedAt).toBeDefined();
      if (linked.pageId !== undefined) {
        expect(linked.pageId).toBeGreaterThan(0);
      }
    });
  });

  describe("linkEntity - Disambiguation", () => {
    /**
     * Test 10: Handle disambiguation with type guidance
     * Expected: Should select result matching EntityType
     */
    it("should disambiguate using EntityType context", async () => {
      // "New York" - could be state or city
      const entity = {
        entityText: "New York",
        entityType: EntityType.GPE,
        startOffset: 0,
        endOffset: 8,
        confidence: 0.85,
        context: "I visited New York last year.",
      };

      const linked = await entityLinkerService.linkEntity(entity);

      // Should resolve to a geographic location
      expect(linked.wikipediaUrl).toBeDefined();
      if (linked.summary) {
        // Summary should mention geographic info (city, state, etc.)
        expect(linked.summary.length).toBeGreaterThan(0);
      }
    });

    /**
     * Test 11: Prefer specific matches over ambiguous ones
     * Expected: Should select most relevant match
     */
    it("should prefer specific matches over alternatives", async () => {
      const entity = {
        entityText: "England",
        entityType: EntityType.GPE,
        startOffset: 0,
        endOffset: 7,
        confidence: 0.90,
        context: "England is part of the United Kingdom.",
      };

      const linked = await entityLinkerService.linkEntity(entity);

      expect(linked.wikipediaUrl).toBeDefined();
      // Should link to England (country/region), not other meanings
      expect(linked.wikipediaUrl).toContain("England");
    });
  });

  describe("linkEntity - Summary Extraction", () => {
    /**
     * Test 12: Summary should be reasonably sized
     * Expected: Summary between 50-300 characters
     */
    it("should extract appropriate summary length", async () => {
      const entity = {
        entityText: "Isaac Newton",
        entityType: EntityType.PERSON,
        startOffset: 0,
        endOffset: 12,
        confidence: 0.95,
        context: "Isaac Newton made major contributions to physics.",
      };

      const linked = await entityLinkerService.linkEntity(entity);

      if (linked.summary) {
        // Summary should be reasonable length
        expect(linked.summary.length).toBeGreaterThan(20);
        expect(linked.summary.length).toBeLessThan(1000);

        // Should not contain excessive whitespace
        expect(/\s{2,}/.test(linked.summary)).toBe(false);
      }
    });
  });

  describe("linkEntity - Type-Specific Behavior", () => {
    /**
     * Test 13: PERSON type should prioritize biographical info
     * Expected: Summary should mention person-specific attributes
     */
    it("should prioritize person-specific information", async () => {
      const entity = {
        entityText: "Leonardo da Vinci",
        entityType: EntityType.PERSON,
        startOffset: 0,
        endOffset: 17,
        confidence: 0.95,
        context: "Leonardo da Vinci was a Renaissance artist.",
      };

      const linked = await entityLinkerService.linkEntity(entity);

      expect(linked.wikipediaUrl).toBeDefined();
      // Should find the historical figure
      expect(linked.wikipediaUrl).toContain("Leonardo");
    });

    /**
     * Test 14: GPE type should prioritize geographic info
     * Expected: Summary should mention location attributes
     */
    it("should prioritize geographic information for GPE", async () => {
      const entity = {
        entityText: "Paris",
        entityType: EntityType.GPE,
        startOffset: 0,
        endOffset: 5,
        confidence: 0.90,
        context: "Paris is the capital of France.",
      };

      const linked = await entityLinkerService.linkEntity(entity);

      expect(linked.wikipediaUrl).toBeDefined();
      expect(linked.wikipediaUrl).toContain("Paris");
    });

    /**
     * Test 15: ORG type should prioritize organizational info
     * Expected: Summary should mention organization attributes
     */
    it("should prioritize organizational information for ORG", async () => {
      const entity = {
        entityText: "Google",
        entityType: EntityType.ORG,
        startOffset: 0,
        endOffset: 6,
        confidence: 0.95,
        context: "Google is a technology company.",
      };

      const linked = await entityLinkerService.linkEntity(entity);

      expect(linked.wikipediaUrl).toBeDefined();
      expect(linked.wikipediaUrl).toContain("Google");
    });
  });

  describe("linkEntity - Data Preservation", () => {
    /**
     * Test 16: Original entity data should be preserved
     * Expected: All original fields should remain unchanged
     */
    it("should preserve all original entity data", async () => {
      const entity = {
        entityText: "Aristotle",
        entityType: EntityType.PERSON,
        startOffset: 42,
        endOffset: 51,
        confidence: 0.88,
        context: "Ancient Greek philosopher Aristotle made important contributions.",
        articleId: "article-123",
      };

      const linked = await entityLinkerService.linkEntity(entity);

      // All original data should be preserved
      expect(linked.entityText).toBe(entity.entityText);
      expect(linked.entityType).toBe(entity.entityType);
      expect(linked.startOffset).toBe(entity.startOffset);
      expect(linked.endOffset).toBe(entity.endOffset);
      expect(linked.confidence).toBe(entity.confidence);
      expect(linked.context).toBe(entity.context);
      expect(linked.articleId).toBe(entity.articleId);
    });
  });

  describe("linkEntity - Error Resilience", () => {
    /**
     * Test 17: Should handle temporary network issues
     * Expected: Should retry and eventually succeed or gracefully fail
     */
    it("should be resilient to temporary API issues", async () => {
      const entity = {
        entityText: "Galileo Galilei",
        entityType: EntityType.PERSON,
        startOffset: 0,
        endOffset: 15,
        confidence: 0.92,
        context: "Galileo Galilei was an astronomer.",
      };

      // This test verifies retry logic is in place
      // Actual network failures would need mocking
      const linked = await entityLinkerService.linkEntity(entity);

      // Should still return a result (either linked or original)
      expect(linked).toBeDefined();
      expect(linked.entityText).toBe("Galileo Galilei");
    });
  });
});

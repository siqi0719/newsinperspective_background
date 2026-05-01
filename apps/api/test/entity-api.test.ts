/**
 * Entity API Tests
 *
 * Test suite for entity recognition and linking API services.
 * These tests validate the structure and logic of entity query methods.
 *
 * Note: These tests use mocked Prisma to avoid database dependencies
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { EntityQueryService } from "../src/services/entity-query.js";
import { EntityType } from "@prisma/client";

describe("Entity Query Service", () => {
  let service: EntityQueryService;
  let mockPrisma: any;

  beforeEach(() => {
    // Create a mock Prisma client
    mockPrisma = {
      entityMention: {
        findMany: vi.fn(),
      },
      namedEntity: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };

    service = new EntityQueryService(mockPrisma);
  });

  describe("getArticleEntities", () => {
    it("should return entities for an article", async () => {
      const mockMentions = [
        {
          id: "mention-1",
          entityId: "entity-1",
          entity: {
            id: "entity-1",
            name: "Vladimir Putin",
            type: EntityType.PERSON,
            wikiId: "12345",
            wikipediaUrl: "https://en.wikipedia.org/wiki/Vladimir_Putin",
            wikidataId: "Q7747",
            summary: "Vladimir Vladimirovich Putin is the president of Russia",
            imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Putin.jpg",
            infoboxJson: null,
            firstSeen: new Date(),
            lastUpdated: new Date(),
          },
          articleId: "article-1",
          startOffset: 0,
          endOffset: 14,
          context: "Vladimir Putin met with...",
          confidence: 0.95,
          createdAt: new Date(),
        },
        {
          id: "mention-2",
          entityId: "entity-2",
          entity: {
            id: "entity-2",
            name: "Moscow",
            type: EntityType.GPE,
            wikiId: "12346",
            wikipediaUrl: "https://en.wikipedia.org/wiki/Moscow",
            wikidataId: "Q649",
            summary: "Moscow is the capital and largest city of Russia",
            imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Moscow.jpg",
            infoboxJson: null,
            firstSeen: new Date(),
            lastUpdated: new Date(),
          },
          articleId: "article-1",
          startOffset: 50,
          endOffset: 56,
          context: "...in Moscow, Putin announced...",
          confidence: 0.92,
          createdAt: new Date(),
        },
      ];

      mockPrisma.entityMention.findMany.mockResolvedValueOnce(mockMentions);

      const entities = await service.getArticleEntities("article-1", {
        limit: 50,
      });

      // Verify structure
      expect(Array.isArray(entities)).toBe(true);
      expect(entities.length).toBe(2);

      // Verify first entity
      const first = entities[0];
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("entityText");
      expect(first).toHaveProperty("entityType");
      expect(first).toHaveProperty("confidence");
      expect(first).toHaveProperty("startOffset");
      expect(first).toHaveProperty("endOffset");
      expect(first.entityText).toBe("Vladimir Putin");
      expect(first.entityType).toBe(EntityType.PERSON);
      expect(first.confidence).toBe(0.95);
    });

    it("should apply type filter correctly", async () => {
      mockPrisma.entityMention.findMany.mockResolvedValueOnce([]);

      await service.getArticleEntities("article-1", {
        type: EntityType.PERSON,
        limit: 50,
      });

      // Verify the filter was passed correctly
      expect(mockPrisma.entityMention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            articleId: "article-1",
            entity: { type: EntityType.PERSON },
          }),
        })
      );
    });

    it("should apply confidence filter correctly", async () => {
      mockPrisma.entityMention.findMany.mockResolvedValueOnce([]);

      await service.getArticleEntities("article-1", {
        minConfidence: 0.9,
        limit: 50,
      });

      // Verify the filter was passed correctly
      expect(mockPrisma.entityMention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            confidence: { gte: 0.9 },
          }),
        })
      );
    });

    it("should respect limit parameter", async () => {
      mockPrisma.entityMention.findMany.mockResolvedValueOnce([]);

      await service.getArticleEntities("article-1", {
        limit: 10,
      });

      // Verify limit was passed
      expect(mockPrisma.entityMention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        })
      );
    });

    it("should use default limit of 50", async () => {
      mockPrisma.entityMention.findMany.mockResolvedValueOnce([]);

      await service.getArticleEntities("article-1", {});

      // Verify default limit
      expect(mockPrisma.entityMention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });

    it("should order by confidence descending", async () => {
      mockPrisma.entityMention.findMany.mockResolvedValueOnce([]);

      await service.getArticleEntities("article-1", {});

      // Verify ordering
      expect(mockPrisma.entityMention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { confidence: "desc" },
        })
      );
    });
  });

  describe("searchEntities", () => {
    it("should search entities by name", async () => {
      const mockResults = [
        {
          id: "entity-1",
          name: "Vladimir Putin",
          type: EntityType.PERSON,
          wikiId: "12345",
          wikipediaUrl: "https://en.wikipedia.org/wiki/Vladimir_Putin",
          wikidataId: "Q7747",
          summary: "Vladimir Vladimirovich Putin",
          imageUrl: null,
          infoboxJson: null,
          firstSeen: new Date(),
          lastUpdated: new Date(),
          mentions: [
            { id: "m1", entityId: "entity-1", articleId: "a1", startOffset: 0, endOffset: 14, context: "", confidence: 0.95, createdAt: new Date() },
            { id: "m2", entityId: "entity-1", articleId: "a2", startOffset: 0, endOffset: 14, context: "", confidence: 0.9, createdAt: new Date() },
          ],
          statistics: {
            id: "stat-1",
            entityId: "entity-1",
            totalMentions: 2,
            uniqueArticles: 2,
            mentions7Days: 1,
            mentions30Days: 2,
            averagePosition: 0.5,
            lastUpdated: new Date(),
          },
        },
      ];

      mockPrisma.namedEntity.count.mockResolvedValueOnce(1);
      mockPrisma.namedEntity.findMany.mockResolvedValueOnce(mockResults);

      const { results, totalResults } = await service.searchEntities("Putin", {
        limit: 10,
      });

      // Verify search worked
      expect(totalResults).toBe(1);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      // Verify result structure
      const result = results[0];
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("name");
      expect(result).toHaveProperty("type");
      expect(result).toHaveProperty("mentionsCount");
      expect(result).toHaveProperty("articlesCount");
      expect(result).toHaveProperty("relevanceScore");
    });

    it("should filter by entity type in search", async () => {
      mockPrisma.namedEntity.count.mockResolvedValueOnce(0);
      mockPrisma.namedEntity.findMany.mockResolvedValueOnce([]);

      await service.searchEntities("Putin", {
        type: EntityType.PERSON,
        limit: 10,
      });

      // Verify type filter was applied
      expect(mockPrisma.namedEntity.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: EntityType.PERSON,
          }),
        })
      );
    });

    it("should support pagination with offset", async () => {
      mockPrisma.namedEntity.count.mockResolvedValueOnce(100);
      mockPrisma.namedEntity.findMany.mockResolvedValueOnce([]);

      await service.searchEntities("Putin", {
        limit: 10,
        offset: 20,
      });

      // Verify pagination parameters
      expect(mockPrisma.namedEntity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        })
      );
    });

    it("should handle empty search results", async () => {
      mockPrisma.namedEntity.count.mockResolvedValueOnce(0);
      mockPrisma.namedEntity.findMany.mockResolvedValueOnce([]);

      const { results, totalResults } = await service.searchEntities(
        "XYZ_NonExistent",
        {}
      );

      expect(totalResults).toBe(0);
      expect(results.length).toBe(0);
    });

    it("should provide relevance scores between 0 and 1", async () => {
      const mockResults = [
        {
          id: "entity-1",
          name: "Vladimir Putin",
          type: EntityType.PERSON,
          wikiId: "12345",
          wikipediaUrl: "https://en.wikipedia.org/wiki/Vladimir_Putin",
          wikidataId: "Q7747",
          summary: null,
          imageUrl: null,
          infoboxJson: null,
          firstSeen: new Date(),
          lastUpdated: new Date(),
          mentions: [{ id: "m1", entityId: "entity-1", articleId: "a1", startOffset: 0, endOffset: 14, context: "", confidence: 0.95, createdAt: new Date() }],
          statistics: {
            id: "stat-1",
            entityId: "entity-1",
            totalMentions: 10,
            uniqueArticles: 5,
            mentions7Days: 2,
            mentions30Days: 5,
            averagePosition: 0.5,
            lastUpdated: new Date(),
          },
        },
      ];

      mockPrisma.namedEntity.count.mockResolvedValueOnce(1);
      mockPrisma.namedEntity.findMany.mockResolvedValueOnce(mockResults);

      const { results } = await service.searchEntities("Vladimir", {});

      results.forEach((result) => {
        expect(result.relevanceScore).toBeGreaterThanOrEqual(0);
        expect(result.relevanceScore).toBeLessThanOrEqual(1);
      });
    });
  });

  describe("getEntityDetail", () => {
    it("should return entity detail with statistics", async () => {
      const mockMentions = [
        {
          id: "m1",
          entityId: "entity-1",
          articleId: "a1",
          startOffset: 0,
          endOffset: 14,
          context: "Vladimir Putin met...",
          confidence: 0.95,
          createdAt: new Date(),
          article: {
            id: "a1",
            canonicalUrl: "https://example.com/1",
            title: "Article about Putin",
            domain: "example.com",
            publishedAt: new Date(),
            createdAt: new Date(),
          },
        },
      ];

      const mockEntity = {
        id: "entity-1",
        name: "Vladimir Putin",
        type: EntityType.PERSON,
        wikiId: "12345",
        wikipediaUrl: "https://en.wikipedia.org/wiki/Vladimir_Putin",
        wikidataId: "Q7747",
        summary: "Vladimir Vladimirovich Putin",
        imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Putin.jpg",
        infoboxJson: null,
        firstSeen: new Date(),
        lastUpdated: new Date(),
        statistics: {
          id: "stat-1",
          entityId: "entity-1",
          totalMentions: 100,
          uniqueArticles: 50,
          mentions7Days: 10,
          mentions30Days: 40,
          averagePosition: 0.5,
          lastUpdated: new Date(),
        },
        mentions: mockMentions,
        cooccurrence1: [
          {
            id: "cooc-1",
            entity1Id: "entity-1",
            entity2Id: "entity-2",
            cooccurrenceCount: 10,
            lastDate: new Date(),
            entity2: {
              id: "entity-2",
              name: "Russia",
              type: EntityType.GPE,
              wikiId: "12346",
              wikipediaUrl: "https://en.wikipedia.org/wiki/Russia",
              wikidataId: "Q159",
              summary: null,
              imageUrl: null,
              infoboxJson: null,
              firstSeen: new Date(),
              lastUpdated: new Date(),
            },
          },
        ],
      };

      mockPrisma.namedEntity.findUnique.mockResolvedValueOnce(mockEntity);
      // Mock the second findMany call for getting all mentions
      mockPrisma.entityMention.findMany.mockResolvedValueOnce(mockMentions);

      const detail = await service.getEntityDetail("entity-1");

      // Verify basic structure
      expect(detail.id).toBe("entity-1");
      expect(detail.name).toBe("Vladimir Putin");
      expect(detail.type).toBe(EntityType.PERSON);

      // Verify statistics structure
      expect(detail.statistics).toHaveProperty("totalMentions");
      expect(detail.statistics).toHaveProperty("articlesCount");
      expect(detail.statistics).toHaveProperty("mentions7Days");
      expect(detail.statistics).toHaveProperty("mentions30Days");
      expect(detail.statistics).toHaveProperty("topArticles");
      expect(detail.statistics).toHaveProperty("topDomains");
      expect(detail.statistics).toHaveProperty("cooccurrences");
      expect(detail.statistics).toHaveProperty("trend");

      // Verify types
      expect(typeof detail.statistics.totalMentions).toBe("number");
      expect(Array.isArray(detail.statistics.topArticles)).toBe(true);
      expect(Array.isArray(detail.statistics.cooccurrences)).toBe(true);
    });

    it("should throw error for non-existent entity", async () => {
      mockPrisma.namedEntity.findUnique.mockResolvedValueOnce(null);

      await expect(service.getEntityDetail("non-existent")).rejects.toThrow(
        "Entity not found"
      );
    });

    it("should include Wikipedia metadata in detail", async () => {
      const mockEntity = {
        id: "entity-1",
        name: "Vladimir Putin",
        type: EntityType.PERSON,
        wikiId: "12345",
        wikipediaUrl: "https://en.wikipedia.org/wiki/Vladimir_Putin",
        wikidataId: "Q7747",
        summary: "Vladimir Vladimirovich Putin is the president of Russia",
        imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Putin.jpg",
        infoboxJson: null,
        firstSeen: new Date(),
        lastUpdated: new Date(),
        statistics: {
          id: "stat-1",
          entityId: "entity-1",
          totalMentions: 100,
          uniqueArticles: 50,
          mentions7Days: 10,
          mentions30Days: 40,
          averagePosition: 0.5,
          lastUpdated: new Date(),
        },
        mentions: [],
        cooccurrence1: [],
      };

      mockPrisma.namedEntity.findUnique.mockResolvedValueOnce(mockEntity);
      // Mock the second findMany call for getting all mentions
      mockPrisma.entityMention.findMany.mockResolvedValueOnce([]);

      const detail = await service.getEntityDetail("entity-1");

      expect(detail.wikipediaUrl).toBe(mockEntity.wikipediaUrl);
      expect(detail.summary).toBe(mockEntity.summary);
      expect(detail.imageUrl).toBe(mockEntity.imageUrl);
      expect(detail.wikidataId).toBe(mockEntity.wikidataId);
    });
  });

  describe("Error Handling", () => {
    it("should handle database query errors gracefully", async () => {
      mockPrisma.entityMention.findMany.mockRejectedValueOnce(
        new Error("Database connection failed")
      );

      await expect(
        service.getArticleEntities("article-1", {})
      ).rejects.toThrow("Database connection failed");
    });

    it("should handle missing entity gracefully", async () => {
      mockPrisma.namedEntity.findUnique.mockResolvedValueOnce(null);

      await expect(service.getEntityDetail("missing-id")).rejects.toThrow(
        "Entity not found"
      );
    });
  });

  describe("Validation", () => {
    it("should use default values for missing parameters", async () => {
      mockPrisma.entityMention.findMany.mockResolvedValueOnce([]);

      await service.getArticleEntities("article-1", {});

      // Verify defaults were used
      expect(mockPrisma.entityMention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            confidence: { gte: 0 },
          }),
          take: 50,
        })
      );
    });

    it("should handle large limit values", async () => {
      mockPrisma.entityMention.findMany.mockResolvedValueOnce([]);

      await service.getArticleEntities("article-1", {
        limit: 99999,
      });

      // Service should accept it (frontend validation will constrain)
      expect(mockPrisma.entityMention.findMany).toHaveBeenCalled();
    });
  });
});

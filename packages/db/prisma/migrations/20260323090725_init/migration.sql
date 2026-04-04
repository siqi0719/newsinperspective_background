-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('ARTICLE', 'CLUSTER');

-- CreateTable
CREATE TABLE "FeedSource" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT,
    "sourceName" TEXT,
    "domain" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL,
    "ingestionDate" TIMESTAMP(3) NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "feedCount" INTEGER NOT NULL DEFAULT 0,
    "articleCount" INTEGER NOT NULL DEFAULT 0,
    "clusterCount" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedFetch" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "feedSourceId" TEXT NOT NULL,
    "statusCode" INTEGER,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorMessage" TEXT,
    "rawHash" TEXT,
    "itemCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FeedFetch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "contentSnippet" TEXT,
    "publishedAt" TIMESTAMP(3),
    "sourceName" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "language" TEXT,
    "category" TEXT,
    "ingestionDate" TIMESTAMP(3) NOT NULL,
    "authorNames" TEXT[],
    "feedSourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleRaw" (
    "id" TEXT NOT NULL,
    "articleId" TEXT,
    "feedFetchId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleRaw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryCluster" (
    "id" TEXT NOT NULL,
    "clusterKey" TEXT NOT NULL,
    "storyDate" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "topCategory" TEXT,
    "articleCount" INTEGER NOT NULL DEFAULT 0,
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClusterArticle" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "similarity" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ClusterArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceProfile" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "articleCount" INTEGER NOT NULL DEFAULT 0,
    "averageSentiment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commonBiasSignals" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NlpFeature" (
    "id" TEXT NOT NULL,
    "scopeType" "ScopeType" NOT NULL,
    "articleId" TEXT,
    "clusterId" TEXT,
    "featureSet" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NlpFeature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeedSource_url_key" ON "FeedSource"("url");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionRun_ingestionDate_key" ON "IngestionRun"("ingestionDate");

-- CreateIndex
CREATE UNIQUE INDEX "FeedFetch_runId_feedSourceId_key" ON "FeedFetch"("runId", "feedSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Article_canonicalUrl_key" ON "Article"("canonicalUrl");

-- CreateIndex
CREATE UNIQUE INDEX "StoryCluster_clusterKey_storyDate_key" ON "StoryCluster"("clusterKey", "storyDate");

-- CreateIndex
CREATE UNIQUE INDEX "ClusterArticle_clusterId_articleId_key" ON "ClusterArticle"("clusterId", "articleId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceProfile_domain_key" ON "SourceProfile"("domain");

-- AddForeignKey
ALTER TABLE "FeedFetch" ADD CONSTRAINT "FeedFetch_runId_fkey" FOREIGN KEY ("runId") REFERENCES "IngestionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedFetch" ADD CONSTRAINT "FeedFetch_feedSourceId_fkey" FOREIGN KEY ("feedSourceId") REFERENCES "FeedSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_feedSourceId_fkey" FOREIGN KEY ("feedSourceId") REFERENCES "FeedSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRaw" ADD CONSTRAINT "ArticleRaw_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRaw" ADD CONSTRAINT "ArticleRaw_feedFetchId_fkey" FOREIGN KEY ("feedFetchId") REFERENCES "FeedFetch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterArticle" ADD CONSTRAINT "ClusterArticle_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "StoryCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterArticle" ADD CONSTRAINT "ClusterArticle_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NlpFeature" ADD CONSTRAINT "NlpFeature_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NlpFeature" ADD CONSTRAINT "NlpFeature_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "StoryCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "ExtractionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

ALTER TABLE "Article"
ADD COLUMN "fullText" TEXT,
ADD COLUMN "fullTextFormat" TEXT,
ADD COLUMN "extractionStatus" "ExtractionStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "extractedAt" TIMESTAMP(3),
ADD COLUMN "extractionError" TEXT;

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "duplicateCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "duplicateDomains" TEXT[],
ADD COLUMN     "textFingerprint" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Article_textFingerprint_key" ON "Article"("textFingerprint");

-- CreateIndex
CREATE INDEX "Article_textFingerprint_idx" ON "Article"("textFingerprint");

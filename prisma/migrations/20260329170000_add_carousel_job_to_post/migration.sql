-- CreateEnum
CREATE TYPE "CarouselJobStatus" AS ENUM ('PENDING', 'GENERATING', 'RENDERING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "CarouselSlideStatus" AS ENUM ('PENDING', 'FAILED_IMAGE', 'REGENERATING', 'APPROVED');

-- CreateTable
CREATE TABLE "CarouselJob" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "direction" TEXT,
    "status" "CarouselJobStatus" NOT NULL DEFAULT 'PENDING',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "progress" JSONB,
    "errorMessage" TEXT,
    "pipelineMeta" JSONB,
    "caption" TEXT,
    "hashtags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarouselJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarouselSlide" (
    "id" TEXT NOT NULL,
    "carouselJobId" TEXT NOT NULL,
    "slideIndex" INTEGER NOT NULL,
    "role" "SlideRole" NOT NULL,
    "headline" TEXT,
    "body" TEXT,
    "supportingDetail" TEXT,
    "factType" TEXT,
    "containsNumber" BOOLEAN NOT NULL DEFAULT false,
    "concretenessScore" INTEGER NOT NULL DEFAULT 3,
    "noveltyScore" INTEGER NOT NULL DEFAULT 3,
    "topicEntity" TEXT,
    "displayTitle" TEXT,
    "displaySupport" TEXT,
    "imageUrl" TEXT,
    "imageError" TEXT,
    "status" "CarouselSlideStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarouselSlide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CarouselSlide_carouselJobId_idx" ON "CarouselSlide"("carouselJobId");

-- CreateIndex
CREATE UNIQUE INDEX "CarouselSlide_carouselJobId_slideIndex_key" ON "CarouselSlide"("carouselJobId", "slideIndex");

-- AddForeignKey
ALTER TABLE "CarouselSlide" ADD CONSTRAINT "CarouselSlide_carouselJobId_fkey" FOREIGN KEY ("carouselJobId") REFERENCES "CarouselJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add ChannelStatus variant
ALTER TYPE "ChannelStatus" ADD VALUE IF NOT EXISTS 'STRATEGY_DEFINED';

-- Add Channel columns
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "contentIntent" TEXT;
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "contentStrategy" JSONB;

-- Add NicheOption column
ALTER TABLE "NicheOption" ADD COLUMN IF NOT EXISTS "contentIntent" TEXT;

-- Add Slide display columns
ALTER TABLE "Slide" ADD COLUMN IF NOT EXISTS "displayTitle" TEXT;
ALTER TABLE "Slide" ADD COLUMN IF NOT EXISTS "displaySupport" TEXT;

-- AlterTable: Add carouselJobId to Post
ALTER TABLE "Post" ADD COLUMN "carouselJobId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Post_carouselJobId_key" ON "Post"("carouselJobId");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_carouselJobId_fkey" FOREIGN KEY ("carouselJobId") REFERENCES "CarouselJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

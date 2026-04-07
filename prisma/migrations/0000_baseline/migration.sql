-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."ChannelStatus" AS ENUM ('DRAFT', 'NICHE_SELECTED', 'POSITIONED', 'HOOKS_GENERATED', 'CONTENT_GENERATED', 'COMPLETE', 'NAMED');

-- CreateEnum
CREATE TYPE "public"."JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."JobType" AS ENUM ('NICHE_GENERATION', 'POSITIONING', 'HOOK_GENERATION', 'POST_GENERATION', 'CAPTION_GENERATION', 'REGENERATION');

-- CreateEnum
CREATE TYPE "public"."NicheSelectionMode" AS ENUM ('DISCOVER', 'EXPLORE', 'DIRECT');

-- CreateEnum
CREATE TYPE "public"."PostPattern" AS ENUM ('CONTRAST', 'MISTAKE', 'MYTH', 'LIST', 'STORY', 'BREAKDOWN', 'OPINION');

-- CreateEnum
CREATE TYPE "public"."PostStatus" AS ENUM ('DRAFT', 'GENERATED', 'REVIEWED', 'APPROVED');

-- CreateEnum
CREATE TYPE "public"."PostType" AS ENUM ('CONTRARIAN', 'CALL_OUT', 'MISTAKE_EXPOSURE', 'HIDDEN_TRUTH');

-- CreateEnum
CREATE TYPE "public"."SlideRole" AS ENUM ('HOOK', 'SETUP', 'BUILD', 'TWIST', 'INSIGHT', 'CTA');

-- CreateTable
CREATE TABLE "public"."Caption" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "hashtags" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Caption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Channel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Untitled Channel',
    "language" TEXT NOT NULL DEFAULT 'en',
    "niche" TEXT,
    "status" "public"."ChannelStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "exploreTopic" TEXT,
    "nicheMode" "public"."NicheSelectionMode" NOT NULL DEFAULT 'DISCOVER',

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChannelMemory" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "aggressionLevel" DOUBLE PRECISION NOT NULL,
    "style" TEXT NOT NULL,
    "avoidPatterns" JSONB NOT NULL,
    "preferredHooks" JSONB NOT NULL,
    "forbiddenWords" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChannelPositioning" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "contentStyle" TEXT NOT NULL,
    "audienceFeel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelPositioning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GenerationJob" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "postId" TEXT,
    "jobType" "public"."JobType" NOT NULL,
    "status" "public"."JobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "result" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NicheOption" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "competitionScore" INTEGER NOT NULL,
    "viralityScore" INTEGER NOT NULL,
    "contentEaseScore" INTEGER NOT NULL,
    "monetizationScore" INTEGER NOT NULL,
    "rationale" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NicheOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Post" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "type" "public"."PostType" NOT NULL,
    "status" "public"."PostStatus" NOT NULL DEFAULT 'DRAFT',
    "publishDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "visualHint" TEXT,
    "pattern" "public"."PostPattern",

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Slide" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "slideIndex" INTEGER NOT NULL,
    "role" "public"."SlideRole" NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Slide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Caption_postId_key" ON "public"."Caption"("postId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelMemory_channelId_key" ON "public"."ChannelMemory"("channelId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelPositioning_channelId_key" ON "public"."ChannelPositioning"("channelId" ASC);

-- CreateIndex
CREATE INDEX "GenerationJob_channelId_jobType_idx" ON "public"."GenerationJob"("channelId" ASC, "jobType" ASC);

-- CreateIndex
CREATE INDEX "NicheOption_channelId_idx" ON "public"."NicheOption"("channelId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Post_channelId_dayIndex_key" ON "public"."Post"("channelId" ASC, "dayIndex" ASC);

-- CreateIndex
CREATE INDEX "Post_channelId_idx" ON "public"."Post"("channelId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Slide_postId_slideIndex_key" ON "public"."Slide"("postId" ASC, "slideIndex" ASC);

-- AddForeignKey
ALTER TABLE "public"."Caption" ADD CONSTRAINT "Caption_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChannelMemory" ADD CONSTRAINT "ChannelMemory_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "public"."Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChannelPositioning" ADD CONSTRAINT "ChannelPositioning_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "public"."Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GenerationJob" ADD CONSTRAINT "GenerationJob_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "public"."Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NicheOption" ADD CONSTRAINT "NicheOption_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "public"."Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Post" ADD CONSTRAINT "Post_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "public"."Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Slide" ADD CONSTRAINT "Slide_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


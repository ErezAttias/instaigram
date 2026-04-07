-- CreateEnum
CREATE TYPE "BatchOrderStatus" AS ENUM ('PENDING', 'GENERATING_HOOKS', 'RUNNING', 'COMPLETE', 'FAILED');

-- AlterTable
ALTER TABLE "CarouselJob" ADD COLUMN     "batchOrderId" TEXT;

-- CreateTable
CREATE TABLE "BatchOrder" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "status" "BatchOrderStatus" NOT NULL DEFAULT 'PENDING',
    "size" INTEGER NOT NULL,
    "topics" JSONB,
    "direction" TEXT,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "progress" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BatchOrder_channelId_idx" ON "BatchOrder"("channelId");

-- CreateIndex
CREATE INDEX "CarouselJob_batchOrderId_idx" ON "CarouselJob"("batchOrderId");

-- AddForeignKey
ALTER TABLE "CarouselJob" ADD CONSTRAINT "CarouselJob_batchOrderId_fkey" FOREIGN KEY ("batchOrderId") REFERENCES "BatchOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchOrder" ADD CONSTRAINT "BatchOrder_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

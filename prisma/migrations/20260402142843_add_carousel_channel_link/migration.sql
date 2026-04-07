-- AlterTable
ALTER TABLE "CarouselJob" ADD COLUMN     "channelId" TEXT;

-- CreateIndex
CREATE INDEX "CarouselJob_channelId_idx" ON "CarouselJob"("channelId");

-- AddForeignKey
ALTER TABLE "CarouselJob" ADD CONSTRAINT "CarouselJob_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "CarouselJob" ADD COLUMN     "instagramMediaId" TEXT,
ADD COLUMN     "instagramPublishedAt" TIMESTAMP(3),
ADD COLUMN     "publishedToInstagram" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "instagramAccessToken" TEXT,
ADD COLUMN     "instagramTokenExpiry" TIMESTAMP(3),
ADD COLUMN     "instagramUserId" TEXT,
ADD COLUMN     "instagramUsername" TEXT;

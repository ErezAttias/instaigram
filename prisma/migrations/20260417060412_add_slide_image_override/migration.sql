-- AlterTable
ALTER TABLE "CarouselJob" ALTER COLUMN "layout" SET DEFAULT 'BOLD';

-- AlterTable
ALTER TABLE "CarouselSlide" ADD COLUMN     "imageAuthor" TEXT,
ADD COLUMN     "imagePromptOverride" TEXT,
ADD COLUMN     "wikipediaQuery" TEXT;

-- AlterTable
ALTER TABLE "Channel" ALTER COLUMN "carouselLayout" SET DEFAULT 'BOLD';

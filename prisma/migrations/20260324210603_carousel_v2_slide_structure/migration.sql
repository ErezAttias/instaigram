-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PostPattern" ADD VALUE 'SCALE';
ALTER TYPE "PostPattern" ADD VALUE 'TIMELINE';
ALTER TYPE "PostPattern" ADD VALUE 'VERSUS';
ALTER TYPE "PostPattern" ADD VALUE 'MECHANISM';
ALTER TYPE "PostPattern" ADD VALUE 'MISCONCEPTION';
ALTER TYPE "PostPattern" ADD VALUE 'EXTREMES';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SlideRole" ADD VALUE 'OPENER';
ALTER TYPE "SlideRole" ADD VALUE 'FACT';
ALTER TYPE "SlideRole" ADD VALUE 'IMPLICATION';

-- AlterTable
ALTER TABLE "Slide" ADD COLUMN     "body" TEXT,
ADD COLUMN     "concretenessScore" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "containsNumber" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "factType" TEXT,
ADD COLUMN     "headline" TEXT,
ADD COLUMN     "noveltyScore" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "qualityPassed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "supportingDetail" TEXT,
ADD COLUMN     "topicEntity" TEXT;

-- CreateEnum
CREATE TYPE "CarouselLayout" AS ENUM ('DETAILED', 'BOLD');

-- AlterTable
ALTER TABLE "CarouselJob" ADD COLUMN     "layout" "CarouselLayout" NOT NULL DEFAULT 'DETAILED';

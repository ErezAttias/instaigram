-- Replace fontPairingId + monoFont with titleFontId + bodyFontId + singleFont
ALTER TABLE "ChannelVisualStyle" ADD COLUMN "titleFontId" TEXT NOT NULL DEFAULT 'inter';
ALTER TABLE "ChannelVisualStyle" ADD COLUMN "bodyFontId" TEXT NOT NULL DEFAULT 'lora';
ALTER TABLE "ChannelVisualStyle" ADD COLUMN "singleFont" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChannelVisualStyle" DROP COLUMN "fontPairingId";
ALTER TABLE "ChannelVisualStyle" DROP COLUMN "monoFont";

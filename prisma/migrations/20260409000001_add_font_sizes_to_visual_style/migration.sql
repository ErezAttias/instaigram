-- Add t1FontSizePx and t2FontSizePx to ChannelVisualStyle
ALTER TABLE "ChannelVisualStyle" ADD COLUMN "t1FontSizePx" INTEGER NOT NULL DEFAULT 72;
ALTER TABLE "ChannelVisualStyle" ADD COLUMN "t2FontSizePx" INTEGER NOT NULL DEFAULT 36;

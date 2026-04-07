-- CreateTable
CREATE TABLE "ChannelVisualStyle" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fontPairingId" TEXT NOT NULL DEFAULT 'inter_roboto_slab',
    "monoFont" BOOLEAN NOT NULL DEFAULT false,
    "headlineColor" TEXT,
    "emphasisColor" TEXT,
    "bodyColor" TEXT,
    "textBgEnabled" BOOLEAN NOT NULL DEFAULT false,
    "textBgColor" TEXT,
    "logoBase64" TEXT,
    "logoPosition" TEXT NOT NULL DEFAULT 'bottom_right',
    "logoSizePx" INTEGER NOT NULL DEFAULT 80,

    CONSTRAINT "ChannelVisualStyle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelVisualStyle_channelId_key" ON "ChannelVisualStyle"("channelId");

-- AddForeignKey
ALTER TABLE "ChannelVisualStyle" ADD CONSTRAINT "ChannelVisualStyle_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

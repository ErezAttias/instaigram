// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp');
import type { ChannelVisualStyleContext } from './visual-style';

const LOGO_PADDING = 40; // px from canvas edges

/**
 * Build a Sharp composite input for the channel logo.
 * Resizes the logo to the configured height (maintaining aspect ratio)
 * and positions it according to logoPosition.
 */
export async function buildLogoCompositeInput(
  style: ChannelVisualStyleContext,
  canvas: { width: number; height: number },
): Promise<{ input: Buffer; top: number; left: number }> {
  const logoBuffer = Buffer.from(style.logoBase64!, 'base64');

  const sizePx = Math.max(40, Math.min(120, style.logoSizePx));

  const resizedLogo: Buffer = await sharp(logoBuffer)
    .resize({ height: sizePx, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const meta = await sharp(resizedLogo).metadata();
  const logoWidth = meta.width ?? sizePx;
  const logoHeight = meta.height ?? sizePx;

  const top = canvas.height - LOGO_PADDING - logoHeight;

  let left: number;
  if (style.logoPosition === 'bottom_left') {
    left = LOGO_PADDING;
  } else if (style.logoPosition === 'bottom_right') {
    left = canvas.width - LOGO_PADDING - logoWidth;
  } else {
    left = Math.floor((canvas.width - logoWidth) / 2);
  }

  return { input: resizedLogo, top, left };
}

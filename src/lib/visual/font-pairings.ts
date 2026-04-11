/**
 * Server-side font utilities — Node.js fs access for rendering fonts in SVG.
 * Do NOT import this file in client components; use font-pairings-data.ts instead.
 *
 * Strategy: Register fonts via fontconfig so Pango/librsvg (used by Sharp)
 * can resolve font-family names in SVG text elements natively.
 * Base64 data-URI embedding does NOT work on Vercel Lambda's librsvg.
 */

import * as fs from 'fs';
import * as path from 'path';

export type { FontOption } from './font-pairings-data';
export { TITLE_FONTS, BODY_FONTS, getTitleFont, getBodyFont } from './font-pairings-data';

const FONTS_DIR = path.join(process.cwd(), 'assets', 'fonts');

/**
 * Ensure fontconfig knows about our bundled fonts directory.
 * Writes a minimal fonts.conf to /tmp and points FONTCONFIG_PATH at it.
 * Safe to call multiple times — only writes once.
 */
let _fontconfigRegistered = false;

export function ensureFontconfigRegistered(): void {
  if (_fontconfigRegistered) return;

  if (!fs.existsSync(FONTS_DIR)) {
    console.warn(`[FontPairings] Fonts dir not found: ${FONTS_DIR} — fontconfig not configured`);
    return;
  }

  const fcDir = '/tmp/fontconfig-instaigram';
  const fcConf = path.join(fcDir, 'fonts.conf');

  if (!fs.existsSync(fcConf)) {
    fs.mkdirSync(fcDir, { recursive: true });
    fs.writeFileSync(fcConf, `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${FONTS_DIR}</dir>
</fontconfig>`);
  }

  process.env.FONTCONFIG_PATH = fcDir;
  _fontconfigRegistered = true;
  console.log(`[FontPairings] fontconfig registered: FONTCONFIG_PATH=${fcDir}, fonts dir=${FONTS_DIR}`);
}

/**
 * Build the SVG <style> block for font declarations.
 *
 * Now that we use fontconfig, we no longer need to embed base64 fonts.
 * We still return a <style> block that declares @font-face with local()
 * references so the SVG explicitly requests the correct family+weight
 * combinations. This helps Pango pick the right font file.
 *
 * IMPORTANT: Call ensureFontconfigRegistered() before any Sharp render.
 */
export function buildFontStyleBlock(
  titleFont: { family: string; weight: number; file: string | null; lightFile?: string | null; singleBodyWeight: number },
  bodyFont: { family: string; weight: number; file: string | null },
  singleFont: boolean,
): string {
  // Ensure fontconfig is set up before we render
  ensureFontconfigRegistered();

  // No <style> block needed — fontconfig handles font resolution.
  // Pango matches font-family + font-weight from the SVG attributes
  // directly against the .ttf files registered via fontconfig.
  return '';
}

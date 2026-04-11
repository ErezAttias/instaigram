/**
 * Server-side font utilities — Node.js fs access for embedding fonts in SVG.
 * Do NOT import this file in client components; use font-pairings-data.ts instead.
 */

import * as fs from 'fs';
import * as path from 'path';

export type { FontOption } from './font-pairings-data';
export { TITLE_FONTS, BODY_FONTS, getTitleFont, getBodyFont } from './font-pairings-data';
import type { FontOption } from './font-pairings-data';

// Resolve fonts relative to project root. On Vercel Lambda `process.cwd()`
// may differ from the bundle root, so try __dirname-relative first, then cwd.
const FONTS_DIR = path.join(process.cwd(), 'assets', 'fonts');

/**
 * Build the SVG <style> block with embedded @font-face declarations.
 * Injected into SVG <defs> so librsvg/Sharp can render custom fonts
 * without system font installation.
 */
export function buildFontStyleBlock(
  titleFont: FontOption,
  bodyFont: FontOption,
  singleFont: boolean,
): string {
  const faces: string[] = [];

  function addFace(family: string, weight: number, file: string | null) {
    if (!file) return;
    const filePath = path.join(FONTS_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`[FontPairings] Font file not found: ${filePath} — using system fallback`);
      return;
    }
    const base64 = fs.readFileSync(filePath).toString('base64');
    faces.push(
      `@font-face { font-family: '${family}'; font-weight: ${weight}; ` +
      `src: url('data:font/truetype;base64,${base64}') format('truetype'); }`
    );
  }

  // Always embed the title font at its display weight
  addFace(titleFont.family, titleFont.weight, titleFont.file);

  if (singleFont) {
    // In single-font mode embed the light variant of the title font (for body text)
    if (titleFont.lightFile && titleFont.lightFile !== titleFont.file) {
      addFace(titleFont.family, titleFont.singleBodyWeight, titleFont.lightFile);
    }
  } else {
    // Embed body font (skip if it shares the same file as the title font)
    if (bodyFont.file && bodyFont.file !== titleFont.file) {
      addFace(bodyFont.family, bodyFont.weight, bodyFont.file);
    }
  }

  if (faces.length === 0) {
    console.warn(`[FontPairings] WARNING: No font faces generated! titleFont=${titleFont.family}/${titleFont.file}, bodyFont=${bodyFont.family}/${bodyFont.file}, singleFont=${singleFont}`);
    return '';
  }
  console.log(`[FontPairings] Embedded ${faces.length} font face(s) — total base64 size: ${faces.reduce((n, f) => n + f.length, 0)} chars`);
  return `<style>${faces.join(' ')}</style>`;
}

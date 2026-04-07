/**
 * Server-side font utilities — Node.js fs access for embedding fonts in SVG.
 * Do NOT import this file in client components; use font-pairings-data.ts instead.
 */

import * as fs from 'fs';
import * as path from 'path';

export type { FontPairing } from './font-pairings-data';
export { FONT_PAIRINGS, getFontPairing } from './font-pairings-data';
import type { FontPairing } from './font-pairings-data';

const FONTS_DIR = path.join(process.cwd(), 'assets', 'fonts');

/**
 * Build the SVG <style> block with embedded @font-face declarations.
 * Injected into SVG <defs> so librsvg/Sharp can render custom fonts
 * without system font installation.
 */
export function buildFontStyleBlock(pairing: FontPairing, monoFont: boolean): string {
  const faces: string[] = [];

  function addFace(fontDef: FontPairing['display'] | FontPairing['body']) {
    if (!fontDef.file) return;
    const filePath = path.join(FONTS_DIR, fontDef.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`[FontPairings] Font file not found: ${filePath} — using system fallback`);
      return;
    }
    const base64 = fs.readFileSync(filePath).toString('base64');
    faces.push(
      `@font-face { font-family: '${fontDef.family}'; font-weight: ${fontDef.weight}; ` +
      `src: url('data:font/truetype;base64,${base64}') format('truetype'); }`
    );
  }

  addFace(pairing.display);
  if (!monoFont) {
    if (pairing.body.file !== pairing.display.file) {
      addFace(pairing.body);
    }
  } else {
    if (pairing.display.file) {
      const filePath = path.join(FONTS_DIR, pairing.display.file);
      if (fs.existsSync(filePath)) {
        const base64 = fs.readFileSync(filePath).toString('base64');
        faces.push(
          `@font-face { font-family: '${pairing.display.family}'; font-weight: 400; ` +
          `src: url('data:font/truetype;base64,${base64}') format('truetype'); }`
        );
      }
    }
  }

  if (faces.length === 0) return '';
  return `<style>${faces.join(' ')}</style>`;
}

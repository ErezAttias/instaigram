/**
 * Font option definitions — browser-safe, no Node.js imports.
 * Imported by both client components (designer panel) and server-side renderers.
 */

export interface FontOption {
  id: string;
  label: string;
  family: string;
  /** Weight used for headline / display rendering */
  weight: number;
  /** Font file in /assets/fonts/, null = system font */
  file: string | null;
  /** Weight to use for body text when singleFont mode is active (defaults to 400) */
  singleBodyWeight: number;
  /** Separate font file for singleBodyWeight if it differs from the display file */
  lightFile: string | null;
  /** Google Fonts query fragment for the designer panel preview */
  googleFontsFamily: string;
  /** CSS generic family fallback — 'sans-serif' or 'serif' (default: 'serif') */
  generic?: 'serif' | 'sans-serif';
}

export const TITLE_FONTS: FontOption[] = [
  {
    id: 'inter',
    label: 'Inter',
    family: 'Inter',
    weight: 800,
    file: 'Inter-ExtraBold.ttf',
    singleBodyWeight: 400,
    lightFile: 'Inter-Regular.ttf',
    googleFontsFamily: 'Inter:wght@800',
  },
  {
    id: 'bebas_neue',
    label: 'Bebas Neue',
    family: 'Bebas Neue',
    weight: 400,
    file: 'BebasNeue-Regular.ttf',
    singleBodyWeight: 400,
    lightFile: null,
    googleFontsFamily: 'Bebas+Neue',
  },
  {
    id: 'oswald',
    label: 'Oswald',
    family: 'Oswald',
    weight: 700,
    file: 'Oswald-Bold.ttf',
    singleBodyWeight: 700,
    lightFile: null,
    googleFontsFamily: 'Oswald:wght@700',
  },
  {
    id: 'montserrat_black',
    label: 'Montserrat',
    family: 'Montserrat',
    weight: 900,
    file: 'Montserrat-Black.ttf',
    singleBodyWeight: 400,
    lightFile: 'Montserrat-Regular.ttf',
    googleFontsFamily: 'Montserrat:wght@900',
  },
  {
    id: 'anton',
    label: 'Anton',
    family: 'Anton',
    weight: 400,
    file: 'Anton-Regular.ttf',
    singleBodyWeight: 400,
    lightFile: null,
    googleFontsFamily: 'Anton',
  },
];

export const BODY_FONTS: FontOption[] = [
  {
    id: 'inter',
    label: 'Inter',
    family: 'Inter',
    weight: 400,
    file: 'Inter-Regular.ttf',
    singleBodyWeight: 400,
    lightFile: null,
    googleFontsFamily: 'Inter:wght@400',
    generic: 'sans-serif',
  },
  {
    id: 'lora',
    label: 'Lora',
    family: 'Lora',
    weight: 400,
    file: 'Lora-Regular.ttf',
    singleBodyWeight: 400,
    lightFile: null,
    googleFontsFamily: 'Lora:wght@400',
  },
  {
    id: 'roboto_slab',
    label: 'Roboto Slab',
    family: 'Roboto Slab',
    weight: 400,
    file: 'RobotoSlab-Regular.ttf',
    singleBodyWeight: 400,
    lightFile: null,
    googleFontsFamily: 'Roboto+Slab:wght@400',
  },
  {
    id: 'open_sans',
    label: 'Open Sans',
    family: 'Open Sans',
    weight: 400,
    file: 'OpenSans-Regular.ttf',
    singleBodyWeight: 400,
    lightFile: null,
    googleFontsFamily: 'Open+Sans:wght@400',
  },
  {
    id: 'georgia',
    label: 'Georgia',
    family: 'Georgia',
    weight: 400,
    file: null,
    singleBodyWeight: 400,
    lightFile: null,
    googleFontsFamily: '',
  },
  {
    id: 'montserrat',
    label: 'Montserrat',
    family: 'Montserrat',
    weight: 400,
    file: 'Montserrat-Regular.ttf',
    singleBodyWeight: 400,
    lightFile: null,
    googleFontsFamily: 'Montserrat:wght@400',
  },
];

export function getTitleFont(id: string): FontOption {
  return TITLE_FONTS.find(f => f.id === id) ?? TITLE_FONTS[0];
}

export function getBodyFont(id: string): FontOption {
  return BODY_FONTS.find(f => f.id === id) ?? BODY_FONTS[0];
}

// ---------------------------------------------------------------------------
// Legacy compatibility shims — kept so any lingering imports don't break
// during the migration. Remove once all callers are updated.
// ---------------------------------------------------------------------------

/** @deprecated Use TITLE_FONTS / BODY_FONTS + getTitleFont / getBodyFont */
export interface FontPairing {
  id: string;
  label: string;
  googleFontsFamily: string;
  display: { family: string; weight: number; file: string | null };
  body: { family: string; weight: number; file: string | null };
}

/** @deprecated */
export const FONT_PAIRINGS: FontPairing[] = [];

/** @deprecated */
export function getFontPairing(_id: string): FontPairing {
  return {
    id: 'inter_roboto_slab',
    label: 'Inter / Roboto Slab',
    googleFontsFamily: 'Inter:wght@800&family=Roboto+Slab:wght@400',
    display: { family: 'Inter', weight: 800, file: 'Inter-ExtraBold.ttf' },
    body: { family: 'Roboto Slab', weight: 400, file: 'RobotoSlab-Regular.ttf' },
  };
}

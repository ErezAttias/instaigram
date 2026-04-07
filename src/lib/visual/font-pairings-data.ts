/**
 * Font pairing definitions — browser-safe, no Node.js imports.
 * Imported by both client components (designer panel) and server-side renderers.
 */

export interface FontPairing {
  id: string;
  label: string;
  /** Google Fonts query string for the designer panel preview */
  googleFontsFamily: string;
  display: {
    family: string;
    weight: number;
    file: string | null; // filename in /assets/fonts/, null = system font
  };
  body: {
    family: string;
    weight: number;
    file: string | null;
  };
}

export const FONT_PAIRINGS: FontPairing[] = [
  {
    id: 'inter_roboto_slab',
    label: 'Inter / Roboto Slab',
    googleFontsFamily: 'Inter:wght@800&family=Roboto+Slab:wght@400',
    display: { family: 'Inter', weight: 800, file: null },
    body: { family: 'Roboto Slab', weight: 400, file: 'RobotoSlab-Regular.ttf' },
  },
  {
    id: 'bebas_lora',
    label: 'Bebas Neue / Lora',
    googleFontsFamily: 'Bebas+Neue&family=Lora:wght@400',
    display: { family: 'Bebas Neue', weight: 400, file: 'BebasNeue-Regular.ttf' },
    body: { family: 'Lora', weight: 400, file: 'Lora-Regular.ttf' },
  },
  {
    id: 'montserrat_open_sans',
    label: 'Montserrat / Open Sans',
    googleFontsFamily: 'Montserrat:wght@900&family=Open+Sans:wght@400',
    display: { family: 'Montserrat', weight: 900, file: 'Montserrat-Black.ttf' },
    body: { family: 'Open Sans', weight: 400, file: 'OpenSans-Regular.ttf' },
  },
  {
    id: 'oswald_georgia',
    label: 'Oswald / Georgia',
    googleFontsFamily: 'Oswald:wght@700',
    display: { family: 'Oswald', weight: 700, file: 'Oswald-Bold.ttf' },
    body: { family: 'Georgia', weight: 400, file: null },
  },
  {
    id: 'impact_lora',
    label: 'Impact / Lora',
    googleFontsFamily: 'Anton&family=Lora:wght@400',
    display: { family: 'Anton', weight: 400, file: 'Anton-Regular.ttf' },
    body: { family: 'Lora', weight: 400, file: 'Lora-Regular.ttf' },
  },
  {
    id: 'montserrat_mono',
    label: 'Montserrat (Single Font)',
    googleFontsFamily: 'Montserrat:wght@400;900',
    display: { family: 'Montserrat', weight: 900, file: 'Montserrat-Black.ttf' },
    body: { family: 'Montserrat', weight: 400, file: 'Montserrat-Regular.ttf' },
  },
];

export function getFontPairing(id: string): FontPairing {
  return FONT_PAIRINGS.find(p => p.id === id) ?? FONT_PAIRINGS[0];
}

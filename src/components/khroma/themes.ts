export type CarouselTheme = {
  username: string
  headline: string
  /** Swipe-style call-to-action rendered under the headline inside the card. */
  cta?: string
  subhead: string
  bg: string
  fg: string
  accent: string
  auroraA: string
  auroraB: string
  auroraC: string
  imageUrl: string
  slideCount: number
  activeIndex: number
  headlineFont?: string
  headlineWeight?: number
  headlineSizePx?: number
  /** Optional per-theme CTA (swipe-to-…) font size override. */
  ctaSizePx?: number
  italic?: boolean
  supportFont?: string
  supportWeight?: number
  supportSizePx?: number
  supportItalic?: boolean
  supportColor?: string
  /** Solid color at the bottom of the text-scrim gradient. Defaults to theme.bg. */
  textBgColor?: string
  /** 0 = harsh (late fade), 100 = very soft (fade starts near top). Default 50. */
  textBgSpread?: number
  /** 0 = short (solid band at very bottom), 100 = tall (solid reaches high into image). Default 50. */
  textBgHeight?: number
}

const SERIF = "'Instrument Serif', 'Times New Roman', serif"

export const THEMES: CarouselTheme[] = [
  {
    username: 'foodscience',
    headline: '5 Foods That\nBoost Your Brain',
    cta: 'Swipe to see the list →',
    subhead: '@foodscience · Brain foods backed by science',
    bg: '#1E1A17', fg: '#FFF4E6', accent: '#FF5C3A',
    auroraA: '#FF5C3A', auroraB: '#FFC24B', auroraC: '#8B2E1F',
    imageUrl: '/sample-carousels/berries.png',
    slideCount: 3, activeIndex: 0,
    headlineFont: "'Montserrat', system-ui, sans-serif",
    headlineWeight: 800,
  },
  {
    username: 'wanderlust.daily',
    headline: '5 Places That\nDon\u2019t Look Real',
    cta: 'Swipe to explore →',
    subhead: '@wanderlust.daily · Hidden corners of the world',
    bg: '#0F1E4A', fg: '#E9EEFF', accent: '#7AA2FF',
    auroraA: '#7AA2FF', auroraB: '#48E0FF', auroraC: '#0F1E4A',
    imageUrl: '/sample-carousels/dolomites.png',
    slideCount: 5, activeIndex: 2,
    headlineFont: SERIF,
    headlineWeight: 400,
    headlineSizePx: 42,
    ctaSizePx: 13,
    italic: true,
  },
  {
    username: 'coffeegeek',
    headline: 'Why Your Coffee\nTastes Bitter',
    cta: 'Swipe to fix it →',
    subhead: '@coffeegeek · The 93 \u00b0C rule, explained',
    bg: '#2B1A0F', fg: '#F6E7CE', accent: '#D48A3F',
    auroraA: '#D48A3F', auroraB: '#F6E7CE', auroraC: '#8B4A1E',
    imageUrl: '/sample-carousels/espresso.png',
    slideCount: 4, activeIndex: 0,
    headlineFont: "'Roboto Slab', Georgia, serif",
    headlineWeight: 900,
  },
  {
    username: 'nexorasystems',
    headline: 'The Future of\nDigital Security',
    cta: 'Swipe to see the shift →',
    subhead: '@nexorasystems · AI-powered defense',
    bg: '#0B0F1E', fg: '#E9EEFF', accent: '#7AE0FF',
    auroraA: '#7AE0FF', auroraB: '#6366F1', auroraC: '#D48AFF',
    imageUrl: '/sample-carousels/datacenter.png',
    slideCount: 3, activeIndex: 0,
    headlineFont: "'Inter', system-ui, sans-serif",
    headlineWeight: 700,
  },
  {
    // Pivoted from @mindfulmoney (subscription audit) — the new meditation
    // image called for a true mindfulness theme rather than a money one.
    username: 'stillpoint.daily',
    headline: 'A 3-Minute Reset\nFor Busy Days',
    cta: 'Swipe to try it →',
    subhead: '@stillpoint.daily · Breathwork you can do anywhere',
    bg: '#EDE4D6', fg: '#2A2220', accent: '#C8907B',
    auroraA: '#C8907B', auroraB: '#EDE4D6', auroraC: '#9BB0A0',
    imageUrl: '/sample-carousels/breathwork.png',
    slideCount: 3, activeIndex: 0,
    headlineFont: SERIF,
    headlineWeight: 400,
    headlineSizePx: 42,
    italic: true,
  },
  {
    username: 'studio.sunday',
    headline: 'A Ritual for\nSlow Mornings',
    cta: 'Swipe to slow down →',
    subhead: '@studio.sunday · Weekend rituals, unhurried',
    bg: '#F6E7CE', fg: '#2B1A0F', accent: '#E23E57',
    auroraA: '#E23E57', auroraB: '#FFC24B', auroraC: '#F6E7CE',
    imageUrl: '/sample-carousels/morning-room.png',
    slideCount: 3, activeIndex: 0,
    headlineFont: SERIF,
    headlineWeight: 400,
    italic: true,
  },
]

/**
 * Deterministically pick a demo theme for a string (topic / channel name).
 * Used as a placeholder preview until a real carousel is available.
 */
export function pickThemeForTopic(seed: string): CarouselTheme {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  return THEMES[Math.abs(hash) % THEMES.length]
}

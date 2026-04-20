export type CarouselTheme = {
  username: string
  headline: string
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
  italic?: boolean
  supportFont?: string
  supportWeight?: number
  supportItalic?: boolean
  supportColor?: string
}

const SERIF = "'Instrument Serif', 'Times New Roman', serif"

export const THEMES: CarouselTheme[] = [
  {
    username: 'foodscience',
    headline: '5 Foods That\nActually Boost\nYour Brain',
    subhead: '@foodscience • 5 Foods That Actually…',
    bg: '#1E1A17', fg: '#FFF4E6', accent: '#FF5C3A',
    auroraA: '#FF5C3A', auroraB: '#FFC24B', auroraC: '#8B2E1F',
    imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80',
    slideCount: 3, activeIndex: 0,
    headlineFont: "'Montserrat', system-ui, sans-serif",
    headlineWeight: 800,
  },
  {
    username: 'wanderlust.daily',
    headline: '5 Places That\nLook Fake\nBut Are Real',
    subhead: '@wanderlust.daily • Hidden corners of…',
    bg: '#0F1E4A', fg: '#E9EEFF', accent: '#7AA2FF',
    auroraA: '#7AA2FF', auroraB: '#48E0FF', auroraC: '#0F1E4A',
    imageUrl: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=80',
    slideCount: 5, activeIndex: 2,
    headlineFont: SERIF,
    headlineWeight: 400,
    italic: true,
  },
  {
    username: 'coffeegeek',
    headline: 'Why Your Coffee\nTastes Bitter',
    subhead: '@coffeegeek • The 93°C rule →',
    bg: '#2B1A0F', fg: '#F6E7CE', accent: '#D48A3F',
    auroraA: '#D48A3F', auroraB: '#F6E7CE', auroraC: '#8B4A1E',
    imageUrl: 'https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=800&q=80',
    slideCount: 4, activeIndex: 0,
    headlineFont: "'Roboto Slab', Georgia, serif",
    headlineWeight: 900,
  },
  {
    username: 'nexorasystems',
    headline: 'The Future of\nDigital Security',
    subhead: '@nexorasystems • AI-powered defense',
    bg: '#0B0F1E', fg: '#E9EEFF', accent: '#7AE0FF',
    auroraA: '#7AE0FF', auroraB: '#6366F1', auroraC: '#D48AFF',
    imageUrl: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&q=80',
    slideCount: 3, activeIndex: 0,
    headlineFont: "'Inter', system-ui, sans-serif",
    headlineWeight: 700,
  },
  {
    username: 'mindfulmoney',
    headline: 'Stop Paying for\nThings You\nForgot About',
    subhead: '@mindfulmoney • Subscription audit →',
    bg: '#0E7C66', fg: '#EAFFF7', accent: '#F7C948',
    auroraA: '#F7C948', auroraB: '#0E7C66', auroraC: '#EAFFF7',
    imageUrl: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80',
    slideCount: 4, activeIndex: 1,
    headlineFont: SERIF,
    headlineWeight: 400,
    italic: true,
  },
  {
    username: 'studio.sunday',
    headline: 'A Weekend\nRitual for\nSlow Mornings',
    subhead: '@studio.sunday • Slow down →',
    bg: '#F6E7CE', fg: '#2B1A0F', accent: '#E23E57',
    auroraA: '#E23E57', auroraB: '#FFC24B', auroraC: '#F6E7CE',
    imageUrl: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80',
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

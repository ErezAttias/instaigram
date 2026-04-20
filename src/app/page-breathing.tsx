'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/ThemeProvider'

const IG_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'

// ─── Example carousels (shared with page-aurora — kept in this file so the
//     breathing layout stays self-contained and easy to tweak). ──────────────

type CarouselDemo = {
  id: string
  username: string
  headline: string
  secondary: string
  imageUrl: string
  likeCount: string
  avatarGradient: string
  headlineFont?: string
  headlineWeight?: number
  slideCount: number
  activeIndex: number
}

const CAROUSELS: CarouselDemo[] = [
  {
    id: 'food',
    username: 'foodscience',
    headline: '5 Foods That Actually Boost Your Brain',
    secondary: '5 Foods That Actually Boos…',
    imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&q=80',
    likeCount: '9,204',
    avatarGradient: 'linear-gradient(135deg, #f97316, #ef4444)',
    headlineFont: "'Montserrat', system-ui, sans-serif",
    headlineWeight: 800,
    slideCount: 3, activeIndex: 0,
  },
  {
    id: 'travel',
    username: 'wanderlust.daily',
    headline: '5 Places That Look Fake But Are Real',
    secondary: 'wanderlust.daily 5 Places That Lo…',
    imageUrl: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=600&q=80',
    likeCount: '18,632',
    avatarGradient: 'linear-gradient(135deg, #06b6d4, #0ea5e9)',
    headlineFont: "'Playfair Display', Georgia, serif",
    headlineWeight: 700,
    slideCount: 5, activeIndex: 4,
  },
  {
    id: 'coffee',
    username: 'coffeegeek',
    headline: 'Why Your Coffee Tastes Bitter',
    secondary: 'Why Your Coffee Tastes Bitt…',
    imageUrl: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=80',
    likeCount: '7,392',
    avatarGradient: 'linear-gradient(135deg, #d97706, #92400e)',
    headlineFont: "'Roboto Slab', Georgia, serif",
    headlineWeight: 900,
    slideCount: 4, activeIndex: 0,
  },
  {
    id: 'security',
    username: 'nexorasystems',
    headline: 'The future of\ndigital security',
    secondary: 'Your digital fortress',
    imageUrl: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=600&q=80',
    likeCount: '4,148',
    avatarGradient: 'linear-gradient(135deg, #3b82f6, #6366f1)',
    headlineFont: "'Inter', system-ui, sans-serif",
    headlineWeight: 600,
    slideCount: 3, activeIndex: 0,
  },
  {
    id: 'fortress',
    username: 'nexorasystems',
    headline: 'Your digital\nfortress',
    secondary: 'AI-powered cybersecurity that detects, defends, and neutralizes threats.',
    imageUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=600&q=80',
    likeCount: '2,401',
    avatarGradient: 'linear-gradient(135deg, #6366f1, #2563eb)',
    headlineFont: "'Inter', system-ui, sans-serif",
    headlineWeight: 600,
    slideCount: 1, activeIndex: 0,
  },
  {
    id: 'coffee-real',
    username: 'coffeegeek',
    headline: 'Why Your Coffee\nTastes Bitter',
    secondary: 'Learn the 93°C rule and transform your cup.',
    imageUrl: 'https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=600&q=80',
    likeCount: '7,392',
    avatarGradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
    headlineFont: "'Roboto Slab', Georgia, serif",
    headlineWeight: 900,
    slideCount: 1, activeIndex: 0,
  },
]

// Placement recipe per card — percentages so it scales across viewport sizes.
// `rot` is slight starting rotation, `delay` staggers the breathing.
type Placement = {
  id: string
  top?: string; bottom?: string; left?: string; right?: string
  width: string
  rot: number
  delay: number
  z: number
}

// Placements keep every card's bounding box out of the central hero safe
// zone (roughly the middle 40% of the viewport both ways). Left/right
// columns only — nothing crosses the centerline.
const PLACEMENTS: Placement[] = [
  { id: 'food',         top: '-8%',    left: '-2%',  width: '20rem', rot: -5, delay: 0,    z: 3 },
  { id: 'fortress',     top: '26%',    left: '-4%',  width: '18rem', rot: -3, delay: 1.6,  z: 2 },
  { id: 'coffee-real',  bottom: '-6%', left: '2%',   width: '18rem', rot: 5,  delay: 3.2,  z: 1 },
  { id: 'security',     top: '-4%',    right: '-2%', width: '20rem', rot: 5,  delay: 0.8,  z: 3 },
  { id: 'travel',       top: '28%',    right: '-4%', width: '18rem', rot: 6,  delay: 2.4,  z: 2 },
  { id: 'coffee',       bottom: '-8%', right: '2%',  width: '18rem', rot: -5, delay: 4.0,  z: 1 },
]

// ─── Floating carousel card (Instagram mockup, no tap-to-advance) ────────────

function FloatingCarousel({ c, placement, isLight }: { c: CarouselDemo; placement: Placement; isLight: boolean }) {
  const cardBg = isLight ? 'bg-white' : 'bg-black'
  const chromeBg = isLight ? 'bg-white/95' : 'bg-black/90'
  const primaryText = isLight ? 'text-gray-900' : 'text-white'
  const mutedText = isLight ? 'text-gray-500' : 'text-white/65'
  const dotColor = isLight ? 'bg-black/40' : 'bg-white/60'
  const iconStroke = isLight ? '#111113' : 'white'
  const borderColor = isLight ? 'border-white' : 'border-black'
  const shadow = isLight
    ? '0 10px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)'
    : '0 0 0 1px rgba(255,255,255,0.07), 0 30px 80px rgba(0,0,0,0.7), 0 0 50px rgba(188,24,136,0.12)'
  const frameBg = isLight ? 'rgba(255,255,255,0.9)' : 'rgba(10,6,22,1)'

  return (
    <div
      className="absolute pointer-events-none select-none breathing-card"
      style={{
        ...(placement.top !== undefined ? { top: placement.top } : {}),
        ...(placement.bottom !== undefined ? { bottom: placement.bottom } : {}),
        ...(placement.left !== undefined ? { left: placement.left } : {}),
        ...(placement.right !== undefined ? { right: placement.right } : {}),
        width: placement.width,
        aspectRatio: '9 / 14',
        zIndex: placement.z,
        // Each card gets its own delay so the group doesn't breathe in unison.
        ['--breath-delay' as string]: `${placement.delay}s`,
        ['--breath-rot' as string]: `${placement.rot}deg`,
      }}
    >
      <div
        className="relative flex flex-col rounded-2xl overflow-hidden w-full h-full"
        style={{
          padding: '2px',
          background: frameBg,
          boxShadow: shadow,
        }}
      >
        <div className={`relative flex flex-col rounded-xl overflow-hidden w-full h-full ${cardBg}`}>
          {/* Header */}
          <div className={`flex items-center gap-2 px-3 py-2.5 ${chromeBg} backdrop-blur-sm shrink-0`}>
            <div className="p-[2px] rounded-full shrink-0" style={{ background: IG_GRADIENT }}>
              <div className={`w-7 h-7 rounded-full border-2 ${borderColor}`} style={{ background: c.avatarGradient }} />
            </div>
            <span className={`${primaryText} text-[11px] font-semibold leading-none flex-1 min-w-0 truncate`}>@{c.username}</span>
            <div className="flex gap-[3px] shrink-0">
              {[0,1,2].map(i => <div key={i} className={`w-[3px] h-[3px] rounded-full ${dotColor}`} />)}
            </div>
          </div>

          {/* Photo */}
          <div className="relative flex-1 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.imageUrl}
              alt=""
              className="w-full h-full object-cover"
              style={{ filter: 'saturate(1.25) contrast(1.05) brightness(1.02)' }}
            />
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent 20%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.82) 75%, rgba(0,0,0,0.95) 100%)' }} />
            <div className="absolute bottom-0 inset-x-0 px-4 pb-8 pt-16 z-10">
              <h3
                className="text-white font-bold text-[18px] leading-tight tracking-tight whitespace-pre-line"
                style={{ fontFamily: c.headlineFont, fontWeight: c.headlineWeight }}
              >
                {c.headline}
              </h3>
            </div>
            <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5 z-20">
              {Array.from({ length: c.slideCount }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-full"
                  style={{
                    width: i === c.activeIndex ? 16 : 6,
                    height: 6,
                    background: i === c.activeIndex ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className={`${chromeBg} backdrop-blur-sm px-3 pt-2 pb-2.5 shrink-0`}>
            <div className="flex items-center mb-1.5">
              <div className="flex gap-3 flex-1 opacity-80">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="opacity-80"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
            </div>
            <p className={`${primaryText} text-[10px] font-semibold leading-none`}>{c.likeCount} likes</p>
            <p className={`${mutedText} text-[10px] mt-1 leading-snug truncate`}>
              <span className={`${primaryText} font-semibold`}>@{c.username}</span> {c.secondary}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────

const PLACEHOLDER_EXAMPLES = [
  'fitness for busy parents',
  'coffee lovers',
  'AI tools for developers',
  'personal finance tips',
  'travel on a budget',
  'sustainable living',
]

export default function HomeBreathing() {
  const router = useRouter()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const [topic, setTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingSource, setLoadingSource] = useState<'direct' | 'discover' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const [placeholderIdx, setPlaceholderIdx] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setPlaceholderIdx(i => (i + 1) % PLACEHOLDER_EXAMPLES.length), 3200)
    return () => clearInterval(t)
  }, [])

  async function createChannel(body: Record<string, string>) {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to create channel')
      }
      const channel = await res.json()
      router.push(`/channels/${channel.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false); setLoadingSource(null)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const t = topic.trim()
    if (!t) return
    const words = t.split(/\s+/)
    const nicheMode = words.length <= 2 ? 'EXPLORE' : 'DIRECT'
    setLoadingSource('direct')
    createChannel(nicheMode === 'EXPLORE' ? { nicheMode, exploreTopic: t } : { nicheMode, directTopic: t })
  }

  function handleDiscover() {
    setLoadingSource('discover')
    createChannel({ nicheMode: 'DISCOVER' })
  }

  const byId = Object.fromEntries(CAROUSELS.map(c => [c.id, c]))

  const backgroundStyle = isLight
    ? { background: 'radial-gradient(ellipse 90% 60% at 50% 30%, #ffe8d6 0%, #fff4ea 45%, #ffffff 100%)' }
    : { background: 'radial-gradient(ellipse 90% 60% at 50% 30%, #2a0e3a 0%, #180822 45%, #0a0414 100%)' }

  const orbBackground = isLight
    ? 'radial-gradient(600px circle at 50% 40%, rgba(220,39,67,0.08), transparent 60%), ' +
      'radial-gradient(500px circle at 20% 70%, rgba(240,148,51,0.07), transparent 60%), ' +
      'radial-gradient(500px circle at 80% 80%, rgba(188,24,136,0.06), transparent 60%)'
    : 'radial-gradient(600px circle at 50% 40%, rgba(220,39,67,0.18), transparent 60%), ' +
      'radial-gradient(500px circle at 20% 70%, rgba(240,148,51,0.10), transparent 60%), ' +
      'radial-gradient(500px circle at 80% 80%, rgba(188,24,136,0.12), transparent 60%)'

  return (
    <div className="relative min-w-0 flex-1 flex flex-col overflow-hidden">
      {/* Full-viewport gradient (covers behind transparent NavBar) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{ ...backgroundStyle, zIndex: -1 }}
      />
      {/* Ambient glow orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: orbBackground }}
      />

      {/* Floating carousel mockups — fixed to viewport so they reach under nav + footer */}
      <div className="pointer-events-none hidden md:block fixed inset-0 z-0">
        {PLACEMENTS.map(p => {
          const c = byId[p.id]
          if (!c) return null
          return <FloatingCarousel key={p.id} c={c} placement={p} isLight={isLight} />
        })}
      </div>

      {/* Centered hero content */}
      <section className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-8 text-center">
        <div className="max-w-5xl w-full animate-fade-up">
          <h1 className={`text-[2.5rem] sm:text-5xl lg:text-[3.75rem] font-bold tracking-tight leading-[1.05] mb-4 md:whitespace-nowrap ${isLight ? 'text-gray-900' : 'text-white'}`}>
            Create your{' '}
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: IG_GRADIENT }}>
              content channel
            </span>
          </h1>
          <p className={`${isLight ? 'text-gray-600' : 'text-white/70'} text-base sm:text-lg leading-relaxed mb-10`}>
            Your next 30 days of scroll-stopping carousels, ready in minutes.
          </p>

          <form onSubmit={handleSubmit} className="w-full max-w-xl mx-auto">
            <div
              className="p-[2px] rounded-full transition-all duration-300"
              style={{
                background: IG_GRADIENT,
                boxShadow: focused
                  ? '0 0 60px rgba(220,39,67,0.55), 0 0 120px rgba(188,24,136,0.35)'
                  : '0 0 40px rgba(220,39,67,0.35), 0 0 80px rgba(188,24,136,0.18)',
              }}
            >
              <div className={`flex items-center gap-2 p-2 rounded-full backdrop-blur-md ${isLight ? 'bg-white/95' : 'bg-[#120722]/95'}`}>
                <input
                  type="text"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  placeholder={PLACEHOLDER_EXAMPLES[placeholderIdx]}
                  autoComplete="off"
                  className={`flex-1 px-4 py-3 bg-transparent text-base focus:outline-none ${isLight ? 'text-gray-900 placeholder-gray-400' : 'text-white placeholder-white/40'}`}
                />
                <button
                  type="submit"
                  disabled={loading || !topic.trim()}
                  className="shrink-0 h-11 px-5 text-white font-semibold rounded-full text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-95 active:scale-[0.97]"
                  style={{ background: IG_GRADIENT }}
                >
                  {loading && loadingSource === 'direct' ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating…
                    </span>
                  ) : (
                    'Get Started →'
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="mt-3 px-4 py-2.5 bg-danger/15 border border-danger/30 rounded-xl">
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}

            <div className="mt-5">
              <button
                type="button"
                onClick={handleDiscover}
                disabled={loading}
                className={`text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${isLight ? 'text-gray-500 hover:text-gray-900' : 'text-white/60 hover:text-white'}`}
              >
                {loading && loadingSource === 'discover' ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Finding your niche…
                  </span>
                ) : (
                  'Not sure what to post? Find my niche →'
                )}
              </button>
            </div>
          </form>

          {/* Trust badges */}
          <div className={`mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-[13px] ${isLight ? 'text-gray-500' : 'text-white/55'}`}>
            <span className="inline-flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10.5" r="1.5" /><path d="M21 17l-5-5-4 4-2-2-4 4" /></svg>
              30 posts/month
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9 12 2" /></svg>
              AI-powered
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
              Full captions
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="font-mono text-[15px] leading-none">#</span>
              Auto-hashtags
            </span>
          </div>

          <div className={`mt-6 flex items-center justify-center gap-2 text-[12px] ${isLight ? 'text-gray-400' : 'text-white/40'}`}>
            <span className="flex -space-x-1">
              <span className="w-2 h-2 rounded-full" style={{ background: '#dc2743' }} />
              <span className="w-2 h-2 rounded-full" style={{ background: '#3b82f6' }} />
              <span className="w-2 h-2 rounded-full" style={{ background: '#10b981' }} />
            </span>
            500+ example channels
          </div>
        </div>
      </section>

      {/* Animation + local styles */}
      <style jsx global>{`
        @keyframes breathe {
          0%, 100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-14px) scale(1.015);
          }
        }
        .breathing-card {
          animation: breathe 7.5s ease-in-out infinite;
          animation-delay: var(--breath-delay, 0s);
          transform-origin: 50% 50%;
          filter: saturate(1.05);
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .breathing-card { animation: none !important; }
        }
      `}</style>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/ThemeProvider'

const IG_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'

// ─── Blueprint carousel wireframes (monochrome, semi-transparent, glassy). ──

type Blueprint = {
  id: string
  slideCount: number
  activeIndex: number
  // Layout of the placeholder "content" inside the image area — all drawn as
  // neutral lines/blocks, no color.
  layout: 'title-lines' | 'title-thumb' | 'chart' | 'grid' | 'quote' | 'centerpiece'
}

const CAROUSELS: Blueprint[] = [
  { id: 'a', slideCount: 3, activeIndex: 0, layout: 'title-lines' },
  { id: 'b', slideCount: 5, activeIndex: 4, layout: 'chart' },
  { id: 'c', slideCount: 4, activeIndex: 0, layout: 'grid' },
  { id: 'd', slideCount: 3, activeIndex: 0, layout: 'title-thumb' },
  { id: 'e', slideCount: 1, activeIndex: 0, layout: 'quote' },
  { id: 'f', slideCount: 1, activeIndex: 0, layout: 'centerpiece' },
]

type Placement = {
  id: string
  top?: string; bottom?: string; left?: string; right?: string
  width: string
  delay: number
  z: number
}

const PLACEMENTS: Placement[] = [
  { id: 'a', top: '-8%',    left: '-2%',  width: '20rem', delay: 0,    z: 3 },
  { id: 'e', top: '26%',    left: '-4%',  width: '18rem', delay: 1.6,  z: 2 },
  { id: 'f', bottom: '-6%', left: '2%',   width: '18rem', delay: 3.2,  z: 1 },
  { id: 'd', top: '-4%',    right: '-2%', width: '20rem', delay: 0.8,  z: 3 },
  { id: 'b', top: '28%',    right: '-4%', width: '18rem', delay: 2.4,  z: 2 },
  { id: 'c', bottom: '-8%', right: '2%',  width: '18rem', delay: 4.0,  z: 1 },
]

function Line({ w = '100%', h = 8, opacity = 0.18 }: { w?: string | number; h?: number; opacity?: number }) {
  return <div className="rounded-full" style={{ width: w, height: h, background: `currentColor`, opacity }} />
}

function LayoutContent({ layout }: { layout: Blueprint['layout'] }) {
  switch (layout) {
    case 'title-lines':
      return (
        <div className="absolute inset-0 p-6 flex flex-col justify-center gap-3 text-white">
          <Line w="70%" h={14} opacity={0.28} />
          <Line w="90%" h={14} opacity={0.28} />
          <div className="h-3" />
          <Line w="60%" h={6} opacity={0.16} />
          <Line w="80%" h={6} opacity={0.16} />
          <Line w="50%" h={6} opacity={0.16} />
        </div>
      )
    case 'title-thumb':
      return (
        <div className="absolute inset-0 p-5 flex flex-col gap-4 text-white">
          <div className="rounded-lg border border-white/20 bg-white/5 backdrop-blur-sm" style={{ aspectRatio: '16/10' }} />
          <Line w="80%" h={12} opacity={0.28} />
          <Line w="55%" h={12} opacity={0.28} />
          <div className="h-1" />
          <Line w="70%" h={6} opacity={0.16} />
          <Line w="50%" h={6} opacity={0.16} />
        </div>
      )
    case 'chart':
      return (
        <div className="absolute inset-0 p-5 flex flex-col gap-4 text-white">
          <Line w="55%" h={10} opacity={0.28} />
          <div className="flex-1 flex items-end justify-between gap-2 pb-2">
            {[0.35, 0.55, 0.75, 0.6, 0.9, 0.5, 0.7].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t border border-white/25"
                style={{ height: `${h * 100}%`, background: 'rgba(255,255,255,0.08)' }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Line w="30%" h={4} opacity={0.14} />
            <Line w="50%" h={4} opacity={0.14} />
          </div>
        </div>
      )
    case 'grid':
      return (
        <div className="absolute inset-0 p-5 flex flex-col gap-3 text-white">
          <Line w="45%" h={10} opacity={0.28} />
          <div className="flex-1 grid grid-cols-3 gap-2">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="rounded-md border border-white/20 bg-white/5" />
            ))}
          </div>
        </div>
      )
    case 'quote':
      return (
        <div className="absolute inset-0 p-6 flex flex-col items-center justify-center gap-2 text-white">
          <div className="text-white/25 text-6xl leading-none font-serif select-none">&ldquo;</div>
          <Line w="80%" h={8} opacity={0.22} />
          <Line w="65%" h={8} opacity={0.22} />
          <Line w="70%" h={8} opacity={0.22} />
          <div className="h-3" />
          <Line w="35%" h={5} opacity={0.14} />
        </div>
      )
    case 'centerpiece':
      return (
        <div className="absolute inset-0 flex items-center justify-center text-white">
          <div
            className="rounded-full border border-white/25 backdrop-blur-sm"
            style={{
              width: '55%',
              aspectRatio: '1',
              background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 70%)',
            }}
          />
        </div>
      )
  }
}

function FloatingCarousel({ c, placement, isLight }: { c: Blueprint; placement: Placement; isLight: boolean }) {
  // Monochrome surfaces — translucent glass, no brand colors.
  const frameBorder = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.10)'
  const cardBg = isLight ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.04)'
  const chromeBg = isLight ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.03)'
  const imageBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.035)'
  const stroke = isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.45)'
  const lineColor = isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)'
  const dotIdle = isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.25)'
  const dotActive = isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.75)'
  const shadow = isLight
    ? '0 10px 40px rgba(0,0,0,0.08), inset 0 0 0 1px rgba(255,255,255,0.5)'
    : '0 20px 60px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.06)'

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
        ['--breath-delay' as string]: `${placement.delay}s`,
      }}
    >
      <div
        className="relative flex flex-col rounded-2xl overflow-hidden w-full h-full"
        style={{
          background: cardBg,
          backdropFilter: 'blur(14px) saturate(110%)',
          WebkitBackdropFilter: 'blur(14px) saturate(110%)',
          border: `1px solid ${frameBorder}`,
          boxShadow: shadow,
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 shrink-0" style={{ background: chromeBg, borderBottom: `1px solid ${frameBorder}` }}>
          <div className="w-7 h-7 rounded-full border" style={{ borderColor: lineColor, background: imageBg }} />
          <div className="flex-1 flex flex-col gap-1.5">
            <div className="h-1.5 rounded-full" style={{ width: '55%', background: lineColor }} />
            <div className="h-1 rounded-full" style={{ width: '35%', background: lineColor, opacity: 0.6 }} />
          </div>
          <div className="flex gap-[3px] shrink-0">
            {[0,1,2].map(i => <div key={i} className="w-[3px] h-[3px] rounded-full" style={{ background: lineColor }} />)}
          </div>
        </div>

        {/* "Photo" area — pure blueprint skeleton */}
        <div className="relative flex-1 overflow-hidden" style={{ background: imageBg }}>
          <LayoutContent layout={c.layout} />
          {/* Slide dots */}
          <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5 z-20">
            {Array.from({ length: c.slideCount }).map((_, i) => (
              <div
                key={i}
                className="rounded-full"
                style={{
                  width: i === c.activeIndex ? 16 : 6,
                  height: 6,
                  background: i === c.activeIndex ? dotActive : dotIdle,
                }}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-3 pt-2.5 pb-3 shrink-0 flex flex-col gap-2" style={{ background: chromeBg, borderTop: `1px solid ${frameBorder}` }}>
          <div className="flex items-center gap-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            <div className="flex-1" />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
          </div>
          <div className="h-1.5 rounded-full" style={{ width: '40%', background: lineColor }} />
          <div className="h-1 rounded-full" style={{ width: '80%', background: lineColor, opacity: 0.55 }} />
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

export default function HomeMinimal() {
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
      <div aria-hidden="true" className="pointer-events-none fixed inset-0" style={{ ...backgroundStyle, zIndex: -1 }} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: orbBackground }} />

      <div className="pointer-events-none hidden md:block fixed inset-0 z-0">
        {PLACEMENTS.map(p => {
          const c = byId[p.id]
          if (!c) return null
          return <FloatingCarousel key={p.id} c={c} placement={p} isLight={isLight} />
        })}
      </div>

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

      <style jsx global>{`
        @keyframes breathe {
          0%, 100% { transform: translateY(0) scale(1); }
          50%      { transform: translateY(-14px) scale(1.015); }
        }
        .breathing-card {
          animation: breathe 7.5s ease-in-out infinite;
          animation-delay: var(--breath-delay, 0s);
          transform-origin: 50% 50%;
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .breathing-card { animation: none !important; }
        }
      `}</style>
    </div>
  )
}

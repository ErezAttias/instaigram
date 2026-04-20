'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/ThemeProvider'

const IG_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'

// ─── Khroma-style poster tiles ──────────────────────────────────────────────
// A dense, slow-drifting grid of flat-colored "posters". Each one carries a
// big word in a bold serif and a small palette strip at the bottom — the
// visual signature of Khroma's landing page, rethemed for InstAIgram content.

type Poster = {
  word: string
  bg: string
  fg: string
  palette: [string, string, string, string]
  font: 'serif' | 'sans' | 'mono'
}

const POSTERS: Poster[] = [
  { word: 'Hook',     bg: '#FF5C3A', fg: '#FFF4E6', palette: ['#FF5C3A', '#1E1A17', '#FFF4E6', '#FFC24B'], font: 'serif' },
  { word: 'Scroll',   bg: '#0F1E4A', fg: '#E9EEFF', palette: ['#0F1E4A', '#E9EEFF', '#7AA2FF', '#F7C948'], font: 'serif' },
  { word: 'Caption',  bg: '#F6E7CE', fg: '#2B1A0F', palette: ['#F6E7CE', '#2B1A0F', '#D48A3F', '#8B4A1E'], font: 'serif' },
  { word: 'Save',     bg: '#1E1E1E', fg: '#F7C948', palette: ['#1E1E1E', '#F7C948', '#FF5C3A', '#FFFFFF'], font: 'mono' },
  { word: 'Hashtag',  bg: '#F7C948', fg: '#1E1A17', palette: ['#F7C948', '#1E1A17', '#FF5C3A', '#FFF4E6'], font: 'sans' },
  { word: 'Reel',     bg: '#3E2A6B', fg: '#F3E8FF', palette: ['#3E2A6B', '#F3E8FF', '#D48AFF', '#FF5C3A'], font: 'serif' },
  { word: 'Niche',    bg: '#0E7C66', fg: '#EAFFF7', palette: ['#0E7C66', '#EAFFF7', '#CFE8DE', '#F7C948'], font: 'serif' },
  { word: 'Follow',   bg: '#E23E57', fg: '#FFE7EC', palette: ['#E23E57', '#FFE7EC', '#1E1E1E', '#FFC24B'], font: 'serif' },
  { word: 'Story',    bg: '#2B1A0F', fg: '#F6E7CE', palette: ['#2B1A0F', '#F6E7CE', '#D48A3F', '#E23E57'], font: 'serif' },
  { word: 'Share',    bg: '#7AA2FF', fg: '#0F1E4A', palette: ['#7AA2FF', '#0F1E4A', '#F7C948', '#FFFFFF'], font: 'sans' },
  { word: 'Viral',    bg: '#FF9B6A', fg: '#2B1A0F', palette: ['#FF9B6A', '#2B1A0F', '#F6E7CE', '#E23E57'], font: 'serif' },
  { word: 'Post',     bg: '#EAFFF7', fg: '#0E7C66', palette: ['#EAFFF7', '#0E7C66', '#F7C948', '#1E1E1E'], font: 'serif' },
  { word: 'Swipe',    bg: '#D48AFF', fg: '#1E1A17', palette: ['#D48AFF', '#1E1A17', '#F7C948', '#FFFFFF'], font: 'serif' },
  { word: 'Grid',     bg: '#FFFFFF', fg: '#1E1E1E', palette: ['#FFFFFF', '#1E1E1E', '#FF5C3A', '#F7C948'], font: 'mono' },
  { word: 'Brand',    bg: '#1E1A17', fg: '#FF9B6A', palette: ['#1E1A17', '#FF9B6A', '#F6E7CE', '#E23E57'], font: 'serif' },
  { word: 'Voice',    bg: '#FFC24B', fg: '#2B1A0F', palette: ['#FFC24B', '#2B1A0F', '#0F1E4A', '#FFFFFF'], font: 'serif' },
]

const FONT_FAMILY: Record<Poster['font'], string> = {
  serif: "'Playfair Display', Georgia, serif",
  sans:  "'Inter', system-ui, sans-serif",
  mono:  "'JetBrains Mono', ui-monospace, monospace",
}

function PosterCard({ p }: { p: Poster }) {
  return (
    <div
      className="shrink-0 rounded-xl overflow-hidden flex flex-col justify-between"
      style={{
        width: '16rem',
        aspectRatio: '4 / 5',
        background: p.bg,
        color: p.fg,
        boxShadow: '0 18px 40px rgba(0,0,0,0.22)',
      }}
    >
      <div className="flex-1 flex items-center justify-center px-4">
        <span
          className="text-center leading-none"
          style={{
            fontFamily: FONT_FAMILY[p.font],
            fontWeight: p.font === 'serif' ? 900 : 800,
            fontStyle: p.font === 'serif' ? 'italic' : 'normal',
            fontSize: p.word.length > 6 ? '2.6rem' : '3.2rem',
            letterSpacing: p.font === 'mono' ? '-0.02em' : '-0.03em',
          }}
        >
          {p.word}
        </span>
      </div>
      <div className="flex h-10">
        {p.palette.map((c, i) => (
          <div key={i} className="flex-1" style={{ background: c }} />
        ))}
      </div>
    </div>
  )
}

function MarqueeRow({ posters, reverse = false, duration = 90 }: { posters: Poster[]; reverse?: boolean; duration?: number }) {
  // Duplicate the row so translating by -50% loops seamlessly.
  const doubled = [...posters, ...posters]
  return (
    <div className="relative w-full overflow-hidden">
      <div
        className="flex gap-5 will-change-transform"
        style={{
          animation: `${reverse ? 'marquee-rev' : 'marquee'} ${duration}s linear infinite`,
          width: 'max-content',
        }}
      >
        {doubled.map((p, i) => (
          <PosterCard key={`${p.word}-${i}`} p={p} />
        ))}
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

export default function HomeKhroma() {
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

  // Split posters into three rows so each can drift at a different speed.
  const rowA = POSTERS.slice(0, 6)
  const rowB = POSTERS.slice(6, 11)
  const rowC = POSTERS.slice(11)

  // Soft overlay so the centered CTA stays readable on top of the busy grid.
  const overlay = isLight
    ? 'radial-gradient(ellipse 60% 45% at 50% 50%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.75) 45%, rgba(255,255,255,0.35) 75%, rgba(255,255,255,0) 100%)'
    : 'radial-gradient(ellipse 60% 45% at 50% 50%, rgba(12,8,20,0.9) 0%, rgba(12,8,20,0.78) 45%, rgba(12,8,20,0.4) 75%, rgba(12,8,20,0) 100%)'

  const pageBg = isLight ? '#f3eee7' : '#0b0712'

  return (
    <div className="relative min-w-0 flex-1 flex flex-col overflow-hidden" style={{ background: pageBg }}>
      {/* Diagonal poster grid backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 flex flex-col justify-center gap-5"
        style={{
          transform: 'rotate(-8deg) scale(1.25)',
          transformOrigin: 'center',
        }}
      >
        <MarqueeRow posters={rowA} duration={85} />
        <MarqueeRow posters={rowB} reverse duration={110} />
        <MarqueeRow posters={rowC} duration={95} />
      </div>

      {/* Centered spotlight so text reads over the collage */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10" style={{ background: overlay }} />

      {/* Hero content */}
      <section className="relative z-20 flex-1 flex flex-col items-center justify-center px-4 sm:px-8 text-center">
        <div className="max-w-5xl w-full">
          <h1
            className={`font-bold tracking-tight leading-[0.95] mb-5 ${isLight ? 'text-gray-900' : 'text-white'}`}
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 'clamp(3rem, 7vw, 5.5rem)',
            }}
          >
            Design content <br className="hidden sm:block" />
            you’ll{' '}
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: IG_GRADIENT }}>
              love to post
            </span>
          </h1>
          <p className={`${isLight ? 'text-gray-700' : 'text-white/75'} text-base sm:text-lg leading-relaxed mb-10 max-w-xl mx-auto`}>
            InstAIgram learns your niche and generates endless scroll-stopping carousels — search, tweak, and save the ones you love.
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
                className={`text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${isLight ? 'text-gray-600 hover:text-gray-900' : 'text-white/70 hover:text-white'}`}
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
        </div>
      </section>

      <style jsx global>{`
        @keyframes marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes marquee-rev {
          0%   { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="marquee"] { animation: none !important; }
        }
      `}</style>
    </div>
  )
}

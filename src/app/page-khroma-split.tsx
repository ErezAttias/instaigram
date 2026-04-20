'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/ThemeProvider'

const IG_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'
const SERIF = "'Instrument Serif', 'Times New Roman', serif"
const SANS = "'Inter', system-ui, -apple-system, sans-serif"

// ─── Rotating carousel themes ───────────────────────────────────────────────

type Theme = {
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
}

const THEMES: Theme[] = [
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
    headlineWeight: 800,
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
    headlineWeight: 800,
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
    headlineWeight: 800,
    italic: true,
  },
]

function isColorLight(hex: string): boolean {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 >= 170
}

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ─── Floating Instagram carousel mockup ─────────────────────────────────────

function FloatingCarousel({ theme, nonce }: { theme: Theme; nonce: number }) {
  const textIsDark = isColorLight(theme.bg)
  return (
    <div
      key={nonce}
      className="relative select-none carousel-float"
      style={{ width: 'min(380px, 80%)', aspectRatio: '9 / 14' }}
    >
      <div
        className="relative flex flex-col rounded-[22px] overflow-hidden w-full h-full carousel-morph"
        style={{
          background: theme.bg,
          boxShadow: '0 50px 100px rgba(0,0,0,0.55), 0 10px 30px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.06)',
        }}
      >
        <div
          className="flex items-center gap-2 px-3 py-2.5 shrink-0"
          style={{
            background: textIsDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.4)',
            color: textIsDark ? '#111' : '#fff',
          }}
        >
          <div className="p-[2px] rounded-full shrink-0" style={{ background: IG_GRADIENT }}>
            <div className="w-7 h-7 rounded-full border-2" style={{ borderColor: textIsDark ? '#fff' : '#000', background: theme.accent }} />
          </div>
          <span className="text-[12px] font-semibold leading-none flex-1 min-w-0 truncate">@{theme.username}</span>
          <div className="flex gap-[3px] shrink-0 opacity-70">
            {[0,1,2].map(i => <div key={i} className="w-[3px] h-[3px] rounded-full" style={{ background: textIsDark ? '#111' : '#fff' }} />)}
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={theme.imageUrl}
            alt=""
            className="w-full h-full object-cover carousel-image"
            style={{ filter: 'saturate(1.15) contrast(1.05)' }}
          />
          <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(to bottom, transparent 25%, ${withAlpha(theme.bg, 0.35)} 55%, ${withAlpha(theme.bg, 0.92)} 95%)` }} />
          <div className="absolute bottom-0 inset-x-0 px-5 pb-10 pt-16 z-10">
            <h3
              className="whitespace-pre-line leading-[1.02] tracking-tight"
              style={{
                color: theme.fg,
                fontFamily: theme.headlineFont ?? SERIF,
                fontWeight: theme.headlineWeight ?? 800,
                fontStyle: theme.italic ? 'italic' : 'normal',
                fontSize: '28px',
              }}
            >
              {theme.headline}
            </h3>
          </div>
          <div className="absolute bottom-4 inset-x-0 flex justify-center gap-1.5 z-20">
            {Array.from({ length: theme.slideCount }).map((_, i) => (
              <div
                key={i}
                className="rounded-full"
                style={{
                  width: i === theme.activeIndex ? 18 : 6,
                  height: 6,
                  background: i === theme.activeIndex ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.4)',
                }}
              />
            ))}
          </div>
        </div>

        <div
          className="px-3 pt-2 pb-3 shrink-0"
          style={{
            background: textIsDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.4)',
            color: textIsDark ? '#111' : '#fff',
          }}
        >
          <div className="flex items-center gap-3 mb-1.5 opacity-85">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            <div className="flex-1" />
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
          </div>
          <p className="text-[11px] opacity-75 truncate">{theme.subhead}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Chromatic aurora background (like Khroma's right column) ───────────────

function AuroraBackdrop({ theme }: { theme: Theme }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Three large blurred blobs drifting & rotating. Colors re-tint on theme change via CSS transition. */}
      <div
        className="aurora-blob blob-a"
        style={{ background: `radial-gradient(closest-side, ${theme.auroraA}, transparent 70%)` }}
      />
      <div
        className="aurora-blob blob-b"
        style={{ background: `radial-gradient(closest-side, ${theme.auroraB}, transparent 70%)` }}
      />
      <div
        className="aurora-blob blob-c"
        style={{ background: `radial-gradient(closest-side, ${theme.auroraC}, transparent 70%)` }}
      />
      {/* Subtle conic highlight, gives the prism/refraction edge you see in Khroma */}
      <div
        className="aurora-prism"
        style={{
          background: `conic-gradient(from 180deg at 50% 50%,
            ${withAlpha(theme.auroraA, 0.0)} 0deg,
            ${withAlpha(theme.auroraA, 0.35)} 60deg,
            ${withAlpha(theme.auroraB, 0.35)} 180deg,
            ${withAlpha(theme.auroraC, 0.30)} 300deg,
            ${withAlpha(theme.auroraA, 0.0)} 360deg)`,
        }}
      />
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

type Phase = 'idle' | 'generating' | 'ready'

type Channel = { id: string; name?: string; niche?: string }

export default function HomeKhromaSplit() {
  const router = useRouter()
  const { theme, toggle } = useTheme()
  const isLight = theme === 'light'
  const [topic, setTopic] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const [themeIdx, setThemeIdx] = useState(0)
  const [nonce, setNonce] = useState(0)

  // Phase state machine — drives left panel content and right-side behavior
  // without unmounting the shell.
  const [phase, setPhase] = useState<Phase>('idle')
  const [submittedTopic, setSubmittedTopic] = useState('')
  const [channel, setChannel] = useState<Channel | null>(null)

  useEffect(() => {
    const t = setInterval(() => setPlaceholderIdx(i => (i + 1) % PLACEHOLDER_EXAMPLES.length), 3200)
    return () => clearInterval(t)
  }, [])

  // Only cycle right-side preview themes while idle. After submit, the
  // preview locks in so the transition feels intentional.
  useEffect(() => {
    if (phase !== 'idle') return
    const t = setInterval(() => {
      setThemeIdx(i => (i + 1) % THEMES.length)
      setNonce(n => n + 1)
    }, 5000)
    return () => clearInterval(t)
  }, [phase])

  async function createChannel(body: Record<string, string>, topicForDisplay: string) {
    setSubmittedTopic(topicForDisplay)
    setPhase('generating')
    setError(null)
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
      const c = await res.json()
      setChannel(c)
      setPhase('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setPhase('idle')
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const t = topic.trim()
    if (!t) return
    const words = t.split(/\s+/)
    const nicheMode = words.length <= 2 ? 'EXPLORE' : 'DIRECT'
    createChannel(nicheMode === 'EXPLORE' ? { nicheMode, exploreTopic: t } : { nicheMode, directTopic: t }, t)
  }

  function handleDiscover() {
    createChannel({ nicheMode: 'DISCOVER' }, 'your niche')
  }

  function resetToIdle() {
    setPhase('idle')
    setSubmittedTopic('')
    setChannel(null)
    setError(null)
  }

  const pageBg = isLight ? '#f4f1ec' : '#000000'
  const textMain = isLight ? '#0a0a0a' : '#ffffff'
  const textMuted = isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.55)'
  const current = THEMES[themeIdx]

  return (
    <div className="relative min-w-0 flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden min-h-screen" style={{ background: pageBg }}>
      {/* ─── Left column ─────────────────────────────────────────────── */}
      <section className="relative z-10 flex flex-col justify-center px-8 sm:px-14 lg:px-20 py-16">
        <div className="max-w-[36rem] w-full">
          <div
            className="mb-10 bg-clip-text text-transparent w-fit text-2xl font-semibold tracking-tight font-[family-name:var(--font-bricolage)]"
            style={{ backgroundImage: IG_GRADIENT }}
          >
            InstAIgram
          </div>

          <div key={phase} className="phase-panel">
            {phase === 'idle' && (
              <>
                <h1
                  className="mb-8"
                  style={{
                    fontFamily: SERIF,
                    fontWeight: 400,
                    color: textMain,
                    fontSize: 'clamp(3.75rem, 7vw, 6.75rem)',
                    lineHeight: 0.98,
                    letterSpacing: '-0.015em',
                  }}
                >
                  Design carousels
                  <br />
                  <span style={{ fontStyle: 'italic' }}>you love</span> to post.
                </h1>

                <p
                  className="mb-10 max-w-[28rem]"
                  style={{ color: textMuted, fontFamily: SANS, fontSize: '16px', lineHeight: 1.6 }}
                >
                  InstAIgram uses AI to learn your niche and creates limitless carousels
                  for you to discover, tweak, and save.
                </p>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4 items-start">
                  <input
                    type="text"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder={PLACEHOLDER_EXAMPLES[placeholderIdx]}
                    autoComplete="off"
                    className="w-full max-w-[28rem] px-4 py-3 text-base focus:outline-none rounded-md transition-colors"
                    style={{
                      fontFamily: SANS,
                      background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)',
                      color: textMain,
                      border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
                    }}
                  />

                  <div className="flex items-center gap-5 flex-wrap">
                    <button
                      type="submit"
                      disabled={!topic.trim()}
                      className="h-12 px-8 text-white font-medium rounded-md text-[15px] disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:brightness-110 active:scale-[0.98]"
                      style={{ background: '#2563eb', fontFamily: SANS, boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }}
                    >
                      Generate
                    </button>

                    <button
                      type="button"
                      onClick={handleDiscover}
                      className="text-sm font-medium underline-offset-4 hover:underline"
                      style={{ color: textMuted, fontFamily: SANS }}
                    >
                      Not sure? Find my niche →
                    </button>
                  </div>

                  {error && (
                    <div className="px-4 py-2.5 bg-danger/15 border border-danger/30 rounded-md">
                      <p className="text-sm text-danger">{error}</p>
                    </div>
                  )}
                </form>
              </>
            )}

            {phase === 'generating' && (
              <>
                <p
                  className="mb-6 uppercase tracking-[0.22em] text-[11px]"
                  style={{ color: textMuted, fontFamily: SANS, fontWeight: 600 }}
                >
                  Step 01 — Understanding your niche
                </p>
                <h1
                  className="mb-8"
                  style={{
                    fontFamily: SERIF,
                    fontWeight: 400,
                    color: textMain,
                    fontSize: 'clamp(3rem, 5.4vw, 4.75rem)',
                    lineHeight: 1,
                    letterSpacing: '-0.015em',
                  }}
                >
                  Tuning the aesthetic for{' '}
                  <span style={{ fontStyle: 'italic' }}>{submittedTopic || 'your niche'}</span>
                  <span className="dots">…</span>
                </h1>
                <p
                  className="mb-10 max-w-[28rem]"
                  style={{ color: textMuted, fontFamily: SANS, fontSize: '16px', lineHeight: 1.6 }}
                >
                  Watching colour, typography, and imagery settle into a voice that fits the topic.
                </p>
                <div className="flex items-center gap-3" style={{ color: textMuted, fontFamily: SANS }}>
                  <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  <span className="text-sm">Creating your channel…</span>
                </div>
              </>
            )}

            {phase === 'ready' && channel && (
              <>
                <p
                  className="mb-6 uppercase tracking-[0.22em] text-[11px]"
                  style={{ color: textMuted, fontFamily: SANS, fontWeight: 600 }}
                >
                  Channel ready
                </p>
                <h1
                  className="mb-8"
                  style={{
                    fontFamily: SERIF,
                    fontWeight: 400,
                    color: textMain,
                    fontSize: 'clamp(3rem, 5.4vw, 4.75rem)',
                    lineHeight: 1,
                    letterSpacing: '-0.015em',
                  }}
                >
                  Meet{' '}
                  <span style={{ fontStyle: 'italic' }}>
                    {channel.name || submittedTopic || 'your channel'}
                  </span>
                  .
                </h1>
                <p
                  className="mb-10 max-w-[28rem]"
                  style={{ color: textMuted, fontFamily: SANS, fontSize: '16px', lineHeight: 1.6 }}
                >
                  Your next thirty carousels are queued up. Jump into the editor to refine
                  the voice, or start a new channel.
                </p>

                <div className="flex items-center gap-5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => router.push(`/channels/${channel.id}`)}
                    className="h-12 px-8 text-white font-medium rounded-md text-[15px] transition-all hover:brightness-110 active:scale-[0.98]"
                    style={{ background: '#2563eb', fontFamily: SANS, boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }}
                  >
                    Open channel →
                  </button>
                  <button
                    type="button"
                    onClick={resetToIdle}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                    style={{ color: textMuted, fontFamily: SANS }}
                  >
                    Start another
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ─── Right column ────────────────────────────────────────────── */}
      <div className="relative overflow-hidden min-h-[60vh] lg:min-h-0">
        <AuroraBackdrop theme={current} />
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <FloatingCarousel theme={current} nonce={nonce} />
        </div>
      </div>

      {/* Theme toggle, bottom-left */}
      <button
        type="button"
        onClick={toggle}
        aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
        className="fixed bottom-6 left-6 z-30 h-9 w-9 rounded-full flex items-center justify-center transition-colors"
        style={{
          background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
          border: `1px solid ${isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'}`,
          color: textMain,
        }}
      >
        {isLight ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
        )}
      </button>

      <style jsx global>{`
        .phase-panel {
          animation: phase-in 550ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes phase-in {
          0%   { opacity: 0; transform: translateY(8px); filter: blur(3px); }
          100% { opacity: 1; transform: translateY(0);   filter: blur(0); }
        }
        .dots::after {
          content: '';
          display: inline-block;
          animation: dots 1.4s steps(4, end) infinite;
        }
        @keyframes dots {
          0%   { content: ''; }
          25%  { content: '.'; }
          50%  { content: '..'; }
          75%  { content: '...'; }
          100% { content: ''; }
        }

        .carousel-float {
          animation: float 7s ease-in-out infinite;
          will-change: transform;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-10px); }
        }
        .carousel-morph {
          animation: morph-in 800ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .carousel-image {
          animation: image-in 1000ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes morph-in {
          0%   { transform: translateY(10px) scale(0.97); filter: blur(4px); }
          60%  { filter: blur(0); }
          100% { transform: translateY(0)    scale(1);    filter: blur(0); }
        }
        @keyframes image-in {
          0%   { transform: scale(1.06); }
          100% { transform: scale(1);    }
        }

        .aurora-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(70px);
          transition: background 1200ms ease;
          will-change: transform;
          mix-blend-mode: screen;
        }
        .blob-a {
          width: 80%;
          aspect-ratio: 1;
          top: -10%;
          left: 10%;
          animation: drift-a 22s ease-in-out infinite;
          opacity: 0.9;
        }
        .blob-b {
          width: 70%;
          aspect-ratio: 1;
          bottom: -15%;
          right: -10%;
          animation: drift-b 28s ease-in-out infinite;
          opacity: 0.85;
        }
        .blob-c {
          width: 60%;
          aspect-ratio: 1;
          top: 35%;
          left: -10%;
          animation: drift-c 26s ease-in-out infinite;
          opacity: 0.7;
        }
        .aurora-prism {
          position: absolute;
          inset: -25%;
          filter: blur(90px);
          transition: background 1200ms ease;
          mix-blend-mode: screen;
          animation: prism-spin 60s linear infinite;
        }
        @keyframes drift-a {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(8%, 10%) scale(1.1); }
          66%      { transform: translate(-6%, 4%) scale(0.95); }
        }
        @keyframes drift-b {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(-10%, -12%) scale(1.15); }
        }
        @keyframes drift-c {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(14%, -6%) scale(1.08); }
        }
        @keyframes prism-spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .carousel-float, .carousel-morph, .carousel-image,
          .aurora-blob, .aurora-prism {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}

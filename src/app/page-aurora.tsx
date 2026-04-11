'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useTheme } from '@/components/ThemeProvider'

const Aurora = dynamic(() => import('@/components/Aurora'), { ssr: false })

// ---------------------------------------------------------------------------
// Instagram gradient constant
// ---------------------------------------------------------------------------

const IG_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'

// ---------------------------------------------------------------------------
// Example carousel data
// ---------------------------------------------------------------------------

type SlideData = { headline: string; body: string }
type CarouselData = {
  id: string
  topic: string
  username: string
  avatarGradient: string
  imageUrls: string[]
  likeCount: string
  slides: SlideData[]
  headlineFont?: string
  headlineStyle?: React.CSSProperties
}

const EXAMPLE_CAROUSELS: CarouselData[] = [
  {
    id: 'food',
    topic: 'Food Science',
    username: 'foodscience',
    headlineFont: "'Montserrat', system-ui, sans-serif",
    headlineStyle: { fontWeight: 800 },
    avatarGradient: 'linear-gradient(135deg, #f97316, #ef4444)',
    imageUrls: [
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&q=80',
      'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=600&q=80',
      'https://images.unsplash.com/photo-1484723091739-30a097e8f929?w=600&q=80',
    ],
    likeCount: '9,204',
    slides: [
      { headline: '5 Foods That Actually Boost Your Brain', body: 'What you eat in the morning changes your cognition for the entire day.' },
      { headline: 'Blueberries Improve Memory in 12 Weeks', body: 'Daily consumption increases neural connections in the hippocampus.' },
      { headline: 'Dark Chocolate Cuts Stress Hormones', body: 'Flavanols in 70%+ cacao reduce cortisol within 2 weeks of daily use.' },
    ],
  },
  {
    id: 'travel',
    topic: 'Travel',
    username: 'wanderlust.daily',
    headlineFont: "'Playfair Display', Georgia, serif",
    headlineStyle: { fontWeight: 700, letterSpacing: '0.01em' },
    avatarGradient: 'linear-gradient(135deg, #06b6d4, #0ea5e9)',
    imageUrls: [
      'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=600&q=80',
      'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=600&q=80',
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=600&q=80',
    ],
    likeCount: '18,632',
    slides: [
      { headline: '5 Places That Look Fake But Are Real', body: 'Earth has destinations so vivid they look AI-generated.' },
      { headline: 'Peyto Lake, Canada', body: 'A glacier-fed lake so turquoise it looks photoshopped — even in person.' },
      { headline: 'The Light Only Lasts 20 Minutes', body: 'Golden hour at altitude hits differently. Most tourists miss it entirely.' },
    ],
  },
  {
    id: 'coffee',
    topic: 'Coffee',
    username: 'coffeegeek',
    headlineFont: "'Roboto Slab', Georgia, serif",
    headlineStyle: { fontWeight: 900, letterSpacing: '0.02em' },
    avatarGradient: 'linear-gradient(135deg, #d97706, #92400e)',
    imageUrls: [
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=80',
      'https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=600&q=80',
      'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=600&q=80',
    ],
    likeCount: '7,392',
    slides: [
      { headline: 'Why Your Coffee Tastes Bitter', body: 'It\'s almost never the beans. It\'s your extraction.' },
      { headline: 'Over-Extracted = Bitter Every Time', body: 'Too hot, too long — sugars burn first, harsh acids linger last.' },
      { headline: 'The 93°C Rule', body: 'Drop 3 degrees from boiling and most bitterness disappears. Try it tomorrow.' },
    ],
  },
]

// ---------------------------------------------------------------------------
// ExampleCarousel component — styled as a real Instagram post
// ---------------------------------------------------------------------------

function ExampleCarousel({ carousel, isLight }: { carousel: CarouselData; isLight: boolean }) {
  const [active, setActive] = useState(0)

  const slide = carousel.slides[active]
  const imageUrl = carousel.imageUrls[active] ?? carousel.imageUrls[0]

  const cardBg = isLight ? 'bg-white' : 'bg-black'
  const headerBg = isLight ? 'bg-white/95' : 'bg-black/90'
  const footerBg = isLight ? 'bg-white/95' : 'bg-black/90'
  const textColor = isLight ? 'text-gray-900' : 'text-white'
  const mutedColor = isLight ? 'text-gray-500' : 'text-white/70'
  const iconStroke = isLight ? '#111113' : 'white'
  const shadowStyle = isLight
    ? '0 4px 24px rgba(0,0,0,0.10)'
    : '0 0 0 1px rgba(255,255,255,0.09), 0 24px 60px rgba(0,0,0,0.85), 0 0 40px rgba(188,24,136,0.07)'

  return (
    <div
      data-tilt-card
      className="snap-center shrink-0 w-[72vw] sm:w-auto"
      style={{
        aspectRatio: '9/14',
        transition: 'transform 0.35s cubic-bezier(0.03, 0.98, 0.52, 0.99)',
        willChange: 'transform',
        padding: '2px',
        borderRadius: '18px',
        background: isLight ? 'rgba(255,255,255,0.85)' : 'rgba(58,52,78,1)',
        boxShadow: shadowStyle,
      }}
    >
    <div
      className={`relative flex flex-col rounded-2xl overflow-hidden w-full h-full ${cardBg}`}
    >
      {/* ── Instagram post header ── */}
      <div className={`flex items-center gap-2 px-3 py-2.5 ${headerBg} backdrop-blur-sm shrink-0`}>
        {/* Avatar with IG gradient ring */}
        <div className="p-[2px] rounded-full shrink-0" style={{ background: IG_GRADIENT }}>
          <div
            className={`w-7 h-7 rounded-full border-2 ${isLight ? 'border-white' : 'border-black'}`}
            style={{ background: carousel.avatarGradient }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <span className={`${textColor} text-[11px] font-semibold leading-none`}>@{carousel.username}</span>
        </div>
        {/* Three-dot menu */}
        <div className="flex gap-[3px] shrink-0">
          {[0,1,2].map(i => <div key={i} className={`w-[3px] h-[3px] rounded-full ${isLight ? 'bg-black/40' : 'bg-white/60'}`} />)}
        </div>
      </div>

      {/* ── Photo area ── */}
      <div className="relative flex-1 overflow-hidden">
        {/* Photo */}
        <img
          src={imageUrl}
          alt={slide.headline}
          className="w-full h-full object-cover"
          style={{ filter: 'saturate(1.3) contrast(1.06) brightness(1.04)' }}
        />

        {/* Dark gradient overlay — heavy at bottom like opener slide */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, transparent 20%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.82) 75%, rgba(0,0,0,0.95) 100%)' }}
        />

        {/* Tap areas for prev/next */}
        <button
          onClick={() => setActive(a => Math.max(0, a - 1))}
          className="absolute inset-y-0 left-0 w-1/3 z-10"
          aria-label="Previous slide"
        />
        <button
          onClick={() => setActive(a => Math.min(carousel.slides.length - 1, a + 1))}
          className="absolute inset-y-0 right-0 w-1/3 z-10"
          aria-label="Next slide"
        />

        {/* Text overlay — opener style with large headline */}
        <div className="absolute bottom-0 inset-x-0 px-4 pb-8 pt-16 z-10">
          <h3
            className="text-white font-bold text-[20px] leading-snug tracking-tight"
            style={{ ...(carousel.headlineFont ? { fontFamily: carousel.headlineFont } : {}), ...carousel.headlineStyle }}
          >{slide.headline}</h3>
        </div>

        {/* Dot indicators */}
        <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5 z-20 pointer-events-none">
          {carousel.slides.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === active ? 16 : 6,
                height: 6,
                background: i === active ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)',
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Instagram action bar ── */}
      <div className={`${footerBg} backdrop-blur-sm px-3 pt-2 pb-2.5 shrink-0`}>
        {/* Action icons */}
        <div className="flex items-center mb-1.5">
          <div className="flex gap-3 flex-1">
            {/* Heart */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {/* Comment */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {/* Share */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </div>
          {/* Bookmark */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        {/* Like count */}
        <p className={`${textColor} text-[11px] font-semibold leading-none`}>{carousel.likeCount} likes</p>
        {/* Caption preview */}
        <p className={`${mutedColor} text-[10px] mt-1 leading-snug truncate`}>
          <span className={`${textColor} font-semibold`}>@{carousel.username}</span>{' '}
          {slide.headline}
        </p>
      </div>
    </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading steps
// ---------------------------------------------------------------------------

const LOADING_STEPS = [
  'Creating channel...',
  'Setting things up...',
  'Generating niches...',
  'Almost done...',
]

const PLACEHOLDER_EXAMPLES = [
  'coffee lovers',
  'AI tools for developers',
  'fitness for busy parents',
  'personal finance tips',
  'travel on a budget',
  'sustainable living',
]

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function HomeAurora() {
  const router = useRouter()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const cardsContainerRef = useRef<HTMLDivElement>(null)
  const tiltFrameRef = useRef<number | null>(null)

  const handleCardsTilt = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const clientX = e.clientX
    const clientY = e.clientY
    if (tiltFrameRef.current !== null) cancelAnimationFrame(tiltFrameRef.current)
    tiltFrameRef.current = requestAnimationFrame(() => {
      const container = cardsContainerRef.current
      if (!container) return
      container.querySelectorAll<HTMLDivElement>('[data-tilt-card]').forEach(card => {
        const rect = card.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const dx = clientX - cx
        const dy = clientY - cy
        const distance = Math.sqrt(dx * dx + dy * dy)
        const influenceRadius = Math.sqrt((rect.width / 2) ** 2 + (rect.height / 2) ** 2) * 2
        const falloff = Math.max(0, 1 - distance / influenceRadius)
        const rotateX = -(dy / (rect.height / 2)) * 10 * falloff
        const rotateY = (dx / (rect.width / 2)) * 10 * falloff
        const scale = 1 + 0.02 * falloff
        card.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${scale},${scale},${scale})`
      })
    })
  }, [])

  const handleCardsLeave = useCallback(() => {
    if (tiltFrameRef.current !== null) cancelAnimationFrame(tiltFrameRef.current)
    cardsContainerRef.current?.querySelectorAll<HTMLDivElement>('[data-tilt-card]').forEach(card => {
      card.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)'
    })
  }, [])

  const [topicInput, setTopicInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [loadingSource, setLoadingSource] = useState<'direct' | 'discover' | null>(null)
  const [error, setError] = useState('')
  const [inputFocused, setInputFocused] = useState(false)
  const [animatedPlaceholder, setAnimatedPlaceholder] = useState('')

  useEffect(() => {
    let cancelled = false
    let exampleIdx = 0
    let charIdx = 0
    let deleting = false

    const tick = () => {
      if (cancelled) return
      const current = PLACEHOLDER_EXAMPLES[exampleIdx]
      if (!deleting) {
        charIdx++
        setAnimatedPlaceholder(current.slice(0, charIdx))
        if (charIdx === current.length) {
          deleting = true
          setTimeout(tick, 1800)
          return
        }
        setTimeout(tick, 80)
      } else {
        charIdx--
        setAnimatedPlaceholder(current.slice(0, charIdx))
        if (charIdx === 0) {
          deleting = false
          exampleIdx = (exampleIdx + 1) % PLACEHOLDER_EXAMPLES.length
          setTimeout(tick, 400)
          return
        }
        setTimeout(tick, 45)
      }
    }

    setTimeout(tick, 800)
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!loading) {
      setLoadingStep(0)
      return
    }
    const interval = setInterval(() => {
      setLoadingStep((s) => (s < LOADING_STEPS.length - 1 ? s + 1 : s))
    }, 2500)
    return () => clearInterval(interval)
  }, [loading])

  async function createChannel(body: Record<string, string>) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create channel')
      }
      const channel = await res.json()
      router.push(`/channels/${channel.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
      setLoadingSource(null)
    }
  }

  function handleGetStarted(e: React.FormEvent) {
    e.preventDefault()
    const topic = topicInput.trim()
    if (!topic) return
    const words = topic.split(/\s+/)
    const nicheMode = words.length <= 2 ? 'EXPLORE' : 'DIRECT'
    const body = nicheMode === 'EXPLORE'
      ? { nicheMode, exploreTopic: topic }
      : { nicheMode, directTopic: topic }
    setLoadingSource('direct')
    createChannel(body as unknown as Record<string, string>)
  }

  function handleDiscover() {
    setLoadingSource('discover')
    createChannel({ nicheMode: 'DISCOVER' })
  }

  return (
    <div className="relative -mx-4 lg:-mx-8 -mt-6 lg:-mt-10 min-w-0">
      {/* Background — Aurora in dark mode, CSS gradient in light mode */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        {isLight ? (
          <div
            className="w-full h-full"
            style={{
              background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(240,148,51,0.12) 0%, rgba(188,24,136,0.08) 40%, transparent 70%), #fafafa',
            }}
          />
        ) : (
          <Aurora
            colorStops={['#0a0518', '#1a0828', '#2e0818']}
            amplitude={1.2}
            blend={0.7}
            speed={0.5}
          />
        )}
        {/* Soft bottom vignette */}
        <div
          className="absolute inset-x-0 bottom-0 pointer-events-none"
          style={{
            height: '45%',
            background: isLight
              ? 'linear-gradient(to bottom, transparent, rgba(180,180,195,0.18))'
              : 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.25))',
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col">

        {/* ── Section 1: Hero text + Form ─────────────────────────────────── */}
        <section className="pt-4 pb-8 px-4 sm:px-6 text-center">
          <div className="max-w-4xl mx-auto animate-fade-up">
            <h1 className="text-[2.625rem] sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight leading-[1.1] mb-3">
              Create your<br className="sm:hidden" />{' '}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: IG_GRADIENT }}
              >
                content channel
              </span>
            </h1>
            <p className="text-muted-light text-base leading-relaxed mb-8">
              Your next 30 days of scroll-stopping carousels, ready in minutes.
            </p>
          </div>

          {/* Form — immediately under headline, centre-stage */}
          <div className="max-w-xl mx-auto w-full">
            <form onSubmit={handleGetStarted}>

              {/* Integrated pill: input + button as one unit */}
              <div
                className="p-[2px] rounded-[28px] sm:rounded-full transition-all duration-300"
                style={{
                  background: IG_GRADIENT,
                  boxShadow: inputFocused
                    ? '0 0 48px rgba(188,24,136,0.45), 0 0 80px rgba(220,39,67,0.2)'
                    : isLight
                      ? '0 4px 24px rgba(188,24,136,0.2), 0 1px 4px rgba(0,0,0,0.06)'
                      : '0 0 32px rgba(188,24,136,0.3), 0 0 60px rgba(220,39,67,0.1)',
                }}
              >
                <div className={`flex flex-col sm:flex-row sm:items-center gap-2 p-2 rounded-[26px] sm:rounded-full ${isLight ? 'bg-white' : 'bg-[#0e0c1a]'}`}>
                  <input
                    id="topic"
                    type="text"
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    placeholder={animatedPlaceholder}
                    autoComplete="off"
                    className="pill-input flex-1 px-3 py-3 bg-transparent text-foreground placeholder-muted text-base focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={loading || !topicInput.trim()}
                    className="w-full sm:w-auto shrink-0 px-5 py-3 text-white font-medium rounded-full text-base disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-90 active:scale-[0.97] whitespace-nowrap"
                    style={{ background: IG_GRADIENT }}
                  >
                    {loading && loadingSource === 'direct' ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {LOADING_STEPS[loadingStep]}
                      </span>
                    ) : (
                      'Get Started →'
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="mt-3 animate-scale-in px-5 py-3.5 bg-danger-dim border border-danger/20 rounded-xl">
                  <p className="text-sm text-danger font-medium">{error}</p>
                </div>
              )}

              {/* Secondary CTA — text-link style */}
              <div className="flex justify-center mt-4">
                <button
                  type="button"
                  onClick={handleDiscover}
                  disabled={loading}
                  className="text-sm text-muted hover:text-foreground font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] flex items-center justify-center"
                >
                  {loading && loadingSource === 'discover' ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-muted/30 border-t-muted-light rounded-full animate-spin" />
                      Finding your niche...
                    </span>
                  ) : (
                    'Not sure what to post? Find my niche →'
                  )}
                </button>
              </div>
            </form>

            {/* Trust badges */}
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 mt-8 pt-6 border-t border-border">

              {/* Feature badges */}
              {[
                {
                  label: '30 posts/month',
                  icon: (
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-muted-light">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                  ),
                },
                {
                  label: 'AI-powered',
                  icon: (
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-muted-light">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  ),
                },
                {
                  label: 'Full captions',
                  icon: (
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-muted-light">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  ),
                },
                {
                  label: 'Auto-hashtags',
                  icon: (
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-muted-light">
                      <line x1="4" y1="9" x2="20" y2="9" />
                      <line x1="4" y1="15" x2="20" y2="15" />
                      <line x1="10" y1="3" x2="8" y2="21" />
                      <line x1="16" y1="3" x2="14" y2="21" />
                    </svg>
                  ),
                },
              ].map((badge) => (
                <div key={badge.label} className="flex items-center gap-1.5 shrink-0">
                  <span className="shrink-0">{badge.icon}</span>
                  <span className="text-xs font-medium text-muted-light whitespace-nowrap">{badge.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Section 2: Preview carousels — social proof below the fold ── */}
        <section className="pb-16 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="flex -space-x-1">
                {['bg-gradient-to-br from-orange-400 to-rose-500', 'bg-gradient-to-br from-blue-400 to-violet-500', 'bg-gradient-to-br from-emerald-400 to-teal-500'].map((bg, i) => (
                  <div key={i} className={`w-[18px] h-[18px] rounded-full ${bg} border-2 border-background`} />
                ))}
              </div>
              <p className="text-xs text-muted font-medium">
                <span className="font-semibold">500+</span> example channels
              </p>
            </div>
            {/* Cards — horizontal scroll on mobile, 3-col grid on desktop */}
            <div ref={cardsContainerRef} onMouseMove={handleCardsTilt} onMouseLeave={handleCardsLeave} className="flex sm:grid sm:grid-cols-3 gap-4 overflow-x-auto sm:overflow-visible snap-x snap-mandatory py-8 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
              {EXAMPLE_CAROUSELS.map((carousel) => (
                <ExampleCarousel key={carousel.id} carousel={carousel} isLight={isLight} />
              ))}
            </div>
            <p className="sm:hidden text-xs text-muted text-center mt-3">swipe to explore →</p>
          </div>
        </section>
      </div>
    </div>
  )
}

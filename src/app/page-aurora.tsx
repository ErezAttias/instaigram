'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

const Aurora = dynamic(() => import('@/components/Aurora'), { ssr: false })

type NicheMode = 'DISCOVER' | 'EXPLORE' | 'DIRECT'

const MODE_OPTIONS: { value: NicheMode; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: 'DISCOVER',
    label: 'Discover niche ideas for me',
    description: 'No idea yet — let AI suggest high-opportunity niches from scratch',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 2l2.4 4.8L18 7.6l-4 3.9.9 5.5-4.9-2.6L5.1 17l.9-5.5-4-3.9 5.6-.8L10 2z" />
      </svg>
    ),
  },
  {
    value: 'EXPLORE',
    label: 'Explore within a topic',
    description: 'You have a broad interest area — AI will find sharp angles within it',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="M12.5 12.5L17 17" />
      </svg>
    ),
  },
  {
    value: 'DIRECT',
    label: 'I already know my topic',
    description: 'Go straight to content generation — optionally refine your topic first',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 10h12M12 6l4 4-4 4" />
      </svg>
    ),
  },
]

const LOADING_STEPS = [
  'Creating channel...',
  'Setting things up...',
  'Generating niches...',
  'Almost done...',
]

function getCtaLabel(mode: NicheMode, topic: string): string {
  switch (mode) {
    case 'DISCOVER':
      return 'Discover niches for me'
    case 'EXPLORE':
      return topic.trim() ? `Explore "${topic.trim()}"` : 'Explore topic'
    case 'DIRECT':
      return topic.trim() ? `Start with "${topic.trim()}"` : 'Start creating'
  }
}

export default function HomeAurora() {
  const router = useRouter()
  const [nicheMode, setNicheMode] = useState<NicheMode>('DISCOVER')
  const [topic, setTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [error, setError] = useState('')

  const showTopicInput = nicheMode === 'EXPLORE' || nicheMode === 'DIRECT'

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (showTopicInput && !topic.trim()) {
      setError(nicheMode === 'EXPLORE' ? 'Enter a broad topic to explore' : 'Enter your topic')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nicheMode,
          ...(nicheMode === 'EXPLORE' && { exploreTopic: topic.trim() }),
          ...(nicheMode === 'DIRECT' && { directTopic: topic.trim() }),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create channel')
      }

      const channel = await res.json()
      router.push(`/channels/${channel.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-8rem)] flex items-center justify-center">
      {/* Aurora background — fixed fullscreen */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <Aurora
          colorStops={['#0a1628', '#1a2d50', '#0a1628']}
          amplitude={1.2}
          blend={0.7}
          speed={0.5}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-2xl mx-auto px-0 py-10 lg:py-16">
        <div className="animate-fade-up text-center">
          {/* Header */}
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent/20 bg-accent/[0.06] backdrop-blur-sm mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-xs font-semibold text-accent uppercase tracking-[0.12em]">
                New channel
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight leading-[1.1] mb-4">
              Create your <br className="sm:hidden" />
              <span className="bg-gradient-to-r from-accent via-amber-300 to-accent bg-clip-text text-transparent">
                content channel
              </span>
            </h1>
            <p className="text-muted-light text-base leading-relaxed">
              Your next 30 days of scroll-stopping carousels, ready in minutes.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 text-left">
            {/* Niche Mode Selection */}
            <div className="animate-fade-up stagger-1">
              <label className="block text-xs font-semibold text-muted uppercase tracking-[0.12em] mb-3 text-center">
                How do you want to start?
              </label>
              <div className="space-y-2.5" role="radiogroup" aria-label="How do you want to start?">
                {MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={nicheMode === opt.value}
                    onClick={() => {
                      setNicheMode(opt.value)
                      if (opt.value === 'DISCOVER') setTopic('')
                    }}
                    className={`
                      w-full text-left px-5 py-4 rounded-2xl border transition-all duration-200 flex items-start gap-4 group backdrop-blur-md
                      focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none
                      ${nicheMode === opt.value
                        ? 'border-accent/40 bg-accent/[0.08] shadow-[0_0_24px_var(--accent-glow)]'
                        : 'border-border bg-surface/50 hover:border-border-hover hover:bg-surface-elevated/50'
                      }
                    `}
                  >
                    <span className={`mt-0.5 shrink-0 transition-colors ${nicheMode === opt.value ? 'text-accent' : 'text-muted group-hover:text-muted-light'}`}>
                      {opt.icon}
                    </span>
                    <div>
                      <p className={`text-[15px] font-semibold ${nicheMode === opt.value ? 'text-foreground' : 'text-muted-light'}`}>
                        {opt.label}
                      </p>
                      <p className="text-sm text-muted mt-0.5 leading-relaxed">{opt.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Topic Input (Explore / Direct) */}
            {showTopicInput && (
              <div className="animate-fade-up">
                <label htmlFor="topic" className="block text-xs font-semibold text-muted uppercase tracking-[0.12em] mb-3 text-center">
                  {nicheMode === 'EXPLORE' ? 'Broad topic or interest area' : 'Your topic'}
                </label>
                <input
                  id="topic"
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={
                    nicheMode === 'EXPLORE'
                      ? 'e.g. AI, football, stoicism, luxury'
                      : 'e.g. AI tools for creators'
                  }
                  className="w-full px-5 py-3.5 bg-surface/80 backdrop-blur-md border border-border rounded-xl text-foreground placeholder-muted text-base hover:border-border-hover"
                />
              </div>
            )}

            {error && (
              <div className="animate-scale-in px-5 py-3.5 bg-danger-dim border border-danger/20 rounded-xl">
                <p className="text-sm text-danger font-medium">{error}</p>
              </div>
            )}

            <div className="animate-fade-up stagger-2 pt-1">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 px-5 bg-accent hover:bg-accent-hover text-background font-bold rounded-2xl text-base disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_24px_var(--accent-glow)] hover:shadow-[0_0_36px_var(--accent-glow)] transition-all"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2.5">
                    <span className="w-4.5 h-4.5 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                    {LOADING_STEPS[loadingStep]}
                  </span>
                ) : (
                  getCtaLabel(nicheMode, topic)
                )}
              </button>
            </div>
          </form>

          {/* Trust badges */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 mt-8 pt-6 border-t border-border/50">
            <div className="flex items-center gap-5">
              {[
                { label: '30 days', desc: 'of content' },
                { label: 'AI-powered', desc: 'generation' },
                { label: 'Ready in', desc: 'minutes' },
              ].map((badge) => (
                <div key={badge.label} className="flex flex-col shrink-0">
                  <span className="text-sm font-semibold text-foreground">{badge.label}</span>
                  <span className="text-xs text-muted">{badge.desc}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2.5">
              <div className="flex -space-x-1.5">
                {['bg-gradient-to-br from-orange-400 to-rose-500', 'bg-gradient-to-br from-blue-400 to-violet-500', 'bg-gradient-to-br from-emerald-400 to-teal-500'].map((bg, i) => (
                  <div
                    key={i}
                    className={`w-5 h-5 rounded-full ${bg} border-[1.5px] border-background`}
                  />
                ))}
              </div>
              <span className="text-xs text-muted">
                <span className="text-foreground font-medium">500+</span> creators already onboard
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

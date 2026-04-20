'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/ThemeProvider'
import { KhromaShell, SERIF, SANS } from '@/components/khroma/KhromaShell'
import { pickThemeForTopic } from '@/components/khroma/themes'

const PLACEHOLDER_EXAMPLES = [
  'fitness for busy parents',
  'coffee lovers',
  'AI tools for developers',
  'personal finance tips',
  'travel on a budget',
  'sustainable living',
]

function NicheChip({ label, value }: { label: string; value: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded opacity-80"
      style={{ background: 'rgba(127,127,127,0.12)' }}
      title={`${label === 'V' ? 'Virality' : label === 'C' ? 'Low competition' : 'Monetization'}: ${value}/10`}
    >
      <span className="opacity-60">{label}</span>
      <span>{value}</span>
    </span>
  )
}

type Phase = 'idle' | 'generating' | 'discovering-niches' | 'niche-picker' | 'selecting-niche' | 'ready'

type Channel = { id: string; name?: string; niche?: string; nicheMode?: 'DISCOVER' | 'EXPLORE' | 'DIRECT'; exploreTopic?: string | null }

type NicheOption = {
  id: string
  title: string
  description: string
  competitionScore: number
  viralityScore: number
  contentEaseScore: number
  monetizationScore: number
  rationale: string
}

export default function HomeKhromaSplit() {
  const router = useRouter()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const textMain = isLight ? '#0a0a0a' : '#ffffff'
  const textMuted = isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.55)'

  const [topic, setTopic] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [submittedTopic, setSubmittedTopic] = useState('')
  const [channel, setChannel] = useState<Channel | null>(null)
  const [niches, setNiches] = useState<NicheOption[]>([])

  useEffect(() => {
    const t = setInterval(() => setPlaceholderIdx(i => (i + 1) % PLACEHOLDER_EXAMPLES.length), 3200)
    return () => clearInterval(t)
  }, [])

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
      const c: Channel = await res.json()
      setChannel(c)
      // Move straight into niche discovery — create + discover reads as one
      // continuous motion on the shell instead of a hard page change.
      await discoverNiches(c, body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setPhase('idle')
    }
  }

  async function discoverNiches(c: Channel, createBody: Record<string, string>) {
    setPhase('discovering-niches')
    try {
      const res = await fetch(`/api/channels/${c.id}/generate-niches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: createBody.nicheMode,
          topic: createBody.exploreTopic || createBody.directTopic || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to discover niches')
      }
      const result = await res.json()
      const options: NicheOption[] = result?.nicheOptions ?? result
      if (Array.isArray(options) && options.length > 0) {
        setNiches(options)
        setPhase('niche-picker')
      } else {
        // No options returned (e.g. DIRECT mode may jump straight ahead).
        // Fall back to the channel page so existing flow still works.
        setPhase('ready')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discover niches')
      setPhase('ready')
    }
  }

  async function selectNiche(nicheOptionId: string) {
    if (!channel) return
    setPhase('selecting-niche')
    try {
      const res = await fetch(`/api/channels/${channel.id}/select-niche`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nicheOptionId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to select niche')
      }
      setPhase('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select niche')
      setPhase('niche-picker')
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
    setNiches([])
    setError(null)
  }

  // Once we know a topic, lock the right-column preview to a stable, themed
  // carousel keyed off that topic — the preview stops rotating to signal
  // that the moment is captured.
  const preview = phase === 'idle' ? undefined : pickThemeForTopic(submittedTopic || channel?.id || 'seed')

  return (
    <KhromaShell preview={preview}>
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

        {(phase === 'generating' || phase === 'discovering-niches') && (
          <>
            <p
              className="mb-6 uppercase tracking-[0.22em] text-[11px]"
              style={{ color: textMuted, fontFamily: SANS, fontWeight: 600 }}
            >
              Step 01 — Finding your angle
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
              Exploring directions for{' '}
              <span style={{ fontStyle: 'italic' }}>{submittedTopic || 'your niche'}</span>
              <span className="dots">…</span>
            </h1>
            <p
              className="mb-10 max-w-[28rem]"
              style={{ color: textMuted, fontFamily: SANS, fontSize: '16px', lineHeight: 1.6 }}
            >
              Mapping the landscape — competition, audience appetite, how hard the content is
              to make — so you can pick an angle that actually has room to grow.
            </p>
            <div className="flex items-center gap-3" style={{ color: textMuted, fontFamily: SANS }}>
              <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              <span className="text-sm">
                {phase === 'generating' ? 'Creating your channel…' : 'Scouting niches…'}
              </span>
            </div>
          </>
        )}

        {phase === 'niche-picker' && (
          <>
            <p
              className="mb-5 uppercase tracking-[0.22em] text-[11px]"
              style={{ color: textMuted, fontFamily: SANS, fontWeight: 600 }}
            >
              Step 01 — Pick a direction
            </p>
            <h1
              className="mb-6"
              style={{
                fontFamily: SERIF,
                fontWeight: 400,
                color: textMain,
                fontSize: 'clamp(2.25rem, 3.6vw, 3.25rem)',
                lineHeight: 1.05,
                letterSpacing: '-0.015em',
              }}
            >
              Which angle feels <span style={{ fontStyle: 'italic' }}>most you</span>?
            </h1>
            <p
              className="mb-8 max-w-[30rem]"
              style={{ color: textMuted, fontFamily: SANS, fontSize: '15px', lineHeight: 1.55 }}
            >
              These are the niches with the best intersection of low competition and strong
              audience appetite. Tap one — we&rsquo;ll tune everything else to fit.
            </p>

            <ul className="flex flex-col gap-3 max-h-[56vh] overflow-y-auto pr-2 -mr-2">
              {niches.map(n => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => selectNiche(n.id)}
                    className="group w-full text-left p-4 rounded-xl transition-all hover:translate-x-[2px]"
                    style={{
                      background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-4 mb-1.5">
                      <h3
                        style={{
                          color: textMain,
                          fontFamily: SERIF,
                          fontSize: '22px',
                          fontWeight: 400,
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {n.title}
                      </h3>
                      <div
                        className="shrink-0 flex items-center gap-2 text-[11px] font-mono tabular-nums"
                        style={{ color: textMuted }}
                      >
                        <NicheChip label="V" value={n.viralityScore} />
                        <NicheChip label="C" value={10 - n.competitionScore} />
                        <NicheChip label="$" value={n.monetizationScore} />
                      </div>
                    </div>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: textMuted, fontFamily: SANS }}
                    >
                      {n.description}
                    </p>
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-6">
              <button
                type="button"
                onClick={resetToIdle}
                className="text-sm font-medium underline-offset-4 hover:underline"
                style={{ color: textMuted, fontFamily: SANS }}
              >
                ← Start over
              </button>
            </div>
          </>
        )}

        {phase === 'selecting-niche' && (
          <>
            <p
              className="mb-6 uppercase tracking-[0.22em] text-[11px]"
              style={{ color: textMuted, fontFamily: SANS, fontWeight: 600 }}
            >
              Step 02 — Shaping the voice
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
              Locking in the <span style={{ fontStyle: 'italic' }}>angle</span>
              <span className="dots">…</span>
            </h1>
            <div className="flex items-center gap-3" style={{ color: textMuted, fontFamily: SANS }}>
              <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              <span className="text-sm">Saving your choice…</span>
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
    </KhromaShell>
  )
}

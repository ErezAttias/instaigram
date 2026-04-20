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

type Phase =
  | 'idle'
  | 'generating'
  | 'discovering-niches'
  | 'niche-picker'
  | 'selecting-niche'
  | 'generating-strategy'
  | 'strategy-picker'
  | 'approving-strategy'
  | 'suggesting-names'
  | 'name-picker'
  | 'naming'
  | 'ready'

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

type ContentStrategy = {
  contentIntent: string
  description: string
  tone: string
  hookTypes: string[]
  audience: string
  engagementPotential?: number
  contentDifficulty?: number
  audienceSize?: number
}

type NameStyle = 'descriptive' | 'bold' | 'minimal' | 'personal'
type NameSuggestion = { name: string; style: NameStyle; rationale: string }

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
  const [selectedNicheTitle, setSelectedNicheTitle] = useState('')
  const [strategies, setStrategies] = useState<ContentStrategy[]>([])
  const [selectedPillars, setSelectedPillars] = useState<Set<number>>(new Set())
  const [channelTone, setChannelTone] = useState('')
  const [channelAudience, setChannelAudience] = useState('')
  const [nameSuggestions, setNameSuggestions] = useState<NameSuggestion[]>([])

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

  async function selectNiche(nicheOption: NicheOption) {
    if (!channel) return
    setSelectedNicheTitle(nicheOption.title)
    setPhase('selecting-niche')
    try {
      const res = await fetch(`/api/channels/${channel.id}/select-niche`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nicheOptionId: nicheOption.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to select niche')
      }
      await generateStrategy()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select niche')
      setPhase('niche-picker')
    }
  }

  async function generateStrategy() {
    if (!channel) return
    setPhase('generating-strategy')
    try {
      const res = await fetch(`/api/channels/${channel.id}/generate-content-strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to generate strategy')
      }
      const result = await res.json()
      const list: ContentStrategy[] = Array.isArray(result.strategies)
        ? result.strategies
        : result.strategy ? [result.strategy] : []
      setStrategies(list)
      setSelectedPillars(new Set(list.map((_, i) => i)))
      if (result.channelTone) setChannelTone(result.channelTone)
      if (result.channelAudience) setChannelAudience(result.channelAudience)
      setPhase('strategy-picker')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Strategy generation failed')
      setPhase('niche-picker')
    }
  }

  function togglePillar(index: number) {
    setSelectedPillars(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        if (next.size > 1) next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  async function approveStrategy() {
    if (!channel) return
    const picked = strategies.filter((_, i) => selectedPillars.has(i))
    if (picked.length === 0) return
    setPhase('approving-strategy')
    try {
      const res = await fetch(`/api/channels/${channel.id}/approve-content-strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pillars: picked,
          channelTone: channelTone || undefined,
          channelAudience: channelAudience || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to approve strategy')
      }
      await suggestNames()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve strategy')
      setPhase('strategy-picker')
    }
  }

  async function suggestNames() {
    if (!channel) return
    setPhase('suggesting-names')
    try {
      const res = await fetch(`/api/channels/${channel.id}/generate-names`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to suggest names')
      }
      const result = await res.json()
      setNameSuggestions(result.names ?? [])
      setPhase('name-picker')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to suggest names')
      setPhase('ready')
    }
  }

  async function setChannelName(name: string) {
    if (!channel) return
    setPhase('naming')
    try {
      const res = await fetch(`/api/channels/${channel.id}/set-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to set name')
      }
      setChannel(c => c ? { ...c, name } : c)
      setPhase('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set name')
      setPhase('name-picker')
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
    setSelectedNicheTitle('')
    setStrategies([])
    setSelectedPillars(new Set())
    setChannelTone('')
    setChannelAudience('')
    setNameSuggestions([])
    setError(null)
  }

  // Once we know a topic, lock the right-column preview to a stable, themed
  // carousel keyed off that topic — the preview stops rotating to signal
  // that the moment is captured.
  const previewSeed = channel?.name || selectedNicheTitle || submittedTopic || channel?.id || 'seed'
  const preview = phase === 'idle' ? undefined : pickThemeForTopic(previewSeed)

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
                    onClick={() => selectNiche(n)}
                    className="group w-full text-left p-4 rounded-xl transition-all hover:translate-x-[2px]"
                    style={{
                      background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    <h3
                      className="mb-1.5"
                      style={{
                        color: textMain,
                        fontFamily: SANS,
                        fontSize: '17px',
                        fontWeight: 600,
                        letterSpacing: '-0.005em',
                      }}
                    >
                      {n.title}
                    </h3>
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

        {(phase === 'selecting-niche' || phase === 'generating-strategy') && (
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
              Building the voice for{' '}
              <span style={{ fontStyle: 'italic' }}>{selectedNicheTitle || 'your channel'}</span>
              <span className="dots">…</span>
            </h1>
            <p
              className="mb-10 max-w-[28rem]"
              style={{ color: textMuted, fontFamily: SANS, fontSize: '16px', lineHeight: 1.6 }}
            >
              Drafting tone, audience, and a few content pillars you can keep, drop, or swap.
            </p>
            <div className="flex items-center gap-3" style={{ color: textMuted, fontFamily: SANS }}>
              <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              <span className="text-sm">
                {phase === 'selecting-niche' ? 'Saving your choice…' : 'Drafting pillars…'}
              </span>
            </div>
          </>
        )}

        {phase === 'strategy-picker' && (
          <>
            <p
              className="mb-5 uppercase tracking-[0.22em] text-[11px]"
              style={{ color: textMuted, fontFamily: SANS, fontWeight: 600 }}
            >
              Step 02 — Keep what fits
            </p>
            <h1
              className="mb-4"
              style={{
                fontFamily: SERIF,
                fontWeight: 400,
                color: textMain,
                fontSize: 'clamp(2.25rem, 3.6vw, 3.25rem)',
                lineHeight: 1.05,
                letterSpacing: '-0.015em',
              }}
            >
              Your <span style={{ fontStyle: 'italic' }}>content pillars</span>.
            </h1>
            {(channelTone || channelAudience) && (
              <p className="mb-6 max-w-[32rem]" style={{ color: textMuted, fontFamily: SANS, fontSize: '14px', lineHeight: 1.55 }}>
                {channelTone && <><span className="opacity-70">Tone: </span>{channelTone}</>}
                {channelTone && channelAudience && <span className="opacity-40 mx-2">·</span>}
                {channelAudience && <><span className="opacity-70">Audience: </span>{channelAudience}</>}
              </p>
            )}

            <ul className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-2 -mr-2">
              {strategies.map((s, i) => {
                const checked = selectedPillars.has(i)
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => togglePillar(i)}
                      className="w-full text-left p-4 rounded-xl transition-all"
                      style={{
                        background: checked
                          ? (isLight ? 'rgba(37,99,235,0.06)' : 'rgba(37,99,235,0.12)')
                          : (isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)'),
                        border: `1px solid ${checked
                          ? (isLight ? 'rgba(37,99,235,0.35)' : 'rgba(122,162,255,0.35)')
                          : (isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)')}`,
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className="shrink-0 mt-1 w-4 h-4 rounded flex items-center justify-center"
                          style={{
                            background: checked ? '#2563eb' : 'transparent',
                            border: `1px solid ${checked ? '#2563eb' : (isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.25)')}`,
                          }}
                        >
                          {checked && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <h3
                            className="mb-1"
                            style={{ color: textMain, fontFamily: SANS, fontSize: '15px', fontWeight: 600 }}
                          >
                            {s.contentIntent}
                          </h3>
                          <p className="text-[13px] leading-relaxed" style={{ color: textMuted, fontFamily: SANS }}>
                            {s.description}
                          </p>
                          {s.hookTypes?.length > 0 && (
                            <div className="flex gap-1.5 mt-2 flex-wrap">
                              {s.hookTypes.slice(0, 3).map((h, hi) => (
                                <span
                                  key={hi}
                                  className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                                  style={{
                                    color: textMuted,
                                    background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)',
                                    fontFamily: SANS,
                                  }}
                                >
                                  {h}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="mt-6 flex items-center gap-5">
              <button
                type="button"
                onClick={approveStrategy}
                disabled={selectedPillars.size === 0}
                className="h-12 px-8 text-white font-medium rounded-md text-[15px] disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:brightness-110 active:scale-[0.98]"
                style={{ background: '#2563eb', fontFamily: SANS, boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }}
              >
                Continue with {selectedPillars.size} {selectedPillars.size === 1 ? 'pillar' : 'pillars'} →
              </button>
              <button
                type="button"
                onClick={generateStrategy}
                className="text-sm font-medium underline-offset-4 hover:underline"
                style={{ color: textMuted, fontFamily: SANS }}
              >
                Regenerate
              </button>
            </div>
          </>
        )}

        {(phase === 'approving-strategy' || phase === 'suggesting-names') && (
          <>
            <p
              className="mb-6 uppercase tracking-[0.22em] text-[11px]"
              style={{ color: textMuted, fontFamily: SANS, fontWeight: 600 }}
            >
              Step 03 — A name for this channel
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
              Drafting <span style={{ fontStyle: 'italic' }}>something worth saying</span>
              <span className="dots">…</span>
            </h1>
            <div className="flex items-center gap-3" style={{ color: textMuted, fontFamily: SANS }}>
              <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              <span className="text-sm">
                {phase === 'approving-strategy' ? 'Locking in pillars…' : 'Thinking of names…'}
              </span>
            </div>
          </>
        )}

        {phase === 'name-picker' && (
          <>
            <p
              className="mb-5 uppercase tracking-[0.22em] text-[11px]"
              style={{ color: textMuted, fontFamily: SANS, fontWeight: 600 }}
            >
              Step 03 — Pick a name
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
              What should we <span style={{ fontStyle: 'italic' }}>call it</span>?
            </h1>
            <p
              className="mb-8 max-w-[30rem]"
              style={{ color: textMuted, fontFamily: SANS, fontSize: '15px', lineHeight: 1.55 }}
            >
              You can always rename later. Pick the one that makes you want to click follow.
            </p>

            <ul className="flex flex-col gap-2 max-h-[52vh] overflow-y-auto pr-2 -mr-2">
              {nameSuggestions.map((n, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setChannelName(n.name)}
                    className="group w-full text-left px-4 py-3 rounded-xl transition-all hover:translate-x-[2px]"
                    style={{
                      background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h3
                        style={{
                          color: textMain,
                          fontFamily: SANS,
                          fontSize: '17px',
                          fontWeight: 600,
                          letterSpacing: '-0.005em',
                        }}
                      >
                        {n.name}
                      </h3>
                      <span
                        className="shrink-0 text-[10px] uppercase tracking-wider opacity-60"
                        style={{ color: textMuted, fontFamily: SANS }}
                      >
                        {n.style}
                      </span>
                    </div>
                    <p className="text-[13px] mt-1 opacity-80" style={{ color: textMuted, fontFamily: SANS }}>
                      {n.rationale}
                    </p>
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-6">
              <button
                type="button"
                onClick={suggestNames}
                className="text-sm font-medium underline-offset-4 hover:underline"
                style={{ color: textMuted, fontFamily: SANS }}
              >
                Generate more options
              </button>
            </div>
          </>
        )}

        {phase === 'naming' && (
          <>
            <p
              className="mb-6 uppercase tracking-[0.22em] text-[11px]"
              style={{ color: textMuted, fontFamily: SANS, fontWeight: 600 }}
            >
              Step 03 — Naming
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
              Saving the name<span className="dots">…</span>
            </h1>
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

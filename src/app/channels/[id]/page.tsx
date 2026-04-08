'use client'

import { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import InstagramPreview from '@/components/InstagramPreview'
import '@/components/instagram-preview.css'

interface NicheOption {
  id: string
  title: string
  description: string
  competitionScore: number
  viralityScore: number
  contentEaseScore: number
  monetizationScore: number
  rationale: string
  selected: boolean
}

interface Post {
  id: string
  dayIndex: number
  title: string
  hook: string
  type: string
  status: string
  carouselJobId: string | null
}

interface ContentStrategy {
  contentIntent: string
  description: string
  tone: string
  hookTypes: string[]
  audience: string
  engagementPotential?: number
  contentDifficulty?: number
  audienceSize?: number
}

interface Channel {
  id: string
  name: string
  niche: string | null
  nicheMode: 'DISCOVER' | 'EXPLORE' | 'DIRECT'
  exploreTopic: string | null
  contentStrategy: ContentStrategy | null
  status: string
  nicheOptions: NicheOption[]
  posts: Post[]
}

type NameStyle = 'descriptive' | 'bold' | 'minimal' | 'personal'

interface NameSuggestion {
  name: string
  style: NameStyle
  rationale: string
}

type RegenerateIntent = 'more_viral' | 'more_niche' | 'more_monetizable' | 'more_unconventional'

const REGENERATE_INTENTS: { value: RegenerateIntent; label: string }[] = [
  { value: 'more_viral', label: 'More viral' },
  { value: 'more_niche', label: 'More niche' },
  { value: 'more_monetizable', label: 'More monetizable' },
  { value: 'more_unconventional', label: 'More unconventional' },
]

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT: { label: 'Draft', color: 'text-muted-light', bg: 'bg-surface-elevated' },
  NICHE_SELECTED: { label: 'Niche selected', color: 'text-accent', bg: 'bg-accent-dim' },
  STRATEGY_DEFINED: { label: 'Strategy defined', color: 'text-violet', bg: 'bg-violet-dim' },
  NAMED: { label: 'Named', color: 'text-violet', bg: 'bg-violet-dim' },
  HOOKS_GENERATED: { label: 'Hooks ready', color: 'text-[#60a5fa]', bg: 'bg-[rgba(96,165,250,0.1)]' },
  CONTENT_GENERATED: { label: 'Content ready', color: 'text-success', bg: 'bg-success-dim' },
  COMPLETE: { label: 'Complete', color: 'text-success', bg: 'bg-success-dim' },
}

const MODE_LABELS: Record<string, string> = {
  DISCOVER: 'Discover',
  EXPLORE: 'Explore',
  DIRECT: 'Direct',
}

// New flow: Topic → Strategy → Posts (Name is optional/later)
const STEP_LABELS = ['Topic', 'Strategy', 'Posts']

/**
 * Returns a red→yellow→green color for a 1-10 score.
 */

// ─── Sidebar Stepper ─────────────────────────────────────────

function SidebarStepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex flex-col">
      {STEP_LABELS.map((label, i) => {
        const done = currentStep > i
        const active = currentStep === i
        const connectorDone = currentStep >= i
        return (
          <div key={label}>
            {i > 0 && (
              <div className="w-8 flex justify-center">
                <div className={`w-px h-3 ${connectorDone ? 'bg-accent/40' : 'bg-border'}`} />
              </div>
            )}
            <div className="flex items-center gap-3">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-none transition-all duration-300
                  ${done ? 'bg-accent/15 text-accent' : active ? 'bg-accent text-background shadow-[0_0_20px_var(--accent-glow)]' : 'bg-surface-elevated text-muted border border-border'}
                `}
              >
                {done ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 7.5L5.5 10.5L11.5 3.5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={`text-sm font-medium transition-colors ${active ? 'text-foreground' : done ? 'text-muted-light' : 'text-muted'}`}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className="w-8 flex justify-center">
                <div className={`w-px h-3 ${done ? 'bg-accent/40' : 'bg-border'}`} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Horizontal Stepper (Mobile) ────────────────────────────

function HorizontalStepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center overflow-hidden">
      {STEP_LABELS.map((label, i) => {
        const done = currentStep > i
        const active = currentStep === i
        return (
          <div key={label} className={`flex items-center gap-1.5 ${active ? 'flex-shrink-0' : 'shrink'} min-w-0`}>
            <div
              className={`
                w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all shrink-0
                ${done ? 'bg-accent/15 text-accent' : active ? 'bg-accent text-background' : 'bg-surface-elevated text-muted border border-border'}
              `}
            >
              {done ? (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 6.5L4.5 9L10 3" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className={`text-sm font-medium truncate ${active ? 'text-foreground' : 'text-muted'}`}>{label}</span>
            {i < STEP_LABELS.length - 1 && (
              <div className={`w-4 shrink-0 h-px mx-1 ${done ? 'bg-accent/40' : 'bg-border'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Primary Button ──────────────────────────────────────────

function PrimaryButton({
  onClick,
  disabled,
  loading,
  loadingText,
  children,
  className,
}: {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  loadingText?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`px-5 py-2.5 bg-accent hover:bg-accent-hover text-background rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_16px_var(--accent-glow)] hover:shadow-[0_0_24px_var(--accent-glow)] transition-all${className ? ` ${className}` : ''}`}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
          {loadingText || 'Loading...'}
        </span>
      ) : children}
    </button>
  )
}

function GhostButton({
  onClick,
  disabled,
  children,
  active,
  className,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  active?: boolean
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 border rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-40 ${
        active
          ? 'border-accent/30 bg-accent-dim text-foreground'
          : 'border-border hover:border-accent/30 hover:bg-accent-dim/50'
      }${className ? ` ${className}` : ''}`}
    >
      {children}
    </button>
  )
}

// ─── Section Wrapper ─────────────────────────────────────────

function Section({
  children,
  delay,
  compact,
  completed,
  active,
  collapsible,
  defaultCollapsed,
  collapsedSummary,
}: {
  children: React.ReactNode
  delay?: number
  compact?: boolean
  completed?: boolean
  active?: boolean
  collapsible?: boolean
  defaultCollapsed?: boolean
  collapsedSummary?: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false)

  // Auto-collapse when the parent signals this section should collapse
  useEffect(() => {
    if (defaultCollapsed) setCollapsed(true)
  }, [defaultCollapsed])

  return (
    <div
      className={`animate-fade-up rounded-2xl border transition-all duration-300 ${
        completed
          ? 'border-border/60 bg-surface/70 opacity-80 hover:opacity-100 hover:border-border-hover'
          : active
            ? 'border-border bg-surface hover:border-border-hover border-l-2 border-l-accent'
            : 'border-border bg-surface hover:border-border-hover'
      } ${collapsed ? 'px-6 py-4 lg:px-8' : compact ? 'p-5' : 'p-6 lg:p-8'} relative`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {collapsible && collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="w-full flex items-center justify-between gap-4 group"
        >
          <div className="flex-1 min-w-0 text-left">{collapsedSummary}</div>
          <svg
            width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            className="text-muted group-hover:text-foreground transition-colors shrink-0"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
      ) : (
        <>
          {collapsible && (
            <button
              onClick={() => setCollapsed(true)}
              className="absolute top-4 right-4 lg:top-6 lg:right-6 text-muted hover:text-foreground transition-colors z-10"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M4 10l4-4 4 4" />
              </svg>
            </button>
          )}
          {children}
        </>
      )}
    </div>
  )
}

// ─── Locked Step (collapsed) ─────────────────────────────────

function LockedStep({ label, delay }: { label: string; delay?: number }) {
  return (
    <div
      className="animate-fade-up rounded-2xl border border-border bg-surface px-6 py-4 opacity-30 transition-all duration-300 flex items-center justify-between"
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <h2 className="text-base font-semibold text-muted">{label}</h2>
      <span className="text-xs font-medium text-muted bg-surface-elevated px-2.5 py-1 rounded-lg">Locked</span>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────

export default function ChannelDashboard() {
  const params = useParams()
  const channelId = params.id as string
  const [channel, setChannel] = useState<Channel | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [niches, setNiches] = useState<NicheOption[]>([])
  const [directTopicInput, setDirectTopicInput] = useState('')
  const [showDirectRefineChoice, setShowDirectRefineChoice] = useState(false)
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set())
  const [slideViewerIndex, setSlideViewerIndex] = useState<Record<string, number>>({})
  const [dbPostSlides, setDbPostSlides] = useState<Record<string, Array<{ slideIndex: number; role: string; headline: string | null; body: string | null; displayTitle: string | null; displaySupport: string | null; imageUrl: string | null }>>>({})
  const [dbPostCaptions, setDbPostCaptions] = useState<Record<string, { caption: string | null; hashtags: string[] }>>({})
  const [dbPostSlidesLoading, setDbPostSlidesLoading] = useState<Set<string>>(new Set())
  const [previewMode, setPreviewMode] = useState<Set<string>>(new Set())
  const [regenLoading, setRegenLoading] = useState<Record<string, string | null>>({}) // postId -> mode ('copy'|'image'|'full') or null

  // ─── Content Strategy state ─────────────────────────────────
  const [strategyOptions, setStrategyOptions] = useState<ContentStrategy[]>([])
  // Legacy single-strategy compat (kept for auto-approve flow)
  const [generatedStrategy, setGeneratedStrategy] = useState<ContentStrategy | null>(null)
  const [editingStrategy, setEditingStrategy] = useState<ContentStrategy | null>(null)
  const [isEditingStrategy, setIsEditingStrategy] = useState(false)

  // ─── Post batch streaming state ─────────────────────────────
  interface CompletedPost {
    id: string
    dayIndex: number
    title: string
    hook: string
    slideCount: number
    carouselJobId?: string
    carouselJobStatus?: string
    hasImages?: boolean
    slides: Array<{ slideIndex: number; role: string; headline: string; body: string; supportingDetail: string | null }>
  }
  const [postStreamProgress, setPostStreamProgress] = useState<{ current: number; total: number; hook: string } | null>(null)
  const [carouselProgress, setCarouselProgress] = useState<{ carouselJobId: string; message: string } | null>(null)
  const [completedPosts, setCompletedPosts] = useState<CompletedPost[]>([])
  const [postStreamErrors, setPostStreamErrors] = useState<Array<{ hook: string; error: string }>>([])
  const [isStreamingPosts, setIsStreamingPosts] = useState(false)
  const postAbortRef = useRef<AbortController | null>(null)
  const carouselPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Optional naming state ──────────────────────────────────
  const [showNaming, setShowNaming] = useState(false)
  const [nameSuggestions, setNameSuggestions] = useState<NameSuggestion[]>([])
  const [customName, setCustomName] = useState('')
  const [selectedNameStyle, setSelectedNameStyle] = useState<NameStyle | null>(null)

  const fetchChannel = useCallback(async () => {
    try {
      const res = await fetch(`/api/channels/${channelId}`)
      if (!res.ok) throw new Error('Failed to fetch channel')
      const data = await res.json()
      setChannel(data)
      if (data.nicheOptions?.length > 0) {
        setNiches(data.nicheOptions)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load channel')
    } finally {
      setLoading(false)
    }
  }, [channelId])

  useEffect(() => {
    fetchChannel()
  }, [fetchChannel])

  // Auto-start niche discovery for DISCOVER mode (no idle "Generate niches" click needed)
  const autoStartedRef = useRef(false)
  const nicheScrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollArrows = useCallback(() => {
    const el = nicheScrollRef.current
    if (!el) return
    setCanScrollLeft(Math.round(el.scrollLeft) > 10)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    const el = nicheScrollRef.current
    if (!el) return
    updateScrollArrows()
    el.addEventListener('scroll', updateScrollArrows, { passive: true })
    const ro = new ResizeObserver(updateScrollArrows)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', updateScrollArrows); ro.disconnect() }
  }, [niches, updateScrollArrows])
  useEffect(() => {
    if (
      channel &&
      channel.status === 'DRAFT' &&
      niches.length === 0 &&
      !autoStartedRef.current &&
      actionLoading === null
    ) {
      if (channel.nicheMode === 'DISCOVER' || channel.nicheMode === 'EXPLORE') {
        autoStartedRef.current = true
        handleGenerateNiches()
      } else if (channel.nicheMode === 'DIRECT' && channel.exploreTopic) {
        setDirectTopicInput(channel.exploreTopic)
        setShowDirectRefineChoice(true)
      }
    }
  }, [channel, niches.length, actionLoading])

  async function handleAction(action: string, options?: RequestInit) {
    setActionLoading(action)
    setError('')
    try {
      const res = await fetch(`/api/channels/${channelId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...options,
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `Failed: ${action}`)
      }
      const result = await res.json()

      if (action === 'generate-niches' || action === 'regenerate-niches' || action === 'direct-topic') {
        const options = result?.nicheOptions ?? result
        if (Array.isArray(options)) {
          setNiches(options)
        }
      }

      await fetchChannel()
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActionLoading(null)
    }
  }

  // ─── Topic handlers ───────────────────────────────────────────

  async function handleSelectNiche(nicheOptionId: string) {
    setActionLoading('select-niche')
    setError('')
    try {
      const res = await fetch(`/api/channels/${channelId}/select-niche`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nicheOptionId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to select niche')
      }
      await fetchChannel()
      setActionLoading(null)
      // Auto-generate content strategy after niche selection
      handleGenerateStrategy()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select niche')
      setActionLoading(null)
    }
  }

  async function handleGenerateNiches() {
    if (!channel) return
    const mode = channel.nicheMode
    const topic = channel.exploreTopic

    await handleAction('generate-niches', {
      body: JSON.stringify({ mode, topic: topic ?? undefined }),
    })
  }

  async function handleRegenerateMore(intent: RegenerateIntent) {
    const existingTitles = niches.map((n) => n.title)
    await handleAction('regenerate-niches', {
      body: JSON.stringify({ intent, existingTitles }),
    })
  }

  async function handleDirectTopic(refine: boolean) {
    const topic = directTopicInput.trim() || channel?.exploreTopic
    if (!topic) return
    setShowDirectRefineChoice(false)
    const result = await handleAction('direct-topic', {
      body: JSON.stringify({ topic, refine }),
    })
    if (!refine && result) {
      // Auto-generate strategy for direct mode
      handleGenerateStrategy()
    }
  }

  // ─── Content Strategy handlers ─────────────────────────────────

  async function handleGenerateStrategy() {
    setActionLoading('generate-strategy')
    setError('')
    setStrategyOptions([])
    setGeneratedStrategy(null)
    setIsEditingStrategy(false)
    try {
      const res = await fetch(`/api/channels/${channelId}/generate-content-strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to generate strategy')
      }
      const result = await res.json()
      // New: returns array of strategies
      if (result.strategies && Array.isArray(result.strategies)) {
        setStrategyOptions(result.strategies)
      } else if (result.strategy) {
        // Legacy fallback
        setStrategyOptions([result.strategy])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Strategy generation failed')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleSelectStrategy(strategy: ContentStrategy) {
    setActionLoading('approve-strategy')
    setError('')
    try {
      const res = await fetch(`/api/channels/${channelId}/approve-content-strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentStrategy: strategy }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to approve strategy')
      }
      setStrategyOptions([])
      setGeneratedStrategy(null)
      setEditingStrategy(null)
      setIsEditingStrategy(false)
      await fetchChannel()
      setActionLoading(null)
      // Auto-advance: start generating first post after strategy is approved
      // Use setTimeout to ensure state updates have flushed before starting
      setTimeout(() => handleGenerateBatch(), 100)
      return
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve strategy')
      setActionLoading(null)
    }
  }

  // Legacy compat
  async function handleApproveStrategy() {
    const strategy = isEditingStrategy ? editingStrategy : generatedStrategy
    if (!strategy) return
    handleSelectStrategy(strategy)
  }

  // ─── Batch post generation ─────────────────────────────────────

  // Stop polling carousel progress when done
  function stopCarouselPolling() {
    if (carouselPollRef.current) {
      clearInterval(carouselPollRef.current)
      carouselPollRef.current = null
    }
    setCarouselProgress(null)
  }

  // Start polling a carousel job for progress updates
  function startCarouselPolling(carouselJobId: string) {
    stopCarouselPolling()
    setCarouselProgress({ carouselJobId, message: 'Starting carousel pipeline...' })

    carouselPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/carousel/${carouselJobId}`)
        if (!res.ok) return
        const data = await res.json()
        if (data.progress?.message) {
          setCarouselProgress(prev => prev ? { ...prev, message: data.progress.message } : null)
        }
        // Stop polling when done
        if (data.status === 'COMPLETE' || data.status === 'FAILED') {
          stopCarouselPolling()
        }
      } catch {
        // ignore polling errors
      }
    }, 2500)
  }

  async function handleGenerateBatch() {
    setIsStreamingPosts(true)
    setCompletedPosts([])
    setPostStreamErrors([])
    setPostStreamProgress(null)
    setCarouselProgress(null)
    setError('')

    const abort = new AbortController()
    postAbortRef.current = abort

    try {
      const res = await fetch(`/api/channels/${channelId}/generate-posts-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({ batchSize: 1 }),
        signal: abort.signal,
      })

      if (!res.ok) {
        let errorMsg = 'Failed to start post generation'
        try {
          const data = await res.json()
          errorMsg = data.error || errorMsg
        } catch {
          errorMsg = `Server error (${res.status})`
        }
        throw new Error(errorMsg)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response stream available')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let eventType = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const data = JSON.parse(line.slice(6))

              switch (eventType) {
                case 'phase':
                  // Phase updates handled by progress
                  break

                case 'post_start':
                  setPostStreamProgress({
                    current: data.postIndex,
                    total: data.totalPosts,
                    hook: data.hook,
                  })
                  break

                case 'post_complete': {
                  stopCarouselPolling()
                  const postId = data.post.id
                  const carouselJobId = data.post.carouselJobId
                  setCompletedPosts(prev => [...prev, {
                    id: postId,
                    dayIndex: data.post.dayIndex,
                    title: data.post.title,
                    hook: data.post.hook,
                    slideCount: data.post.slideCount,
                    carouselJobId,
                    carouselJobStatus: data.post.carouselJobStatus,
                    hasImages: data.post.hasImages,
                    slides: data.post.slides || [],
                  }])
                  // Auto-expand the completed post for review
                  setExpandedPosts(prev => new Set(prev).add(postId))
                  if (carouselJobId && !dbPostSlides[postId] && !dbPostSlidesLoading.has(postId)) {
                    fetchCarouselSlides(postId, carouselJobId)
                  }
                  break
                }

                case 'post_carousel_progress':
                  // Start polling for granular carousel progress
                  if (data.carouselJobId) {
                    startCarouselPolling(data.carouselJobId)
                  }
                  break

                case 'post_error':
                  stopCarouselPolling()
                  setPostStreamErrors(prev => [...prev, {
                    hook: data.hook,
                    error: data.error,
                  }])
                  // Also set as top-level error so it's visible
                  setError(`Post generation failed: ${data.error}`)
                  break

                case 'complete':
                  stopCarouselPolling()
                  await fetchChannel()
                  break

                case 'error':
                  setError(data.error)
                  break
              }
            } catch {
              // skip malformed JSON
            }
            eventType = ''
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled
      } else {
        setError(err instanceof Error ? err.message : 'Post generation failed')
      }
    } finally {
      stopCarouselPolling()
      setIsStreamingPosts(false)
      setPostStreamProgress(null)
      postAbortRef.current = null
    }
  }

  function handleStopPostGeneration() {
    postAbortRef.current?.abort()
    stopCarouselPolling()
    setIsStreamingPosts(false)
    setPostStreamProgress(null)
    fetchChannel()
  }

  // ─── Optional naming handlers ──────────────────────────────────

  async function handleGenerateNames(style?: NameStyle) {
    setActionLoading('generate-names')
    setError('')
    try {
      const res = await fetch(`/api/channels/${channelId}/generate-names`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(style ? { style } : {}),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to generate names')
      }
      const result = await res.json()
      setNameSuggestions(result.names)
      setSelectedNameStyle(style ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate names')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleSetName(name: string) {
    setActionLoading('set-name')
    setError('')
    try {
      const res = await fetch(`/api/channels/${channelId}/set-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to set name')
      }
      setCustomName('')
      setNameSuggestions([])
      setShowNaming(false)
      await fetchChannel()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set name')
    } finally {
      setActionLoading(null)
    }
  }

  function togglePostExpanded(postId: string, carouselJobId?: string | null) {
    setExpandedPosts(prev => {
      const next = new Set(prev)
      if (next.has(postId)) {
        next.delete(postId)
      } else {
        next.add(postId)
        // Fetch carousel slides if we have a job ID and haven't loaded yet
        if (carouselJobId && !dbPostSlides[postId] && !dbPostSlidesLoading.has(postId)) {
          fetchCarouselSlides(postId, carouselJobId)
        }
      }
      return next
    })
  }

  async function fetchCarouselSlides(postId: string, carouselJobId: string) {
    setDbPostSlidesLoading(prev => new Set(prev).add(postId))
    try {
      const res = await fetch(`/api/carousel/${carouselJobId}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.slides) {
        setDbPostSlides(prev => ({
          ...prev,
          [postId]: data.slides.sort((a: { slideIndex: number }, b: { slideIndex: number }) => a.slideIndex - b.slideIndex),
        }))
        setDbPostCaptions(prev => ({
          ...prev,
          [postId]: { caption: data.caption || null, hashtags: data.hashtags || [] },
        }))
      }
    } catch {
      // ignore
    } finally {
      setDbPostSlidesLoading(prev => {
        const next = new Set(prev)
        next.delete(postId)
        return next
      })
    }
  }

  async function handleRegenerateSlide(postId: string, carouselJobId: string, slideIndex: number, mode: 'copy' | 'image' | 'full') {
    const key = `${postId}-${slideIndex}`
    setRegenLoading(prev => ({ ...prev, [key]: mode }))
    try {
      const res = await fetch(`/api/carousel/${carouselJobId}/regenerate-slide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slideIndex, mode }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Regeneration failed')
      }
      // Refresh the slides
      await fetchCarouselSlides(postId, carouselJobId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regeneration failed')
    } finally {
      setRegenLoading(prev => ({ ...prev, [key]: null }))
    }
  }

  // ─── Loading state ─────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto pt-12">
        <div className="space-y-5">
          <div className="skeleton h-10 w-64" />
          <div className="skeleton h-5 w-40" />
          <div className="mt-10 space-y-5">
            <div className="skeleton h-40 w-full rounded-2xl" />
            <div className="skeleton h-40 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  if (!channel) {
    return (
      <div className="max-w-5xl mx-auto pt-16 text-center">
        <p className="text-danger text-base">Channel not found</p>
      </div>
    )
  }

  // New step order: DRAFT(0) → NICHE_SELECTED(1) → STRATEGY_DEFINED(2) → CONTENT_GENERATED+ (2, posts exist)
  const stepOrder = ['DRAFT', 'NICHE_SELECTED', 'STRATEGY_DEFINED', 'CONTENT_GENERATED', 'COMPLETE']
  const statusIndex = stepOrder.indexOf(channel.status)
  // Map to 3-step UI: 0=Topic, 1=Strategy, 2=Posts
  const currentStep = statusIndex <= 0 ? 0 : statusIndex === 1 ? 1 : statusIndex >= 2 ? 2 : 0
  // For backward compat: channels with NAMED/HOOKS_GENERATED status are at step 2
  const isLegacyStatus = ['NAMED', 'HOOKS_GENERATED', 'POSITIONED'].includes(channel.status)
  const effectiveStep = isLegacyStatus ? 2 : currentStep

  const statusInfo = STATUS_CONFIG[channel.status] || STATUS_CONFIG.DRAFT
  const isDirectMode = channel.nicheMode === 'DIRECT'
  const isExploreMode = channel.nicheMode === 'EXPLORE'

  const step1Title = isDirectMode
    ? 'Set topic'
    : isExploreMode
      ? `Explore angles${channel.exploreTopic ? ` — ${channel.exploreTopic}` : ''}`
      : 'Discover niches'

  const hasStrategy = !!channel.contentStrategy
  const hasPosts = channel.posts.length > 0

  return (
    <div className="animate-fade-up">
      <div className="flex gap-8 xl:gap-10">
        {/* ─── Sidebar (Desktop) ──────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-[240px] xl:w-[260px] shrink-0 sticky top-20 self-start pt-2">
          {/* Channel info */}
          <div className="mb-6">
            {channel.name === 'Untitled Channel' ? (
              <div className="mb-1">
                <p className="text-xs text-muted uppercase tracking-[0.1em] font-semibold mb-1">Channel name</p>
                <button
                  onClick={() => setShowNaming(true)}
                  className="flex items-center gap-2 group"
                >
                  <span className="text-xl font-bold tracking-tight text-muted italic border-b border-dashed border-muted/40 leading-tight">Untitled channel</span>
                  <span className="text-xs font-semibold text-accent opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">+ Name it</span>
                </button>
              </div>
            ) : (
              <h1 className="text-2xl font-bold tracking-tight leading-tight mb-1">{channel.name}</h1>
            )}
            {channel.niche && (
              <p className="text-sm text-muted-light leading-relaxed">{channel.niche}</p>
            )}
          </div>

          {/* Stepper */}
          <SidebarStepper currentStep={effectiveStep} />

          {/* Bottom links */}
          <div className="mt-8 pt-6 border-t border-border space-y-2">
            {hasPosts && (
              <>
                <Link
                  href={`/channels/${channelId}/posts`}
                  className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-muted-light hover:text-foreground hover:bg-surface-elevated rounded-xl transition-all"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="12" height="12" rx="2" />
                    <path d="M5 6h6M5 8.5h4" />
                  </svg>
                  View all posts
                </Link>
                <Link
                  href={`/channels/${channelId}/validation`}
                  className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-muted-light hover:text-foreground hover:bg-surface-elevated rounded-xl transition-all"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13.5 4.5L6 12L2.5 8.5" />
                  </svg>
                  Validation report
                </Link>
              </>
            )}
            {/* Name channel — optional later step */}
            {hasStrategy && (
              <button
                onClick={() => setShowNaming(!showNaming)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-muted-light hover:text-foreground hover:bg-surface-elevated rounded-xl transition-all w-full text-left"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 13h2l8-8-2-2-8 8v2z" />
                  <path d="M10 4l2 2" />
                </svg>
                {channel.name !== 'Untitled Channel' ? 'Rename channel' : 'Name channel'}
              </button>
            )}
          </div>
        </aside>

        {/* ─── Main Content ───────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-8">
          {/* Mobile header */}
          <div className="lg:hidden mb-4 pl-2">
            {channel.name === 'Untitled Channel' ? (
              <div>
                <p className="text-xs text-muted uppercase tracking-[0.1em] font-semibold mb-1">Channel name</p>
                <button
                  onClick={() => setShowNaming(true)}
                  className="flex items-baseline gap-2"
                >
                  <span className="text-2xl font-bold tracking-tight text-muted italic border-b border-dashed border-muted/40">Untitled channel</span>
                  <span className="text-xs font-semibold text-accent whitespace-nowrap">+ Name it</span>
                </button>
              </div>
            ) : (
              <h1 className="text-2xl font-bold tracking-tight">{channel.name}</h1>
            )}
          </div>

          {/* Error banner */}
          {error && (
            <div className="animate-scale-in bg-danger-dim border border-danger/20 px-5 py-4 rounded-2xl sticky top-20 z-10">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-danger font-medium">{error}</p>
                <button onClick={() => setError('')} className="text-danger/60 hover:text-danger text-sm shrink-0">dismiss</button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              Step 1: Niche / Topic Selection
              ═══════════════════════════════════════════════════════ */}
          <Section
            delay={60}
            completed={effectiveStep > 0}
            active={effectiveStep === 0}
            collapsible={effectiveStep > 0 && niches.length > 0 && niches.some(n => n.selected)}
            defaultCollapsed={effectiveStep > 0 && niches.length > 0 && niches.some(n => n.selected)}
            collapsedSummary={
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                    <path d="M2.5 7.5L5.5 10.5L11.5 3.5" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-muted-light">{step1Title}</span>
                  {niches.find(n => n.selected) && (
                    <span className="text-sm text-muted ml-2">— {niches.find(n => n.selected)?.title}</span>
                  )}
                </div>
              </div>
            }
          >
            <div className="flex items-start justify-between gap-3 mb-6">
              <h2 className="text-lg font-bold tracking-tight">{step1Title}</h2>

              {isDirectMode && effectiveStep === 0 && niches.length === 0 ? (
                <div className="flex items-center gap-2">
                  {!showDirectRefineChoice && (
                    <PrimaryButton
                      onClick={() => {
                        if (channel.exploreTopic) {
                          setDirectTopicInput(channel.exploreTopic)
                          setShowDirectRefineChoice(true)
                        }
                      }}
                      disabled={false}
                    >
                      Continue
                    </PrimaryButton>
                  )}
                </div>
              ) : niches.length === 0 && actionLoading === 'generate-niches' ? (
                /* Auto-generating — show spinner only, no button */
                <span className="flex items-center gap-2 text-sm text-accent font-medium">
                  <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                  Discovering...
                </span>
              ) : niches.length > 0 && effectiveStep > 0 ? (
                <GhostButton
                  onClick={handleGenerateNiches}
                  disabled={actionLoading !== null}
                >
                  Regenerate
                </GhostButton>
              ) : (
                <PrimaryButton
                  onClick={handleGenerateNiches}
                  disabled={actionLoading !== null}
                  loading={actionLoading === 'generate-niches'}
                  loadingText="Generating..."
                >
                  {niches.length > 0 ? 'Regenerate' : isExploreMode ? 'Explore angles' : 'Generate niches'}
                </PrimaryButton>
              )}
            </div>

            {/* Direct mode: refine choice */}
            {isDirectMode && showDirectRefineChoice && niches.length === 0 && (
              <div className="mb-6 space-y-4">
                <p className="text-sm text-muted-light">
                  Your topic: <span className="text-foreground font-semibold">{directTopicInput || channel.exploreTopic}</span>
                </p>
                <div className="flex flex-col gap-3">
                  <PrimaryButton
                    onClick={() => handleDirectTopic(false)}
                    disabled={actionLoading !== null}
                    loading={actionLoading === 'direct-topic'}
                    loadingText="Setting up channel..."
                    className="w-full justify-center py-3"
                  >
                    Use topic as-is
                  </PrimaryButton>
                  <GhostButton
                    onClick={() => handleDirectTopic(true)}
                    disabled={actionLoading !== null}
                    className="w-full justify-center py-3"
                  >
                    {actionLoading === 'direct-topic' ? '...' : 'Show me sharper angles'}
                  </GhostButton>
                </div>
              </div>
            )}

            {/* Niche cards */}
            {niches.length > 0 && (
              <div>
                {/* Single niche (Direct mode) — inline banner */}
                {niches.length === 1 ? (
                  <div className={`animate-fade-up border rounded-2xl p-5 ${niches[0].selected ? 'border-accent/30 bg-accent-dim/50' : 'border-border bg-background'}`}>
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold mb-1">{niches[0].title}</h3>
                        <p className="text-sm text-muted-light leading-relaxed max-w-prose">{niches[0].description}</p>
                      </div>
                      {niches[0].selected && (
                        <span className="text-xs font-semibold text-accent bg-accent/10 px-2.5 py-1 rounded-lg shrink-0">Selected</span>
                      )}
                    </div>
                    {niches[0].rationale && (
                      <p className="text-xs text-muted leading-relaxed mt-3">{niches[0].rationale}</p>
                    )}
                  </div>
                ) : (
                  /* Multiple niches — horizontal scroll */
                  <div className="relative group/scroll">
                  {canScrollLeft && (
                    <button
                      onClick={() => nicheScrollRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
                      className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-surface-elevated border border-border shadow-lg flex items-center justify-center text-muted hover:text-foreground hover:border-border-hover transition-all opacity-0 group-hover/scroll:opacity-100"
                      aria-label="Scroll left"
                    >
                      ‹
                    </button>
                  )}
                  {canScrollRight && (
                    <button
                      onClick={() => nicheScrollRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
                      className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-surface-elevated border border-border shadow-lg flex items-center justify-center text-muted hover:text-foreground hover:border-border-hover transition-all opacity-0 group-hover/scroll:opacity-100"
                      aria-label="Scroll right"
                    >
                      ›
                    </button>
                  )}
                  <div ref={nicheScrollRef} className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x -mx-2 px-2">
                    {niches.map((niche, i) => (
                      <button
                        key={niche.id}
                        onClick={() => !niche.selected && handleSelectNiche(niche.id)}
                        disabled={actionLoading !== null || niche.selected}
                        className={`
                          animate-fade-up snap-start shrink-0 w-[300px] lg:w-[320px] text-left border rounded-2xl p-5 transition-all duration-200 flex flex-col disabled:opacity-100
                          ${niche.selected
                            ? 'border-accent/40 bg-accent-dim shadow-[0_0_30px_var(--accent-glow)]'
                            : 'border-border bg-background hover:border-accent/40 hover:bg-accent-dim/30 hover:shadow-[0_0_20px_var(--accent-glow)]'
                          }
                        `}
                        style={{ animationDelay: `${i * 60}ms` }}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <h3 className="text-base font-semibold leading-tight">{niche.title}</h3>
                          {niche.selected && (
                            <span className="text-xs font-semibold text-accent bg-accent/10 px-2.5 py-1 rounded-lg shrink-0">Selected</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-light leading-relaxed mb-4 flex-1">{niche.description}</p>
                        <p className="text-xs text-muted leading-relaxed">{niche.rationale}</p>
                      </button>
                    ))}
                  </div>
                  </div>
                )}

                {/* Regenerate intents */}
                {effectiveStep === 0 && niches.length > 1 && (
                  <div className="flex flex-wrap items-center gap-2 pt-3">
                    <span className="text-xs font-medium text-muted mr-1">More:</span>
                    {REGENERATE_INTENTS.map((intent) => (
                      <GhostButton
                        key={intent.value}
                        onClick={() => handleRegenerateMore(intent.value)}
                        disabled={actionLoading !== null}
                      >
                        {actionLoading === 'regenerate-niches' ? '...' : intent.label}
                      </GhostButton>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* ═══════════════════════════════════════════════════════
              Step 2: Define Content Strategy
              ═══════════════════════════════════════════════════════ */}
          {effectiveStep < 1 ? (
            <LockedStep label="Content strategy" delay={120} />
          ) : hasStrategy && strategyOptions.length === 0 ? (
            /* Strategy approved — compact display */
            <Section
              compact
              delay={120}
              completed={effectiveStep > 1}
              collapsible={effectiveStep > 1}
              defaultCollapsed={effectiveStep > 1}
              collapsedSummary={
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                      <path d="M2.5 7.5L5.5 10.5L11.5 3.5" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-muted-light">Content Strategy</span>
                    {channel.contentStrategy && (
                      <span className="text-sm text-muted ml-2">— {channel.contentStrategy.contentIntent}</span>
                    )}
                  </div>
                </div>
              }
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-muted-light">Content Strategy</h2>
                <GhostButton onClick={handleGenerateStrategy} disabled={actionLoading !== null}>
                  Redefine
                </GhostButton>
              </div>
              {channel.contentStrategy && (
                <div className="space-y-2">
                  <p className="text-sm text-foreground font-medium">{channel.contentStrategy.contentIntent}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-accent bg-accent-dim px-2.5 py-1 rounded-lg">{channel.contentStrategy.tone}</span>
                    <span className="text-xs font-medium text-muted-light bg-surface-elevated px-2.5 py-1 rounded-lg border border-border">{channel.contentStrategy.audience}</span>
                  </div>
                </div>
              )}
            </Section>
          ) : (
            <Section delay={120} active={effectiveStep === 1}>
              <div className="flex flex-col gap-3 mb-5">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">Content strategy</h2>
                  {strategyOptions.length > 0 && (
                    <p className="text-sm text-muted-light mt-1">Pick the direction that fits your channel best.</p>
                  )}
                </div>
                {strategyOptions.length > 0 ? (
                  <GhostButton onClick={handleGenerateStrategy} disabled={actionLoading !== null} className="self-start">
                    Regenerate
                  </GhostButton>
                ) : (
                  <PrimaryButton
                    onClick={handleGenerateStrategy}
                    disabled={actionLoading !== null || effectiveStep < 1}
                    loading={actionLoading === 'generate-strategy'}
                    loadingText="Generating..."
                    className="self-start"
                  >
                    Generate options
                  </PrimaryButton>
                )}
              </div>

              {/* Strategy option cards */}
              {strategyOptions.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {strategyOptions.map((strategy, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelectStrategy(strategy)}
                      disabled={actionLoading === 'approve-strategy'}
                      className="animate-fade-up text-left border border-border bg-background rounded-2xl p-6 transition-all duration-200 hover:border-accent/40 hover:bg-accent-dim/30 hover:shadow-[0_0_20px_var(--accent-glow)] disabled:opacity-40 flex flex-col gap-4"
                      style={{ animationDelay: `${i * 80}ms` }}
                    >
                      <p className="text-base font-semibold text-foreground leading-snug">{strategy.contentIntent}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-xs font-medium text-muted-light bg-surface-elevated border border-border px-2 py-0.5 rounded-lg">{strategy.tone}</span>
                      </div>
                      <p className="text-sm text-muted-light leading-relaxed flex-1">The target audience are {strategy.audience.replace(/^The target audience are\s*/i, '')}</p>
                      {(strategy.engagementPotential || strategy.contentDifficulty || strategy.audienceSize) && (
                        <div className="flex flex-wrap gap-1.5">
                          {strategy.engagementPotential && strategy.engagementPotential >= 7 && (
                            <span className="text-xs font-medium text-success bg-success-dim px-2 py-0.5 rounded-lg">High engagement</span>
                          )}
                          {strategy.contentDifficulty && strategy.contentDifficulty <= 4 && (
                            <span className="text-xs font-medium text-success bg-success-dim px-2 py-0.5 rounded-lg">Low effort</span>
                          )}
                          {strategy.contentDifficulty && strategy.contentDifficulty >= 7 && (
                            <span className="text-xs font-medium text-[#f0a030] bg-[rgba(240,160,48,0.1)] px-2 py-0.5 rounded-lg">High effort</span>
                          )}
                          {strategy.audienceSize && strategy.audienceSize >= 7 && (
                            <span className="text-xs font-medium text-[#60a5fa] bg-[rgba(96,165,250,0.1)] px-2 py-0.5 rounded-lg">Wide audience</span>
                          )}
                          {strategy.audienceSize && strategy.audienceSize <= 3 && (
                            <span className="text-xs font-medium text-muted-light bg-surface-elevated px-2 py-0.5 rounded-lg">Niche audience</span>
                          )}
                        </div>
                      )}
                      <div className="hidden md:flex flex-wrap gap-1.5 pt-1 border-t border-border/50">
                        {strategy.hookTypes.slice(0, 3).map((ht, j) => (
                          <span key={j} className="text-xs font-medium text-muted bg-surface-elevated px-2.5 py-1 rounded">{ht}</span>
                        ))}
                        {strategy.hookTypes.length > 3 && (
                          <span className="text-xs text-muted">+{strategy.hookTypes.length - 3}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Loading state */}
              {actionLoading === 'generate-strategy' && strategyOptions.length === 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="rounded-2xl border border-border bg-background p-5 space-y-3 animate-pulse" style={{ animationDelay: `${i * 100}ms` }}>
                      <div className="h-4 bg-surface-elevated rounded w-4/5" />
                      <div className="h-3 bg-surface-elevated rounded w-2/5" />
                      <div className="h-3 bg-surface-elevated rounded w-3/5" />
                      <div className="h-6 bg-surface-elevated rounded w-1/3" />
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* ═══════════════════════════════════════════════════════
              Step 3: Generate Posts — Batches of 3
              ═══════════════════════════════════════════════════════ */}
          {effectiveStep < 2 ? (
            <LockedStep label="Generate posts" delay={180} />
          ) : (
          <Section compact={!isStreamingPosts && completedPosts.length === 0 && !hasPosts} delay={180} active={effectiveStep === 2}>
            <div className="flex flex-col gap-3">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Generate posts</h2>
                {hasPosts && !isStreamingPosts && (
                  <p className="text-sm text-muted-light mt-1">{channel.posts.length} post{channel.posts.length !== 1 ? 's' : ''} generated</p>
                )}
                {!isStreamingPosts && !hasPosts && completedPosts.length === 0 && (
                  <p className="text-sm text-muted-light mt-1 max-w-prose">Each post is a full carousel — hooks, copy, quality gates, rendered images, and captions.</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isStreamingPosts && (
                  <button
                    onClick={handleStopPostGeneration}
                    className="px-4 py-2.5 bg-danger-dim hover:bg-danger/20 text-danger border border-danger/20 rounded-xl text-sm font-semibold transition-all"
                  >
                    Stop
                  </button>
                )}
                <PrimaryButton
                  onClick={handleGenerateBatch}
                  disabled={actionLoading !== null || isStreamingPosts || !hasStrategy}
                  loading={isStreamingPosts}
                  loadingText="Generating..."
                >
                  {hasPosts ? 'Generate next post' : 'Generate first post'}
                </PrimaryButton>
              </div>
            </div>

            {/* Existing posts from DB (always visible — excludes posts currently in completedPosts to avoid duplicates) */}
            {hasPosts && (() => {
              const completedIds = new Set(completedPosts.map(cp => cp.id));
              const dbPosts = [...channel.posts]
                .filter(p => !completedIds.has(p.id))
                .sort((a, b) => a.dayIndex - b.dayIndex);
              return dbPosts.length > 0 ? (
                <div className="mt-6 space-y-3">
                  {dbPosts.map((p) => {
                    const isExpanded = expandedPosts.has(p.id)
                    const slides = dbPostSlides[p.id]
                    const isLoadingSlides = dbPostSlidesLoading.has(p.id)
                    const currentSlideIdx = slideViewerIndex[p.id] ?? 0
                    const currentSlide = slides?.[currentSlideIdx]

                    return (
                      <div key={p.id} className={`bg-background border border-border rounded-2xl overflow-hidden transition-all ${isExpanded ? 'border-border-hover' : 'hover:border-border-hover hover:bg-surface-elevated/50'}`}>
                        <button
                          onClick={() => togglePostExpanded(p.id, p.carouselJobId)}
                          className="w-full text-left flex items-center gap-4 p-4 transition-all group"
                        >
                          <div className="w-10 h-10 rounded-xl bg-accent-dim flex items-center justify-center shrink-0">
                            <span className="text-sm font-bold text-accent">#{p.dayIndex}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-base font-semibold text-foreground truncate">{p.title}</p>
                            <p className="text-sm text-muted truncate">{p.hook}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {p.carouselJobId && (
                              <span className="text-xs font-medium text-success bg-success-dim px-2.5 py-1 rounded-lg">Carousel</span>
                            )}
                            <Link
                              href={p.carouselJobId ? `/carousel/${p.carouselJobId}` : `/channels/${channelId}/posts/${p.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-accent hover:text-accent-hover font-semibold transition-colors"
                            >
                              View carousel
                            </Link>
                            <svg
                              width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                              className={`text-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                            >
                              <path d="M4 6l4 4 4-4" />
                            </svg>
                          </div>
                        </button>

                        {/* Expanded inline slide viewer — inside the card */}
                        {isExpanded && (() => {
                          const isPreview = previewMode.has(p.id)
                          const captionData = dbPostCaptions[p.id]
                          const slideImages = slides?.filter(s => s.imageUrl).map(s => s.imageUrl!) ?? []
                          const fallbackCaption = `${p.hook}\n\n${p.title}`
                          const captionText = captionData?.caption || fallbackCaption
                          const hashtagText = captionData?.hashtags?.length
                            ? captionData.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')
                            : `#${(channel.niche || 'history').replace(/\s+/g, '').toLowerCase()} #facts #didyouknow #education`

                          return (
                            <div className="px-4 pb-4 animate-fade-up">
                              <div className="border-t border-border pt-4">
                                {isLoadingSlides ? (
                                  <div className="flex items-center gap-3 p-6 bg-surface-elevated rounded-xl">
                                    <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                                    <span className="text-sm text-muted">Loading slides...</span>
                                  </div>
                                ) : slides && slides.length > 0 ? (
                                  <div>
                                    {/* View mode toggle */}
                                    <div className="flex items-center gap-2 mb-4">
                                      <button
                                        onClick={() => setPreviewMode(prev => { const n = new Set(prev); n.delete(p.id); return n })}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${!isPreview ? 'bg-accent text-background' : 'bg-surface-elevated text-muted hover:text-foreground border border-border'}`}
                                      >
                                        Slides
                                      </button>
                                      <button
                                        onClick={() => setPreviewMode(prev => new Set(prev).add(p.id))}
                                        disabled={slideImages.length === 0}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${isPreview ? 'bg-accent text-background' : 'bg-surface-elevated text-muted hover:text-foreground border border-border'} disabled:opacity-30 disabled:cursor-not-allowed`}
                                      >
                                        Instagram Preview
                                      </button>
                                    </div>

                                    {isPreview ? (
                                      /* Instagram mockup — centered */
                                      <div className="flex justify-center pb-6">
                                        <div style={{ maxWidth: 862, width: '100%' }}>
                                          <InstagramPreview
                                            username={channel.name !== 'Untitled Channel' ? channel.name : (channel.niche || 'hidden.history').replace(/\s+/g, '.').toLowerCase()}
                                            slides={slideImages}
                                            caption={captionText}
                                            hashtags={hashtagText}
                                            likesCount="1,234"
                                            timestamp="Just now"
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      /* Slide-by-slide viewer */
                                      <div className="bg-surface-elevated rounded-xl overflow-hidden">
                                        <div className="px-4 pt-3 pb-2">
                                          <div className="flex items-center justify-between">
                                            <span className={`text-xs font-bold tracking-wider uppercase ${
                                              currentSlide?.role === 'OPENER' ? 'text-accent' :
                                              currentSlide?.role === 'CTA' ? 'text-violet' :
                                              'text-muted'
                                            }`}>
                                              {currentSlide?.role} — Slide {currentSlideIdx + 1} of {slides.length}
                                            </span>
                                            {/* Regeneration buttons */}
                                            {p.carouselJobId && (() => {
                                              const regenKey = `${p.id}-${currentSlideIdx}`
                                              const activeMode = regenLoading[regenKey]
                                              return (
                                                <div className="flex items-center gap-1.5">
                                                  {(['copy', 'image', 'full'] as const).map(mode => (
                                                    <button
                                                      key={mode}
                                                      onClick={() => handleRegenerateSlide(p.id, p.carouselJobId!, currentSlideIdx, mode)}
                                                      disabled={!!activeMode}
                                                      className="px-2 py-1 text-[11px] font-medium rounded-md border border-border bg-background hover:bg-surface-elevated hover:border-border-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all text-muted hover:text-foreground"
                                                    >
                                                      {activeMode === mode ? (
                                                        <span className="flex items-center gap-1">
                                                          <span className="w-3 h-3 border border-accent/30 border-t-accent rounded-full animate-spin" />
                                                          {mode === 'copy' ? 'Rewriting...' : mode === 'image' ? 'Rendering...' : 'Regenerating...'}
                                                        </span>
                                                      ) : (
                                                        mode === 'copy' ? 'Regen text' : mode === 'image' ? 'Regen image' : 'Regen slide'
                                                      )}
                                                    </button>
                                                  ))}
                                                </div>
                                              )
                                            })()}
                                          </div>
                                        </div>
                                        <div className="flex items-center justify-center gap-2.5 px-2">
                                          <button
                                            onClick={() => setSlideViewerIndex(prev => ({ ...prev, [p.id]: Math.max(0, currentSlideIdx - 1) }))}
                                            disabled={currentSlideIdx === 0}
                                            className="shrink-0 p-2 rounded-full bg-background/80 border border-border hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                          >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                                          </button>
                                          <div className="min-w-0">
                                            {currentSlide?.imageUrl && (
                                              <div className="relative w-full" style={{ maxHeight: 460 }}>
                                                <img
                                                  src={currentSlide.imageUrl}
                                                  alt={currentSlide.displayTitle || currentSlide.headline || `Slide ${currentSlideIdx + 1}`}
                                                  className="w-full h-auto max-h-[420px] object-contain mx-auto rounded-lg"
                                                />
                                              </div>
                                            )}
                                            {!currentSlide?.imageUrl && currentSlide?.headline && (
                                              <p className="px-4 text-sm font-semibold text-foreground">{currentSlide.headline}</p>
                                            )}
                                            {!currentSlide?.imageUrl && currentSlide?.body && (
                                              <p className="px-4 text-sm text-muted-light leading-relaxed">{currentSlide.body}</p>
                                            )}
                                          </div>
                                          <button
                                            onClick={() => setSlideViewerIndex(prev => ({ ...prev, [p.id]: Math.min(slides.length - 1, currentSlideIdx + 1) }))}
                                            disabled={currentSlideIdx === slides.length - 1}
                                            className="shrink-0 p-2 rounded-full bg-background/80 border border-border hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                          >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                                          </button>
                                        </div>
                                        <div className="flex items-center justify-center gap-1.5 pt-[15px] pb-[24px]">
                                          {slides.map((_, i) => (
                                            <button
                                              key={i}
                                              onClick={() => setSlideViewerIndex(prev => ({ ...prev, [p.id]: i }))}
                                              className={`w-2 h-2 rounded-full transition-all ${i === currentSlideIdx ? 'bg-accent scale-125' : 'bg-border hover:bg-muted'}`}
                                            />
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : !p.carouselJobId ? (
                                  <div className="p-4 bg-surface-elevated rounded-xl text-sm text-muted">
                                    No carousel generated for this post yet.
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })}
                </div>
              ) : null;
            })()}

            {/* Streaming / just-completed posts */}
            {(isStreamingPosts || completedPosts.length > 0 || postStreamErrors.length > 0) && (
              <div className="mt-6 space-y-3">
                {completedPosts.map((p, i) => {
                  const isExpanded = expandedPosts.has(p.id)
                  const currentSlideIdx = slideViewerIndex[p.id] ?? 0
                  // If carousel job exists, try to use fetched slides with images
                  const carouselSlides = dbPostSlides[p.id]
                  const effectiveSlides = p.slides.length > 0 ? p.slides : carouselSlides ?? []
                  const currentSlide = effectiveSlides[currentSlideIdx]
                  const displaySlide = carouselSlides?.[currentSlideIdx]

                  return (
                    <div key={i} className={`animate-fade-up bg-background border border-border rounded-2xl overflow-hidden transition-all ${isExpanded ? 'border-border-hover' : 'hover:border-border-hover hover:bg-surface-elevated/50'}`}>
                      <button
                        onClick={() => togglePostExpanded(p.id, p.carouselJobId)}
                        className="w-full text-left flex items-center gap-4 p-4 transition-all group"
                      >
                        <div className="w-10 h-10 rounded-xl bg-accent-dim flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-accent">#{p.dayIndex}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-semibold text-foreground truncate">{p.title}</p>
                          <p className="text-sm text-muted truncate">{p.hook}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="hidden sm:inline text-xs font-medium text-muted bg-surface-elevated px-2.5 py-1 rounded-lg">
                            {p.slideCount} slides
                          </span>
                          {p.hasImages && (
                            <span className="hidden sm:inline text-xs font-medium text-success bg-success-dim px-2.5 py-1 rounded-lg">
                              Images ready
                            </span>
                          )}
                          {p.carouselJobId ? (
                            <Link
                              href={`/carousel/${p.carouselJobId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-accent hover:text-accent-hover font-semibold transition-colors whitespace-nowrap"
                            >
                              View carousel
                            </Link>
                          ) : (
                            <Link
                              href={`/channels/${channelId}/posts/${p.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-accent hover:text-accent-hover font-semibold transition-colors"
                            >
                              Edit
                            </Link>
                          )}
                          <svg
                            width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                            className={`text-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          >
                            <path d="M4 6l4 4 4-4" />
                          </svg>
                        </div>
                      </button>

                      {/* Expanded inline slide viewer — inside the card */}
                      {isExpanded && (p.slides.length > 0 || p.carouselJobId) && (() => {
                        const isPreview = previewMode.has(p.id)
                        const captionData = dbPostCaptions[p.id]
                        const slideImages = carouselSlides?.filter(s => s.imageUrl).map(s => s.imageUrl!) ?? []
                        const fallbackCaption = `${p.hook}\n\n${p.title}`
                        const captionText = captionData?.caption || fallbackCaption
                        const hashtagText = captionData?.hashtags?.length
                          ? captionData.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')
                          : `#${(channel.niche || 'history').replace(/\s+/g, '').toLowerCase()} #facts #didyouknow #education`

                        return (
                          <div className="px-4 pb-4 animate-fade-up">
                            <div className="border-t border-border pt-4">
                              {/* View mode toggle */}
                              <div className="flex items-center gap-2 mb-4">
                                <button
                                  onClick={() => setPreviewMode(prev => { const n = new Set(prev); n.delete(p.id); return n })}
                                  className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${!isPreview ? 'bg-accent text-background' : 'bg-surface-elevated text-muted hover:text-foreground border border-border'}`}
                                >
                                  Slides
                                </button>
                                <button
                                  onClick={() => {
                                    setPreviewMode(prev => new Set(prev).add(p.id))
                                    if (p.carouselJobId && !carouselSlides) {
                                      fetchCarouselSlides(p.id, p.carouselJobId)
                                    }
                                  }}
                                  disabled={!p.carouselJobId}
                                  className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${isPreview ? 'bg-accent text-background' : 'bg-surface-elevated text-muted hover:text-foreground border border-border'} disabled:opacity-30 disabled:cursor-not-allowed`}
                                >
                                  Instagram Preview
                                </button>
                              </div>

                              {effectiveSlides.length === 0 ? (
                                <div className="flex items-center gap-3 p-6 bg-surface-elevated rounded-xl">
                                  <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                                  <span className="text-sm text-muted">Loading slides...</span>
                                </div>
                              ) : isPreview && slideImages.length > 0 ? (
                                <div className="flex justify-center pb-6">
                                  <div style={{ maxWidth: 862, width: '100%' }}>
                                    <InstagramPreview
                                      username={channel.name !== 'Untitled Channel' ? channel.name : (channel.niche || 'hidden.history').replace(/\s+/g, '.').toLowerCase()}
                                      slides={slideImages}
                                      caption={captionText}
                                      hashtags={hashtagText}
                                      likesCount="1,234"
                                      timestamp="Just now"
                                    />
                                  </div>
                                </div>
                              ) : isPreview && dbPostSlidesLoading.has(p.id) ? (
                                <div className="flex items-center gap-3 p-6 bg-surface-elevated rounded-xl">
                                  <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                                  <span className="text-sm text-muted">Loading preview...</span>
                                </div>
                              ) : (
                                <div className="bg-surface-elevated rounded-xl overflow-hidden">
                                  <div className="px-4 pt-3 pb-2">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                      <span className={`text-xs font-bold tracking-wider uppercase ${
                                        currentSlide?.role === 'OPENER' ? 'text-accent' :
                                        currentSlide?.role === 'CTA' ? 'text-violet' :
                                        'text-muted'
                                      }`}>
                                        {currentSlide?.role} — Slide {currentSlideIdx + 1} of {effectiveSlides.length || p.slideCount}
                                      </span>
                                      {/* Regeneration buttons */}
                                      {p.carouselJobId && (() => {
                                        const regenKey = `${p.id}-${currentSlideIdx}`
                                        const activeMode = regenLoading[regenKey]
                                        return (
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            {(['copy', 'image', 'full'] as const).map(mode => (
                                              <button
                                                key={mode}
                                                onClick={() => handleRegenerateSlide(p.id, p.carouselJobId!, currentSlideIdx, mode)}
                                                disabled={!!activeMode}
                                                className="px-2 py-1 text-[11px] font-medium rounded-md border border-border bg-background hover:bg-surface-elevated hover:border-border-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all text-muted hover:text-foreground"
                                              >
                                                {activeMode === mode ? (
                                                  <span className="flex items-center gap-1">
                                                    <span className="w-3 h-3 border border-accent/30 border-t-accent rounded-full animate-spin" />
                                                    {mode === 'copy' ? 'Rewriting...' : mode === 'image' ? 'Rendering...' : 'Regenerating...'}
                                                  </span>
                                                ) : (
                                                  mode === 'copy' ? 'Regen text' : mode === 'image' ? 'Regen image' : 'Regen slide'
                                                )}
                                              </button>
                                            ))}
                                          </div>
                                        )
                                      })()}
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-center gap-2.5 px-2">
                                    <button
                                      onClick={() => setSlideViewerIndex(prev => ({ ...prev, [p.id]: Math.max(0, currentSlideIdx - 1) }))}
                                      disabled={currentSlideIdx === 0}
                                      className="shrink-0 p-2 rounded-full bg-background/80 border border-border hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                    >
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                                    </button>
                                    <div className="min-w-0">
                                      {displaySlide?.imageUrl && (
                                        <div className="relative w-full" style={{ maxHeight: 460 }}>
                                          <img
                                            src={displaySlide.imageUrl}
                                            alt={currentSlide?.headline || `Slide ${currentSlideIdx + 1}`}
                                            className="w-full h-auto max-h-[420px] object-contain mx-auto rounded-lg"
                                          />
                                        </div>
                                      )}
                                      {!displaySlide?.imageUrl && currentSlide?.headline && (
                                        <p className="px-4 text-sm font-semibold text-foreground">{currentSlide.headline}</p>
                                      )}
                                      {!displaySlide?.imageUrl && currentSlide?.body && (
                                        <p className="px-4 text-sm text-muted-light leading-relaxed">{currentSlide.body}</p>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => setSlideViewerIndex(prev => ({ ...prev, [p.id]: Math.min((effectiveSlides.length || p.slideCount) - 1, currentSlideIdx + 1) }))}
                                      disabled={currentSlideIdx >= (effectiveSlides.length || p.slideCount) - 1}
                                      className="shrink-0 p-2 rounded-full bg-background/80 border border-border hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                    >
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                                    </button>
                                  </div>
                                  <div className="flex items-center justify-center gap-1.5 pt-[15px] pb-[24px]">
                                    {effectiveSlides.map((_, si) => (
                                      <button
                                        key={si}
                                        onClick={() => setSlideViewerIndex(prev => ({ ...prev, [p.id]: si }))}
                                        className={`w-2 h-2 rounded-full transition-all ${si === currentSlideIdx ? 'bg-accent scale-125' : 'bg-border hover:bg-muted'}`}
                                      />
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}

                {/* Stream errors */}
                {postStreamErrors.map((e, i) => (
                  <div key={`err-${i}`} className="flex items-center gap-3 bg-danger-dim border border-danger/15 rounded-xl px-5 py-3">
                    <span className="text-danger text-xs font-bold shrink-0">FAIL</span>
                    <span className="text-sm text-muted truncate flex-1">{e.hook}</span>
                    <span className="text-xs text-danger font-medium shrink-0 max-w-[200px] truncate">{e.error}</span>
                  </div>
                ))}

                {/* Currently generating — progress card */}
                {isStreamingPosts && (
                  <div className="bg-accent-dim/60 border border-accent/15 rounded-2xl p-5 animate-fade-up">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                        <span className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <p className="text-sm font-semibold text-foreground/80 truncate">
                          {postStreamProgress?.hook || 'Preparing...'}
                        </p>
                        {carouselProgress ? (
                          <p className="text-xs text-accent font-medium">{carouselProgress.message}</p>
                        ) : (
                          <p className="text-xs text-muted-light">Generating hook and starting pipeline...</p>
                        )}
                      </div>
                    </div>
                    {/* Pipeline stage indicators */}
                    {(() => {
                      const STAGES = ['Hook', 'Facts', 'Copy', 'Quality', 'Render', 'Done']
                      const progressMsg = carouselProgress?.message?.toLowerCase() || ''
                      const stageMap: Record<number, string[]> = {
                        0: ['hook', 'generating hook'],
                        1: ['knowledge', 'mining', 'pipeline'],
                        2: ['compos', 'quality', 'narrative', 'promise'],
                        3: ['enforcement', 'checking'],
                        4: ['render'],
                        5: ['complete', 'finaliz', 'ready'],
                      }
                      const activeIndex = STAGES.findIndex((_, i) => stageMap[i]?.some(k => progressMsg.includes(k)))
                      const currentIndex = activeIndex >= 0 ? activeIndex : 0
                      return (
                        <div className="mt-4 space-y-2">
                          {/* Segmented progress bar */}
                          <div className="flex gap-1">
                            {STAGES.map((_, i) => (
                              <div
                                key={i}
                                className={`flex-1 h-1 rounded-full transition-all duration-500 ${
                                  i < currentIndex
                                    ? 'bg-accent'
                                    : i === currentIndex
                                    ? 'bg-accent animate-pulse'
                                    : 'bg-border'
                                }`}
                              />
                            ))}
                          </div>
                          {/* Single active stage label */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-accent">
                              {STAGES[currentIndex]}
                            </span>
                            <span className="text-xs text-muted">
                              {currentIndex + 1} / {STAGES.length}
                            </span>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}

                {/* After completion — generate more button */}
                {!isStreamingPosts && completedPosts.length > 0 && (
                  <div className="pt-3 flex items-center gap-3">
                    <PrimaryButton
                      onClick={handleGenerateBatch}
                      disabled={actionLoading !== null || isStreamingPosts}
                    >
                      Generate next post
                    </PrimaryButton>
                    <span className="text-sm text-muted">{(() => { const ids = new Set(completedPosts.map(cp => cp.id)); return channel.posts.filter(p => !ids.has(p.id)).length + completedPosts.length; })()} total posts</span>
                  </div>
                )}
              </div>
            )}
          </Section>
          )}

          {/* ═══════════════════════════════════════════════════════
              Optional: Name Channel (shown when toggled from sidebar)
              ═══════════════════════════════════════════════════════ */}
          {showNaming && (
            <Section delay={300}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold tracking-tight">Name your channel</h2>
                <div className="flex items-center gap-2">
                  <PrimaryButton
                    onClick={() => handleGenerateNames()}
                    disabled={actionLoading !== null}
                    loading={actionLoading === 'generate-names'}
                    loadingText="Generating..."
                  >
                    {nameSuggestions.length > 0 ? 'Regenerate' : 'Generate names'}
                  </PrimaryButton>
                  <GhostButton onClick={() => setShowNaming(false)} disabled={false}>
                    Close
                  </GhostButton>
                </div>
              </div>

              {/* Style pills */}
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <span className="text-xs font-medium text-muted mr-1">Style:</span>
                {(['descriptive', 'bold', 'minimal', 'personal'] as NameStyle[]).map((style) => (
                  <GhostButton
                    key={style}
                    onClick={() => handleGenerateNames(style)}
                    disabled={actionLoading !== null}
                    active={selectedNameStyle === style}
                  >
                    {style}
                  </GhostButton>
                ))}
              </div>

              {/* Name suggestions */}
              {nameSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-3 mb-5">
                  {nameSuggestions.map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => handleSetName(suggestion.name)}
                      disabled={actionLoading === 'set-name'}
                      className="group text-left border border-border bg-background rounded-2xl p-5 transition-all duration-200 hover:border-accent/30 hover:bg-accent-dim/50 hover:shadow-[0_0_20px_var(--accent-glow)] disabled:opacity-40 animate-fade-up max-w-xs"
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <p className="text-lg font-bold text-foreground group-hover:text-accent transition-colors">{suggestion.name}</p>
                        <span className="text-xs font-medium text-muted bg-surface-elevated px-2 py-0.5 rounded-lg">
                          {suggestion.style}
                        </span>
                      </div>
                      <p className="text-sm text-muted leading-relaxed">{suggestion.rationale}</p>
                    </button>
                  ))}
                </div>
              )}

              {/* Custom name input */}
              <div className="flex gap-3 max-w-xl">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Or type your own name..."
                  className="flex-1 px-5 py-3 bg-background border border-border rounded-xl text-foreground placeholder-muted text-base hover:border-border-hover"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customName.trim()) {
                      handleSetName(customName.trim())
                    }
                  }}
                />
                <GhostButton
                  onClick={() => customName.trim() && handleSetName(customName.trim())}
                  disabled={!customName.trim() || actionLoading === 'set-name'}
                >
                  {actionLoading === 'set-name' ? '...' : 'Use this name'}
                </GhostButton>
              </div>
            </Section>
          )}

          {/* Mobile bottom links */}
          {hasPosts && (
            <div className="lg:hidden flex gap-3 pt-4">
              <Link
                href={`/channels/${channelId}/posts`}
                className="flex-1 text-center px-5 py-3 bg-surface hover:bg-surface-hover border border-border rounded-xl text-sm font-semibold transition-all"
              >
                View all posts
              </Link>
              <button
                onClick={() => setShowNaming(!showNaming)}
                className="flex-1 text-center px-5 py-3 bg-surface hover:bg-surface-hover border border-border rounded-xl text-sm font-semibold transition-all"
              >
                {channel.name !== 'Untitled Channel' ? 'Rename' : 'Name channel'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

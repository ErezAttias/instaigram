'use client'

const IG_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'
const IG_GLOW = '0 0 20px rgba(220,39,67,0.35)'

import { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import InstagramPreview from '@/components/InstagramPreview'
import '@/components/instagram-preview.css'
import { useChannelContext } from '@/components/ChannelProvider'
import { TITLE_FONTS, BODY_FONTS, getTitleFont } from '@/lib/visual/font-pairings-data'
import type { ChannelVisualStyleContext } from '@/lib/visual/visual-style'
import { DEFAULT_VISUAL_STYLE } from '@/lib/visual/visual-style'
import { SlidePreview } from '@/components/admin/visual/SlidePreview'

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
  carouselJobStatus: string | null
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

interface ContentPillarsData {
  channelTone: string
  channelAudience: string
  pillars: ContentStrategy[]
}

interface Channel {
  id: string
  name: string
  niche: string | null
  nicheMode: 'DISCOVER' | 'EXPLORE' | 'DIRECT'
  exploreTopic: string | null
  contentStrategy: ContentStrategy | ContentPillarsData | null
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
  NICHE_SELECTED: { label: 'Niche selected', color: 'text-[#6b9fcc]', bg: 'bg-[#3d6fa8]/10' },
  STRATEGY_DEFINED: { label: 'Strategy defined', color: 'text-violet', bg: 'bg-violet-dim' },
  NAMED: { label: 'Named', color: 'text-violet', bg: 'bg-violet-dim' },
  HOOKS_GENERATED: { label: 'Hooks ready', color: 'text-[#60a5fa]', bg: 'bg-[rgba(96,165,250,0.1)]' },
  CONTENT_GENERATED: { label: 'Content ready', color: 'text-[#6b9fcc]', bg: 'bg-[#3d6fa8]/10' },
  COMPLETE: { label: 'Complete', color: 'text-[#6b9fcc]', bg: 'bg-[#3d6fa8]/10' },
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
      className={`min-h-11 py-2.5 px-6 text-white rounded-full text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b9fcc]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background${className ? ` ${className}` : ''}`}
      style={{ background: IG_GRADIENT, boxShadow: IG_GLOW }}
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
      className={`h-11 px-6 border rounded-full text-sm font-semibold transition-all duration-200 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b9fcc]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        active
          ? 'border-[#3d6fa8]/30 bg-[#3d6fa8]/10 text-foreground'
          : 'border-border hover:border-[#3d6fa8]/25 hover:bg-[#3d6fa8]/8'
      }${className ? ` ${className}` : ''}`}
    >
      {children}
    </button>
  )
}

// ─── Accordion Section — flat divider, no card wrapper ───────

function Section({
  children,
  delay,
  compact,
  collapsible,
  defaultCollapsed,
  collapsedTitle,
  variant = 'step',
}: {
  children: React.ReactNode
  delay?: number
  compact?: boolean
  completed?: boolean
  active?: boolean
  collapsible?: boolean
  defaultCollapsed?: boolean
  collapsedSummary?: React.ReactNode
  collapsedTitle?: React.ReactNode
  variant?: 'step' | 'utility'
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false)

  useEffect(() => {
    if (defaultCollapsed) setCollapsed(true)
  }, [defaultCollapsed])

  const isUtility = variant === 'utility'
  const wrapperClass = isUtility
    ? 'animate-fade-up bg-surface rounded-2xl border border-border p-5 lg:p-6'
    : 'animate-fade-up border-t border-border lg:border-t-0 lg:border-b lg:border-b-border/40'

  if (collapsible) {
    return (
      <div className={wrapperClass} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
        <button
          onClick={() => setCollapsed(c => !c)}
          className="w-full flex items-center justify-between gap-4 group rounded-2xl p-0 py-6 lg:py-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b9fcc]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <div className="flex-1 min-w-0 text-left">
            {collapsedTitle}
          </div>
          <svg
            width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            className={`text-muted group-hover:text-foreground transition-transform duration-200 shrink-0 ${collapsed ? '' : 'rotate-180'}`}
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
        <div
          className="grid transition-[grid-template-rows,opacity] duration-300 ease-out"
          style={{ gridTemplateRows: collapsed ? '0fr' : '1fr', opacity: collapsed ? 0 : 1 }}
        >
          <div className="overflow-hidden">
            <div className={compact ? 'pb-4 lg:pb-5' : 'pb-6 lg:pb-8'}>
              {children}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={wrapperClass}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <div className={isUtility ? '' : compact ? 'py-4 lg:py-5' : 'py-6 lg:py-8'}>
        {children}
      </div>
    </div>
  )
}

// ─── Locked Step (collapsed) ─────────────────────────────────

function LockedStep({ label, delay }: { label: string; delay?: number }) {
  return (
    <div
      className="flex items-center gap-3 py-4 opacity-40 cursor-not-allowed"
    >
      <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="6" height="6" rx="1"/><path d="M4 5V4a2 2 0 0 1 4 0v1"/>
      </svg>
      <span className="text-sm text-muted">{label}</span>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────

export default function ChannelDashboard() {
  const params = useParams()
  const channelId = params.id as string
  const ctx = useChannelContext()
  // Use context state directly so sidebar stays in sync
  const channel = ctx.channel
  const setChannel = ctx.setChannel
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [niches, setNiches] = useState<NicheOption[]>([])
  const [directTopicInput, setDirectTopicInput] = useState('')
  const [showDirectRefineChoice, setShowDirectRefineChoice] = useState(false)
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set())
  const [slideViewerIndex, setSlideViewerIndex] = useState<Record<string, number>>({})
  const [dbPostSlides, setDbPostSlides] = useState<Record<string, Array<{ slideIndex: number; role: string; headline: string | null; body: string | null; displayTitle: string | null; displaySupport: string | null; imageUrl: string | null }>>>({})
  const [dbPostCaptions, setDbPostCaptions] = useState<Record<string, { caption: string | null; article: string | null; hashtags: string[] }>>({})
  const [dbPostSlidesLoading, setDbPostSlidesLoading] = useState<Set<string>>(new Set())
  const [previewMode, setPreviewMode] = useState<Set<string>>(new Set())
  const [regenLoading, setRegenLoading] = useState<Record<string, string | null>>({})
  const [restyleLoading, setRestyleLoading] = useState<Set<string>>(new Set()) // postId -> mode ('copy'|'image'|'full') or null

  // ─── Content Strategy state ─────────────────────────────────
  const [strategyOptions, setStrategyOptions] = useState<ContentStrategy[]>([])
  const [channelTone, setChannelTone] = useState<string>('')
  const [channelAudience, setChannelAudience] = useState<string>('')
  // Indices of selected pillars — all selected by default when options load
  const [selectedPillarIndices, setSelectedPillarIndices] = useState<Set<number>>(new Set())
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

  // Derived: which carousel job is currently pipeline-rendering (null when idle)
  const generatingCarouselJobId = isStreamingPosts ? (carouselProgress?.carouselJobId ?? null) : null

  // ─── Optional naming state (synced with sidebar via context) ─
  const showNaming = ctx.showNaming
  const setShowNaming = ctx.setShowNaming
  const [nameSuggestions, setNameSuggestions] = useState<NameSuggestion[]>([])
  const [customName, setCustomName] = useState('')
  const [selectedNameStyle, setSelectedNameStyle] = useState<NameStyle | null>(null)

  // ─── Visual style state (synced with sidebar via context) ────
  const visualStyle = ctx.visualStyle
  const setVisualStyle = ctx.setVisualStyle
  const showStyleEditor = ctx.showStyleEditor
  const setShowStyleEditor = ctx.setShowStyleEditor
  const [styleSaving, setStyleSaving] = useState(false)
  const [styleSaveNotice, setStyleSaveNotice] = useState<string | null>(null)

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

  const fetchVisualStyle = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/channels/${channelId}/visual-style`)
      if (!res.ok) return
      const data = await res.json()
      setVisualStyle(data)
    } catch { /* keep defaults */ }
  }, [channelId])

  useEffect(() => {
    fetchVisualStyle()
  }, [fetchVisualStyle])

  async function handleSaveVisualStyle() {
    setStyleSaving(true)
    try {
      const res = await fetch(`/api/admin/channels/${channelId}/visual-style`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(visualStyle),
      })
      if (!res.ok) throw new Error('Failed to save style')
      const titleFont = getTitleFont(visualStyle.titleFontId)
      setStyleSaveNotice(`Slide style updated · New posts will use ${titleFont.label}`)
      setTimeout(() => setStyleSaveNotice(null), 4000)
      setShowStyleEditor(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save style')
    } finally {
      setStyleSaving(false)
    }
  }

  async function handleRestyleAllSlides(postId: string, carouselJobId: string) {
    setRestyleLoading(prev => new Set(prev).add(postId))
    try {
      const res = await fetch(`/api/carousel/${carouselJobId}/restyle-all`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to restyle slides')
      }
      // Reload slides so the new images show
      await fetchCarouselSlides(postId, carouselJobId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restyle failed')
    } finally {
      setRestyleLoading(prev => { const n = new Set(prev); n.delete(postId); return n })
    }
  }

  const [retryLoading, setRetryLoading] = useState<Set<string>>(new Set())
  const [retryProgress, setRetryProgress] = useState<Record<string, { message: string; pct: number }>>({})

  async function handleRetryCarousel(postId: string, carouselJobId: string) {
    setRetryLoading(prev => new Set(prev).add(postId))
    setRetryProgress(prev => ({ ...prev, [postId]: { message: 'Starting…', pct: 0 } }))

    // Open SSE stream to show live progress while the generation runs
    const es = new EventSource(`/api/carousel/${carouselJobId}/status`)
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        setRetryProgress(prev => ({
          ...prev,
          [postId]: { message: data.message || data.step || 'Working…', pct: data.pct ?? 0 },
        }))
      } catch {}
    }

    try {
      const res = await fetch(`/api/carousel/${carouselJobId}/regenerate-full`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Retry failed')
      }
      // Mark job as COMPLETE in local state so the Failed badge clears
      setChannel(prev => {
        if (!prev) return prev
        return {
          ...prev,
          posts: prev.posts.map(p =>
            p.id === postId ? { ...p, carouselJobStatus: 'COMPLETE' } : p
          ),
        }
      })
      // Clear any previously cached slides and reload fresh ones
      setDbPostSlides(prev => { const n = { ...prev }; delete n[postId]; return n })
      await fetchCarouselSlides(postId, carouselJobId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed')
    } finally {
      es.close()
      setRetryLoading(prev => { const n = new Set(prev); n.delete(postId); return n })
      setRetryProgress(prev => { const n = { ...prev }; delete n[postId]; return n })
    }
  }

  const [deletingPostId, setDeletingPostId] = useState<string | null>(null)

  async function handleDeletePost(postId: string) {
    if (!confirm('Delete this post and its carousel? This cannot be undone.')) return
    setDeletingPostId(postId)
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete post')
      // Remove from local state
      setChannel(prev => prev ? { ...prev, posts: prev.posts.filter(p => p.id !== postId) } : prev)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingPostId(null)
    }
  }

  // Auto-start niche discovery for DISCOVER mode (no idle "Generate niches" click needed)
  const autoStartedRef = useRef(false)
  const nicheScrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [activeScrollIndex, setActiveScrollIndex] = useState(0)

  const updateScrollArrows = useCallback(() => {
    const el = nicheScrollRef.current
    if (!el) return
    setCanScrollLeft(Math.round(el.scrollLeft) > 10)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
    // Track which card is most visible for dot indicator
    const cardWidth = 320 + 16 // card width + gap
    const index = Math.round(el.scrollLeft / cardWidth)
    setActiveScrollIndex(index)
  }, [])

  useEffect(() => {
    const el = nicheScrollRef.current
    if (!el) return
    // Reset to start whenever niches change (new batch loaded)
    el.scrollLeft = 0
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
    setChannelTone('')
    setChannelAudience('')
    setSelectedPillarIndices(new Set())
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
      let strategies: ContentStrategy[] = []
      if (result.strategies && Array.isArray(result.strategies)) {
        strategies = result.strategies
      } else if (result.strategy) {
        strategies = [result.strategy]
      }
      setStrategyOptions(strategies)
      // Pre-select all pillars
      setSelectedPillarIndices(new Set(strategies.map((_, i) => i)))
      if (result.channelTone) setChannelTone(result.channelTone)
      if (result.channelAudience) setChannelAudience(result.channelAudience)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Strategy generation failed')
    } finally {
      setActionLoading(null)
    }
  }

  function handleTogglePillar(index: number) {
    setSelectedPillarIndices(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        // Keep at least 1 selected
        if (next.size > 1) next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  async function handleApprovePillars() {
    const selectedPillars = strategyOptions.filter((_, i) => selectedPillarIndices.has(i))
    if (selectedPillars.length === 0) return
    setActionLoading('approve-strategy')
    setError('')
    try {
      const res = await fetch(`/api/channels/${channelId}/approve-content-strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pillars: selectedPillars,
          channelTone: channelTone || undefined,
          channelAudience: channelAudience || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to approve strategy')
      }
      setStrategyOptions([])
      setSelectedPillarIndices(new Set())
      setGeneratedStrategy(null)
      setEditingStrategy(null)
      setIsEditingStrategy(false)
      await fetchChannel()
      setActionLoading(null)
      // Auto-advance: start generating first post after strategy is approved
      setTimeout(() => {
        handleGenerateBatch()
        // Scroll to Generate posts section so user sees progress
        const genSection = document.querySelector('h2')
        const sections = document.querySelectorAll('h2')
        const generateHeader = Array.from(sections).find(h => h.textContent?.includes('Generate posts'))
        generateHeader?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
      return
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve strategy')
      setActionLoading(null)
    }
  }

  // Legacy compat
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
      setTimeout(() => handleGenerateBatch(), 100)
      return
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve strategy')
      setActionLoading(null)
    }
  }

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

  // ─── Mobile tab recovery ─────────────────────────────────────
  // When the user switches apps and comes back, the fetch stream is dead.
  // Re-fetch channel data to see if posts were generated while away.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      if (!isStreamingPosts) return // Only relevant during active generation

      // Tab just became visible — check if posts were generated while away
      fetch(`/api/channels/${channelId}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return
          const hadPostsBefore = completedPosts.length + (postStreamProgress?.current ?? 0)
          const hasPostsNow = data.posts?.length ?? 0

          if (hasPostsNow > hadPostsBefore || data.status === 'CONTENT_GENERATED' || data.status === 'COMPLETE') {
            // Posts were generated while we were away — recover gracefully
            postAbortRef.current?.abort()
            stopCarouselPolling()
            setIsStreamingPosts(false)
            setPostStreamProgress(null)
            setError('')
            setChannel(data)
            if (data.nicheOptions?.length > 0) setNiches(data.nicheOptions)

            // Refresh slides for the new posts
            for (const p of data.posts) {
              if (p.carouselJobId && !dbPostSlides[p.id]) {
                fetchCarouselSlides(p.id, p.carouselJobId)
                setExpandedPosts(prev => new Set(prev).add(p.id))
              }
            }
          }
        })
        .catch(() => { /* ignore — will retry on next visibility change */ })
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [channelId, isStreamingPosts, completedPosts.length, postStreamProgress])

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
        // Append cache-busting timestamp to image URLs so browser fetches fresh images after regen
        const cacheBust = `?t=${Date.now()}`
        const slides = data.slides
          .sort((a: { slideIndex: number }, b: { slideIndex: number }) => a.slideIndex - b.slideIndex)
          .map((s: Record<string, unknown>) => ({
            ...s,
            imageUrl: s.imageUrl ? `${(s.imageUrl as string).split('?')[0]}${cacheBust}` : s.imageUrl,
          }))
        setDbPostSlides(prev => ({
          ...prev,
          [postId]: slides,
        }))
        setDbPostCaptions(prev => ({
          ...prev,
          [postId]: { caption: data.caption || null, article: data.article || null, hashtags: data.hashtags || [] },
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

  async function handleRegenerateSlide(postId: string, carouselJobId: string, slideIndex: number, mode: 'copy' | 'image' | 'full', imageSource?: 'wikipedia' | 'generated') {
    const key = `${postId}-${slideIndex}`
    const scrollY = window.scrollY // Preserve scroll position
    setRegenLoading(prev => ({ ...prev, [key]: imageSource === 'wikipedia' ? 'wikipedia' : mode }))
    try {
      const res = await fetch(`/api/carousel/${carouselJobId}/regenerate-slide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slideIndex, mode, ...(imageSource && { imageSource }) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Regeneration failed')
      }
      // Refresh the slides
      await fetchCarouselSlides(postId, carouselJobId)
      // Restore scroll position after state update
      requestAnimationFrame(() => window.scrollTo(0, scrollY))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regeneration failed')
    } finally {
      setRegenLoading(prev => ({ ...prev, [key]: null }))
    }
  }

  // ─── Loading state ─────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-5xl pt-12">
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
      <div className="max-w-5xl pt-16 text-center">
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

  const step1Subtitle = isDirectMode
    ? 'Confirm your topic or let us find a sharper angle for it.'
    : isExploreMode
      ? 'Pick the angle that best fits your channel.'
      : 'We found a few niches based on trending topics. Pick the one that resonates with you.'

  const hasStrategy = !!channel.contentStrategy
  const hasPosts = channel.posts.length > 0

  // Normalize channel.contentStrategy to pillars format for display
  const approvedPillars: ContentStrategy[] = (() => {
    const cs = channel.contentStrategy
    if (!cs) return []
    if ('pillars' in cs && Array.isArray(cs.pillars)) return cs.pillars
    return [cs as ContentStrategy]
  })()
  const approvedChannelTone: string = (() => {
    const cs = channel.contentStrategy
    if (!cs) return ''
    if ('channelTone' in cs) return (cs as ContentPillarsData).channelTone
    return (cs as ContentStrategy).tone
  })()

  return (
    <div className="animate-fade-up max-w-3xl">
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
          {effectiveStep > 0 && niches.length > 0 && niches.some(n => n.selected) ? (
          <Section
            delay={60}
            completed
            collapsible
            defaultCollapsed
            collapsedTitle={
              <h2 className="text-xl font-bold tracking-tight">{step1Title}</h2>
            }
          >
            <p className="text-sm text-muted-light mb-4 max-w-prose" style={{ textWrap: 'balance' } as React.CSSProperties}>{step1Subtitle}</p>
            {niches.length > 0 && (
              <div className="space-y-3">
                {niches.filter(n => n.selected).map((niche) => (
                  <div key={niche.id} className="border rounded-2xl p-5 border-[#3d6fa8]/40 bg-[#3d6fa8]/10">
                    <h3 className="text-base font-semibold mb-1">{niche.title}</h3>
                    <p className="text-sm text-muted-light leading-relaxed">{niche.description}</p>
                  </div>
                ))}
              </div>
            )}
          </Section>
          ) : (
          <Section
            delay={60}
            completed={effectiveStep > 0}
            active={effectiveStep === 0}
          >
            <div className="flex items-start justify-between gap-3 mb-6">
              <div>
                <h2 className="text-xl font-bold tracking-tight">{step1Title}</h2>
                {niches.length > 0 && <p className="text-sm text-muted-light mt-1 max-w-prose" style={{ textWrap: 'balance' }}>{step1Subtitle}</p>}
              </div>

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
                <span className="flex items-center gap-2 text-sm text-[#6b9fcc] font-medium">
                  <span className="w-4 h-4 border-2 border-[#3d6fa8]/30 border-t-[#6b9fcc] rounded-full animate-spin" />
                  Discovering...
                </span>
              ) : niches.length > 0 && effectiveStep > 0 ? (
                <GhostButton
                  onClick={handleGenerateNiches}
                  disabled={actionLoading !== null}
                >
                  Regenerate
                </GhostButton>
              ) : niches.length === 0 ? (
                <PrimaryButton
                  onClick={handleGenerateNiches}
                  disabled={actionLoading !== null}
                  loading={actionLoading === 'generate-niches'}
                  loadingText="Generating..."
                >
                  {isExploreMode ? 'Explore angles' : 'Generate niches'}
                </PrimaryButton>
              ) : null}
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
                  <div className={`animate-fade-up border rounded-2xl p-5 ${niches[0].selected ? 'border-[#3d6fa8]/40 bg-[#3d6fa8]/10' : 'border-border bg-background'}`}>
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold mb-1">{niches[0].title}</h3>
                        <p className="text-sm text-muted-light leading-relaxed max-w-prose">{niches[0].description}</p>
                      </div>
                      {niches[0].selected && (
                        <span className="text-xs font-semibold text-white px-2.5 py-1 rounded-lg shrink-0" style={{ background: 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' }}>Selected</span>
                      )}
                    </div>
                    {niches[0].rationale && (
                      <p className="text-xs text-muted leading-relaxed mt-3">{niches[0].rationale}</p>
                    )}
                  </div>
                ) : (
                  /* Multiple niches — horizontal scroll on mobile, grid on desktop */
                  <div className="relative group/scroll -mx-2 px-2 py-2 -my-2">
                  {/* Scroll arrows — mobile/tablet only */}
                  <div className="lg:hidden">
                  {canScrollLeft && (
                    <button
                      onClick={() => nicheScrollRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
                      className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-surface-elevated border border-border shadow-lg flex items-center justify-center text-muted hover:text-foreground hover:border-border-hover transition-all opacity-60 group-hover/scroll:opacity-100"
                      aria-label="Scroll left"
                    >
                      ‹
                    </button>
                  )}
                  {canScrollRight && (
                    <button
                      onClick={() => nicheScrollRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
                      className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-surface-elevated border border-border shadow-lg flex items-center justify-center text-muted hover:text-foreground hover:border-border-hover transition-all opacity-60 group-hover/scroll:opacity-100"
                      aria-label="Scroll right"
                    >
                      ›
                    </button>
                  )}
                  </div>
                  <div ref={nicheScrollRef} className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x lg:grid lg:grid-cols-3 lg:overflow-x-visible lg:pb-0">
                    {niches.map((niche, i) => (
                      <button
                        key={niche.id}
                        onClick={() => !niche.selected && handleSelectNiche(niche.id)}
                        disabled={actionLoading !== null || niche.selected}
                        className={`
                          animate-fade-up snap-start shrink-0 w-[280px] lg:w-auto text-left border rounded-2xl p-5 transition-all duration-200 flex flex-col disabled:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b9fcc]/60
                          ${niche.selected
                            ? 'border-[#3d6fa8]/40 bg-[#3d6fa8]/10'
                            : 'border-border bg-background hover:border-[#3d6fa8]/25 hover:bg-[#3d6fa8]/8'
                          }
                        `}
                        style={{ animationDelay: `${i * 60}ms` }}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <h3 className="text-base font-semibold leading-snug">{niche.title}</h3>
                          {niche.selected && (
                            <span className="text-xs font-semibold text-white px-2.5 py-1 rounded-lg shrink-0" style={{ background: IG_GRADIENT }}>Selected</span>
                          )}
                        </div>
                        <p className="text-sm font-normal text-muted-light leading-relaxed flex-1">{niche.description}</p>
                      </button>
                    ))}
                  </div>
                  {/* Dot indicators — mobile/tablet only */}
                  <div className="flex justify-center gap-1.5 pt-3 lg:hidden">
                    {niches.map((niche, i) => (
                      <div
                        key={niche.id}
                        className={`w-2 h-2 rounded-full transition-all duration-200 ${niche.selected ? 'bg-[#3d6fa8]' : i === activeScrollIndex ? 'bg-foreground/40 scale-110' : 'bg-border'}`}
                      />
                    ))}
                  </div>
                  </div>
                )}

                {/* Regenerate intents */}
                {effectiveStep === 0 && niches.length > 1 && (
                  <div className="flex flex-wrap items-center gap-2 pt-6">
                    <span className="text-xs font-medium text-muted mr-1">Try different angles:</span>
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
          )}

          {/* ═══════════════════════════════════════════════════════
              Step 2: Define Content Strategy
              ═══════════════════════════════════════════════════════ */}
          {effectiveStep < 1 ? (
            <>
              <LockedStep label="Content strategy" delay={120} />
              <LockedStep label="Generate posts" delay={180} />
            </>
          ) : hasStrategy && strategyOptions.length === 0 ? (
            /* Strategy approved — compact display */
            <Section
              compact
              delay={120}
              completed={effectiveStep > 1}
              collapsible={effectiveStep > 1}
              defaultCollapsed={effectiveStep > 1}
              collapsedTitle={
                <h2 className="text-xl font-bold tracking-tight">Content strategy</h2>
              }
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-muted-light">Content strategy</h2>
                <GhostButton onClick={handleGenerateStrategy} disabled={actionLoading !== null}>
                  Redefine
                </GhostButton>
              </div>
              {approvedPillars.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-[#6b9fcc] bg-[#3d6fa8]/10 px-2.5 py-1 rounded-lg">{approvedChannelTone}</span>
                    <span className="text-xs font-medium text-muted-light bg-surface-elevated px-2.5 py-1 rounded-lg border border-border">{approvedPillars.length} content pillars</span>
                  </div>
                  <div className="space-y-1.5">
                    {approvedPillars.map((p, i) => (
                      <p key={i} className="text-sm text-muted-light leading-snug">
                        <span className="text-muted font-medium">#{i + 1}</span> {p.contentIntent}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </Section>
          ) : (
            <Section delay={120} active={effectiveStep === 1}>
              <div className="flex flex-col gap-3 mb-5">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">Content strategy</h2>
                  <p className="text-sm text-muted-light mt-1 max-w-prose">
                    {strategyOptions.length > 0
                      ? 'Your content pillars — the themes your posts will rotate through. Tap to deselect.'
                      : 'Generate the content pillars that will shape your posting themes for the next 30 days.'}
                  </p>
                </div>
                {strategyOptions.length === 0 && (
                  <PrimaryButton
                    onClick={handleGenerateStrategy}
                    disabled={actionLoading !== null || effectiveStep < 1}
                    loading={actionLoading === 'generate-strategy'}
                    loadingText="Generating..."
                    className="self-start"
                  >
                    Generate pillars
                  </PrimaryButton>
                )}
              </div>

              {/* Pillar cards — all selected by default, tap to toggle */}
              {strategyOptions.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {strategyOptions.map((strategy, i) => {
                    const isSelected = selectedPillarIndices.has(i)
                    return (
                    <button
                      key={i}
                      onClick={() => handleTogglePillar(i)}
                      disabled={actionLoading === 'approve-strategy'}
                      className={`animate-fade-up text-left rounded-2xl p-6 transition-all duration-200 disabled:opacity-40 flex flex-col gap-4 relative ${
                        isSelected
                          ? 'border-2 border-[#3d6fa8]/50 bg-[#3d6fa8]/10'
                          : 'border-2 border-border/50 bg-background hover:border-[#3d6fa8]/25 hover:bg-[#3d6fa8]/8'
                      }`}
                      style={{ animationDelay: `${i * 80}ms` }}
                    >
                      {/* Checkmark */}
                      <div
                        className={`absolute top-4 right-4 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-150 ${isSelected ? 'bg-[#3d6fa8]/15 text-[#6b9fcc]' : 'border border-border bg-background'}`}
                      >
                        {isSelected && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1.5 5.5L4 8L8.5 2" />
                          </svg>
                        )}
                      </div>
                      <p className="text-base font-semibold text-foreground leading-normal pr-7">{strategy.contentIntent}</p>
                      <div className="w-full h-px bg-border" />
                      <p className="text-sm font-normal text-muted-light leading-relaxed flex-1">
                        Target audience:{' '}
                        {strategy.audience.replace(/^(The target audience (are|is)\s*|Target audience:\s*)/i, '')}
                      </p>
                      {(strategy.engagementPotential || strategy.contentDifficulty || strategy.audienceSize) && (
                        <div className="flex flex-wrap gap-1.5">
                          {strategy.engagementPotential && strategy.engagementPotential >= 7 && (
                            <span className="text-xs font-medium text-success bg-success-dim px-2 py-0.5 rounded-full whitespace-nowrap">High engagement</span>
                          )}
                          {strategy.contentDifficulty && strategy.contentDifficulty <= 4 && (
                            <span className="text-xs font-medium text-success bg-success-dim px-2 py-0.5 rounded-full whitespace-nowrap">Low effort</span>
                          )}
                          {strategy.contentDifficulty && strategy.contentDifficulty >= 7 && (
                            <span className="text-xs font-medium text-[#f0a030] bg-[rgba(240,160,48,0.1)] px-2 py-0.5 rounded-full whitespace-nowrap">High effort</span>
                          )}
                          {strategy.audienceSize && strategy.audienceSize >= 7 && (
                            <span className="text-xs font-medium text-[#60a5fa] bg-[rgba(96,165,250,0.1)] px-2 py-0.5 rounded-full whitespace-nowrap">Wide audience</span>
                          )}
                          {strategy.audienceSize && strategy.audienceSize <= 3 && (
                            <span className="text-xs font-medium text-muted-light bg-surface-elevated px-2 py-0.5 rounded-full whitespace-nowrap">Niche audience</span>
                          )}
                        </div>
                      )}
                    </button>
                    )
                  })}
                </div>
              )}

              {/* CTA + Regenerate — anchored below cards */}
              {strategyOptions.length > 0 && (
                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-4">
                  <GhostButton onClick={handleGenerateStrategy} disabled={actionLoading !== null}>
                    Regenerate pillars
                  </GhostButton>
                  <PrimaryButton
                    onClick={handleApprovePillars}
                    disabled={actionLoading !== null || selectedPillarIndices.size === 0}
                    loading={actionLoading === 'approve-strategy'}
                    loadingText="Saving..."
                    className="w-full sm:w-auto justify-center"
                  >
                    Set my pillars ({selectedPillarIndices.size})
                  </PrimaryButton>
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
              Slide Style — always accessible after channel exists
              ═══════════════════════════════════════════════════════ */}
          {showStyleEditor && (
            <Section delay={175} variant="utility">
              <div className="mb-6 space-y-4">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">Slide style</h2>
                  <p className="text-sm text-muted-light mt-1">Applies to new posts. Existing carousel images are unchanged.</p>
                </div>
                <div className="flex items-center gap-2">
                  <PrimaryButton
                    onClick={handleSaveVisualStyle}
                    loading={styleSaving}
                    loadingText="Saving..."
                    disabled={styleSaving}
                    className="flex-1 sm:flex-none justify-center"
                  >
                    Save style
                  </PrimaryButton>
                  <GhostButton onClick={() => setShowStyleEditor(false)} disabled={false}>
                    Close
                  </GhostButton>
                </div>
              </div>

              {/* Two-column: controls + live preview */}
              <div className="flex flex-col lg:flex-row gap-8">
                {/* Controls */}
                <div className="flex-1 space-y-6">
                  {/* Fonts */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">Fonts</h3>

                    {/* Title font picker */}
                    <div>
                      <p className="text-sm font-medium text-muted mb-2">Title font</p>
                      <div className="flex flex-wrap gap-2">
                        {TITLE_FONTS.map(font => (
                          <button
                            key={font.id}
                            onClick={() => setVisualStyle(prev => ({ ...prev, titleFontId: font.id }))}
                            className={`px-3 py-2.5 min-h-[44px] rounded-lg border text-sm transition-colors cursor-pointer ${
                              visualStyle.titleFontId === font.id
                                ? 'border-[#3d6fa8]/60 bg-[#3d6fa8]/10 text-[#6b9fcc]'
                                : 'border-border bg-surface text-foreground hover:border-border-hover'
                            }`}
                            style={{ fontFamily: `'${font.family}', sans-serif`, fontWeight: font.weight }}
                          >
                            {font.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
                      <input
                        type="checkbox"
                        checked={visualStyle.singleFont}
                        onChange={e => setVisualStyle(prev => ({ ...prev, singleFont: e.target.checked }))}
                        className="w-5 h-5 accent-[#3d6fa8] shrink-0"
                      />
                      <span className="text-sm text-muted">Single font (use title font for body text)</span>
                    </label>

                    {/* Paragraph font picker */}
                    <div>
                      <p className={`text-sm font-medium mb-2 ${visualStyle.singleFont ? 'text-muted/50' : 'text-muted'}`}>Paragraph font</p>
                      <div className="flex flex-wrap gap-2">
                        {BODY_FONTS.map(font => (
                          <button
                            key={font.id}
                            onClick={() => !visualStyle.singleFont && setVisualStyle(prev => ({ ...prev, bodyFontId: font.id }))}
                            disabled={visualStyle.singleFont}
                            className={`px-3 py-2.5 min-h-[44px] rounded-lg border text-sm transition-colors ${
                              visualStyle.bodyFontId === font.id && !visualStyle.singleFont
                                ? 'border-[#3d6fa8]/60 bg-[#3d6fa8]/10 text-[#6b9fcc] cursor-pointer'
                                : visualStyle.singleFont
                                ? 'border-border/40 bg-surface/50 text-muted/40 cursor-not-allowed'
                                : 'border-border bg-surface text-foreground hover:border-border-hover cursor-pointer'
                            }`}
                            style={{ fontFamily: `'${font.family}', sans-serif`, fontWeight: font.weight }}
                          >
                            {font.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <hr className="border-border" />

                  {/* Text Colors */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3">Text Colors</h3>
                    <div className="space-y-3">
                      {([
                        { key: 'headlineColor', label: 'Headline', placeholder: '#FFFFFF', fallback: '#FFFFFF' },
                        { key: 'emphasisColor', label: 'Emphasis', placeholder: '#00A8FF', fallback: '#00A8FF' },
                        { key: 'bodyColor', label: 'Body', placeholder: '#B0B0B0', fallback: '#B0B0B0' },
                      ] as const).map(({ key, label, placeholder, fallback }) => (
                        <div key={key} className="flex items-center gap-2 min-w-0">
                          <span className="text-sm text-muted w-16 shrink-0">{label}</span>
                          <input
                            type="color"
                            value={visualStyle[key] ?? fallback}
                            onChange={e => setVisualStyle(prev => ({ ...prev, [key]: e.target.value }))}
                            className="w-9 h-9 rounded-full cursor-pointer border border-border bg-transparent shrink-0"
                          />
                          <input
                            type="text"
                            value={visualStyle[key] ?? ''}
                            placeholder={placeholder}
                            onChange={e => {
                              const v = e.target.value.trim()
                              setVisualStyle(prev => ({ ...prev, [key]: v === '' ? null : v }))
                            }}
                            className="flex-1 min-w-0 bg-surface border border-border rounded-lg px-2 py-2 text-sm text-foreground font-mono placeholder:text-muted focus:border-[#3d6fa8]/50 outline-none"
                          />
                          {visualStyle[key] && (
                            <button
                              onClick={() => setVisualStyle(prev => ({ ...prev, [key]: null }))}
                              className="w-8 h-8 flex items-center justify-center rounded-lg p-0 text-muted hover:text-foreground hover:bg-surface-hover transition-colors shrink-0"
                              title="Reset to default"
                            >
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Live preview — sticky on desktop */}
                <div className="lg:sticky lg:top-24 lg:self-start">
                  <SlidePreview style={visualStyle} />
                </div>
              </div>
            </Section>
          )}

          {/* ═══════════════════════════════════════════════════════
              Step 3: Generate Posts — Batches of 3
              ═══════════════════════════════════════════════════════ */}
          {effectiveStep < 2 ? (
            effectiveStep >= 1 ? <LockedStep label="Generate posts" delay={180} /> : null
          ) : (
          <Section compact={!isStreamingPosts && completedPosts.length === 0 && !hasPosts} delay={180} active={effectiveStep === 2}>
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">Generate posts</h2>
                  {hasPosts && !isStreamingPosts && (
                    <p className="text-sm text-muted-light mt-1">{channel.posts.length} post{channel.posts.length !== 1 ? 's' : ''} generated</p>
                  )}
                  {!isStreamingPosts && !hasPosts && completedPosts.length === 0 && (
                    <p className="text-sm text-muted-light mt-1 max-w-prose">Each post is a full carousel — hooks, copy, quality gates, rendered images, and captions.</p>
                  )}
                </div>
                <button
                  onClick={() => { setShowStyleEditor(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                  className="items-center gap-1.5 min-h-[44px] px-3 text-xs font-semibold text-muted border border-border rounded-lg hover:text-foreground hover:border-border-hover transition-all shrink-0 flex lg:!hidden"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="8" r="5.5" />
                    <circle cx="5" cy="6" r="1" fill="currentColor" stroke="none" />
                    <circle cx="8" cy="4.5" r="1" fill="currentColor" stroke="none" />
                    <circle cx="11" cy="6" r="1" fill="currentColor" stroke="none" />
                  </svg>
                  Edit style
                </button>
              </div>
              {styleSaveNotice && (
                <div className="flex items-center gap-2 text-xs text-[#6b9fcc] animate-fade-up">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 6.5L4.5 9L10 3" />
                  </svg>
                  {styleSaveNotice}
                </div>
              )}
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

                    // A carousel is "stuck" if it exists, isn't COMPLETE, and isn't the one currently generating
                    const isStuck = !!p.carouselJobId
                      && p.carouselJobStatus !== 'COMPLETE'
                      && p.carouselJobId !== generatingCarouselJobId

                    return (
                      <div key={p.id} className={`bg-background border border-border rounded-2xl overflow-hidden transition-all ${isExpanded ? 'border-border-hover' : 'hover:border-border-hover hover:bg-surface-elevated/50'}`}>
                        <div
                          onClick={() => togglePostExpanded(p.id, p.carouselJobId)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') togglePostExpanded(p.id, p.carouselJobId); }}
                          role="button"
                          tabIndex={0}
                          aria-expanded={isExpanded}
                          aria-label={`Post ${p.dayIndex + 1}: ${p.title}`}
                          className="w-full text-left flex items-center gap-4 p-4 transition-all group cursor-pointer"
                        >
                          <div className="w-10 h-10 rounded-xl bg-[#3d6fa8]/10 flex items-center justify-center shrink-0" aria-hidden="true">
                            <span className="text-sm font-bold text-[#6b9fcc]">#{p.dayIndex + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[15px] font-semibold text-foreground truncate">{p.title}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Failed badge — always visible */}
                            {isStuck && !retryLoading.has(p.id) && (
                              <span className="text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-0.5">
                                Failed
                              </span>
                            )}

                            {/* Post actions — Restyle, Retry, Delete */}
                            <div className="flex items-center gap-2 sm:gap-3">
                              {p.carouselJobId && !isStuck && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleRestyleAllSlides(p.id, p.carouselJobId!) }}
                                  disabled={restyleLoading.has(p.id) || p.carouselJobId === generatingCarouselJobId}
                                  className="flex items-center gap-1.5 text-xs text-muted hover:text-[#6b9fcc] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                  title="Re-render all slides with current saved style"
                                  aria-label="Restyle all slides"
                                >
                                  {restyleLoading.has(p.id) ? (
                                    <span className="w-3 h-3 border border-[#3d6fa8]/30 border-t-[#6b9fcc] rounded-full animate-spin" />
                                  ) : (
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                      <circle cx="8" cy="8" r="5.5" />
                                      <circle cx="5" cy="6" r="1" fill="currentColor" stroke="none" />
                                      <circle cx="8" cy="4.5" r="1" fill="currentColor" stroke="none" />
                                      <circle cx="11" cy="6" r="1" fill="currentColor" stroke="none" />
                                    </svg>
                                  )}
                                  <span className="hidden sm:inline">{restyleLoading.has(p.id) ? 'Restyling...' : 'Restyle'}</span>
                                </button>
                              )}
                              {isStuck && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleRetryCarousel(p.id, p.carouselJobId!) }}
                                  disabled={retryLoading.has(p.id)}
                                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                  title="Retry carousel generation"
                                >
                                  {retryLoading.has(p.id) ? (
                                    <span className="w-3 h-3 border border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                                  ) : (
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M2 8a6 6 0 1 0 1.5-4" />
                                      <path d="M2 4v4h4" />
                                    </svg>
                                  )}
                                  <span className="hidden sm:inline">{retryLoading.has(p.id) ? 'Retrying...' : 'Retry'}</span>
                                </button>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); if (window.confirm('Delete this post and its carousel?')) handleDeletePost(p.id) }}
                                disabled={deletingPostId === p.id}
                                className="flex items-center text-muted hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                title="Delete post"
                                aria-label="Delete post"
                              >
                                {deletingPostId === p.id ? (
                                  <span className="w-3.5 h-3.5 border border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                                ) : (
                                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-9" />
                                  </svg>
                                )}
                              </button>
                            </div>

                            <svg
                              width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                              className={`text-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                            >
                              <path d="M4 6l4 4 4-4" />
                            </svg>
                          </div>
                        </div>

                        {/* Retry progress bar */}
                        {retryLoading.has(p.id) && retryProgress[p.id] && (
                          <div className="px-4 pb-3">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs text-muted">{retryProgress[p.id].message}</span>
                              <span className="text-xs text-muted tabular-nums">{retryProgress[p.id].pct}%</span>
                            </div>
                            <div className="h-1 w-full bg-border rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-[#e8612c] to-[#e8612c]/70 rounded-full transition-all duration-500"
                                style={{ width: `${Math.max(retryProgress[p.id].pct, 4)}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Expanded inline slide viewer — inside the card */}
                        {isExpanded && (() => {
                          const isPreview = previewMode.has(p.id)
                          const captionData = dbPostCaptions[p.id]
                          const slideImages = slides?.filter(s => s.imageUrl).map(s => s.imageUrl!) ?? []
                          const fallbackCaption = p.hook
                          const captionText = captionData?.caption || captionData?.article || fallbackCaption
                          const hashtagText = captionData?.hashtags?.length
                            ? captionData.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')
                            : `#${(channel.niche || 'history').replace(/\s+/g, '').toLowerCase()} #facts #didyouknow #education`

                          return (
                            <div className="animate-fade-up border-t border-border/40">
                              <div>
                                {isLoadingSlides ? (
                                  <div className="flex items-center gap-3 p-6">
                                    <span className="w-4 h-4 border-2 border-[#3d6fa8]/30 border-t-[#6b9fcc] rounded-full animate-spin" />
                                    <span className="text-sm text-muted">Loading slides...</span>
                                  </div>
                                ) : slides && slides.length > 0 ? (
                                  <div>
                                    {/* Top toolbar — view toggle + slide counter */}
                                    <div className="flex items-center justify-between px-4 py-2.5">
                                      <div className="flex gap-px bg-foreground/[0.03] rounded-lg p-0.5">
                                        <button
                                          onClick={() => setPreviewMode(prev => { const n = new Set(prev); n.delete(p.id); return n })}
                                          className={`flex items-center gap-1.5 min-h-[36px] px-3.5 text-xs font-semibold rounded-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b9fcc]/60 ${!isPreview ? 'bg-foreground/[0.06] text-foreground/80' : 'text-muted-light hover:text-foreground/70'}`}
                                        >
                                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="4" height="10" rx="1"/><rect x="9" y="3" width="5" height="10" rx="1"/></svg>
                                          Slides
                                        </button>
                                        <button
                                          onClick={() => setPreviewMode(prev => new Set(prev).add(p.id))}
                                          disabled={slideImages.length === 0}
                                          className={`flex items-center gap-1.5 min-h-[36px] px-3.5 text-xs font-semibold rounded-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b9fcc]/60 ${isPreview ? 'bg-foreground/[0.06] text-foreground/80' : 'text-muted-light hover:text-foreground/70'} disabled:opacity-30 disabled:cursor-not-allowed`}
                                        >
                                          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>
                                          Preview
                                        </button>
                                      </div>
                                      {!isPreview && (
                                        <span className="text-xs font-medium text-muted-light uppercase tracking-wide">
                                          <strong className="text-foreground/50">{currentSlide?.role}</strong> &middot; {currentSlideIdx + 1} / {slides.length}
                                        </span>
                                      )}
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
                                      /* Slide-by-slide viewer — flat, no inner card */
                                      <div>
                                        <div className="relative px-2 py-4">
                                          <div className="min-w-0 mx-auto w-full" style={{ maxWidth: 'min(100%, calc(350px * 4 / 5))' }}>
                                            {currentSlide?.imageUrl && (
                                              <img
                                                src={currentSlide.imageUrl}
                                                alt={currentSlide.displayTitle || currentSlide.headline || `Slide ${currentSlideIdx + 1}`}
                                                className="w-full h-auto max-h-[350px] object-contain mx-auto rounded-lg"
                                              />
                                            )}
                                            {!currentSlide?.imageUrl && currentSlide?.headline && (
                                              <p className="px-4 text-sm font-semibold text-foreground">{currentSlide.headline}</p>
                                            )}
                                            {!currentSlide?.imageUrl && currentSlide?.body && (
                                              <p className="px-4 text-sm text-muted-light leading-relaxed">{currentSlide.body}</p>
                                            )}
                                          </div>
                                          {/* Nav arrows overlaid on image edges */}
                                          <button
                                            onClick={() => setSlideViewerIndex(prev => ({ ...prev, [p.id]: Math.max(0, currentSlideIdx - 1) }))}
                                            disabled={currentSlideIdx === 0}
                                            className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 lg:p-3 rounded-full bg-background/80 lg:bg-surface-elevated border border-border hover:bg-surface-elevated disabled:opacity-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b9fcc]/60"
                                          >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lg:w-5 lg:h-5"><polyline points="15 18 9 12 15 6"/></svg>
                                          </button>
                                          <button
                                            onClick={() => setSlideViewerIndex(prev => ({ ...prev, [p.id]: Math.min(slides.length - 1, currentSlideIdx + 1) }))}
                                            disabled={currentSlideIdx === slides.length - 1}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 lg:p-3 rounded-full bg-background/80 lg:bg-surface-elevated border border-border hover:bg-surface-elevated disabled:opacity-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b9fcc]/60"
                                          >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lg:w-5 lg:h-5"><polyline points="9 18 15 12 9 6"/></svg>
                                          </button>
                                        </div>
                                        {/* Regen buttons — outside image container for scroll access */}
                                        {/* Dots */}
                                        <div className="flex items-center justify-center gap-1.5 py-5">
                                          {slides.map((_, i) => (
                                            <div
                                              key={i}
                                              role="button"
                                              tabIndex={0}
                                              onClick={() => setSlideViewerIndex(prev => ({ ...prev, [p.id]: i }))}
                                              onKeyDown={(e) => e.key === 'Enter' && setSlideViewerIndex(prev => ({ ...prev, [p.id]: i }))}
                                              className={`rounded-full cursor-pointer transition-all duration-150 ${i === currentSlideIdx ? 'bg-[#6b9fcc] scale-125' : 'bg-border'}`}
                                              style={{ width: 6, height: 6, flexShrink: 0 }}
                                            />
                                          ))}
                                        </div>

                                        {/* Footer toolbar — regen actions */}
                                        {p.carouselJobId && (() => {
                                          const regenKey = `${p.id}-${currentSlideIdx}`
                                          const activeMode = regenLoading[regenKey]
                                          const actions = [
                                            { key: 'copy', label: 'Rewrite text', loading: 'Rewriting...', onClick: () => handleRegenerateSlide(p.id, p.carouselJobId!, currentSlideIdx, 'copy'), icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M13 3L3 13M8 3h5v5"/></svg> },
                                            { key: 'image', label: <span>New image &middot; <span className="text-[#6b9fcc] font-semibold">AI</span></span>, loading: 'Rendering...', onClick: () => handleRegenerateSlide(p.id, p.carouselJobId!, currentSlideIdx, 'image', 'generated'), icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="2" width="12" height="12" rx="2"/><circle cx="5.5" cy="5.5" r="1.2"/><path d="M14 10l-3.5-3.5L4 13"/></svg> },
                                            { key: 'wikipedia', label: <span>New image &middot; <span className="text-[#6b9fcc] font-semibold">Wikipedia</span></span>, loading: 'Fetching...', onClick: () => handleRegenerateSlide(p.id, p.carouselJobId!, currentSlideIdx, 'image', 'wikipedia'), icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M2 8h12"/><path d="M8 2a10 10 0 0 1 3 6 10 10 0 0 1-3 6"/><path d="M8 2a10 10 0 0 0-3 6 10 10 0 0 0 3 6"/></svg> },
                                            { key: 'full', label: 'Regenerate all', loading: 'Regenerating...', onClick: () => handleRegenerateSlide(p.id, p.carouselJobId!, currentSlideIdx, 'full', 'generated'), icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 8a6 6 0 1 0 1.5-4"/><path d="M2 4v4h4"/></svg> },
                                          ] as const
                                          return (
                                            <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-border/40">
                                              {actions.map((action, ai) => (
                                                <button
                                                  key={action.key}
                                                  onClick={action.onClick}
                                                  disabled={!!activeMode || p.carouselJobId === generatingCarouselJobId}
                                                  className={`flex items-center justify-center gap-1.5 min-h-[44px] text-[13px] sm:text-xs font-medium whitespace-nowrap rounded-none transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-foreground/[0.03] hover:text-foreground/80 border-border/40 ${ai % 2 === 0 ? 'border-r' : ''} ${ai < 2 ? 'sm:border-r border-b sm:border-b-0' : ai < 3 ? 'sm:border-r' : ''} ${
                                                    activeMode === action.key ? 'bg-foreground/[0.03] text-foreground/80' : 'text-muted-light'
                                                  }`}
                                                >
                                                  {activeMode === action.key ? (
                                                    <span className="flex items-center gap-1.5">
                                                      <span className="w-3 h-3 border border-[#3d6fa8]/30 border-t-[#6b9fcc] rounded-full animate-spin" />
                                                      {action.loading}
                                                    </span>
                                                  ) : (
                                                    <>
                                                      <span className="opacity-40">{action.icon}</span>
                                                      {action.label}
                                                    </>
                                                  )}
                                                </button>
                                              ))}
                                            </div>
                                          )
                                        })()}
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

            {/* Generate first post button — only when no posts yet */}
            {!isStreamingPosts && !hasPosts && completedPosts.length === 0 && (
              <div className="mt-6">
                <PrimaryButton
                  onClick={handleGenerateBatch}
                  disabled={actionLoading !== null || !hasStrategy}
                >
                  Generate first post
                </PrimaryButton>
              </div>
            )}

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
                  const isGenerating = !!generatingCarouselJobId && p.carouselJobId === generatingCarouselJobId

                  return (
                    <div key={i} className={`animate-fade-up bg-background border rounded-2xl overflow-hidden transition-all ${isGenerating ? 'border-[#3d6fa8]/40 animate-pulse' : 'border-border'} ${isExpanded ? 'border-border-hover' : 'hover:border-border-hover hover:bg-surface-elevated/50'}`}>
                      <button
                        onClick={() => togglePostExpanded(p.id, p.carouselJobId)}
                        aria-expanded={isExpanded}
                        aria-label={`Post ${p.dayIndex + 1}: ${p.title}`}
                        className="w-full text-left flex items-center gap-4 p-4 transition-all group cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-xl bg-[#3d6fa8]/10 flex items-center justify-center shrink-0" aria-hidden="true">
                          <span className="text-sm font-bold text-[#6b9fcc]">#{p.dayIndex + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-semibold text-foreground truncate">{p.title}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="hidden sm:inline text-xs font-medium text-muted bg-surface-elevated px-2.5 py-1 rounded-lg">
                            {p.slideCount} slides
                          </span>
                          {isGenerating ? (
                            <span className="hidden sm:inline text-xs font-medium text-[#6b9fcc] bg-[#3d6fa8]/10 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                              <span className="w-2 h-2 border border-[#3d6fa8]/30 border-t-[#6b9fcc] rounded-full animate-spin" />
                              Generating...
                            </span>
                          ) : p.hasImages && (
                            <span className="hidden sm:inline text-xs font-medium text-success bg-success-dim px-2.5 py-1 rounded-lg">
                              Images ready
                            </span>
                          )}
                          {!p.carouselJobId && (
                            <Link
                              href={`/channels/${channelId}/posts/${p.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-[#6b9fcc] hover:text-[#8bb8e0] font-semibold transition-colors"
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
                        const fallbackCaption = p.hook
                        const captionText = captionData?.caption || captionData?.article || fallbackCaption
                        const hashtagText = captionData?.hashtags?.length
                          ? captionData.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')
                          : `#${(channel.niche || 'history').replace(/\s+/g, '').toLowerCase()} #facts #didyouknow #education`

                        return (
                          <div className="animate-fade-up border-t border-border/40">
                            <div>
                              {/* Top toolbar — view toggle + slide counter */}
                              <div className="flex items-center justify-between px-4 py-2.5">
                                <div className="flex gap-px bg-foreground/[0.03] rounded-lg p-0.5">
                                  <button
                                    onClick={() => setPreviewMode(prev => { const n = new Set(prev); n.delete(p.id); return n })}
                                    className={`flex items-center gap-1.5 min-h-[36px] px-3.5 text-xs font-semibold rounded-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b9fcc]/60 ${!isPreview ? 'bg-foreground/[0.06] text-foreground/80' : 'text-muted-light hover:text-foreground/70'}`}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="4" height="10" rx="1"/><rect x="9" y="3" width="5" height="10" rx="1"/></svg>
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
                                    className={`flex items-center gap-1.5 min-h-[36px] px-3.5 text-xs font-semibold rounded-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b9fcc]/60 ${isPreview ? 'bg-foreground/[0.06] text-foreground/80' : 'text-muted-light hover:text-foreground/70'} disabled:opacity-30 disabled:cursor-not-allowed`}
                                  >
                                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>
                                    Preview
                                  </button>
                                </div>
                                {!isPreview && effectiveSlides.length > 0 && (
                                  <span className="text-xs font-medium text-muted-light uppercase tracking-wide">
                                    <strong className="text-foreground/50">{currentSlide?.role}</strong> &middot; {currentSlideIdx + 1} / {effectiveSlides.length || p.slideCount}
                                  </span>
                                )}
                              </div>

                              {effectiveSlides.length === 0 ? (
                                <div className="flex items-center gap-3 p-6 bg-surface-elevated rounded-xl">
                                  <span className="w-4 h-4 border-2 border-[#3d6fa8]/30 border-t-[#6b9fcc] rounded-full animate-spin" />
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
                                <div className="flex items-center gap-3 p-6">
                                  <span className="w-4 h-4 border-2 border-[#3d6fa8]/30 border-t-[#6b9fcc] rounded-full animate-spin" />
                                  <span className="text-sm text-muted">Loading preview...</span>
                                </div>
                              ) : (
                                <div>
                                  <div className="flex items-center justify-center gap-2.5 lg:gap-4 px-2 py-4">
                                    <button
                                      onClick={() => setSlideViewerIndex(prev => ({ ...prev, [p.id]: Math.max(0, currentSlideIdx - 1) }))}
                                      disabled={currentSlideIdx === 0}
                                      className="shrink-0 p-2 lg:p-3 rounded-full bg-background/80 lg:bg-surface-elevated border border-border hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b9fcc]/60"
                                    >
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                                    </button>
                                    <div className="min-w-0">
                                      {displaySlide?.imageUrl && (
                                        <div className="relative w-full aspect-[4/5] max-h-[420px] mx-auto bg-surface-elevated rounded-lg" style={{ maxWidth: 'min(100%, calc(420px * 4 / 5))' }}>
                                          <img
                                            src={displaySlide.imageUrl}
                                            alt={currentSlide?.headline || `Slide ${currentSlideIdx + 1}`}
                                            className="w-full h-full object-cover rounded-lg"
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
                                      className="shrink-0 p-2 lg:p-3 rounded-full bg-background/80 border border-border/40 hover:bg-surface-elevated disabled:opacity-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b9fcc]/60"
                                    >
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                                    </button>
                                  </div>
                                  {/* Dots */}
                                  <div className="flex items-center justify-center gap-1.5 py-5">
                                    {effectiveSlides.map((_, si) => (
                                      <button
                                        key={si}
                                        onClick={() => setSlideViewerIndex(prev => ({ ...prev, [p.id]: si }))}
                                        className={`w-1.5 h-1.5 rounded-full transition-all ${si === currentSlideIdx ? 'bg-[#6b9fcc] scale-125' : 'bg-border hover:bg-muted'}`}
                                      />
                                    ))}
                                  </div>
                                  {/* Footer toolbar — regen actions */}
                                  {p.carouselJobId && (() => {
                                    const regenKey = `${p.id}-${currentSlideIdx}`
                                    const activeMode = regenLoading[regenKey]
                                    const actions = [
                                      { key: 'copy', label: 'Rewrite text', loading: 'Rewriting...', onClick: () => handleRegenerateSlide(p.id, p.carouselJobId!, currentSlideIdx, 'copy'), icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M13 3L3 13M8 3h5v5"/></svg> },
                                      { key: 'image', label: <span>New image &middot; <span className="text-[#6b9fcc] font-semibold">AI</span></span>, loading: 'Rendering...', onClick: () => handleRegenerateSlide(p.id, p.carouselJobId!, currentSlideIdx, 'image', 'generated'), icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="2" width="12" height="12" rx="2"/><circle cx="5.5" cy="5.5" r="1.2"/><path d="M14 10l-3.5-3.5L4 13"/></svg> },
                                      { key: 'wikipedia', label: <span>New image &middot; <span className="text-[#6b9fcc] font-semibold">Wikipedia</span></span>, loading: 'Fetching...', onClick: () => handleRegenerateSlide(p.id, p.carouselJobId!, currentSlideIdx, 'image', 'wikipedia'), icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M2 8h12"/><path d="M8 2a10 10 0 0 1 3 6 10 10 0 0 1-3 6"/><path d="M8 2a10 10 0 0 0-3 6 10 10 0 0 0 3 6"/></svg> },
                                      { key: 'full', label: 'Regenerate all', loading: 'Regenerating...', onClick: () => handleRegenerateSlide(p.id, p.carouselJobId!, currentSlideIdx, 'full', 'generated'), icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 8a6 6 0 1 0 1.5-4"/><path d="M2 4v4h4"/></svg> },
                                    ] as const
                                    return (
                                      <div className="flex border-t border-border/40">
                                        {actions.map((action, ai) => (
                                          <button
                                            key={action.key}
                                            onClick={action.onClick}
                                            disabled={!!activeMode || p.carouselJobId === generatingCarouselJobId}
                                            className={`flex-1 flex items-center justify-center gap-1.5 min-h-[44px] text-[13px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-foreground/[0.03] hover:text-foreground/80 ${ai < actions.length - 1 ? 'border-r border-border/40' : ''} ${
                                              activeMode === action.key ? 'bg-foreground/[0.03] text-foreground/80' : 'text-muted-light'
                                            }`}
                                          >
                                            {activeMode === action.key ? (
                                              <span className="flex items-center gap-1.5">
                                                <span className="w-3 h-3 border border-[#3d6fa8]/30 border-t-[#6b9fcc] rounded-full animate-spin" />
                                                {action.loading}
                                              </span>
                                            ) : (
                                              <>
                                                <span className="opacity-40">{action.icon}</span>
                                                {action.label}
                                              </>
                                            )}
                                          </button>
                                        ))}
                                      </div>
                                    )
                                  })()}
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
                  <div className="bg-[#3d6fa8]/10 border border-[#3d6fa8]/20 rounded-2xl p-5 animate-fade-up">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-[#3d6fa8]/10 flex items-center justify-center shrink-0">
                        <span className="w-5 h-5 border-2 border-[#3d6fa8]/30 border-t-[#6b9fcc] rounded-full animate-spin" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <p className="text-sm font-semibold text-foreground/80 truncate">
                          {postStreamProgress?.hook || 'Preparing...'}
                        </p>
                        {carouselProgress ? (
                          <p className="text-xs text-[#6b9fcc] font-medium">{carouselProgress.message}</p>
                        ) : (
                          <p className="text-xs text-muted-light">Generating hook and starting pipeline...</p>
                        )}
                      </div>
                    </div>
                    {/* Pipeline stage indicators */}
                    {(() => {
                      const STAGES = ['Writing hook', 'Researching', 'Writing slides', 'Quality check', 'Creating images', 'Complete']
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
                                className={`flex-1 h-1.5 rounded-full transition-all duration-500 ${
                                  i < currentIndex
                                    ? 'bg-[#3d6fa8]'
                                    : i === currentIndex
                                    ? 'bg-[#3d6fa8] animate-pulse'
                                    : 'bg-border'
                                }`}
                              />
                            ))}
                          </div>
                          {/* Single active stage label */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-[#6b9fcc]">
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

              </div>
            )}
          </Section>
          )}

          {/* ═══════════════════════════════════════════════════════
              Optional: Name Channel (shown when toggled from sidebar)
              ═══════════════════════════════════════════════════════ */}
          {showNaming && (
            <Section delay={300} variant="utility">
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
                      className="group text-left border border-border bg-background rounded-2xl p-5 transition-all duration-200 hover:border-[#3d6fa8]/30 hover:bg-[#3d6fa8]/8 disabled:opacity-40 animate-fade-up max-w-xs"
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <p className="text-lg font-bold text-foreground group-hover:text-[#6b9fcc] transition-colors">{suggestion.name}</p>
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

          {/* Bottom CTAs — Generate next + View all */}
          {!isStreamingPosts && (hasPosts || completedPosts.length > 0) && (
            <div className="flex flex-col sm:flex-row gap-3 pt-6">
              <PrimaryButton
                onClick={handleGenerateBatch}
                disabled={actionLoading !== null || isStreamingPosts}
                className="flex-1"
              >
                Generate next post
              </PrimaryButton>
              <Link
                href={`/channels/${channelId}/posts`}
                className="flex-1 text-center min-h-11 py-2.5 px-6 bg-surface hover:bg-surface-hover border border-border-hover rounded-full text-sm font-semibold transition-all"
              >
                View all posts
              </Link>
            </div>
          )}
    </div>
  )
}

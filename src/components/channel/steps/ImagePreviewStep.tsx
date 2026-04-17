'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

const IG_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'

type SlideSource = 'ai' | 'wikipedia'

interface SlidePreview {
  slideIndex: number
  role: string
  displayTitle: string
  displaySupport: string
  imagePrompt: string
  defaultPrompt: string
  source: SlideSource
  wikipediaQuery: string | null
  wikipediaImageUrl: string | null
  hasImage: boolean
}

interface WikipediaResult {
  imageUrl: string
  sourceUrl: string
  pageTitle: string
  pageDescription: string | null
  author: string | null
  license: string | null
  commonsFileUrl: string | null
}

/** Per-slide editable state held while the user reviews image settings. */
interface SlideDraft {
  slideIndex: number
  role: string
  source: SlideSource
  /** Editable AI prompt (starts from slide.imagePrompt). */
  prompt: string
  /** Immutable default — lets us offer a "reset" even after edits. */
  defaultPrompt: string
  /** Editable Wikipedia search query. */
  wikipediaQuery: string
  /** Most recent Wikipedia search result, if any. */
  wikipediaResult: WikipediaResult | null
  /** Populated after a search fails or returns 404. */
  wikipediaError: string | null
  /** True while the Wikipedia search request is inflight. */
  wikipediaLoading: boolean
}

interface ImagePreviewStepProps {
  jobId: string
  onComplete: () => void
  onBack: () => void
}

export function ImagePreviewStep({ jobId, onComplete, onBack }: ImagePreviewStepProps) {
  const [drafts, setDrafts] = useState<SlideDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [rendering, setRendering] = useState(false)
  const [renderProgress, setRenderProgress] = useState<string | null>(null)

  // Fetch preview prompts and seed the editable drafts
  useEffect(() => {
    fetch(`/api/carousel/${jobId}/preview-prompts`)
      .then(res => res.json())
      .then((data: { previews: SlidePreview[] }) => {
        const seeded: SlideDraft[] = (data.previews ?? []).map(p => ({
          slideIndex: p.slideIndex,
          role: p.role,
          source: p.source,
          prompt: p.imagePrompt,
          defaultPrompt: p.defaultPrompt,
          wikipediaQuery: p.wikipediaQuery ?? '',
          // If the slide already has a saved wiki URL, prefill a minimal result so the user sees what was picked.
          wikipediaResult: p.wikipediaImageUrl
            ? {
                imageUrl: p.wikipediaImageUrl,
                sourceUrl: '',
                pageTitle: p.wikipediaQuery ?? '',
                pageDescription: null,
                author: null,
                license: null,
                commonsFileUrl: null,
              }
            : null,
          wikipediaError: null,
          wikipediaLoading: false,
        }))
        setDrafts(seeded)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [jobId])

  // Poll for render progress
  useEffect(() => {
    if (!rendering) return
    let cancelled = false
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/carousel/${jobId}`)
        const text = await res.text()
        // eslint-disable-next-line no-control-regex
        const data = JSON.parse(text.replace(/[\x00-\x1f]/g, ' '))
        if (cancelled) return

        if (data.progress?.message) setRenderProgress(data.progress.message)
        if (data.status === 'COMPLETE') {
          setRendering(false)
          setRenderProgress(null)
          onComplete()
        }
        if (data.status === 'FAILED') {
          setRendering(false)
          setRenderProgress('Rendering failed')
        }
      } catch {
        // retry
      }
    }, 3000)

    return () => { cancelled = true; clearInterval(interval) }
  }, [rendering, jobId, onComplete])

  // Auto-search Wikipedia once when a slide flips to 'wikipedia' if no result yet.
  const runWikipediaSearch = useCallback((slideIndex: number, query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return
    setDrafts(prev => prev.map(d =>
      d.slideIndex === slideIndex
        ? { ...d, wikipediaLoading: true, wikipediaError: null }
        : d
    ))
    fetch(`/api/wikipedia-search?q=${encodeURIComponent(trimmed)}`)
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Search failed (${res.status})`)
        }
        return res.json() as Promise<WikipediaResult>
      })
      .then(result => {
        setDrafts(prev => prev.map(d =>
          d.slideIndex === slideIndex
            ? { ...d, wikipediaResult: result, wikipediaError: null, wikipediaLoading: false }
            : d
        ))
      })
      .catch(err => {
        setDrafts(prev => prev.map(d =>
          d.slideIndex === slideIndex
            ? { ...d, wikipediaError: err.message || 'Search failed', wikipediaLoading: false }
            : d
        ))
      })
  }, [])

  const handleRender = async () => {
    setRendering(true)
    setRenderProgress('Starting image rendering...')
    try {
      await fetch(`/api/carousel/${jobId}/render-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slides: drafts.map(d => ({
            slideIndex: d.slideIndex,
            source: d.source,
            prompt: d.source === 'ai' ? d.prompt : undefined,
            wikipediaImageUrl: d.source === 'wikipedia' ? d.wikipediaResult?.imageUrl : undefined,
            wikipediaQuery: d.wikipediaQuery,
            author: d.source === 'wikipedia' ? d.wikipediaResult?.author ?? undefined : undefined,
          })),
        }),
      })
    } catch {
      setRendering(false)
      setRenderProgress('Failed to start rendering')
    }
  }

  return (
    <div className="animate-fade-up bg-surface rounded-2xl border border-border py-10 px-3 sm:px-6 lg:py-12 lg:px-10">
      <div className="max-w-2xl mx-auto">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-2 text-center bg-clip-text text-transparent" style={{ backgroundImage: IG_GRADIENT }}>
          Step 5 of 5
        </p>
        <h2 className="text-2xl font-bold tracking-tight mb-2 text-center">Image generation</h2>
        <p className="text-sm text-muted-light mb-6 text-center">
          Tune the AI prompt or swap in real footage from Wikimedia for any slide.
        </p>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-light text-sm">
            <span className="w-4 h-4 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
            Loading slide prompts...
          </div>
        )}

        {/* Rendering progress */}
        {rendering && (
          <div className="text-center py-8">
            <span className="w-6 h-6 border-2 border-muted/30 border-t-[#dc2743] rounded-full animate-spin inline-block mb-3" />
            <p className="text-sm text-foreground font-medium">{renderProgress}</p>
            <p className="text-xs text-muted-light mt-1">This may take a few minutes...</p>
          </div>
        )}

        {/* Slide cards */}
        {!loading && !rendering && (
          <div className="space-y-3">
            {drafts.map(draft => (
              <SlideCard
                key={draft.slideIndex}
                draft={draft}
                total={drafts.length}
                onChange={updates => setDrafts(prev => prev.map(d =>
                  d.slideIndex === draft.slideIndex ? { ...d, ...updates } : d
                ))}
                onSearch={() => runWikipediaSearch(draft.slideIndex, draft.wikipediaQuery)}
                onToggleSource={next => {
                  setDrafts(prev => prev.map(d =>
                    d.slideIndex === draft.slideIndex ? { ...d, source: next } : d
                  ))
                  // On first-time flip to Wikipedia, fire a search if we don't have a result yet.
                  if (next === 'wikipedia' && !draft.wikipediaResult && draft.wikipediaQuery.trim()) {
                    runWikipediaSearch(draft.slideIndex, draft.wikipediaQuery)
                  }
                }}
              />
            ))}
          </div>
        )}

        {/* Actions */}
        {!loading && !rendering && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-0 mt-8">
            <button onClick={onBack} className="text-sm text-muted-light hover:text-foreground transition-colors self-center sm:self-auto order-2 sm:order-1">
              &larr; Back
            </button>
            <button
              onClick={handleRender}
              className="w-full sm:w-auto min-h-11 py-2.5 px-8 text-white rounded-full text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] order-1 sm:order-2"
              style={{ background: IG_GRADIENT }}
            >
              Render all images
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Slide card — compact header + source toggle + per-source editor
// ────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  OPENER: '#f09433',
  FACT: '#6b9fcc',
  IMPLICATION: '#a78bfa',
  CTA: '#dc2743',
}

function SlideCard({
  draft,
  total,
  onChange,
  onSearch,
  onToggleSource,
}: {
  draft: SlideDraft
  total: number
  onChange: (updates: Partial<SlideDraft>) => void
  onSearch: () => void
  onToggleSource: (next: SlideSource) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-size the prompt textarea to its content.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft.prompt, draft.source])

  const roleColor = ROLE_COLORS[draft.role] ?? '#999'
  const isDefault = draft.prompt === draft.defaultPrompt

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      {/* Header: compact role badge */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: roleColor }} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-light whitespace-nowrap">
          {draft.slideIndex + 1}/{total} · {draft.role}
        </span>
      </div>

      {/* Image source selector — labeled so users know the toggle controls */}
      <div className="px-4 pb-3">
        <label className="text-[10px] uppercase tracking-wider text-muted/60 mb-1.5 block">Image source</label>
        <SourceToggle value={draft.source} onChange={onToggleSource} />
      </div>

      {draft.source === 'ai' ? (
        <div className="px-4 pb-4">
          <label className="text-[10px] uppercase tracking-wider text-muted/60 mb-1 flex items-center justify-between">
            <span>Image prompt</span>
            {!isDefault && (
              <button
                type="button"
                onClick={() => onChange({ prompt: draft.defaultPrompt })}
                className="text-[10px] font-semibold text-[#6b9fcc] hover:text-[#8db8db] transition-colors"
              >
                Reset
              </button>
            )}
          </label>
          <textarea
            ref={textareaRef}
            value={draft.prompt}
            onChange={e => onChange({ prompt: e.target.value })}
            spellCheck={false}
            rows={4}
            className="w-full resize-none rounded-lg border border-border bg-muted/5 px-3 py-2 text-xs text-foreground leading-relaxed font-mono focus:outline-none focus:border-[#6b9fcc]/50 transition-colors"
          />
        </div>
      ) : (
        <WikipediaEditor draft={draft} onChange={onChange} onSearch={onSearch} />
      )}
    </div>
  )
}

/**
 * Per-slide source toggle. Buttons are named after the concrete provider
 * (Gemini / Wikipedia) rather than the abstract category (AI / Wikipedia)
 * so the user understands what each option actually does.
 */
function SourceToggle({
  value,
  onChange,
}: {
  value: SlideSource
  onChange: (next: SlideSource) => void
}) {
  const OPTIONS: { id: SlideSource; label: string }[] = [
    { id: 'ai', label: 'Generated AI' },
    { id: 'wikipedia', label: 'Real footage' },
  ]
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5">
      {OPTIONS.map(opt => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
            value === opt.id
              ? 'bg-[#dc2743]/10 text-[#dc2743]'
              : 'text-muted-light hover:text-foreground'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function WikipediaEditor({
  draft,
  onChange,
  onSearch,
}: {
  draft: SlideDraft
  onChange: (updates: Partial<SlideDraft>) => void
  onSearch: () => void
}) {
  return (
    <div className="px-4 pb-4 space-y-2">
      <label className="text-[10px] uppercase tracking-wider text-muted/60 block">Find real footage (Wikimedia)</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft.wikipediaQuery}
          onChange={e => onChange({ wikipediaQuery: e.target.value })}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSearch() } }}
          placeholder="e.g. mantis shrimp"
          className="flex-1 min-w-0 rounded-lg border border-border bg-muted/5 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-[#6b9fcc]/50 transition-colors"
        />
        <button
          type="button"
          onClick={onSearch}
          disabled={draft.wikipediaLoading || !draft.wikipediaQuery.trim()}
          className="shrink-0 px-4 py-2 rounded-lg border border-border text-sm font-semibold transition-colors hover:border-[#6b9fcc]/40 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {draft.wikipediaLoading ? '…' : 'Search'}
        </button>
      </div>

      {/* Loading / error / result */}
      {draft.wikipediaLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-light py-2">
          <span className="w-3 h-3 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
          Searching Wikimedia…
        </div>
      )}

      {draft.wikipediaError && !draft.wikipediaLoading && (
        <p className="text-xs text-red-400 py-1">{draft.wikipediaError}</p>
      )}

      {draft.wikipediaResult && !draft.wikipediaLoading && !draft.wikipediaError && (
        <div className="flex gap-3 items-start rounded-lg border border-border/60 bg-muted/5 p-2 mt-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={draft.wikipediaResult.imageUrl}
            alt={draft.wikipediaResult.pageTitle}
            className="w-20 h-20 rounded-md object-cover bg-black/40 shrink-0"
          />
          <div className="min-w-0 flex-1">
            {draft.wikipediaResult.pageTitle && (
              <p className="text-xs font-semibold text-foreground truncate">{draft.wikipediaResult.pageTitle}</p>
            )}
            {draft.wikipediaResult.pageDescription && (
              <p className="text-[11px] text-muted-light line-clamp-2">{draft.wikipediaResult.pageDescription}</p>
            )}
            <p className="text-[10px] text-muted/60 mt-1 truncate">
              {draft.wikipediaResult.author ? `${draft.wikipediaResult.author} · ` : ''}
              {draft.wikipediaResult.license ? `${draft.wikipediaResult.license} · ` : ''}
              Wikimedia Commons
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

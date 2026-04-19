'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface WikipediaResult {
  imageUrl: string
  sourceUrl: string
  pageTitle: string
  pageDescription: string | null
  author: string | null
  license: string | null
  commonsFileUrl: string | null
}

interface ImageEditPanelProps {
  currentPrompt: string
  isRegenerating: boolean
  defaultWikiQuery?: string
  onRoll: () => Promise<void> | void
  onSavePromptAndRegen: (prompt: string) => Promise<void> | void
  onPickWikipedia: (result: WikipediaResult) => Promise<void> | void
}

export function ImageEditPanel({
  currentPrompt,
  isRegenerating,
  defaultWikiQuery = '',
  onRoll,
  onSavePromptAndRegen,
  onPickWikipedia,
}: ImageEditPanelProps) {
  const [prompt, setPrompt] = useState(currentPrompt)
  const [wikiQuery, setWikiQuery] = useState(defaultWikiQuery)
  const [wikiResults, setWikiResults] = useState<WikipediaResult[]>([])
  const [wikiError, setWikiError] = useState<string | null>(null)
  const [wikiLoading, setWikiLoading] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchCtrl = useRef<AbortController | null>(null)

  useEffect(() => { setPrompt(currentPrompt) }, [currentPrompt])

  const runSearch = useCallback((q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchCtrl.current?.abort()
    if (!q.trim()) {
      setWikiResults([]); setWikiError(null); setWikiLoading(false)
      return
    }
    searchTimer.current = setTimeout(async () => {
      const ctrl = new AbortController()
      searchCtrl.current = ctrl
      setWikiLoading(true); setWikiError(null)
      try {
        const res = await fetch(`/api/wikipedia-search?q=${encodeURIComponent(q.trim())}&gallery=1`, { signal: ctrl.signal })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setWikiResults([])
          setWikiError(body?.error ?? 'No match found')
        } else {
          const data = await res.json() as { results: WikipediaResult[] }
          setWikiResults(data.results ?? [])
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setWikiError('Search failed')
        }
      } finally {
        setWikiLoading(false)
      }
    }, 350)
  }, [])

  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchCtrl.current?.abort()
  }, [])

  const handleWikiInput = (v: string) => {
    setWikiQuery(v)
    runSearch(v)
  }

  const handlePick = async (result: WikipediaResult) => {
    if (picking) return
    setPicking(result.imageUrl)
    try {
      await onPickWikipedia(result)
    } finally {
      setPicking(null)
    }
  }

  const promptDirty = prompt.trim() !== currentPrompt.trim() && prompt.trim().length > 0
  const busy = isRegenerating || !!picking

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden flex flex-col lg:h-full">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between flex-shrink-0">
        <div className="inline-flex items-center gap-2 px-3 h-8 rounded-lg bg-[#dc2743]/10 border border-[#dc2743]/30">
          <span className="text-[12px] font-semibold text-foreground">Editing Image</span>
        </div>
        <p className="text-[11px] text-muted-light">Pick one source</p>
      </div>

      <div className="flex flex-col gap-2.5 px-3 pb-3 lg:flex-1 lg:min-h-0">
        {/* AI card */}
        <section className="rounded-xl border border-border bg-background/40 p-3 lg:flex-1 lg:min-h-0 flex flex-col lg:hover:-translate-y-0.5 lg:hover:shadow-lg transition-all duration-200" style={{ transitionTimingFunction: 'var(--ease-out-expo)' }}>
          <header className="flex items-center gap-2 mb-2 flex-shrink-0">
            <span
              aria-hidden="true"
              className="w-6 h-6 rounded-lg flex items-center justify-center text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #f09433, #dc2743, #bc1888)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l1.8 4.4L18 9l-4.2 1.6L12 15l-1.8-4.4L6 9l4.2-1.6L12 3zM19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14zM5 14l.7 1.6L7.5 16l-1.8.4L5 18l-.7-1.6L2.5 16l1.8-.4L5 14z" fill="currentColor" /></svg>
            </span>
            <h3 className="text-[12px] font-semibold text-foreground leading-tight flex-1 min-w-0">AI-generated image</h3>
          </header>

          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            disabled={busy}
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] leading-snug text-foreground outline-none focus-visible:border-[#dc2743]/60 resize-none disabled:opacity-60 lg:flex-1 lg:min-h-0"
            rows={5}
          />
          <div className="flex items-center justify-between mt-2 gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onRoll}
              disabled={busy}
              className="h-8 px-3 rounded-full text-[11px] font-semibold text-foreground bg-surface-elevated border border-border hover:bg-surface-hover disabled:opacity-40 transition-all active:scale-[0.98]"
            >
              {isRegenerating && !promptDirty ? 'Rolling…' : 'Roll new image'}
            </button>
            <button
              type="button"
              onClick={() => onSavePromptAndRegen(prompt.trim())}
              disabled={busy || !promptDirty}
              className="h-8 px-3 rounded-full text-[11px] font-semibold text-white bg-[#dc2743] hover:bg-[#dc2743]/90 disabled:opacity-40 transition-all active:scale-[0.98]"
            >
              {isRegenerating && promptDirty ? 'Regenerating…' : 'Save & regenerate'}
            </button>
          </div>
        </section>

        {/* Real photo card */}
        <section className="rounded-xl border border-border bg-background/40 p-3 lg:flex-1 lg:min-h-0 flex flex-col lg:hover:-translate-y-0.5 lg:hover:shadow-lg transition-all duration-200" style={{ transitionTimingFunction: 'var(--ease-out-expo)' }}>
          <header className="flex items-center gap-2 mb-2 flex-shrink-0">
            <span
              aria-hidden="true"
              className="w-6 h-6 rounded-lg flex items-center justify-center text-white bg-sky-600 flex-shrink-0"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="8.5" cy="10.5" r="1.5" fill="currentColor" />
                <path d="M21 17l-5-5-4 4-2-2-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </span>
            <h3 className="text-[12px] font-semibold text-foreground leading-tight flex-1 min-w-0">Real photo from Wikipedia</h3>
          </header>

          <input
            type="text"
            value={wikiQuery}
            onChange={e => handleWikiInput(e.target.value)}
            placeholder="Search — e.g. Jim Carrey, Great white shark"
            disabled={busy}
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] text-foreground outline-none focus-visible:border-sky-500/60 disabled:opacity-60 flex-shrink-0"
          />

          <div className="mt-2 lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
            {wikiLoading && (
              <div className="grid grid-cols-3 gap-1.5" aria-label="Searching Wikipedia">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="aspect-[4/5] rounded-md skeleton" />
                ))}
              </div>
            )}
            {!wikiLoading && wikiError && (
              <p className="text-[11px] text-muted-light">{wikiError}</p>
            )}
            {!wikiLoading && wikiResults.length > 0 && (
              <>
                <p className="text-[10px] text-muted/60 mb-1.5">
                  {wikiResults.length} photo{wikiResults.length === 1 ? '' : 's'} from <span className="text-foreground">{wikiResults[0].pageTitle}</span>
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {wikiResults.map(r => (
                    <button
                      key={r.imageUrl}
                      type="button"
                      onClick={() => handlePick(r)}
                      disabled={busy}
                      title={r.license ?? 'Use this image'}
                      className="group relative aspect-[4/5] rounded-md overflow-hidden border border-border bg-background hover:border-sky-500 disabled:opacity-40 transition-all active:scale-[0.98]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.imageUrl}
                        alt={r.pageTitle}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-background/0 group-hover:bg-background/40 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-semibold text-white px-2 py-0.5 rounded-full bg-sky-600">
                          {picking === r.imageUrl ? 'Applying…' : 'Use'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
            {!wikiLoading && wikiResults.length === 0 && !wikiError && (
              <p className="text-[11px] text-muted-light">
                {wikiQuery ? 'Keep typing — we search live.' : 'Try the slide topic to see real photos.'}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

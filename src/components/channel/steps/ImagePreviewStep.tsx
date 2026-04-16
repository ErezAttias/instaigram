'use client'

import { useState, useEffect } from 'react'

const IG_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'

interface SlidePreview {
  slideIndex: number
  role: string
  displayTitle: string
  displaySupport: string
  imagePrompt: string
  canUseWikipedia: boolean
  hasImage: boolean
}

interface ImagePreviewStepProps {
  jobId: string
  onComplete: () => void
  onBack: () => void
}

export function ImagePreviewStep({ jobId, onComplete, onBack }: ImagePreviewStepProps) {
  const [previews, setPreviews] = useState<SlidePreview[]>([])
  const [isCelebrity, setIsCelebrity] = useState(false)
  const [useWikipedia, setUseWikipedia] = useState(false)
  const [loading, setLoading] = useState(true)
  const [rendering, setRendering] = useState(false)
  const [renderProgress, setRenderProgress] = useState<string | null>(null)
  const [expandedPrompts, setExpandedPrompts] = useState<Set<number>>(new Set())

  // Fetch preview prompts
  useEffect(() => {
    fetch(`/api/carousel/${jobId}/preview-prompts`)
      .then(res => res.json())
      .then(data => {
        setPreviews(data.previews || [])
        setIsCelebrity(data.isCelebrity || false)
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
        const data = JSON.parse(text.replace(/[\x00-\x1f]/g, ' '))
        if (cancelled) return

        if (data.progress?.message) {
          setRenderProgress(data.progress.message)
        }
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

  const handleRender = async () => {
    setRendering(true)
    setRenderProgress('Starting image rendering...')
    try {
      await fetch(`/api/carousel/${jobId}/render-images`, { method: 'POST' })
    } catch {
      setRendering(false)
      setRenderProgress('Failed to start rendering')
    }
  }

  const togglePrompt = (idx: number) => {
    setExpandedPrompts(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  return (
    <div className="animate-fade-up bg-surface rounded-2xl border border-border py-10 px-6 lg:py-12 lg:px-10">
      <div className="max-w-2xl mx-auto">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-2 text-center bg-clip-text text-transparent" style={{ backgroundImage: IG_GRADIENT }}>
          Step 5 of 5
        </p>
        <h2 className="text-2xl font-bold tracking-tight mb-2 text-center">Image generation preview</h2>
        <p className="text-sm text-muted-light mb-6 text-center">
          Review the planned visuals for each slide before generating images.
        </p>

        {/* Wikipedia toggle for celebrity topics */}
        {isCelebrity && !rendering && (
          <div className="flex items-center justify-center gap-3 mb-6 p-3 rounded-xl border border-border bg-background">
            <span className="text-sm text-muted-light">Image source:</span>
            <button
              onClick={() => setUseWikipedia(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                !useWikipedia ? 'bg-[#3d6fa8]/20 text-foreground' : 'text-muted-light hover:text-foreground'
              }`}
            >
              AI Generated
            </button>
            <button
              onClick={() => setUseWikipedia(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                useWikipedia ? 'bg-[#3d6fa8]/20 text-foreground' : 'text-muted-light hover:text-foreground'
              }`}
            >
              Wikipedia Photos
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-light text-sm">
            <span className="w-4 h-4 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
            Loading image previews...
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

        {/* Slide prompts */}
        {!loading && !rendering && (
          <div className="space-y-3">
            {previews.map(slide => (
              <div
                key={slide.slideIndex}
                className="rounded-xl border border-border bg-background overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted/60">
                        {slide.role} {slide.slideIndex + 1}/{previews.length}
                      </span>
                    </div>
                    <button
                      onClick={() => togglePrompt(slide.slideIndex)}
                      className="text-[10px] text-muted-light hover:text-foreground transition-colors"
                    >
                      {expandedPrompts.has(slide.slideIndex) ? 'Hide prompt' : 'Show prompt'}
                    </button>
                  </div>
                  <p className="font-semibold text-foreground text-[14px]">{slide.displayTitle}</p>
                  {slide.displaySupport && (
                    <p className="text-xs text-muted-light mt-1">{slide.displaySupport}</p>
                  )}
                </div>

                {/* Expandable image prompt */}
                {expandedPrompts.has(slide.slideIndex) && (
                  <div className="px-4 pb-4">
                    <div className="p-3 rounded-lg bg-muted/5 border border-border/50">
                      <p className="text-[10px] uppercase tracking-wider text-muted/50 mb-1">Image Prompt</p>
                      <p className="text-xs text-muted-light leading-relaxed whitespace-pre-wrap">{slide.imagePrompt}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        {!loading && !rendering && (
          <div className="flex items-center justify-between mt-8">
            <button onClick={onBack} className="text-sm text-muted-light hover:text-foreground transition-colors">
              &larr; Back
            </button>
            <button
              onClick={handleRender}
              className="min-h-11 py-2.5 px-8 text-white rounded-full text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
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

'use client'

import { useState, useEffect } from 'react'

const IG_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'

interface Slide {
  slideIndex: number
  role: string
  headline: string | null
  displayTitle: string | null
  displaySupport: string | null
}

interface CopyReviewStepProps {
  jobId: string
  topic: string
  onApprove: () => void
  onRegenerate: () => void
  onBack: () => void
}

export function CopyReviewStep({ jobId, topic, onApprove, onRegenerate, onBack }: CopyReviewStepProps) {
  const [slides, setSlides] = useState<Slide[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<string>('PENDING')

  useEffect(() => {
    let cancelled = false
    let interval: ReturnType<typeof setInterval> | null = null

    const poll = async () => {
      try {
        const res = await fetch(`/api/carousel/${jobId}`)
        const text = await res.text()
        const data = JSON.parse(text.replace(/[\x00-\x1f]/g, ' '))
        if (cancelled) return

        setStatus(data.status)
        if (data.slides?.length > 0) {
          setSlides(data.slides)
        }
        if (data.status === 'COMPLETE' || data.status === 'FAILED') {
          setLoading(false)
          if (interval) clearInterval(interval)
        }
      } catch {
        // retry
      }
    }

    poll()
    interval = setInterval(poll, 3000)

    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
    }
  }, [jobId])

  const roleLabel = (role: string) => {
    switch (role) {
      case 'OPENER': return 'Cover'
      case 'FACT': return 'Fact'
      case 'CTA': return 'CTA'
      default: return role
    }
  }

  const roleColor = (role: string) => {
    switch (role) {
      case 'OPENER': return '#f09433'
      case 'FACT': return '#6b9fcc'
      case 'CTA': return '#cc2366'
      default: return '#888'
    }
  }

  return (
    <div className="animate-fade-up bg-surface rounded-2xl border border-border py-10 px-6 lg:py-12 lg:px-10">
      <div className="max-w-2xl mx-auto">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-2 text-center bg-clip-text text-transparent" style={{ backgroundImage: IG_GRADIENT }}>
          Step 3 of 4
        </p>
        <h2 className="text-2xl font-bold tracking-tight mb-1 text-center">Review your carousel</h2>
        <p className="text-sm text-muted-light mb-8 text-center">
          {loading ? 'Generating facts...' : `${slides.length} slides for "${topic}"`}
        </p>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className="p-4 rounded-xl border border-border bg-background animate-pulse">
                <div className="h-4 bg-muted/20 rounded w-3/4 mb-2" />
                <div className="h-3 bg-muted/10 rounded w-full" />
              </div>
            ))}
          </div>
        )}

        {/* Failed */}
        {status === 'FAILED' && (
          <div className="text-center py-8">
            <p className="text-red-400 mb-4">Generation failed. Try a different angle.</p>
            <button onClick={onBack} className="text-sm text-muted-light hover:text-foreground">
              &larr; Go back
            </button>
          </div>
        )}

        {/* Slide cards */}
        {!loading && status !== 'FAILED' && (
          <div className="space-y-3">
            {slides.map(slide => (
              <div
                key={slide.slideIndex}
                className="p-4 rounded-xl border border-border bg-background"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md"
                    style={{ color: roleColor(slide.role), background: `${roleColor(slide.role)}15` }}
                  >
                    {roleLabel(slide.role)}
                  </span>
                  <span className="text-[10px] text-muted/50">{slide.slideIndex + 1} / {slides.length}</span>
                </div>
                <p className="font-semibold text-foreground text-[15px] leading-snug">
                  {slide.displayTitle || slide.headline}
                </p>
                {slide.displaySupport && (
                  <p className="text-sm text-muted-light mt-1.5 leading-relaxed">
                    {slide.displaySupport}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        {!loading && status !== 'FAILED' && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-0 mt-8">
            <button onClick={onBack} className="text-sm text-muted-light hover:text-foreground transition-colors self-center sm:self-auto order-3 sm:order-1">
              &larr; Back
            </button>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3 order-1 sm:order-2">
              <button
                onClick={onRegenerate}
                className="w-full sm:w-auto h-11 px-6 border border-border rounded-full text-sm font-semibold transition-all hover:border-[#3d6fa8]/25 hover:bg-[#3d6fa8]/8 order-2 sm:order-1"
              >
                Regenerate
              </button>
              <button
                onClick={onApprove}
                className="w-full sm:w-auto min-h-11 py-2.5 px-8 text-white rounded-full text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] order-1 sm:order-2"
                style={{ background: IG_GRADIENT }}
              >
                Approve copy
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

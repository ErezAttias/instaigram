'use client'

import { useState, useEffect } from 'react'

const IG_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'

interface AngleStepProps {
  topic: string
  onSelect: (angle: { topic: string; direction: string }) => void
  onBack: () => void
}

export function AngleStep({ topic, onSelect, onBack }: AngleStepProps) {
  const [loading, setLoading] = useState(true)
  const [sampleFacts, setSampleFacts] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch('/api/carousel/generate-angles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic }),
    })
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        if (data.error) {
          setError(data.error)
        } else {
          setSampleFacts(data.sampleFacts || [])
        }
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to generate preview')
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [topic])

  const handleContinue = () => {
    onSelect({ topic, direction: topic })
  }

  return (
    <div className="animate-fade-up bg-surface rounded-2xl border border-border py-10 px-6 lg:py-12 lg:px-10">
      <div className="max-w-2xl mx-auto">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-2 text-center bg-clip-text text-transparent" style={{ backgroundImage: IG_GRADIENT }}>
          Step 2 of 4
        </p>
        <h2 className="text-2xl font-bold tracking-tight mb-2 text-center">{topic}</h2>
        <p className="text-sm text-muted-light mb-8 text-center">
          Here&apos;s a preview of the kind of facts we&apos;ll generate for this topic.
        </p>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-light text-sm">
            <span className="w-4 h-4 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
            Generating sample facts...
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-center py-6">
            <p className="text-sm text-red-400 mb-4">{error}</p>
            <p className="text-xs text-muted-light">You can still proceed — the full carousel will be generated next.</p>
          </div>
        )}

        {/* Sample facts */}
        {!loading && sampleFacts.length > 0 && (
          <div className="space-y-3 mb-2">
            {sampleFacts.map((fact, i) => (
              <div
                key={i}
                className="p-4 rounded-xl border border-border bg-background flex items-start gap-3"
              >
                <span className="text-xs font-bold text-muted/40 mt-0.5 shrink-0">{i + 1}</span>
                <p className="text-[15px] font-medium text-foreground leading-snug">{fact}</p>
              </div>
            ))}
            <p className="text-xs text-muted/50 text-center pt-2">
              These are samples — the actual carousel will have different, unique facts.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-0 mt-8">
          <button onClick={onBack} className="text-sm text-muted-light hover:text-foreground transition-colors self-center sm:self-auto order-2 sm:order-1">
            &larr; Change topic
          </button>
          <button
            onClick={handleContinue}
            className="w-full sm:w-auto min-h-11 py-2.5 px-8 text-white rounded-full text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] order-1 sm:order-2"
            style={{ background: IG_GRADIENT }}
          >
            Generate carousel
          </button>
        </div>
      </div>
    </div>
  )
}

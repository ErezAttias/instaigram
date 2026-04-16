'use client'

import { useState, useEffect } from 'react'

const IG_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'

interface AngleOption {
  concept: string
  angleDescription: string
  rationale: string
  mode: string
}

interface AngleStepProps {
  topic: string
  onSelect: (angle: { topic: string; direction: string; concept?: string }) => void
  onBack: () => void
}

export function AngleStep({ topic, onSelect, onBack }: AngleStepProps) {
  const [loading, setLoading] = useState(true)
  const [alternatives, setAlternatives] = useState<AngleOption[]>([])
  const [selected, setSelected] = useState<number | 'original'>('original')
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
          setAlternatives(data.alternatives || [])
        }
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to generate angles')
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [topic])

  const handleContinue = () => {
    if (selected === 'original') {
      onSelect({ topic, direction: topic })
    } else {
      const alt = alternatives[selected]
      onSelect({
        topic,
        direction: alt.angleDescription,
        concept: alt.concept,
      })
    }
  }

  return (
    <div className="animate-fade-up bg-surface rounded-2xl border border-border py-10 px-6 lg:py-12 lg:px-10">
      <div className="max-w-2xl mx-auto">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-2 text-center bg-clip-text text-transparent" style={{ backgroundImage: IG_GRADIENT }}>
          Step 2 of 5
        </p>
        <h2 className="text-2xl font-bold tracking-tight mb-2 text-center">Choose your angle</h2>
        <p className="text-sm text-muted-light mb-8 text-center">Keep your topic as-is or pick one of these focused angles.</p>

        {/* User's original topic */}
        <button
          onClick={() => setSelected('original')}
          className={`w-full text-left p-4 rounded-xl border-2 transition-all mb-3 ${
            selected === 'original'
              ? 'border-[#dc2743] bg-[#dc2743]/5'
              : 'border-border hover:border-[#dc2743]/30'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className={`w-5 h-5 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
              selected === 'original' ? 'border-[#dc2743]' : 'border-muted/40'
            }`}>
              {selected === 'original' && <div className="w-2.5 h-2.5 rounded-full bg-[#dc2743]" />}
            </div>
            <div>
              <p className="font-semibold text-foreground">{topic}</p>
              <p className="text-xs text-muted-light mt-0.5">Your original subject — as-is</p>
            </div>
          </div>
        </button>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-light text-sm">
            <span className="w-4 h-4 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
            Generating alternative angles...
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-red-400 text-center py-4">{error}</p>
        )}

        {/* Alternative angles */}
        {!loading && alternatives.map((alt, i) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className={`w-full text-left p-4 rounded-xl border-2 transition-all mb-3 ${
              selected === i
                ? 'border-[#dc2743] bg-[#dc2743]/5'
                : 'border-border hover:border-[#dc2743]/30'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-5 h-5 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                selected === i ? 'border-[#dc2743]' : 'border-muted/40'
              }`}>
                {selected === i && <div className="w-2.5 h-2.5 rounded-full bg-[#dc2743]" />}
              </div>
              <div>
                <p className="font-semibold text-foreground">{alt.angleDescription}</p>
                <p className="text-xs text-muted-light mt-1">{alt.rationale}</p>
              </div>
            </div>
          </button>
        ))}

        <div className="flex items-center justify-between mt-8">
          <button onClick={onBack} className="text-sm text-muted-light hover:text-foreground transition-colors">
            &larr; Back
          </button>
          <button
            onClick={handleContinue}
            disabled={loading}
            className="min-h-11 py-2.5 px-8 text-white rounded-full text-sm font-semibold disabled:opacity-40 transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: IG_GRADIENT }}
          >
            Generate facts
          </button>
        </div>
      </div>
    </div>
  )
}

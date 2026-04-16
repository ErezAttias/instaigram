'use client'

import { useState } from 'react'

const IG_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'

interface SubjectStepProps {
  onSubmit: (subject: string) => void
  initialValue?: string
}

export function SubjectStep({ onSubmit, initialValue = '' }: SubjectStepProps) {
  const [subject, setSubject] = useState(initialValue)

  return (
    <div className="animate-fade-up bg-surface rounded-2xl border border-border py-12 px-6 lg:py-16 lg:px-10">
      <div className="max-w-lg mx-auto text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-2 bg-clip-text text-transparent" style={{ backgroundImage: IG_GRADIENT }}>
          Step 1 of 5
        </p>
        <h2 className="text-2xl font-bold tracking-tight mb-2">What&apos;s your carousel about?</h2>
        <p className="text-sm text-muted-light mb-8">Enter any topic — we&apos;ll find the best angle and write the facts for you.</p>

        <input
          type="text"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && subject.trim() && onSubmit(subject.trim())}
          placeholder="e.g. Famous movie facts, Ancient Egypt, Coffee science..."
          className="w-full h-12 px-4 rounded-xl bg-background border border-border text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-[#6b9fcc]/40 focus:border-transparent text-base"
          autoFocus
        />

        <button
          onClick={() => subject.trim() && onSubmit(subject.trim())}
          disabled={!subject.trim()}
          className="mt-6 min-h-11 py-2.5 px-8 text-white rounded-full text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: IG_GRADIENT }}
        >
          Find angles
        </button>
      </div>
    </div>
  )
}

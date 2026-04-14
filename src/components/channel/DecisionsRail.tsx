'use client'

import { useChannelContext } from '@/components/ChannelProvider'

const IG_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'

interface Chip {
  key: string
  label: string
  value: string | null
  stepIndex: number
  filled: boolean
}

export function DecisionsRail() {
  const { channel, activeTab, effectiveStep, setActiveTab } = useChannelContext()

  if (!channel) return null

  const topicValue = channel.niche || channel.exploreTopic || null

  let strategyValue: string | null = null
  const cs = channel.contentStrategy as any
  if (cs) {
    if (cs.pillars && Array.isArray(cs.pillars)) {
      strategyValue = cs.pillars.length === 1
        ? cs.pillars[0].contentIntent
        : `${cs.pillars.length} pillars`
    } else {
      strategyValue = cs.contentIntent || null
    }
  }

  const styleValue = channel.carouselLayout
    ? (channel.carouselLayout === 'BOLD' ? 'Bold' : 'Detailed')
    : null

  const chips: Chip[] = [
    {
      key: 'topic',
      label: 'Topic',
      value: topicValue,
      stepIndex: 0,
      filled: effectiveStep >= 1 && !!topicValue,
    },
    {
      key: 'strategy',
      label: 'Strategy',
      value: strategyValue,
      stepIndex: 1,
      filled: effectiveStep >= 2 && !!strategyValue,
    },
    {
      key: 'style',
      label: 'Style',
      value: styleValue,
      stepIndex: 2,
      filled: effectiveStep >= 2 && !!styleValue,
    },
  ]

  return (
    <div className="sticky top-[108px] z-20 bg-background/95 backdrop-blur-sm border-b border-border flex items-center gap-2 py-2.5 overflow-x-auto">
      {/* Chips */}
      <div className="flex items-center gap-2 flex-nowrap">
        {chips.map(chip => {
          const isClickable = chip.filled && activeTab !== chip.stepIndex
          return (
            <button
              key={chip.key}
              disabled={!isClickable}
              onClick={() => isClickable && setActiveTab(chip.stepIndex)}
              className={`flex items-center rounded-lg border overflow-hidden flex-shrink-0 transition-all duration-150 ${
                chip.filled
                  ? 'border-[#6b9fcc]/40 bg-[#3d6fa8]/10 hover:border-[#6b9fcc]/60'
                  : 'border-dashed border-border opacity-50 cursor-default'
              } ${isClickable ? 'cursor-pointer' : ''}`}
            >
              <span className={`px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.07em] uppercase border-r ${
                chip.filled
                  ? 'border-[#6b9fcc]/20 text-[#6b9fcc]/80'
                  : 'border-border/60 text-muted'
              }`}>
                {chip.label}
              </span>
              <span className={`px-2.5 py-1.5 text-xs font-medium truncate max-w-[140px] ${
                chip.filled ? 'text-foreground' : 'text-muted'
              }`}>
                {chip.filled ? chip.value : '—'}
              </span>
              {chip.filled && (
                <span className="pr-2 text-muted/40 flex-shrink-0">
                  <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 13h2l8-8-2-2-8 8v2z" /><path d="M10 4l2 2" />
                  </svg>
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Spacer */}
      <div className="flex-1 min-w-3" />

      {/* Progress pips + step label */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="flex items-center gap-1">
          {[0, 1, 2, 3].map(i => {
            const isDone = effectiveStep > i
            const isActive = activeTab === i
            return (
              <div
                key={i}
                className={`rounded-full transition-all duration-200 ${
                  isDone
                    ? 'w-2 h-2 bg-[#22c55e]/50'
                    : isActive
                      ? 'w-2 h-2'
                      : 'w-1.5 h-1.5 bg-border'
                }`}
                style={isActive ? { background: IG_GRADIENT, boxShadow: '0 0 4px rgba(220,39,67,0.35)' } : undefined}
              />
            )
          })}
        </div>
        <span className="text-[11px] text-muted font-medium whitespace-nowrap">
          Step {activeTab + 1} of 4
        </span>
      </div>
    </div>
  )
}

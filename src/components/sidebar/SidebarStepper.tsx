'use client'

import { useChannelContext } from '@/components/ChannelProvider'

const IG_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'
const IG_GLOW = '0 0 20px rgba(220,39,67,0.35)'

const STEP_LABELS = ['Topic', 'Strategy', 'Style', 'Posts']

export function SidebarStepper({ currentStep }: { currentStep: number }) {
  const { activeTab, setActiveTab } = useChannelContext()
  return (
    <div className="flex flex-col">
      {STEP_LABELS.map((label, i) => {
        const done = currentStep > i
        const active = activeTab === i
        const clickable = i <= currentStep
        const connectorDone = currentStep >= i
        return (
          <div key={label}>
            {i > 0 && (
              <div className="w-9 flex justify-center">
                <div className={`w-0.5 h-5 ${connectorDone ? 'bg-[#3d6fa8]/40' : 'bg-border'}`} />
              </div>
            )}
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && setActiveTab(i)}
              className={`flex items-center gap-3 w-full text-left p-0 rounded-lg ${clickable ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed'} transition-opacity`}
            >
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-none transition-all duration-300 ${done && !active ? 'bg-[#3d6fa8]/15 text-[#6b9fcc]' : active ? 'text-white' : 'bg-surface-elevated text-muted border border-border'}`}
                style={active ? { background: IG_GRADIENT, boxShadow: IG_GLOW } : undefined}
              >
                {done && !active ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 7.5L5.5 10.5L11.5 3.5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={`text-sm font-medium transition-colors ${active ? 'text-foreground' : done ? 'text-muted-light' : 'text-muted-light'}`}>
                {label}
              </span>
            </button>
            {i < STEP_LABELS.length - 1 && (
              <div className="w-9 flex justify-center">
                <div className={`w-0.5 h-5 ${done ? 'bg-[#3d6fa8]/40' : 'bg-border'}`} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function HorizontalStepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {STEP_LABELS.map((label, i) => {
        const done = currentStep > i
        const active = currentStep === i
        return (
          <div key={label} className="flex items-center gap-1.5">
            <div className="flex items-center gap-1.5">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all shrink-0 ${done ? 'bg-[#3d6fa8]/15 text-[#6b9fcc]' : active ? 'text-white' : 'bg-surface-elevated text-muted border border-border'}`}
                style={active ? { background: IG_GRADIENT } : undefined}
              >
                {done ? (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 6.5L4.5 9L10 3" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              {active && (
                <span className="text-sm font-medium text-foreground whitespace-nowrap">{label}</span>
              )}
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`w-4 shrink-0 h-px ${done ? 'bg-[#3d6fa8]/40' : 'bg-border'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

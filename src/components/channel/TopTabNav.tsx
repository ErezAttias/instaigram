'use client'

import { useChannelContext } from '@/components/ChannelProvider'

const TAB_LABELS = ['Topic', 'Strategy', 'Style', 'Posts']

export function TopTabNav() {
  const { activeTab, setActiveTab, effectiveStep } = useChannelContext()

  return (
    <div className="flex gap-0 border-b border-border/60 overflow-x-auto scrollbar-none -mx-4 px-4 lg:-mx-6 lg:px-6">
      {TAB_LABELS.map((label, i) => {
        const done = effectiveStep > i
        const locked = i > effectiveStep
        const active = activeTab === i
        return (
          <button
            key={label}
            type="button"
            disabled={locked}
            onClick={() => !locked && setActiveTab(i)}
            className={`
              flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap shrink-0
              border-b-2 -mb-px transition-all
              ${active
                ? 'border-[#dc2743] text-foreground'
                : locked
                  ? 'border-transparent text-muted/40 cursor-not-allowed'
                  : 'border-transparent text-muted-light hover:text-foreground cursor-pointer'
              }
            `}
          >
            {done && !active && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#6b9fcc" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 6.5L4.5 9L10 3" />
              </svg>
            )}
            {label}
          </button>
        )
      })}
    </div>
  )
}

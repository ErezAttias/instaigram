'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useChannelContext } from '@/components/ChannelProvider'
import { SidebarStepper } from './SidebarStepper'

export function ChannelSidebar() {
  const pathname = usePathname()
  const {
    channel,
    channelId,
    effectiveStep,
    hasPosts,
    hasStrategy,
    showNaming,
    setShowNaming,
  } = useChannelContext()

  if (!channel) return null

  return (
    <div className="flex flex-col">
      {/* Channel info */}
      <div className="mb-6 pb-2">
        {channel.name === 'Untitled Channel' ? (
          <div className="mb-1">
            <button
              onClick={() => setShowNaming(true)}
              className="flex items-center gap-2 group text-left rounded-lg p-0"
            >
              <h1 className="text-xl font-bold tracking-tight text-foreground leading-tight">Untitled channel</h1>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted group-hover:text-[#6b9fcc] transition-colors shrink-0">
                <path d="M3 13h2l8-8-2-2-8 8v2z" /><path d="M10 4l2 2" />
              </svg>
            </button>
            <p className="text-xs text-muted mt-1">Click to name your channel</p>
          </div>
        ) : (
          <h1 className="text-2xl font-bold tracking-tight leading-tight mb-1">{channel.name}</h1>
        )}
        {channel.niche && (
          <p className="text-sm text-muted-light leading-relaxed">{channel.niche}</p>
        )}
      </div>

      {/* Stepper */}
      <SidebarStepper currentStep={effectiveStep} />

      {/* Bottom links */}
      <div className="mt-10 pt-4 border-t border-border/40 space-y-0.5">
        <p className="text-xs text-muted font-medium mb-3">Settings</p>
        {hasPosts && (
          <>
            <Link
              href={`/channels/${channelId}/posts`}
              className={`flex items-center !justify-start gap-2.5 h-10 rounded-xl text-sm font-medium transition-colors w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b9fcc]/60 ${
                pathname.includes('/posts') ? 'text-foreground' : 'text-muted-light hover:text-foreground'
              }`}
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="12" height="12" rx="2" />
                <path d="M5 6h6M5 8.5h4" />
              </svg>
              View all posts
            </Link>
            <Link
              href={`/channels/${channelId}/validation`}
              className={`flex items-center !justify-start gap-2.5 h-10 rounded-xl text-sm font-medium transition-colors w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b9fcc]/60 ${
                pathname.includes('/validation') ? 'text-foreground' : 'text-muted-light hover:text-foreground'
              }`}
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13.5 4.5L6 12L2.5 8.5" />
              </svg>
              Validation report
            </Link>
          </>
        )}
        {hasStrategy && (
          <button
            onClick={() => setShowNaming(!showNaming)}
            className={`flex items-center !justify-start gap-2.5 h-9 rounded-xl text-sm font-medium transition-colors w-full text-left ${showNaming ? 'text-foreground' : 'text-muted-light hover:text-foreground'}`}
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 13h2l8-8-2-2-8 8v2z" />
              <path d="M10 4l2 2" />
            </svg>
            {channel.name !== 'Untitled Channel' ? 'Rename channel' : 'Name channel'}
          </button>
        )}
      </div>
    </div>
  )
}

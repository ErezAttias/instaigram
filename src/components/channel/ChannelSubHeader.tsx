'use client'

import Link from 'next/link'
import { useChannelContext } from '@/components/ChannelProvider'

export function ChannelSubHeader() {
  const { channel, autosaved, showNaming, setShowNaming } = useChannelContext()
  if (!channel) return null

  const displayName = channel.name === 'Untitled Channel' ? 'Untitled channel' : channel.name

  return (
    <div className="border-b border-border bg-background flex items-center gap-2 px-0 h-11 flex-shrink-0">
      {/* Back */}
      <Link
        href="/admin"
        className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 3L5 8l5 5" />
        </svg>
        Back
      </Link>

      <span className="text-border/60 text-sm">·</span>

      {/* Channel name */}
      <button
        onClick={() => setShowNaming(!showNaming)}
        className="flex items-center gap-1.5 group"
      >
        <span className="text-sm font-semibold text-foreground group-hover:text-[#6b9fcc] transition-colors">
          {displayName}
        </span>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted group-hover:text-[#6b9fcc] transition-colors">
          <path d="M3 13h2l8-8-2-2-8 8v2z" /><path d="M10 4l2 2" />
        </svg>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Autosaved indicator */}
      <div className={`flex items-center gap-1.5 transition-opacity duration-500 ${autosaved ? 'opacity-100' : 'opacity-0'}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" style={{ boxShadow: '0 0 5px rgba(34,197,94,0.6)' }} />
        <span className="text-xs text-muted">Autosaved</span>
      </div>
    </div>
  )
}

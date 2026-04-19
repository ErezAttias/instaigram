'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useChannelContext } from '@/components/ChannelProvider'
import { HorizontalStepper } from './SidebarStepper'

function AdminMobileNav() {
  return (
    <nav className="lg:hidden flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
      <MobilePill href="/admin" icon={<GridIcon />} label="All Channels" />
    </nav>
  )
}

function ChannelMobileNav() {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { effectiveStep, channel, channelId, setShowNaming } = useChannelContext()
    return (
      <div className="lg:hidden mb-6 flex items-center justify-between gap-3">
        <HorizontalStepper currentStep={effectiveStep} />
        {channel?.name === 'Untitled Channel' ? (
          <button
            onClick={() => setShowNaming(true)}
            className="flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg border border-border text-xs font-semibold text-muted hover:text-foreground hover:border-border-hover transition-all shrink-0"
          >
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 10h2l6-6-2-2-6 6v2z" /><path d="M7.5 3.5l1 1" />
            </svg>
            Name channel
          </button>
        ) : (
          <span className="text-sm font-semibold text-foreground truncate max-w-[140px]">{channel?.name}</span>
        )}
      </div>
    )
  } catch {
    // ChannelProvider not available (e.g., on /channels without [id])
    return null
  }
}

function CarouselMobileNav() {
  return (
    <nav className="lg:hidden flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
      <MobilePill href="/admin" icon={<BackIcon />} label="Dashboard" />
    </nav>
  )
}

function PreviewMobileNav() {
  return (
    <nav className="lg:hidden flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
      <MobilePill href="/admin" icon={<BackIcon />} label="Dashboard" />
    </nav>
  )
}

export function MobileSidebarNav() {
  const pathname = usePathname()

  if (pathname.startsWith('/channels/')) {
    return <ChannelMobileNav />
  }
  if (pathname.startsWith('/carousel')) {
    return <CarouselMobileNav />
  }
  if (pathname.startsWith('/preview')) {
    return <PreviewMobileNav />
  }
  return <AdminMobileNav />
}

// ── Shared pill component ──
function MobilePill({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="shrink-0 flex items-center gap-1.5 px-3 h-9 rounded-full text-sm font-medium text-muted-light bg-surface border border-border hover:text-foreground hover:bg-surface-hover whitespace-nowrap transition-colors"
    >
      {icon}
      {label}
    </Link>
  )
}

// ── Icons ──
function GridIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  )
}

function LightningIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}

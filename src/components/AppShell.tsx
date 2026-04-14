'use client'

import { usePathname } from 'next/navigation'
import { ChannelProvider } from './ChannelProvider'
import { SidebarContent } from './sidebar/SidebarContent'
import { MobileSidebarNav } from './sidebar/MobileSidebarNav'
import { ChannelSubHeader } from './channel/ChannelSubHeader'
import { DecisionsRail } from './channel/DecisionsRail'

function extractChannelId(pathname: string): string | null {
  const match = pathname.match(/^\/channels\/([^/]+)/)
  return match ? match[1] : null
}

function ShellInner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Mobile nav — visible below lg */}
      <MobileSidebarNav />

      {/* Desktop sidebar */}
      <aside className="w-60 shrink-0 hidden lg:block">
        <nav className="sticky top-24 space-y-1">
          <SidebarContent />
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 max-w-5xl lg:mx-auto">
        {children}
      </div>
    </div>
  )
}

function ChannelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      {/* Full-width strips above the sidebar/content split */}
      <ChannelSubHeader />
      <DecisionsRail />

      {/* Sidebar + content */}
      <div className="flex flex-col lg:flex-row gap-8 pt-6">
        {/* Mobile nav */}
        <MobileSidebarNav />

        {/* Desktop sidebar */}
        <aside className="w-60 shrink-0 hidden lg:block">
          <nav className="sticky top-[164px] space-y-1">
            <SidebarContent />
          </nav>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 max-w-5xl lg:mx-auto">
          {children}
        </div>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const channelId = extractChannelId(pathname)

  // Wrap channel routes with ChannelProvider so sidebar can access channel data
  if (channelId) {
    return (
      <ChannelProvider channelId={channelId}>
        <ChannelShell>{children}</ChannelShell>
      </ChannelProvider>
    )
  }

  return <ShellInner>{children}</ShellInner>
}

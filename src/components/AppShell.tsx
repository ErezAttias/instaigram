'use client'

import { usePathname } from 'next/navigation'
import { ChannelProvider } from './ChannelProvider'
import { SidebarContent } from './sidebar/SidebarContent'
import { MobileSidebarNav } from './sidebar/MobileSidebarNav'

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
      <div className="flex-1 min-w-0 max-w-5xl">
        {children}
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
        <ShellInner>{children}</ShellInner>
      </ChannelProvider>
    )
  }

  return <ShellInner>{children}</ShellInner>
}

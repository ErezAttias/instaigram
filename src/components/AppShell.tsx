'use client'

import { usePathname } from 'next/navigation'
import { ChannelProvider } from './ChannelProvider'
import { ChannelSubHeader } from './channel/ChannelSubHeader'
import { DecisionsRail } from './channel/DecisionsRail'

function extractChannelId(pathname: string): string | null {
  const match = pathname.match(/^\/channels\/([^/]+)/)
  return match ? match[1] : null
}

function ShellInner({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      {children}
    </div>
  )
}

function ChannelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      {/* Full-width strips at the top */}
      <ChannelSubHeader />
      <DecisionsRail />

      {/* Main content — no sidebar */}
      <div className="pt-6 min-w-0">
        {children}
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const channelId = extractChannelId(pathname)

  // Wrap channel routes with ChannelProvider so descendants can access channel data
  if (channelId) {
    return (
      <ChannelProvider channelId={channelId}>
        <ChannelShell>{children}</ChannelShell>
      </ChannelProvider>
    )
  }

  return <ShellInner>{children}</ShellInner>
}

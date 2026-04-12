'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { ChannelVisualStyleContext } from '@/lib/visual/visual-style'
import { DEFAULT_VISUAL_STYLE } from '@/lib/visual/visual-style'

interface Channel {
  id: string
  name: string
  niche: string | null
  nicheMode: 'DISCOVER' | 'EXPLORE' | 'DIRECT'
  exploreTopic: string | null
  contentStrategy: unknown
  status: string
  nicheOptions: unknown[]
  posts: unknown[]
}

interface ChannelContextValue {
  channel: Channel | null
  channelId: string
  effectiveStep: number
  hasPosts: boolean
  hasStrategy: boolean
  visualStyle: ChannelVisualStyleContext
  showNaming: boolean
  setShowNaming: (v: boolean) => void
  showStyleEditor: boolean
  setShowStyleEditor: (v: boolean) => void
  // Allow the page component to push updates
  setChannel: (c: Channel | null) => void
  setVisualStyle: (v: ChannelVisualStyleContext) => void
}

const ChannelContext = createContext<ChannelContextValue | null>(null)

export function useChannelContext() {
  const ctx = useContext(ChannelContext)
  if (!ctx) throw new Error('useChannelContext must be used within ChannelProvider')
  return ctx
}

export function ChannelProvider({ channelId, children }: { channelId: string; children: React.ReactNode }) {
  const [channel, setChannel] = useState<Channel | null>(null)
  const [visualStyle, setVisualStyle] = useState<ChannelVisualStyleContext>(DEFAULT_VISUAL_STYLE)
  const [showNaming, setShowNaming] = useState(false)
  const [showStyleEditor, setShowStyleEditor] = useState(false)

  const fetchChannel = useCallback(async () => {
    try {
      const res = await fetch(`/api/channels/${channelId}`)
      if (!res.ok) return
      const data = await res.json()
      setChannel(data)
    } catch { /* silent */ }
  }, [channelId])

  const fetchVisualStyle = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/channels/${channelId}/visual-style`)
      if (!res.ok) return
      const data = await res.json()
      setVisualStyle(data)
    } catch { /* keep defaults */ }
  }, [channelId])

  useEffect(() => {
    fetchChannel()
    fetchVisualStyle()
  }, [fetchChannel, fetchVisualStyle])

  // Derive step
  const stepOrder = ['DRAFT', 'NICHE_SELECTED', 'STRATEGY_DEFINED', 'CONTENT_GENERATED', 'COMPLETE']
  const statusIndex = channel ? stepOrder.indexOf(channel.status) : 0
  const currentStep = statusIndex <= 0 ? 0 : statusIndex === 1 ? 1 : statusIndex >= 2 ? 2 : 0
  const isLegacyStatus = channel ? ['NAMED', 'HOOKS_GENERATED', 'POSITIONED'].includes(channel.status) : false
  const effectiveStep = isLegacyStatus ? 2 : currentStep

  const hasStrategy = !!channel?.contentStrategy
  const hasPosts = (channel?.posts?.length ?? 0) > 0

  return (
    <ChannelContext.Provider
      value={{
        channel,
        channelId,
        effectiveStep,
        hasPosts,
        hasStrategy,
        visualStyle,
        showNaming,
        setShowNaming,
        showStyleEditor,
        setShowStyleEditor,
        setChannel,
        setVisualStyle,
      }}
    >
      {children}
    </ChannelContext.Provider>
  )
}

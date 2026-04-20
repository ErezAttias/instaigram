'use client'

import { withAlpha } from './utils'
import type { CarouselTheme } from './themes'

export function AuroraBackdrop({ theme }: { theme: CarouselTheme }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="aurora-blob blob-a" style={{ background: `radial-gradient(closest-side, ${theme.auroraA}, transparent 70%)` }} />
      <div className="aurora-blob blob-b" style={{ background: `radial-gradient(closest-side, ${theme.auroraB}, transparent 70%)` }} />
      <div className="aurora-blob blob-c" style={{ background: `radial-gradient(closest-side, ${theme.auroraC}, transparent 70%)` }} />
      <div
        className="aurora-prism"
        style={{
          background: `conic-gradient(from 180deg at 50% 50%,
            ${withAlpha(theme.auroraA, 0.0)} 0deg,
            ${withAlpha(theme.auroraA, 0.35)} 60deg,
            ${withAlpha(theme.auroraB, 0.35)} 180deg,
            ${withAlpha(theme.auroraC, 0.30)} 300deg,
            ${withAlpha(theme.auroraA, 0.0)} 360deg)`,
        }}
      />
    </div>
  )
}

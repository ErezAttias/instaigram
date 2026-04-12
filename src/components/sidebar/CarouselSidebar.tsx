'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function CarouselSidebar() {
  const pathname = usePathname()
  const isExact = pathname === '/carousel'

  return (
    <div className="space-y-1">
      <Link
        href="/admin"
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-light hover:text-foreground hover:bg-surface-hover transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Dashboard
      </Link>
      <Link
        href="/carousel"
        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
          isExact
            ? 'font-medium text-foreground bg-surface-hover'
            : 'text-muted-light hover:text-foreground hover:bg-surface-hover'
        }`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        New Carousel
      </Link>
    </div>
  )
}

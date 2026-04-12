'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function AdminSidebar() {
  const pathname = usePathname()

  const links = [
    {
      href: '/admin',
      label: 'All Channels',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
      exact: true,
    },
    {
      href: '/carousel',
      label: 'Quick Carousel',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      exact: false,
    },
  ]

  return (
    <div className="space-y-1">
      {links.map(({ href, label, icon, exact }) => {
        const isActive = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive
                ? 'font-medium text-foreground bg-surface-hover'
                : 'text-muted-light hover:text-foreground hover:bg-surface-hover'
            }`}
          >
            {icon}
            {label}
          </Link>
        )
      })}
    </div>
  )
}

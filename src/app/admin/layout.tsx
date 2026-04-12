import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Mobile pill nav — visible below lg */}
      <nav className="lg:hidden flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
        <Link
          href="/admin"
          className="shrink-0 flex items-center gap-1.5 px-3 h-9 rounded-full text-sm font-medium text-muted-light bg-surface border border-border hover:text-foreground hover:bg-surface-hover whitespace-nowrap transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          All Channels
        </Link>
        <Link
          href="/admin/channels/new"
          className="shrink-0 flex items-center gap-1.5 px-3 h-9 rounded-full text-sm font-medium text-muted-light bg-surface border border-border hover:text-foreground hover:bg-surface-hover whitespace-nowrap transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Channel
        </Link>
        <Link
          href="/carousel"
          className="shrink-0 flex items-center gap-1.5 px-3 h-9 rounded-full text-sm font-medium text-muted-light bg-surface border border-border hover:text-foreground hover:bg-surface-hover whitespace-nowrap transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Quick Carousel
        </Link>
      </nav>

      {/* Sidebar */}
      <aside className="w-56 shrink-0 hidden lg:block">
        <nav className="sticky top-24 space-y-1">
          <Link
            href="/admin"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-light hover:text-foreground hover:bg-surface-hover transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            All Channels
          </Link>
          <Link
            href="/carousel"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-light hover:text-foreground hover:bg-surface-hover transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Quick Carousel
          </Link>
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}

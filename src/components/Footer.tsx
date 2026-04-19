import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-border/50">
      <div className="max-w-[1280px] mx-auto px-6 lg:px-8 py-6 lg:py-10 flex flex-col lg:flex-row items-center lg:items-center justify-between gap-4 lg:gap-6 text-center lg:text-left">
        {/* Brand + tagline */}
        <div className="flex flex-col gap-1">
          <Link
            href="/"
            className="text-xl font-semibold tracking-tight font-[family-name:var(--font-bricolage)] bg-clip-text text-transparent w-fit"
            style={{ backgroundImage: 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' }}
          >
            InstAIgram
          </Link>
          <p className="text-xs text-muted-light">
            AI-powered Instagram content generation.
          </p>
        </div>

        {/* Link columns */}
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <Link href="/admin" className="text-sm text-muted-light hover:text-foreground transition-colors">
            Dashboard
          </Link>
          <Link href="/" className="text-sm text-muted-light hover:text-foreground transition-colors">
            Home
          </Link>
        </div>

        {/* Copyright */}
        <div className="text-xs text-muted-light/70">
          © {new Date().getFullYear()} InstAIgram
        </div>
      </div>
    </footer>
  )
}

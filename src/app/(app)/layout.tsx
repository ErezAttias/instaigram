import { AppShell } from '@/components/AppShell'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-[1280px] mx-auto px-4 lg:px-8 py-6 lg:py-0 w-full lg:flex-1 lg:flex lg:flex-col lg:justify-center">
      <AppShell>
        {children}
      </AppShell>
    </main>
  )
}

import { AppShell } from '@/components/AppShell'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-[1800px] mx-auto px-4 lg:px-8 py-6 lg:py-10">
      <AppShell>
        {children}
      </AppShell>
    </main>
  )
}

'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { ImagePreviewStep } from '@/components/channel/steps/ImagePreviewStep'

// Dev-only preview route so we can iterate on ImagePreviewStep without walking
// the full wizard flow. Pass ?jobId=<id> to point at a real carousel job.
function ImagePreviewStepHarness() {
  const params = useSearchParams()
  const jobId = params?.get('jobId') ?? 'cmo2hgjev0009mppg6xmughr2'
  return (
    <div className="max-w-4xl mx-auto p-2 sm:p-6">
      <ImagePreviewStep
        jobId={jobId}
        onComplete={() => alert('Render complete (dev harness)')}
        onBack={() => history.back()}
      />
    </div>
  )
}

export default function ImagePreviewDevPage() {
  return (
    <Suspense fallback={<div className="p-10 text-muted-light text-sm">Loading…</div>}>
      <ImagePreviewStepHarness />
    </Suspense>
  )
}

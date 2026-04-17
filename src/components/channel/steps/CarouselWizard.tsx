'use client'

import { useState, useCallback } from 'react'
import { SubjectStep } from './SubjectStep'
import { AngleStep } from './AngleStep'
import { CopyReviewStep } from './CopyReviewStep'
import { ImagePreviewStep } from './ImagePreviewStep'

// 4 steps now — design used to sit between copy and images, but typography
// decisions depend on the actual photo contrast/composition, so design has
// moved to the carousel viewer where the user can judge readability against
// the real rendered slides.
export type WizardStep = 'subject' | 'angle' | 'copy' | 'images' | 'done'

const STEP_NUMBER: Record<WizardStep, number> = {
  subject: 1,
  angle: 2,
  copy: 3,
  images: 4,
  done: 4,
}

const TOTAL_STEPS = 4

interface CarouselWizardProps {
  channelId?: string
  /** Pre-filled topic from channel creation (skips Step 1) */
  initialTopic?: string
  /** Called when the full flow completes (images rendered) */
  onComplete?: (jobId: string) => void
}

export function CarouselWizard({ channelId, initialTopic, onComplete }: CarouselWizardProps) {
  const [step, setStep] = useState<WizardStep>(initialTopic ? 'angle' : 'subject')
  const [subject, setSubject] = useState(initialTopic || '')
  const [jobId, setJobId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  // Step 1 → Step 2
  const handleSubjectSubmit = useCallback((value: string) => {
    setSubject(value)
    setStep('angle')
  }, [])

  // Step 2 → Step 3: Create job with skipImages, start copy generation
  const handleAngleSelect = useCallback(async (angle: { topic: string; direction: string }) => {
    setGenerating(true)
    try {
      const res = await fetch('/api/carousel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: angle.topic,
          direction: angle.direction,
          channelId,
          skipImages: true,
        }),
      })
      const data = await res.json()
      if (data.jobId) {
        setJobId(data.jobId)
        setStep('copy')
      }
    } catch (err) {
      console.error('Failed to start generation:', err)
    } finally {
      setGenerating(false)
    }
  }, [channelId])

  // Step 3 → Step 4: Copy approved, jump straight to image preview (design now lives on the viewer)
  const handleCopyApprove = useCallback(() => {
    setStep('images')
  }, [])

  // Step 3: Regenerate copy
  const handleCopyRegenerate = useCallback(async () => {
    if (!jobId) return
    // Create a new job with same params
    setGenerating(true)
    try {
      const res = await fetch('/api/carousel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: subject,
          channelId,
          skipImages: true,
        }),
      })
      const data = await res.json()
      if (data.jobId) {
        setJobId(data.jobId)
        // Stay on copy step — it will re-poll
      }
    } catch (err) {
      console.error('Failed to regenerate:', err)
    } finally {
      setGenerating(false)
    }
  }, [jobId, subject, channelId])

  // Step 4: Images done
  const handleImagesComplete = useCallback(() => {
    setStep('done')
    if (jobId) onComplete?.(jobId)
  }, [jobId, onComplete])

  // Progress bar
  const currentStepNum = STEP_NUMBER[step]
  const progressPct = (currentStepNum / TOTAL_STEPS) * 100

  if (step === 'done' && jobId) {
    return (
      <div className="animate-fade-up bg-surface rounded-2xl border border-border py-12 px-6 text-center">
        <div className="text-3xl mb-3">&#10003;</div>
        <h2 className="text-xl font-bold mb-2">Carousel ready!</h2>
        <p className="text-sm text-muted-light mb-6">Your carousel has been generated with images.</p>
        <button
          onClick={() => {
            setStep('subject')
            setSubject('')
            setJobId(null)
          }}
          className="h-11 px-6 border border-border rounded-full text-sm font-semibold transition-all hover:border-[#3d6fa8]/25 hover:bg-[#3d6fa8]/8"
        >
          Create another
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progressPct}%`,
              background: 'linear-gradient(90deg, #f09433, #dc2743)',
            }}
          />
        </div>
        <span className="text-xs text-muted/50 shrink-0">
          Step {currentStepNum} of {TOTAL_STEPS}
        </span>
      </div>

      {/* Step content */}
      {step === 'subject' && (
        <SubjectStep
          onSubmit={handleSubjectSubmit}
          initialValue={subject}
        />
      )}

      {step === 'angle' && (
        <AngleStep
          topic={subject}
          onSelect={handleAngleSelect}
          onBack={() => setStep('subject')}
        />
      )}

      {step === 'copy' && jobId && (
        <CopyReviewStep
          jobId={jobId}
          topic={subject}
          onApprove={handleCopyApprove}
          onRegenerate={handleCopyRegenerate}
          onBack={() => setStep('angle')}
        />
      )}

      {step === 'images' && jobId && (
        <ImagePreviewStep
          jobId={jobId}
          onComplete={handleImagesComplete}
          onBack={() => setStep('copy')}
        />
      )}

      {generating && (
        <div className="fixed inset-0 bg-background/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface rounded-2xl border border-border p-8 text-center">
            <span className="w-6 h-6 border-2 border-muted/30 border-t-[#dc2743] rounded-full animate-spin inline-block mb-3" />
            <p className="text-sm font-medium">Generating facts...</p>
          </div>
        </div>
      )}
    </div>
  )
}

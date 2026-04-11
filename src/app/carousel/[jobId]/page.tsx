'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import InstagramPreview from '@/components/InstagramPreview';
import '@/components/instagram-preview.css';

// ─── Types ──────────────────────────────────────────────────

interface CarouselSlide {
  id: string;
  slideIndex: number;
  role: string;
  headline: string | null;
  body: string | null;
  supportingDetail: string | null;
  displayTitle: string | null;
  displaySupport: string | null;
  imageUrl: string | null;
  imageError: string | null;
  status: 'PENDING' | 'FAILED_IMAGE' | 'REGENERATING' | 'APPROVED';
}

interface CarouselJob {
  id: string;
  topic: string;
  direction: string | null;
  status: 'PENDING' | 'GENERATING' | 'RENDERING' | 'COMPLETE' | 'FAILED';
  approved: boolean;
  progress: { step?: string; message?: string; pct?: number } | null;
  errorMessage: string | null;
  slides: CarouselSlide[];
  caption: string | null;
  hashtags: string[];
}

interface ProgressEvent {
  step: string;
  message: string;
  pct: number;
  status?: string;
  slides?: { total: number; ready: number; failed: number };
}

// ─── Progress Steps ─────────────────────────────────────────

/** The 4 user-facing generation phases. */
const USER_STEPS = [
  { key: 'facts',  label: 'Finding facts' },
  { key: 'copy',   label: 'Writing copy' },
  { key: 'images', label: 'Creating images' },
  { key: 'checks', label: 'Final checks' },
] as const;

/** Map backend step names → user-facing phase index (0-3, or 4 = all done). */
function getActiveStepIndex(backendStep: string | undefined): number {
  if (!backendStep) return 0;
  switch (backendStep) {
    case 'hook':
    case 'knowledge':
      return 0; // Finding facts
    case 'pipeline':
    case 'quality':
    case 'narrative':
    case 'promise':
    case 'pipeline_done':
      return 1; // Writing copy (includes quality gates that run mid-pipeline)
    case 'render':
      return 2; // Creating images
    case 'saving':
      return 3; // Final checks
    case 'complete':
      return 4; // All done (past last step)
    default:
      return 0;
  }
}

// ─── Slide Status Display ───────────────────────────────────

type SlideDisplayStatus = 'READY' | 'RENDERED' | 'FAILED_IMAGE' | 'REGENERATING' | 'APPROVED' | 'GENERATING';

function getSlideDisplayStatus(slide: CarouselSlide, isJobGenerating?: boolean): SlideDisplayStatus {
  if (slide.status === 'APPROVED') return 'APPROVED';
  if (slide.status === 'REGENERATING') return 'REGENERATING';
  if (slide.status === 'FAILED_IMAGE') return 'FAILED_IMAGE';
  if (isJobGenerating) {
    // During active generation: distinguish "waiting" from "image done"
    if (!slide.imageUrl) return 'GENERATING';
    return 'RENDERED'; // image exists but generation still in progress
  }
  // Post-generation: binary ready/failed
  if (!slide.imageUrl) return 'FAILED_IMAGE';
  return 'READY';
}

const STATUS_CONFIG: Record<SlideDisplayStatus, { label: string; bgClass: string; textClass: string; dotClass: string }> = {
  READY: { label: 'Ready', bgClass: 'bg-blue-500/10', textClass: 'text-blue-400', dotClass: 'bg-blue-400' },
  RENDERED: { label: 'Rendered', bgClass: 'bg-success-dim', textClass: 'text-success', dotClass: 'bg-success' },
  GENERATING: { label: 'Generating...', bgClass: 'bg-accent/10', textClass: 'text-accent', dotClass: 'bg-accent animate-pulse' },
  FAILED_IMAGE: { label: 'Image failed', bgClass: 'bg-danger-dim', textClass: 'text-danger', dotClass: 'bg-danger' },
  REGENERATING: { label: 'Regenerating...', bgClass: 'bg-warning/10', textClass: 'text-warning', dotClass: 'bg-warning animate-pulse' },
  APPROVED: { label: 'Approved', bgClass: 'bg-success-dim', textClass: 'text-success', dotClass: 'bg-success' },
};

// ─── Error Translation ──────────────────────────────────────

/** Translate raw backend image errors into user-facing messages. */
function getUserFacingError(rawError: string): string {
  const lower = rawError.toLowerCase();

  // Provider / API unavailable
  if (lower.includes('failed_provider') || lower.includes('all providers failed') || lower.includes('failed after')) {
    return 'The image service is unavailable right now. Try again.';
  }

  // Rate limiting
  if (lower.includes('rate limit') || lower.includes('rate_limit') || lower.includes('429')) {
    return 'Image generation was rate-limited. Wait a moment, then try again.';
  }

  // Timeout / network
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('fetch failed') || lower.includes('econnrefused')) {
    return 'Image generation timed out. Try a new image.';
  }

  // Empty / no image returned
  if (lower.includes('returned no image') || lower.includes('empty response') || lower.includes('empty image') || lower.includes('no image data')) {
    return 'Image generation failed. Try a new image.';
  }

  // Content policy / safety
  if (lower.includes('content policy') || lower.includes('safety') || lower.includes('blocked') || lower.includes('moderation')) {
    return 'Image was blocked by content policy. Try redoing the slide.';
  }

  // Render / compositing failures
  if (lower.includes('failed at') || lower.includes('render') || lower.includes('readability_gate') || lower.includes('visual_presence')) {
    return 'The slide could not be rendered correctly. Try again.';
  }

  // Fallback
  return 'Image generation failed. Try a new image.';
}

// ─── Progress Screen (Screen B) ─────────────────────────────

function ProgressView({
  progress,
  error,
  slides,
}: {
  progress: ProgressEvent | null;
  error: string | null;
  slides: CarouselSlide[];
}) {
  const pct = progress?.pct ?? 0;
  const rawIndex = getActiveStepIndex(progress?.step);

  // Monotonic: never show a step earlier than the highest we've reached
  const highWaterRef = useRef(0);
  if (rawIndex > highWaterRef.current) {
    highWaterRef.current = rawIndex;
  }
  const activeIndex = highWaterRef.current;

  // Are we in the image rendering phase (where progressive slides appear)?
  const isRenderPhase = activeIndex >= 2; // "Creating images" or later
  const hasSlides = slides.length > 0;

  // Stall detection: if step+pct unchanged for 60s, warn the user
  const [stalled, setStalled] = useState(false);
  const lastChangeRef = useRef({ step: progress?.step, pct, time: Date.now() });

  useEffect(() => {
    const currentStep = progress?.step;
    const currentPct = progress?.pct ?? 0;

    // Reset timer when progress actually changes
    if (currentStep !== lastChangeRef.current.step || currentPct !== lastChangeRef.current.pct) {
      lastChangeRef.current = { step: currentStep, pct: currentPct, time: Date.now() };
      setStalled(false);
    }

    const timer = setInterval(() => {
      if (Date.now() - lastChangeRef.current.time >= 60_000) {
        setStalled(true);
      }
    }, 5_000);

    return () => clearInterval(timer);
  }, [progress?.step, progress?.pct]);

  // Compute slide readiness for the counter
  const readyCount = slides.filter(s => s.imageUrl).length;
  const totalCount = slides.length;

  return (
    <div className="animate-fade-up">
      {/* Compact header + stepper (narrows when slides are visible) */}
      <div className={`mx-auto ${isRenderPhase && hasSlides ? 'max-w-5xl px-6' : 'max-w-md mt-24'}`}>
        <h1 className={`text-xl font-bold tracking-tight mb-2 ${isRenderPhase && hasSlides ? '' : 'text-center'}`}>
          Generating your carousel
        </h1>
        <p className={`text-sm text-muted mb-6 ${isRenderPhase && hasSlides ? '' : 'text-center mb-10'}`}>
          {stalled ? '' : isRenderPhase && hasSlides
            ? `${readyCount}/${totalCount} slides rendered`
            : 'Usually takes 30\u201360 seconds'}
        </p>

        {/* Step stepper — compact row when slides visible, vertical when not */}
        {isRenderPhase && hasSlides ? (
          <div className="flex items-center gap-4 mb-6">
            {USER_STEPS.map((step, i) => {
              let state: 'completed' | 'active' | 'upcoming';
              if (i < activeIndex) state = 'completed';
              else if (i === activeIndex) state = 'active';
              else state = 'upcoming';

              return (
                <div key={step.key} className="flex items-center gap-1.5">
                  {state === 'completed' ? (
                    <div className="w-4 h-4 rounded-full bg-success/20 flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-success" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  ) : state === 'active' ? (
                    <div className="w-4 h-4 rounded-full bg-accent/20 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    </div>
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-surface-elevated flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted/40" />
                    </div>
                  )}
                  <span className={`text-xs ${
                    state === 'completed' ? 'text-success' :
                    state === 'active' ? 'text-foreground font-medium' :
                    'text-muted'
                  }`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4 mb-8">
            {USER_STEPS.map((step, i) => {
              let state: 'completed' | 'active' | 'upcoming';
              if (i < activeIndex) state = 'completed';
              else if (i === activeIndex) state = 'active';
              else state = 'upcoming';

              return (
                <div key={step.key} className="flex items-center gap-3">
                  {state === 'completed' ? (
                    <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-success" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  ) : state === 'active' ? (
                    <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-surface-elevated flex items-center justify-center flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-muted/40" />
                    </div>
                  )}
                  <span className={`text-sm ${
                    state === 'completed' ? 'text-success' :
                    state === 'active' ? 'text-foreground font-medium' :
                    'text-muted'
                  }`}>
                    {step.label}{state === 'active' ? '...' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Progress bar */}
        <div className="h-1 bg-surface-elevated rounded-full overflow-hidden mb-6">
          <div
            className="h-full bg-accent/60 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${Math.max(pct, 3)}%` }}
          />
        </div>
      </div>

      {/* Progressive slide grid — shown during render phase */}
      {isRenderPhase && hasSlides && (
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {slides.map((slide) => {
              const displayStatus = getSlideDisplayStatus(slide, true);
              const statusCfg = STATUS_CONFIG[displayStatus];
              const roleColors: Record<string, string> = {
                OPENER: 'text-accent',
                FACT: 'text-violet',
                IMPLICATION: 'text-warning',
                CTA: 'text-success',
              };

              return (
                <div
                  key={slide.id}
                  className="bg-surface border border-border rounded-lg overflow-hidden animate-scale-in"
                >
                  {/* Image area */}
                  <div className="aspect-[4/5] bg-surface-elevated relative">
                    {slide.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={slide.imageUrl}
                        alt={`Slide ${slide.slideIndex + 1}`}
                        className="w-full h-full object-cover animate-fade-up"
                      />
                    ) : displayStatus === 'GENERATING' ? (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                        <div className="animate-spin h-5 w-5 border-2 border-accent border-t-transparent rounded-full" />
                        <span className="text-xs text-muted">Generating...</span>
                      </div>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-danger/5">
                        <span className="text-danger text-lg">!</span>
                        <span className="text-danger text-[10px] text-center px-2">Failed</span>
                      </div>
                    )}

                    {/* Role badge */}
                    <div className="absolute top-2 left-2">
                      <span className={`text-[10px] font-bold tracking-wider uppercase ${roleColors[slide.role] || 'text-muted-light'}`}>
                        {slide.role}
                      </span>
                    </div>

                    {/* Slide number */}
                    <div className="absolute top-2 right-2 w-5 h-5 bg-background/80 backdrop-blur-sm rounded-full flex items-center justify-center">
                      <span className="text-[10px] font-bold text-foreground">{slide.slideIndex + 1}</span>
                    </div>
                  </div>

                  {/* Status strip */}
                  <div className={`px-2 py-1 flex items-center gap-1.5 ${statusCfg.bgClass}`}>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusCfg.dotClass}`} />
                    <span className={`text-[10px] font-medium ${statusCfg.textClass}`}>
                      {statusCfg.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stall warning */}
      <div className={`mx-auto ${isRenderPhase && hasSlides ? 'max-w-5xl px-6' : 'max-w-md'}`}>
        {stalled && !error && (
          <div className="mt-6 px-4 py-3 bg-warning-dim border border-warning/20 rounded-lg text-sm">
            <p className="text-warning font-medium mb-1">This is taking longer than expected.</p>
            <p className="text-muted-light text-xs mb-3">You can wait a little longer or refresh and try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="text-xs text-warning underline underline-offset-2 hover:text-warning/80"
            >
              Refresh page
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-6 px-4 py-3 bg-danger-dim border border-danger/20 rounded-lg text-sm">
            <p className="text-danger font-medium mb-1">Generation failed</p>
            <p className="text-danger/70 text-xs mb-3">Something went wrong while creating your carousel.</p>
            <a
              href="/carousel"
              className="text-xs text-danger underline underline-offset-2 hover:text-danger/80"
            >
              Try again
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Slide Card ─────────────────────────────────────────────

function SlideCard({
  slide,
  onRegenCopy,
  onRegenImage,
  onRegenFull,
  isRegenerating,
}: {
  slide: CarouselSlide;
  onRegenCopy: () => void;
  onRegenImage: () => void;
  onRegenFull: () => void;
  isRegenerating: boolean;
}) {
  const roleColors: Record<string, string> = {
    OPENER: 'text-accent',
    FACT: 'text-violet',
    IMPLICATION: 'text-warning',
    CTA: 'text-success',
  };

  const displayStatus = isRegenerating ? 'REGENERATING' : getSlideDisplayStatus(slide, false);
  const statusConfig = STATUS_CONFIG[displayStatus];
  const isFailed = displayStatus === 'FAILED_IMAGE';

  return (
    <div
      className={`bg-surface border rounded-xl overflow-hidden animate-scale-in flex flex-col ${
        isFailed ? 'border-danger/40 border-l-4 border-l-danger bg-danger/[0.02]' : 'border-border'
      }`}
      {...(isFailed ? { 'data-slide-failed': '' } : {})}
    >
      {/* Image preview */}
      <div className="aspect-[4/5] bg-surface-elevated relative">
        {slide.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slide.imageUrl}
            alt={`Slide ${slide.slideIndex + 1}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className={`w-full h-full flex flex-col items-center justify-center gap-2 px-4 ${
            isFailed ? 'bg-danger/5' : ''
          }`}>
            {isFailed ? (
              <>
                <span className="text-danger text-2xl">!</span>
                <span className="text-danger text-xs text-center font-medium">
                  {slide.imageError ? getUserFacingError(slide.imageError) : 'Image failed'}
                </span>
              </>
            ) : (
              <span className="text-muted text-sm">No image</span>
            )}
          </div>
        )}

        {/* Role badge */}
        <div className="absolute top-3 left-3">
          <span className={`text-xs font-bold tracking-wider uppercase ${roleColors[slide.role] || 'text-muted-light'}`}>
            {slide.role}
          </span>
        </div>

        {/* Slide number */}
        <div className="absolute top-3 right-3 w-7 h-7 bg-background/80 backdrop-blur-sm rounded-full flex items-center justify-center">
          <span className="text-xs font-bold text-foreground">{slide.slideIndex + 1}</span>
        </div>
      </div>

      {/* Status strip — only shown for actionable states */}
      {(displayStatus === 'GENERATING' || displayStatus === 'REGENERATING' || displayStatus === 'FAILED_IMAGE' || displayStatus === 'APPROVED') && (
        <div className={`px-3 py-1.5 flex items-center gap-2 ${statusConfig.bgClass}`}>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusConfig.dotClass}`} />
          <span className={`text-xs font-medium ${statusConfig.textClass}`}>
            {statusConfig.label}
          </span>
        </div>
      )}

      {/* Inline error reason for failed slides */}
      {isFailed && slide.imageError && (
        <div className="px-3 py-2 bg-danger/5 border-t border-danger/10">
          <p className="text-xs text-danger/80 leading-snug">
            {getUserFacingError(slide.imageError)}
          </p>
        </div>
      )}

      {/* Content — hide text for FACT/CTA slides where it's already baked into the image */}
      <div className="p-4 flex-1 flex flex-col">
        {!((slide.role === 'OPENER' || slide.role === 'FACT' || slide.role === 'CTA') && slide.imageUrl) && (
          <>
            <h3 className="text-sm font-semibold text-foreground mb-1 line-clamp-2">
              {slide.displayTitle || slide.headline || '—'}
            </h3>
            <p className="text-xs text-muted-light mb-4 line-clamp-2 flex-1">
              {slide.displaySupport || slide.body?.slice(0, 100) || '—'}
            </p>
          </>
        )}

        {/* Action buttons */}
        <div className="flex gap-1.5">
          <div className="flex-1 flex flex-col gap-1">
            <button
              onClick={onRegenCopy}
              disabled={isRegenerating}
              className="w-full h-8 px-2 text-xs bg-surface-elevated border border-border rounded-md hover:bg-surface-hover hover:border-border-hover disabled:opacity-40 transition-colors"
              title="Regenerate headline and body text"
            >
              Rewrite text
            </button>
            <span className="text-[10px] text-muted text-center leading-tight">Keeps image</span>
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <button
              onClick={onRegenImage}
              disabled={isRegenerating}
              className={`w-full h-8 px-2 text-xs rounded-md disabled:opacity-40 transition-colors ${
                isFailed
                  ? 'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20 font-semibold'
                  : 'bg-surface-elevated border border-border hover:bg-surface-hover hover:border-border-hover'
              }`}
              title="Generate a new image for this slide"
            >
              New image
            </button>
            <span className="text-[10px] text-muted text-center leading-tight">Keeps text</span>
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <button
              onClick={onRegenFull}
              disabled={isRegenerating}
              className="w-full h-8 px-2 text-xs bg-violet-dim text-violet border border-violet/20 rounded-md hover:bg-violet/20 disabled:opacity-40 transition-colors"
              title="Regenerate everything for this slide"
            >
              Redo slide
            </button>
            <span className="text-[10px] text-muted text-center leading-tight">Replaces everything</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Decision Bar (sticky bottom) ───────────────────────────

function DecisionBar({
  readyCount,
  failedCount,
  total,
  approved,
  needsReapproval,
  isProcessing,
  onApprove,
  onPreview,
  onJumpToIssue,
}: {
  readyCount: number;
  failedCount: number;
  total: number;
  approved: boolean;
  needsReapproval: boolean;
  isProcessing: boolean;
  onApprove: () => void;
  onPreview: () => void;
  onJumpToIssue: () => void;
}) {
  const allReady = failedCount === 0;

  // Determine button state
  let buttonLabel: string;
  let buttonAction: () => void;
  let buttonDisabled: boolean;
  let buttonClass: string;

  if (approved) {
    buttonLabel = 'Preview Post';
    buttonAction = onPreview;
    buttonDisabled = false;
    buttonClass = 'bg-success/90 text-background hover:bg-success disabled:opacity-40';
  } else if (allReady) {
    buttonLabel = isProcessing ? 'Approving...' : 'Approve All';
    buttonAction = onApprove;
    buttonDisabled = isProcessing;
    buttonClass = 'bg-accent text-background hover:bg-accent-hover disabled:opacity-40';
  } else {
    buttonLabel = 'Fix slides to approve';
    buttonAction = () => {};
    buttonDisabled = true;
    buttonClass = 'bg-surface-elevated text-muted border border-border opacity-40 cursor-not-allowed';
  }

  // Readiness text
  let readinessText: React.ReactNode;
  if (approved) {
    readinessText = <span className="text-success font-medium">Carousel approved</span>;
  } else if (failedCount === total) {
    // All slides failed — no usable output
    readinessText = <span className="text-danger font-medium">No usable slides — all {total} failed</span>;
  } else if (failedCount > 0) {
    readinessText = (
      <span>
        <span className="text-blue-400 font-medium">{readyCount}/{total} ready</span>
        <span className="mx-2 text-border">·</span>
        <span className="text-danger font-medium">{failedCount} need attention</span>
      </span>
    );
  } else {
    readinessText = <span className="text-success font-medium">All {total} slides ready</span>;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
        <div className="text-sm flex items-center gap-3 flex-wrap">
          <div>{readinessText}</div>
          {needsReapproval && !approved && (
            <span className="text-xs text-warning">Changes made — re-approval required</span>
          )}
          {failedCount > 0 && !approved && (
            <button
              onClick={onJumpToIssue}
              className="text-xs text-danger underline underline-offset-2 hover:text-danger/80"
            >
              Jump to first issue
            </button>
          )}
        </div>
        <button
          onClick={buttonAction}
          disabled={buttonDisabled}
          className={`w-full sm:w-auto h-11 px-6 font-semibold rounded-lg text-sm transition-colors whitespace-nowrap ${buttonClass}`}
        >
          {isProcessing && (
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 inline-block" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-25" />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

// ─── Review Screen (Screen C) ───────────────────────────────

function ReviewView({
  job,
  onRefresh,
  onTransitionToPreview,
}: {
  job: CarouselJob;
  onRefresh: () => void;
  onTransitionToPreview: () => void;
}) {
  const [regenerating, setRegenerating] = useState<Record<number, boolean>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedSlide, setSelectedSlide] = useState(0);
  const [needsReapproval, setNeedsReapproval] = useState(false);

  // Auto-dismiss status messages
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't capture if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft' && selectedSlide > 0) {
        e.preventDefault();
        setSelectedSlide(s => s - 1);
      }
      if (e.key === 'ArrowRight' && selectedSlide < job.slides.length - 1) {
        e.preventDefault();
        setSelectedSlide(s => s + 1);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedSlide, job.slides.length]);

  // Compute slide health
  const failedSlides = job.slides.filter(s => s.status === 'FAILED_IMAGE' || !s.imageUrl);
  const readyCount = job.slides.length - failedSlides.length;

  // Current slide
  const currentSlide = job.slides[selectedSlide];

  const handleRegen = useCallback(async (slideIndex: number, mode: 'copy' | 'image' | 'full') => {
    setRegenerating(prev => ({ ...prev, [slideIndex]: true }));
    setMessage('');

    try {
      const res = await fetch(`/api/carousel/${job.id}/regenerate-slide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slideIndex, mode }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Regeneration failed');
      }

      // Backend resets job.approved=false; refresh picks up new state
      if (job.approved) {
        setNeedsReapproval(true);
      }
      onRefresh();
      setMessage(`Slide ${slideIndex + 1} ${mode} regenerated`);
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setRegenerating(prev => ({ ...prev, [slideIndex]: false }));
    }
  }, [job.id, job.approved, onRefresh]);

  // Approve flow — approves slides, then transitions to preview
  const handleApprove = useCallback(async () => {
    setIsProcessing(true);
    setMessage('');

    try {
      const approveRes = await fetch(`/api/carousel/${job.id}/approve`, { method: 'POST' });
      if (!approveRes.ok) {
        const data = await approveRes.json();
        throw new Error(data.error || 'Approval failed');
      }

      setNeedsReapproval(false);
      await onRefresh();
      setMessage('Carousel approved — generating post copy...');

      // Trigger caption generation, then move to preview
      onTransitionToPreview();
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setIsProcessing(false);
    }
  }, [job.id, onRefresh, onTransitionToPreview]);

  // Jump to first failed slide — selects it instead of scrolling
  const handleJumpToIssue = useCallback(() => {
    const firstFailedIndex = job.slides.findIndex(s => s.status === 'FAILED_IMAGE' || !s.imageUrl);
    if (firstFailedIndex >= 0) {
      setSelectedSlide(firstFailedIndex);
    }
  }, [job.slides]);

  // Preview button — transitions to Instagram mockup
  const handlePreview = useCallback(() => {
    onTransitionToPreview();
  }, [onTransitionToPreview]);

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">{job.topic}</h1>
        {failedSlides.length === job.slides.length ? (
          <p className="text-sm text-danger mt-1">Generation finished — no usable slides were produced</p>
        ) : failedSlides.length > 0 ? (
          <p className="text-sm text-warning mt-1">Generation finished — {failedSlides.length} slide{failedSlides.length > 1 ? 's' : ''} need attention</p>
        ) : null}
      </div>

      {/* Status message */}
      {message && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${
          message.startsWith('Error') ? 'bg-danger-dim text-danger' : 'bg-success-dim text-success'
        }`}>
          {message}
        </div>
      )}

      {/* Focused slide view */}
      <div className="flex flex-col items-center pb-24">

        {/* Navigation bar */}
        <div className="flex items-center gap-4 mb-4 w-full max-w-sm">
          <button
            onClick={() => setSelectedSlide(s => s - 1)}
            disabled={selectedSlide === 0}
            className="py-1.5 px-3 text-sm bg-surface border border-border rounded-lg hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous slide"
          >
            &larr; Prev
          </button>
          <span className="flex-1 text-center text-sm text-muted-light">
            Slide {selectedSlide + 1} of {job.slides.length}
          </span>
          <button
            onClick={() => setSelectedSlide(s => s + 1)}
            disabled={selectedSlide === job.slides.length - 1}
            className="py-1.5 px-3 text-sm bg-surface border border-border rounded-lg hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Next slide"
          >
            Next &rarr;
          </button>
        </div>

        {/* Large slide preview */}
        {currentSlide && (
          <div className="w-full max-w-sm">
            <SlideCard
              slide={currentSlide}
              onRegenCopy={() => handleRegen(currentSlide.slideIndex, 'copy')}
              onRegenImage={() => handleRegen(currentSlide.slideIndex, 'image')}
              onRegenFull={() => handleRegen(currentSlide.slideIndex, 'full')}
              isRegenerating={!!regenerating[currentSlide.slideIndex]}
            />
          </div>
        )}

        {/* Thumbnail filmstrip */}
        <div className="flex gap-2 mt-6 px-4 overflow-x-auto max-w-full scrollbar-hide">
          {job.slides.map((slide, i) => {
            const status = getSlideDisplayStatus(slide, false);
            const isActive = i === selectedSlide;
            const isFailed = status === 'FAILED_IMAGE';
            const isRegen = !!regenerating[slide.slideIndex];
            return (
              <button
                key={slide.id}
                onClick={() => setSelectedSlide(i)}
                className={`w-14 h-[70px] rounded-lg overflow-hidden flex-shrink-0 transition-all ${
                  isActive
                    ? 'ring-2 ring-accent ring-offset-2 ring-offset-background'
                    : isFailed
                      ? 'ring-2 ring-danger/60'
                      : isRegen
                        ? 'ring-2 ring-warning/60'
                        : 'ring-1 ring-border hover:ring-border-hover'
                }`}
                aria-label={`Select slide ${i + 1}`}
              >
                {slide.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={slide.imageUrl}
                    alt={`Slide ${i + 1} thumbnail`}
                    className={`w-full h-full object-cover ${isActive ? '' : 'opacity-70 hover:opacity-100'}`}
                  />
                ) : (
                  <div className={`w-full h-full flex items-center justify-center text-xs font-medium ${
                    isFailed
                      ? 'bg-danger/10 text-danger'
                      : 'bg-surface-elevated text-muted'
                  }`}>
                    {i + 1}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sticky decision bar */}
      <DecisionBar
        readyCount={readyCount}
        failedCount={failedSlides.length}
        total={job.slides.length}
        approved={job.approved}
        needsReapproval={needsReapproval}
        isProcessing={isProcessing}
        onApprove={handleApprove}
        onPreview={handlePreview}
        onJumpToIssue={handleJumpToIssue}
      />
    </div>
  );
}

// ─── Preview Screen (Screen D — Instagram Mockup) ───────────

function PreviewView({
  job,
  onBack,
}: {
  job: CarouselJob;
  onBack: () => void;
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');

  const slideImages = job.slides
    .filter(s => s.imageUrl)
    .map(s => s.imageUrl as string);

  const caption = job.caption || `${job.topic}\n\nSwipe to learn more.`;
  const hashtags = job.hashtags?.length > 0
    ? job.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')
    : undefined;

  const handleDownload = useCallback(async () => {
    setIsExporting(true);
    setExportMessage('');

    try {
      const res = await fetch(`/api/carousel/${job.id}/export`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Export failed');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `carousel_${job.id.slice(0, 8)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportMessage('Download complete');
    } catch (err) {
      setExportMessage(`Error: ${err instanceof Error ? err.message : 'Export failed'}`);
    } finally {
      setIsExporting(false);
    }
  }, [job.id]);

  return (
    <div className="animate-fade-up pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Post Preview</h1>
          <p className="text-sm text-muted-light mt-1">
            Review your carousel as it will appear on Instagram
          </p>
        </div>
        <button
          onClick={onBack}
          className="py-2 px-4 text-sm bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors"
        >
          &larr; Back to slides
        </button>
      </div>

      {/* Instagram Mockup */}
      <div className="flex justify-center">
        <InstagramPreview
          username="Your Profile"
          slides={slideImages}
          caption={caption}
          hashtags={hashtags}
          likesCount="0"
          timestamp="Just now"
        />
      </div>

      {/* Export bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="text-sm">
            <span className="text-success font-medium">Carousel approved</span>
            {exportMessage && (
              <p className={`text-xs mt-1 ${exportMessage.startsWith('Error') ? 'text-danger' : 'text-success'}`}>
                {exportMessage}
              </p>
            )}
          </div>
          <button
            onClick={handleDownload}
            disabled={isExporting}
            className="py-2.5 px-6 font-semibold rounded-lg text-sm transition-colors whitespace-nowrap bg-accent text-background hover:bg-accent-hover disabled:opacity-40"
          >
            {isExporting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 inline-block" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-25" />
                  <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Downloading...
              </>
            ) : (
              'Download ZIP'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────

export default function CarouselJobPage() {
  const params = useParams();
  const jobId = params.jobId as string;

  const [job, setJob] = useState<CarouselJob | null>(null);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'progress' | 'review' | 'preview'>('progress');
  const [partialSlides, setPartialSlides] = useState<CarouselSlide[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const slidesPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch job data
  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/carousel/${jobId}`);
      if (!res.ok) throw new Error('Failed to fetch job');
      const data: CarouselJob = await res.json();
      setJob(data);

      if (data.status === 'COMPLETE' || data.status === 'FAILED') {
        // If already approved with caption, go straight to preview
        if (data.approved && data.caption) {
          setPhase('preview');
        } else {
          setPhase('review');
        }
        // Stop slide polling when complete
        if (slidesPollRef.current) {
          clearInterval(slidesPollRef.current);
          slidesPollRef.current = null;
        }
        if (data.status === 'FAILED') {
          setError(data.errorMessage || 'Generation failed');
        }
      }

      // Update partial slides from full job data
      if (data.slides?.length > 0) {
        setPartialSlides(data.slides);
      }

      return data;
    } catch {
      setError('Failed to load carousel');
      return null;
    }
  }, [jobId]);

  // SSE connection for progress + slide polling during render
  useEffect(() => {
    // First check current status
    fetchJob().then(data => {
      if (data && (data.status === 'COMPLETE' || data.status === 'FAILED')) {
        return; // Already done, no need for SSE
      }

      // Start SSE
      const es = new EventSource(`/api/carousel/${jobId}/status`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data: ProgressEvent = JSON.parse(event.data);
          setProgress(data);

          // When entering render phase or slide counts change, poll for slides
          if (data.slides && data.slides.total > 0 && !slidesPollRef.current) {
            // Fetch immediately then poll every 2s
            fetchJob();
            slidesPollRef.current = setInterval(() => {
              fetchJob();
            }, 2000);
          }

          if (data.status === 'COMPLETE') {
            es.close();
            fetchJob();
          } else if (data.status === 'FAILED' || data.step === 'error') {
            es.close();
            setError(data.message);
            fetchJob();
          }
        } catch {}
      };

      es.onerror = () => {
        es.close();
        // Fetch final state
        fetchJob();
      };
    });

    return () => {
      eventSourceRef.current?.close();
      if (slidesPollRef.current) {
        clearInterval(slidesPollRef.current);
        slidesPollRef.current = null;
      }
    };
  }, [jobId, fetchJob]);

  // Transition to preview: generate caption then switch phase
  const handleTransitionToPreview = useCallback(async () => {
    if (!job) return;

    // Generate caption if not already present
    if (!job.caption) {
      try {
        await fetch(`/api/carousel/${job.id}/generate-caption`, { method: 'POST' });
        await fetchJob();
      } catch {
        // Caption generation failed — still show preview with empty caption
      }
    }

    setPhase('preview');
  }, [job, fetchJob]);

  // Show progress screen until complete
  if (phase === 'progress' && (!job || job.status === 'PENDING' || job.status === 'GENERATING' || job.status === 'RENDERING')) {
    return <ProgressView progress={progress} error={error} slides={partialSlides} />;
  }

  // Error state
  if (error && !job?.slides?.length) {
    return (
      <div className="max-w-md mx-auto mt-24">
        <div className="px-4 py-6 bg-danger-dim border border-danger/20 rounded-xl text-center">
          <h2 className="text-lg font-bold text-danger mb-2">Generation failed</h2>
          <p className="text-sm text-danger/70">Something went wrong while creating your carousel.</p>
          <a
            href="/carousel"
            className="inline-block mt-4 py-2 px-4 bg-surface border border-border rounded-lg text-sm text-foreground hover:bg-surface-hover"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  // Instagram preview screen (after approval)
  if (phase === 'preview' && job && job.slides.length > 0) {
    return (
      <PreviewView
        job={job}
        onBack={() => setPhase('review')}
      />
    );
  }

  // Review screen
  if (job && job.slides.length > 0) {
    return (
      <ReviewView
        job={job}
        onRefresh={fetchJob}
        onTransitionToPreview={handleTransitionToPreview}
      />
    );
  }

  // Loading
  return (
    <div className="flex items-center justify-center mt-24">
      <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
    </div>
  );
}

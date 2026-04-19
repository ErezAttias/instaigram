'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import InstagramPreview from '@/components/InstagramPreview';
import '@/components/instagram-preview.css';
import { CarouselDesignPanel, type LiveDesign } from '@/components/carousel/CarouselDesignPanel';
import { ImageEditPanel } from '@/components/carousel/ImageEditPanel';

// Mirror of CarouselDesignPanel's DEFAULTS resolved to a concrete LiveDesign
// so slides can render their text overlay before channel visual style loads
// (e.g. during generation). Once the real design is fetched it replaces this.
const DEFAULT_LIVE_DESIGN: LiveDesign = {
  titleFontFamily: 'Inter',
  titleFontWeightDefault: 800,
  titleSizePx: 72,
  titleAlign: 'left',
  titleWeight: 800,
  titleColor: '#FFFFFF',
  bodyFontFamily: 'Inter',
  bodyFontWeightDefault: 400,
  bodySizePx: 40,
  bodyAlign: 'left',
  bodyWeight: 400,
  bodyColor: '#D0D0D0',
};

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
  hasEmbeddedText: boolean;
  imageError: string | null;
  imagePromptOverride: string | null;
  status: 'PENDING' | 'FAILED_IMAGE' | 'REGENERATING' | 'APPROVED';
}

interface CarouselJob {
  id: string;
  channelId: string | null;
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

              return (
                <div
                  key={slide.id}
                  className="bg-surface border border-border rounded-lg overflow-hidden animate-scale-in"
                >
                  {/* Image area */}
                  <div
                    className="aspect-[4/5] bg-surface-elevated relative"
                    style={slide.imageUrl && !slide.hasEmbeddedText ? { containerType: 'inline-size' } : undefined}
                  >
                    {slide.imageUrl ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={slide.imageUrl}
                          alt={`Slide ${slide.slideIndex + 1}`}
                          className="w-full h-full object-cover animate-fade-up"
                        />
                        {!slide.hasEmbeddedText && (
                          <>
                            {/* Matches the review-mode gradient so generating
                                slides don't look broken with an empty strip. */}
                            <div
                              aria-hidden="true"
                              className="absolute inset-x-0"
                              style={{
                                top: '35%',
                                bottom: 0,
                                background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.25) 28%, rgba(0,0,0,0.65) 48%, rgba(0,0,0,0.90) 62%, rgba(0,0,0,1) 75%, rgba(0,0,0,1) 100%)',
                              }}
                            />
                            <LiveTextOverlay
                              design={DEFAULT_LIVE_DESIGN}
                              title={slide.displayTitle || slide.headline || ''}
                              body={
                                slide.role === 'FACT' || slide.role === 'IMPLICATION' || slide.role === 'OPENER'
                                  ? (slide.displaySupport || slide.body || '')
                                  : ''
                              }
                              isOpener={slide.role === 'OPENER'}
                            />
                          </>
                        )}
                      </>
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
              href="/admin"
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

// ─── Editable text — click-to-edit with save-on-blur ────────

/**
 * Click-to-edit display for slide headline/body on the viewer. Shows the
 * current value as plain text until clicked, then flips into a textarea
 * (or input for single-line). Blur/Enter saves; Escape cancels.
 */
// ─── Slide Card ─────────────────────────────────────────────

function SlideCard({
  slide,
  liveDesign,
  selection,
  onSelect,
  onSaveText,
  onRegenerateImage,
  isRegenerating,
}: {
  slide: CarouselSlide;
  liveDesign: LiveDesign | null;
  selection?: 'title' | 'body' | 'image';
  onSelect?: (s: 'title' | 'body' | 'image') => void;
  onSaveText: (patch: { displayTitle?: string; displaySupport?: string }) => Promise<void> | void;
  onRegenerateImage: (opts: { promptOverride?: string }) => Promise<void> | void;
  isRegenerating: boolean;
}) {
  const displayStatus = isRegenerating ? 'REGENERATING' : getSlideDisplayStatus(slide, false);
  const statusConfig = STATUS_CONFIG[displayStatus];
  const isFailed = displayStatus === 'FAILED_IMAGE';
  const isOpener = slide.role === 'OPENER';
  const hasSecondary = slide.role === 'FACT' || slide.role === 'IMPLICATION' || isOpener;
  const [showTextEditor, setShowTextEditor] = useState(false);

  // `slide.imageUrl` now points at the raw (text-free) image; text is drawn
  // as a CSS overlay. Compositing to a flat PNG happens on demand at publish.
  // Legacy carousels have text baked into the stored image — skip the overlay
  // for those so we don't double-render text.
  // Always render the text overlay when we have a raw image — fall back to
  // the default design so the slide never looks half-finished (empty gradient)
  // while the channel visual style is still loading.
  const resolvedDesign = liveDesign ?? DEFAULT_LIVE_DESIGN;
  const useLivePreview = !!slide.imageUrl && !slide.hasEmbeddedText;
  const titleText = slide.displayTitle || slide.headline || '';
  const bodyText = hasSecondary ? (slide.displaySupport || slide.body || '') : '';

  return (
    <div
      className={`bg-surface border rounded-xl overflow-hidden animate-scale-in flex flex-col ${
        isFailed ? 'border-danger/40 border-l-4 border-l-danger bg-danger/[0.02]' : 'border-border'
      }`}
      {...(isFailed ? { 'data-slide-failed': '' } : {})}
    >
      {/* Image preview — clicking empty space selects the image element so the
          side panel shows image tools. Clicking the title/body overlays selects
          those instead. Double-clicking a text overlay still opens the editor. */}
      <button
        type="button"
        onClick={() => {
          if (isRegenerating || !slide.imageUrl) return;
          if (onSelect) onSelect('image');
          else setShowTextEditor(true);
        }}
        disabled={isRegenerating || !slide.imageUrl}
        aria-label="Select slide image"
        data-selected={selection === 'image' ? '' : undefined}
        className={`group aspect-[4/5] bg-surface-elevated relative block w-full text-left disabled:cursor-default rounded-none p-0 transition-shadow ${
          selection === 'image' ? 'ring-2 ring-[#dc2743] ring-inset' : ''
        }`}
        style={{
          ...(useLivePreview ? { containerType: 'inline-size' as const } : {}),
          viewTransitionName: 'slide-image',
        }}
      >
        {slide.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slide.imageUrl}
              alt={`Slide ${slide.slideIndex + 1}`}
              className="w-full h-full object-cover"
            />
            {/* Gradient — always rendered, aggressive enough to ensure text
                readability on any image including bright/light backgrounds. */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0"
              style={{
                top: '35%',
                bottom: 0,
                background: [
                  'linear-gradient(to bottom,',
                  '  rgba(0,0,0,0) 0%,',
                  '  rgba(0,0,0,0.03) 8%,',
                  '  rgba(0,0,0,0.10) 18%,',
                  '  rgba(0,0,0,0.25) 28%,',
                  '  rgba(0,0,0,0.45) 38%,',
                  '  rgba(0,0,0,0.65) 48%,',
                  '  rgba(0,0,0,0.80) 55%,',
                  '  rgba(0,0,0,0.90) 62%,',
                  '  rgba(0,0,0,0.96) 68%,',
                  '  rgba(0,0,0,1) 75%,',
                  '  rgba(0,0,0,1) 100%)',
                ].join(' '),
              }}
            />
            {useLivePreview && (
              <LiveTextOverlay
                design={resolvedDesign}
                title={titleText}
                body={bodyText}
                isOpener={isOpener}
                selection={selection}
                onSelect={onSelect}
                onSaveText={onSaveText}
              />
            )}
          </>
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

        {/* Hover affordance — hints what tapping the element will do. */}
        {slide.imageUrl && !isRegenerating && selection !== 'image' && (
          <div className="absolute inset-0 flex items-start justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity pointer-events-none">
            <div className="m-3 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur-sm text-[11px] font-semibold text-foreground flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
              Tap elements to edit
            </div>
          </div>
        )}

        {/* Slide number */}
        <div className="absolute top-3 right-3 w-7 h-7 bg-background/80 backdrop-blur-sm rounded-full flex items-center justify-center">
          <span className="text-xs font-bold text-foreground">{slide.slideIndex + 1}</span>
        </div>

        {/* Regenerating — floating glass pill with a spinning ring, overlaid
            on the image so it reads as an in-progress state rather than a
            warning strip. Auto-disappears once the new image arrives. */}
        {displayStatus === 'REGENERATING' && (
          <>
            <div aria-hidden="true" className="absolute inset-0 bg-background/35 backdrop-blur-[1px]" />
            <div aria-hidden="true" className="absolute inset-0 shimmer-overlay pointer-events-none" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="inline-flex items-center gap-2 px-3 h-8 rounded-full bg-background/80 backdrop-blur-md border border-white/10 shadow-lg animate-pop-in">
                <span className="w-3.5 h-3.5 border-[1.5px] border-foreground/30 border-t-foreground rounded-full animate-spin" />
                <span className="text-[11px] font-semibold text-foreground">Regenerating</span>
              </div>
            </div>
          </>
        )}
      </button>

      {/* Status strip — only for non-regen actionable states */}
      {(displayStatus === 'GENERATING' || displayStatus === 'FAILED_IMAGE' || displayStatus === 'APPROVED') && (
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

      {showTextEditor && (
        <SlideTextEditor
          title={slide.displayTitle || slide.headline || ''}
          body={hasSecondary ? (slide.displaySupport || slide.body || '') : null}
          bodyLabel={isOpener ? 'Swipe CTA' : 'Body'}
          bodyHint={isOpener ? 'Short invite shown below the title in the paragraph font.' : undefined}
          bodyMultiline={!isOpener}
          initialPrompt={slide.imagePromptOverride ?? ''}
          onClose={() => setShowTextEditor(false)}
          onSave={async patch => {
            await onSaveText(patch);
            setShowTextEditor(false);
          }}
          onRegenerateImage={async opts => {
            await onRegenerateImage(opts);
            setShowTextEditor(false);
          }}
        />
      )}
    </div>
  );
}

// Real-time CSS overlay that mirrors the server's text-compositor layout so
// the preview matches the exported image. Server canvas is 1080×1350 with
// PAD=65, text zone = bottom ~35% centered vertically. We express everything
// in cqw (= 1% of this card's rendered width) so the math stays 1:1 with the
// server's pixel math regardless of how wide the preview is drawn.
function LiveTextOverlay({
  design,
  title,
  body,
  isOpener,
  selection,
  onSelect,
  onSaveText,
}: {
  design: LiveDesign;
  title: string;
  body: string;
  isOpener: boolean;
  selection?: 'title' | 'body' | 'image';
  onSelect?: (s: 'title' | 'body' | 'image') => void;
  onSaveText?: (patch: { displayTitle?: string; displaySupport?: string }) => Promise<void> | void;
}) {
  // Inline editing: double-click the title or body on the slide to edit it
  // directly. Enter/Blur commits, Escape cancels. No modal — keeps the slide
  // fully visible while typing.
  const [editing, setEditing] = useState<'title' | 'body' | null>(null);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const savedRef = useRef(false);

  useEffect(() => {
    if (editing === 'title' && titleRef.current) {
      titleRef.current.focus();
      // Place caret at end.
      const range = document.createRange(); range.selectNodeContents(titleRef.current); range.collapse(false);
      const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
    } else if (editing === 'body' && bodyRef.current) {
      bodyRef.current.focus();
      const range = document.createRange(); range.selectNodeContents(bodyRef.current); range.collapse(false);
      const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
    }
  }, [editing]);

  const commit = useCallback((which: 'title' | 'body') => {
    if (savedRef.current) return;
    savedRef.current = true;
    const el = which === 'title' ? titleRef.current : bodyRef.current;
    const next = (el?.innerText ?? '').replace(/\n+/g, ' ').trim();
    const original = which === 'title' ? title : body;
    if (next && next !== original.trim() && onSaveText) {
      onSaveText(which === 'title' ? { displayTitle: next } : { displaySupport: next });
    }
    setEditing(null);
    setTimeout(() => { savedRef.current = false; }, 0);
  }, [title, body, onSaveText]);

  const cancel = useCallback((which: 'title' | 'body') => {
    if (savedRef.current) return;
    savedRef.current = true;
    const el = which === 'title' ? titleRef.current : bodyRef.current;
    if (el) el.innerText = which === 'title' ? title : body;
    setEditing(null);
    setTimeout(() => { savedRef.current = false; }, 0);
  }, [title, body]);

  const handleKey = (which: 'title' | 'body') => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(which); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(which); }
  };
  const TO_CQW = 100 / 1080;
  const titleCqw = design.titleSizePx * TO_CQW;
  const bodyCqw = design.bodySizePx * TO_CQW;
  const ctaCqw = 44 * TO_CQW; // BOLD_FONT.cta.size — matches server

  const showBodyAsBlock = !isOpener && !!body;
  const showCtaLine = isOpener && !!body;

  const titleAlignCss: React.CSSProperties['textAlign'] = design.titleAlign;
  const bodyAlignCss: React.CSSProperties['textAlign'] = design.bodyAlign;
  const ctaJustify =
    design.titleAlign === 'left'
      ? 'flex-start'
      : design.titleAlign === 'right'
        ? 'flex-end'
        : 'center';
  const alignItemsForColumn =
    design.titleAlign === 'left'
      ? 'flex-start'
      : design.titleAlign === 'right'
        ? 'flex-end'
        : 'center';

  return (
    <div
      className="absolute inset-x-0 bottom-0 pointer-events-none"
      style={{
        // No fixed top — text anchors at the bottom (with padding) and grows
        // upward when copy is long, so we're guaranteed breathing room at the
        // bottom regardless of headline length.
        paddingInline: `${(65 / 1080) * 100}%`,
        paddingBottom: `${(65 / 1350) * 100}%`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: alignItemsForColumn,
      }}
    >
      <div
        className="relative flex flex-col w-full"
        style={{ gap: `${(20 / 1080) * 100}cqw`, alignItems: alignItemsForColumn }}
      >
        <div
          ref={titleRef}
          onClick={onSelect && editing !== 'title' ? (e) => { e.stopPropagation(); onSelect('title'); } : undefined}
          onDoubleClick={onSaveText ? (e) => { e.stopPropagation(); setEditing('title'); } : undefined}
          onBlur={editing === 'title' ? () => commit('title') : undefined}
          onKeyDown={editing === 'title' ? handleKey('title') : undefined}
          contentEditable={editing === 'title' ? 'plaintext-only' : false}
          suppressContentEditableWarning
          style={{
            fontFamily: `'${design.titleFontFamily}', sans-serif`,
            fontSize: `${titleCqw}cqw`,
            fontWeight: design.titleWeight,
            color: design.titleColor,
            lineHeight: 1.15,
            letterSpacing: `${-1.5 / 1080 * 100}cqw`,
            textAlign: titleAlignCss,
            width: '100%',
            wordBreak: 'break-word',
            pointerEvents: onSelect ? 'auto' : 'none',
            cursor: editing === 'title' ? 'text' : (onSelect ? 'pointer' : undefined),
            outline: (selection === 'title' || editing === 'title') ? '2px solid #dc2743' : 'none',
            outlineOffset: (selection === 'title' || editing === 'title') ? '6px' : undefined,
            borderRadius: '4px',
            transition:
              'outline-color 160ms var(--ease-out-expo), outline-offset 160ms var(--ease-out-expo), color 180ms var(--ease-out-expo), font-size 220ms var(--ease-out-expo), font-weight 180ms var(--ease-out-expo), text-align 200ms var(--ease-out-expo)',
          }}
        >
          {title}
        </div>
        {showBodyAsBlock && (
          <div
            ref={bodyRef}
            onClick={onSelect && editing !== 'body' ? (e) => { e.stopPropagation(); onSelect('body'); } : undefined}
            onDoubleClick={onSaveText ? (e) => { e.stopPropagation(); setEditing('body'); } : undefined}
            onBlur={editing === 'body' ? () => commit('body') : undefined}
            onKeyDown={editing === 'body' ? handleKey('body') : undefined}
            contentEditable={editing === 'body' ? 'plaintext-only' : false}
            suppressContentEditableWarning
            style={{
              fontFamily: `'${design.bodyFontFamily}', sans-serif`,
              fontSize: `${bodyCqw}cqw`,
              fontWeight: design.bodyWeight,
              color: design.bodyColor,
              lineHeight: 1.35,
              opacity: 0.95,
              textAlign: bodyAlignCss,
              width: '100%',
              wordBreak: 'break-word',
              pointerEvents: onSelect ? 'auto' : 'none',
              cursor: editing === 'body' ? 'text' : (onSelect ? 'pointer' : undefined),
              outline: (selection === 'body' || editing === 'body') ? '2px solid #dc2743' : 'none',
              outlineOffset: (selection === 'body' || editing === 'body') ? '6px' : undefined,
              borderRadius: '4px',
              transition:
                'outline-color 160ms var(--ease-out-expo), outline-offset 160ms var(--ease-out-expo), color 180ms var(--ease-out-expo), font-size 220ms var(--ease-out-expo), font-weight 180ms var(--ease-out-expo), text-align 200ms var(--ease-out-expo)',
            }}
          >
            {body}
          </div>
        )}
        {showCtaLine && (
          <div
            onClick={onSelect ? (e) => { e.stopPropagation(); onSelect('body'); } : undefined}
            style={{
              fontFamily: `'${design.bodyFontFamily}', sans-serif`,
              fontSize: `${ctaCqw}cqw`,
              fontWeight: 500,
              color: design.bodyColor,
              opacity: 0.85,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: ctaJustify,
              pointerEvents: onSelect ? 'auto' : 'none',
              cursor: editing === 'body' ? 'text' : (onSelect ? 'pointer' : undefined),
              outline: (selection === 'body' || editing === 'body') ? '2px solid #dc2743' : 'none',
              outlineOffset: (selection === 'body' || editing === 'body') ? '6px' : undefined,
              borderRadius: '4px',
              transition:
                'outline-color 160ms var(--ease-out-expo), outline-offset 160ms var(--ease-out-expo), color 180ms var(--ease-out-expo)',
              gap: `${(12 / 1080) * 100}cqw`,
              lineHeight: 1.3,
            }}
          >
            <span>{body}</span>
            <span style={{ opacity: 0.6 }}>»</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Modal-style editor: Text tab edits overlay copy, Image tab rerolls or
// tweaks the image prompt.
function SlideTextEditor({
  title: initialTitle,
  body: initialBody,
  bodyLabel = 'Body',
  bodyHint,
  bodyMultiline = true,
  initialPrompt,
  onClose,
  onSave,
  onRegenerateImage,
}: {
  title: string;
  body: string | null;
  bodyLabel?: string;
  bodyHint?: string;
  bodyMultiline?: boolean;
  initialPrompt: string;
  onClose: () => void;
  onSave: (patch: { displayTitle?: string; displaySupport?: string }) => Promise<void> | void;
  onRegenerateImage: (opts: { promptOverride?: string }) => Promise<void> | void;
}) {
  const [tab, setTab] = useState<'text' | 'image'>('text');
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody ?? '');
  const [prompt, setPrompt] = useState(initialPrompt);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const textDirty =
    title.trim() !== initialTitle.trim() ||
    (initialBody !== null && body.trim() !== initialBody.trim());
  const promptDirty = prompt.trim() !== initialPrompt.trim();
  const busy = saving || regenerating;

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose, busy]);

  const handleSave = async () => {
    if (!textDirty) { onClose(); return; }
    setSaving(true);
    try {
      const patch: { displayTitle?: string; displaySupport?: string } = {};
      if (title.trim() !== initialTitle.trim()) patch.displayTitle = title.trim();
      if (initialBody !== null && body.trim() !== initialBody.trim()) patch.displaySupport = body.trim();
      await onSave(patch);
    } finally {
      setSaving(false);
    }
  };

  const handleRoll = async () => {
    setRegenerating(true);
    try {
      await onRegenerateImage({});
    } finally {
      setRegenerating(false);
    }
  };

  const handleSavePromptAndRegen = async () => {
    if (!promptDirty) return;
    setRegenerating(true);
    try {
      await onRegenerateImage({ promptOverride: prompt.trim() });
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit slide"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl p-5 animate-scale-in"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Edit slide</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close editor"
            className="w-8 h-8 rounded-lg text-muted-light hover:text-foreground hover:bg-surface-hover transition-colors flex items-center justify-center disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* Tabs */}
        <div role="tablist" aria-label="Edit tabs" className="flex items-center gap-1 p-1 mb-4 rounded-full bg-background border border-border w-fit">
          {(['text', 'image'] as const).map(t => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              type="button"
              onClick={() => setTab(t)}
              disabled={busy}
              className={`h-7 px-3 text-xs font-semibold rounded-full transition-colors disabled:opacity-40 ${
                tab === t ? 'bg-[#dc2743] text-white' : 'text-muted-light hover:text-foreground'
              }`}
            >
              {t === 'text' ? 'Text' : 'Image'}
            </button>
          ))}
        </div>

        {tab === 'text' && (
          <>
            <label className="text-[10px] uppercase tracking-wider text-muted/60 mb-1.5 block">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-[#dc2743]/60 mb-4"
            />

            {initialBody !== null && (
              <>
                <label className="text-[10px] uppercase tracking-wider text-muted/60 mb-1.5 block">{bodyLabel}</label>
                {bodyMultiline ? (
                  <textarea
                    rows={4}
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-[#dc2743]/60 resize-none mb-1"
                  />
                ) : (
                  <input
                    type="text"
                    value={body}
                    maxLength={40}
                    onChange={e => setBody(e.target.value)}
                    placeholder="Swipe to find out"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-[#dc2743]/60 mb-1"
                  />
                )}
                {bodyHint && <p className="text-[11px] text-muted-light mb-4">{bodyHint}</p>}
                {!bodyHint && <div className="mb-3" />}
              </>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="h-9 px-4 text-sm font-medium text-muted-light hover:text-foreground disabled:opacity-40 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={busy || !textDirty}
                className="h-9 px-4 rounded-full text-sm font-semibold text-white bg-[#dc2743] hover:bg-[#dc2743]/90 disabled:opacity-40 transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}

        {tab === 'image' && (
          <>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted/60">Image prompt</label>
            </div>
            <textarea
              rows={6}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              autoFocus
              disabled={busy}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-[#dc2743]/60 resize-none mb-1 disabled:opacity-60"
            />
            <p className="text-[11px] text-muted-light mb-4">
              Describe the image. &quot;Save &amp; regenerate&quot; applies the new prompt; &quot;Roll new image&quot; keeps the current prompt.
            </p>

            <div className="flex items-center justify-end gap-2 flex-wrap">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="h-9 px-4 text-sm font-medium text-muted-light hover:text-foreground disabled:opacity-40 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRoll}
                disabled={busy || promptDirty}
                title={promptDirty ? 'Revert prompt changes to roll with current prompt' : 'Regenerate with the current prompt'}
                className="h-9 px-4 rounded-full text-sm font-semibold text-foreground bg-surface-elevated border border-border hover:bg-surface-hover disabled:opacity-40 transition-colors"
              >
                {regenerating && !promptDirty ? 'Rolling…' : 'Roll new image'}
              </button>
              <button
                type="button"
                onClick={handleSavePromptAndRegen}
                disabled={busy || !promptDirty}
                className="h-9 px-4 rounded-full text-sm font-semibold text-white bg-[#dc2743] hover:bg-[#dc2743]/90 disabled:opacity-40 transition-colors"
              >
                {regenerating && promptDirty ? 'Regenerating…' : 'Save & regenerate'}
              </button>
            </div>
          </>
        )}
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
  let buttonStyle: React.CSSProperties | undefined;

  // IG gradient (matches the wizard's primary CTAs). Applied inline so the
  // disabled-state classes can still override opacity without losing the fill.
  const IG_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)';

  if (approved) {
    buttonLabel = 'Preview Post';
    buttonAction = onPreview;
    buttonDisabled = false;
    buttonClass = 'bg-success/90 text-background hover:bg-success disabled:opacity-40';
  } else if (allReady) {
    buttonLabel = isProcessing ? 'Approving...' : 'Approve All';
    buttonAction = onApprove;
    buttonDisabled = isProcessing;
    buttonClass = 'text-white hover:opacity-90 disabled:opacity-40';
    buttonStyle = { background: IG_GRADIENT };
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
          style={buttonStyle}
          className={`w-full sm:w-auto h-11 px-6 font-semibold rounded-full text-sm transition-all whitespace-nowrap active:scale-[0.98] ${buttonClass}`}
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedSlide, setSelectedSlide] = useState(0);
  const [needsReapproval, setNeedsReapproval] = useState(false);
  // Drives the contextual side panel: clicking the title/body/image on the
  // slide preview sets this, and the right-hand panel swaps accordingly.
  const [selection, setSelection] = useState<'title' | 'body' | 'image'>('title');
  // Partial-failure recovery: when slides failed on the initial render, hide
  // the editor behind a recovery card with a Retry button. The user can
  // override with "Keep going anyway" to unlock the normal UI.
  const [keepGoingAnyway, setKeepGoingAnyway] = useState(false);
  const [isRetryingAll, setIsRetryingAll] = useState(false);
  const autoRetriedRef = useRef(false);
  // Live typography snapshot — published by the design panel on every change.
  // When present, SlideCard renders a CSS overlay on the raw image for an
  // instant preview instead of waiting for the server restyle to round-trip.
  const [liveDesign, setLiveDesign] = useState<LiveDesign | null>(null);

  // Auto-dismiss status messages
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Directional slide swap — routes setSelectedSlide through the browser's
  // View Transitions API so the image crossfades + horizontally slides in the
  // direction of travel. Silently falls back to a plain state update in
  // browsers that don't support it (Firefox today) or when reduce-motion
  // is on (the CSS rules disable the transition frames).
  const switchSlide = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(job.slides.length - 1, next));
    if (clamped === selectedSlide) return;
    const dir = clamped > selectedSlide ? 'next' : 'prev';
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.slideDir = dir;
    }
    type DocWithVT = Document & { startViewTransition?: (cb: () => void) => void };
    const doc = document as DocWithVT;
    if (typeof doc.startViewTransition === 'function') {
      doc.startViewTransition(() => setSelectedSlide(clamped));
    } else {
      setSelectedSlide(clamped);
    }
  }, [selectedSlide, job.slides.length]);

  const swipeTouchRef = useRef<{ x: number; y: number } | null>(null);
  const handleSwipeTouchStart = useCallback((e: React.TouchEvent) => {
    swipeTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);
  const handleSwipeTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!swipeTouchRef.current) return;
    const dx = e.changedTouches[0].clientX - swipeTouchRef.current.x;
    const dy = e.changedTouches[0].clientY - swipeTouchRef.current.y;
    swipeTouchRef.current = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) switchSlide(selectedSlide + 1);
    else switchSlide(selectedSlide - 1);
  }, [switchSlide, selectedSlide]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't capture if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft' && selectedSlide > 0) {
        e.preventDefault();
        switchSlide(selectedSlide - 1);
      }
      if (e.key === 'ArrowRight' && selectedSlide < job.slides.length - 1) {
        e.preventDefault();
        switchSlide(selectedSlide + 1);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedSlide, job.slides.length, switchSlide]);

  // Compute slide health. A slide is "failed" for UX purposes when it's
  // explicitly FAILED_IMAGE or when the job has finished rendering but the
  // slide still has no image. The page-level fetchJob guard ensures we only
  // enter review once at least one slide has resolved, so missing imageUrl
  // here means genuine failure — not a render still in flight.
  const failedSlides = job.slides.filter(s => s.status === 'FAILED_IMAGE' || !s.imageUrl);
  const readyCount = job.slides.length - failedSlides.length;

  // Current slide
  const currentSlide = job.slides[selectedSlide];

  // Save user-edited text for a slide and re-composite the overlay (no AI call).
  const handleSaveText = useCallback(
    async (slideIndex: number, patch: { displayTitle?: string; displaySupport?: string }) => {
      try {
        const res = await fetch(
          `/api/carousel/${job.id}/slides/${slideIndex}/update-text`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Save failed');
        }
        if (job.approved) setNeedsReapproval(true);
        // Text is a CSS overlay now — a single refresh pulls the updated
        // headline/body from the DB; no background re-composite to wait for.
        onRefresh();
        setMessage(`Slide ${slideIndex + 1} text updated`);
      } catch (err) {
        setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    },
    [job.id, job.approved, onRefresh],
  );

  // Track per-slide regeneration so the card shows the Regenerating state
  // immediately (without waiting for a full refresh round-trip).
  const [regeneratingSlides, setRegeneratingSlides] = useState<Set<number>>(new Set());

  // Bumped after every successful restyle/regen so slide image URLs gain a
  // fresh ?v= query param and the browser drops its cached composite.
  const [imageVersion, setImageVersion] = useState(0);
  const bustImgSrc = useCallback((url: string | null) => {
    if (!url) return url;
    return imageVersion > 0 ? `${url}${url.includes('?') ? '&' : '?'}v=${imageVersion}` : url;
  }, [imageVersion]);

  const handleRegenerateImage = useCallback(
    async (slideIndex: number, opts: { promptOverride?: string; wikipediaImageUrl?: string; wikipediaQuery?: string }) => {
      setRegeneratingSlides(prev => {
        const next = new Set(prev);
        next.add(slideIndex);
        return next;
      });
      const isWiki = typeof opts.wikipediaImageUrl === 'string';
      setMessage(
        isWiki ? 'Applying Wikipedia image…'
        : opts.promptOverride !== undefined ? 'Regenerating with new prompt…'
        : 'Rolling a new image…'
      );
      try {
        const res = await fetch(`/api/carousel/${job.id}/regenerate-slide`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slideIndex,
            mode: 'image',
            ...(isWiki ? { imageSource: 'wikipedia', wikipediaImageUrl: opts.wikipediaImageUrl, wikipediaQuery: opts.wikipediaQuery } : {}),
            ...(opts.promptOverride !== undefined ? { promptOverride: opts.promptOverride } : {}),
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Regenerate failed');
        }
        if (job.approved) setNeedsReapproval(true);
        setImageVersion(v => v + 1);
        await onRefresh();
        setMessage(`Slide ${slideIndex + 1} image updated`);
      } catch (err) {
        setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
      } finally {
        setRegeneratingSlides(prev => {
          const next = new Set(prev);
          next.delete(slideIndex);
          return next;
        });
      }
    },
    [job.id, job.approved, onRefresh],
  );

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

  // Retry every currently-failed slide sequentially. Used by the recovery
  // card button and also fired automatically once when the user lands on a
  // partially-failed carousel (see effect below).
  const handleRetryAllFailed = useCallback(async () => {
    const failing = job.slides.filter(s => s.status === 'FAILED_IMAGE' || !s.imageUrl);
    if (failing.length === 0) return;
    setIsRetryingAll(true);
    try {
      for (const s of failing) {
        await handleRegenerateImage(s.slideIndex, {});
      }
    } finally {
      setIsRetryingAll(false);
    }
  }, [job.slides, handleRegenerateImage]);

  // Auto-retry on first mount if we landed on a partially-failed carousel.
  // Runs at most once per session; manual retries after an edit won't loop.
  useEffect(() => {
    if (autoRetriedRef.current) return;
    const hasFailures = job.slides.some(s => s.status === 'FAILED_IMAGE' || !s.imageUrl);
    const hasAny = job.slides.length > 0;
    if (hasAny && hasFailures) {
      autoRetriedRef.current = true;
      handleRetryAllFailed();
    }
    // Intentionally only consider the initial `job.slides` snapshot — this
    // effect should not re-fire when slides update during retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="animate-fade-up flex flex-col">
      {/* Header — the failure subtext is hidden while the recovery card is
          showing so the user doesn't read the same message twice. */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight truncate">{job.topic}</h1>
          {keepGoingAnyway && failedSlides.length === job.slides.length ? (
            <p className="text-sm text-danger mt-1">Generation finished — no usable slides were produced</p>
          ) : keepGoingAnyway && failedSlides.length > 0 ? (
            <p className="text-sm text-warning mt-1">Generation finished — {failedSlides.length} slide{failedSlides.length > 1 ? 's' : ''} need attention</p>
          ) : failedSlides.length === 0 ? (
            <p className="text-sm text-success mt-1">All {job.slides.length} slides ready</p>
          ) : null}
        </div>
        {(failedSlides.length === 0 || keepGoingAnyway) && (
          (() => {
            const allReady = failedSlides.length === 0;
            if (job.approved) {
              return (
                <button
                  onClick={handlePreview}
                  className="h-10 px-5 rounded-full text-sm font-semibold bg-success/90 text-background hover:bg-success transition-all active:scale-[0.98] whitespace-nowrap"
                >
                  Preview Post
                </button>
              );
            }
            if (allReady) {
              return (
                <button
                  onClick={handleApprove}
                  disabled={isProcessing}
                  style={{ background: 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' }}
                  className="h-10 px-5 rounded-full text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 transition-all active:scale-[0.98] whitespace-nowrap inline-flex items-center"
                >
                  {isProcessing && (
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 inline-block" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-25" />
                      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  )}
                  {isProcessing ? 'Approving…' : 'Approve All'}
                </button>
              );
            }
            return (
              <button
                onClick={handleJumpToIssue}
                className="h-10 px-5 rounded-full text-sm font-medium text-danger bg-danger/10 border border-danger/30 hover:bg-danger/15 transition-all active:scale-[0.98] whitespace-nowrap"
              >
                Jump to first issue
              </button>
            );
          })()
        )}
      </div>

      {/* Status message */}
      {message && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${
          message.startsWith('Error') ? 'bg-danger-dim text-danger' : 'bg-success-dim text-success'
        }`}>
          {message}
        </div>
      )}

      {/* Recovery card — shown when slides failed so the user sees a single
          clear action instead of a red-striped half-broken editor. */}
      {failedSlides.length > 0 && !keepGoingAnyway && (
        <div className="flex flex-col items-center pb-24">
          <div className="w-full max-w-lg bg-surface border border-border rounded-2xl p-6 sm:p-8 text-center animate-scale-in">
            <div className="w-12 h-12 mx-auto rounded-full bg-warning/15 flex items-center justify-center mb-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 8v5M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-warning" />
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" className="text-warning/60" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-foreground mb-2">
              {failedSlides.length === job.slides.length
                ? `We couldn't generate any of your ${job.slides.length} slides`
                : `${failedSlides.length} of ${job.slides.length} slides couldn't finish`}
            </h2>
            <p className="text-sm text-muted-light mb-6 leading-relaxed">
              {isRetryingAll
                ? 'Retrying now — this usually takes 20–40 seconds.'
                : 'This happens occasionally when the image service is busy. Retry and we\'ll pick up where we left off.'}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
              <button
                onClick={handleRetryAllFailed}
                disabled={isRetryingAll}
                className="w-full sm:w-auto h-11 px-6 rounded-full text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-all active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' }}
              >
                {isRetryingAll ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 inline-block" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-25" />
                      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Retrying {failedSlides.length} slide{failedSlides.length > 1 ? 's' : ''}…
                  </>
                ) : (
                  <>Retry failed slides</>
                )}
              </button>
              <button
                onClick={() => setKeepGoingAnyway(true)}
                disabled={isRetryingAll}
                className="w-full sm:w-auto h-11 px-6 rounded-full text-sm font-medium text-muted-light hover:text-foreground disabled:opacity-40 transition-colors"
              >
                Keep going anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Focused slide view. On mobile the design panel stacks below the slide;
          on desktop (lg+) it sits beside the slide so the vertical column of
          slide + toolbar + thumbnails doesn't demand excessive scrolling. */}
      {(failedSlides.length === 0 || keepGoingAnyway) && (
      <div className="flex flex-col items-center">

        <div className="flex flex-col lg:flex-row lg:items-stretch lg:justify-center lg:gap-8 w-full">
        <div className="flex flex-col items-center w-full lg:w-96 lg:flex-shrink-0 animate-fade-up stagger-2">
        {/* Large slide preview */}
        {currentSlide && (
          <div
            className="w-full max-w-sm"
            onTouchStart={handleSwipeTouchStart}
            onTouchEnd={handleSwipeTouchEnd}
          >
            <SlideCard
              slide={{ ...currentSlide, imageUrl: bustImgSrc(currentSlide.imageUrl) }}
              liveDesign={liveDesign}
              selection={selection}
              onSelect={setSelection}
              onSaveText={(patch) => handleSaveText(currentSlide.slideIndex, patch)}
              onRegenerateImage={(opts) => handleRegenerateImage(currentSlide.slideIndex, opts)}
              isRegenerating={regeneratingSlides.has(currentSlide.slideIndex)}
            />
          </div>
        )}


        {/* Contextual side panel — swaps between text-style tools and image
            tools depending on what's selected on the slide. */}
        <div className="w-full max-w-sm mt-4 lg:mt-0 lg:max-w-none lg:w-[480px] lg:h-[480px] lg:flex-shrink-0 animate-pop-in stagger-3" key={selection === 'image' ? 'image' : 'text'}>
          {selection === 'image' && currentSlide ? (
            <ImageEditPanel
              currentPrompt={currentSlide.imagePromptOverride ?? ''}
              isRegenerating={regeneratingSlides.has(currentSlide.slideIndex)}
              defaultWikiQuery={job.topic ?? ''}
              onRoll={() => handleRegenerateImage(currentSlide.slideIndex, {})}
              onSavePromptAndRegen={(p) => handleRegenerateImage(currentSlide.slideIndex, { promptOverride: p })}
              onPickWikipedia={(r) => handleRegenerateImage(currentSlide.slideIndex, {
                wikipediaImageUrl: r.imageUrl,
                wikipediaQuery: r.pageTitle,
              })}
            />
          ) : (
            <CarouselDesignPanel
              channelId={job.channelId}
              jobId={job.id}
              slideCount={job.slides.length}
              target={selection === 'body' ? 'body' : 'title'}
              onTargetChange={(t) => setSelection(t)}
              onLiveDesign={setLiveDesign}
              onRestyleStarted={() => {
                // Design applies instantly via CSS overlay; no need to refresh
                // the full job. Mark needing re-approval locally if it was approved.
                if (job.approved) setNeedsReapproval(true);
              }}
            />
          )}
        </div>
        </div>

        {/* Thumbnail filmstrip — Prev/Next hug the row directly so navigation
            lives right where the thumbs are. */}
        <div className="flex items-center justify-center gap-3 mt-6 px-4 animate-fade-up stagger-4">
          <button
            onClick={() => switchSlide(selectedSlide - 1)}
            disabled={selectedSlide === 0}
            className="flex-shrink-0 w-9 h-9 rounded-full bg-surface border border-border text-foreground hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.94] flex items-center justify-center"
            aria-label="Previous slide"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>

          <div className="flex flex-wrap sm:flex-nowrap justify-center gap-3 max-w-full py-2 px-1">
          {job.slides.map((slide, i) => {
            const status = getSlideDisplayStatus(slide, false);
            const isActive = i === selectedSlide;
            const isFailed = status === 'FAILED_IMAGE';
            return (
              <button
                key={slide.id}
                onClick={() => switchSlide(i)}
                className={`relative w-14 h-[70px] rounded-lg overflow-hidden flex-shrink-0 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.95] ${
                  isActive
                    ? 'shadow-[0_0_0_2px_#dc2743,0_0_0_4px_rgba(220,39,67,0.25),0_6px_18px_-6px_rgba(220,39,67,0.6)] -translate-y-0.5'
                    : isFailed
                      ? 'ring-2 ring-danger/60'
                      : 'ring-1 ring-border hover:ring-border-hover'
                }`}
                aria-label={`Select slide ${i + 1}`}
              >
                {slide.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={bustImgSrc(slide.imageUrl) ?? slide.imageUrl}
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

          <button
            onClick={() => switchSlide(selectedSlide + 1)}
            disabled={selectedSlide === job.slides.length - 1}
            className="flex-shrink-0 w-10 h-10 rounded-full bg-surface border border-border text-foreground hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.94] flex items-center justify-center"
            aria-label="Next slide"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>
      )}

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
  // The stored slide images are raw (no text baked in). Text is rendered as a
  // CSS overlay in the review view; the Instagram preview needs the same
  // treatment so approved posts actually show the headline/body. Fetch the
  // channel's visual style so the preview matches what the user designed.
  const [previewDesign, setPreviewDesign] = useState<LiveDesign>(DEFAULT_LIVE_DESIGN);
  useEffect(() => {
    if (!job.channelId) return;
    fetch(`/api/admin/channels/${job.channelId}/visual-style`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setPreviewDesign(prev => ({
          ...prev,
          titleSizePx: data.t1FontSizePx ?? prev.titleSizePx,
          bodySizePx: data.t2FontSizePx ?? prev.bodySizePx,
          titleColor: data.headlineColor ?? prev.titleColor,
          bodyColor: data.bodyColor ?? prev.bodyColor,
          titleAlign: data.titleAlign ?? prev.titleAlign,
          bodyAlign: data.bodyAlign ?? prev.bodyAlign,
          titleWeight: typeof data.titleWeight === 'number' ? data.titleWeight : prev.titleWeight,
          bodyWeight: typeof data.bodyWeight === 'number' ? data.bodyWeight : prev.bodyWeight,
        }));
      })
      .catch(() => {});
  }, [job.channelId]);

  const renderableSlides = job.slides.filter(s => s.imageUrl);
  const slideImages = renderableSlides.map(s => s.imageUrl as string);
  const slideOverlays = renderableSlides.map(s => {
    if (s.hasEmbeddedText) return null;
    const isOpener = s.role === 'OPENER';
    const hasSecondary = s.role === 'FACT' || s.role === 'IMPLICATION' || isOpener;
    const titleText = s.displayTitle || s.headline || '';
    const bodyText = hasSecondary ? (s.displaySupport || s.body || '') : '';
    return (
      <>
        <div
          aria-hidden="true"
          className="absolute inset-x-0 pointer-events-none"
          style={{
            top: '35%',
            bottom: 0,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.25) 28%, rgba(0,0,0,0.65) 48%, rgba(0,0,0,0.90) 62%, rgba(0,0,0,1) 75%, rgba(0,0,0,1) 100%)',
          }}
        />
        <LiveTextOverlay
          design={previewDesign}
          title={titleText}
          body={bodyText}
          isOpener={isOpener}
        />
      </>
    );
  });

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
    <div className="animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Post Preview</h1>
          <p className="text-sm text-muted-light mt-1">
            Review your carousel as it will appear on Instagram
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="h-10 px-4 text-sm font-medium bg-surface border border-border rounded-full hover:bg-surface-hover transition-all active:scale-[0.98]"
          >
            &larr; Back to slides
          </button>
          <button
            onClick={handleDownload}
            disabled={isExporting}
            style={{ background: 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' }}
            className="h-10 px-5 font-semibold rounded-full text-sm text-white hover:opacity-90 disabled:opacity-40 transition-all active:scale-[0.98] whitespace-nowrap inline-flex items-center"
          >
            {isExporting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 inline-block" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-25" />
                  <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Downloading…
              </>
            ) : (
              <>
                <svg className="-ml-0.5 mr-1.5 h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Download ZIP
              </>
            )}
          </button>
        </div>
      </div>

      {exportMessage && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${
          exportMessage.startsWith('Error') ? 'bg-danger-dim text-danger' : 'bg-success-dim text-success'
        }`}>
          {exportMessage}
        </div>
      )}

      {/* Instagram Mockup */}
      <div className="flex justify-center">
        <InstagramPreview
          username="Your Profile"
          slides={slideImages}
          slideOverlays={slideOverlays}
          caption={caption}
          hashtags={hashtags}
          likesCount="0"
          timestamp="Just now"
        />
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

      // Treat any job with an errorMessage as failed — the pipeline may not
      // have flipped status to 'FAILED' in every code path, and without this
      // a legacy failed carousel dumps the user onto ProgressView forever.
      const isFailed = data.status === 'FAILED' || !!data.errorMessage;

      if (data.status === 'COMPLETE' || isFailed) {
        // Guard: after copy-only generation the job is marked COMPLETE with
        // empty slides while render-images is still starting in the
        // background. Keep showing ProgressView until at least one slide has
        // resolved (image saved OR explicitly FAILED_IMAGE) so we don't
        // flash the editor with empty thumbnails and trigger a premature
        // "retry" flow.
        const anyResolved = data.slides?.some(s => !!s.imageUrl || s.status === 'FAILED_IMAGE') ?? false;
        const readyToReview = isFailed || anyResolved;

        if (readyToReview) {
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
          if (isFailed) {
            setError(data.errorMessage || 'Generation failed');
          }
        } else if (!slidesPollRef.current) {
          // Status flipped to COMPLETE before any slide resolved — we're
          // waiting on background render. Keep polling until at least one
          // slide lands or fails.
          slidesPollRef.current = setInterval(() => { fetchJob(); }, 2000);
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

  // Start or restart SSE connection
  const startSSE = useCallback(() => {
    // Close any existing connection
    eventSourceRef.current?.close();

    const es = new EventSource(`/api/carousel/${jobId}/status`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: ProgressEvent = JSON.parse(event.data);
        setProgress(data);

        // When entering render phase or slide counts change, poll for slides
        if (data.slides && data.slides.total > 0 && !slidesPollRef.current) {
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
      fetchJob();
    };
  }, [jobId, fetchJob]);

  // SSE connection for progress + slide polling during render
  useEffect(() => {
    // First check current status
    fetchJob().then(data => {
      if (data && (data.status === 'COMPLETE' || data.status === 'FAILED')) {
        return; // Already done, no need for SSE
      }
      startSSE();
    });

    return () => {
      eventSourceRef.current?.close();
      if (slidesPollRef.current) {
        clearInterval(slidesPollRef.current);
        slidesPollRef.current = null;
      }
    };
  }, [jobId, fetchJob, startSSE]);

  // ─── Mobile tab recovery ─────────────────────────────────────
  // When the user switches apps and comes back, the SSE connection is dead.
  // Re-fetch job status and reconnect if still in progress.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      // Tab just became visible again — check the real status
      fetchJob().then(data => {
        if (!data) return;
        if (data.status === 'COMPLETE' || data.status === 'FAILED') {
          // Job finished while we were away — SSE is already dead, no need to reconnect
          eventSourceRef.current?.close();
          if (slidesPollRef.current) {
            clearInterval(slidesPollRef.current);
            slidesPollRef.current = null;
          }
          setError(data.status === 'FAILED' ? (data.errorMessage || 'Generation failed') : null);
        } else {
          // Job is still running — reconnect SSE
          startSSE();
        }
      });
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchJob, startSSE]);

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

  // Show progress screen until complete. Also covers the "copy done, images
  // still rendering in the background" window — the job may briefly report
  // COMPLETE while the render-images call is in-flight and no slides have
  // images yet. Treat that as progress, not as failure.
  const renderingInBackground =
    phase === 'progress' &&
    job?.status === 'COMPLETE' &&
    job.slides.length > 0 &&
    job.slides.every(s => !s.imageUrl && s.status !== 'FAILED_IMAGE');
  if (phase === 'progress' && (!job || job.status === 'PENDING' || job.status === 'GENERATING' || job.status === 'RENDERING' || renderingInBackground)) {
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
            href="/admin"
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

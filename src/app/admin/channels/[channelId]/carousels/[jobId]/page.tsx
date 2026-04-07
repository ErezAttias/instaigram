'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
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
  imageSource: 'wikipedia' | 'generated' | null;
  topicEntity: string | null;
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
  article: string | null;
  caption: string | null;
  hashtags: string[];
}

interface ProgressEvent {
  step: string;
  message: string;
  pct: number;
  slidesTotal: number;
  slidesReady: number;
  slidesFailed: number;
}

// ─── Component ──────────────────────────────────────────────

type ViewMode = 'slides' | 'mockup';

export default function AdminCarouselViewerPage() {
  const params = useParams();
  const channelId = params.channelId as string;
  const jobId = params.jobId as string;

  const [job, setJob] = useState<CarouselJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSlide, setActiveSlide] = useState(0);
  const [regenerating, setRegenerating] = useState<number | null>(null);
  const [regeneratingAction, setRegeneratingAction] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [regeneratingArticle, setRegeneratingArticle] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [igConnected, setIgConnected] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ success: boolean; message: string } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('slides');
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch channel name + Instagram connection status
  useEffect(() => {
    fetch(`/api/admin/channels/${channelId}`)
      .then(res => res.json())
      .then(data => {
        setChannelName(data.name || 'Channel');
        setIgConnected(!!data.instagramConnected);
      })
      .catch(() => {});
  }, [channelId]);

  // Fetch carousel data
  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/carousel/${jobId}`);
      if (!res.ok) throw new Error('Failed to load carousel');
      const data = await res.json();
      setJob(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      return null;
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchJob().then(data => {
      if (data && (data.status === 'PENDING' || data.status === 'GENERATING' || data.status === 'RENDERING')) {
        startSSE();
      }
    });
    return () => eventSourceRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchJob]);

  function startSSE() {
    eventSourceRef.current?.close();
    const es = new EventSource(`/api/carousel/${jobId}/status`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: ProgressEvent | { status: string } = JSON.parse(event.data);
        if ('status' in data && (data.status === 'COMPLETE' || data.status === 'FAILED')) {
          es.close();
          fetchJob();
        } else {
          setJob(prev => prev ? { ...prev, progress: data as ProgressEvent } : prev);
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
      fetchJob();
    };
  }

  async function handleRegenerate(
    slideIndex: number,
    mode: 'full' | 'copy' | 'image' = 'full',
    imageSource?: 'wikipedia' | 'generated',
  ) {
    setRegenerating(slideIndex);
    setRegeneratingAction(imageSource ?? mode);
    try {
      const res = await fetch(`/api/carousel/${jobId}/regenerate-slide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slideIndex, mode, imageSource }),
      });
      if (res.ok) await fetchJob();
    } finally {
      setRegenerating(null);
      setRegeneratingAction(null);
    }
  }

  async function handleApprove() {
    setApproving(true);
    try {
      const res = await fetch(`/api/carousel/${jobId}/approve`, { method: 'POST' });
      if (res.ok) await fetchJob();
    } finally {
      setApproving(false);
    }
  }

  async function handleGenerateCaption() {
    setGeneratingCaption(true);
    try {
      const res = await fetch(`/api/carousel/${jobId}/generate-caption`, { method: 'POST' });
      if (res.ok) await fetchJob();
    } finally {
      setGeneratingCaption(false);
    }
  }

  function handleExport() {
    window.open(`/api/carousel/${jobId}/export`, '_blank');
  }

  async function handleRegenerateArticle() {
    setRegeneratingArticle(true);
    try {
      const res = await fetch(`/api/carousel/${jobId}/regenerate-article`, { method: 'POST' });
      if (res.ok) await fetchJob();
    } finally {
      setRegeneratingArticle(false);
    }
  }

  async function handlePublishToInstagram() {
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await fetch(`/api/carousel/${jobId}/publish`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setPublishResult({ success: true, message: 'Posted to Instagram!' });
        await fetchJob();
      } else {
        const msg = data.message ?? data.error ?? 'Publishing failed';
        setPublishResult({ success: false, message: msg });
      }
    } catch {
      setPublishResult({ success: false, message: 'Network error — please try again' });
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <div>
        <div className="skeleton h-8 w-64 rounded-lg mb-8" />
        <div className="skeleton h-96 rounded-xl" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="text-center py-16">
        <p className="text-danger text-sm">{error || 'Carousel not found'}</p>
        <Link href={`/admin/channels/${channelId}`} className="text-sm text-accent mt-4 inline-block">
          Back to channel
        </Link>
      </div>
    );
  }

  const isGenerating = job.status === 'PENDING' || job.status === 'GENERATING' || job.status === 'RENDERING';
  const isSlideRegenerating = regenerating === activeSlide || job.slides[activeSlide]?.status === 'REGENERATING';

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-muted mb-6">
        <Link href="/admin" className="hover:text-foreground transition-colors">Dashboard</Link>
        <span>/</span>
        <Link href={`/admin/channels/${channelId}`} className="hover:text-foreground transition-colors">{channelName}</Link>
        <span>/</span>
        <span className="text-muted-light truncate max-w-xs">{job.topic}</span>
      </nav>

      {/* Generation progress */}
      {isGenerating && job.progress && (
        <div className="bg-surface border border-border rounded-xl p-6 mb-8 animate-fade-up">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-foreground">{job.progress.message || 'Generating...'}</span>
          </div>
          <div className="w-full bg-surface-elevated rounded-full h-2">
            <div
              className="bg-accent h-2 rounded-full transition-all duration-500"
              style={{ width: `${job.progress.pct || 0}%` }}
            />
          </div>
          <p className="text-xs text-muted mt-2">{job.progress.pct || 0}% complete</p>
        </div>
      )}

      {/* Failed state */}
      {job.status === 'FAILED' && (
        <div className="bg-danger-dim border border-danger/20 rounded-xl p-6 mb-8">
          <p className="text-sm text-danger font-medium">Generation failed</p>
          {job.errorMessage && <p className="text-xs text-danger/70 mt-1">{job.errorMessage}</p>}
        </div>
      )}

      {/* Slide viewer */}
      {job.slides.length > 0 && (
        <>
          {/* View toggle + actions bar */}
          <div className="flex items-center justify-between mb-5">
            {/* View toggle */}
            <div className="flex items-center bg-surface border border-border rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('slides')}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'slides'
                    ? 'bg-accent text-background'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                Slides
              </button>
              <button
                onClick={() => setViewMode('mockup')}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'mockup'
                    ? 'bg-accent text-background'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                Instagram Mockup
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {job.status === 'COMPLETE' && !job.approved && (
                <>
                  {/* Image source toggle — only for slides with a tracked imageSource (real places / celebrities) */}
                  {(() => {
                    const activeSlideData = job.slides.find(s => s.slideIndex === activeSlide);
                    if (!activeSlideData?.imageSource) return null;
                    const currentSource = activeSlideData.imageSource;
                    return (
                      <div className="flex items-center border border-border rounded-lg overflow-hidden divide-x divide-border">
                        <button
                          onClick={() => handleRegenerate(activeSlide, 'image', 'wikipedia')}
                          disabled={regenerating !== null}
                          className={`px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 flex items-center gap-1.5 ${
                            currentSource === 'wikipedia'
                              ? 'bg-surface-active text-foreground'
                              : 'text-muted hover:text-foreground hover:bg-surface-hover'
                          }`}
                          title="Use a real Wikipedia photo"
                        >
                          {regenerating === activeSlide && regeneratingAction === 'wikipedia' ? (
                            <><div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />Wikipedia Photo</>
                          ) : 'Wikipedia Photo'}
                        </button>
                        <button
                          onClick={() => handleRegenerate(activeSlide, 'image', 'generated')}
                          disabled={regenerating !== null}
                          className={`px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 flex items-center gap-1.5 ${
                            currentSource === 'generated'
                              ? 'bg-surface-active text-foreground'
                              : 'text-muted hover:text-foreground hover:bg-surface-hover'
                          }`}
                          title="Generate an AI image"
                        >
                          {regenerating === activeSlide && regeneratingAction === 'generated' ? (
                            <><div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />Generate</>
                          ) : 'Generate'}
                        </button>
                      </div>
                    );
                  })()}
                  {/* Regeneration options */}
                  <div className="flex items-center border border-border rounded-lg overflow-hidden divide-x divide-border">
                    <button
                      onClick={() => handleRegenerate(activeSlide, 'copy')}
                      disabled={regenerating !== null}
                      className="px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:bg-surface-hover disabled:opacity-40 transition-colors flex items-center gap-1.5"
                    >
                      {regenerating === activeSlide && regeneratingAction === 'copy' ? (
                        <><div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />Regen Text</>
                      ) : 'Regen Text'}
                    </button>
                    <button
                      onClick={() => handleRegenerate(activeSlide, 'image')}
                      disabled={regenerating !== null}
                      className="px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:bg-surface-hover disabled:opacity-40 transition-colors flex items-center gap-1.5"
                    >
                      {regenerating === activeSlide && regeneratingAction === 'image' ? (
                        <><div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />Regen Image</>
                      ) : 'Regen Image'}
                    </button>
                    <button
                      onClick={() => handleRegenerate(activeSlide, 'full')}
                      disabled={regenerating !== null}
                      className="px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent-dim disabled:opacity-40 transition-colors flex items-center gap-1.5"
                    >
                      {regenerating === activeSlide && regeneratingAction === 'full' ? (
                        <><div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />Regen Both</>
                      ) : 'Regen Both'}
                    </button>
                  </div>
                  <button
                    onClick={handleApprove}
                    disabled={approving}
                    className="px-4 py-1.5 bg-accent text-background text-xs font-medium rounded-lg hover:bg-accent-hover disabled:opacity-40 transition-colors"
                  >
                    {approving ? 'Approving...' : 'Approve Carousel'}
                  </button>
                </>
              )}
              {job.status === 'COMPLETE' && job.approved && (
                <>
                  {!job.caption && (
                    <button
                      onClick={handleGenerateCaption}
                      disabled={generatingCaption}
                      className="px-4 py-1.5 bg-violet text-white text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-40 transition-colors"
                    >
                      {generatingCaption ? 'Generating...' : 'Generate Caption'}
                    </button>
                  )}
                  <button
                    onClick={handleExport}
                    className="px-4 py-1.5 border border-border text-xs font-medium text-foreground rounded-lg hover:bg-surface-hover transition-colors"
                  >
                    Export as ZIP
                  </button>
                  {igConnected ? (
                    <button
                      onClick={handlePublishToInstagram}
                      disabled={publishing}
                      className="px-4 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5"
                    >
                      {publishing && <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />}
                      {publishing ? 'Posting…' : 'Post to Instagram'}
                    </button>
                  ) : (
                    <Link
                      href={`/admin/channels/${channelId}?tab=instagram`}
                      className="px-4 py-1.5 border border-dashed border-border text-xs font-medium text-muted rounded-lg hover:text-foreground hover:border-border-hover transition-colors"
                    >
                      Connect Instagram
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Publish result toast */}
          {publishResult && (
            <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
              publishResult.success
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {publishResult.message}
            </div>
          )}

          {viewMode === 'slides' ? (
            /* ── Slides view ── */
            <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-5 items-start">
              {/* Vertical slide strip (left) */}
              <div className="hidden lg:flex flex-col gap-2 sticky top-24 max-h-[70vh] overflow-y-auto scrollbar-hide py-1">
                {job.slides.map((slide, i) => {
                  const thumbLoading = regenerating === i || slide.status === 'REGENERATING';
                  return (
                    <button
                      key={slide.id}
                      onClick={() => setActiveSlide(i)}
                      className={`relative shrink-0 w-14 h-[70px] rounded-lg overflow-hidden border-2 transition-colors ${
                        i === activeSlide ? 'border-accent' : 'border-border hover:border-border-hover'
                      }`}
                    >
                      {slide.imageUrl ? (
                        <img
                          src={slide.imageUrl}
                          alt=""
                          className={`w-full h-full object-cover transition-opacity duration-300 ${thumbLoading ? 'opacity-30' : 'opacity-100'}`}
                        />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center text-xs text-muted ${thumbLoading ? 'skeleton' : 'bg-surface-elevated'}`}>
                          {thumbLoading ? '' : i + 1}
                        </div>
                      )}
                      {thumbLoading && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-4 h-4 border-[1.5px] border-accent border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Main slide view (center) */}
              <div className="flex flex-col items-center">
                {/* Slide role + index badge */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-medium text-accent uppercase tracking-wide">
                    {job.slides[activeSlide]?.role}
                  </span>
                  <span className="text-xs text-muted">
                    Slide {activeSlide + 1} of {job.slides.length}
                  </span>
                </div>

                <div className="relative bg-surface rounded-xl border border-border overflow-hidden max-h-[70vh] w-fit">
                  {job.slides[activeSlide]?.imageUrl ? (
                    <img
                      src={job.slides[activeSlide].imageUrl!}
                      alt={`Slide ${activeSlide + 1}`}
                      className={`max-h-[70vh] w-auto object-contain transition-opacity duration-300 ${isSlideRegenerating ? 'opacity-30' : 'opacity-100'}`}
                    />
                  ) : (
                    <div className="h-[50vh] aspect-[4/5] bg-surface-elevated flex items-center justify-center">
                      <p className="text-sm text-muted">
                        {isSlideRegenerating ? '' : 'No image'}
                      </p>
                    </div>
                  )}
                  {isSlideRegenerating && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs font-medium text-foreground">Regenerating…</p>
                    </div>
                  )}
                </div>

                {/* Mobile-only horizontal slide nav */}
                <div className="flex lg:hidden items-center gap-2 mt-4 overflow-x-auto scrollbar-hide pb-2">
                  {job.slides.map((slide, i) => (
                    <button
                      key={slide.id}
                      onClick={() => setActiveSlide(i)}
                      className={`shrink-0 w-14 h-[70px] rounded-lg overflow-hidden border-2 transition-colors ${
                        i === activeSlide ? 'border-accent' : 'border-transparent hover:border-border-hover'
                      }`}
                    >
                      {slide.imageUrl ? (
                        <img src={slide.imageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-surface-elevated flex items-center justify-center text-xs text-muted">
                          {i + 1}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* ── Instagram Mockup view ── */
            <div className="flex flex-col items-center gap-4">
              {job.slides.some(s => s.imageUrl) && (() => {
                // Priority: caption > article > fallback from slide copy
                const mockupCaption = job.caption
                  || job.article
                  || job.slides
                    .filter(s => s.displayTitle || s.displaySupport)
                    .map(s => [s.displayTitle, s.displaySupport].filter(Boolean).join('\n'))
                    .join('\n\n');

                const mockupHashtags = job.hashtags.length > 0
                  ? job.hashtags.join(' ')
                  : undefined;

                return (
                  <InstagramPreview
                    username={channelName || 'preview'}
                    slides={job.slides.filter(s => s.imageUrl).map(s => s.imageUrl!)}
                    caption={mockupCaption}
                    hashtags={mockupHashtags}
                  />
                );
              })()}

              {/* Regenerate article button */}
              {job.status === 'COMPLETE' && (
                <button
                  onClick={handleRegenerateArticle}
                  disabled={regeneratingArticle}
                  className="px-4 py-1.5 text-xs font-medium text-muted border border-border rounded-lg hover:text-foreground hover:bg-surface-hover disabled:opacity-40 transition-colors"
                >
                  {regeneratingArticle ? 'Regenerating article...' : 'Regenerate Article'}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

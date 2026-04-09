'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface Slide {
  id: string
  slideIndex: number
  role: string
  text: string
  // V2 structured fields
  headline: string | null
  body: string | null
  supportingDetail: string | null
  factType: string | null
  containsNumber: boolean
  concretenessScore: number
  noveltyScore: number
  topicEntity: string | null
  qualityPassed: boolean
  // Compressed display fields
  displayTitle: string | null
  displaySupport: string | null
}

interface SlideImage {
  slideIndex: number
  imageUrl: string | null
  error?: string
}

interface Caption {
  id: string
  text: string
  hashtags: string[]
}

interface Post {
  id: string
  channelId: string
  dayIndex: number
  title: string
  hook: string
  type: string
  pattern: string | null
  status: string
  slides: Slide[]
  caption: Caption | null
}

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  CONTRARIAN: { label: 'Contrarian', color: 'text-[#b07ce8]', bg: 'bg-[rgba(176,124,232,0.1)]' },
  CALL_OUT: { label: 'Call out', color: 'text-danger', bg: 'bg-danger-dim' },
  MISTAKE_EXPOSURE: { label: 'Mistake exposure', color: 'text-accent', bg: 'bg-accent-dim' },
  HIDDEN_TRUTH: { label: 'Hidden truth', color: 'text-[#5bb8d4]', bg: 'bg-[rgba(91,184,212,0.1)]' },
}

const PATTERN_CONFIG: Record<string, { label: string }> = {
  // V1 patterns
  CONTRAST: { label: 'Contrast' },
  MISTAKE: { label: 'Mistake' },
  MYTH: { label: 'Myth Buster' },
  LIST: { label: 'List' },
  STORY: { label: 'Story' },
  BREAKDOWN: { label: 'Breakdown' },
  OPINION: { label: 'Opinion' },
  // V2 patterns
  SCALE: { label: 'Scale' },
  TIMELINE: { label: 'Timeline' },
  VERSUS: { label: 'Versus' },
  MECHANISM: { label: 'Mechanism' },
  MISCONCEPTION: { label: 'Misconception' },
  EXTREMES: { label: 'Extremes' },
}

const ROLE_CONFIG: Record<string, { label: string; accent: string; border: string; bg: string }> = {
  // V1 roles
  HOOK: { label: 'Hook', accent: 'text-danger', border: 'border-danger/20', bg: 'bg-danger-dim' },
  SETUP: { label: 'Setup', accent: 'text-warning', border: 'border-warning/20', bg: 'bg-warning-dim' },
  BUILD: { label: 'Build', accent: 'text-[#5b9bd5]', border: 'border-[rgba(91,155,213,0.2)]', bg: 'bg-[rgba(91,155,213,0.08)]' },
  TWIST: { label: 'Twist', accent: 'text-[#b07ce8]', border: 'border-[rgba(176,124,232,0.2)]', bg: 'bg-[rgba(176,124,232,0.08)]' },
  INSIGHT: { label: 'Insight', accent: 'text-success', border: 'border-success/20', bg: 'bg-success-dim' },
  CTA: { label: 'Call to action', accent: 'text-accent', border: 'border-accent/20', bg: 'bg-accent-dim' },
  // V2 roles
  OPENER: { label: 'Opener', accent: 'text-danger', border: 'border-danger/20', bg: 'bg-danger-dim' },
  FACT: { label: 'Fact', accent: 'text-[#5b9bd5]', border: 'border-[rgba(91,155,213,0.2)]', bg: 'bg-[rgba(91,155,213,0.08)]' },
  IMPLICATION: { label: 'Implication', accent: 'text-success', border: 'border-success/20', bg: 'bg-success-dim' },
}

const FACT_TYPE_LABELS: Record<string, string> = {
  statistic: 'Stat',
  comparison: 'Comparison',
  mechanism: 'Mechanism',
  historical: 'Historical',
  example: 'Example',
  definition: 'Definition',
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export default function PostDetailPage() {
  const params = useParams()
  const router = useRouter()
  const channelId = params.id as string
  const postId = params.postId as string
  const [post, setPost] = useState<Post | null>(null)
  const [allPosts, setAllPosts] = useState<{ id: string; dayIndex: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [flashMessage, setFlashMessage] = useState('')
  const [slideImages, setSlideImages] = useState<Record<number, string>>({})
  const [renderLoading, setRenderLoading] = useState(false)

  const fetchPost = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/${postId}`)
      if (!res.ok) throw new Error('Failed to fetch post')
      const data = await res.json()
      setPost(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load post')
    } finally {
      setLoading(false)
    }
  }, [postId])

  // Fetch all posts for prev/next navigation
  const fetchAllPosts = useCallback(async () => {
    try {
      const res = await fetch(`/api/channels/${channelId}/posts`)
      if (!res.ok) return
      const data = await res.json()
      setAllPosts(data.map((p: Post) => ({ id: p.id, dayIndex: p.dayIndex })).sort((a: { dayIndex: number }, b: { dayIndex: number }) => a.dayIndex - b.dayIndex))
    } catch {
      // Non-critical, silently fail
    }
  }, [channelId])

  useEffect(() => {
    fetchPost()
    fetchAllPosts()
  }, [fetchPost, fetchAllPosts])

  function showFlash(message: string) {
    setFlashMessage(message)
    setTimeout(() => setFlashMessage(''), 2000)
  }

  async function handleRegenerateHook() {
    setActionLoading('hook')
    setError('')
    try {
      const res = await fetch(`/api/posts/${postId}/regenerate-hook`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to regenerate hook')
      }
      await fetchPost()
      showFlash('Hook regenerated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleRegeneratePost() {
    setActionLoading('post')
    setError('')
    try {
      const res = await fetch(`/api/posts/${postId}/regenerate-post`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to regenerate post')
      }
      await fetchPost()
      showFlash('All slides regenerated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleRegenerateSlide(slideIndex: number) {
    setActionLoading(`slide-${slideIndex}`)
    setError('')
    try {
      const res = await fetch(`/api/posts/${postId}/regenerate-slide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slideIndex }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to regenerate slide')
      }
      await fetchPost()
      showFlash(`Slide ${slideIndex + 1} regenerated`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleRenderSlides() {
    setRenderLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/posts/${postId}/render`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to render slides')
      }
      const data = await res.json()
      const images: Record<number, string> = {}
      for (const slide of data.slides as SlideImage[]) {
        if (slide.imageUrl) {
          images[slide.slideIndex] = slide.imageUrl
        }
      }
      setSlideImages(images)
      showFlash(`${Object.keys(images).length} slides rendered`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Render failed')
    } finally {
      setRenderLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto pt-8">
        <div className="skeleton h-4 w-24 mb-6" />
        <div className="skeleton h-8 w-64 mb-8" />
        <div className="skeleton h-24 w-full max-w-xl mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-48 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="max-w-7xl mx-auto pt-16 text-center">
        <p className="text-danger text-[15px]">Post not found</p>
      </div>
    )
  }

  const typeInfo = TYPE_CONFIG[post.type] || { label: post.type, color: 'text-muted-light', bg: 'bg-surface' }

  // Prev/next navigation
  const currentIndex = allPosts.findIndex(p => p.id === postId)
  const prevPost = currentIndex > 0 ? allPosts[currentIndex - 1] : null
  const nextPost = currentIndex < allPosts.length - 1 ? allPosts[currentIndex + 1] : null

  // Caption word count
  const captionWordCount = post.caption ? wordCount(post.caption.text) : 0

  return (
    <div className="max-w-7xl mx-auto animate-fade-up">
      {/* Flash message */}
      {flashMessage && (
        <div className="fixed top-4 right-4 z-50 animate-scale-in bg-success-dim border border-success/20 px-4 py-2.5 rounded-lg">
          <p className="text-[13px] text-success font-medium">{flashMessage}</p>
        </div>
      )}

      {/* Back link */}
      <Link
        href={`/channels/${channelId}/posts`}
        className="text-muted hover:text-foreground text-[13px] transition-colors duration-200 inline-flex items-center gap-1.5"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8.5 3.5L5 7l3.5 3.5" />
        </svg>
        All posts
      </Link>

      {/* Header + Hook row */}
      <div className="mt-5 mb-8 flex flex-col lg:flex-row lg:items-start lg:gap-8">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[11px] font-mono text-muted tracking-wider">DAY {String(post.dayIndex).padStart(2, '0')}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono tracking-wide ${typeInfo.color} ${typeInfo.bg}`}>
              {typeInfo.label}
            </span>
            {post.pattern && PATTERN_CONFIG[post.pattern] && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono tracking-wide text-slate-400 bg-slate-400/10">
                {PATTERN_CONFIG[post.pattern].label}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight leading-tight mb-4 lg:mb-0">{post.title}</h1>
        </div>
        {/* Hook card */}
        <div className="lg:w-[420px] shrink-0 bg-surface border border-border rounded-xl p-5 transition-colors duration-200 hover:border-border-hover">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-mono text-muted uppercase tracking-[0.15em]">Hook</p>
            <button
              onClick={handleRegenerateHook}
              disabled={actionLoading !== null}
              className="px-2.5 py-1 border border-border hover:border-border-hover hover:bg-surface-hover text-[11px] font-semibold rounded-md transition-all duration-200 disabled:opacity-40"
            >
              {actionLoading === 'hook' ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
                </span>
              ) : 'Regen'}
            </button>
          </div>
          <p className="text-[15px] leading-relaxed font-medium">{post.hook}</p>
        </div>
      </div>

      {error && (
        <div className="animate-scale-in bg-danger-dim border border-danger/20 px-4 py-3 rounded-lg mb-6 max-w-xl">
          <p className="text-[13px] text-danger">{error}</p>
        </div>
      )}

      {/* Slides */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-mono text-muted uppercase tracking-[0.15em]">Slides</p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRenderSlides}
              disabled={renderLoading || actionLoading !== null}
              className="px-4 py-2 bg-violet hover:bg-violet/90 text-white rounded-lg text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {renderLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Rendering...
                </span>
              ) : 'Render slides'}
            </button>
            <button
              onClick={handleRegeneratePost}
              disabled={actionLoading !== null}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-background rounded-lg text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {actionLoading === 'post' ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                  Regenerating...
                </span>
              ) : 'Regenerate all slides'}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-3">
          {post.slides
            .sort((a, b) => a.slideIndex - b.slideIndex)
            .map((slide, i) => {
              const roleInfo = ROLE_CONFIG[slide.role] || { label: slide.role, accent: 'text-muted-light', border: 'border-border', bg: 'bg-surface' }
              const isV2 = slide.headline !== null
              const qualityBorder = !slide.qualityPassed ? 'border-warning/40' : roleInfo.border

              return (
                <div
                  key={slide.id}
                  className={`animate-fade-up border rounded-xl p-4 transition-all duration-200 hover:border-border-hover flex flex-col ${qualityBorder} ${roleInfo.bg}`}
                  style={{ animationDelay: `${(i + 2) * 60}ms` }}
                >
                  {/* Card header */}
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-muted">#{slide.slideIndex + 1}</span>
                      <span className={`text-[11px] font-semibold ${roleInfo.accent}`}>
                        {roleInfo.label}
                      </span>
                      {isV2 && slide.factType && FACT_TYPE_LABELS[slide.factType] && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono tracking-wide text-muted bg-surface">
                          {FACT_TYPE_LABELS[slide.factType]}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleRegenerateSlide(slide.slideIndex)}
                      disabled={actionLoading !== null}
                      className="px-2 py-0.5 border border-border/60 hover:border-border-hover hover:bg-background/40 text-[10px] font-semibold rounded transition-all duration-200 disabled:opacity-40"
                    >
                      {actionLoading === `slide-${slide.slideIndex}` ? (
                        <span className="w-2.5 h-2.5 border border-muted/30 border-t-muted rounded-full animate-spin inline-block" />
                      ) : 'Regen'}
                    </button>
                  </div>

                  {/* Rendered image preview */}
                  {slideImages[slide.slideIndex] && (
                    <div className="mb-3 -mx-4 -mt-4 rounded-t-xl overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={slideImages[slide.slideIndex]}
                        alt={`Slide ${slide.slideIndex + 1} render`}
                        className="w-full aspect-[4/5] object-cover"
                      />
                    </div>
                  )}

                  {/* Card content */}
                  {isV2 ? (
                    <div className="flex flex-col gap-2 flex-1">
                      {/* Compressed display (primary visual) */}
                      {slide.displayTitle ? (
                        <>
                          <p className="text-[15px] leading-snug font-bold">{slide.displayTitle}</p>
                          {slide.displaySupport && (
                            <p className="text-[12px] leading-snug text-foreground/60 font-medium">{slide.displaySupport}</p>
                          )}
                        </>
                      ) : (
                        /* Fallback: show headline + body if no compressed version */
                        <>
                          <p className="text-[13px] leading-snug font-semibold">{slide.headline}</p>
                          {slide.body && (
                            <p className="text-[12px] leading-relaxed text-foreground/75 flex-1">{slide.body}</p>
                          )}
                        </>
                      )}
                      {slide.supportingDetail && (
                        <p className="text-[10px] leading-snug text-accent/70 font-mono border-t border-border/50 pt-2 mt-auto">
                          {slide.supportingDetail}
                        </p>
                      )}
                      {!slide.qualityPassed && (
                        <span className="self-start px-1.5 py-0.5 rounded text-[9px] font-mono tracking-wide text-warning bg-warning-dim mt-1">
                          needs review
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-[12px] leading-relaxed whitespace-pre-wrap flex-1">{slide.text}</p>
                  )}
                </div>
              )
            })}
        </div>
      </div>

      {/* Caption */}
      {post.caption && (
        <div className="animate-fade-up stagger-8 bg-surface border border-border rounded-xl p-5 mb-8 max-w-3xl">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-mono text-muted uppercase tracking-[0.15em]">Caption</p>
            <span className="text-[11px] font-mono text-muted/50">{captionWordCount}w total</span>
          </div>
          <p className="text-[14px] leading-relaxed whitespace-pre-wrap mb-4">{post.caption.text}</p>
          {post.caption.hashtags && post.caption.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-3 border-t border-border">
              {(post.caption.hashtags as string[]).map((tag, i) => (
                <span
                  key={i}
                  className="text-[11px] font-mono text-accent/80 bg-accent-dim px-2 py-0.5 rounded-md"
                >
                  {tag.startsWith('#') ? tag : `#${tag}`}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Prev/Next navigation */}
      {allPosts.length > 1 && (
        <div className="border-t border-border pt-6 flex items-center justify-between">
          {prevPost ? (
            <button
              onClick={() => router.push(`/channels/${channelId}/posts/${prevPost.id}`)}
              className="text-muted hover:text-foreground text-[13px] transition-colors duration-200 inline-flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8.5 3.5L5 7l3.5 3.5" />
              </svg>
              Day {String(prevPost.dayIndex).padStart(2, '0')}
            </button>
          ) : (
            <div />
          )}
          {nextPost ? (
            <button
              onClick={() => router.push(`/channels/${channelId}/posts/${nextPost.id}`)}
              className="text-muted hover:text-foreground text-[13px] transition-colors duration-200 inline-flex items-center gap-1.5"
            >
              Day {String(nextPost.dayIndex).padStart(2, '0')}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5.5 3.5L9 7l-3.5 3.5" />
              </svg>
            </button>
          ) : (
            <div />
          )}
        </div>
      )}
    </div>
  )
}

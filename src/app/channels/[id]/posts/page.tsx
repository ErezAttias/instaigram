'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Post {
  id: string
  dayIndex: number
  title: string
  hook: string
  type: string
  pattern: string | null
  status: string
  carouselJobId: string | null
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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT: { label: 'Draft', color: 'text-muted-light', bg: 'bg-surface' },
  GENERATED: { label: 'Generated', color: 'text-success', bg: 'bg-success-dim' },
  REVIEWED: { label: 'Reviewed', color: 'text-[#5b9bd5]', bg: 'bg-[rgba(91,155,213,0.12)]' },
  APPROVED: { label: 'Approved', color: 'text-success', bg: 'bg-success-dim' },
}

export default function PostsPage() {
  const params = useParams()
  const channelId = params.id as string
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [compactView, setCompactView] = useState(false)

  useEffect(() => {
    async function fetchPosts() {
      try {
        const res = await fetch(`/api/channels/${channelId}/posts`)
        if (!res.ok) throw new Error('Failed to fetch posts')
        const data = await res.json()
        setPosts(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load posts')
      } finally {
        setLoading(false)
      }
    }
    fetchPosts()
  }, [channelId])

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto pt-8">
        <div className="skeleton h-8 w-32 mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="skeleton h-36" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto pt-16 text-center">
        <p className="text-danger text-[15px]">{error}</p>
      </div>
    )
  }

  // Type distribution summary
  const typeCounts: Record<string, number> = {}
  for (const post of posts) {
    typeCounts[post.type] = (typeCounts[post.type] || 0) + 1
  }

  return (
    <div className="animate-fade-up">
      <div className="flex items-end justify-between mb-6">
        <div>
          <Link
            href={`/channels/${channelId}`}
            className="text-muted hover:text-foreground text-[13px] transition-colors duration-200 inline-flex items-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8.5 3.5L5 7l3.5 3.5" />
            </svg>
            Dashboard
          </Link>
          <h1 className="text-3xl font-bold tracking-tight mt-2">Posts</h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setCompactView(!compactView)}
            className="text-[12px] font-mono text-muted hover:text-foreground transition-colors duration-200 px-2.5 py-1 border border-border rounded-md hover:border-border-hover"
          >
            {compactView ? 'Full view' : 'Compact view'}
          </button>
          <span className="text-[13px] font-mono text-muted">{posts.length} posts</span>
        </div>
      </div>

      {/* Type distribution summary */}
      <div className="flex flex-wrap gap-2 mb-6 p-3 bg-surface border border-border rounded-lg">
        <span className="text-[11px] font-mono text-muted uppercase tracking-[0.1em] self-center mr-1">Distribution:</span>
        {Object.entries(typeCounts).map(([type, count]) => {
          const typeInfo = TYPE_CONFIG[type] || { label: type, color: 'text-muted-light', bg: 'bg-surface' }
          return (
            <span
              key={type}
              className={`px-2 py-0.5 rounded text-[11px] font-mono tracking-wide ${typeInfo.color} ${typeInfo.bg}`}
            >
              {count} {typeInfo.label}
            </span>
          )
        })}
      </div>

      {compactView ? (
        /* Compact view: tight list with hook + day number */
        <div className="space-y-1">
          {posts.map((post, i) => {
            const typeInfo = TYPE_CONFIG[post.type] || { label: post.type, color: 'text-muted-light', bg: 'bg-surface' }
            return (
              <Link
                key={post.id}
                href={post.carouselJobId ? `/carousel/${post.carouselJobId}` : `/channels/${channelId}/posts/${post.id}`}
                className="animate-fade-up flex items-start gap-3 py-2.5 px-3 rounded-lg transition-all duration-200 hover:bg-surface-hover group"
                style={{ animationDelay: `${Math.min(i * 20, 300)}ms` }}
              >
                <span className="text-[11px] font-mono text-muted tracking-wider shrink-0 pt-0.5">
                  {String(post.dayIndex).padStart(2, '0')}
                </span>
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono tracking-wide ${typeInfo.color} ${typeInfo.bg}`}>
                  {typeInfo.label}
                </span>
                {post.pattern && PATTERN_CONFIG[post.pattern] && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono tracking-wide text-slate-400 bg-slate-400/10">
                    {PATTERN_CONFIG[post.pattern].label}
                  </span>
                )}
                {post.carouselJobId && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono tracking-wide text-success bg-success-dim">
                    Carousel
                  </span>
                )}
                <span className="text-[13px] leading-snug group-hover:text-accent transition-colors duration-200">
                  {post.hook}
                </span>
              </Link>
            )
          })}
        </div>
      ) : (
        /* Full view: grid cards with full hook text */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {posts.map((post, i) => {
            const typeInfo = TYPE_CONFIG[post.type] || { label: post.type, color: 'text-muted-light', bg: 'bg-surface' }
            const statusInfo = STATUS_CONFIG[post.status] || { label: post.status, color: 'text-muted-light', bg: 'bg-surface' }

            return (
              <Link
                key={post.id}
                href={post.carouselJobId ? `/carousel/${post.carouselJobId}` : `/channels/${channelId}/posts/${post.id}`}
                className="animate-fade-up group bg-surface border border-border rounded-xl p-5 transition-all duration-200 hover:border-border-hover hover:bg-surface-hover"
                style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-mono text-muted tracking-wider">
                    DAY {String(post.dayIndex).padStart(2, '0')}
                  </span>
                  <div className="flex gap-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono tracking-wide ${typeInfo.color} ${typeInfo.bg}`}>
                      {typeInfo.label}
                    </span>
                    {post.pattern && PATTERN_CONFIG[post.pattern] && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono tracking-wide text-slate-400 bg-slate-400/10">
                        {PATTERN_CONFIG[post.pattern].label}
                      </span>
                    )}
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono tracking-wide ${statusInfo.color} ${statusInfo.bg}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                </div>
                <h3 className="text-[14px] font-medium leading-snug group-hover:text-accent transition-colors duration-200 mb-2">
                  {post.title}
                </h3>
                <p className="text-[12px] text-muted leading-relaxed">{post.hook}</p>
              </Link>
            )
          })}
        </div>
      )}

      <div className="mt-10 pt-6 border-t border-border flex justify-center">
        <Link
          href={`/channels/${channelId}/validation`}
          className="text-muted hover:text-foreground text-[13px] transition-colors duration-200 inline-flex items-center gap-1.5"
        >
          View validation report
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5.5 3.5L9 7l-3.5 3.5" />
          </svg>
        </Link>
      </div>
    </div>
  )
}

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

// ─── Types ──────────────────────────────────────────────────

export interface InstagramPreviewProps {
  /** Username displayed in the header and caption */
  username: string;
  /** Whether the account is verified (shows blue checkmark) */
  verified?: boolean;
  /** URL for the profile picture (renders initial if omitted) */
  profilePicUrl?: string;
  /** Array of slide image URLs */
  slides: string[];
  /** The post caption text (supports newlines) */
  caption: string;
  /** Hashtags string (e.g. "#apple #samsung #technology") */
  hashtags?: string;
  /** Number of likes to display (e.g. "50K") */
  likesCount?: string;
  /** Timestamp text (e.g. "January 30", "2 hours ago") */
  timestamp?: string;
  /** Optional comments to display */
  comments?: {
    username: string;
    text: string;
    likes?: number;
    timeAgo?: string;
    replies?: number;
  }[];
}

// ─── SVG Icons (Instagram-accurate) ─────────────────────────

function HeartIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-label="Like" className={className} fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
      <path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-1.834-1.539-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938m0-2a6.04 6.04 0 0 0-4.797 2.127 6.052 6.052 0 0 0-4.787-2.127A6.985 6.985 0 0 0 .5 9.122c0 3.61 2.55 5.827 5.015 7.97.283.246.569.494.853.747l1.027.918a44.998 44.998 0 0 0 3.518 3.018 2 2 0 0 0 2.174 0 45.263 45.263 0 0 0 3.626-3.115l.922-.824c.293-.26.59-.519.885-.774 2.334-2.025 4.98-4.32 4.98-7.94a6.985 6.985 0 0 0-6.708-7.218Z" />
    </svg>
  );
}

function CommentIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-label="Comment" className={className} fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
      <path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function ShareIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-label="Share Post" className={className} fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
      <line fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" x1="22" x2="9.218" y1="3" y2="10.083" />
      <polygon fill="none" points="11.698 20.334 22 3.001 2 3.001 9.218 10.084 11.698 20.334" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function SaveIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-label="Save" className={className} fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
      <polygon fill="none" points="20 21 12 13.44 4 21 4 3 20 3 20 21" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function MoreIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-label="More options" className={className} fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="18" cy="12" r="1.5" />
    </svg>
  );
}

function VerifiedBadge() {
  return (
    <svg aria-label="Verified" className="inline-block ml-1" fill="#0095f6" height="12" role="img" viewBox="0 0 40 40" width="12">
      <path d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v6.354h6.234L14.638 40l5.36-3.094L25.358 40l2.97-5.15h6.239v-6.354L40 25.359 36.905 20 40 14.641l-5.433-3.137V5.15h-6.238L25.359 0l-5.36 3.094Zm7.415 11.225 2.254 2.287-11.43 11.5-6.835-6.93 2.244-2.258 4.587 4.581 9.18-9.18Z" fillRule="evenodd" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ─── Component ──────────────────────────────────────────────

export default function InstagramPreview({
  username,
  verified = false,
  profilePicUrl,
  slides,
  caption,
  hashtags,
  likesCount = '0',
  timestamp = 'Just now',
  comments = [],
}: InstagramPreviewProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [captionExpanded, setCaptionExpanded] = useState(true);
  const touchStartX = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalSlides = slides.length;
  const isMultiSlide = totalSlides > 1;

  const goTo = useCallback((index: number) => {
    setCurrentSlide(Math.max(0, Math.min(index, totalSlides - 1)));
  }, [totalSlides]);

  const prev = useCallback(() => goTo(currentSlide - 1), [currentSlide, goTo]);
  const next = useCallback(() => goTo(currentSlide + 1), [currentSlide, goTo]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [prev, next]);

  // Touch swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) next();
      else prev();
    }
    touchStartX.current = null;
  };

  // Caption truncation
  const captionLines = caption.split('\n');
  const shouldTruncate = caption.length > 125;
  const displayCaption = captionExpanded ? caption : caption.slice(0, 125);

  const initial = username.charAt(0).toUpperCase();

  return (
    <div className="ig-preview-root" style={{ maxWidth: 862 }}>
      <div className="ig-post">
        {/* ── LEFT: Image carousel ── */}
        <div className="ig-media-container">
          <div
            className="ig-carousel"
            ref={containerRef}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className="ig-carousel-track"
              style={{
                transform: `translateX(-${currentSlide * 100}%)`,
                transition: 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              }}
            >
              {slides.map((src, i) => (
                <div key={i} className="ig-slide">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Slide ${i + 1}`}
                    className="ig-slide-img"
                    draggable={false}
                  />
                </div>
              ))}
            </div>

            {/* Navigation arrows */}
            {isMultiSlide && currentSlide > 0 && (
              <button
                className="ig-nav-btn ig-nav-left"
                onClick={prev}
                aria-label="Previous slide"
              >
                <ChevronLeftIcon />
              </button>
            )}
            {isMultiSlide && currentSlide < totalSlides - 1 && (
              <button
                className="ig-nav-btn ig-nav-right"
                onClick={next}
                aria-label="Next slide"
              >
                <ChevronRightIcon />
              </button>
            )}

            {/* Slide counter (top right) */}
            {isMultiSlide && (
              <div className="ig-slide-counter">
                {currentSlide + 1}/{totalSlides}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Content panel ── */}
        <div className="ig-content-panel">
          {/* Header */}
          <div className="ig-header">
            <div className="ig-header-left">
              <div className="ig-avatar">
                {profilePicUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profilePicUrl} alt={username} className="ig-avatar-img" />
                ) : (
                  <span className="ig-avatar-initial">{initial}</span>
                )}
              </div>
              <span className="ig-username">
                {username}
                {verified && <VerifiedBadge />}
              </span>
            </div>
            <button className="ig-more-btn" aria-label="More options">
              <MoreIcon />
            </button>
          </div>

          {/* Scrollable content area */}
          <div className="ig-body">
            {/* Caption */}
            <div className="ig-caption">
              <span className="ig-username ig-username-inline">{username}</span>
              {verified && <VerifiedBadge />}
              {' '}
              <span className="ig-caption-text">
                {shouldTruncate && !captionExpanded ? (
                  <>
                    {displayCaption}...{' '}
                    <button
                      className="ig-more-text"
                      onClick={() => setCaptionExpanded(true)}
                    >
                      more
                    </button>
                  </>
                ) : (
                  caption.split('\n').map((line, i) => (
                    <span key={i}>
                      {i > 0 && <br />}
                      {line}
                    </span>
                  ))
                )}
              </span>
            </div>

            {/* Hashtags */}
            {hashtags && (
              <div className="ig-hashtags">{hashtags}</div>
            )}

            {/* Comments */}
            {comments.length > 0 && (
              <div className="ig-comments">
                {comments.map((comment, i) => (
                  <div key={i} className="ig-comment">
                    <div className="ig-comment-content">
                      <span className="ig-username ig-username-inline">{comment.username}</span>
                      {' '}
                      <span className="ig-comment-text">{comment.text}</span>
                    </div>
                    <div className="ig-comment-meta">
                      {comment.timeAgo && <span>{comment.timeAgo}</span>}
                      {comment.likes !== undefined && comment.likes > 0 && (
                        <span>{comment.likes} {comment.likes === 1 ? 'like' : 'likes'}</span>
                      )}
                      <button className="ig-reply-btn">Reply</button>
                      {comment.replies !== undefined && comment.replies > 0 && (
                        <button className="ig-view-replies">
                          ── View replies ({comment.replies})
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action bar */}
          <div className="ig-actions">
            {/* Dots indicator — centered between image and actions */}
            {isMultiSlide && (
              <div className="ig-dots-row">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    className={`ig-dot ${i === currentSlide ? 'ig-dot-active' : ''}`}
                    onClick={() => goTo(i)}
                    aria-label={`Go to slide ${i + 1}`}
                  />
                ))}
              </div>
            )}

            <div className="ig-actions-row">
              <div className="ig-actions-left">
                <button className="ig-action-btn" aria-label="Like"><HeartIcon /></button>
                <button className="ig-action-btn" aria-label="Comment"><CommentIcon /></button>
                <button className="ig-action-btn" aria-label="Share"><ShareIcon /></button>
              </div>

              <button className="ig-action-btn" aria-label="Save"><SaveIcon /></button>
            </div>

            {/* Likes */}
            <div className="ig-likes">{likesCount} likes</div>

            {/* Timestamp */}
            <div className="ig-timestamp">{timestamp}</div>

            {/* Add comment */}
            <div className="ig-add-comment">
              <input
                type="text"
                placeholder="Add a comment..."
                className="ig-comment-input"
                readOnly
              />
              <button className="ig-post-btn" disabled>Post</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

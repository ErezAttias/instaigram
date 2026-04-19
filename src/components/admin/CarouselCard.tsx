'use client';

import { useState } from 'react';
import Link from 'next/link';

interface CarouselCardProps {
  id: string;
  topic: string;
  direction: string | null;
  status: string;
  approved: boolean;
  thumbnailUrl: string | null;
  channelId: string | null;
  channelName: string | null;
  createdAt: string;
  updatedAt: string;
  onDelete?: (id: string) => void;
}

export function CarouselCard({
  id,
  topic,
  direction,
  status,
  approved,
  thumbnailUrl,
  channelName,
  updatedAt,
  onDelete,
}: CarouselCardProps) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${topic}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/carousel/${id}`, { method: 'DELETE' });
      if (res.ok) onDelete?.(id);
    } finally {
      setDeleting(false);
    }
  }

  const timeLabel = (() => {
    const d = new Date(updatedAt);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);
    if (diffH < 1) return 'Just now';
    if (diffH < 24) return `${diffH}h ago`;
    if (diffD === 1) return 'Yesterday';
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  })();

  const statusLabel = (() => {
    if (approved) return { label: 'Approved', tone: 'bg-success/15 text-success border-success/30' };
    if (status === 'COMPLETE') return { label: 'Ready', tone: 'bg-blue-500/15 text-blue-300 border-blue-400/30' };
    if (status === 'FAILED') return { label: 'Failed', tone: 'bg-danger/15 text-danger border-danger/30' };
    if (status === 'RENDERING') return { label: 'Rendering', tone: 'bg-accent/15 text-accent border-accent/30' };
    return { label: 'Draft', tone: 'bg-muted/15 text-muted-light border-border' };
  })();

  return (
    <Link
      href={`/carousel/${id}`}
      className="group grid items-center gap-x-4 bg-surface rounded-xl border border-border px-3 py-2.5 hover:border-border-hover hover:bg-surface-hover transition-all duration-200"
      style={{ gridTemplateColumns: '56px 1fr 110px 120px 100px 28px' }}
    >
      {/* Thumbnail */}
      <div className="w-14 h-14 rounded-lg overflow-hidden bg-surface-elevated flex-shrink-0">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted/50">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="8.5" cy="10.5" r="1.5" fill="currentColor" />
              <path d="M21 17l-5-5-4 4-2-2-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>

      {/* Title + channel */}
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground transition-colors duration-200 group-hover:text-[#dc2743] truncate">
          {topic}
        </h3>
        {direction && direction !== topic && (
          <p className="text-xs text-muted-light mt-0.5 truncate">{direction}</p>
        )}
      </div>

      {/* Status */}
      <span className={`inline-flex items-center px-2.5 h-6 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${statusLabel.tone}`}>
        {statusLabel.label}
      </span>

      {/* Channel hint */}
      <span className="text-xs text-muted-light truncate">
        {channelName && channelName !== topic ? channelName : ''}
      </span>

      {/* Time */}
      <span className="text-xs text-muted whitespace-nowrap text-right">
        {timeLabel}
      </span>

      {/* Delete */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        title="Delete carousel"
        className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10 text-muted hover:text-red-400 disabled:opacity-30 shrink-0"
      >
        {deleting ? (
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        )}
      </button>
    </Link>
  );
}

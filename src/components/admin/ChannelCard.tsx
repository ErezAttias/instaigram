'use client';

import { useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from './StatusBadge';

interface ChannelCardProps {
  id: string;
  name: string;
  niche: string | null;
  language: string;
  status: string;
  carouselCount: number;
  lastCarouselAt: string | null;
  createdAt: string;
  onDelete?: (id: string) => void;
}

export function ChannelCard({
  id,
  name,
  niche,
  language,
  status,
  carouselCount,
  lastCarouselAt,
  onDelete,
}: ChannelCardProps) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/channels/${id}`, { method: 'DELETE' });
      if (res.ok) onDelete?.(id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Link
      href={`/admin/channels/${id}`}
      className="group block bg-surface rounded-xl border border-border p-5 hover:border-border-hover hover:bg-surface-hover transition-all duration-200"
    >
      <div className="flex items-start gap-2 mb-3">
        <h3 className="flex-1 text-base font-semibold text-foreground group-hover:text-accent transition-colors truncate">
          {name}
        </h3>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <StatusBadge status={status} />
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Delete channel"
            className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10 text-muted hover:text-red-400 disabled:opacity-30"
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
        </div>
      </div>

      {niche && (
        <p className="text-sm text-muted-light mb-4 line-clamp-2">{niche}</p>
      )}

      <div className="flex items-center justify-between text-xs text-muted">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            {carouselCount} carousel{carouselCount !== 1 ? 's' : ''}
          </span>
          <span className="uppercase tracking-wide">{language}</span>
        </div>
        {lastCarouselAt && (
          <span>
            Last: {new Date(lastCarouselAt).toLocaleDateString()}
          </span>
        )}
      </div>
    </Link>
  );
}

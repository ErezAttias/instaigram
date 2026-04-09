'use client';

import Link from 'next/link';
import { StatusBadge } from './StatusBadge';

interface CarouselThumbnailProps {
  id: string;
  channelId: string;
  topic: string;
  direction: string | null;
  status: string;
  approved: boolean;
  thumbnailUrl: string | null;
  createdAt: string;
  onDelete: (jobId: string) => void;
  onExport: (jobId: string) => void;
}

export function CarouselThumbnail({
  id,
  channelId,
  topic,
  status,
  approved,
  thumbnailUrl,
  createdAt,
  onDelete,
  onExport,
}: CarouselThumbnailProps) {
  return (
    <div className="group bg-surface rounded-xl border border-border overflow-hidden hover:border-border-hover transition-all duration-200">
      {/* Thumbnail */}
      <Link href={`/admin/channels/${channelId}/carousels/${id}`}>
        <div className="aspect-[4/5] bg-surface-elevated relative overflow-hidden">
          {status === 'COMPLETE' || status === 'APPROVED' ? (
            <img
              src={`/api/carousel/${id}/thumbnail`}
              alt={topic}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                {status === 'GENERATING' || status === 'RENDERING' ? (
                  <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                ) : status === 'FAILED' ? (
                  <svg className="w-8 h-8 text-danger mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8 text-muted mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
                <p className="text-xs text-muted">{status === 'PENDING' ? 'Waiting...' : status === 'FAILED' ? 'Failed' : 'Generating...'}</p>
              </div>
            </div>
          )}

          {approved && (
            <div className="absolute top-2 right-2 bg-success/90 text-background text-xs font-bold px-2 py-0.5 rounded-full">
              Approved
            </div>
          )}
        </div>
      </Link>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <Link
            href={`/admin/channels/${channelId}/carousels/${id}`}
            className="text-sm font-medium text-foreground hover:text-accent transition-colors line-clamp-2 flex-1"
          >
            {topic}
          </Link>
          <StatusBadge status={status} />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">
            {new Date(createdAt).toLocaleDateString()}
          </span>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {approved && (
              <button
                onClick={() => onExport(id)}
                className="p-1.5 rounded-md hover:bg-surface-hover text-muted hover:text-accent transition-colors"
                title="Export ZIP"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            )}
            <button
              onClick={() => onDelete(id)}
              className="p-1.5 rounded-md hover:bg-danger-dim text-muted hover:text-danger transition-colors"
              title="Delete"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

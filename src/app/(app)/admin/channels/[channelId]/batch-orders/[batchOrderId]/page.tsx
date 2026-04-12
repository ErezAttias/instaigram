'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { StatusBadge } from '@/components/admin/StatusBadge';

// ─── Types ──────────────────────────────────────────────────

interface CarouselJobSummary {
  id: string;
  topic: string;
  status: string;
  approved: boolean;
  createdAt: string;
  thumbnailUrl: string | null;
}

interface BatchOrderDetail {
  id: string;
  channelId: string;
  status: string;
  size: number;
  completed: number;
  failed: number;
  direction: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  carouselJobs: CarouselJobSummary[];
}

interface SSEPayload {
  status: string;
  size: number;
  completed: number;
  failed: number;
  currentIndex: number;
  currentJobId: string | null;
  message: string;
  jobs: { id: string; topic: string; status: string }[];
}

// ─── Component ──────────────────────────────────────────────

export default function BatchOrderDashboardPage() {
  const params = useParams();
  const channelId = params.channelId as string;
  const batchOrderId = params.batchOrderId as string;

  const [order, setOrder] = useState<BatchOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveData, setLiveData] = useState<SSEPayload | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/channels/${channelId}/batch-orders/${batchOrderId}`);
      if (res.ok) {
        const data = await res.json();
        setOrder(data);
      }
    } catch (err) {
      console.error('Failed to fetch batch order:', err);
    } finally {
      setLoading(false);
    }
  }, [channelId, batchOrderId]);

  // Initial fetch
  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // SSE connection for live updates
  useEffect(() => {
    if (!order) return;
    const isTerminal = order.status === 'COMPLETE' || order.status === 'FAILED';
    if (isTerminal) return;

    const es = new EventSource(`/api/admin/channels/${channelId}/batch-orders/${batchOrderId}/status`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SSEPayload;
        setLiveData(data);

        // Update order state from SSE data
        setOrder(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            status: data.status,
            completed: data.completed,
            failed: data.failed,
            carouselJobs: data.jobs.length > 0
              ? data.jobs.map(j => ({
                  ...j,
                  approved: false,
                  createdAt: '',
                  thumbnailUrl: null,
                }))
              : prev.carouselJobs,
          };
        });

        // On terminal status, refetch full data with thumbnails
        if (data.status === 'COMPLETE' || data.status === 'FAILED') {
          es.close();
          fetchOrder();
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
      // Refetch to get latest state
      fetchOrder();
    };

    return () => {
      es.close();
    };
  }, [order?.status, channelId, batchOrderId, fetchOrder]);

  if (loading) {
    return (
      <div className="max-w-4xl">
        <div className="skeleton h-8 w-48 rounded-lg mb-4" />
        <div className="skeleton h-4 w-64 rounded mb-8" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton aspect-[4/5] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-20 text-muted">
        Batch order not found.
      </div>
    );
  }

  const isActive = order.status === 'PENDING' || order.status === 'GENERATING_HOOKS' || order.status === 'RUNNING';
  const progressDone = order.completed + order.failed;
  const progressPct = order.size > 0 ? Math.round((progressDone / order.size) * 100) : 0;
  const currentIndex = liveData?.currentIndex || 0;
  const currentJobId = liveData?.currentJobId || null;

  return (
    <div className="max-w-4xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-muted mb-6">
        <Link href="/admin" className="hover:text-foreground transition-colors">Dashboard</Link>
        <span>/</span>
        <Link href={`/admin/channels/${channelId}`} className="hover:text-foreground transition-colors">Channel</Link>
        <span>/</span>
        <span className="text-muted-light">Batch Order</span>
      </nav>

      {/* Header */}
      <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-foreground">Batch Order</h1>
            <StatusBadge status={order.status} />
            {isActive && (
              <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
            )}
          </div>
          <span className="text-xs text-muted">
            {new Date(order.createdAt).toLocaleDateString()}
          </span>
        </div>

        {order.direction && (
          <p className="text-sm text-muted mb-3">Direction: {order.direction}</p>
        )}

        {/* Progress bar */}
        <div className="mb-2">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-foreground font-medium">
              {order.completed} of {order.size} complete
              {order.failed > 0 && (
                <span className="text-danger ml-1">({order.failed} failed)</span>
              )}
            </span>
            <span className="text-muted">{progressPct}%</span>
          </div>
          <div className="h-2 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {liveData?.message && isActive && (
          <p className="text-xs text-muted mt-2">{liveData.message}</p>
        )}

        {order.errorMessage && order.status === 'FAILED' && (
          <p className="text-xs text-danger mt-2">{order.errorMessage}</p>
        )}

        {order.completedAt && (
          <p className="text-xs text-muted mt-2">
            Completed: {new Date(order.completedAt).toLocaleString()}
          </p>
        )}
      </div>

      {/* Carousel grid */}
      <h2 className="text-lg font-semibold text-foreground mb-3">
        Carousels
        <span className="text-sm font-normal text-muted ml-2">({order.carouselJobs.length})</span>
      </h2>

      {order.carouselJobs.length === 0 && isActive && (
        <div className="text-center py-12 text-muted text-sm">
          Generating topics... Carousels will appear here as they start.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {order.carouselJobs.map((job, idx) => {
          const isCurrentlyGenerating = isActive && currentJobId === job.id;
          const isPending = job.status === 'PENDING' || job.status === 'GENERATING' || job.status === 'RENDERING';
          const isComplete = job.status === 'COMPLETE';
          const isFailed = job.status === 'FAILED';

          return (
            <Link
              key={job.id}
              href={`/admin/channels/${channelId}/carousels/${job.id}`}
              className={`relative bg-surface-elevated border rounded-xl overflow-hidden transition-all hover:border-accent/40 ${
                isCurrentlyGenerating ? 'border-accent ring-1 ring-accent/20' : 'border-border'
              }`}
            >
              {/* Thumbnail or placeholder */}
              <div className="aspect-[4/5] bg-surface flex items-center justify-center">
                {job.thumbnailUrl ? (
                  <img
                    src={job.thumbnailUrl}
                    alt={job.topic}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center p-4">
                    {isCurrentlyGenerating && (
                      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    )}
                    <span className="text-xs text-muted">
                      {isPending ? 'Generating...' : isFailed ? 'Failed' : `#${idx + 1}`}
                    </span>
                  </div>
                )}
              </div>

              {/* Info bar */}
              <div className="p-2.5">
                <p className="text-xs text-foreground font-medium truncate">{job.topic}</p>
                <div className="flex items-center justify-between mt-1">
                  <StatusBadge status={job.status} />
                  {isCurrentlyGenerating && (
                    <span className="text-[10px] text-accent font-medium">In progress</span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}

        {/* Placeholder cards for carousels not yet created */}
        {isActive && order.carouselJobs.length < order.size && (
          [...Array(order.size - order.carouselJobs.length)].map((_, i) => (
            <div
              key={`placeholder-${i}`}
              className="bg-surface-elevated border border-border border-dashed rounded-xl overflow-hidden opacity-40"
            >
              <div className="aspect-[4/5] bg-surface flex items-center justify-center">
                <span className="text-xs text-muted">#{order.carouselJobs.length + i + 1}</span>
              </div>
              <div className="p-2.5">
                <div className="h-3 bg-border rounded w-2/3" />
                <div className="h-3 bg-border rounded w-1/4 mt-1.5" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

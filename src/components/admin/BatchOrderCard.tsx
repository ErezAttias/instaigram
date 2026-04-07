'use client';

import Link from 'next/link';
import { StatusBadge } from './StatusBadge';

interface BatchOrderCardProps {
  order: {
    id: string;
    channelId: string;
    status: string;
    size: number;
    completed: number;
    failed: number;
    createdAt: string;
    direction?: string | null;
  };
}

export function BatchOrderCard({ order }: BatchOrderCardProps) {
  const isActive = order.status === 'PENDING' || order.status === 'GENERATING_HOOKS' || order.status === 'RUNNING';
  const progressPct = order.size > 0 ? Math.round(((order.completed + order.failed) / order.size) * 100) : 0;

  return (
    <Link
      href={`/admin/channels/${order.channelId}/batch-orders/${order.id}`}
      className="block bg-surface-elevated border border-border rounded-xl p-4 hover:border-accent/40 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} />
          {isActive && (
            <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
          )}
        </div>
        <span className="text-xs text-muted">
          {new Date(order.createdAt).toLocaleDateString()}
        </span>
      </div>

      <p className="text-sm text-foreground font-medium">
        {order.completed} of {order.size} complete
        {order.failed > 0 && (
          <span className="text-danger ml-1">({order.failed} failed)</span>
        )}
      </p>

      {order.direction && (
        <p className="text-xs text-muted mt-1 truncate">{order.direction}</p>
      )}

      {/* Progress bar */}
      {isActive && (
        <div className="mt-3 h-1 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </Link>
  );
}

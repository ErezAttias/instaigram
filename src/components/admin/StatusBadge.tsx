'use client';

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  PENDING: { bg: 'bg-warning-dim', text: 'text-warning', label: 'Pending' },
  GENERATING: { bg: 'bg-violet-dim', text: 'text-violet', label: 'Generating' },
  RENDERING: { bg: 'bg-accent-dim', text: 'text-accent', label: 'Rendering' },
  COMPLETE: { bg: 'bg-success-dim', text: 'text-success', label: 'Complete' },
  FAILED: { bg: 'bg-danger-dim', text: 'text-danger', label: 'Failed' },
  DRAFT: { bg: 'bg-surface-elevated', text: 'text-muted', label: 'Draft' },
  NICHE_SELECTED: { bg: 'bg-violet-dim', text: 'text-violet', label: 'Niche Selected' },
  STRATEGY_DEFINED: { bg: 'bg-accent-dim', text: 'text-accent', label: 'Strategy Set' },
  POSITIONED: { bg: 'bg-accent-dim', text: 'text-accent', label: 'Positioned' },
  NAMED: { bg: 'bg-accent-dim', text: 'text-accent', label: 'Named' },
  HOOKS_GENERATED: { bg: 'bg-success-dim', text: 'text-success', label: 'Hooks Ready' },
  CONTENT_GENERATED: { bg: 'bg-success-dim', text: 'text-success', label: 'Content Ready' },
  // Batch order statuses
  GENERATING_HOOKS: { bg: 'bg-violet-dim', text: 'text-violet', label: 'Generating Topics' },
  RUNNING: { bg: 'bg-accent-dim', text: 'text-accent', label: 'Running' },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || { bg: 'bg-surface-elevated', text: 'text-muted', label: status };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

'use client';

import { useState } from 'react';

interface CreateBatchOrderDialogProps {
  channelId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (batchOrderId: string) => void;
}

export function CreateBatchOrderDialog({ channelId, open, onClose, onCreated }: CreateBatchOrderDialogProps) {
  const [size, setSize] = useState(5);
  const [topicMode, setTopicMode] = useState<'ai' | 'manual'>('ai');
  const [topics, setTopics] = useState<string[]>(['']);
  const [direction, setDirection] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  function handleSizeChange(newSize: number) {
    const clamped = Math.min(Math.max(newSize, 1), 10);
    setSize(clamped);
    // Adjust topics array to match new size
    if (topicMode === 'manual') {
      setTopics(prev => {
        const next = [...prev];
        while (next.length < clamped) next.push('');
        return next.slice(0, clamped);
      });
    }
  }

  function handleTopicModeChange(mode: 'ai' | 'manual') {
    setTopicMode(mode);
    if (mode === 'manual') {
      setTopics(prev => {
        const next = [...prev];
        while (next.length < size) next.push('');
        return next.slice(0, size);
      });
    }
  }

  function handleTopicChange(index: number, value: string) {
    setTopics(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const payload: Record<string, unknown> = { size, direction: direction.trim() || undefined };
    if (topicMode === 'manual') {
      const filtered = topics.map(t => t.trim()).filter(Boolean);
      if (filtered.length === 0) {
        setError('Please enter at least one topic');
        setLoading(false);
        return;
      }
      payload.topics = filtered;
      payload.size = filtered.length;
    }

    try {
      const res = await fetch(`/api/admin/channels/${channelId}/batch-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create batch order');
      }

      const data = await res.json();
      setSize(5);
      setTopicMode('ai');
      setTopics(['']);
      setDirection('');
      onCreated(data.batchOrderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-surface border border-border rounded-2xl p-6 w-full max-w-md mx-4 animate-scale-in max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-foreground mb-1">Batch Order</h2>
        <p className="text-sm text-muted mb-5">Generate multiple carousels at once. Fire it off and come back when they're ready.</p>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* Count */}
            <div>
              <label className="block text-xs font-medium text-muted-light mb-1.5">
                Number of carousels
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleSizeChange(size - 1)}
                  disabled={size <= 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-elevated border border-border text-foreground hover:bg-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  -
                </button>
                <span className="text-lg font-semibold text-foreground w-8 text-center">{size}</span>
                <button
                  type="button"
                  onClick={() => handleSizeChange(size + 1)}
                  disabled={size >= 10}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-elevated border border-border text-foreground hover:bg-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  +
                </button>
                <span className="text-xs text-muted ml-1">max 10</span>
              </div>
            </div>

            {/* Topic mode toggle */}
            <div>
              <label className="block text-xs font-medium text-muted-light mb-1.5">
                Topics
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleTopicModeChange('ai')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    topicMode === 'ai'
                      ? 'bg-accent/15 border-accent text-accent'
                      : 'bg-surface-elevated border-border text-muted-light hover:text-foreground'
                  }`}
                >
                  AI picks topics
                </button>
                <button
                  type="button"
                  onClick={() => handleTopicModeChange('manual')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    topicMode === 'manual'
                      ? 'bg-accent/15 border-accent text-accent'
                      : 'bg-surface-elevated border-border text-muted-light hover:text-foreground'
                  }`}
                >
                  I'll specify
                </button>
              </div>
            </div>

            {/* Manual topics list */}
            {topicMode === 'manual' && (
              <div className="space-y-2">
                {topics.map((topic, i) => (
                  <input
                    key={i}
                    type="text"
                    value={topic}
                    onChange={e => handleTopicChange(i, e.target.value)}
                    placeholder={`Topic ${i + 1}`}
                    className="w-full bg-surface-elevated border border-border rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none"
                  />
                ))}
              </div>
            )}

            {/* Direction */}
            <div>
              <label className="block text-xs font-medium text-muted-light mb-1.5">
                Direction <span className="text-muted">(optional)</span>
              </label>
              <input
                type="text"
                value={direction}
                onChange={e => setDirection(e.target.value)}
                placeholder="e.g. Focus on surprising mechanisms"
                className="w-full bg-surface-elevated border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <p className="mt-3 text-xs text-danger">{error}</p>
          )}

          <div className="flex items-center justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-light hover:text-foreground transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-accent text-background text-sm font-medium rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Placing order...' : `Order ${topicMode === 'manual' ? topics.filter(t => t.trim()).length || size : size} Carousels`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

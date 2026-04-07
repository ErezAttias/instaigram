'use client';

import { useState } from 'react';

interface CreateCarouselDialogProps {
  channelId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (jobId: string) => void;
}

export function CreateCarouselDialog({ channelId, open, onClose, onCreated }: CreateCarouselDialogProps) {
  const [topic, setTopic] = useState('');
  const [direction, setDirection] = useState('');
  const [exactSubject, setExactSubject] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/admin/channels/${channelId}/carousels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          direction: direction.trim() || undefined,
          exactSubject: exactSubject.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create carousel');
      }

      const data = await res.json();
      setTopic('');
      setDirection('');
      setExactSubject('');
      onCreated(data.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-surface border border-border rounded-2xl p-6 w-full max-w-md mx-4 animate-scale-in">
        <h2 className="text-lg font-semibold text-foreground mb-1">New Carousel</h2>
        <p className="text-sm text-muted mb-5">Generate a carousel for this channel.</p>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-light mb-1.5">
                Topic
              </label>
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g. Why honey never spoils"
                className="w-full bg-surface-elevated border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-light mb-1.5">
                Direction <span className="text-muted">(optional)</span>
              </label>
              <input
                type="text"
                value={direction}
                onChange={e => setDirection(e.target.value)}
                placeholder="e.g. Focus on the chemistry behind it"
                className="w-full bg-surface-elevated border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-light mb-1.5">
                Exact subject <span className="text-muted">(optional — locks to this specific concept)</span>
              </label>
              <input
                type="text"
                value={exactSubject}
                onChange={e => setExactSubject(e.target.value)}
                placeholder="e.g. The Moonwalk"
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
              disabled={!topic.trim() || loading}
              className="px-5 py-2 bg-accent text-background text-sm font-medium rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : 'Generate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

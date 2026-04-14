'use client';

import { useState } from 'react';

type CarouselLayout = 'DETAILED' | 'BOLD';

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
  const [layout, setLayout] = useState<CarouselLayout>('DETAILED');
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
          layout,
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
      setLayout('DETAILED');
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

            {/* Layout Picker */}
            <div>
              <label className="block text-xs font-medium text-muted-light mb-2">
                Layout
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setLayout('DETAILED')}
                  className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                    layout === 'DETAILED'
                      ? 'border-accent bg-accent/5'
                      : 'border-border hover:border-border-hover'
                  }`}
                >
                  {/* Mini preview: image + text bar */}
                  <div className="w-full aspect-[4/5] rounded-lg overflow-hidden bg-surface-elevated">
                    <div className="h-[76%] bg-gradient-to-br from-zinc-700 to-zinc-800" />
                    <div className="h-[24%] bg-black px-2 pt-1.5">
                      <div className="h-1.5 w-3/4 bg-white/80 rounded-full mb-1" />
                      <div className="h-1 w-full bg-white/30 rounded-full mb-0.5" />
                      <div className="h-1 w-2/3 bg-white/30 rounded-full" />
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-medium text-foreground">Detailed</div>
                    <div className="text-[10px] text-muted leading-tight">Headline + paragraph</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setLayout('BOLD')}
                  className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                    layout === 'BOLD'
                      ? 'border-accent bg-accent/5'
                      : 'border-border hover:border-border-hover'
                  }`}
                >
                  {/* Mini preview: full-bleed with big text */}
                  <div className="w-full aspect-[4/5] rounded-lg overflow-hidden bg-gradient-to-b from-zinc-700 via-zinc-800 to-black relative">
                    <div className="absolute bottom-0 left-0 right-0 p-2">
                      <div className="h-2 w-4/5 bg-white/90 rounded-full mx-auto mb-1" />
                      <div className="h-2 w-3/5 bg-white/90 rounded-full mx-auto" />
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-medium text-foreground">Bold</div>
                    <div className="text-[10px] text-muted leading-tight">Big text, easy to consume</div>
                  </div>
                </button>
              </div>
            </div>

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
              className="h-9 px-4 text-sm text-muted-light hover:text-foreground transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!topic.trim() || loading}
              className="h-9 px-4 ig-btn text-sm font-medium rounded-lg transition-all"
            >
              {loading ? 'Creating...' : 'Generate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

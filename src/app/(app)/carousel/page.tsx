'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Screen A — Input
 * User enters topic + optional direction, clicks Generate.
 */
export default function CarouselInputPage() {
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [direction, setDirection] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleGenerate() {
    if (!topic.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/carousel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          direction: direction.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create carousel');
      }

      const data = await res.json();
      router.push(`/carousel/${data.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mt-16 animate-fade-up">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-2">Create Carousel</h1>
        <p className="text-muted-light text-sm">
          Enter a topic and we&apos;ll generate a full fact-based Instagram carousel.
        </p>
      </div>

      <div className="space-y-5">
        {/* Topic */}
        <div>
          <label htmlFor="topic" className="block text-sm font-medium mb-2 text-foreground">
            Topic
          </label>
          <input
            id="topic"
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="e.g. Flamingos, Sleep science, Roman engineering"
            className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground placeholder:text-muted text-sm"
            disabled={loading}
            onKeyDown={e => e.key === 'Enter' && handleGenerate()}
            autoFocus
          />
        </div>

        {/* Direction (optional) */}
        <div>
          <label htmlFor="direction" className="block text-sm font-medium mb-2 text-foreground">
            Direction <span className="text-muted text-xs">(optional)</span>
          </label>
          <input
            id="direction"
            type="text"
            value={direction}
            onChange={e => setDirection(e.target.value)}
            placeholder="e.g. Focus on surprising facts, debunk common myths"
            className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground placeholder:text-muted text-sm"
            disabled={loading}
            onKeyDown={e => e.key === 'Enter' && handleGenerate()}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-3 bg-danger-dim border border-danger/20 rounded-lg text-danger text-sm">
            {error}
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={loading || !topic.trim()}
          className="w-full h-11 px-6 bg-accent text-background font-semibold rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-sm tracking-wide"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Starting...
            </span>
          ) : (
            'Generate Carousel'
          )}
        </button>
      </div>
    </div>
  );
}

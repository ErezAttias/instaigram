'use client';

import { useState } from 'react';

type SimpleSlide =
  | { type: 'hook'; title: string; visualPrompt?: string }
  | { type: 'content'; title: string; content: string; visualPrompt?: string }
  | { type: 'cta'; title: string; visualPrompt?: string };

type ModelId = 'gpt-4o' | 'claude-sonnet-4-5' | 'claude-opus-4-6' | 'gemini-2.5-pro';

type ModelResult =
  | { modelId: ModelId; ok: true; slides: SimpleSlide[]; latencyMs: number }
  | { modelId: ModelId; ok: false; error: string };

interface AbResponse {
  topic: string;
  results: ModelResult[];
}

const MODEL_LABELS: Record<ModelId, string> = {
  'gpt-4o': 'GPT-4o',
  'claude-sonnet-4-5': 'Claude Sonnet 4.5',
  'claude-opus-4-6': 'Claude Opus 4.6',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
};

export default function AbPage() {
  const [topic, setTopic] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AbResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!topic.trim()) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/dev/ab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Request failed');
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-[1800px] mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-2">A/B: Same prompt, 4 models</h1>
      <p className="text-sm text-muted mb-6">
        One-shot carousel generation. Same prompt, same topic — only the model differs.
      </p>

      <div className="flex gap-3 items-center mb-8">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !running && topic.trim()) run();
          }}
          placeholder="Topic (e.g. 'amazing facts about octopuses')"
          className="flex-1 px-4 py-2 rounded border border-gray-700 bg-gray-900 text-white"
          disabled={running}
        />
        <button
          onClick={run}
          disabled={running || !topic.trim()}
          className="px-5 py-2 rounded bg-blue-600 text-white font-medium disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run'}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded bg-red-950 border border-red-800 text-red-300 mb-6">
          {error}
        </div>
      )}

      {running && (
        <div className="text-muted text-sm mb-6">
          Running all 4 models in parallel. Typically ~10–30s (slowest wins).
        </div>
      )}

      {result && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {result.results.map((r) => (
            <ModelColumn key={r.modelId} result={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function ModelColumn({ result }: { result: ModelResult }) {
  const label = MODEL_LABELS[result.modelId];
  return (
    <section className="border border-gray-800 rounded-lg min-w-0">
      <header className="sticky top-0 bg-gray-950 p-3 border-b border-gray-800 z-10">
        <h2 className="font-semibold text-white text-sm">{label}</h2>
        {result.ok ? (
          <p className="text-[11px] text-muted mt-1">
            {result.latencyMs} ms · {result.slides.length} slides
          </p>
        ) : (
          <p className="text-[11px] text-red-400 mt-1">failed</p>
        )}
      </header>
      <div className="p-3 space-y-3">
        {!result.ok && (
          <div className="text-red-400 text-xs whitespace-pre-wrap break-words">{result.error}</div>
        )}
        {result.ok &&
          result.slides.map((slide, i) => (
            <article key={i} className="border-l-2 border-gray-700 pl-2">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
                {i + 1}. {slide.type}
              </div>
              <div className="text-white text-sm font-medium mb-1 break-words">{slide.title}</div>
              {slide.type === 'content' && (
                <div className="text-xs text-gray-400 break-words">{slide.content}</div>
              )}
            </article>
          ))}
        {result.ok && (
          <details className="mt-3">
            <summary className="text-[11px] text-muted cursor-pointer">Raw JSON</summary>
            <pre className="text-[9px] text-gray-500 overflow-auto p-2 bg-gray-900 rounded mt-1 max-h-96">
              {JSON.stringify(result.slides, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </section>
  );
}

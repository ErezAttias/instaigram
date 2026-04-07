'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewChannelPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [niche, setNiche] = useState('');
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !niche.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          niche: niche.trim(),
          language: language.trim() || 'en',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create channel');
      }

      const channel = await res.json();
      router.push(`/admin/channels/${channel.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-foreground mb-2">New Channel</h1>
      <p className="text-sm text-muted mb-8">
        Create a content profile for a new client or channel.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-medium text-muted-light mb-1.5">
            Channel Name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Nature Facts Daily"
            className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-light mb-1.5">
            Niche / Topic Area
          </label>
          <input
            type="text"
            value={niche}
            onChange={e => setNiche(e.target.value)}
            placeholder="e.g. Fascinating animal facts and wildlife science"
            className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-light mb-1.5">
            Language
          </label>
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none"
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="pt">Portuguese</option>
            <option value="he">Hebrew</option>
            <option value="ar">Arabic</option>
          </select>
        </div>

        {error && (
          <p className="text-xs text-danger">{error}</p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={!name.trim() || !niche.trim() || loading}
            className="px-5 py-2.5 bg-accent text-background text-sm font-medium rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Creating...' : 'Create Channel'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2.5 text-sm text-muted-light hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

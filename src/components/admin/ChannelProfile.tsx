'use client';

import { useState } from 'react';
import { StatusBadge } from './StatusBadge';

interface ChannelProfileProps {
  channel: {
    id: string;
    name: string;
    niche: string | null;
    language: string;
    status: string;
    createdAt: string;
    positioning: {
      angle: string;
      tone: string;
      contentStyle: string;
      audienceFeel: string;
    } | null;
    memory: {
      tone: string;
      aggressionLevel: number;
      style: string;
    } | null;
  };
  onUpdate: (data: { name?: string; niche?: string; language?: string }) => Promise<void>;
}

export function ChannelProfile({ channel, onUpdate }: ChannelProfileProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(channel.name);
  const [niche, setNiche] = useState(channel.niche || '');
  const [language, setLanguage] = useState(channel.language);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onUpdate({
        name: name.trim() || undefined,
        niche: niche.trim() || undefined,
        language: language.trim() || undefined,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-6 mb-8">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          {editing ? (
            <div className="space-y-3 max-w-md">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-base font-semibold text-foreground focus:outline-none"
                placeholder="Channel name"
              />
              <input
                type="text"
                value={niche}
                onChange={e => setNiche(e.target.value)}
                className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none"
                placeholder="Niche / topic area"
              />
              <input
                type="text"
                value={language}
                onChange={e => setLanguage(e.target.value)}
                className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none"
                placeholder="Language (e.g. en)"
              />
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-foreground mb-1">{channel.name}</h1>
              {channel.niche && (
                <p className="text-sm text-muted-light mb-2">{channel.niche}</p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <StatusBadge status={channel.status} />
          {editing ? (
            <div className="flex gap-2">
              <button
                onClick={() => { setEditing(false); setName(channel.name); setNiche(channel.niche || ''); setLanguage(channel.language); }}
                className="text-xs text-muted hover:text-foreground transition-colors"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="h-8 px-3 ig-btn text-xs font-medium rounded-lg transition-all"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-muted hover:text-accent transition-colors"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
        <span className="uppercase tracking-wide">{channel.language}</span>
        <span>Created {new Date(channel.createdAt).toLocaleDateString()}</span>
        {channel.positioning && (
          <>
            <span>Tone: {channel.positioning.tone}</span>
            <span>Style: {channel.positioning.contentStyle}</span>
          </>
        )}
        {channel.memory && (
          <span>Voice: {channel.memory.tone} / {channel.memory.style}</span>
        )}
      </div>
    </div>
  );
}

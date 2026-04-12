'use client';

import { useState, useMemo } from 'react';
import { ChannelCard } from './ChannelCard';

interface Channel {
  id: string;
  name: string;
  niche: string | null;
  language: string;
  status: string;
  carouselCount: number;
  lastCarouselAt: string | null;
  createdAt: string;
}

export function ChannelGrid({ channels, onDelete }: { channels: Channel[]; onDelete?: (id: string) => void }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return channels;
    const q = search.toLowerCase();
    return channels.filter(
      c => c.name.toLowerCase().includes(q) || c.niche?.toLowerCase().includes(q)
    );
  }, [channels, search]);

  return (
    <div>
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search channels..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-lg bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-[#3d6fa8]/40"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted text-sm">
            {search ? 'No channels match your search.' : 'No channels yet. Create your first one.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((channel, i) => (
            <div key={channel.id} className={`animate-fade-up stagger-${Math.min(i + 1, 8)} h-full`}>
              <ChannelCard {...channel} onDelete={onDelete} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

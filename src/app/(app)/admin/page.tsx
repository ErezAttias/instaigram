'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CarouselCard } from '@/components/admin/CarouselCard';

interface CarouselRow {
  id: string;
  topic: string;
  direction: string | null;
  status: string;
  approved: boolean;
  thumbnailUrl: string | null;
  channelId: string | null;
  channelName: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AdminDashboard() {
  const [carousels, setCarousels] = useState<CarouselRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/api/admin/carousels')
      .then(res => res.json())
      .then(data => setCarousels(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = query.trim()
    ? carousels.filter(c =>
        c.topic.toLowerCase().includes(query.trim().toLowerCase()) ||
        (c.channelName ?? '').toLowerCase().includes(query.trim().toLowerCase()),
      )
    : carousels;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted mt-1">
            {carousels.length} carousel{carousels.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/admin/channels/new"
          className="h-11 px-6 text-white text-sm font-semibold rounded-full transition-opacity hover:opacity-90 flex items-center"
          style={{ background: 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' }}
        >
          New Carousel
        </Link>
      </div>

      <div className="mb-6">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search carousels..."
          className="w-full sm:max-w-md h-10 px-4 rounded-lg bg-surface border border-border text-sm text-foreground placeholder:text-muted outline-none focus-visible:border-[#dc2743]/60 transition-colors"
        />
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface py-16 px-6 text-center">
          <p className="text-sm text-muted-light">
            {carousels.length === 0 ? 'No carousels yet. Create one to get started.' : 'No matches.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(c => (
            <CarouselCard
              key={c.id}
              {...c}
              onDelete={id => setCarousels(prev => prev.filter(c => c.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

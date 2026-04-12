'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChannelGrid } from '@/components/admin/ChannelGrid';

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

export default function AdminDashboard() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/channels')
      .then(res => res.json())
      .then(data => setChannels(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted mt-1">
            {channels.length} channel{channels.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/admin/channels/new"
          className="h-11 px-6 text-white text-sm font-semibold rounded-full transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' }}
        >
          New Channel
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-40 rounded-xl" />
          ))}
        </div>
      ) : (
        <ChannelGrid
          channels={channels}
          onDelete={id => setChannels(prev => prev.filter(c => c.id !== id))}
        />
      )}
    </div>
  );
}

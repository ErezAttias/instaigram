'use client';

import { useState } from 'react';
import { CarouselThumbnail } from './CarouselThumbnail';

interface Carousel {
  id: string;
  topic: string;
  direction: string | null;
  status: string;
  approved: boolean;
  thumbnailUrl: string | null;
  createdAt: string;
}

const STATUS_TABS = [
  { label: 'All', value: '' },
  { label: 'Generating', value: 'GENERATING' },
  { label: 'Complete', value: 'COMPLETE' },
  { label: 'Approved', value: 'approved' },
  { label: 'Failed', value: 'FAILED' },
];

export function CarouselGrid({
  carousels,
  channelId,
  onDelete,
  onExport,
}: {
  carousels: Carousel[];
  channelId: string;
  onDelete: (jobId: string) => void;
  onExport: (jobId: string) => void;
}) {
  const [activeTab, setActiveTab] = useState('');

  const filtered = activeTab
    ? activeTab === 'approved'
      ? carousels.filter(c => c.approved)
      : carousels.filter(c => c.status === activeTab)
    : carousels;

  return (
    <div>
      {/* Status filter tabs */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto scrollbar-hide">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.value
                ? 'bg-accent-dim text-accent'
                : 'text-muted hover:text-muted-light hover:bg-surface-hover'
            }`}
          >
            {tab.label}
            {tab.value === '' && ` (${carousels.length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted text-sm">
            {activeTab ? 'No carousels match this filter.' : 'No carousels yet. Create your first one.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((carousel, i) => (
            <div key={carousel.id} className={`animate-fade-up stagger-${Math.min(i + 1, 8)}`}>
              <CarouselThumbnail
                {...carousel}
                channelId={channelId}
                onDelete={onDelete}
                onExport={onExport}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

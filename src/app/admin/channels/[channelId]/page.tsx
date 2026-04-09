'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChannelProfile } from '@/components/admin/ChannelProfile';
import { CarouselGrid } from '@/components/admin/CarouselGrid';
import { CreateCarouselDialog } from '@/components/admin/CreateCarouselDialog';
import { CreateBatchOrderDialog } from '@/components/admin/CreateBatchOrderDialog';
import { BatchOrderCard } from '@/components/admin/BatchOrderCard';
import { VisualStyleTab } from '@/components/admin/visual/VisualStyleTab';

interface Channel {
  id: string;
  name: string;
  niche: string | null;
  language: string;
  status: string;
  createdAt: string;
  instagramConnected: boolean;
  instagramUsername: string | null;
  instagramTokenExpiry: string | null;
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
}

interface Carousel {
  id: string;
  topic: string;
  direction: string | null;
  status: string;
  approved: boolean;
  thumbnailUrl: string | null;
  createdAt: string;
}

interface BatchOrder {
  id: string;
  channelId: string;
  status: string;
  size: number;
  completed: number;
  failed: number;
  direction: string | null;
  createdAt: string;
}

export default function ChannelDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const channelId = params.channelId as string;

  const [channel, setChannel] = useState<Channel | null>(null);
  const [carousels, setCarousels] = useState<Carousel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [batchOrders, setBatchOrders] = useState<BatchOrder[]>([]);
  const [activeTab, setActiveTab] = useState<'carousels' | 'visual' | 'instagram'>('carousels');
  const [igToast, setIgToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [igDisconnecting, setIgDisconnecting] = useState(false);
  const [igManualToken, setIgManualToken] = useState('');
  const [igManualUserId, setIgManualUserId] = useState('');
  const [igSaving, setIgSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [channelRes, carouselsRes, batchRes] = await Promise.all([
        fetch(`/api/admin/channels/${channelId}`),
        fetch(`/api/admin/channels/${channelId}/carousels`),
        fetch(`/api/admin/channels/${channelId}/batch-orders`),
      ]);

      if (!channelRes.ok) {
        router.push('/admin');
        return;
      }

      const [channelData, carouselsData, batchData] = await Promise.all([
        channelRes.json(),
        carouselsRes.json(),
        batchRes.ok ? batchRes.json() : [],
      ]);

      setChannel(channelData);
      setCarousels(Array.isArray(carouselsData) ? carouselsData : []);
      setBatchOrders(Array.isArray(batchData) ? batchData : []);
    } catch (err) {
      console.error('Failed to load channel:', err);
    } finally {
      setLoading(false);
    }
  }, [channelId, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Instagram OAuth callback result
  useEffect(() => {
    const igStatus = searchParams.get('instagram');
    if (!igStatus) return;

    if (igStatus === 'connected') {
      setIgToast({ type: 'success', message: 'Instagram account connected!' });
      setActiveTab('instagram');
    } else if (igStatus === 'error') {
      const reason = searchParams.get('reason') ?? 'Unknown error';
      setIgToast({ type: 'error', message: `Connection failed: ${reason}` });
      setActiveTab('instagram');
    }

    // Remove the query params from URL without reload
    const url = new URL(window.location.href);
    url.searchParams.delete('instagram');
    url.searchParams.delete('reason');
    window.history.replaceState({}, '', url.toString());

    const timer = setTimeout(() => setIgToast(null), 5000);
    return () => clearTimeout(timer);
  }, [searchParams]);

  async function handleSaveManualToken() {
    if (!igManualToken.trim() || !igManualUserId.trim()) return;
    setIgSaving(true);
    try {
      const res = await fetch(`/api/instagram/connect-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, accessToken: igManualToken.trim(), userId: igManualUserId.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setChannel(prev => prev ? {
          ...prev,
          instagramConnected: true,
          instagramUsername: data.username ?? igManualUserId,
          instagramTokenExpiry: data.tokenExpiry ?? null,
        } : prev);
        setIgManualToken('');
        setIgManualUserId('');
        setIgToast({ type: 'success', message: 'Instagram account connected!' });
      } else {
        setIgToast({ type: 'error', message: data.error ?? 'Failed to save token' });
      }
    } finally {
      setIgSaving(false);
    }
  }

  async function handleDisconnectInstagram() {
    if (!confirm('Disconnect Instagram account?')) return;
    setIgDisconnecting(true);
    try {
      const res = await fetch(`/api/instagram/disconnect?channelId=${channelId}`, { method: 'POST' });
      if (res.ok) {
        setChannel(prev => prev ? { ...prev, instagramConnected: false, instagramUsername: null, instagramTokenExpiry: null } : prev);
        setIgToast({ type: 'success', message: 'Instagram account disconnected.' });
      }
    } finally {
      setIgDisconnecting(false);
    }
  }

  async function handleUpdateProfile(data: { name?: string; niche?: string; language?: string }) {
    const res = await fetch(`/api/admin/channels/${channelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const updated = await res.json();
      setChannel(prev => prev ? { ...prev, ...updated } : prev);
    }
  }

  async function handleDeleteCarousel(jobId: string) {
    if (!confirm('Delete this carousel? This cannot be undone.')) return;

    const res = await fetch(`/api/admin/channels/${channelId}/carousels/${jobId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setCarousels(prev => prev.filter(c => c.id !== jobId));
    }
  }

  function handleExportCarousel(jobId: string) {
    window.open(`/api/carousel/${jobId}/export`, '_blank');
  }

  function handleCarouselCreated(jobId: string) {
    setShowCreateDialog(false);
    router.push(`/admin/channels/${channelId}/carousels/${jobId}`);
  }

  function handleBatchCreated(batchOrderId: string) {
    setShowBatchDialog(false);
    router.push(`/admin/channels/${channelId}/batch-orders/${batchOrderId}`);
  }

  if (loading) {
    return (
      <div>
        <div className="skeleton h-32 rounded-xl mb-8" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="skeleton aspect-[4/5] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!channel) return null;

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center flex-wrap gap-2 text-xs text-muted mb-6">
        <Link href="/admin" className="hover:text-foreground transition-colors">Dashboard</Link>
        <span>/</span>
        <span className="text-muted-light">{channel.name}</span>
      </nav>

      <ChannelProfile channel={channel} onUpdate={handleUpdateProfile} />

      {/* Tab navigation */}
      <div className="flex items-center gap-1 mb-6 border-b border-border overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setActiveTab('carousels')}
          className={`shrink-0 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'carousels'
              ? 'border-accent text-foreground'
              : 'border-transparent text-muted hover:text-foreground'
          }`}
        >
          Carousels
          <span className="text-xs font-normal text-muted ml-1.5">({carousels.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('visual')}
          className={`shrink-0 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'visual'
              ? 'border-accent text-foreground'
              : 'border-transparent text-muted hover:text-foreground'
          }`}
        >
          Visual Style
        </button>
        <button
          onClick={() => setActiveTab('instagram')}
          className={`shrink-0 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === 'instagram'
              ? 'border-accent text-foreground'
              : 'border-transparent text-muted hover:text-foreground'
          }`}
        >
          Instagram
          {channel.instagramConnected && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
          )}
        </button>
      </div>

      {/* Instagram toast */}
      {igToast && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
          igToast.type === 'success'
            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
            : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {igToast.message}
        </div>
      )}

      {/* Visual Style tab */}
      {activeTab === 'visual' && (
        <VisualStyleTab channelId={channelId} />
      )}

      {/* Instagram tab */}
      {activeTab === 'instagram' && (
        <div className="max-w-lg">
          <h2 className="text-base font-semibold text-foreground mb-1">Instagram Account</h2>
          <p className="text-sm text-muted mb-6">
            Connect your Instagram account to publish carousels directly.
          </p>

          {channel.instagramConnected ? (
            <div className="p-5 rounded-xl border border-border bg-surface-elevated">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold">
                    {(channel.instagramUsername?.[0] ?? 'I').toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      @{channel.instagramUsername ?? 'Connected account'}
                    </p>
                    {channel.instagramTokenExpiry && (
                      <p className="text-xs text-muted mt-0.5">
                        Token expires {new Date(channel.instagramTokenExpiry).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                <span className="flex items-center gap-1.5 text-xs text-green-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  Connected
                </span>
              </div>
              <div className="mt-4 pt-4 border-t border-border flex gap-2">
                <button
                  onClick={handleDisconnectInstagram}
                  disabled={igDisconnecting}
                  className="px-3 py-1.5 text-xs font-semibold border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  {igDisconnecting ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-xl border border-border bg-surface-elevated space-y-4">
              <div>
                <p className="text-xs font-medium text-muted uppercase tracking-wide mb-3">How to get your token</p>
                <ol className="text-sm text-muted space-y-1.5 list-decimal list-inside">
                  <li>Go to <span className="text-foreground font-medium">Meta Developer Dashboard</span> → your app → Use cases → Customize</li>
                  <li>Click <span className="text-foreground font-medium">"API setup with Instagram login"</span></li>
                  <li>Under Step 2, click <span className="text-foreground font-medium">"Add account"</span> and log in with your Instagram</li>
                  <li>Copy the <span className="text-foreground font-medium">User ID</span> and <span className="text-foreground font-medium">Access Token</span> shown</li>
                </ol>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Instagram User ID</label>
                  <input
                    type="text"
                    value={igManualUserId}
                    onChange={e => setIgManualUserId(e.target.value)}
                    placeholder="e.g. 17841400000000000"
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Access Token</label>
                  <input
                    type="password"
                    value={igManualToken}
                    onChange={e => setIgManualToken(e.target.value)}
                    placeholder="Paste your access token"
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
                  />
                </div>
                <button
                  onClick={handleSaveManualToken}
                  disabled={igSaving || !igManualToken.trim() || !igManualUserId.trim()}
                  className="w-full px-4 py-2 ig-btn text-sm font-semibold rounded-lg transition-all"
                >
                  {igSaving ? 'Connecting…' : 'Connect Instagram'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Carousels tab */}
      {activeTab === 'carousels' && (
        <>
          {/* Batch Orders section */}
          {batchOrders.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-foreground mb-3">
                Batch Orders
                <span className="text-sm font-normal text-muted ml-2">({batchOrders.length})</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {batchOrders.map(order => (
                  <BatchOrderCard key={order.id} order={order} />
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-foreground">
              Carousels
              <span className="text-sm font-normal text-muted ml-2">({carousels.length})</span>
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowBatchDialog(true)}
                className="px-4 py-2 bg-surface-elevated border border-border text-foreground text-sm font-semibold rounded-lg hover:border-accent/40 transition-colors"
              >
                Batch Order
              </button>
              <button
                onClick={() => setShowCreateDialog(true)}
                className="px-4 py-2 ig-btn text-sm font-semibold rounded-lg transition-all"
              >
                New Carousel
              </button>
            </div>
          </div>

          <CarouselGrid
            carousels={carousels}
            channelId={channelId}
            onDelete={handleDeleteCarousel}
            onExport={handleExportCarousel}
          />
        </>
      )}

      <CreateCarouselDialog
        channelId={channelId}
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={handleCarouselCreated}
      />

      <CreateBatchOrderDialog
        channelId={channelId}
        open={showBatchDialog}
        onClose={() => setShowBatchDialog(false)}
        onCreated={handleBatchCreated}
      />
    </div>
  );
}

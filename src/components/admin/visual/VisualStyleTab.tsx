'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ChannelVisualStyleContext } from '@/lib/visual/visual-style';
import { DEFAULT_VISUAL_STYLE } from '@/lib/visual/visual-style';
import { DesignerPanel } from './DesignerPanel';
import { SlidePreview } from './SlidePreview';

interface VisualStyleTabProps {
  channelId: string;
}

function stylesEqual(a: ChannelVisualStyleContext, b: ChannelVisualStyleContext) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function VisualStyleTab({ channelId }: VisualStyleTabProps) {
  const [savedStyle, setSavedStyle] = useState<ChannelVisualStyleContext>(DEFAULT_VISUAL_STYLE);
  const [draftStyle, setDraftStyle] = useState<ChannelVisualStyleContext>(DEFAULT_VISUAL_STYLE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const loadStyle = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/channels/${channelId}/visual-style`);
      if (res.ok) {
        const data = await res.json();
        setSavedStyle(data);
        setDraftStyle(data);
      }
    } catch {
      // silently fall back to defaults
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    loadStyle();
  }, [loadStyle]);

  function handleChange(patch: Partial<ChannelVisualStyleContext>) {
    setDraftStyle(prev => ({ ...prev, ...patch }));
    setSaveStatus('idle');
  }

  async function handleSave() {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const res = await fetch(`/api/admin/channels/${channelId}/visual-style`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftStyle),
      });
      if (res.ok) {
        const saved = await res.json();
        setSavedStyle(saved);
        setDraftStyle(saved);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? 'Failed to save visual style');
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setDraftStyle(savedStyle);
    setSaveStatus('idle');
  }

  const hasChanges = !stylesEqual(draftStyle, savedStyle);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Visual Style</h2>
          <p className="text-sm text-muted mt-0.5">
            Customize fonts, colors, and branding for this channel&apos;s slides.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && (
            <button
              onClick={handleReset}
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              Reset
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              hasChanges && !saving
                ? 'bg-accent text-background hover:bg-accent-hover'
                : 'bg-surface border border-border text-muted cursor-not-allowed'
            }`}
          >
            {saving ? 'Saving…' : saveStatus === 'saved' ? 'Saved ✓' : 'Save Style'}
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-8 items-start">
        {/* Controls column */}
        <div className="w-[420px] shrink-0">
          <DesignerPanel style={draftStyle} onChange={handleChange} />
        </div>

        {/* Preview column — sticky, phone-sized slide */}
        <div className="shrink-0 sticky top-8 flex flex-col items-center">
          <SlidePreview style={draftStyle} />
          {hasChanges && (
            <p className="text-xs text-warning text-center mt-2">Unsaved changes</p>
          )}
        </div>
      </div>
    </div>
  );
}

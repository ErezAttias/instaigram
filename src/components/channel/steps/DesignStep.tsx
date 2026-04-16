'use client'

import { useState, useEffect } from 'react'
import { TITLE_FONTS, type FontOption } from '@/lib/visual/font-pairings-data'

const IG_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'

const COLOR_PRESETS = [
  { id: 'white', label: 'Classic White', headline: '#FFFFFF', body: '#D0D0D0' },
  { id: 'warm', label: 'Warm Gold', headline: '#FFD700', body: '#E8D5B7' },
  { id: 'cool', label: 'Cool Blue', headline: '#7DD3FC', body: '#BAE6FD' },
  { id: 'neon', label: 'Neon Green', headline: '#4ADE80', body: '#BBF7D0' },
  { id: 'fire', label: 'Fire', headline: '#FB923C', body: '#FED7AA' },
  { id: 'pink', label: 'Pink', headline: '#F472B6', body: '#FBCFE8' },
]

interface DesignStepProps {
  sampleTitle: string
  sampleSubtitle: string
  channelId?: string
  onApprove: (style: { titleFontId: string; headlineColor: string; bodyColor: string }) => void
  onBack: () => void
}

export function DesignStep({ sampleTitle, sampleSubtitle, channelId, onApprove, onBack }: DesignStepProps) {
  const [selectedFont, setSelectedFont] = useState<string>('inter')
  const [selectedColor, setSelectedColor] = useState<string>('white')
  const [saving, setSaving] = useState(false)

  const font = TITLE_FONTS.find(f => f.id === selectedFont) ?? TITLE_FONTS[0]
  const color = COLOR_PRESETS.find(c => c.id === selectedColor) ?? COLOR_PRESETS[0]

  // Load Google Fonts for preview
  useEffect(() => {
    const families = TITLE_FONTS.filter(f => f.googleFontsFamily).map(f => f.googleFontsFamily).join('&family=')
    if (families) {
      const link = document.createElement('link')
      link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`
      link.rel = 'stylesheet'
      document.head.appendChild(link)
      return () => { document.head.removeChild(link) }
    }
  }, [])

  const handleApprove = async () => {
    setSaving(true)
    // Save visual style to channel if we have one
    if (channelId) {
      try {
        await fetch(`/api/admin/channels/${channelId}/visual-style`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            titleFontId: selectedFont,
            bodyFontId: 'inter',
            headlineColor: color.headline,
            bodyColor: color.body,
          }),
        })
      } catch {
        // non-blocking
      }
    }
    onApprove({
      titleFontId: selectedFont,
      headlineColor: color.headline,
      bodyColor: color.body,
    })
    setSaving(false)
  }

  return (
    <div className="animate-fade-up bg-surface rounded-2xl border border-border py-10 px-6 lg:py-12 lg:px-10">
      <div className="max-w-3xl mx-auto">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-2 text-center bg-clip-text text-transparent" style={{ backgroundImage: IG_GRADIENT }}>
          Step 4 of 5
        </p>
        <h2 className="text-2xl font-bold tracking-tight mb-2 text-center">Design your slides</h2>
        <p className="text-sm text-muted-light mb-8 text-center">Pick a font and color scheme. You&apos;ll see a preview below.</p>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left: Options */}
          <div className="space-y-6">
            {/* Font picker */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-light mb-3 block">Title Font</label>
              <div className="grid grid-cols-2 gap-2">
                {TITLE_FONTS.map((f: FontOption) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFont(f.id)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      selectedFont === f.id
                        ? 'border-[#dc2743] bg-[#dc2743]/5'
                        : 'border-border hover:border-[#dc2743]/30'
                    }`}
                  >
                    <span
                      className="text-lg text-foreground block truncate"
                      style={{ fontFamily: `'${f.family}', sans-serif`, fontWeight: f.weight }}
                    >
                      {f.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Color picker */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-light mb-3 block">Color Scheme</label>
              <div className="grid grid-cols-3 gap-2">
                {COLOR_PRESETS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedColor(c.id)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      selectedColor === c.id
                        ? 'border-[#dc2743] bg-[#dc2743]/5'
                        : 'border-border hover:border-[#dc2743]/30'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full border border-white/20" style={{ background: c.headline }} />
                      <span className="text-xs font-medium text-foreground">{c.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Live preview */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-light mb-3 block">Preview</label>
            <div
              className="aspect-[4/5] rounded-xl overflow-hidden relative flex items-end"
              style={{
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
              }}
            >
              {/* Gradient overlay */}
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.85) 80%, rgba(0,0,0,0.95) 100%)',
                }}
              />
              {/* Text */}
              <div className="relative z-10 p-6 pb-8 w-full">
                <p
                  className="text-[22px] leading-tight mb-2"
                  style={{
                    fontFamily: `'${font.family}', sans-serif`,
                    fontWeight: font.weight,
                    color: color.headline,
                  }}
                >
                  {sampleTitle}
                </p>
                <p
                  className="text-[13px] leading-relaxed"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 400,
                    color: color.body,
                    opacity: 0.9,
                  }}
                >
                  {sampleSubtitle}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-8">
          <button onClick={onBack} className="text-sm text-muted-light hover:text-foreground transition-colors">
            &larr; Back
          </button>
          <button
            onClick={handleApprove}
            disabled={saving}
            className="min-h-11 py-2.5 px-8 text-white rounded-full text-sm font-semibold disabled:opacity-40 transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: IG_GRADIENT }}
          >
            {saving ? 'Saving...' : 'Approve design'}
          </button>
        </div>
      </div>
    </div>
  )
}

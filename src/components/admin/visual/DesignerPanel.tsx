'use client';

import { useRef, useEffect } from 'react';
import type { ChannelVisualStyleContext } from '@/lib/visual/visual-style';
import { TITLE_FONTS, BODY_FONTS, type FontOption } from '@/lib/visual/font-pairings-data';

interface DesignerPanelProps {
  style: ChannelVisualStyleContext;
  onChange: (patch: Partial<ChannelVisualStyleContext>) => void;
}

function ColorInput({
  label,
  value,
  onChange,
  placeholder = '#FFFFFF',
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted w-32 shrink-0">{label}</span>
      <div className="flex items-center gap-2 flex-1">
        <input
          type="color"
          value={value ?? '#FFFFFF'}
          onChange={e => onChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent"
          title={label}
        />
        <input
          type="text"
          value={value ?? ''}
          placeholder={placeholder}
          onChange={e => {
            const v = e.target.value.trim();
            onChange(v === '' ? null : v);
          }}
          className="flex-1 bg-surface border border-border rounded px-2 py-1 text-sm text-foreground font-mono placeholder:text-muted"
        />
        {value && (
          <button
            onClick={() => onChange(null)}
            className="text-muted hover:text-foreground text-xs px-1"
            title="Reset to default"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function FontPicker({
  label,
  fonts,
  selectedId,
  onSelect,
  disabled = false,
}: {
  label: string;
  fonts: FontOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  // Inject Google Fonts for all options in this picker
  useEffect(() => {
    fonts.forEach(font => {
      if (!font.googleFontsFamily) return;
      const id = `gf-${font.id}`;
      if (!document.getElementById(id)) {
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${font.googleFontsFamily}&display=swap`;
        document.head.appendChild(link);
      }
    });
  }, [fonts]);

  return (
    <div>
      <p className={`text-xs font-medium mb-2 ${disabled ? 'text-muted/50' : 'text-muted'}`}>{label}</p>
      <div className="flex flex-wrap gap-2">
        {fonts.map(font => (
          <button
            key={font.id}
            onClick={() => !disabled && onSelect(font.id)}
            disabled={disabled}
            className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
              selectedId === font.id && !disabled
                ? 'border-accent bg-accent/10 text-foreground'
                : disabled
                ? 'border-border/40 bg-surface/50 text-muted/40 cursor-not-allowed'
                : 'border-border bg-surface text-foreground hover:border-border-elevated cursor-pointer'
            }`}
            style={{
              fontFamily: `'${font.family}', sans-serif`,
              fontWeight: font.weight,
            }}
          >
            {font.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DesignerPanel({ style, onChange }: DesignerPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024) {
      alert('Logo file too large. Please use a PNG under 200KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Strip the data URI prefix — store raw base64 only
      const base64 = dataUrl.split(',')[1];
      onChange({ logoBase64: base64 });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-6">
      {/* Fonts */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Fonts</h3>

        <FontPicker
          label="Title font"
          fonts={TITLE_FONTS}
          selectedId={style.titleFontId}
          onSelect={id => onChange({ titleFontId: id })}
        />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={style.singleFont}
            onChange={e => onChange({ singleFont: e.target.checked })}
            className="accent-accent"
          />
          <span className="text-sm text-muted">Single font (use title font for body text)</span>
        </label>

        <FontPicker
          label="Paragraph font"
          fonts={BODY_FONTS}
          selectedId={style.bodyFontId}
          onSelect={id => onChange({ bodyFontId: id })}
          disabled={style.singleFont}
        />

        {/* Font Sizes */}
        <div className="space-y-4 pt-1">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted">Title size</span>
              <span className="text-xs text-muted font-mono">{style.t1FontSizePx ?? 72}px</span>
            </div>
            <input
              type="range"
              min={40}
              max={100}
              step={2}
              value={style.t1FontSizePx ?? 72}
              onChange={e => onChange({ t1FontSizePx: Number(e.target.value) })}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-xs text-muted mt-0.5">
              <span>40</span>
              <span>100</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted">Paragraph size</span>
              <span className="text-xs text-muted font-mono">{style.t2FontSizePx ?? 40}px</span>
            </div>
            <input
              type="range"
              min={20}
              max={56}
              step={2}
              value={style.t2FontSizePx ?? 40}
              onChange={e => onChange({ t2FontSizePx: Number(e.target.value) })}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-xs text-muted mt-0.5">
              <span>20</span>
              <span>56</span>
            </div>
          </div>
        </div>
      </section>

      <hr className="border-border" />

      {/* Colors */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-3">Text Colors</h3>
        <div className="space-y-3">
          <ColorInput
            label="Headline color"
            value={style.headlineColor}
            onChange={v => onChange({ headlineColor: v })}
            placeholder="#FFFFFF"
          />
          <ColorInput
            label="Emphasis color"
            value={style.emphasisColor}
            onChange={v => onChange({ emphasisColor: v })}
            placeholder="#00A8FF"
          />
          <ColorInput
            label="Body color"
            value={style.bodyColor}
            onChange={v => onChange({ bodyColor: v })}
            placeholder="#B0B0B0"
          />
        </div>
      </section>

      <hr className="border-border" />

      {/* Text Background */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-3">Text Background</h3>
        <label className="flex items-center gap-2 mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={style.textBgEnabled}
            onChange={e => onChange({ textBgEnabled: e.target.checked })}
            className="accent-accent"
          />
          <span className="text-sm text-muted">Add colored band behind text</span>
        </label>
        {style.textBgEnabled && (
          <ColorInput
            label="Background color"
            value={style.textBgColor}
            onChange={v => onChange({ textBgColor: v })}
            placeholder="rgba(0,0,0,0.6)"
          />
        )}
      </section>

      <hr className="border-border" />

      {/* Logo */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-3">Channel Logo</h3>
        <p className="text-xs text-muted mb-3">
          PNG with transparency recommended. Max 200KB. Appears on every slide.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/webp"
          onChange={handleLogoUpload}
          className="hidden"
        />

        {style.logoBase64 ? (
          <div className="flex items-center gap-3 mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/png;base64,${style.logoBase64}`}
              alt="Logo preview"
              className="h-10 w-auto object-contain bg-surface-elevated rounded border border-border p-1"
            />
            <div className="flex gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs px-3 py-1.5 bg-surface border border-border rounded text-foreground hover:border-accent/40 transition-colors"
              >
                Replace
              </button>
              <button
                onClick={() => onChange({ logoBase64: null })}
                className="text-xs px-3 py-1.5 bg-surface border border-border rounded text-muted hover:text-danger hover:border-danger/40 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-6 border-2 border-dashed border-border rounded-lg text-muted text-sm hover:border-accent/40 hover:text-foreground transition-colors"
          >
            Click to upload logo (PNG)
          </button>
        )}

        {style.logoBase64 && (
          <div className="space-y-3 mt-3">
            {/* Position */}
            <div>
              <span className="text-sm text-muted block mb-2">Position</span>
              <div className="flex gap-2">
                {(['bottom_left', 'bottom_center', 'bottom_right'] as const).map(pos => (
                  <label
                    key={pos}
                    className={`flex-1 text-center py-1.5 rounded border text-xs cursor-pointer transition-colors ${
                      style.logoPosition === pos
                        ? 'border-accent bg-accent/10 text-foreground'
                        : 'border-border text-muted hover:border-border-elevated'
                    }`}
                  >
                    <input
                      type="radio"
                      name="logoPosition"
                      value={pos}
                      checked={style.logoPosition === pos}
                      onChange={() => onChange({ logoPosition: pos })}
                      className="hidden"
                    />
                    {pos === 'bottom_left' ? 'Left' : pos === 'bottom_center' ? 'Center' : 'Right'}
                  </label>
                ))}
              </div>
            </div>

            {/* Size */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted">Size</span>
                <span className="text-xs text-muted font-mono">{style.logoSizePx}px</span>
              </div>
              <input
                type="range"
                min={40}
                max={120}
                step={5}
                value={style.logoSizePx}
                onChange={e => onChange({ logoSizePx: Number(e.target.value) })}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-xs text-muted mt-0.5">
                <span>40</span>
                <span>120</span>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

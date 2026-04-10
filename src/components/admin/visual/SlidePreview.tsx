'use client';

import { useEffect } from 'react';
import type { ChannelVisualStyleContext } from '@/lib/visual/visual-style';
import { TITLE_FONTS, BODY_FONTS } from '@/lib/visual/font-pairings-data';

interface SlidePreviewProps {
  style: ChannelVisualStyleContext;
}

const PREVIEW_WIDTH = 320;
const PREVIEW_HEIGHT = Math.round(PREVIEW_WIDTH * (1350 / 1080));

export function SlidePreview({ style }: SlidePreviewProps) {
  const titleFont = TITLE_FONTS.find(f => f.id === style.titleFontId) ?? TITLE_FONTS[0];
  const bodyFont = BODY_FONTS.find(f => f.id === style.bodyFontId) ?? BODY_FONTS[0];

  // Inject Google Fonts links for title and body fonts
  useEffect(() => {
    const fontsToLoad = [
      { id: titleFont.id, query: titleFont.googleFontsFamily },
      { id: bodyFont.id, query: bodyFont.googleFontsFamily },
    ];
    fontsToLoad.forEach(({ id, query }) => {
      if (!query) return;
      const linkId = `gf-preview-${id}`;
      if (!document.getElementById(linkId)) {
        const link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${query}&display=swap`;
        document.head.appendChild(link);
      }
    });
  }, [titleFont, bodyFont]);

  const displayFamily = `'${titleFont.family}', sans-serif`;
  const bodyFamily = style.singleFont
    ? `'${titleFont.family}', sans-serif`
    : `'${bodyFont.family}', serif`;
  const bodyWeight = style.singleFont ? titleFont.singleBodyWeight : bodyFont.weight;

  const t1Color = style.headlineColor ?? '#FFFFFF';
  const emphasisColor = style.emphasisColor ?? '#00A8FF';
  const t2Color = style.bodyColor ?? '#B0B0B0';

  // Logo position styles — scaled to preview dimensions
  const scale = PREVIEW_WIDTH / 1080;
  const logoPositionStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: Math.round(40 * scale),
    ...(style.logoPosition === 'bottom_left' ? { left: Math.round(40 * scale) } :
        style.logoPosition === 'bottom_right' ? { right: Math.round(40 * scale) } :
        { left: '50%', transform: 'translateX(-50%)' }),
    maxHeight: Math.round(style.logoSizePx * scale),
    maxWidth: Math.round(style.logoSizePx * scale * 3),
    objectFit: 'contain',
  };

  return (
    <div style={{ width: PREVIEW_WIDTH }}>
      <p className="text-xs text-muted mb-2 text-center">Preview</p>
      <div
        style={{
          width: PREVIEW_WIDTH,
          height: PREVIEW_HEIGHT,
          background: '#0D0D0D',
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        {/* Placeholder image area */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '76%',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #2a2a3e 50%, #1a1a1a 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 11 }}>Image Area</span>
        </div>

        {/* Gradient overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,1) 76%)',
          }}
        />

        {/* Text area */}
        <div
          style={{
            position: 'absolute',
            bottom: Math.round(65 * scale),
            left: Math.round(65 * scale),
            right: Math.round(65 * scale),
          }}
        >
          {/* Optional text background */}
          {style.textBgEnabled && style.textBgColor && (
            <div
              style={{
                position: 'absolute',
                inset: '-6px -8px',
                background: style.textBgColor,
                borderRadius: 4,
              }}
            />
          )}

          {/* Headline — 2 lines, t1FontSizePx on real slide */}
          <div
            style={{
              position: 'relative',
              fontFamily: displayFamily,
              fontWeight: titleFont.weight,
              fontSize: Math.round((style.t1FontSizePx ?? 72) * scale),
              lineHeight: 1.15,
              color: t1Color,
              letterSpacing: '-0.5px',
              marginBottom: Math.round(10 * scale),
            }}
          >
            <div>The surprising truth</div>
            <div>about <span style={{ color: emphasisColor }}>this fact</span></div>
          </div>

          {/* Body — 3 lines, t2FontSizePx on real slide */}
          <div
            style={{
              position: 'relative',
              fontFamily: bodyFamily,
              fontWeight: bodyWeight,
              fontSize: Math.round((style.t2FontSizePx ?? 36) * scale),
              lineHeight: 1.5,
              color: t2Color,
            }}
          >
            <div>Scientists discovered that this</div>
            <div>phenomenon occurs in over</div>
            <div>90% of all known cases.</div>
          </div>
        </div>

        {/* Logo */}
        {style.logoBase64 && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:image/png;base64,${style.logoBase64}`}
            alt="Channel logo"
            style={logoPositionStyle}
          />
        )}
      </div>
    </div>
  );
}

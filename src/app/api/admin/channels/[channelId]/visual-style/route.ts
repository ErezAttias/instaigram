import { NextRequest, NextResponse } from 'next/server';
import { getChannelVisualStyle, upsertChannelVisualStyle } from '@/lib/services/admin-service';
import type { ChannelVisualStyleContext } from '@/lib/visual/visual-style';

type RouteContext = { params: Promise<{ channelId: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { channelId } = await params;
  const style = await getChannelVisualStyle(channelId);
  return NextResponse.json(style);
}

function isValidHex(val: unknown): val is string {
  return typeof val === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(val);
}

function isValidRgba(val: unknown): val is string {
  return typeof val === 'string' && /^rgba?\([\d\s,./]+\)$/.test(val);
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { channelId } = await params;

  let body: Partial<ChannelVisualStyleContext>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Validate color fields
  const colorFields = ['headlineColor', 'emphasisColor', 'bodyColor'] as const;
  for (const field of colorFields) {
    const val = body[field];
    if (val !== null && val !== undefined && !isValidHex(val)) {
      return NextResponse.json({ error: `${field} must be a hex color (e.g. #FFFFFF)` }, { status: 400 });
    }
  }
  if (body.textBgColor !== null && body.textBgColor !== undefined
      && !isValidHex(body.textBgColor) && !isValidRgba(body.textBgColor)) {
    return NextResponse.json({ error: 'textBgColor must be a hex or rgba color' }, { status: 400 });
  }

  // Validate logoSizePx range
  if (body.logoSizePx !== undefined) {
    const size = Number(body.logoSizePx);
    if (isNaN(size) || size < 40 || size > 120) {
      return NextResponse.json({ error: 'logoSizePx must be between 40 and 120' }, { status: 400 });
    }
    body.logoSizePx = size;
  }

  // Validate logoBase64 — must be a non-empty string (raw base64, no data URI)
  if (body.logoBase64 !== undefined && body.logoBase64 !== null) {
    if (typeof body.logoBase64 !== 'string') {
      return NextResponse.json({ error: 'logoBase64 must be a string' }, { status: 400 });
    }
    // Rough size check: base64 of 200KB PNG = ~272KB of text
    if (body.logoBase64.length > 300_000) {
      return NextResponse.json({ error: 'Logo file too large (max ~200KB)' }, { status: 400 });
    }
  }

  const updated = await upsertChannelVisualStyle(channelId, body);
  return NextResponse.json(updated);
}

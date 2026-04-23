export type TextAlign = 'left' | 'center' | 'right';

export interface ChannelVisualStyleContext {
  titleFontId: string;
  bodyFontId: string;
  singleFont: boolean;
  headlineColor: string | null;
  emphasisColor: string | null;
  bodyColor: string | null;
  textBgEnabled: boolean;
  textBgColor: string | null;
  logoBase64: string | null;
  logoPosition: 'bottom_left' | 'bottom_center' | 'bottom_right';
  logoSizePx: number;
  t1FontSizePx: number;
  t2FontSizePx: number;
  /** Optional override for the OPENER slide (first slide). null → use t1FontSizePx. */
  t1FontSizePxOpener: number | null;
  /** Optional override for the CTA slide (last slide). null → use t1FontSizePx. */
  t1FontSizePxCta: number | null;
  titleAlign: TextAlign;
  titleWeight: number;
  bodyAlign: TextAlign;
  bodyWeight: number;
}

export const DEFAULT_VISUAL_STYLE: ChannelVisualStyleContext = {
  titleFontId: 'inter',
  bodyFontId: 'inter',
  singleFont: false,
  headlineColor: null,
  emphasisColor: null,
  bodyColor: null,
  textBgEnabled: false,
  textBgColor: null,
  logoBase64: null,
  logoPosition: 'bottom_right',
  logoSizePx: 80,
  t1FontSizePx: 72,
  t2FontSizePx: 40,
  t1FontSizePxOpener: null,
  t1FontSizePxCta: null,
  titleAlign: 'left',
  titleWeight: 800,
  bodyAlign: 'left',
  bodyWeight: 400,
};

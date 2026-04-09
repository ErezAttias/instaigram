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
};

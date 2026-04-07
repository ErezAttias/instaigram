export interface ChannelVisualStyleContext {
  fontPairingId: string;
  monoFont: boolean;
  headlineColor: string | null;
  emphasisColor: string | null;
  bodyColor: string | null;
  textBgEnabled: boolean;
  textBgColor: string | null;
  logoBase64: string | null;
  logoPosition: 'bottom_left' | 'bottom_center' | 'bottom_right';
  logoSizePx: number;
}

export const DEFAULT_VISUAL_STYLE: ChannelVisualStyleContext = {
  fontPairingId: 'inter_roboto_slab',
  monoFont: false,
  headlineColor: null,
  emphasisColor: null,
  bodyColor: null,
  textBgEnabled: false,
  textBgColor: null,
  logoBase64: null,
  logoPosition: 'bottom_right',
  logoSizePx: 80,
};

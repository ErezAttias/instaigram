/**
 * TASK 1 — Visual System Definition
 *
 * Fixed color palette, cinematic lighting, background rules,
 * and image constraints for a consistent carousel design engine.
 */

// ─── Color Palette ───────────────────────────────────────────────

export const COLOR_PALETTE = {
  /** Primary background — deep charcoal, never pure black */
  bgPrimary: '#0D0D0D',
  /** Secondary background — slightly lighter for depth layering */
  bgSecondary: '#1A1A2E',
  /** Tertiary background — subtle card/panel fill */
  bgTertiary: '#16213E',

  /** Primary accent — electric blue, used for emphasis words & UI elements */
  accentPrimary: '#00A8FF',
  /** Secondary accent — lighter cyan for supporting highlights */
  accentSecondary: '#4ECDC4',
  /** Warm accent — amber/orange for urgency or warning moments */
  accentWarm: '#FF6B35',

  /** Primary text — pure white for headlines, maximum contrast */
  textPrimary: '#FFFFFF',
  /** Secondary text — light gray for body/support text */
  textSecondary: '#B0B0B0',
  /** Emphasis text — white with full opacity for headline words */
  textEmphasis: '#FFFFFF',

  /** Gradient start for cinematic overlays — strong dark base */
  overlayGradientStart: 'rgba(0, 0, 0, 0.85)',
  /** Gradient end — transparent to let image peek through */
  overlayGradientEnd: 'rgba(0, 0, 0, 0.0)',
} as const;

export type ColorToken = keyof typeof COLOR_PALETTE;

// ─── Cinematic Lighting Rules ────────────────────────────────────

export interface LightingRule {
  name: string;
  description: string;
  promptFragment: string;
}

export const LIGHTING_RULES: LightingRule[] = [
  {
    name: 'rim-light',
    description: 'Strong backlight that separates subject from background, creates dramatic silhouette edge',
    promptFragment: 'dramatic rim lighting from behind, edge-lit subject, dark background',
  },
  {
    name: 'top-down-spotlight',
    description: 'Single overhead light source casting deep shadows below, theatrical feel',
    promptFragment: 'single top-down spotlight, deep shadows, theatrical cinematic lighting',
  },
  {
    name: 'cool-ambient',
    description: 'Diffuse blue-tinted ambient light, clean and atmospheric',
    promptFragment: 'cool blue ambient lighting, soft diffused glow, clean atmosphere',
  },
  {
    name: 'warm-accent-cold-fill',
    description: 'Warm key light on subject with cold blue fill — classic cinematic two-tone',
    promptFragment: 'warm orange key light on subject, cold blue fill light, cinematic color contrast',
  },
];

// ─── Background Rules ────────────────────────────────────────────

export interface BackgroundRule {
  name: string;
  description: string;
  constraints: string[];
  promptFragment: string;
}

export const BACKGROUND_RULES: BackgroundRule[] = [
  {
    name: 'deep-dark-gradient',
    description: 'Default — near-black with subtle radial gradient for depth',
    constraints: [
      'Must be dark enough for white text at WCAG AA contrast (4.5:1)',
      'No bright hotspots or high-saturation areas',
      'Subtle vignette toward edges to focus attention center',
    ],
    promptFragment: 'deep dark background, subtle radial gradient, near-black with slight blue undertone',
  },
  {
    name: 'bokeh-blur',
    description: 'Out-of-focus city lights or tech environment — adds depth without competing with text',
    constraints: [
      'Blur radius must be extreme (f/1.4 equivalent)',
      'No recognizable shapes in background',
      'Overall luminance must stay below 30%',
    ],
    promptFragment: 'extremely blurred background bokeh, out-of-focus city lights, very dark, shallow depth of field f/1.4',
  },
  {
    name: 'minimal-environment',
    description: 'Clean architectural or tech space with large dark surfaces',
    constraints: [
      'Maximum 2 background elements visible',
      'Must have at least 60% of frame as empty dark space',
      'No clutter, no busy patterns',
    ],
    promptFragment: 'minimal dark environment, clean architecture, large empty dark surfaces, sparse elements',
  },
  {
    name: 'solid-with-texture',
    description: 'Solid dark color with subtle noise/grain texture — most text-friendly option',
    constraints: [
      'Single color with < 5% luminance variation',
      'Subtle film grain or concrete texture only',
      'Best option when slide is text-heavy',
    ],
    promptFragment: 'solid dark background with subtle film grain texture, minimal, clean',
  },
];

// ─── Image Constraints ───────────────────────────────────────────

export const IMAGE_CONSTRAINTS = {
  /** Instagram carousel slide dimensions */
  dimensions: { width: 1080, height: 1350 },
  aspectRatio: '4:5' as const,

  /** Subject rules */
  subject: {
    maxSubjects: 1,
    description: 'Single subject per image — one person, one object, or one scene element',
    placementZone: 'Subject must occupy no more than 40% of frame area',
    avoidList: [
      'multiple people in frame',
      'busy patterns or textures on clothing',
      'bright or neon-colored objects',
      'text or logos on objects in scene',
      'complex machinery with many small parts',
    ],
  },

  /** Negative prompt fragments to always include */
  negativePrompt: [
    'text', 'letters', 'numbers', 'words', 'writing', 'captions', 'labels',
    'watermark', 'logo', 'signature', 'subtitle', 'title card',
    'blurry face', 'distorted hands',
    'oversaturated', 'HDR look',
    'busy background', 'cluttered scene',
    'multiple subjects', 'crowd',
    'bright background', 'white background',
  ],

  /** Text-safe zones — areas that MUST remain clear for text overlay */
  textSafeZones: {
    top: { y: 0, height: 0.25, description: 'Top 25% — reserved for headline text' },
    bottom: { y: 0.75, height: 0.25, description: 'Bottom 25% — reserved for CTA or supporting text' },
  },

  /** Image quality requirements */
  quality: {
    style: 'photorealistic' as const,
    minPromptDetail: 'Always include lighting, camera angle, and mood descriptors',
    consistencyRule: 'Every image must feel like the same photographer shot it — same color grade, same lighting style',
  },
} as const;

// ─── Unified Visual System Export ────────────────────────────────

export const VISUAL_SYSTEM = {
  palette: COLOR_PALETTE,
  lighting: LIGHTING_RULES,
  backgrounds: BACKGROUND_RULES,
  imageConstraints: IMAGE_CONSTRAINTS,
} as const;

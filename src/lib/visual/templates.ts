/**
 * TASK 2 — Visual Templates
 *
 * 4 reusable templates that define composition, camera angle,
 * subject placement, and empty space for text overlay.
 */

import type { LightingRule, BackgroundRule } from './system';

// ─── Template Types ──────────────────────────────────────────────

export interface TextZone {
  /** Position as fraction of frame (0-1) */
  x: number;
  y: number;
  /** Size as fraction of frame */
  width: number;
  height: number;
  /** What goes here */
  purpose: 'headline' | 'subtext' | 'cta' | 'data-label';
  alignment: 'left' | 'center' | 'right';
}

export interface VisualTemplate {
  id: string;
  name: string;
  description: string;

  /** When to use this template */
  bestFor: string[];
  /** Slide roles this template works well with */
  slideRoles: string[];

  composition: {
    description: string;
    ruleOfThirds: string;
    subjectPlacement: string;
    subjectScale: string;
    depthLayers: string;
  };

  camera: {
    angle: string;
    focalLength: string;
    depthOfField: string;
    movement: string;
  };

  /** Reserved text-safe zones */
  textZones: TextZone[];

  /** Preferred lighting from LIGHTING_RULES */
  preferredLighting: string;
  /** Preferred background from BACKGROUND_RULES */
  preferredBackground: string;

  /** Base image prompt fragment (subject gets injected) */
  basePromptFragment: string;
  /** Mood/atmosphere keywords */
  moodKeywords: string[];
}

// ─── Template 1: Data / HUD Interface ───────────────────────────

const DATA_HUD: VisualTemplate = {
  id: 'data-hud',
  name: 'Data / HUD Interface',
  description: 'Futuristic heads-up display aesthetic. Clean data visualization with glowing elements on dark background. Information-dense but organized.',

  bestFor: ['statistics', 'data reveals', 'tech insights', 'metric-driven slides', 'listicles'],
  slideRoles: ['BUILD', 'INSIGHT', 'SETUP'],

  composition: {
    description: 'Central focal point with radiating data elements. Clean geometric grid implied by element placement.',
    ruleOfThirds: 'Primary data element centered, supporting elements along third lines',
    subjectPlacement: 'Center 40% of frame — a screen, hologram, or data visualization',
    subjectScale: 'Close-up to medium — filling center but leaving clear margins',
    depthLayers: '2 layers: sharp foreground data elements floating over deep dark void',
  },

  camera: {
    angle: 'Straight-on, perpendicular to display surface',
    focalLength: '50mm equivalent — neutral, no distortion',
    depthOfField: 'Medium — f/4.0, most elements in focus',
    movement: 'Static, locked-off, precision framing',
  },

  textZones: [
    { x: 0.1, y: 0.05, width: 0.8, height: 0.20, purpose: 'headline', alignment: 'center' },
    { x: 0.1, y: 0.35, width: 0.35, height: 0.30, purpose: 'data-label', alignment: 'left' },
    { x: 0.55, y: 0.35, width: 0.35, height: 0.30, purpose: 'data-label', alignment: 'right' },
    { x: 0.1, y: 0.80, width: 0.8, height: 0.15, purpose: 'subtext', alignment: 'center' },
  ],

  preferredLighting: 'cool-ambient',
  preferredBackground: 'solid-with-texture',

  basePromptFragment: 'dark information display showing {subject}, data elements on deep black background, clean geometric layout, minimal technical display',
  moodKeywords: ['precise', 'clean', 'data-driven', 'technical', 'minimal'],
};

// ─── Template 3: Large-Scale Office / System ────────────────────

const LARGE_SCALE: VisualTemplate = {
  id: 'large-scale',
  name: 'Large-Scale Office / System',
  description: 'Wide establishing shot of a massive environment — server room, trading floor, corporate HQ. Conveys scale, power, and the weight of systems.',

  bestFor: ['industry insights', 'systemic problems', 'big-picture narratives', 'corporate critique'],
  slideRoles: ['SETUP', 'BUILD', 'CTA'],

  composition: {
    description: 'Wide shot with strong leading lines (corridors, server racks, desk rows) pulling eye to a vanishing point. Small human figure for scale.',
    ruleOfThirds: 'Vanishing point on center or right third, leading lines from bottom-left',
    subjectPlacement: 'Small figure at one-third point — emphasizes environment over individual',
    subjectScale: 'Wide shot — full body, small relative to environment (< 20% of frame)',
    depthLayers: '4 layers: foreground element (desk/rack edge), mid-ground environment, small subject, deep background vanishing point',
  },

  camera: {
    angle: 'Low angle, 15-20° looking up — makes environment feel imposing',
    focalLength: '24mm equivalent — wide, shows scale, controlled distortion',
    depthOfField: 'Deep — f/8.0, everything sharp to emphasize vastness',
    movement: 'Static, architectural precision',
  },

  textZones: [
    { x: 0.05, y: 0.05, width: 0.9, height: 0.25, purpose: 'headline', alignment: 'left' },
    { x: 0.05, y: 0.78, width: 0.6, height: 0.18, purpose: 'subtext', alignment: 'left' },
  ],

  preferredLighting: 'top-down-spotlight',
  preferredBackground: 'minimal-environment',

  basePromptFragment: 'wide establishing shot of {subject}, dramatic perspective with strong leading lines, small human figure for scale, dark moody atmosphere, low angle looking up, architectural composition',
  moodKeywords: ['imposing', 'vast', 'systematic', 'powerful', 'institutional'],
};

// ─── Template 4: Dramatic Moment / Tension ──────────────────────

const DRAMATIC_TENSION: VisualTemplate = {
  id: 'dramatic-tension',
  name: 'Dramatic Moment / Tension',
  description: 'Tight, high-contrast shot capturing a decisive moment. Close-up with extreme lighting for maximum emotional impact.',

  bestFor: ['reveals', 'twists', 'consequences', 'emotional peaks', 'single powerful statements'],
  slideRoles: ['TWIST', 'HOOK', 'INSIGHT', 'SETUP'],

  composition: {
    description: 'Extreme close-up or tight medium shot. Subject fills frame aggressively. Minimal negative space — text overlays directly on dark areas of the image.',
    ruleOfThirds: 'Subject face/key element on upper-left third intersection',
    subjectPlacement: 'Fills 50-60% of frame — tight crop, confrontational',
    subjectScale: 'Close-up — face only, or hands on object, or tight detail shot',
    depthLayers: '2 layers: ultra-sharp subject, everything else falls to black',
  },

  camera: {
    angle: 'Slightly below eye level — subject looks powerful, viewer looks up',
    focalLength: '135mm equivalent — extreme compression, intimate, intense',
    depthOfField: 'Very shallow — f/1.8, razor-thin focus plane',
    movement: 'Static but feels urgent — framing implies frozen action',
  },

  textZones: [
    { x: 0.05, y: 0.05, width: 0.55, height: 0.20, purpose: 'headline', alignment: 'left' },
    { x: 0.05, y: 0.80, width: 0.9, height: 0.15, purpose: 'cta', alignment: 'center' },
  ],

  preferredLighting: 'rim-light',
  preferredBackground: 'deep-dark-gradient',

  basePromptFragment: 'dramatic close-up of {subject}, intense rim lighting from behind, face partially in shadow, high contrast, dark moody atmosphere, cinematic tension, shallow depth of field',
  moodKeywords: ['intense', 'urgent', 'confrontational', 'dramatic', 'decisive'],
};

// ─── Template 5: Closing CTA ─────────────────────────────────────

const CLOSING_CTA: VisualTemplate = {
  id: 'closing-cta',
  name: 'Closing CTA',
  description: 'Conclusive closing slide. Resolved composition that signals the carousel is complete. Same visual family as fact slides but with a sense of finality — the subject at rest, the system in full view, the story concluded.',

  bestFor: ['closing slides', 'call-to-action', 'carousel endings', 'wrap-up'],
  slideRoles: ['CTA'],

  composition: {
    description: 'Subject or environment in a resolved, stable state. Centered or symmetrical composition suggesting completion. Clean lower third reserved for text bar.',
    ruleOfThirds: 'Subject centered or on center vertical third, horizon on lower third line',
    subjectPlacement: 'Center-top 60% of frame — environment or subject pulled back to show full context',
    subjectScale: 'Medium-wide — enough context to feel resolved, not claustrophobic',
    depthLayers: '2-3 layers: sharp subject, soft environment, clean bottom zone',
  },

  camera: {
    angle: 'Eye level or slightly elevated — calm, authoritative, overview',
    focalLength: '35mm equivalent — contextual, natural perspective',
    depthOfField: 'Medium — f/4.0, subject sharp, environment slightly soft',
    movement: 'Static, composed, final',
  },

  textZones: [
    { x: 0.06, y: 0.77, width: 0.88, height: 0.21, purpose: 'headline', alignment: 'left' },
    { x: 0.06, y: 0.90, width: 0.88, height: 0.08, purpose: 'subtext', alignment: 'left' },
  ],

  preferredLighting: 'warm-accent-cold-fill',
  preferredBackground: 'minimal-environment',

  basePromptFragment: 'resolved wide view of {subject}, calm and stable composition, environment in full context, warm natural light suggesting conclusion, clean empty lower quarter of frame, no action or tension, sense of completion',
  moodKeywords: ['resolved', 'conclusive', 'calm', 'authoritative', 'final'],
};

// ─── Template Registry ──────────────────────────────────────────

export const VISUAL_TEMPLATES: Record<string, VisualTemplate> = {
  'data-hud': DATA_HUD,
  'large-scale': LARGE_SCALE,
  'dramatic-tension': DRAMATIC_TENSION,
  'closing-cta': CLOSING_CTA,
};

/**
 * Get the best template for a given slide role.
 * Returns templates sorted by relevance (first = best match).
 */
// Map V2 slide roles to legacy template roles
const V2_ROLE_MAP: Record<string, string> = {
  'OPENER': 'HOOK',
  'FACT': 'BUILD',
  'IMPLICATION': 'INSIGHT',
};

export function getTemplatesForRole(slideRole: string): VisualTemplate[] {
  const role = V2_ROLE_MAP[slideRole.toUpperCase()] ?? slideRole.toUpperCase();
  return Object.values(VISUAL_TEMPLATES)
    .filter(t => t.slideRoles.includes(role))
    .sort((a, b) => {
      const aIdx = a.slideRoles.indexOf(role);
      const bIdx = b.slideRoles.indexOf(role);
      return aIdx - bIdx;
    });
}

/**
 * Get a specific template by ID.
 */
export function getTemplate(id: string): VisualTemplate | undefined {
  return VISUAL_TEMPLATES[id];
}

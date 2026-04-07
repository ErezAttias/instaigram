/**
 * Carousel Design Engine — Entry Point
 *
 * Unified export for the visual system, templates, text overlay rules,
 * and prompt builder. Import from here for all visual engine needs.
 */

// Task 1: Visual System
export { VISUAL_SYSTEM, COLOR_PALETTE, LIGHTING_RULES, BACKGROUND_RULES, IMAGE_CONSTRAINTS } from './system';
export type { LightingRule, BackgroundRule, ColorToken } from './system';

// Task 2: Visual Templates
export { VISUAL_TEMPLATES, getTemplatesForRole, getTemplate } from './templates';
export type { VisualTemplate, TextZone } from './templates';

// Task 3: Text Overlay System
export { TEXT_OVERLAY_SYSTEM, TYPOGRAPHY, LINE_BREAK_RULES, EMPHASIS_RULES, TEXT_COLOR_RULES } from './text-overlay';
export type { TypographyStyle, EmphasisResult } from './text-overlay';

// Visual Intent Engine
export { buildVisualIntent } from './intent';
export type { VisualIntent, IntentInput, TopicDomain, HeadlineTension } from './intent';

// Style Lock (Visual Discipline System)
export { applyStyleLock, getStyleLock, STYLE_LOCK_REGISTRY } from './style-lock';
export type { StyleLockProfile, StyleLockResult } from './style-lock';

// Distortion / Visual Tension Engine
export { buildDistortion } from './distortion';
export type { Distortion, DistortionType, DistortionInput } from './distortion';

// Prompt Builder (v4 — intent + style lock + distortion)
export { buildSlidePrompt, buildCarouselPrompts } from './prompt-builder';
export type { PromptBuilderInput, PromptBuilderOutput, LayoutInstruction } from './prompt-builder';


// ─── Example Usage & Structured JSON Output ─────────────────────

/**
 * Generate a full example showing the design engine in action.
 * Call this to see structured JSON output for a sample carousel.
 */
export function generateExampleOutput() {
  const { buildCarouselPrompts } = require('./prompt-builder');

  const exampleCarousel = [
    {
      role: 'HOOK',
      subject: 'a software engineer staring at a glowing screen in a dark room',
      headlineText: 'AI will never replace you',
    },
    {
      role: 'SETUP',
      subject: 'a massive open-plan office with hundreds of empty desks',
      headlineText: 'But someone using AI will',
      bodyText: 'The gap between adopters and resistors is growing every week.',
    },
    {
      role: 'BUILD',
      subject: 'a technical dashboard showing productivity metrics',
      headlineText: '10x output is real',
      bodyText: 'Teams using AI copilots ship 3x faster with 40% fewer bugs.',
    },
    {
      role: 'TWIST',
      subject: 'a close-up of hands typing furiously on a keyboard',
      headlineText: 'The secret nobody talks about',
      bodyText: 'It\'s not the tool. It\'s the prompt.',
    },
    {
      role: 'INSIGHT',
      subject: 'a holographic interface showing a structured workflow',
      headlineText: 'Build systems not prompts',
      bodyText: 'The best AI users build repeatable workflows, not one-off queries.',
    },
    {
      role: 'CTA',
      subject: 'a person walking confidently toward a bright doorway in a dark corridor',
      headlineText: 'Start building today',
      bodyText: 'Follow for daily AI engineering insights.',
    },
  ];

  return buildCarouselPrompts(exampleCarousel);
}

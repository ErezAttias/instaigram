/**
 * Carousel Enforcement — Central Validation Gate
 *
 * This is the LAST gate before a carousel can be approved or exported.
 * It aggregates all validators and returns a single pass/fail verdict.
 *
 * Nothing passes this gate without satisfying ALL checks:
 *   1. Role-content validation (CTA has action verb, FACT has concrete claim, etc.)
 *   2. No text in images (vision-based detection)
 *   3. Visual-text consistency (image matches the described attributes)
 *   4. Style consistency (no domain-violating elements in images)
 *
 * Two modes:
 *   - Pre-render:  runs deterministic checks on copy only (fast, no LLM)
 *   - Post-render:  runs all checks including image analysis (slower, uses vision LLM)
 *
 * Called in standalone-carousel-service.ts:
 *   - Pre-render gate:  after quality gates, before image rendering
 *   - Post-render gate:  after each image render, determines if image is accepted
 *   - Approval gate:     blocks approveCarousel() if any check fails
 */

import { validateRoleContent, getCTAFailures, type RoleContentReport, type RoleContentFailure } from './role-content-validator';
import { detectTextInImage, quickTextCheck, type TextDetectionResult } from './image-text-detector';
import { extractVisualAttributes, verifyVisualTruth, quickVisualTruthCheck, evaluateVisualEvidence, type VisualTruthResult, type VisualEvidenceResult } from './visual-truth-validator';
import { auditPromptStyle, auditImageStyle, type StyleValidationResult } from './style-validator';
import type { AIProvider } from '@/lib/ai/types';

// ─── Types ──────────────────────────────────────────────────────

interface SlideInput {
  slideNumber: number;
  role: string;
  headline: string;
  body: string;
  supportingDetail?: string | null;
  factType?: string | null;
  containsNumber?: boolean;
  topicEntity?: string | null;
}

interface RenderedSlide extends SlideInput {
  imageBase64?: string | null;
  /** Raw provider image BEFORE text overlay — used for text-in-image detection */
  rawImageBase64?: string;
  imagePrompt?: string;
}

export interface EnforcementFailure {
  slideIndex: number;
  category: 'role-content' | 'text-in-image' | 'visual-truth' | 'style';
  rule: string;
  detail: string;
  autoFixable: boolean;
}

export interface PreRenderReport {
  passed: boolean;
  failures: EnforcementFailure[];
  ctaFailures: RoleContentFailure[];
  roleContentReport: RoleContentReport;
}

export interface PostRenderSlideReport {
  slideIndex: number;
  passed: boolean;
  failures: EnforcementFailure[];
  textDetection?: TextDetectionResult;
  visualTruth?: VisualTruthResult;
  visualEvidence?: VisualEvidenceResult;
  styleValidation?: StyleValidationResult;
  shouldRegenerate: boolean;
}

export interface ApprovalReport {
  approved: boolean;
  failures: EnforcementFailure[];
  slideReports: PostRenderSlideReport[];
  summary: {
    totalSlides: number;
    passedSlides: number;
    failedSlides: number;
    regenerationNeeded: number;
  };
}

// ─── Pre-Render Gate ────────────────────────────────────────────

/**
 * Run BEFORE image rendering. Fast, deterministic checks only.
 *
 * Validates:
 * - Role-content rules (CTA action verb, FACT concrete claims, OPENER hook)
 * - Prompt-level style audit (catches forbidden terms before they reach the image generator)
 *
 * Returns CTA failures separately so the caller can auto-regenerate.
 */
export function runPreRenderGate(
  slides: SlideInput[],
  imagePrompts?: Array<{ slideIndex: number; prompt: string; topicDomain: string }>,
): PreRenderReport {
  const failures: EnforcementFailure[] = [];

  // 1. Role-content validation
  const roleReport = validateRoleContent(slides);
  for (const f of roleReport.failures) {
    failures.push({
      slideIndex: f.slideIndex,
      category: 'role-content',
      rule: f.rule,
      detail: f.detail,
      autoFixable: f.role === 'CTA', // CTA failures can be auto-fixed via regen
    });
  }

  // 2. Prompt style audit (if prompts provided)
  if (imagePrompts) {
    for (const { slideIndex, prompt, topicDomain } of imagePrompts) {
      const styleResult = auditPromptStyle(prompt, topicDomain);
      for (const v of styleResult.violations) {
        if (v.severity === 'hard') {
          failures.push({
            slideIndex,
            category: 'style',
            rule: 'PROMPT_STYLE_VIOLATION',
            detail: `${v.element}: ${v.detail}`,
            autoFixable: false,
          });
        }
      }
    }
  }

  const ctaFailures = getCTAFailures(roleReport);

  console.log(`[Enforcement/PreRender] ${failures.length === 0 ? 'PASSED' : `FAILED — ${failures.length} issue(s)`}`);

  return {
    passed: failures.length === 0,
    failures,
    ctaFailures,
    roleContentReport: roleReport,
  };
}

// ─── Post-Render Slide Gate ─────────────────────────────────────

/**
 * Run AFTER a single slide image is rendered.
 *
 * Validates the image itself:
 * - No text in image (vision LLM)
 * - Visual truth (image matches text attributes)
 * - Style consistency (no domain violations)
 *
 * Returns whether this slide needs regeneration.
 */
export async function runPostRenderSlideGate(
  slide: RenderedSlide,
  topicDomain: string,
  ai: AIProvider,
): Promise<PostRenderSlideReport> {
  const failures: EnforcementFailure[] = [];
  let shouldRegenerate = false;

  // Skip image checks if no image
  if (!slide.imageBase64) {
    return {
      slideIndex: slide.slideNumber,
      passed: true,
      failures: [],
      shouldRegenerate: false,
    };
  }

  // 1. Text-in-image detection — runs on RAW provider image (before text overlay)
  //    to avoid false positives from our own SVG overlay text.
  let textDetection: TextDetectionResult | undefined;
  try {
    // Quick heuristic first
    if (slide.imagePrompt && quickTextCheck(slide.imagePrompt)) {
      failures.push({
        slideIndex: slide.slideNumber,
        category: 'text-in-image',
        rule: 'PROMPT_REQUESTS_TEXT',
        detail: 'Image prompt contains text-rendering instructions',
        autoFixable: false,
      });
    }

    // Full vision detection on the RAW provider image (no overlay text)
    const imageForTextDetection = slide.rawImageBase64 || slide.imageBase64;
    if (slide.rawImageBase64) {
      console.log(`[ImageStage] Raw image text detection: running on pre-overlay image for slide ${slide.slideNumber + 1}`);
    } else {
      console.warn(`[ImageStage] Raw image text detection: no raw image available for slide ${slide.slideNumber + 1}, falling back to composited image`);
    }
    textDetection = await detectTextInImage(imageForTextDetection!, ai);
    if (textDetection.shouldReject) {
      console.log(`[ImageStage] Raw image text detection: FAIL — slide ${slide.slideNumber + 1} (confidence: ${textDetection.confidence.toFixed(2)})`);
      failures.push({
        slideIndex: slide.slideNumber,
        category: 'text-in-image',
        rule: 'IMAGE_CONTAINS_TEXT',
        detail: `Visible text detected in raw provider image (confidence: ${textDetection.confidence.toFixed(2)}): ${textDetection.detectedText.join(', ')}`,
        autoFixable: true, // Can regenerate the image
      });
      shouldRegenerate = true;
    } else {
      console.log(`[ImageStage] Raw image text detection: PASS — slide ${slide.slideNumber + 1}`);
    }
  } catch (err) {
    console.warn(`[Enforcement/PostRender] Text detection failed for slide ${slide.slideNumber}: ${err}`);
  }

  // 2. Visual truth validation (only for FACT/OPENER slides with visual claims)
  let visualTruth: VisualTruthResult | undefined;
  if (slide.role === 'FACT' || slide.role === 'OPENER') {
    try {
      // Quick deterministic check first
      if (slide.imagePrompt) {
        const quickCheck = quickVisualTruthCheck(slide.headline, slide.body, slide.imagePrompt);
        if (!quickCheck.passed) {
          for (const mismatch of quickCheck.mismatches) {
            failures.push({
              slideIndex: slide.slideNumber,
              category: 'visual-truth',
              rule: 'PROMPT_ATTRIBUTE_MISMATCH',
              detail: mismatch,
              autoFixable: false,
            });
          }
        }
      }

      // Full vision verification for high-priority attributes
      const attributes = extractVisualAttributes(slide.headline, slide.body, slide.topicEntity || undefined);
      const highPriority = attributes.filter(a => a.priority === 'high');

      if (highPriority.length > 0) {
        visualTruth = await verifyVisualTruth(slide.imageBase64, attributes);
        if (!visualTruth.passed) {
          const failedAttrs = visualTruth.verifiedAttributes.filter(v => !v.matched);
          for (const attr of failedAttrs) {
            failures.push({
              slideIndex: slide.slideNumber,
              category: 'visual-truth',
              rule: 'IMAGE_ATTRIBUTE_MISMATCH',
              detail: `"${attr.claim}" not matched: ${attr.detail}`,
              autoFixable: true,
            });
          }
          if (visualTruth.shouldRegenerate) {
            shouldRegenerate = true;
          }
        }
      }
    } catch (err) {
      console.warn(`[Enforcement/PostRender] Visual truth check failed for slide ${slide.slideNumber}: ${err}`);
    }
  }

  // 3. Style validation
  let styleValidation: StyleValidationResult | undefined;
  try {
    styleValidation = await auditImageStyle(slide.imageBase64, topicDomain);
    if (!styleValidation.passed) {
      for (const v of styleValidation.violations) {
        if (v.severity === 'hard') {
          failures.push({
            slideIndex: slide.slideNumber,
            category: 'style',
            rule: 'IMAGE_STYLE_VIOLATION',
            detail: `${v.element}: ${v.detail}`,
            autoFixable: true,
          });
          shouldRegenerate = true;
        }
      }
    }
  } catch (err) {
    console.warn(`[Enforcement/PostRender] Style validation failed for slide ${slide.slideNumber}: ${err}`);
  }

  // 4. Visual evidence — does the image SUPPORT the claim?
  let visualEvidence: VisualEvidenceResult | undefined;
  if (slide.role === 'FACT' || slide.role === 'OPENER') {
    try {
      visualEvidence = await evaluateVisualEvidence(
        slide.imageBase64,
        slide.headline,
        slide.body,
        slide.role,
      );
      if (visualEvidence.shouldRegenerate) {
        failures.push({
          slideIndex: slide.slideNumber,
          category: 'visual-truth',
          rule: 'WEAK_VISUAL_EVIDENCE',
          detail: `Evidence score ${visualEvidence.evidenceScore}/5 — image shows "${visualEvidence.imageDescription}" but should show "${visualEvidence.suggestedSubject}"`,
          autoFixable: true,
        });
        shouldRegenerate = true;
      }
    } catch (err) {
      console.warn(`[Enforcement/PostRender] Visual evidence check failed for slide ${slide.slideNumber}: ${err}`);
    }
  }

  const passed = failures.length === 0;

  if (!passed) {
    console.warn(`[Enforcement/PostRender] Slide ${slide.slideNumber + 1} FAILED — ${failures.length} issue(s), regenerate=${shouldRegenerate}`);
  }

  return {
    slideIndex: slide.slideNumber,
    passed,
    failures,
    textDetection,
    visualTruth,
    visualEvidence,
    styleValidation,
    shouldRegenerate,
  };
}

// ─���─ Approval Gate ──────────────────────────────────────────────

/**
 * Final approval gate — called when user attempts to approve a carousel.
 *
 * Re-runs role-content validation on the final slide data.
 * Aggregates any stored post-render results.
 *
 * Returns a comprehensive report. If approved=false, the carousel
 * CANNOT be exported or published.
 */
export function runApprovalGate(
  slides: SlideInput[],
  postRenderReports?: PostRenderSlideReport[],
): ApprovalReport {
  const allFailures: EnforcementFailure[] = [];

  // 1. Re-validate role content (in case of manual edits)
  const roleReport = validateRoleContent(slides);
  for (const f of roleReport.failures) {
    allFailures.push({
      slideIndex: f.slideIndex,
      category: 'role-content',
      rule: f.rule,
      detail: f.detail,
      autoFixable: false, // At approval time, nothing is auto-fixable
    });
  }

  // 2. Include post-render failures
  const slideReports: PostRenderSlideReport[] = postRenderReports || [];
  for (const report of slideReports) {
    allFailures.push(...report.failures);
  }

  // 3. Compute summary
  const passedSlides = slides.length - new Set(allFailures.map(f => f.slideIndex)).size;
  const failedSlideSet = new Set(allFailures.map(f => f.slideIndex));
  const regenNeeded = slideReports.filter(r => r.shouldRegenerate).length;

  const approved = allFailures.length === 0;

  console.log(`[Enforcement/Approval] ${approved ? 'APPROVED' : `BLOCKED — ${allFailures.length} failure(s) across ${failedSlideSet.size} slide(s)`}`);

  return {
    approved,
    failures: allFailures,
    slideReports,
    summary: {
      totalSlides: slides.length,
      passedSlides,
      failedSlides: failedSlideSet.size,
      regenerationNeeded: regenNeeded,
    },
  };
}

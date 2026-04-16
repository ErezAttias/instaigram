/**
 * Standalone Carousel Service — MVP Vertical Slice
 *
 * Generates a full carousel from a topic string, independent of the
 * Channel/Post hierarchy. Reuses the existing carousel pipeline,
 * visual renderers, and image providers.
 *
 * Fixed 6-slide structure: OPENER + 4 FACT + CTA
 *
 * Flow:
 *   1. Create CarouselJob in DB (PENDING)
 *   2. Generate hook from topic (LLM)
 *   3. Run carousel pipeline (GENERATING)
 *   4. Enforce 6-slide structure (normalize IMPLICATION → FACT)
 *   5. Copy quality gate (detect weak/generic copy, auto-rewrite)
 *   6. Narrative coherence gate (semantic dedup, diversity, escalation)
 *   7. Hook–body promise gate (editorial promise integrity)
 *   8. Render images for each slide (RENDERING)
 *   9. Store results with explicit status per slide → COMPLETE
 */

import { prisma } from '@/lib/db/prisma';
import { SlideRole } from '@/generated/prisma/enums';
import { getAIProvider } from '@/lib/ai/provider';
import { generateCarousel } from '@/lib/pipeline/carousel-pipeline';
import { fetchTopicKnowledge } from '@/lib/external/topic-knowledge';
import { renderFactSlide } from '@/lib/visual/fact-slide-renderer';
import { renderBoldSlide } from '@/lib/visual/bold-slide-renderer';
import { DEFAULT_VISUAL_STYLE, type ChannelVisualStyleContext } from '@/lib/visual/visual-style';
import { getImageProviderForTopic, getUnifiedImageProvider, UnifiedImageProvider, isCelebrityTopic, type ImageGenerator, type ImageSourceProvider } from '@/lib/ai/image-provider';
import { resolveWikipediaConcept } from '@/lib/ai/wikipedia-image-provider';
import { ProviderFailedError } from '@/lib/ai/retry';
import { buildSlidePrompt } from '@/lib/visual/prompt-builder';
import type { AIProvider } from '@/lib/ai/types';
import type { PipelineResult, PipelineParams } from '@/lib/pipeline/carousel-pipeline';
import { selectConcept } from '@/lib/pipeline/steps/concept';
import type { CarouselMode } from '@/lib/validation/schemas';
import type { GeneratedSlideV2, CompressedSlideDisplay, PatchedSlide } from '@/lib/validation/schemas';
import { PatchedSlide as PatchedSlideSchema } from '@/lib/validation/schemas';
import { compressSlides } from '@/lib/pipeline/steps/compress';
import { runCopyQualityGate } from '@/lib/pipeline/steps/copy-quality-gate';
import { runNarrativeCoherenceGate } from '@/lib/pipeline/steps/narrative-coherence-gate';
import { runHookPromiseGate } from '@/lib/pipeline/steps/hook-promise-gate';
import { buildUserRegenSlidePrompt } from '@/lib/pipeline/prompts/user-regen-slide-prompt';
import {
  runPreRenderGate,
  runPostRenderSlideGate,
  runApprovalGate,
  type PreRenderReport,
  type PostRenderSlideReport,
  type ApprovalReport,
} from '@/lib/validation/carousel-enforcement';
import { auditPromptStyle } from '@/lib/validation/style-validator';
import { generateArticle } from '@/lib/services/article-service';
import { saveImage, saveRawImage, loadRawImage } from '@/lib/storage/image-storage';

// ─── Helpers ────────────────────────────────────────────────

/**
 * Extract a clean visual subject from a job topic string.
 *
 * Job topics are often copywriting titles like "Discover Honey's Unique
 * Preservation Magic" — feeding these directly into image prompts causes
 * Gemini to interpret abstract words ("magic", "preservation") as visual
 * concepts, producing generic/metaphorical imagery instead of the actual
 * subject. This strips filler and returns the core noun (e.g., "Honey").
 */
function extractVisualSubject(topic: string): string {
  // Strip common title filler patterns
  let cleaned = topic
    .replace(/^(discover|explore|learn about|the truth about|facts about|everything about|all about|understanding|unveiling|revealing)\s+/i, '')
    .replace(/'s\s+(unique|amazing|incredible|surprising|fascinating|hidden|secret|unknown|mysterious|little[- ]known|remarkable|extraordinary|mind[- ]blowing|stunning|unbelievable)\s+.*/i, '')
    .replace(/\s*[:—–-]\s*(fact|fiction|myth|truth|reality|what you|why|how|the real).*/i, '')
    .replace(/\s+(magic|mysteries|secrets|wonders|powers|miracles|marvels)\s*$/i, '')
    .replace(/\s+(facts|truths|myths|things you didn't know)\s*$/i, '')
    .trim();

  // If cleaning stripped everything or left less than 2 chars, fall back to
  // the first 1-3 meaningful words of the original topic
  if (cleaned.length < 2) {
    const words = topic.split(/\s+/).filter(w => w.length > 2);
    cleaned = words.slice(0, 3).join(' ');
  }

  return cleaned;
}

// ─── Constants ───────────────────────────────────────────────

/** Fixed MVP slide structure: OPENER + 4 FACT + CTA */
const MVP_SLIDE_STRUCTURE: readonly SlideRole[] = [
  'OPENER' as SlideRole,
  'FACT' as SlideRole,
  'FACT' as SlideRole,
  'FACT' as SlideRole,
  'FACT' as SlideRole,
  'CTA' as SlideRole,
];
const MVP_SLIDE_COUNT = MVP_SLIDE_STRUCTURE.length;

// ─── Types ──────────────────────────────────────────────────

export interface ProgressEvent {
  step: string;
  message: string;
  pct: number;
}

export type ProgressCallback = (event: ProgressEvent) => void;

// ─── Create Job ─────────────────────────────────────────────

export async function createCarouselJob(topic: string, direction?: string, channelId?: string, batchOrderId?: string, exactSubject?: string, layout?: 'DETAILED' | 'BOLD') {
  return prisma.carouselJob.create({
    data: {
      topic,
      direction: direction || null,
      exactSubject: exactSubject || null,
      channelId: channelId || null,
      batchOrderId: batchOrderId || null,
      layout: layout || 'DETAILED',
      status: 'PENDING',
    },
  });
}

// ─── Enforce 6-Slide Structure ──────────────────────────────

/**
 * Normalize pipeline output to exactly 6 slides: OPENER + 4 FACT + CTA.
 * - IMPLICATION slides are converted to FACT
 * - Excess slides are trimmed (keep OPENER, best FACTs, CTA)
 * - Missing FACTs are filled by duplicating existing ones with modified headlines
 */
function enforce6SlideStructure(
  slides: GeneratedSlideV2[],
  compressedSlides: CompressedSlideDisplay[],
): { slides: GeneratedSlideV2[]; compressedSlides: CompressedSlideDisplay[] } {
  // Convert IMPLICATION → FACT
  const normalized = slides.map(s => ({
    ...s,
    role: s.role === 'IMPLICATION' ? 'FACT' : s.role,
  }));

  // Split by role
  const opener = normalized.find(s => s.role === 'OPENER');
  const cta = normalized.find(s => s.role === 'CTA');
  let facts = normalized.filter(s => s.role === 'FACT');

  if (!opener || !cta) {
    console.error('[enforce6Slide] Missing OPENER or CTA — cannot normalize');
    return { slides: normalized, compressedSlides };
  }

  // Trim or pad FACTs to exactly 4
  if (facts.length > 4) {
    facts = facts.slice(0, 4);
  }
  while (facts.length < 4) {
    // Duplicate the last FACT with a modified slideNumber
    const source = facts[facts.length - 1] || opener;
    facts.push({ ...source, slideNumber: facts.length + 1, role: 'FACT' });
  }

  // Reassemble with correct slideNumbers
  const result: GeneratedSlideV2[] = [
    { ...opener, slideNumber: 0 },
    ...facts.map((f, i) => ({ ...f, slideNumber: i + 1 })),
    { ...cta, slideNumber: 5 },
  ];

  // Rebuild compressed slides using ORIGINAL slideNumbers (before renumbering)
  // to avoid cross-slide data leakage when slides are trimmed/reindexed.
  // e.g., CTA originally at slideNumber=6 must not pick up compressed data
  // from a different slide that previously occupied slideNumber=5.
  const sourceSlides = [opener, ...facts, cta];
  const newCompressed: CompressedSlideDisplay[] = result.map((s, i) => {
    const originalSlideNumber = sourceSlides[i].slideNumber;
    const original = compressedSlides.find(c => c.slideNumber === originalSlideNumber);
    if (original) {
      console.log(`[enforce6Slide] Compressed mapping: slide ${s.slideNumber} (${s.role}) ← original slide ${originalSlideNumber} displayTitle="${original.displayTitle}"`);
      return { ...original, slideNumber: s.slideNumber };
    }
    console.log(`[enforce6Slide] Compressed fallback: slide ${s.slideNumber} (${s.role}) — no compressed entry for original slide ${originalSlideNumber}`);
    return {
      slideNumber: s.slideNumber,
      displayTitle: s.headline?.slice(0, 60) || '',
      displaySupport: s.body?.slice(0, 80) || '',
    };
  });

  console.log(`[enforce6Slide] Normalized to ${result.length} slides: ${result.map(s => s.role).join(', ')}`);
  return { slides: result, compressedSlides: newCompressed };
}

// ─── CTA Auto-Regeneration ───────────────────────────────────

const MAX_CTA_REGEN_ATTEMPTS = 3;

/**
 * Generate a topic-connected CTA that ties back to the hook.
 * Falls back to a safe default if LLM fails.
 */
async function autoRegenerateCTA(
  slides: GeneratedSlideV2[],
  topic: string,
  hookHeadline: string,
  ai: AIProvider,
): Promise<GeneratedSlideV2[]> {
  const ctaIndex = slides.findIndex(s => s.role === 'CTA');
  if (ctaIndex === -1) return slides;

  const updated = [...slides];

  for (let attempt = 0; attempt < MAX_CTA_REGEN_ATTEMPTS; attempt++) {
    try {
      const prompt = `You write CTA slides for Instagram carousel posts about factual topics.

TOPIC: "${topic}"
HOOK: "${hookHeadline}"

Write a CTA slide that closes the loop on the hook's promise.

RULES:
- headline: 20–80 chars, punchy, drives follow/save. Must reference the TOPIC or a word from the HOOK.
- body: 20–100 chars, reinforces why they should follow — promise more content like this.
- Do NOT use: "discover more", "stay tuned", "scratched the surface", "interesting", "fascinating"
- Do NOT start with "Unlock" or "Discover"

Return JSON only:
{ "headline": "...", "body": "..." }`;

      const result = await ai.generateObject(prompt, {
        type: 'object',
        properties: {
          headline: { type: 'string' },
          body: { type: 'string' },
        },
        required: ['headline', 'body'],
      } as any);
      const cta = result.data as { headline?: string; body?: string };

      if (cta.headline && cta.body) {
        updated[ctaIndex] = {
          ...updated[ctaIndex],
          headline: cta.headline,
          body: cta.body,
        };
        console.log(`[CTARegen] Generated topic-connected CTA: "${cta.headline}"`);
        return updated;
      }
    } catch (err) {
      console.warn(`[CTARegen] Attempt ${attempt + 1} failed: ${err}`);
    }
  }

  // Fallback: use topic-aware default
  updated[ctaIndex] = {
    ...updated[ctaIndex],
    headline: `More ${topic} facts daily`,
    body: 'Follow for posts like this every day',
  };
  console.log(`[CTARegen] All attempts failed — using topic-aware fallback`);
  return updated;
}

// ─── Render Single Slide ────────────────────────────────────

/** Result from renderSlideImage — includes both composited and raw provider image */
interface SlideRenderOutput {
  /** Final composited image (with text overlay) as base64 */
  imageBase64: string;
  /** Raw provider image BEFORE text overlay, as base64 — for text-in-image detection */
  rawImageBase64?: string;
  /**
   * Which image source was used. null = toggle not applicable (OPENER/CTA/non-celebrity FACT).
   * 'wikipedia' | 'generated' = real-place or celebrity FACT — show source toggle in UI.
   */
  resolvedImageSource: 'wikipedia' | 'generated' | null;
  /** Original Wikimedia URL — stored in DB so siblings can exclude it on next Wikipedia fetch */
  imageSourceUrl?: string;
}

/**
 * Render a single slide image. Returns composited + raw images, or throws
 * with a descriptive error. Never silently returns null.
 */
/**
 * Resolve the visual subject for the carousel. CTA slides have topicEntity: null,
 * and `job.topic` is often the page/channel name (e.g., "cool facts you didn't know"),
 * not the carousel's actual subject. This extracts the real subject from sibling slides.
 */
function resolveCarouselSubject(slides: GeneratedSlideV2[], fallbackTopic: string): string {
  // Prefer OPENER topicEntity, then first FACT with a topicEntity
  const opener = slides.find(s => s.role === 'OPENER' && s.topicEntity);
  if (opener?.topicEntity) return opener.topicEntity;

  const firstFact = slides.find(s => s.role === 'FACT' && s.topicEntity);
  if (firstFact?.topicEntity) return firstFact.topicEntity;

  return extractVisualSubject(fallbackTopic);
}

async function renderSlideImage(
  slide: GeneratedSlideV2,
  displayTitle: string,
  displaySupport: string,
  topic: string,
  imageGen: ImageGenerator,
  /** All slides in the carousel — used to resolve CTA visual subject */
  allSlides?: GeneratedSlideV2[],
  /** 'wikipedia' = use Wikipedia photo (default for real-place slides), 'generated' = always use AI */
  imageSource?: 'wikipedia' | 'generated',
  /** Carousel direction string — passed to isCelebrityTopic for person-name detection via pronouns */
  direction?: string | null,
  /** Per-channel visual style (font, colors, logo) */
  visualStyle?: ChannelVisualStyleContext,
  /** Wikimedia URLs already used by other slides — Wikipedia provider skips these */
  excludeUrls?: string[],
  /** Disambiguated concept (e.g. "Oasis (band)") — used for CTA visual subject when topicEntity is generic */
  conceptHint?: string,
  /** Raw search term from channel (e.g. "kanye west") — used for Wikipedia person lookups */
  exploreTopic?: string,
  /** Skip readability gate — accept any generated image (for manual regen) */
  skipReadabilityGate?: boolean,
  /** Contextual swipe CTA for OPENER slides (e.g. "Swipe to learn why") */
  swipeCta?: string,
  /** Carousel layout — BOLD uses full-bleed renderer */
  layout?: 'DETAILED' | 'BOLD',
): Promise<SlideRenderOutput> {

  // ── Single renderer: full-bleed image + title + subtitle ──────
  {
    const subject = conceptHint || slide.topicEntity || (allSlides ? resolveCarouselSubject(allSlides, topic) : extractVisualSubject(topic));
    const promptOutput = buildSlidePrompt({
      slideRole: slide.role === 'CTA' ? 'CTA' : slide.role === 'OPENER' ? 'HOOK' : slide.role,
      subject,
      topic,
      headlineText: displayTitle,
    });

    const result = await renderBoldSlide(
      {
        imagePrompt: promptOutput.imagePrompt,
        displayTitle,
        displaySubtitle: displaySupport || undefined,
        slideRole: slide.role,
        swipeCta,
        subjectName: exploreTopic || conceptHint || slide.topicEntity || undefined,
        excludeUrls,
        visualStyle,
      },
      imageGen,
    );

    if (!result.image) {
      throw new Error(result.error || 'Render failed — no image produced');
    }

    const imageBase64 = result.image.toString('base64');
    const rawImageBase64 = result.rawImage?.toString('base64') ?? undefined;

    return {
      imageBase64,
      rawImageBase64,
      resolvedImageSource: (result.imageSource === 'fallback' ? 'generated' : result.imageSource) as 'wikipedia' | 'generated' | null,
      imageSourceUrl: result.imageSourceUrl ?? undefined,
    };
  }

  throw new Error(`Unreachable: renderSlideImage always returns from the single-renderer block above`);
}

// ─── Generate Full Carousel ─────────────────────────────────

export async function runCarouselGeneration(
  jobId: string,
  onProgress?: ProgressCallback,
  options?: { skipImages?: boolean },
): Promise<void> {
  const job = await prisma.carouselJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`CarouselJob ${jobId} not found`);

  // Load per-channel visual style (font, colors, logo) — falls back to system defaults
  let channelVisualStyle: ChannelVisualStyleContext = DEFAULT_VISUAL_STYLE;
  if (job.channelId) {
    const styleRecord = await prisma.channelVisualStyle.findUnique({
      where: { channelId: job.channelId },
    });
    if (styleRecord) {
      channelVisualStyle = styleRecord as unknown as ChannelVisualStyleContext;
    }
  }

  // Load channel name, niche + memory for topic disambiguation and copy constraints
  let channelName: string | undefined;
  let channelNiche: string | undefined;
  let channelExploreTopic: string | undefined;
  let channelMemory: PipelineParams['memory'] | undefined;
  if (job.channelId) {
    const channel = await prisma.channel.findUnique({
      where: { id: job.channelId },
      include: { memory: true },
    });
    if (channel?.name) channelName = channel.name;
    if (channel?.niche) channelNiche = channel.niche;
    if (channel?.exploreTopic) channelExploreTopic = channel.exploreTopic;
    if (channel?.memory) {
      channelMemory = {
        tone: channel.memory.tone ?? undefined,
        aggressionLevel: channel.memory.aggressionLevel ?? undefined,
        style: channel.memory.style ?? undefined,
        avoidPatterns: channel.memory.avoidPatterns as string[] | undefined,
        forbiddenWords: channel.memory.forbiddenWords as string[] | undefined,
      };
    }
  }

  const emit = (step: string, message: string, pct: number) => {
    onProgress?.({ step, message, pct });
    prisma.carouselJob.update({
      where: { id: jobId },
      data: { progress: { step, message, pct } },
    }).catch(() => {});
  };

  // Track saved slide count for partial-result recovery
  let savedSlideCount = 0;

  try {
    // ── Step 1: Generate hook from topic ──────────────────
    await prisma.carouselJob.update({
      where: { id: jobId },
      data: { status: 'GENERATING' },
    });

    emit('hook', 'Generating hook from topic...', 5);

    const ai = getAIProvider();
    const topic = job.direction
      ? `${job.topic} — ${job.direction}`
      : job.topic;

    // Generate a hook via simple prompt
    const channelHint = channelName
      ? `\n\nThis carousel is for a channel called "${channelName}". Interpret the topic in that context (e.g. a music channel → treat artist/band names as music entities).`
      : '';
    const { data: hookResult } = await ai.generateObject(
      `You are a viral Instagram carousel content creator.\n\nGiven this topic: "${topic}"\n\nGenerate a single punchy, curiosity-driven hook headline for a fact-based carousel. The hook should create a curiosity gap and make people stop scrolling.${channelHint}\n\nReturn JSON: { "text": "...", "type": "HIDDEN_TRUTH" }\ntype must be one of: CONTRARIAN, CALL_OUT, MISTAKE_EXPOSURE, HIDDEN_TRUTH`,
      (await import('@/lib/validation/schemas')).GeneratedHook,
    );

    // ── Step 2: Pre-select concept (before knowledge fetch) ─
    // Running concept selection first lets us disambiguate ambiguous topics
    // (e.g. "Oasis" in a music channel → the band, not a desert water source)
    // so that the Wikipedia knowledge fetch targets the correct subject.

    // Fetch used concepts first (needed by concept step for dedup)
    let usedConcepts: string[] | undefined;
    if (job.channelId && !job.exactSubject) {
      const existingJobs = await prisma.carouselJob.findMany({
        where: {
          channelId: job.channelId,
          id: { not: jobId },
          status: 'COMPLETE',
          NOT: { pipelineMeta: undefined },
        },
        select: { pipelineMeta: true },
      });
      const concepts = existingJobs
        .map(j => (j.pipelineMeta as Record<string, unknown> | null)?.concept as string | undefined)
        .filter((c): c is string => typeof c === 'string' && c.length > 0);
      if (concepts.length > 0) usedConcepts = concepts;
    }

    let preSelectedConcept: string = job.exactSubject ?? '';
    let preSelectedMode: CarouselMode | undefined;
    let resolvedHook = { text: hookResult.text, type: hookResult.type };

    if (!preSelectedConcept) {
      emit('concept', 'Selecting concept...', 12);
      const conceptResult = await selectConcept(
        {
          topic: job.topic,
          hook: resolvedHook,
          channelName,
          channelNiche,
          usedConcepts,
          direction: job.direction ?? undefined,
        },
        ai,
      );
      preSelectedConcept = conceptResult.concept;
      preSelectedMode = conceptResult.mode;
      // Use the concept step's sharpened hook if it provided one
      if (conceptResult.suggestedHook && conceptResult.suggestedHook.length > 10) {
        resolvedHook = { ...resolvedHook, text: conceptResult.suggestedHook };
      }
      // Persist the resolved concept so the regen path can use it as a disambiguation hint
      await prisma.carouselJob.update({ where: { id: job.id }, data: { exactSubject: preSelectedConcept } });
    }

    // Proactively disambiguate before Wikipedia lookups — e.g. "Oasis" → "Oasis (band)".
    // resolveWikipediaConcept() tries suffixes like _(band), _(musician) proactively because
    // some topics (e.g. "Oasis") resolve to the *wrong* standard article (desert feature)
    // instead of a disambiguation page, so the internal retry logic never fires.
    // If the concept itself doesn't resolve (e.g. it's a framing phrase like "facts about them"),
    // fall back to disambiguating the raw topic name.
    if (isCelebrityTopic(job.topic, job.direction) && preSelectedConcept && !preSelectedConcept.includes('(')) {
      const wikiResolved = await resolveWikipediaConcept(preSelectedConcept) ?? await resolveWikipediaConcept(job.topic);
      if (wikiResolved) {
        console.log(`[Pipeline] Disambiguated concept "${preSelectedConcept}" → "${wikiResolved}" via Wikipedia`);
        preSelectedConcept = wikiResolved;
        await prisma.carouselJob.update({ where: { id: job.id }, data: { exactSubject: wikiResolved } });
      }
    }

    emit('knowledge', 'Mining knowledge...', 18);

    // ── Step 3: Fetch knowledge for the resolved concept ──
    // Use the disambiguated concept (e.g. "Oasis (band)") not the raw topic,
    // so Wikipedia returns facts about the correct subject.
    const knowledge = await fetchTopicKnowledge(preSelectedConcept, 15).catch(() => undefined);

    emit('pipeline', 'Running carousel pipeline...', 25);

    // ── Step 4: Run carousel pipeline ────────────────────

    const pipelineResult = await generateCarousel(
      {
        topic: job.topic,
        hook: resolvedHook,
        knowledgeFacts: knowledge?.facts,
        direction: job.direction ?? undefined,
        usedConcepts,
        memory: channelMemory,
        channelNiche,
        channelName,
        // Pass pre-selected concept so pipeline skips concept step (already done above)
        concept: preSelectedConcept,
        ...(preSelectedMode ? { mode: preSelectedMode } : {}),
        layout: (job.layout as 'DETAILED' | 'BOLD') ?? 'DETAILED',
      },
      ai,
    );

    const { carousel, validation } = pipelineResult;

    // ── Step 3.5: Enforce 6-slide structure ──────────────
    const enforced = enforce6SlideStructure(carousel.slides, pipelineResult.compressedSlides);

    emit('quality', 'Checking copy quality...', 45);

    // ── Step 4: Copy quality gate ─────────────────────────
    const carouselLayout = (job.layout as 'DETAILED' | 'BOLD') ?? 'DETAILED';

    const qualityResult = await runCopyQualityGate(
      enforced.slides,
      enforced.compressedSlides,
      job.topic,
      hookResult.text,
      ai,
      carouselLayout,
    );

    emit('narrative', 'Checking narrative coherence...', 48);

    // ── Step 4.5: Narrative coherence gate ─────────────────
    const narrativeResult = await runNarrativeCoherenceGate(
      qualityResult.slides,
      qualityResult.compressedSlides,
      job.topic,
      hookResult.text,
      ai,
      carouselLayout,
    );

    emit('promise', 'Checking hook–body promise...', 49);

    // ── Step 4.6: Hook–body promise gate ─────────────────
    const promiseResult = await runHookPromiseGate(
      narrativeResult.slides,
      narrativeResult.compressedSlides,
      job.topic,
      hookResult.text,
      ai,
      carouselLayout,
    );
    let finalSlides = promiseResult.slides;
    let finalCompressed = promiseResult.compressedSlides;
    // If hook was rewritten, update the reference for downstream use
    const finalHook = promiseResult.hookText;

    const totalRewrites = qualityResult.rewriteCount + narrativeResult.rewriteCount + promiseResult.rewriteCount;

    // ── Step 4.7: Pre-render enforcement gate ─────────────
    emit('enforcement', 'Running enforcement checks...', 49);

    // Detect topic domain and build image prompts for style audit
    const { detectTopic: _detectDomain } = await import('@/lib/visual/intent');
    const topicDomainForGate = _detectDomain({ slideRole: 'FACT', topic: job.topic });

    const imagePromptsForGate: Array<{ slideIndex: number; prompt: string; topicDomain: string }> = [];
    for (const slide of finalSlides) {
      try {
        const compressed = finalCompressed.find(c => c.slideNumber === slide.slideNumber);
        const promptOutput = buildSlidePrompt({
          slideRole: slide.role === 'OPENER' ? 'HOOK' : slide.role,
          subject: slide.topicEntity || job.topic,
          topic: job.topic,
          headlineText: compressed?.displayTitle || slide.headline,
          bodyText: compressed?.displaySupport || '',
        });
        imagePromptsForGate.push({
          slideIndex: slide.slideNumber,
          prompt: promptOutput.imagePrompt,
          topicDomain: topicDomainForGate,
        });
      } catch (promptErr) {
        console.warn(`[standalone] Prompt build failed for style audit on slide ${slide.slideNumber}: ${promptErr}`);
      }
    }

    let preRenderReport = runPreRenderGate(finalSlides, imagePromptsForGate);
    let ctaRegenAttempted = false;

    if (!preRenderReport.passed) {
      console.warn(`[standalone] Pre-render gate: ${preRenderReport.failures.length} failure(s)`);

      // Auto-regenerate CTA if it failed
      if (preRenderReport.ctaFailures.length > 0) {
        ctaRegenAttempted = true;
        console.log('[standalone] CTA failed validation — auto-regenerating...');
        finalSlides = await autoRegenerateCTA(finalSlides, job.topic, hookResult.text, ai);

        // Re-compress after CTA regen
        try {
          const recompressed = await compressSlides({ topic: job.topic, slides: finalSlides, layout: carouselLayout }, ai);
          finalCompressed = recompressed.compressed;
        } catch {
          finalCompressed = finalSlides.map(s => ({
            slideNumber: s.slideNumber,
            displayTitle: s.headline,
            displaySupport: s.body,
          }));
        }

        // Re-validate after CTA regen (re-use existing prompts — CTA prompt is decorative anyway)
        preRenderReport = runPreRenderGate(finalSlides, imagePromptsForGate);
      }
    }

    // If CTA STILL fails after regen, mark it as FAILED_CTA explicitly
    const ctaStillFailing = preRenderReport.ctaFailures.length > 0;
    if (ctaStillFailing) {
      console.error(`[standalone] CTA HARD FAIL — could not fix after ${MAX_CTA_REGEN_ATTEMPTS} attempts`);
      // Mark the CTA slide with a sentinel so it gets FAILED status in the DB
      const ctaSlide = finalSlides.find(s => s.role === 'CTA');
      if (ctaSlide) {
        (ctaSlide as GeneratedSlideV2 & { _ctaFailed?: boolean })._ctaFailed = true;
      }
    }

    emit('pipeline_done', `Carousel composed: ${finalSlides.length} slides${totalRewrites > 0 ? ` (${totalRewrites} improved)` : ''}`, 50);

    // ── Step 4.8: Generate mini-article ──────────────────
    emit('article', 'Writing mini-article...', 51);
    try {
      // expandedFacts is empty in the simple pipeline — derive synthetic
      // fact-like objects from FACT slides so the article generator still works.
      const derivedFacts = pipelineResult.expandedFacts.length > 0
        ? pipelineResult.expandedFacts.map(f => ({ claim: f.claim, expansion: f.expansion }))
        : finalSlides
            .filter(s => s.role === 'FACT')
            .map(s => ({ claim: s.headline, expansion: s.body }));
      await generateArticle(
        jobId,
        derivedFacts,
        finalSlides.map(s => ({
          role: s.role,
          headline: s.headline,
          body: s.body,
          supportingDetail: s.supportingDetail ?? null,
        })),
        job.topic,
        finalHook,
        ai,
      );
    } catch (articleErr) {
      // Article generation is non-critical — log and continue
      console.warn(`[standalone] Article generation failed for job ${jobId}:`, articleErr);
    }

    // ── Step 5: Render images ────────────────────────────
    await prisma.carouselJob.update({
      where: { id: jobId },
      data: { status: 'RENDERING' },
    });

    // Use topic-aware provider: celebrity topics → fal.ai Flux, others → Gemini.
    // This replaces CarouselImageSession's carousel-level locking which
    // required restarting all slides on mid-carousel failure.
    const imageProvider = getImageProviderForTopic(job.topic, job.direction);

    const postRenderReports: PostRenderSlideReport[] = [];
    const MAX_ENFORCEMENT_RETRIES = 2; // retries for enforcement failures only
    const PER_SLIDE_TIMEOUT_MS = 75_000; // 75s per slide: 30s Gemini + 30s Stability + 15s overhead

    // Detect topic domain for style validation
    const { detectTopic: _detectTopicDomain } = await import('@/lib/visual/intent');
    const topicDomain = _detectTopicDomain({ slideRole: 'FACT', topic: job.topic });

    // ── Failure classification ──────────────────────────────
    const NON_RETRYABLE_RULES = new Set([
      'PROMPT_STYLE_VIOLATION',
      'PROMPT_ATTRIBUTE_MISMATCH',
      'PROMPT_REQUESTS_TEXT',
      'CTA_ENFORCEMENT_FAILED',
    ]);

    function isEnforcementRetryable(failures: Array<{ rule: string }>): boolean {
      return !failures.some(f => NON_RETRYABLE_RULES.has(f.rule));
    }

    /** Check if an error is a provider-level failure (should not be retried at service level) */
    function isProviderFailure(err: unknown): boolean {
      if (err instanceof ProviderFailedError) return true;
      if (err instanceof Error && err.name === 'AbortError') return true;
      if (err instanceof Error && err.message.includes('fetch failed')) return true;
      return false;
    }

    // ── Seed placeholder slides so frontend can show "Generating..." ───
    // Delete any stale slides (in case of retry), then create placeholders
    await prisma.carouselSlide.deleteMany({ where: { carouselJobId: jobId } });
    await prisma.carouselSlide.createMany({
      data: finalSlides.map((slide, i) => {
        const compressed = finalCompressed.find(c => c.slideNumber === slide.slideNumber);
        return {
          carouselJobId: jobId,
          slideIndex: slide.slideNumber,
          role: slide.role as SlideRole,
          headline: slide.headline,
          body: slide.body,
          supportingDetail: slide.supportingDetail ?? null,
          factType: slide.factType ?? null,
          containsNumber: !!slide.containsNumber,
          concretenessScore: Math.round(slide.concretenessScore ?? 3),
          noveltyScore: Math.round(slide.noveltyScore ?? 3),
          topicEntity: slide.topicEntity,
          displayTitle: compressed?.displayTitle ?? null,
          displaySupport: compressed?.displaySupport ?? null,
          imageUrl: null,
          imageError: null,
          status: 'PENDING' as const,
        };
      }),
    });

    // ── Skip images: save copy only, mark complete ───
    if (options?.skipImages) {
      await prisma.carouselJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETE',
          pipelineMeta: JSON.parse(JSON.stringify({
            mode: pipelineResult.mode,
            concept: pipelineResult.concept,
            hook: finalHook,
            skipImages: true,
          })),
          progress: { step: 'complete', message: 'Copy ready (images skipped)', pct: 100 },
        },
      });
      emit('complete', 'Copy ready (images skipped)', 100);
      return;
    }

    // ── Image stage — per-slide timeout, per-slide fallback ───
    const imageStageStart = Date.now();

    for (let i = 0; i < finalSlides.length; i++) {
      const slide = finalSlides[i];
      const slideNum = slide.slideNumber + 1;
      const compressed = finalCompressed.find(c => c.slideNumber === slide.slideNumber);
      const displayTitle = compressed?.displayTitle || slide.headline;
      const displaySupport = compressed?.displaySupport || '';

      emit('render', `Rendering slide ${i + 1}/${finalSlides.length}...`, 50 + Math.round((i / finalSlides.length) * 40));

      console.log(`[ImageStage] Slide ${slideNum} (${slide.role}) — starting`);

      let imageBase64: string | null = null;
      let rawImageBase64: string | undefined; // Raw provider image before text overlay
      let imageError: string | null = null;
      let resolvedImageSource: 'wikipedia' | 'generated' | null = null;
      let imageSourceUrl: string | undefined;
      let postRenderReport: PostRenderSlideReport | undefined;
      let finalAttempt = 0;

      // CTA hard-fail check
      const isCTAFailed = slide.role === 'CTA' && (slide as GeneratedSlideV2 & { _ctaFailed?: boolean })._ctaFailed;
      if (isCTAFailed) {
        console.warn(`[ImageStage] Slide ${slideNum} (CTA) — FAILED (non-retryable: CTA_ENFORCEMENT_FAILED)`);
        await prisma.carouselSlide.upsert({
          where: { carouselJobId_slideIndex: { carouselJobId: jobId, slideIndex: slide.slideNumber } },
          create: {
            carouselJobId: jobId,
            slideIndex: slide.slideNumber,
            role: slide.role as SlideRole,
            headline: slide.headline,
            body: slide.body,
            supportingDetail: slide.supportingDetail ?? null,
            factType: slide.factType ?? null,
            containsNumber: !!slide.containsNumber,
            concretenessScore: Math.round(slide.concretenessScore ?? 3),
            noveltyScore: Math.round(slide.noveltyScore ?? 3),
            topicEntity: slide.topicEntity,
            displayTitle: compressed?.displayTitle ?? null,
            displaySupport: compressed?.displaySupport ?? null,
            imageUrl: null,
            imageError: 'CTA_ENFORCEMENT_FAILED: CTA does not contain a valid call to action after all retry attempts',
            status: 'FAILED_IMAGE',
          },
          update: {
            imageUrl: null,
            imageError: 'CTA_ENFORCEMENT_FAILED: CTA does not contain a valid call to action after all retry attempts',
            status: 'FAILED_IMAGE',
          },
        });
        savedSlideCount++;
        continue;
      }

      // Render with enforcement-retry loop + per-slide timeout
      const slideStart = Date.now();

      for (let attempt = 1; attempt <= MAX_ENFORCEMENT_RETRIES + 1; attempt++) {
        finalAttempt = attempt;

        // Per-slide timeout check
        const slideElapsed = Date.now() - slideStart;
        if (slideElapsed > PER_SLIDE_TIMEOUT_MS) {
          imageError = `PER_SLIDE_TIMEOUT: Timed out after ${(slideElapsed / 1000).toFixed(0)}s on attempt ${attempt}. Try regenerating.`;
          console.error(`[ImageStage] Slide ${slideNum} attempt ${attempt} — PER_SLIDE_TIMEOUT (${(slideElapsed / 1000).toFixed(0)}s)`);
          break;
        }

        // Try rendering (UnifiedImageProvider handles Gemini → Stability fallback internally)
        try {
          console.log(`[ImageStage] Slide ${slideNum} attempt ${attempt} — calling renderSlideImage`);
          const renderOutput = await renderSlideImage(slide, displayTitle, displaySupport, job.topic, imageProvider, finalSlides, undefined, job.direction, channelVisualStyle, undefined, preSelectedConcept, channelExploreTopic, true, compressed?.swipeCta, (job.layout as 'DETAILED' | 'BOLD') ?? 'DETAILED');
          imageBase64 = renderOutput.imageBase64;
          rawImageBase64 = renderOutput.rawImageBase64;
          resolvedImageSource = renderOutput.resolvedImageSource;
          imageSourceUrl = renderOutput.imageSourceUrl;
          console.log(`[ImageStage] Slide ${slideNum} attempt ${attempt} — render returned image`);
        } catch (renderErr) {
          imageError = renderErr instanceof Error ? renderErr.message : String(renderErr);
          const errSummary = imageError.slice(0, 150);

          if (isProviderFailure(renderErr)) {
            // Provider failures (both Gemini and Stability failed) — don't retry at this level
            console.error(`[ImageStage] Slide ${slideNum} attempt ${attempt} — PROVIDER FAILURE: ${errSummary}`);
            console.error(`[ImageStage] Slide ${slideNum} — both primary and secondary providers failed, not retrying`);
            break;
          }

          // Other render failures (composition, text overlay, etc.) — retryable
          console.error(`[ImageStage] Slide ${slideNum} attempt ${attempt} — RENDER ERROR: ${errSummary}`);
          if (attempt <= MAX_ENFORCEMENT_RETRIES) {
            console.log(`[ImageStage] Slide ${slideNum} attempt ${attempt} — retrying (render error is retryable)`);
            imageBase64 = null;
            continue;
          }
          break;
        }

        // Run post-render enforcement on the image
        if (imageBase64) {
          try {
            postRenderReport = await runPostRenderSlideGate(
              { ...slide, imageBase64, rawImageBase64 },
              topicDomain,
              ai,
            );

            if (postRenderReport.passed) {
              console.log(`[ImageStage] Slide ${slideNum} attempt ${attempt} — enforcement PASSED`);
              break;
            }

            // Classify enforcement failures
            const retryable = isEnforcementRetryable(postRenderReport.failures);
            const failRules = postRenderReport.failures.map(f => f.rule).join(', ');

            if (!retryable) {
              console.warn(`[ImageStage] Slide ${slideNum} attempt ${attempt} — enforcement FAILED: ${failRules} (non-retryable)`);
              imageError = `NON_RETRYABLE: ${failRules}`;
              break;
            }

            if (attempt <= MAX_ENFORCEMENT_RETRIES) {
              console.warn(`[ImageStage] Slide ${slideNum} attempt ${attempt} — enforcement FAILED: ${failRules} (retryable, will retry)`);
              imageBase64 = null;
              continue;
            }

            console.warn(`[ImageStage] Slide ${slideNum} attempt ${attempt} — enforcement FAILED: ${failRules} (out of retries)`);
            imageError = `ENFORCEMENT_WARNING: ${failRules}`;
            break;
          } catch (enforcementErr) {
            const msg = enforcementErr instanceof Error ? enforcementErr.message : String(enforcementErr);
            console.warn(`[ImageStage] Slide ${slideNum} attempt ${attempt} — enforcement error: ${msg.slice(0, 80)} (accepting image)`);
            break;
          }
        }
      }

      if (postRenderReport) {
        postRenderReports.push(postRenderReport);
      }

      // ── Last-resort fallback: if all retries exhausted with no image,
      // render a documentary-style text slide so every slide has an image.
      if (!imageBase64) {
        console.warn(`[ImageStage] Slide ${slideNum} (${slide.role}) — all retries exhausted, generating text-only fallback`);
        try {
          const fallbackResult = await renderFactSlide(
            {
              imagePrompt: 'solid dark background',
              slideType: 'fact',
              displayTitle,
              displaySupport,
              textZone: 'bottom_right',
              slideRole: slide.role === 'OPENER' ? 'HOOK' : slide.role === 'CTA' ? 'CTA' : 'FACT',
              ...(slide.role === 'OPENER' && { forceT1FontSize: 86 }),
              ...(slide.role === 'CTA' && { textMode: 'light-on-dark' as const }),
              subjectName: preSelectedConcept || job.topic,
              visualStyle: channelVisualStyle ?? DEFAULT_VISUAL_STYLE,
            },
            // No image provider — forces documentary gradient fallback
            undefined,
          );
          if (fallbackResult.image) {
            imageBase64 = fallbackResult.image.toString('base64');
            rawImageBase64 = undefined; // No raw image for fallback
            resolvedImageSource = 'generated';
            imageError = (imageError ? imageError + ' | ' : '') + 'FALLBACK_GRADIENT: used text-only fallback after provider failure';
            console.log(`[ImageStage] Slide ${slideNum} — fallback text slide generated successfully`);
          }
        } catch (fallbackErr) {
          console.error(`[ImageStage] Slide ${slideNum} — even fallback generation failed: ${fallbackErr}`);
        }
      }

      // ── Determine terminal slide status ──────────────────
      // READY:        image exists AND (enforcement passed OR only warnings)
      // FAILED_IMAGE: no image OR hard enforcement failure (non-retryable)
      let slideStatus: 'PENDING' | 'FAILED_IMAGE';
      if (!imageBase64) {
        slideStatus = 'FAILED_IMAGE';
      } else if (imageError && imageError.startsWith('NON_RETRYABLE:')) {
        // Hard enforcement failure — mark FAILED even though image exists
        slideStatus = 'FAILED_IMAGE';
      } else {
        // Image exists: passed enforcement, or soft warning, or enforcement skipped
        slideStatus = 'PENDING'; // frontend maps PENDING+imageUrl → READY display
      }

      // Save image to storage (R2 or local disk); store URL in DB
      const savedImageUrl = imageBase64
        ? await saveImage(jobId, slide.slideNumber, imageBase64)
        : null;

      // Save raw image (before text overlay) for future restyle operations
      if (rawImageBase64) {
        await saveRawImage(jobId, slide.slideNumber, rawImageBase64).catch(err =>
          console.warn(`[ImageStage] Failed to save raw image for slide ${slide.slideNumber}: ${err}`)
        );
      }

      // Save slide to DB immediately so frontend can display it progressively
      await prisma.carouselSlide.upsert({
        where: { carouselJobId_slideIndex: { carouselJobId: jobId, slideIndex: slide.slideNumber } },
        create: {
          carouselJobId: jobId,
          slideIndex: slide.slideNumber,
          role: slide.role as SlideRole,
          headline: slide.headline,
          body: slide.body,
          supportingDetail: slide.supportingDetail ?? null,
          factType: slide.factType ?? null,
          containsNumber: !!slide.containsNumber,
          concretenessScore: Math.round(slide.concretenessScore ?? 3),
          noveltyScore: Math.round(slide.noveltyScore ?? 3),
          topicEntity: slide.topicEntity,
          displayTitle: compressed?.displayTitle ?? null,
          displaySupport: compressed?.displaySupport ?? null,
          imageUrl: savedImageUrl,
          imageError,
          status: slideStatus,
          ...(resolvedImageSource !== null && { imageSource: resolvedImageSource }),
          ...(imageSourceUrl !== undefined && { imageSourceUrl }),
        },
        update: {
          imageUrl: savedImageUrl,
          imageError,
          status: slideStatus,
          ...(resolvedImageSource !== null && { imageSource: resolvedImageSource }),
          ...(imageSourceUrl !== undefined && { imageSourceUrl }),
        },
      });
      savedSlideCount++;

      const slideElapsedSec = ((Date.now() - slideStart) / 1000).toFixed(1);
      console.log(`[ImageStage] Slide ${slideNum} (${slide.role}) — ${slideStatus} in ${slideElapsedSec}s${finalAttempt > 1 ? ` (${finalAttempt} attempts)` : ''}`);
    }

    const imageStageElapsed = ((Date.now() - imageStageStart) / 1000).toFixed(1);
    console.log(`[ImageStage] Complete in ${imageStageElapsed}s`);


    // ── Step 5: Slides already saved progressively — count results ──
    emit('saving', 'Finalizing carousel...', 95);

    // Count results from DB (slides were saved progressively during render)
    const savedSlides = await prisma.carouselSlide.findMany({
      where: { carouselJobId: jobId },
      select: { status: true },
    });
    const failedCount = savedSlides.filter(r => r.status === 'FAILED_IMAGE').length;
    const successCount = savedSlides.filter(r => r.status === 'PENDING').length;
    if (failedCount > 0) {
      console.warn(`[ImageStage] ${failedCount}/${savedSlides.length} slides have FAILED_IMAGE status`);
    }

    // ── Step 6: Mark complete ────────────────────────────
    // Always reach COMPLETE status — even with some FAILED_IMAGE slides.
    // The user can regenerate individual failed slides from review.
    const completionMessage = failedCount === 0
      ? 'Carousel ready'
      : failedCount === savedSlides.length
        ? 'Generation finished — no usable slides were produced'
        : `Generation finished — ${failedCount} slide(s) need attention`;

    await prisma.carouselJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETE',
        pipelineMeta: JSON.parse(JSON.stringify({
          mode: pipelineResult.mode,
          concept: pipelineResult.concept,
          validationScore: validation.score,
          validationPassed: validation.passed,
          qualityWarning: pipelineResult.qualityWarning,
          fallback: pipelineResult.fallback ?? null,
          hook: finalHook,
          expandedFacts: pipelineResult.expandedFacts.map(f => ({
            claim: f.claim,
            expansion: f.expansion,
          })),
          slideCount: savedSlides.length,
          failedImageCount: failedCount,
          successImageCount: successCount,
          imageStageElapsedMs: Date.now() - imageStageStart,
          qualityGate: {
            issuesFound: qualityResult.issues.length,
            slidesRewritten: qualityResult.rewriteCount,
            issues: qualityResult.issues.map(i => ({ slide: i.slideIndex + 1, issue: i.issue })),
          },
          narrativeGate: {
            issuesFound: narrativeResult.issues.length,
            slidesRewritten: narrativeResult.rewriteCount,
            reorderApplied: narrativeResult.reorderApplied,
            issues: narrativeResult.issues.map(i => ({ type: i.type, detail: i.detail })),
          },
          hookPromiseGate: {
            action: promiseResult.action,
            rewriteCount: promiseResult.rewriteCount,
            issues: promiseResult.issues.map(i => ({ type: i.type, detail: i.detail })),
          },
          enforcement: {
            preRenderPassed: preRenderReport.passed,
            preRenderFailures: preRenderReport.failures.length,
            ctaAutoRegenTriggered: ctaRegenAttempted,
            postRenderReports: postRenderReports.map(r => ({
              slide: r.slideIndex + 1,
              passed: r.passed,
              failures: r.failures.map(f => f.rule),
              regenerated: r.shouldRegenerate,
            })),
            totalImageRegens: postRenderReports.filter(r => r.shouldRegenerate).length,
          },
        })),
        progress: { step: 'complete', message: completionMessage, pct: 100 },
      },
    });

    emit('complete', completionMessage, 100);

  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    // Prisma errors dump full data (including huge base64 images) before the reason.
    let userMessage = rawMessage;
    const lastDoubleNewline = rawMessage.lastIndexOf('\n\n');
    if (lastDoubleNewline > 0 && rawMessage.length - lastDoubleNewline > 5) {
      userMessage = rawMessage.slice(lastDoubleNewline + 2).trim();
    } else if (rawMessage.length > 300) {
      userMessage = rawMessage.includes('Invalid')
        ? 'Database validation error while saving slides. Check server logs for details.'
        : rawMessage.slice(0, 300);
    }
    console.error(`[standalone] Generation failed for job ${jobId}:`, rawMessage);

    // ── Priority 4: Check for partial results already saved progressively ──
    // Slides are saved to DB as they complete, so check if any exist.
    if (savedSlideCount > 0) {
      try {
        const partialSlides = await prisma.carouselSlide.findMany({
          where: { carouselJobId: jobId },
          select: { status: true },
        });
        console.log(`[standalone] ${partialSlides.length} partial slide(s) already saved progressively`);

        // If we have at least some successful slides, mark COMPLETE not FAILED
        const hasAnyImage = partialSlides.some(r => r.status === 'PENDING');
        if (hasAnyImage) {
          await prisma.carouselJob.update({
            where: { id: jobId },
            data: {
              status: 'COMPLETE',
              errorMessage: `Partial completion: ${userMessage.slice(0, 500)}`,
              progress: { step: 'complete', message: `Generation finished — some slides need attention`, pct: 100 },
            },
          });
          emit('complete', 'Generation finished — some slides need attention', 100);
          return; // Don't throw — the user can review partial results
        }
      } catch (checkErr) {
        console.error(`[standalone] Failed to check partial results: ${checkErr}`);
      }
    }

    const persistedError = userMessage.startsWith('GENERATION_FAILED')
      ? userMessage
      : `GENERATION_FAILED`;

    await prisma.carouselJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage: persistedError.slice(0, 2000),
        progress: { step: 'error', message: userMessage.slice(0, 200), pct: 0 },
      },
    });

    emit('error', userMessage.slice(0, 200), 0);
    throw error;
  }
}

// ─── Get Carousel ───────────────────────────────────────────

export async function getCarouselJob(jobId: string) {
  return prisma.carouselJob.findUnique({
    where: { id: jobId },
    include: {
      slides: { orderBy: { slideIndex: 'asc' } },
    },
  });
}

// ─── Regenerate Slide Copy ──────────────────────────────────

export async function regenerateCarouselSlideCopy(jobId: string, slideIndex: number) {
  const job = await prisma.carouselJob.findUnique({
    where: { id: jobId },
    include: { slides: { orderBy: { slideIndex: 'asc' } } },
  });
  if (!job) throw new Error('CarouselJob not found');

  const slide = job.slides.find(s => s.slideIndex === slideIndex);
  if (!slide) throw new Error(`Slide ${slideIndex} not found`);

  const ai = getAIProvider();
  const topic = job.topic;

  const slideContext = job.slides.map(s => ({
    slideIndex: s.slideIndex,
    role: s.role,
    headline: s.headline || '',
    body: s.body || '',
    supportingDetail: s.supportingDetail || null,
  }));

  const targetRole = slide.role as 'OPENER' | 'FACT' | 'IMPLICATION' | 'CTA';
  const prompt = buildUserRegenSlidePrompt({
    topic,
    slides: slideContext,
    targetIndex: slideIndex,
    targetRole,
  });

  let generated: PatchedSlide;
  try {
    const result = await ai.generateObject(prompt, PatchedSlideSchema);
    generated = result.data;
  } catch (firstError) {
    const errorMsg = firstError instanceof Error ? firstError.message : String(firstError);
    const retryPrompt = prompt + `\n\nRETRY — PREVIOUS OUTPUT FAILED: ${errorMsg.slice(0, 500)}\nFix and return valid JSON.`;
    const retryResult = await ai.generateObject(retryPrompt, PatchedSlideSchema);
    generated = retryResult.data;
  }

  // Compress
  const slideAsV2: GeneratedSlideV2 = {
    slideNumber: slideIndex,
    role: generated.role,
    headline: generated.headline,
    body: generated.body,
    supportingDetail: generated.supportingDetail,
    factType: generated.factType,
    containsNumber: generated.containsNumber,
    concretenessScore: generated.concretenessScore,
    noveltyScore: generated.noveltyScore,
    topicEntity: generated.topicEntity,
    factRefs: generated.factRefs,
  };
  const compressResult = await compressSlides({ topic, slides: [slideAsV2] }, ai);
  // When compressing a single slide, the LLM may return slideNumber 0
  // instead of the actual slideIndex — fall back to first entry if find fails.
  const compressed = compressResult.compressed.find(c => c.slideNumber === slideIndex)
    ?? compressResult.compressed[0];

  // Fall back to raw headline/body if compression produced no display text
  // Use ?? (not ||) so that empty string "" from BOLD layout is preserved
  const displayTitle = (compressed?.displayTitle ?? generated.headline) || null;
  const displaySupport = compressed?.displaySupport ?? generated.body ?? null;

  return prisma.carouselSlide.update({
    where: { id: slide.id },
    data: {
      headline: generated.headline,
      body: generated.body,
      supportingDetail: generated.supportingDetail,
      factType: generated.factType,
      containsNumber: generated.containsNumber,
      concretenessScore: generated.concretenessScore,
      noveltyScore: generated.noveltyScore,
      topicEntity: generated.topicEntity,
      displayTitle,
      displaySupport,
      status: 'PENDING', // Reset approval after regen
    },
  });
}

// ─── Regenerate Slide Image ─────────────────────────────────

export async function regenerateCarouselSlideImage(
  jobId: string,
  slideIndex: number,
  imageSource?: 'wikipedia' | 'generated',
) {
  const job = await prisma.carouselJob.findUnique({
    where: { id: jobId },
    include: { slides: { orderBy: { slideIndex: 'asc' } } },
  });
  if (!job) throw new Error('CarouselJob not found');

  const slide = job.slides.find(s => s.slideIndex === slideIndex);
  if (!slide) throw new Error(`Slide ${slideIndex} not found`);

  // Mark as REGENERATING before starting
  await prisma.carouselSlide.update({
    where: { id: slide.id },
    data: { status: 'REGENERATING', imageError: null },
  });

  const displayTitle = slide.displayTitle || slide.headline || '';
  const displaySupport = slide.displaySupport || '';
  // When user explicitly clicks "Regen Image" (imageSource='generated'), use the standard
  // Gemini provider — not the celebrity provider which routes to Wikipedia as primary.
  const imageProvider = imageSource === 'generated'
    ? getUnifiedImageProvider()
    : getImageProviderForTopic(job.topic, job.direction);

  // Load channel visual style for regeneration.
  // If the job has no channelId (older jobs), look it up via the Post that references this job.
  let regenChannelId = job.channelId;
  if (!regenChannelId) {
    const linkedPost = await prisma.post.findFirst({
      where: { carouselJobId: job.id },
      select: { channelId: true },
    });
    regenChannelId = linkedPost?.channelId ?? null;
    // Backfill so future regen calls don't need the lookup
    if (regenChannelId) {
      await prisma.carouselJob.update({ where: { id: job.id }, data: { channelId: regenChannelId } });
    }
  }
  let regenVisualStyle: ChannelVisualStyleContext = DEFAULT_VISUAL_STYLE;
  let regenExploreTopic: string | undefined;
  if (regenChannelId) {
    const channelData = await prisma.channel.findUnique({
      where: { id: regenChannelId },
      select: { exploreTopic: true },
    });
    regenExploreTopic = channelData?.exploreTopic ?? undefined;
    const styleRecord = await prisma.channelVisualStyle.findUnique({
      where: { channelId: regenChannelId },
    });
    if (styleRecord) {
      regenVisualStyle = styleRecord as unknown as ChannelVisualStyleContext;
    }
  }

  try {
    // Build a minimal GeneratedSlideV2-like object for renderSlideImage
    const slideData: GeneratedSlideV2 = {
      slideNumber: slide.slideIndex,
      role: slide.role as GeneratedSlideV2['role'],
      headline: slide.headline || '',
      body: slide.body || '',
      supportingDetail: slide.supportingDetail,
      factType: slide.factType as GeneratedSlideV2['factType'],
      containsNumber: slide.containsNumber,
      concretenessScore: slide.concretenessScore,
      noveltyScore: slide.noveltyScore,
      topicEntity: slide.topicEntity,
      factRefs: [],
    };

    // Build all slides so CTA can resolve its visual subject from siblings
    const allSlideData: GeneratedSlideV2[] = job.slides.map(s => ({
      slideNumber: s.slideIndex,
      role: s.role as GeneratedSlideV2['role'],
      headline: s.headline || '',
      body: s.body || '',
      supportingDetail: s.supportingDetail,
      factType: s.factType as GeneratedSlideV2['factType'],
      containsNumber: s.containsNumber,
      concretenessScore: s.concretenessScore,
      noveltyScore: s.noveltyScore,
      topicEntity: s.topicEntity,
      factRefs: [],
    }));

    // Collect Wikimedia URLs already used by sibling slides so the provider can pick a different one
    const excludeUrls = job.slides
      .filter(s => s.slideIndex !== slideIndex && s.imageSourceUrl)
      .map(s => s.imageSourceUrl as string);

    // Resolve concept hint — needed for Wikipedia disambiguation and Gemini subject.
    // For new carousels, job.exactSubject was saved during generation (e.g. "Oasis (band)").
    // For existing carousels that predate this, self-heal in two steps:
    //   1. Try OPENER topicEntity — the AI pipeline often sets this to the disambiguated name.
    //   2. If still unresolved (topicEntity == raw topic), proactively try Wikipedia
    //      disambiguation suffixes (_(band), _(musician), etc.) to find the correct article.
    // The resolved hint is persisted so future regen calls skip this work.
    let conceptHint: string | undefined = job.exactSubject ?? undefined;
    if (!conceptHint) {
      const derived = resolveCarouselSubject(allSlideData, job.topic);
      if (derived && derived !== job.topic) {
        conceptHint = derived;
        await prisma.carouselJob.update({ where: { id: job.id }, data: { exactSubject: derived } });
        console.log(`[Regen] Self-healed exactSubject from topicEntity for job ${job.id}: "${derived}"`);
      } else if (isCelebrityTopic(job.topic, job.direction)) {
        // OPENER topicEntity didn't help — try Wikipedia suffix disambiguation
        const wikiResolved = await resolveWikipediaConcept(job.topic);
        if (wikiResolved) {
          conceptHint = wikiResolved;
          await prisma.carouselJob.update({ where: { id: job.id }, data: { exactSubject: wikiResolved } });
          console.log(`[Regen] Self-healed exactSubject via Wikipedia for job ${job.id}: "${wikiResolved}"`);
        }
      }
    } else if (!conceptHint.includes('(') && isCelebrityTopic(job.topic, job.direction)) {
      // conceptHint is set (from initial gen) but may be undisambiguated — e.g. "Oasis" instead of
      // "Oasis (band)" — or it may be a framing phrase ("facts about them") rather than the actual
      // subject. Try to resolve via Wikipedia; if the hint itself fails, fall back to the raw topic.
      const wikiResolved = await resolveWikipediaConcept(conceptHint) ?? await resolveWikipediaConcept(job.topic);
      if (wikiResolved) {
        console.log(`[Regen] Disambiguated conceptHint "${conceptHint}" → "${wikiResolved}" via Wikipedia`);
        conceptHint = wikiResolved;
        await prisma.carouselJob.update({ where: { id: job.id }, data: { exactSubject: wikiResolved } });
      }
    }

    const renderOutput = await renderSlideImage(
      slideData,
      displayTitle,
      displaySupport,
      job.topic,
      imageProvider,
      allSlideData,
      imageSource,
      job.direction,
      regenVisualStyle,
      excludeUrls,
      conceptHint,
      regenExploreTopic,
      true, // skipReadabilityGate — manual regen should accept any image
      undefined, // swipeCta
      (job.layout as 'DETAILED' | 'BOLD') ?? 'DETAILED',
    );

    const regenImageUrl = await saveImage(jobId, slideIndex, renderOutput.imageBase64);

    // Save raw image for future restyle operations
    if (renderOutput.rawImageBase64) {
      await saveRawImage(jobId, slideIndex, renderOutput.rawImageBase64).catch(err =>
        console.warn(`[Regen] Failed to save raw image for slide ${slideIndex}: ${err}`)
      );
    }

    return await prisma.carouselSlide.update({
      where: { id: slide.id },
      data: {
        imageUrl: regenImageUrl,
        imageError: null,
        status: 'PENDING',
        ...(renderOutput.resolvedImageSource !== null && { imageSource: renderOutput.resolvedImageSource }),
        ...(renderOutput.imageSourceUrl !== undefined && { imageSourceUrl: renderOutput.imageSourceUrl }),
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[standalone] Slide ${slideIndex} image regen FAILED: ${errorMsg}`);

    await prisma.carouselSlide.update({
      where: { id: slide.id },
      data: {
        imageUrl: null,
        imageError: errorMsg.slice(0, 2000),
        status: 'FAILED_IMAGE',
      },
    });
    throw err;
  }
}

// ─── Restyle Slide (re-render overlay on existing image) ────

/**
 * Re-renders the text overlay on a slide using the channel's current visual style,
 * without regenerating the base image. Falls back to full image regen if no raw image exists.
 */
export async function restyleCarouselSlide(jobId: string, slideIndex: number) {
  const job = await prisma.carouselJob.findUnique({
    where: { id: jobId },
    include: { slides: { orderBy: { slideIndex: 'asc' } } },
  });
  if (!job) throw new Error('CarouselJob not found');

  const slide = job.slides.find(s => s.slideIndex === slideIndex);
  if (!slide) throw new Error(`Slide ${slideIndex} not found`);

  // Try to load the raw image (before text overlay)
  const rawImage = await loadRawImage(jobId, slideIndex);
  if (!rawImage) {
    // No raw image saved — fall back to full regen preserving image source
    console.log(`[Restyle] No raw image for slide ${slideIndex} — falling back to full regen`);
    const preserveSource = (slide.imageSource as 'wikipedia' | 'generated' | undefined) ?? 'generated';
    return regenerateCarouselSlideImage(jobId, slideIndex, preserveSource);
  }

  console.log(`[Restyle] Re-rendering overlay for slide ${slideIndex} using saved raw image`);

  await prisma.carouselSlide.update({
    where: { id: slide.id },
    data: { status: 'REGENERATING', imageError: null },
  });

  const displayTitle = slide.displayTitle || slide.headline || '';
  const displaySupport = slide.displaySupport || '';

  // Load channel visual style
  let regenChannelId = job.channelId;
  if (!regenChannelId) {
    const linkedPost = await prisma.post.findFirst({
      where: { carouselJobId: job.id },
      select: { channelId: true },
    });
    regenChannelId = linkedPost?.channelId ?? null;
  }
  let visualStyle: ChannelVisualStyleContext = DEFAULT_VISUAL_STYLE;
  if (regenChannelId) {
    const styleRecord = await prisma.channelVisualStyle.findUnique({
      where: { channelId: regenChannelId },
    });
    if (styleRecord) {
      visualStyle = styleRecord as unknown as ChannelVisualStyleContext;
    }
  }

  try {
    const promptOutput = buildSlidePrompt({
      slideRole: slide.role as 'HOOK' | 'FACT' | 'CTA',
      subject: slide.topicEntity || job.topic,
      topic: job.topic,
      headlineText: displayTitle,
      bodyText: displaySupport,
    });

    let finalImage: Buffer | undefined;

    {
      const boldResult = await renderBoldSlide({
        imagePrompt: promptOutput.imagePrompt,
        displayTitle,
        displaySubtitle: displaySupport || undefined,
        slideRole: slide.role,
        visualStyle,
        baseImage: rawImage,
      });
      finalImage = boldResult.image;
    }

    if (!finalImage) {
      throw new Error(`Restyle render returned no image`);
    }

    const imageBase64 = finalImage.toString('base64');
    const imageUrl = await saveImage(jobId, slideIndex, imageBase64);

    return await prisma.carouselSlide.update({
      where: { id: slide.id },
      data: {
        imageUrl,
        imageError: null,
        status: 'PENDING',
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Restyle] Slide ${slideIndex} restyle FAILED: ${errorMsg}`);
    await prisma.carouselSlide.update({
      where: { id: slide.id },
      data: { imageError: errorMsg.slice(0, 2000), status: 'FAILED_IMAGE' },
    });
    throw err;
  }
}

// ─── Regenerate Full Slide (copy + image) ───────────────────

export async function regenerateCarouselSlide(jobId: string, slideIndex: number, imageSource?: 'wikipedia' | 'generated') {
  await regenerateCarouselSlideCopy(jobId, slideIndex);
  return regenerateCarouselSlideImage(jobId, slideIndex, imageSource);
}

// ─── Render Images (Stage 2) ────────────────────────────────

/**
 * Render images for a carousel that was generated with skipImages.
 * Loads slides from DB, renders each one that has no imageUrl.
 */
export async function runImageStage(jobId: string): Promise<void> {
  const job = await prisma.carouselJob.findUnique({
    where: { id: jobId },
    include: { slides: { orderBy: { slideIndex: 'asc' } } },
  });
  if (!job) throw new Error(`CarouselJob ${jobId} not found`);

  // Load visual style
  let visualStyle: ChannelVisualStyleContext = DEFAULT_VISUAL_STYLE;
  if (job.channelId) {
    const styleRecord = await prisma.channelVisualStyle.findUnique({
      where: { channelId: job.channelId },
    });
    if (styleRecord) visualStyle = styleRecord as unknown as ChannelVisualStyleContext;
  }

  // Load channel explore topic for Wikipedia lookups
  let exploreTopic: string | undefined;
  if (job.channelId) {
    const channel = await prisma.channel.findUnique({ where: { id: job.channelId } });
    if (channel?.exploreTopic) exploreTopic = channel.exploreTopic;
  }

  // Resolve concept from pipelineMeta
  const meta = job.pipelineMeta as Record<string, unknown> | null;
  const concept = (meta?.concept as string) || undefined;

  await prisma.carouselJob.update({
    where: { id: jobId },
    data: { status: 'RENDERING', progress: { step: 'render', message: 'Starting image rendering...', pct: 0 } },
  });

  const imageProvider = getImageProviderForTopic(job.topic, job.direction);
  const slidesToRender = job.slides.filter(s => !s.imageUrl);

  for (let i = 0; i < slidesToRender.length; i++) {
    const slide = slidesToRender[i];
    const displayTitle = slide.displayTitle || slide.headline;
    const displaySupport = slide.displaySupport || '';

    await prisma.carouselJob.update({
      where: { id: jobId },
      data: { progress: { step: 'render', message: `Rendering slide ${i + 1}/${slidesToRender.length}...`, pct: Math.round((i / slidesToRender.length) * 90) } },
    });

    try {
      const v2Slide: GeneratedSlideV2 = {
        slideNumber: slide.slideIndex,
        role: slide.role as string,
        headline: slide.headline,
        body: slide.body || '',
        supportingDetail: slide.supportingDetail ?? undefined,
        topicEntity: slide.topicEntity || '',
        factType: slide.factType ?? null,
        containsNumber: slide.containsNumber,
        concretenessScore: slide.concretenessScore,
        noveltyScore: slide.noveltyScore,
        factRefs: [],
      };

      const allV2Slides = job.slides.map(s => ({
        slideNumber: s.slideIndex,
        role: s.role as string,
        headline: s.headline,
        body: s.body || '',
        supportingDetail: s.supportingDetail ?? undefined,
        topicEntity: s.topicEntity || '',
        factType: s.factType ?? null,
        containsNumber: s.containsNumber,
        concretenessScore: s.concretenessScore,
        noveltyScore: s.noveltyScore,
        factRefs: [],
      })) as GeneratedSlideV2[];

      const renderOutput = await renderSlideImage(
        v2Slide, displayTitle, displaySupport, job.topic,
        imageProvider, allV2Slides, undefined, job.direction,
        visualStyle, undefined, concept, exploreTopic, true,
        (slide as Record<string, unknown>).swipeCta as string | undefined,
      );

      const imageUrl = await saveImage(jobId, slide.slideIndex, renderOutput.imageBase64);
      await prisma.carouselSlide.update({
        where: { id: slide.id },
        data: {
          imageUrl,
          imageSource: renderOutput.resolvedImageSource,
          imageSourceUrl: renderOutput.imageSourceUrl ?? null,
          status: 'PENDING',
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[runImageStage] Slide ${slide.slideIndex} failed: ${msg.slice(0, 200)}`);
      await prisma.carouselSlide.update({
        where: { id: slide.id },
        data: { imageError: msg.slice(0, 2000), status: 'FAILED_IMAGE' },
      });
    }
  }

  await prisma.carouselJob.update({
    where: { id: jobId },
    data: {
      status: 'COMPLETE',
      progress: { step: 'complete', message: 'Images rendered', pct: 100 },
    },
  });
}

// ─── Approve All ────────────────────────────────────────────

export async function approveCarousel(jobId: string) {
  const job = await prisma.carouselJob.findUnique({
    where: { id: jobId },
    include: { slides: true },
  });
  if (!job) throw new Error('CarouselJob not found');
  if (job.status !== 'COMPLETE') throw new Error('Carousel is not complete');

  // Block approval if any slide has failed image
  const failedSlides = job.slides.filter(s => s.status === 'FAILED_IMAGE' || !s.imageUrl);
  if (failedSlides.length > 0) {
    const failedIndices = failedSlides.map(s => s.slideIndex + 1).join(', ');
    throw new Error(`Cannot approve: slides ${failedIndices} are missing images. Regenerate them first.`);
  }

  // ── Run approval enforcement gate ─────────────────────
  const slidesForValidation = job.slides.map(s => ({
    slideNumber: s.slideIndex,
    role: s.role as string,
    headline: s.headline || '',
    body: s.body || '',
    supportingDetail: s.supportingDetail,
    factType: s.factType,
    containsNumber: s.containsNumber,
    topicEntity: s.topicEntity,
  }));

  const approvalReport = runApprovalGate(slidesForValidation);

  if (!approvalReport.approved) {
    const failureDetails = approvalReport.failures
      .map(f => `Slide ${f.slideIndex + 1} [${f.category}]: ${f.rule}`)
      .join('\n  ');
    throw new Error(
      `Cannot approve: carousel failed enforcement checks.\n  ${failureDetails}\n\n` +
      `${approvalReport.summary.failedSlides} slide(s) need fixing. Regenerate or edit them first.`
    );
  }

  // Mark all slides as approved
  await prisma.carouselSlide.updateMany({
    where: { carouselJobId: jobId },
    data: { status: 'APPROVED' },
  });

  // Mark job as approved
  await prisma.carouselJob.update({
    where: { id: jobId },
    data: { approved: true },
  });

  return getCarouselJob(jobId);
}

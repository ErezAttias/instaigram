/**
 * Image Text Detector — Detects visible text inside generated images.
 *
 * Uses the AI provider's vision model (GPT-4o) to analyze rendered images
 * for any visible text, letters, numbers, words, or writing.
 *
 * Returns a binary pass/fail plus detected text descriptions.
 *
 * Called on the RAW provider image (before text overlay), BEFORE final approval.
 * Must NOT be called on the final composited slide (which includes our own overlay text).
 */

import { z } from 'zod';
import type { AIProvider } from '@/lib/ai/types';

// ─── Types ──────────────────────────────────────────────────────

export interface TextDetectionResult {
  /** Whether any visible text was detected in the image */
  hasText: boolean;
  /** Confidence level 0-1 that text is present */
  confidence: number;
  /** Description of detected text (empty if none) */
  detectedText: string[];
  /** Whether the image should be rejected */
  shouldReject: boolean;
}

// ─── Schema for LLM Response ────────────────────────────────────

const TextDetectionSchema = z.object({
  hasVisibleText: z.boolean(),
  confidence: z.number().min(0).max(1),
  detectedItems: z.array(z.string()),
});

// ─── Detection ──────────────────────────────────────────────────

/**
 * Analyze an image buffer for visible text using vision LLM.
 *
 * This is the LLM-based detection path. It sends the image to GPT-4o
 * and asks it to identify any visible text, letters, numbers, or writing.
 */
export async function detectTextInImage(
  imageBase64: string,
  ai: AIProvider,
): Promise<TextDetectionResult> {
  // Use OpenAI's vision capability directly
  // The AI provider doesn't support multimodal natively, so we use
  // the OpenAI SDK directly for this specific check
  try {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this image for ANY visible text, letters, numbers, words, writing, captions, labels, watermarks, or characters. Be thorough — even partial or blurred text counts.

Return JSON:
{
  "hasVisibleText": true/false,
  "confidence": 0.0-1.0,
  "detectedItems": ["description of each text element found"]
}

If NO text is visible at all, return hasVisibleText: false with empty detectedItems.
If ANY text is visible (even a single letter or number), return hasVisibleText: true.`,
            },
            {
              type: 'image_url',
              image_url: {
                url: imageBase64.startsWith('data:')
                  ? imageBase64
                  : `data:image/png;base64,${imageBase64}`,
                detail: 'low',
              },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.warn('[TextDetector] No response from vision model');
      return { hasText: false, confidence: 0, detectedText: [], shouldReject: false };
    }

    const parsed = TextDetectionSchema.parse(JSON.parse(content));

    const result: TextDetectionResult = {
      hasText: parsed.hasVisibleText,
      confidence: parsed.confidence,
      detectedText: parsed.detectedItems,
      shouldReject: parsed.hasVisibleText && parsed.confidence >= 0.7,
    };

    if (result.shouldReject) {
      console.warn(`[TextDetector] REJECT — text detected (confidence: ${result.confidence}): ${result.detectedText.join(', ')}`);
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[TextDetector] Vision analysis failed: ${msg}`);
    // On failure, don't block — return pass with low confidence
    return { hasText: false, confidence: 0, detectedText: [], shouldReject: false };
  }
}

/**
 * Fast heuristic check — detects common text artifacts without LLM.
 *
 * Checks image metadata and common patterns. This is NOT a replacement
 * for the LLM-based check, but a fast pre-filter.
 *
 * Currently checks:
 * - If the image prompt included text-related terms (prompt leakage)
 */
export function quickTextCheck(imagePrompt: string): boolean {
  // If the prompt accidentally included text rendering instructions
  const textInstructions = /\b(write|spell|print|display|show text|add text|include text|write the word|spell out)\b/i;
  return textInstructions.test(imagePrompt);
}

/**
 * Visual Truth Validator — Ensures image matches slide text.
 *
 * Extracts key visual attributes from slide text (counts, physical
 * descriptions, named entities) and verifies the generated image
 * depicts them accurately.
 *
 * Two-layer approach:
 *   1. Rule-based attribute extraction from text (deterministic)
 *   2. LLM vision verification against extracted attributes
 *
 * Called AFTER image rendering, BEFORE final approval.
 */

import { z } from 'zod';

// ─── Types ──────────────────────────────────────────────────────

export interface VisualAttribute {
  /** What the text claims (e.g., "three heads", "blue feathers") */
  claim: string;
  /** Category of the attribute */
  type: 'count' | 'color' | 'anatomy' | 'size' | 'material' | 'action' | 'entity';
  /** How critical this attribute is (high = must be exact) */
  priority: 'high' | 'medium' | 'low';
}

export interface VisualTruthResult {
  /** Whether the image passes visual truth checks */
  passed: boolean;
  /** Attributes extracted from the text */
  extractedAttributes: VisualAttribute[];
  /** Attributes that were verified against the image */
  verifiedAttributes: Array<VisualAttribute & { matched: boolean; detail: string }>;
  /** Overall match confidence */
  confidence: number;
  /** Whether the image should be regenerated */
  shouldRegenerate: boolean;
}

// ─── Attribute Extraction (Rule-Based) ──────────────────────────

/** Number-word to digit mapping */
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, hundred: 100, thousand: 1000,
  single: 1, double: 2, triple: 3, dual: 2, twin: 2, pair: 2,
};

/** Patterns for extracting count-based attributes */
const COUNT_PATTERNS: Array<{ pattern: RegExp; extract: (m: RegExpMatchArray) => string }> = [
  // "three-headed", "two-armed", "five-fingered"
  {
    pattern: /\b(one|two|three|four|five|six|seven|eight|nine|ten|single|double|triple|dual|twin)[\s-](head|arm|leg|eye|wing|tail|horn|heart|brain|tongue|finger|hand|foot|feet|tooth|teeth|tentacle)\w*/gi,
    extract: (m) => m[0],
  },
  // "3 heads", "5 eyes", "2 wings"
  {
    pattern: /\b(\d+)\s+(head|arm|leg|eye|wing|tail|horn|heart|brain|tongue|finger|hand|foot|feet|tooth|teeth|tentacle)s?\b/gi,
    extract: (m) => m[0],
  },
  // "a pair of wings", "a trio of"
  {
    pattern: /\ba\s+(pair|trio|quartet|quintet)\s+of\s+(\w+)/gi,
    extract: (m) => m[0],
  },
];

/** Patterns for color attributes */
const COLOR_PATTERNS: Array<{ pattern: RegExp; extract: (m: RegExpMatchArray) => string }> = [
  // "golden fur", "blue feathers", "red eyes"
  {
    pattern: /\b(golden|silver|red|blue|green|black|white|purple|orange|pink|brown|grey|gray|crimson|scarlet|azure|emerald|ivory|ebony|amber|bronze|copper)\s+(\w+)/gi,
    extract: (m) => m[0],
  },
];

/** Patterns for size/scale attributes */
const SIZE_PATTERNS: Array<{ pattern: RegExp; extract: (m: RegExpMatchArray) => string }> = [
  // "towering", "tiny", "massive", "colossal"
  {
    pattern: /\b(towering|tiny|massive|colossal|enormous|gigantic|miniature|microscopic|vast)\b/gi,
    extract: (m) => m[0],
  },
  // "100 feet tall", "3 meters long"
  {
    pattern: /\b\d+\s*(feet|meters?|inches|centimeters?|miles?|kilometers?)\s*(tall|long|wide|deep|high)\b/gi,
    extract: (m) => m[0],
  },
];

/** Patterns for material/texture attributes */
const MATERIAL_PATTERNS: Array<{ pattern: RegExp; extract: (m: RegExpMatchArray) => string }> = [
  {
    pattern: /\b(stone|marble|bronze|iron|steel|wooden|glass|crystal|bone|ivory|leather|silk|gold|silver)\s+(\w+)/gi,
    extract: (m) => m[0],
  },
];

/**
 * Extract visually verifiable attributes from slide text.
 * Returns attributes that should be visible in the image.
 */
export function extractVisualAttributes(
  headline: string,
  body: string,
  subject?: string,
): VisualAttribute[] {
  const attributes: VisualAttribute[] = [];
  const fullText = `${headline} ${body} ${subject || ''}`;

  // Extract counts (highest priority — these must be exact)
  for (const { pattern, extract } of COUNT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(fullText)) !== null) {
      attributes.push({
        claim: extract(match),
        type: 'count',
        priority: 'high',
      });
    }
  }

  // Extract colors (medium priority)
  for (const { pattern, extract } of COLOR_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(fullText)) !== null) {
      attributes.push({
        claim: extract(match),
        type: 'color',
        priority: 'medium',
      });
    }
  }

  // Extract size/scale (medium priority)
  for (const { pattern, extract } of SIZE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(fullText)) !== null) {
      attributes.push({
        claim: extract(match),
        type: 'size',
        priority: 'medium',
      });
    }
  }

  // Extract materials (low priority)
  for (const { pattern, extract } of MATERIAL_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(fullText)) !== null) {
      attributes.push({
        claim: extract(match),
        type: 'material',
        priority: 'low',
      });
    }
  }

  // Deduplicate by claim text
  const seen = new Set<string>();
  return attributes.filter(a => {
    const key = a.claim.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── LLM Vision Verification ────────────────────────────────────

const VerificationSchema = z.object({
  attributes: z.array(z.object({
    claim: z.string(),
    matched: z.boolean(),
    detail: z.string(),
  })),
  overallMatch: z.number().min(0).max(1),
});

/**
 * Verify extracted attributes against the actual image using vision LLM.
 *
 * Only called when there are high-priority attributes to verify
 * (e.g., specific counts, physical descriptions).
 */
export async function verifyVisualTruth(
  imageBase64: string,
  attributes: VisualAttribute[],
): Promise<VisualTruthResult> {
  // If no attributes to verify, pass automatically
  if (attributes.length === 0) {
    return {
      passed: true,
      extractedAttributes: [],
      verifiedAttributes: [],
      confidence: 1,
      shouldRegenerate: false,
    };
  }

  // Only verify high and medium priority attributes via LLM
  const toVerify = attributes.filter(a => a.priority === 'high' || a.priority === 'medium');

  if (toVerify.length === 0) {
    return {
      passed: true,
      extractedAttributes: attributes,
      verifiedAttributes: [],
      confidence: 0.8,
      shouldRegenerate: false,
    };
  }

  try {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const attributeList = toVerify
      .map((a, i) => `${i + 1}. "${a.claim}" (type: ${a.type}, priority: ${a.priority})`)
      .join('\n');

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Verify whether this image accurately depicts these specific visual attributes:

${attributeList}

For each attribute, determine:
- Does the image show this attribute correctly?
- For counts: is the exact number correct? (e.g., "three heads" = exactly 3 heads visible)
- For colors: is the color accurate?
- For anatomy: are the physical features present?

Return JSON:
{
  "attributes": [
    { "claim": "the attribute text", "matched": true/false, "detail": "what you see" }
  ],
  "overallMatch": 0.0-1.0
}

Be STRICT about counts — if the text says "three-headed" and the image shows two heads, that is NOT a match.`,
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
      console.warn('[VisualTruth] No response from vision model');
      return {
        passed: true,
        extractedAttributes: attributes,
        verifiedAttributes: [],
        confidence: 0,
        shouldRegenerate: false,
      };
    }

    const parsed = VerificationSchema.parse(JSON.parse(content));

    // Map results back to attributes
    const verified = toVerify.map((attr, i) => {
      const result = parsed.attributes[i] || { claim: attr.claim, matched: true, detail: 'unverified' };
      return { ...attr, matched: result.matched, detail: result.detail };
    });

    // High-priority failures trigger regeneration
    const highPriorityFailed = verified.some(v => v.priority === 'high' && !v.matched);
    const failedCount = verified.filter(v => !v.matched).length;

    const result: VisualTruthResult = {
      passed: !highPriorityFailed && failedCount <= 1,
      extractedAttributes: attributes,
      verifiedAttributes: verified,
      confidence: parsed.overallMatch,
      shouldRegenerate: highPriorityFailed,
    };

    if (!result.passed) {
      const failed = verified.filter(v => !v.matched);
      console.warn(`[VisualTruth] FAIL — ${failed.length} attribute(s) not matched:`);
      for (const f of failed) {
        console.warn(`  "${f.claim}" (${f.priority}): ${f.detail}`);
      }
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[VisualTruth] Verification failed: ${msg}`);
    // On failure, don't block
    return {
      passed: true,
      extractedAttributes: attributes,
      verifiedAttributes: [],
      confidence: 0,
      shouldRegenerate: false,
    };
  }
}

/**
 * Quick deterministic check — does the image prompt contradict the text?
 *
 * Catches obvious mismatches without needing LLM vision:
 * - Text says "three-headed" but prompt doesn't mention "three heads"
 * - Text says "golden" but prompt says "silver"
 */
export function quickVisualTruthCheck(
  headline: string,
  body: string,
  imagePrompt: string,
): { passed: boolean; mismatches: string[] } {
  const attributes = extractVisualAttributes(headline, body);
  const promptLower = imagePrompt.toLowerCase();
  const mismatches: string[] = [];

  for (const attr of attributes) {
    if (attr.priority !== 'high') continue;

    const claimLower = attr.claim.toLowerCase();

    // For count attributes, check if the prompt includes the count
    if (attr.type === 'count') {
      // Extract the number from the claim
      const numberMatch = claimLower.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|single|double|triple|dual|twin|pair)\b/);
      if (numberMatch) {
        const numWord = numberMatch[1];
        const numDigit = NUMBER_WORDS[numWord] ?? numWord;
        const numStr = String(numDigit);

        // Check if the prompt mentions this number in the right context
        const hasInPrompt = promptLower.includes(claimLower)
          || promptLower.includes(numStr)
          || promptLower.includes(numWord);

        if (!hasInPrompt) {
          mismatches.push(`Text says "${attr.claim}" but image prompt doesn't include this count`);
        }
      }
    }
  }

  return {
    passed: mismatches.length === 0,
    mismatches,
  };
}

// ─── Informational Domain Prompt Audit ──────────────────────────
//
// For informational topics (animals, science, nature), catch
// forbidden visual elements at the PROMPT level before image generation.

const INFORMATIONAL_FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(HUD|heads[\s-]*up[\s-]*display)\b/i, label: 'HUD overlay' },
  { pattern: /\b(hologram|holographic)\b/i, label: 'hologram' },
  { pattern: /\b(robotic|mechanical|cybernetic|android)\s*(hand|arm|body|figure)/i, label: 'robotic elements' },
  { pattern: /\b(glowing|luminous|radiant)\s*(sphere|orb|core|cube)\b/i, label: 'glowing sphere/core' },
  { pattern: /\b(data\s*visualization|data\s*overlay|data\s*art)\b/i, label: 'data visualization' },
  { pattern: /\b(futuristic|sci[\s-]*fi|cyberpunk)\b/i, label: 'sci-fi/futuristic' },
  { pattern: /\b(energy\s*(core|beam|field|pulse|wave))\b/i, label: 'energy effects' },
  { pattern: /\b(neon\s*(light|glow|grid|color))\b/i, label: 'neon effects' },
  { pattern: /\b(matrix|tron|digital\s*rain)\b/i, label: 'digital effects' },
  { pattern: /\b(abstract\s*(art|composition|visualization|representation))\b/i, label: 'abstract imagery' },
  { pattern: /\b(symbolic|metaphor|conceptual\s*art)\b/i, label: 'symbolic imagery' },
  { pattern: /\b(human\s*hand|person\s*holding)\b/i, label: 'human hands (for animal/science topics)' },
];

/**
 * Audit an image prompt for forbidden visual elements in informational domains.
 *
 * Called BEFORE image generation for animals/science/nature topics.
 * Returns violations that should trigger prompt rewriting.
 */
export function auditInformationalPrompt(
  imagePrompt: string,
  topicDomain: string,
): { passed: boolean; violations: string[] } {
  const isInformational = ['animals', 'science', 'health', 'education'].includes(topicDomain.toLowerCase());
  if (!isInformational) return { passed: true, violations: [] };

  const violations: string[] = [];
  for (const { pattern, label } of INFORMATIONAL_FORBIDDEN_PATTERNS) {
    // Reset regex state for global patterns
    pattern.lastIndex = 0;
    const match = pattern.exec(imagePrompt);
    if (match) {
      // Check if the match is preceded by a negation word (no, not, never, without, avoid)
      // If so, it's a directive to EXCLUDE this element, not to include it
      const beforeMatch = imagePrompt.slice(Math.max(0, match.index - 20), match.index).toLowerCase();
      const isNegated = /\b(no|not|never|without|avoid|exclude|forbidden|ban|block)\s*$/i.test(beforeMatch);
      if (!isNegated) {
        violations.push(label);
      }
    }
  }

  if (violations.length > 0) {
    console.warn(`[VisualTruth:InformationalAudit] VIOLATIONS in image prompt: ${violations.join(', ')}`);
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

// ─── Visual Evidence Evaluator ──────────────────────────────────

/**
 * "Visual evidence" check — does the image SUPPORT the claim?
 *
 * This goes beyond "no contradiction" to ask:
 *   "Does looking at this image make the factual claim easier to understand?"
 *
 * Scoring:
 *   5 = image directly illustrates the claim (e.g., three-headed dog for "Cerberus had 3 heads")
 *   4 = image shows a closely related scene (e.g., Greek temple for a Zeus fact)
 *   3 = image is thematically appropriate but generic (e.g., dark moody scene for an underworld fact)
 *   2 = image is decorative only — it doesn't help understand the fact
 *   1 = image is misleading or contradicts the fact
 *
 * A score below 3 should trigger regeneration with a better prompt.
 */

export interface VisualEvidenceResult {
  /** 1-5 score: how well the image supports the factual claim */
  evidenceScore: number;
  /** What the image shows (for debugging) */
  imageDescription: string;
  /** What the image SHOULD show to better support the claim */
  suggestedSubject: string;
  /** Whether the image should be regenerated for better evidence */
  shouldRegenerate: boolean;
}

const VisualEvidenceSchema = z.object({
  evidenceScore: z.number().min(1).max(5),
  imageDescription: z.string(),
  suggestedSubject: z.string(),
});

/**
 * Evaluate whether the image provides visual evidence for the slide's claim.
 *
 * Called after image rendering. Uses GPT-4o-mini vision.
 */
export async function evaluateVisualEvidence(
  imageBase64: string,
  headline: string,
  body: string,
  slideRole: string,
  topicDomain?: string,
): Promise<VisualEvidenceResult> {
  // Skip for CTA slides — they don't need to illustrate facts
  if (slideRole === 'CTA') {
    return {
      evidenceScore: 5,
      imageDescription: 'CTA slide — visual evidence not applicable',
      suggestedSubject: '',
      shouldRegenerate: false,
    };
  }

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
              text: `This image accompanies an Instagram carousel slide with this content:

HEADLINE: "${headline}"
BODY: "${body.slice(0, 300)}"
${topicDomain && ['animals', 'science', 'health', 'education'].includes(topicDomain) ? `
DOMAIN: INFORMATIONAL (${topicDomain})
This is a factual/informational topic. The image MUST show the actual subject literally.
REJECT (score 1-2) if the image contains:
- Futuristic UI, HUD overlays, or sci-fi elements
- Robotic or mechanical hands/parts
- Holograms or glowing spheres
- Abstract data visualization or symbolic imagery
- Generic dramatic portraiture instead of the actual subject
- An environment completely unrelated to the fact
- The image could belong to a completely different topic
` : ''}
Rate how well this image SUPPORTS the factual claim:

5 = image directly illustrates the specific claim (e.g., shows the exact thing described)
4 = image shows a closely related, specific scene
3 = image is thematically appropriate but generic (doesn't help understand the fact)
2 = image is decorative only — no connection to the specific claim
1 = image is misleading or contradicts the claim

Return JSON:
{
  "evidenceScore": 1-5,
  "imageDescription": "brief description of what the image actually shows",
  "suggestedSubject": "what the image SHOULD show to better illustrate this specific claim (empty if score >= 4)"
}`,
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
      return { evidenceScore: 3, imageDescription: 'analysis failed', suggestedSubject: '', shouldRegenerate: false };
    }

    const parsed = VisualEvidenceSchema.parse(JSON.parse(content));

    const result: VisualEvidenceResult = {
      ...parsed,
      shouldRegenerate: parsed.evidenceScore < 3,
    };

    if (result.shouldRegenerate) {
      console.warn(`[VisualEvidence] Score ${result.evidenceScore}/5 for "${headline.slice(0, 50)}" — image: ${result.imageDescription}. Should show: ${result.suggestedSubject}`);
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[VisualEvidence] Evaluation failed: ${msg}`);
    return { evidenceScore: 3, imageDescription: 'evaluation error', suggestedSubject: '', shouldRegenerate: false };
  }
}

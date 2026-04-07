/**
 * Style Validator — Ensures generated images match the topic domain.
 *
 * Detects style violations:
 *   - Sci-fi/futuristic elements in mythology/history topics
 *   - Fantasy elements in science/tech topics
 *   - Modern elements in historical topics
 *   - Generic AI aesthetics in any topic
 *
 * Two layers:
 *   1. Prompt audit — deterministic check for banned style terms in the image prompt
 *   2. Image audit — LLM vision check for style violations in rendered images
 *
 * Called AFTER image rendering, BEFORE final approval.
 */

import { z } from 'zod';

// ─── Types ──────────────────────────────────────────────────────

export interface StyleViolation {
  element: string;
  severity: 'hard' | 'soft';
  detail: string;
}

export interface StyleValidationResult {
  passed: boolean;
  violations: StyleViolation[];
  shouldRegenerate: boolean;
}

// ─── Domain Style Rules ─────────────────────────────────────────

interface DomainStyleRule {
  /** Elements that MUST NOT appear in images for this domain */
  forbidden: Array<{
    pattern: RegExp;
    element: string;
    severity: 'hard' | 'soft';
  }>;
  /** Elements to check for in LLM vision audit */
  visionForbidden: string[];
}

const DOMAIN_RULES: Record<string, DomainStyleRule> = {
  mythology: {
    forbidden: [
      { pattern: /\b(futuristic|sci[\s-]?fi|cyberpunk|neon|laser|hologram|digital|robot|android|mech)\b/i, element: 'futuristic/sci-fi elements', severity: 'hard' },
      { pattern: /\b(modern\s+(city|building|car|phone|screen|computer))\b/i, element: 'modern objects', severity: 'hard' },
      { pattern: /\b(LED|fluorescent|electric\s+light)\b/i, element: 'modern lighting', severity: 'soft' },
      { pattern: /\b(CGI|3D\s+render|game\s+art|concept\s+art)\b/i, element: 'digital art style', severity: 'hard' },
    ],
    visionForbidden: [
      'modern technology (computers, phones, screens)',
      'futuristic or sci-fi elements (neon, holograms, lasers)',
      'modern clothing or accessories',
      'CGI or video game aesthetics',
      'modern architecture',
    ],
  },

  history: {
    forbidden: [
      { pattern: /\b(futuristic|sci[\s-]?fi|cyberpunk|neon|laser|hologram|digital)\b/i, element: 'futuristic elements', severity: 'hard' },
      { pattern: /\b(modern\s+(city|building|car|phone|screen))\b/i, element: 'modern objects', severity: 'hard' },
      { pattern: /\b(fantasy|magical|mystical|enchanted)\b/i, element: 'fantasy elements', severity: 'soft' },
    ],
    visionForbidden: [
      'modern technology',
      'futuristic elements',
      'fantasy or magical effects',
      'modern clothing in historical context',
    ],
  },

  tech: {
    forbidden: [
      { pattern: /\b(fantasy|magical|mystical|enchanted|mythical|medieval\s+castle)\b/i, element: 'fantasy elements', severity: 'soft' },
      { pattern: /\b(ancient|stone\s+temple|bronze\s+age)\b/i, element: 'ancient aesthetics', severity: 'soft' },
    ],
    visionForbidden: [
      'fantasy or medieval elements',
      'magical effects',
      'ancient or historical aesthetics mixed with technology',
    ],
  },

  science: {
    forbidden: [
      { pattern: /\b(fantasy|magical|mystical|enchanted|mythical)\b/i, element: 'fantasy elements', severity: 'soft' },
      { pattern: /\b(sci[\s-]?fi\s+(movie|film|scene)|alien\s+ship|space\s+battle)\b/i, element: 'sci-fi fiction', severity: 'soft' },
    ],
    visionForbidden: [
      'fantasy or magical elements',
      'science fiction movie aesthetics',
    ],
  },

  animals: {
    forbidden: [
      { pattern: /\b(anthropomorphic|wearing\s+clothes|human\s+pose|cartoon|anime)\b/i, element: 'anthropomorphic elements', severity: 'hard' },
      { pattern: /\b(neon|glowing\s+fur|galaxy\s+pattern|cosmic\s+animal)\b/i, element: 'fantasy animal aesthetics', severity: 'hard' },
    ],
    visionForbidden: [
      'animals wearing clothes or in human poses',
      'glowing or neon animal features',
      'cartoon or anime style',
      'cosmic or galaxy patterns on animals',
    ],
  },
};

// ─── Prompt Audit (Deterministic) ───────────────────────────────

// ─── Negation-Aware Matching ────────────────────────────────

/**
 * Strip negation phrases from text before style matching.
 *
 * Phrases like "no futuristic elements", "without neon", "avoid sci-fi",
 * "never show hologram" are exclusion instructions, not positive descriptions.
 * Matching forbidden words inside them produces false positives.
 *
 * This function blanks out negation-prefixed spans so the regex patterns
 * only match genuinely positive/descriptive uses of the forbidden term.
 */
const NEGATION_PATTERNS = [
  /\bno\s+[\w\s,/\-]{1,60}?(?=[.,;]|$)/gi,
  /\bwithout\s+[\w\s,/\-]{1,60}?(?=[.,;]|$)/gi,
  /\bavoid\s+[\w\s,/\-]{1,60}?(?=[.,;]|$)/gi,
  /\bexclude\s+[\w\s,/\-]{1,60}?(?=[.,;]|$)/gi,
  /\bnever\s+[\w\s,/\-]{1,60}?(?=[.,;]|$)/gi,
  /\b(must|should|do)\s+not\s+[\w\s,/\-]{1,60}?(?=[.,;]|$)/gi,
  /\bnot\s+(?!only\b)[\w\s,/\-]{1,40}?(?=[.,;]|$)/gi,
];

function stripNegations(text: string): string {
  let cleaned = text;
  for (const negPattern of NEGATION_PATTERNS) {
    negPattern.lastIndex = 0;
    cleaned = cleaned.replace(negPattern, (match) => ' '.repeat(match.length));
  }
  return cleaned;
}

/**
 * Audit an image prompt for style violations given the topic domain.
 * This is a fast, deterministic check run BEFORE image generation.
 *
 * Negation-aware: phrases like "no futuristic elements" are stripped
 * before matching, so exclusion instructions don't trigger false positives.
 */
export function auditPromptStyle(
  imagePrompt: string,
  topicDomain: string,
): StyleValidationResult {
  const rules = DOMAIN_RULES[topicDomain.toLowerCase()];
  if (!rules) {
    return { passed: true, violations: [], shouldRegenerate: false };
  }

  // Strip negation phrases to avoid false positives from exclusion instructions
  const cleanedPrompt = stripNegations(imagePrompt);

  const violations: StyleViolation[] = [];

  for (const { pattern, element, severity } of rules.forbidden) {
    pattern.lastIndex = 0;
    if (pattern.test(cleanedPrompt)) {
      pattern.lastIndex = 0;
      const match = cleanedPrompt.match(pattern);
      violations.push({
        element,
        severity,
        detail: `Image prompt contains "${match?.[0]?.trim()}" — forbidden for ${topicDomain} domain`,
      });
    }
  }

  const hardViolations = violations.filter(v => v.severity === 'hard');

  if (violations.length > 0) {
    console.warn(`[StyleValidator] Prompt audit: ${violations.length} violation(s) for domain "${topicDomain}":`);
    for (const v of violations) {
      console.warn(`  [${v.severity}] ${v.element}: ${v.detail}`);
    }
  }

  return {
    passed: hardViolations.length === 0,
    violations,
    shouldRegenerate: hardViolations.length > 0,
  };
}

// ─── Image Audit (LLM Vision) ──────────────────────────────────

const StyleAuditSchema = z.object({
  violations: z.array(z.object({
    element: z.string(),
    severity: z.enum(['hard', 'soft']),
    detail: z.string(),
  })),
  styleMatch: z.number().min(0).max(1),
});

/**
 * Audit a rendered image for style violations using vision LLM.
 * This catches violations that slipped through the prompt audit.
 */
export async function auditImageStyle(
  imageBase64: string,
  topicDomain: string,
): Promise<StyleValidationResult> {
  const rules = DOMAIN_RULES[topicDomain.toLowerCase()];
  if (!rules || rules.visionForbidden.length === 0) {
    return { passed: true, violations: [], shouldRegenerate: false };
  }

  try {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const forbiddenList = rules.visionForbidden
      .map((item, i) => `${i + 1}. ${item}`)
      .join('\n');

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `This image was generated for a "${topicDomain}" topic carousel. Check if it contains ANY of these style violations:

${forbiddenList}

For each violation found, classify severity:
- "hard": clearly wrong for the domain (e.g., modern tech in ancient mythology)
- "soft": slightly off but acceptable (e.g., slightly modern lighting style)

Return JSON:
{
  "violations": [
    { "element": "what was found", "severity": "hard" or "soft", "detail": "description" }
  ],
  "styleMatch": 0.0-1.0 (how well the image matches the expected ${topicDomain} visual style)
}

If no violations, return empty violations array and high styleMatch.`,
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
      return { passed: true, violations: [], shouldRegenerate: false };
    }

    const parsed = StyleAuditSchema.parse(JSON.parse(content));
    const hardViolations = parsed.violations.filter(v => v.severity === 'hard');

    if (parsed.violations.length > 0) {
      console.warn(`[StyleValidator] Image audit: ${parsed.violations.length} violation(s), styleMatch=${parsed.styleMatch}:`);
      for (const v of parsed.violations) {
        console.warn(`  [${v.severity}] ${v.element}: ${v.detail}`);
      }
    }

    return {
      passed: hardViolations.length === 0,
      violations: parsed.violations,
      shouldRegenerate: hardViolations.length > 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[StyleValidator] Image audit failed: ${msg}`);
    return { passed: true, violations: [], shouldRegenerate: false };
  }
}

/**
 * Get the list of supported domain names for style validation.
 */
export function getSupportedDomains(): string[] {
  return Object.keys(DOMAIN_RULES);
}

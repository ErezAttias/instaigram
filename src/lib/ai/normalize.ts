/**
 * Normalizes LLM JSON output to match expected enum values.
 *
 * LLMs frequently return enum values with wrong casing, spaces instead of
 * underscores, or minor variations. This module fixes those before Zod validation.
 */

const ENUM_MAPS: Record<string, Record<string, string>> = {
  type: {
    'contrarian': 'CONTRARIAN',
    'call_out': 'CALL_OUT',
    'call out': 'CALL_OUT',
    'callout': 'CALL_OUT',
    'mistake_exposure': 'MISTAKE_EXPOSURE',
    'mistake exposure': 'MISTAKE_EXPOSURE',
    'mistakeexposure': 'MISTAKE_EXPOSURE',
    'hidden_truth': 'HIDDEN_TRUTH',
    'hidden truth': 'HIDDEN_TRUTH',
    'hiddentruth': 'HIDDEN_TRUTH',
  },
  pattern: {
    'contrast': 'CONTRAST',
    'mistake': 'MISTAKE',
    'myth': 'MYTH',
    'list': 'LIST',
    'story': 'STORY',
    'breakdown': 'BREAKDOWN',
    'opinion': 'OPINION',
  },
  role: {
    'hook': 'HOOK',
    'setup': 'SETUP',
    'build': 'BUILD',
    'twist': 'TWIST',
    'insight': 'INSIGHT',
    'cta': 'CTA',
  },
  style: {
    'descriptive': 'descriptive',
    'bold': 'bold',
    'minimal': 'minimal',
    'personal': 'personal',
  },
  factType: {
    'statistic': 'statistic',
    'statistics': 'statistic',
    'stat': 'statistic',
    'number': 'statistic',
    'data': 'statistic',
    'comparison': 'comparison',
    'compare': 'comparison',
    'versus': 'comparison',
    'contrast': 'comparison',
    'mechanism': 'mechanism',
    'how it works': 'mechanism',
    'process': 'mechanism',
    'explanation': 'mechanism',
    'scientific': 'mechanism',
    'science': 'mechanism',
    'cause': 'mechanism',
    'historical': 'historical',
    'history': 'historical',
    'timeline': 'historical',
    'origin': 'historical',
    'example': 'example',
    'case study': 'example',
    'case_study': 'example',
    'anecdote': 'example',
    'illustration': 'example',
    'analogy': 'example',
    'fact': 'example',
    'definition': 'definition',
    'define': 'definition',
    'concept': 'definition',
  },
  source_type: {
    'grounded': 'grounded',
    'ground': 'grounded',
    'external': 'grounded',
    'knowledge_base': 'grounded',
    'internal_knowledge': 'internal_knowledge',
    'internal': 'internal_knowledge',
    'model_knowledge': 'internal_knowledge',
    'generated': 'internal_knowledge',
    'llm': 'internal_knowledge',
  },
};

/**
 * Try to normalize a single enum value for a given field name.
 */
function normalizeEnumValue(fieldName: string, value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const map = ENUM_MAPS[fieldName];
  if (!map) return value;

  // Try exact match first
  if (map[value]) return map[value];

  // Try lowercase
  const lower = value.toLowerCase().trim();
  if (map[lower]) return map[lower];

  // Try without spaces/underscores
  const collapsed = lower.replace(/[\s_-]/g, '');
  for (const [key, canonical] of Object.entries(map)) {
    if (key.replace(/[\s_-]/g, '') === collapsed) return canonical;
  }

  // Last resort: for fields where an unmatched value will crash Zod, use a safe default
  const FIELD_DEFAULTS: Record<string, string> = {
    source_type: 'internal_knowledge',
    factType: 'mechanism',
  };
  if (fieldName in FIELD_DEFAULTS) {
    return FIELD_DEFAULTS[fieldName];
  }

  return value;
}

/**
 * Fields that should be integers — coerce string numbers to actual numbers.
 */
const INTEGER_FIELDS = new Set([
  'slideIndex',
]);

/**
 * Coerce a value to integer if the field expects it.
 */
function coerceInteger(fieldName: string, value: unknown): unknown {
  if (!INTEGER_FIELDS.has(fieldName)) return value;
  if (typeof value === 'number') return Math.round(value);
  if (typeof value === 'string') {
    const num = parseInt(value, 10);
    if (!isNaN(num)) return num;
  }
  return value;
}

/**
 * Extract #hashtag tokens from a text string.
 */
function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w\u00C0-\u024F]+/g);
  return matches ? Array.from(new Set(matches)) : [];
}

/**
 * If `hashtags` is missing but `text` contains hashtags, extract them and
 * strip them from the text field so both fields are clean.
 */
function normalizeCaptionHashtags(obj: Record<string, unknown>): Record<string, unknown> {
  const hasText = typeof obj.text === 'string';
  const missingHashtags = !Array.isArray(obj.hashtags);

  if (hasText && missingHashtags) {
    const text = obj.text as string;
    const extracted = extractHashtags(text);
    if (extracted.length > 0) {
      // Remove hashtags (and any trailing whitespace / blank lines) from text
      obj.text = text.replace(/#[\w\u00C0-\u024F]+/g, '').replace(/\n\s*$/g, '').trim();
      obj.hashtags = extracted;
    } else {
      obj.hashtags = [];
    }
  }

  return obj;
}

const VALID_FACT_TYPES = new Set(['statistic', 'comparison', 'mechanism', 'historical', 'example', 'definition']);

/**
 * Normalize carousel slides:
 * - Non-FACT slides: force factType = null
 * - FACT slides with unrecognized factType: default to 'mechanism'
 * - Truncate body to 400 chars if over limit (preserve word boundaries)
 */
function normalizeCarouselSlides(slides: unknown[]): void {
  for (const slide of slides) {
    if (slide && typeof slide === 'object' && 'role' in slide) {
      const s = slide as Record<string, unknown>;
      const role = typeof s.role === 'string' ? s.role.toUpperCase() : '';

      if (role !== 'FACT') {
        // Non-FACT slides must not have factType
        if (s.factType !== undefined && s.factType !== null) {
          s.factType = null;
        }
      } else {
        // FACT slides: ensure factType is a valid enum value
        if (typeof s.factType === 'string' && !VALID_FACT_TYPES.has(s.factType)) {
          s.factType = 'mechanism';
        }
      }

      // Truncate body to 400 chars if over limit (avoid Zod rejection)
      if (typeof s.body === 'string' && s.body.length > 400) {
        const truncated = s.body.slice(0, 397);
        const lastSpace = truncated.lastIndexOf(' ');
        s.body = (lastSpace > 300 ? truncated.slice(0, lastSpace) : truncated) + '...';
      }
    }
  }
}

/**
 * Recursively walk a parsed JSON object and normalize enum fields + coerce integers.
 */
export function normalizeEnums(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => normalizeEnums(item));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key in ENUM_MAPS && typeof value === 'string') {
        result[key] = normalizeEnumValue(key, value);
      } else if (INTEGER_FIELDS.has(key)) {
        result[key] = coerceInteger(key, value);
      } else {
        result[key] = normalizeEnums(value);
      }
    }

    // Fix missing hashtags in caption objects
    if ('text' in result && !('slides' in result)) {
      normalizeCaptionHashtags(result);
    }

    // Normalize carousel slides: non-FACT slides must have factType = null
    if ('slides' in result && Array.isArray(result.slides)) {
      normalizeCarouselSlides(result.slides);
    }

    return result;
  }

  return obj;
}

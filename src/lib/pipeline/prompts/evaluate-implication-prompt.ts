import type { GeneratedSlideV2 } from '@/lib/validation/schemas';
import type { CompressedSlideDisplay } from '../steps/compress';

interface EvalImplicationParams {
  topic: string;
  compressed: CompressedSlideDisplay;
  implicationSlide: GeneratedSlideV2;
  previousFacts: GeneratedSlideV2[];
}

export function buildEvaluateImplicationPrompt({
  topic,
  compressed,
  implicationSlide,
  previousFacts,
}: EvalImplicationParams): string {
  const factList = previousFacts.map(f => {
    return `FACT ${f.slideNumber}: ${f.headline}
  body: ${f.body}
  factType: ${f.factType ?? 'unknown'}`;
  }).join('\n\n');

  return `You are a quality evaluator for Instagram carousel IMPLICATION slides about "${topic}".

TASK: Score the compressed implication slide and improve it if weak.

═══════════════════════════════════════════
COMPRESSED IMPLICATION TO EVALUATE
═══════════════════════════════════════════

displayTitle: "${compressed.displayTitle}"
displaySupport: "${compressed.displaySupport}"

Original headline: "${implicationSlide.headline}"
Original body: "${implicationSlide.body}"

═══════════════════════════════════════════
FACT SLIDES (context for what the implication should derive from)
═══════════════════════════════════════════

${factList}

═══════════════════════════════════════════
SCORING RUBRIC
═══════════════════════════════════════════

1. SPECIFICITY (0–3 points)
   0 = no number, no named entity, no comparison (e.g. "Nature Is Amazing")
   1 = has a named entity OR category but no number or comparison
   2 = has a number OR a direct comparison (X vs Y)
   3 = has a number AND a named entity or comparison

2. SURPRISE (0–3 points)
   0 = obvious / common knowledge / could be guessed (e.g. "Exercise Is Good for You")
   1 = mildly interesting but not counter-intuitive
   2 = unexpected angle — most people wouldn't guess this
   3 = genuinely counter-intuitive — contradicts common assumption

3. SHAREABILITY (0–4 points)
   0 = no one would share this — boring or generic
   1 = mildly interesting — might read but wouldn't share
   2 = interesting enough to mention in conversation
   3 = would screenshot and send to a friend
   4 = would repost / save / DM multiple people

Score = specificity + surprise + shareability (0–10)

═══════════════════════════════════════════
ISSUE DETECTION
═══════════════════════════════════════════

Flag any of these issues found in displayTitle or displaySupport:
- "vague_label": reads like a category label, not a claim (e.g. "Sloths: Evolutionary Marvels")
- "no_number": missing any specific number or measurement
- "no_entity": missing any named entity (species, person, place, product)
- "no_comparison": missing any contrast or comparison
- "abstract_noun": contains banned abstract words (well-being, importance, impact, perception, significant, enhance, remarkable, incredible, fascinating, noteworthy, profound)
- "obvious": a reasonable person would already know this
- "not_shareable": too generic — could apply to many topics
- "weak_support": displaySupport doesn't add new information beyond displayTitle

Return empty array if no issues.

═══════════════════════════════════════════
IMPROVED VERSION (required if score < 7)
═══════════════════════════════════════════

If score < 7, you MUST generate an improvedVersion.

To strengthen an implication:
1. INCREASE CONTRAST: Frame as X vs Y, expected vs reality, humans vs animals
   Weak:  "Cows Have Strong Social Bonds"
   Strong: "Isolated Cows Produce 10% Less Milk"

2. INCREASE SPECIFICITY: Add a number, a named entity, or a measurable outcome
   Weak:  "Sloths Have Unique Adaptations"
   Strong: "Sloths Outlast Dolphins Underwater"

3. INCREASE EMOTIONAL IMPACT: Make the reader feel something — shock, amusement, disbelief
   Weak:  "Octopuses Are Very Intelligent"
   Strong: "Octopuses Solve Mazes Faster Than Some Dogs"

The improved version MUST:
- Contain at least one number, named entity, or concrete comparison in BOTH lines
- NOT contain any banned abstract words
- Be derived from the fact slides above — do not invent claims
- Be specific to "${topic}" — could not apply to a generic topic

If score >= 7, do NOT include improvedVersion.

═══════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════

Return exactly this JSON:

{
  "specificity": <0-3>,
  "surprise": <0-3>,
  "shareability": <0-4>,
  "score": <0-10>,
  "issues": ["issue_code", ...],
  "improvedVersion": {
    "displayTitle": "...",
    "displaySupport": "..."
  }
}

Omit "improvedVersion" entirely if score >= 7.`;
}

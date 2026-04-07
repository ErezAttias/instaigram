import type { GeneratedSlideV2 } from '@/lib/validation/schemas';

interface ImplicationCompressParams {
  topic: string;
  implicationSlide: GeneratedSlideV2;
  previousFacts: GeneratedSlideV2[];
}

export function buildImplicationCompressPrompt({
  topic,
  implicationSlide,
  previousFacts,
}: ImplicationCompressParams): string {
  const factList = previousFacts.map(f => {
    return `FACT SLIDE ${f.slideNumber}:
  headline: ${f.headline}
  body: ${f.body}
  factType: ${f.factType ?? 'unknown'}
  topicEntity: ${f.topicEntity ?? 'none'}`;
  }).join('\n\n');

  return `You are a slide compression engine for Instagram carousels about "${topic}".

TASK: Compress the IMPLICATION slide into two short, high-impact display lines.

═══════════════════════════════════════════
CRITICAL: IMPLICATION IS NOT A SUMMARY
═══════════════════════════════════════════

An IMPLICATION is the strongest, most concrete, most surprising TAKEAWAY from the facts.
It is NOT a vague summary. It is NOT an abstract generalization.

It must be a concrete outcome, a surprising comparison, or a real-world consequence
that a reader would find genuinely surprising or memorable.

═══════════════════════════════════════════
PREVIOUS FACT SLIDES (use these as source material)
═══════════════════════════════════════════

${factList}

═══════════════════════════════════════════
IMPLICATION SLIDE TO COMPRESS
═══════════════════════════════════════════

SLIDE ${implicationSlide.slideNumber} (IMPLICATION):
  headline: ${implicationSlide.headline}
  body: ${implicationSlide.body}

═══════════════════════════════════════════
BANNED WORDS — never use these
═══════════════════════════════════════════

"well-being", "importance", "impact", "perception", "evolutionary marvel",
"significant", "enhance", "remarkable", "incredible", "fascinating",
"interesting", "noteworthy", "profound"

If you catch yourself writing any of these, rewrite with a concrete alternative.

═══════════════════════════════════════════
REQUIREMENTS
═══════════════════════════════════════════

1. DO NOT summarize the body. Extract or derive ONE sharp takeaway.

2. Both displayTitle AND displaySupport MUST contain at least one of:
   - A specific number or measurement
   - A named entity (person, place, species, product)
   - A concrete comparison (X vs Y, X outlasts Y, X beats Y)

3. displayTitle (5–10 words): The single most surprising concrete claim.
   Frame as an action or outcome, not a category label.
   BAD:  "Sloths: Evolutionary Marvels"
   GOOD: "Sloths Outlast Dolphins Underwater"
   BAD:  "Cow Friendships Enhance Well-being"
   GOOD: "Isolated Cows Produce Less Milk"

4. displaySupport (8–15 words): A specific proof point, number, or consequence
   that makes the title credible and memorable.
   BAD:  "Their unique adaptations showcase nature's ingenuity"
   GOOD: "They hold breath 40 min — 4x longer than a bottlenose dolphin"

5. If the implication slide body is too vague to derive a concrete takeaway,
   IGNORE the implication body and instead derive the strongest implication
   from the fact slides above. Pick the most surprising fact and frame its
   real-world consequence.

═══════════════════════════════════════════
SELF-CHECK BEFORE RESPONDING
═══════════════════════════════════════════

Before outputting, verify:
□ displayTitle contains a number, named entity, or concrete comparison
□ displaySupport contains a number, named entity, or concrete comparison
□ Neither line contains any banned word
□ A reader who sees ONLY these two lines learns something specific
□ The lines could NOT apply to a generic topic — they are specific to "${topic}"

═══════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════

Return exactly this JSON:

{
  "compressed": [
    {
      "slideNumber": ${implicationSlide.slideNumber},
      "displayTitle": "string (5–10 words, concrete)",
      "displaySupport": "string (8–15 words, concrete)"
    }
  ]
}`;
}

import type { MinedFact, CarouselMode } from '@/lib/validation/schemas';

interface ExpandPromptParams {
  topic: string;
  hook: { text: string; type: string };
  selectedFacts: MinedFact[];
  mode: CarouselMode;
  concept: string;
}

export function buildExpandPrompt({
  topic,
  hook,
  selectedFacts,
  mode,
  concept,
}: ExpandPromptParams): string {
  const factList = selectedFacts
    .map(
      (f, i) =>
        `FACT ${i + 1}:
  claim: ${f.claim}
  evidence: ${f.evidence}
  entities: ${f.entities.join(', ')}
  has_number: ${f.has_number}
  source: ${f.source_type}${f.fact_ref ? `\n  fact_ref: ${f.fact_ref}` : ''}`,
    )
    .join('\n\n');

  return `You are a fact expansion engine. Your job is to take a short factual claim with its evidence and produce a richer, more insightful explanation suitable for an Instagram carousel slide.

CONTEXT:
- Topic: "${topic}"
- Hook: "${hook.text}"
- Carousel mode: ${mode}
- Concept: "${concept}"

═══════════════════════════════════════════
FACTS TO EXPAND
═══════════════════════════════════════════

${factList}

═══════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════

For EACH fact above, write an "expansion" field: a 2–3 sentence paragraph that will become the body of a carousel slide.

Each expansion must:

1. EXPLAIN THE MECHANISM — don't just restate the claim. Tell the reader WHY or HOW.
   ✗ "Honey never spoils. Archaeologists found 3,000-year-old honey in Egyptian tombs."
   ✓ "Honey's extremely low moisture content and acidic pH create an environment where bacteria literally cannot survive. Archaeologists have found perfectly edible honey in 3,000-year-old Egyptian tombs — the sugar molecules bind so tightly to water that microbes starve before they can multiply."

2. INCLUDE A SURPRISING OR INSIGHTFUL DETAIL — something the reader wouldn't guess.
   ✗ "Octopuses have three hearts. This is an interesting adaptation."
   ✓ "Two of an octopus's three hearts pump blood to the gills, while the third sends it to the rest of the body. The gill hearts actually stop beating when the octopus swims, which is why these creatures prefer crawling — swimming literally exhausts their circulatory system."

3. ADD CONTEXT OR SCALE — numbers, comparisons, or named references that anchor the fact.
   ✗ "The Great Wall of China is very long and took a long time to build."
   ✓ "The Great Wall stretches 13,171 miles — enough to cross the continental US more than four times. Construction spanned over 2,000 years across multiple dynasties, with the Ming Dynasty alone adding 5,500 miles using an estimated workforce of over one million laborers."

═══════════════════════════════════════════
RULES
═══════════════════════════════════════════

- 2–3 sentences per expansion, 80–500 characters
- DO NOT open with the topic name or "Did you know" or "Interestingly"
- DO NOT end with meta-commentary ("This shows...", "This highlights...", "This is a testament to...")
- DO NOT use filler words: "fascinating", "remarkable", "incredible", "actually", "in fact"
- DO NOT become academic or textbook-like — keep the tone conversational and direct
- Every sentence must add NEW information — no sentence should merely restate the claim
- The expansion must be self-contained: a reader should understand it without seeing the claim
- Preserve all factual claims from the original evidence — do not drop numbers or names
- If the original evidence is already strong, enrich it with mechanism or context, don't replace it

═══════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════

Return a JSON object with a "facts" array. Each element must include ALL original fields from the input fact, plus the new "expansion" field. Preserve claim, evidence, entities, has_number, has_comparison, source_type, and fact_ref exactly as given.

{
  "facts": [
    {
      "claim": "original claim (unchanged)",
      "evidence": "original evidence (unchanged)",
      "entities": ["original", "entities"],
      "has_number": true/false,
      "has_comparison": true/false,
      "source_type": "grounded" | "internal_knowledge",
      "fact_ref": "original ref if present",
      "expansion": "Your 2–3 sentence expanded explanation here."
    }
  ]
}

Return exactly ${selectedFacts.length} facts in the same order as the input.`;
}

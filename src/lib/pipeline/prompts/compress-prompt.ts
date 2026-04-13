import type { GeneratedSlideV2 } from '@/lib/validation/schemas';

interface CompressPromptParams {
  topic: string;
  slides: GeneratedSlideV2[];
  angleDescription?: string;
}

export function buildCompressPrompt({ topic, slides, angleDescription }: CompressPromptParams): string {
  const slideList = slides.map(s => {
    return `SLIDE ${s.slideNumber} (${s.role}):
  headline: ${s.headline}
  body: ${s.body}`;
  }).join('\n\n');

  const angleBlock = angleDescription
    ? `\nCAROUSEL ANGLE: "${angleDescription}"\nEvery FACT slide must clearly serve this angle. Do not drift into unrelated aspects of the topic.\n`
    : '';

  return `You are a slide compression engine for Instagram carousels about "${topic}".
${angleBlock}
TASK: Transform each slide into two short, high-impact display lines for visual rendering.
The original body is preserved for captions — you are creating a DISPLAY-ONLY transformation.

═══════════════════════════════════════════
INPUT SLIDES
═══════════════════════════════════════════

${slideList}

═══════════════════════════════════════════
COMPRESSION RULES
═══════════════════════════════════════════

For each slide, produce:
  displayTitle: 5–10 words. Punchy, concrete, scannable in under 1 second.
  displaySupport: 8–15 words. Reinforces the title with a specific detail, number, or contrast.

Rules:
- No fluff: remove "most people don't know", "here's the thing", "the truth is"
- Prefer concrete nouns, actions, numbers, named entities
- Remove filler words (very, really, actually, basically, essentially)
- Keep the core meaning intact — do not invent new claims
- Must be understandable without reading the full body
- Each line must stand alone — no "this means" or "in other words"

Role-specific behavior:

- OPENER: This is the carousel cover — a topic-level title, NOT a specific fact.
  displayTitle = the topic title in 5–10 words. MUST include the subject name. May include the fact count.
  Preserve the title pattern chosen by the composer — do NOT force it into a single format.
     ✗ "3,000-Year-Old Honey. Still Edible." — too specific, sounds like a fact
     ✗ "You Won't Believe This Food Secret" — clickbait
     ✓ "Lions: 4 Amazing Facts You Didn't Know" — classic count pattern
     ✓ "Everything You Think About Sharks Is Wrong" — myth-busting pattern
     ✓ "Leonardo Da Vinci — Not What You'd Expect" — curiosity pattern
     ✓ "Why Honey Never Expires" — direct intrigue pattern
  displaySupport = always empty string for OPENER.
     ✓ "" (always empty)
  swipeCta = a short, contextual call-to-action that matches the hook's promise. 3–6 words starting with "Swipe to".
  The CTA must match what the carousel actually delivers. Examples:
     "Why X Does Y" → swipeCta: "Swipe to learn why"
     "How X Works" → swipeCta: "Swipe to find out how"
     "5 Foods That Destroy Your Gut" → swipeCta: "Swipe to see them"
     "Everything You Think About X Is Wrong" → swipeCta: "Swipe to see the truth"
     "What Happens When You Stop Eating Sugar" → swipeCta: "Swipe to see what happens"
     "The Hidden Cost of X" → swipeCta: "Swipe to find out"
  IMPORTANT: The CTA must feel natural for the specific hook. Do NOT always default to "Swipe to learn why".

- FACT: Transform into a FLOWING PARAGRAPH — one cohesive thought, not a list of disconnected sentences.

  MANDATORY STRUCTURE — every FACT slide MUST use this format:

  displayTitle = the core claim (5–10 words, must include a number or entity)
  displaySupport = a SINGLE FLOWING PARAGRAPH of 2–3 sentences (max 180 characters total).

  THE PARAGRAPH RULE:
  - Sentences MUST connect to each other using causal or explanatory connectives
  - The paragraph must read as ONE cohesive thought, not 3 separate factoids
  - Use connectives like: "because", "which", "so", "letting", "making", "meaning", "— and", "— so", "since", "thanks to", "allowing"
  - Each sentence should NEED the one before it to make full sense

  GOOD flowing paragraph:
    "Delivers 600 mg of venom per bite — the highest yield of any snake, used for hunting rather than defense. Its 2-inch fangs fold flat against the roof of its mouth, snapping forward only at the moment of strike."
    → Reads as one connected thought. Each sentence builds on the last.

  BAD (disconnected sentences):
    "Delivers 600 mg venom in one bite. Used for hunting, not defense. Fangs reach 2 inches long."
    → Three separate factoids. No connection. Reads like bullet points.

  CONCRETE DETAIL RULE:
  - Must include at least one number, named entity, or specific mechanism
  - Must answer "why" or "how" — not just state a claim
  - The paragraph must describe something the reader can picture

  ANGLE ALIGNMENT RULE:
  - If a carousel angle is specified, every FACT slide MUST clearly serve that angle
  - The paragraph should reinforce the angle, not just be loosely related to the topic

  REJECT and rewrite if:
  - Sentences are disconnected (no causal or explanatory link between them)
  - Reads like a bullet-point list disguised as text
  - Vague phrasing ("something happened", "led to chaos", "changed everything")
  - Generic summary without specifics
  - Last sentence is abstract interpretation ("symbolizes...", "represents...", "embodies...")
  - No concrete detail — no number, entity, or mechanism
  - Slide is off-angle — doesn't serve the carousel's chosen angle

  MORE EXAMPLES — VALID flowing paragraph:
    displayTitle: "Actaeon's Own Dogs Killed Him"
    displaySupport: "He stumbled on Artemis bathing, so she turned him into a stag on the spot — and his own hunting dogs, unable to recognize him, tore him apart."

  EXAMPLE — VALID:
    displayTitle: "Prometheus Paid With His Liver"
    displaySupport: "After stealing fire from the gods, Zeus chained him to a rock where an eagle devoured his liver every day — only for it to regrow each night."

  EXAMPLE — VALID (informational):
    displayTitle: "3,000-Year-Old Honey Still Edible"
    displaySupport: "Bees add an enzyme that produces hydrogen peroxide, which combined with 17% moisture and a pH of 3.9 literally starves bacteria — explaining why archaeologists found edible honey in Egyptian tombs."

  FACT VARIETY — across 3+ FACT slides, ensure the titles FEEL varied in how they open.
  Avoid having every title start the same way (e.g., all starting with a proper noun).

  Signals of good variety:
  - At least one title features a number near the start
  - At least one title uses contrast or comparison
  - At least one title leads with a named entity

  Always choose the strongest, most natural phrasing for each individual slide.

- IMPLICATION: (handled by dedicated compressor — skip if not present in input)

- CTA: Use the EXACT text from the input — do NOT rephrase or compress.
  displayTitle = copy the headline exactly as-is
  displaySupport = copy the body exactly as-is

═══════════════════════════════════════════
EXAMPLES
═══════════════════════════════════════════

BEFORE (FACT slide):
  headline: "Honey Has Survived Thousands of Years Without Spoiling"
  body: "Archaeologists found 3,000-year-old honey in Egyptian tombs that was still perfectly edible. Honey's low moisture content (around 17%) and acidic pH of 3.9 create an environment where bacteria simply cannot survive. When bees make honey, they add an enzyme called glucose oxidase that produces hydrogen peroxide — a natural antiseptic. This combination of properties means honey is essentially self-preserving, which is why ancient civilizations used it not just as food but as a wound treatment."

AFTER:
  displayTitle: "3,000-Year-Old Honey Still Edible"
  displaySupport: "Bees add an enzyme that produces hydrogen peroxide, which combined with 17% moisture and a pH of 3.9 literally starves bacteria — explaining why archaeologists found edible honey in Egyptian tombs."

BEFORE (IMPLICATION slide):
  headline: "Nature's Best Preservatives Were Never Invented — They Evolved"
  body: "From honey's enzymatic defense to salt's osmotic dehydration, the most effective preservation methods humans use today were discovered by observing natural processes. Modern food science has yet to create a synthetic preservative that matches honey's 3,000-year track record."

AFTER:
  displayTitle: "Nature Outperforms Lab Preservatives"
  displaySupport: "No synthetic match for honey's 3,000-year shelf life"

BEFORE (CTA slide):
  headline: "We post only interesting facts!"
  body: "Follow us to get fresh facts everyday"

AFTER:
  displayTitle: "We post only interesting facts!"
  displaySupport: "Follow us to get fresh facts everyday"

═══════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════

Return exactly this JSON structure:

{
  "compressed": [
    {
      "slideNumber": 0,
      "displayTitle": "string (5–10 words)",
      "displaySupport": "string (8–15 words, or empty string for OPENER if not needed)",
      "swipeCta": "string (OPENER slides only, e.g. 'Swipe to learn why')"
    },
    ...one entry per input slide, same order...
  ]
}

CRITICAL:
- Return one entry per slide. slideNumber must match the input slide numbers exactly.
- Include swipeCta ONLY for OPENER slides. Omit for all other roles.`;
}

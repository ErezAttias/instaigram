interface ArticleSlide {
  role: string;
  headline: string;
  body: string;
  supportingDetail?: string | null;
}

interface ArticleExpandedFact {
  claim: string;
  expansion: string;
}

interface ArticleGenerationParams {
  topic: string;
  hook: string;
  expandedFacts: ArticleExpandedFact[];
  slides: ArticleSlide[];
  memory?: {
    tone?: string;
    aggressionLevel?: number;
    style?: string;
    avoidPatterns?: string[];
    forbiddenWords?: string[];
  };
}

function formatFact(f: ArticleExpandedFact, i: number): string {
  return `FACT ${i + 1}:
  claim: ${f.claim}
  expansion: ${f.expansion}`;
}

function formatSlide(s: ArticleSlide): string {
  const detail = s.supportingDetail ? ` [${s.supportingDetail}]` : '';
  return `  ${s.role}: "${s.headline}" — ${s.body}${detail}`;
}

export function buildArticleGenerationPrompt({
  topic,
  hook,
  expandedFacts,
  slides,
  memory,
}: ArticleGenerationParams): string {
  const factList = expandedFacts.map(formatFact).join('\n\n');
  const slideList = slides.map(formatSlide).join('\n');

  const memoryContext = memory
    ? `
CHANNEL MEMORY (hard constraints):
- Tone: ${memory.tone ?? 'Not set'}
- Aggression: ${memory.aggressionLevel ?? 'Not set'}/10
- Style: ${memory.style ?? 'Not set'}
- Avoid patterns: ${memory.avoidPatterns?.join(', ') ?? 'None'}
- Forbidden words: ${memory.forbiddenWords?.join(', ') ?? 'None'}
`
    : '';

  return `You are an expert science/culture writer producing a mini-article for an Instagram carousel post.

TASK: Write a 200–400 word educational article that synthesizes the facts from this carousel into one cohesive, flowing piece.

POST CONTEXT:
- Topic: "${topic}"
- Hook: "${hook}"

═══════════════════════════════════════════
EXPANDED FACTS (primary source material)
═══════════════════════════════════════════

${factList}

═══════════════════════════════════════════
CAROUSEL SLIDES (for reference)
═══════════════════════════════════════════

${slideList}

${memoryContext}

═══════════════════════════════════════════
WHAT THIS ARTICLE IS
═══════════════════════════════════════════

This is NOT an Instagram caption. It is a mini-article — a short, self-contained educational piece that a reader scrolls through alongside the carousel images. Think: the text panel of an Instagram post that reads like a short blog entry.

The reader has already swiped through the visual carousel. This article gives them the full story — mechanisms explained, facts connected, context added. It should feel like a reward for reading further.

═══════════════════════════════════════════
STRUCTURE
═══════════════════════════════════════════

1. OPENING (1–2 sentences): Lead with the most surprising or counter-intuitive fact. Do NOT restate the carousel title or hook. Do NOT use a teaser preamble ("Did you know…", "You won't believe…", "Here's what most people get wrong…"). Drop the reader straight into substance.

2. BODY (3–5 paragraphs): Weave ALL expanded facts into a single flowing narrative. Each paragraph should:
   - Explain a mechanism, cause, or consequence (WHY/HOW, not just WHAT)
   - Connect to the previous paragraph with a natural transition (not "Additionally…", "Furthermore…", "Moreover…")
   - Include at least one concrete anchor: a number, named entity, comparison, or specific mechanism
   - Add context or insight that goes beyond what the carousel slides show

3. CLOSING (1–2 sentences): End with a thought-provoking implication, a lesser-known connection, or a forward-looking consequence. NOT a generic call to action or motivational statement.

═══════════════════════════════════════════
RULES
═══════════════════════════════════════════

- 200–400 words total
- Every fact from the expanded facts list MUST appear in the article — none may be dropped
- Do NOT list facts sequentially. Weave them into a narrative where one idea flows into the next
- Do NOT repeat slide headlines verbatim — rephrase, reframe, and connect them
- No emoji
- No filler words: "fascinating", "remarkable", "incredible", "actually", "in fact", "interestingly"
- No meta-commentary: "This shows…", "This highlights…", "This is a testament to…"
- No academic/textbook tone — write conversationally and directly
- No bullet points or numbered lists — this is flowing prose
- Every paragraph must contain at least one specific detail (number, name, mechanism)
- Do NOT end with: a question to the reader, a call to action, or "Next time you see…"
- The article must be factually consistent with the carousel slides — do not invent new claims

═══════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════

Return a JSON object:
{
  "text": "The full article text here. Use \\n for paragraph breaks."
}`;
}

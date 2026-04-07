import { getPatternMiningGuidance } from '@/lib/prompts/post-patterns';
import type { CarouselMode } from '@/lib/validation/schemas';
import type { TopicDomainStyle } from '@/lib/utils/topic-classifier';

interface KnowledgeFactInput {
  id: string;
  text: string;
  entities: string[];
}

interface MinePromptParams {
  topic: string;
  hook: {
    text: string;
    type: string;
  };
  knowledgeFacts?: KnowledgeFactInput[];
  pattern?: string;
  candidateCount?: number;
  mode?: CarouselMode;
  concept?: string;
  domainStyle?: TopicDomainStyle;
}

export function buildMinePrompt({
  topic,
  hook,
  knowledgeFacts,
  pattern,
  candidateCount = 18,
  mode,
  concept,
  domainStyle,
}: MinePromptParams): string {
  const patternBlock = pattern
    ? `
═══════════════════════════════════════════
PATTERN GUIDANCE
═══════════════════════════════════════════

${getPatternMiningGuidance(pattern)}
`
    : '';

  const groundingBlock = knowledgeFacts && knowledgeFacts.length > 0
    ? `
═══════════════════════════════════════════
GROUNDING FACTS (verified external source)
═══════════════════════════════════════════

You have these verified facts to draw from. Use them as seeds — you may
expand on them, combine them, or use them as-is. Reference their IDs in
your output via the fact_ref field.

${knowledgeFacts.map(f => `[${f.id}] ${f.text} (entities: ${f.entities.join(', ')})`).join('\n')}

GROUNDING RULES:
- Prefer grounding facts over internal knowledge when available
- If a grounding fact is strong enough, use it directly
- If a grounding fact is too vague, expand on it with specific detail
- Set source_type to "grounded" for facts derived from the list above
- Set source_type to "internal_knowledge" for facts from your own knowledge
`
    : `
You have no external grounding facts. Use your own knowledge of "${topic}".
All facts must be set to source_type: "internal_knowledge".
`;

  // Mode-specific focus block
  let focusBlock = '';
  if (mode === 'single_entity' && concept) {
    focusBlock = `
═══════════════════════════════════════════
ENTITY FOCUS (non-negotiable)
═══════════════════════════════════════════

This carousel is about ONE specific entity: "${concept}" (within "${topic}").

ALL ${candidateCount} facts must be specifically about "${concept}".
- Facts may mention related entities, but "${concept}" must be the PRIMARY subject of each fact.
- Mine DEPTH, not breadth: different angles, details, and dimensions of "${concept}".

Test: Would this fact belong in a carousel about a DIFFERENT entity within "${topic}"?
If yes, it is too generic. Reject it and find something specific to "${concept}".

GOOD: 6 different facts all about "${concept}" — its history, its properties, surprising details, numbers, comparisons.
BAD: 6 facts about 6 different things within "${topic}" — that is a grab-bag, not a focused carousel.
`;
  } else if (mode === 'thematic_collection' && concept) {
    focusBlock = `
═══════════════════════════════════════════
THEMATIC FOCUS (non-negotiable)
═══════════════════════════════════════════

This carousel is a themed collection: "${concept}" (within "${topic}").

Each of the ${candidateCount} facts must feature a DIFFERENT specific item that fits this theme.
- Mine BREADTH, not depth: each fact is about a different entity/item.
- Every fact must clearly answer the thematic question implied by "${concept}".
- No two facts about the same item. Aim for at least 12 distinct items across ${candidateCount} candidates.

Test: Does this fact clearly fit the theme "${concept}"?
If it's about "${topic}" generally but doesn't fit the specific thematic lens, reject it.

GOOD: ${candidateCount} facts each about a different item, all fitting "${concept}".
BAD: ${candidateCount} facts about the same item, or facts that don't fit the thematic lens.
`;
  }

  const miningTarget = concept ? `"${concept}"` : `"${topic}"`;

  return `You are a fact mining engine. Your job is to produce a pool of specific, surprising, verifiable facts about a topic.

You are NOT writing carousel slides. You are NOT writing headlines. You are mining raw factual material that will later be turned into slides by a separate process.

TOPIC: "${topic}"
HOOK (for context — the carousel will open with this): "${hook.text}" (${hook.type})
${focusBlock}
═══════════════════════════════════════════
TASK
═══════════════════════════════════════════

Generate ${candidateCount} candidate facts about ${miningTarget}.

Each fact must be:
- SPECIFIC: contains a named entity, number, date, or concrete detail
- SURPRISING: not common knowledge for the topic's audience
- STANDALONE: teaches something on its own without needing other facts
- VERIFIABLE: a reader could confirm this with a search

${patternBlock}
${groundingBlock}

═══════════════════════════════════════════
WHAT MAKES A GOOD CANDIDATE
═══════════════════════════════════════════
${domainStyle === 'informational' ? `
** INFORMATIONAL DOMAIN — mechanism/behavior/trait mode **

This is an INFORMATIONAL topic (animals, science, nature, space, etc.).
Do NOT force narrative storytelling. Do NOT look for "dramatic events with stakes."

STRONG candidates for informational topics:
- "Shortfin mako sharks can reach 45 mph — they chase down fast prey like tuna in open water"
- "Honey never spoils because its low moisture content (17%) starves bacteria by osmotic dehydration"
- "Octopuses have 3 hearts — one stops when they swim, which is why they prefer crawling"
- "A pistol shrimp's claw snap creates a bubble that reaches 4,700°C — hotter than the sun's surface"
- "Greenland sharks can live for 400 years — they don't reach sexual maturity until age 150"

PRIORITIZE facts that describe:
  ✓ A surprising mechanism or biological process (HOW something works)
  ✓ A concrete behavior with a specific detail (WHAT the animal/phenomenon does)
  ✓ An extreme trait with a number (speed, size, lifespan, temperature, distance)
  ✓ A comparison that makes scale tangible ("hotter than X", "faster than Y")
  ✓ A physical detail the reader can visualize in a real image

DEPRIORITIZE facts that:
  ✗ Read like myth-style drama ("Its tail cuts through water swiftly")
  ✗ Use vague action framing ("Becomes ocean's efficient predator")
  ✗ Force a narrative arc where none exists
  ✗ Describe the animal/phenomenon in abstract or symbolic terms
` : `
** NARRATIVE DOMAIN — event/story/drama mode **

This is a NARRATIVE topic (mythology, history, crime, legendary events).

STRONG candidates (prefer DRAMATIC EVENTS):
- "Ares disguised himself as a boar and killed Adonis during a hunt" — a specific EVENT with stakes and consequence
- "Hera tricked Semele into demanding Zeus's true form, which killed her" — deception + death
- "Tesla produced 1.8M cars in 2023 — more than BMW, Mercedes, and Audi combined"
- "Wilt Chamberlain averaged 48.5 minutes per game in 1962 — games are only 48 minutes"

PRIORITIZE facts that describe:
  ✓ A specific event that HAPPENED (not just a trait or ability)
  ✓ Something with STAKES (a life, a status, a kingdom at risk)
  ✓ A CONSEQUENCE (death, transformation, punishment, irreversible change)

DEPRIORITIZE facts that are only:
  ✗ Abilities or traits ("X could do Y", "X was known for Y")
  ✗ Descriptions or classifications ("X was the god of Y")
  ✗ Generic capabilities without a specific incident
`}

WEAK candidates (reject these):
- "There are many interesting facts about this topic" → no specific claim
- "Things are not what they seem" → no entity, no fact, no detail
- "The history is fascinating" → a label, not a fact
- "Most people don't realize the truth" → generic, could be about anything
- "Hades wore the Helm of Darkness to remain unseen" → ability, not an event — no stakes, no consequence

═══════════════════════════════════════════
WHAT TO AVOID
═══════════════════════════════════════════

- Do NOT generate vague observations — every fact must make a concrete claim
- Do NOT repeat the same fact with different wording
- Do NOT produce facts that require context from other facts to make sense
- Do NOT invent statistics — if you include a number, it must be real
- Do NOT generate facts about other topics — ALL facts must be about ${miningTarget}
- Do NOT use these vague words in claims: "power", "energy", "duality", "balance", "harmony", "essence", "force", "spirit", "aura", "vibration", "synergy", "cosmic"
  If your claim relies on any of these, it is too abstract. Replace with a specific mechanism, number, or named entity.
  ✗ "The power of honey's antimicrobial properties" → vague
  ✓ "Honey's low moisture (17%) starves bacteria by osmotic dehydration" → specific

═══════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════

{
  "candidates": [
    {
      "claim": "One sentence stating the core factual claim",
      "evidence": "2-3 sentences providing context, mechanism, or supporting detail",
      "entities": ["Named", "Entities", "Referenced"],
      "has_number": true/false,
      "has_comparison": true/false,
      "source_type": "grounded" | "internal_knowledge",
      "fact_ref": "fact-id or omit if internal_knowledge"
    }
  ]
}

Generate exactly ${candidateCount} candidates. Aim for variety — different aspects of ${miningTarget}, different types of facts (numbers, mechanisms, history, comparisons, extremes).`;
}

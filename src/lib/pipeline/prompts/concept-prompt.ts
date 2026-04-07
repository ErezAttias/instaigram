interface ConceptPromptParams {
  topic: string;
  hook: {
    text: string;
    type: string;
  };
  usedConcepts?: string[];
  direction?: string;
  channelNiche?: string;
  channelName?: string;
}

export function buildConceptPrompt({
  topic,
  hook,
  usedConcepts,
  direction,
  channelNiche,
  channelName,
}: ConceptPromptParams): string {
  const usedBlock = usedConcepts && usedConcepts.length > 0
    ? `
ALREADY USED (do not repeat any of these):
${usedConcepts.map(c => `- ${c}`).join('\n')}
`
    : '';

  const directionBlock = direction
    ? `
DIRECTION: "${direction}"
IMPORTANT: Your chosen concept MUST stay within the scope of this direction. Do not invent an
unrelated sub-topic. The direction is the user's explicit intent — narrow within it, never away from it.
`
    : '';

  const nicheBlock = (channelName || channelNiche)
    ? `
═══════════════════════════════════════════
CHANNEL CONTEXT
═══════════════════════════════════════════
${channelName ? `Channel name: "${channelName}"` : ''}
${channelNiche ? `Channel focus: "${channelNiche}"` : ''}

DISAMBIGUATION RULE:
Your concept MUST be derived from the TOPIC, narrowed and sharpened.
Do NOT use the channel name or channel focus as your concept — they describe the channel, not the subject.

When the topic has multiple possible meanings, pick the one that fits this channel's domain.
Examples:
- topic "Oasis" in a music channel → concept: "Oasis (the British rock band)" NOT "desert water source"
- topic "Pearl Jam" in a music channel → concept: "Pearl Jam (the band)" NOT a food item
- topic "The Doors" in a music channel → concept: "The Doors (the rock band)" NOT physical doors
`
    : '';

  return `Given a topic and hook, decide how this carousel should be structured and pick a specific concept.

TOPIC: "${topic}"
HOOK: "${hook.text}" (type: ${hook.type})
${nicheBlock}${directionBlock}${usedBlock}
═══════════════════════════════════════════
STEP 1: ANGLE DECISION (required for every topic)
═══════════════════════════════════════════

Before choosing a mode, you MUST decide the carousel's angle:

  NARROW ANGLE — go deep on one specific entity, event, or mechanism
    ✓ "How Cerberus got from 50 heads to 3" (one entity, surprising arc)
    ✓ "The pigeon that saved 194 soldiers" (one event, one story)
    ✗ "Greek gods" (not an angle, just a topic)

  SURVEY ANGLE — curate multiple items through a SPECIFIC lens
    ✓ "Greek gods who were put on trial" (specific lens, not all gods)
    ✓ "Ancient punishments for lazy workers in Rome" (specific lens)
    ✗ "Interesting facts about Greek gods" (no lens, just a topic)

The angle MUST be specific enough that someone could say:
  "Oh, I didn't know there was a carousel about THAT."

If the hook already implies a specific angle, use it.
If the hook is generic (e.g., "Things you don't know about X"), you MUST
sharpen it into a specific angle before proceeding.

═══════════════════════════════════════════
STEP 2: MODE SELECTION
═══════════════════════════════════════════

Choose ONE mode:

1. single_entity — The carousel goes deep on ONE specific named thing.
   Use when: the topic has well-known sub-entities with enough depth for 6 distinct facts each,
   OR the hook implies depth about a particular thing.
   Examples of good entities: "Moaning Myrtle", "The Eiffel Tower", "Napoleon", "Bitcoin mining", "The Sorting Hat"
   Examples of BAD entities: "Harry Potter" (too broad), "Characters" (a category), "Magic" (abstract)

2. thematic_collection — The carousel curates multiple distinct items around a TIGHT thematic lens.
   Use when: the topic is broad and the value comes from surprising variety, OR the hook implies
   comparison across multiple things.
   Examples of good themes: "Wars that lasted less than a day", "Foods that are secretly radioactive",
   "Countries where coffee was once illegal", "Records that will never be broken"
   Examples of BAD themes: "Interesting facts" (too vague), "History" (a topic, not a theme),
   "Things you didn't know" (not a specific lens)

CRITICAL RULES:
- The concept must be MORE SPECIFIC than the topic itself.
  Topic "Animal facts" → concept "Animals whose punches exceed bullet speed" (not "Animal facts")
  Topic "Harry Potter facts" → concept "The Sorting Hat" (not "Harry Potter")
- For single_entity: the entity must be specific enough that 6 facts are all clearly about it.
- For thematic_collection: the theme must be a specific LENS or QUESTION, not just a rephrasing of the topic.
  The theme implies a question each slide answers: "Is [item] radioactive?" / "Did [country] ban this?"
- BROAD TOPIC RULE: If the topic is broad (e.g., "Greek mythology", "Space", "History"),
  you MUST narrow aggressively. Pick a surprising, non-obvious corner — not the most famous entity.
  ✗ Topic "Greek mythology" → concept "Zeus" — too obvious, too broad
  ✓ Topic "Greek mythology" → concept "Cerberus" — specific, surprising, enough depth
  ✗ Topic "Space" → concept "The Solar System" — still broad
  ✓ Topic "Space" → concept "Voyager 1's golden record" — specific, rich

HOOK ALIGNMENT:
- If the hook already reflects the chosen angle, keep it.
- If the hook is generic but you narrowed the angle, suggest a revised hook
  that matches. The revised hook must still be 6-15 words, create a curiosity gap,
  and contain at least one concrete anchor (number, entity, or comparison).
  ✗ "Things you don't know about Greek gods" → too generic for your angle
  ✓ "Cerberus Had 50 Heads — Then the Greeks Changed Their Mind" → matches narrow angle

Return:
{
  "mode": "single_entity" | "thematic_collection",
  "concept": "string — the specific entity OR theme",
  "conceptType": "character" | "place" | "object" | "event" | "person" | "organization" | "phenomenon" | "category" | "pattern",
  "angle": "narrow" | "survey",
  "angleDescription": "string — one sentence describing the specific angle, e.g. 'Greek gods who were put on trial by other gods'",
  "suggestedHook": "string or null — a revised hook that matches the chosen angle. null if the original hook already fits.",
  "rationale": "string — one sentence explaining why this mode and concept fit the topic and hook"
}`;
}

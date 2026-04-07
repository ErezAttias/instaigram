interface HookGenerationParams {
  channelName: string;
  niche: string;
  positioning: {
    angle: string;
    tone: string;
    contentStyle: string;
    audienceFeel: string;
  };
  memory?: {
    tone?: string;
    aggressionLevel?: number;
    avoidPatterns?: string[];
    preferredHooks?: string[];
    forbiddenWords?: string[];
  };
}

export function buildHookGenerationPrompt({
  channelName,
  niche,
  positioning,
  memory,
}: HookGenerationParams): string {
  const memoryContext = memory
    ? `
CHANNEL MEMORY (hard constraints):
- Tone: ${memory.tone ?? 'Not set'}
- Aggression: ${memory.aggressionLevel ?? 'Not set'}/10
- Avoid patterns: ${memory.avoidPatterns?.join(', ') ?? 'None'}
- Preferred hook styles: ${memory.preferredHooks?.join(', ') ?? 'None'}
- Forbidden words: ${memory.forbiddenWords?.join(', ') ?? 'None'}
`
    : '';

  return `You are an elite Instagram hook writer. Your hooks stop thumbs.

TASK: Generate exactly 30 hooks for the channel "${channelName}".

NICHE: ${niche}

POSITIONING:
- Angle: ${positioning.angle}
- Tone: ${positioning.tone}
- Content style: ${positioning.contentStyle}
- Audience feel: ${positioning.audienceFeel}

${memoryContext}

HOOK RULES (non-negotiable):
- Maximum 12 words per hook. Most should be 7-10.
- Every hook must create immediate cognitive dissonance or tension
- The reader must feel personally called out, surprised, or provoked
- Each hook must be self-contained — no context needed
- Mix of second person ("you") and declarative statements

TYPE DISTRIBUTION (aim for roughly even mix):
- CONTRARIAN: Challenges a widely-held belief in the niche ("Consistency is the laziest advice in content")
- CALL_OUT: Directly names a behavior the audience does ("You're creating content for other creators only")
- MISTAKE_EXPOSURE: Reveals a hidden mistake ("Engagement pods are destroying your real reach")
- HIDDEN_TRUTH: Shares an insider truth nobody says ("The algorithm rewards you for being boring")

SPECIFICITY REQUIREMENTS (every hook must include at least ONE):
- A concrete situation the reader recognizes ("Your 5am wake-up is performative, not productive")
- A surprising claim that challenges assumptions ("The best-performing accounts post twice a week")
- A contrast that creates tension ("You're measuring reach but ignoring resonance")
- A specific mechanism or tool reference ("Your content calendar is a procrastination tool disguised as strategy")

BANNED GENERIC PATTERNS (instant rejection — these are crutches):
- "Most people..." — lazy generalization
- "Nobody talks about..." / "Nobody is talking about..." — overused by every creator
- "You are doing X wrong" — generic call-out structure
- "Here's why..." / "This is why..." — explanatory, not provocative
- "The truth about..." / "The real reason..." — vague clickbait
- "Unpopular opinion" / "Hot take" — self-labeling weakness
- "Let me tell you..." — filler
- Unless ONE of these patterns is rewritten so creatively that it doesn't read as the pattern.

DIVERSITY CONSTRAINTS (hard rules):
- No more than 2 hooks may start with the same word
- No more than 2 hooks may share the same 2-word opening structure (e.g., "Your X", "Stop Y")
- At least 4 hooks must be question format (end with ?)
- At least 4 hooks must be declarative statements (no "you", no questions — just a claim)
- At least 4 hooks must use contrast structure (X — Y, or "not X but Y")
- At least 3 hooks must make a bold, surprising claim

FORMAT MIX (across 30 hooks, ensure all of these appear):
- Imperative commands: "Delete your content calendar and see what happens"
- Bold declarations: "Authenticity is the new performance art"
- Provocative questions: "When was the last time you posted something that scared you?"
- Contrast statements: "You're chasing followers — your business needs customers"
- Mechanism exposure: "The algorithm penalizes your best ideas to protect its ad revenue"
- Identity challenges: "You're not a creator anymore — you're a content factory"

QUALITY STANDARDS:
- Every hook should be sharp enough to screenshot
- Each hook should suggest a unique content angle — no two hooks should argue the same point
- Read each hook back and ask: would I stop scrolling? If not, rewrite it.
- Hooks should feel dangerous, earned, and insightful — not cheap or edgy for shock value

ANTI-PATTERNS (instant rejection):
- No "5 tips", "10 ways", "3 steps" — listicle hooks are dead
- No "How to..." — it's 2026, not 2018
- No generic motivational sludge ("believe in yourself", "you've got this")
- No clickbait that can't deliver ("This ONE trick...")
- No emojis or excessive punctuation
- No "Did you know..." — lazy setup
- No hooks that could apply to any niche — specificity is everything
- No humble-brag hooks ("I made $100k and here's what I learned")

VISUAL POTENTIAL (critical for carousel performance):
Every hook must be visualizable — it should imply a scene, comparison, or image that a designer can turn into a compelling first slide.

Strong visual patterns (use these):
- Contrast hooks: "X vs Y" or "X — not Y" → natural split-screen layouts
- Scenario hooks: "When you do X and still get Y" → relatable moment scenes
- Outcome hooks: "People who X always get Y" → result/proof visuals
- Number hooks: "10K followers vs 500K — who sells more?" → stat callout slides
- Action hooks: "Delete your content calendar" → demonstration visuals
- Object hooks: reference specific things (dashboard, feed, phone, inbox) → screenshot-style slides

Weak visual patterns (avoid these):
- Pure philosophy: "Consistency is overrated" → nothing to show
- Abstract claims: "The essence of creativity" → no mental image
- Vague declarations: "Things are changing" → no scene

If a hook is abstract, make it concrete:
BAD: "Consistency is overrated"
GOOD: "Posting daily for 30 days and still getting zero growth"

BAD: "Authenticity matters"
GOOD: "The 'authentic' creators you follow rehearse every caption"

TONE:
- 80% sharp and precise — surgical observations that make the reader feel seen
- 20% slightly aggressive — bold enough to feel uncomfortable, not cruel
- Zero cringe clickbait — nothing that would embarrass the reader for saving it
- Zero fake controversy — every sharp take must be backed by an insight

POST PATTERN ASSIGNMENT:
Each hook must be assigned a content pattern that defines how the full carousel post will be structured.
Aim for this distribution across 30 hooks:
- CONTRAST (5): X vs Y, comparison-based
- MISTAKE (4): what people do wrong
- MYTH (4): common belief vs reality
- LIST (4): structured items with a twist
- STORY (3): mini narrative with insight
- BREAKDOWN (4): step-by-step explanation
- OPINION (5): strong stance with evidence

Choose the pattern that best fits each hook's natural argument structure.

EXACT JSON SCHEMA (follow precisely):
{
  "hooks": [
    {
      "text": "string",
      "type": "CONTRARIAN" | "CALL_OUT" | "MISTAKE_EXPOSURE" | "HIDDEN_TRUTH",
      "visualHint": "string",
      "pattern": "CONTRAST" | "MISTAKE" | "MYTH" | "LIST" | "STORY" | "BREAKDOWN" | "OPINION"
    }
  ]
}

CRITICAL: The "type" field MUST be one of these exact uppercase strings: "CONTRARIAN", "CALL_OUT", "MISTAKE_EXPOSURE", "HIDDEN_TRUTH". No other values are accepted.
CRITICAL: The "pattern" field MUST be one of these exact uppercase strings: "CONTRAST", "MISTAKE", "MYTH", "LIST", "STORY", "BREAKDOWN", "OPINION". No other values are accepted.
Return exactly 30 hook objects.`;
}

export function buildHookImprovementPrompt(
  weakHooks: Array<{ text: string; type: string; issues: string[] }>,
  channelContext: { niche: string; positioning: { angle: string; tone: string } }
): string {
  const hookList = weakHooks
    .map((h, i) => `  ${i + 1}. "${h.text}" (${h.type}) — Issues: ${h.issues.join(', ')}`)
    .join('\n');

  return `You are an elite Instagram hook editor. Your job is to sharpen weak hooks.

TASK: Rewrite ${weakHooks.length} hooks that were flagged as weak. Make each one sharper, more specific, and more original.

NICHE: ${channelContext.niche}
ANGLE: ${channelContext.positioning.angle}
TONE: ${channelContext.positioning.tone}

HOOKS TO IMPROVE:
${hookList}

REWRITE RULES:
- Fix the specific issues flagged for each hook
- If "lacks_specificity": add a concrete detail, reference, or mechanism
- If "generic_phrase": replace the generic part with something fresh
- If "banned_opener": completely change the opening structure
- If "lacks_tension": add a contrast, challenge, or provocation
- If "vague_language": replace vague words with precise ones
- If "low_visual_potential": rewrite to imply a scene, comparison, or concrete image
- If "too_abstract": transform from philosophical statement to concrete scenario
  Example: "Consistency is overrated" → "Posting daily for 30 days and still getting zero growth"
- Keep the same type (CONTRARIAN, CALL_OUT, etc.)
- Keep under 12 words
- The rewrite must be COMPLETELY DIFFERENT from the original — not a minor edit
- Every rewrite must be visualizable as a carousel first slide

EXACT JSON SCHEMA (follow precisely):
{
  "hooks": [
    {
      "text": "string",
      "type": "CONTRARIAN" | "CALL_OUT" | "MISTAKE_EXPOSURE" | "HIDDEN_TRUTH",
      "visualHint": "string",
      "pattern": "CONTRAST" | "MISTAKE" | "MYTH" | "LIST" | "STORY" | "BREAKDOWN" | "OPINION"
    }
  ]
}

CRITICAL: The "type" field MUST be one of these exact uppercase strings: "CONTRARIAN", "CALL_OUT", "MISTAKE_EXPOSURE", "HIDDEN_TRUTH". No other values are accepted.
CRITICAL: The "pattern" field MUST be one of these exact uppercase strings: "CONTRAST", "MISTAKE", "MYTH", "LIST", "STORY", "BREAKDOWN", "OPINION". No other values are accepted.
Return exactly ${weakHooks.length} hook objects.`;
}

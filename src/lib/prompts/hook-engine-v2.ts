// ─── Hook Engine V2 Prompts ──────────────────────────────────
// Three-stage pipeline: Generate → Score → Refine
// Mode-aware: fact topics get dedicated prompts that ban news framing.

import type { TopicContentMode } from '@/lib/utils/topic-classifier';

export interface HookEngineV2Params {
  topic: string;
  contentMode: TopicContentMode;
  count?: number;
}

// ─── STEP 1: Generate structured hooks ───────────────────────

export function buildHookGenerationV2Prompt({ topic, contentMode, count = 20 }: HookEngineV2Params): string {
  if (contentMode === 'fact') {
    return buildFactHookGenerationPrompt(topic, count);
  }
  return buildGeneralHookGenerationPrompt(topic, count);
}

function buildFactHookGenerationPrompt(topic: string, count: number): string {
  return `You are an elite social media hook writer for evergreen fact-based content. Your hooks stop thumbs mid-scroll with surprising, timeless facts.

TASK: Generate exactly ${count} hooks about "${topic}".

CONTENT MODE: EVERGREEN FACTS ONLY.
Every hook MUST state or imply a timeless, verifiable FACT.
A fact is something that can be checked in an encyclopedia — a biological trait, a measurement, a mechanism, a comparison, or a debunked misconception.

WHAT COUNTS AS A FACT HOOK (every hook must fit one of these):
- A biological trait: "Octopuses have three hearts and blue blood"
- A behavior: "Dolphins sleep with one eye open"
- A mechanism: "Flamingos are pink because of the shrimp they eat"
- A comparison: "A mantis shrimp punches harder than a bullet"
- A misconception debunked: "Daddy longlegs aren't actually spiders"
- A measurement: "A blue whale's heart weighs 400 pounds"

WHAT DOES NOT COUNT (instant rejection — these are NOT facts):
- Stories about people: "Jane Goodall's surprising stance on zoos" ← EDITORIAL
- Organization narratives: "SeaWorld's latest orca show" ← NARRATIVE
- Viral moments: "The viral moment that made a tiger cub famous" ← STORY
- Trials / events: "Elon Musk's brain chip trials on pigs" ← EVENT
- Pure questions with no fact: "Why do cats purr?" ← NO FACT STATED
- Commentary: "The controversial truth about animal testing" ← EDITORIAL
- Attributed claims: "Scientists say dolphins are self-aware" ← ATTRIBUTION

Every hook MUST follow one of these 5 formats — no exceptions:

1. CONTRADICTION:
   "You think X, but actually Y"
   Example: "You think goldfish have bad memory — they remember for months"

2. HIDDEN_TRUTH:
   A surprising fact stated directly.
   Example: "Octopuses have three hearts and blue blood"

3. MECHANISM:
   "The reason X happens is..."
   Example: "Flamingos are pink because of the shrimp they eat"

4. EXTREME:
   A comparison with a number or superlative.
   Example: "A mantis shrimp punches harder than a .22 caliber bullet"

5. THREAT:
   "You're probably wrong about X — here's the real fact"
   Example: "Daddy longlegs aren't actually spiders"

EACH HOOK MUST CONTAIN AT LEAST ONE:
- A specific number, measurement, or count (e.g. "3 hearts", "400 pounds", "80 times per second")
- OR a named species / organism / substance (e.g. "mantis shrimp", "tardigrade", "honey")
- OR a body part / biological structure (e.g. "tongue", "venom", "skin", "bone")
- OR a concrete comparison ("faster than", "heavier than", "the size of")
- OR a negation of a misconception ("aren't actually", "don't really", "isn't true")

BANNED — INSTANT REJECTION:
- NO named people (e.g. Elon Musk, Jane Goodall, David Attenborough)
- NO organizations (e.g. NASA, WWF, SeaWorld, National Geographic)
- NO narrative framing: story, moment, revealed, viral, exposed, controversial, debate
- NO event framing: trial, show, campaign, announcement, premiere
- NO dates or years (2024, 2025, 2026, "this year", "last week")
- NO attribution: "scientists say", "study shows", "experts warn", "according to"
- NO location-specific news: "spotted in", "born at", "returned to"
- NO pure questions without a fact stated in the hook
- NO generic words: "explore", "interesting", "discover", "amazing", "incredible", "journey", "fascinating"

RULES (non-negotiable):
- Maximum 12 words per hook. Shorter is better.
- Every hook must create curiosity or tension — the reader must NEED to know more
- Must feel like a social media hook, NOT an article title or blog headline
- No emojis, no excessive punctuation
- Each hook must reference a SPECIFIC fact, species, or phenomenon — nothing generic
- Vary the formats across all 5 types
- Every fact must be TIMELESS — true yesterday, true today, true in 10 years

OUTPUT: Return a JSON object with this exact structure:
{
  "hooks": [
    { "hook": "the hook text", "format": "contradiction" | "hidden_truth" | "mechanism" | "extreme" | "threat" }
  ]
}

Generate exactly ${count} hooks. Every hook must be unique.`;
}

function buildGeneralHookGenerationPrompt(topic: string, count: number): string {
  return `You are an elite social media hook writer. Your hooks stop thumbs mid-scroll.

TASK: Generate exactly ${count} hooks about "${topic}".

Every hook MUST follow one of these 5 formats — no exceptions:

1. CONTRADICTION:
   "You think X, but actually Y"
   Example: "You think posting daily helps — it kills your reach"

2. HIDDEN_TRUTH:
   "Most people don't know that X"
   Example: "Small accounts outsell big ones 3 to 1"

3. MECHANISM:
   "The reason X happens is..."
   Example: "The algorithm buries your best posts on purpose"

4. EXTREME:
   "X is more/less than you think — here's why"
   Example: "Your content calendar is doing more harm than good"

5. THREAT:
   "You're probably wrong about X"
   Example: "Everything you learned about hashtags is outdated"

RULES (non-negotiable):
- Maximum 12 words per hook. Shorter is better.
- No generic words: "explore", "interesting", "discover", "amazing", "incredible", "journey"
- Every hook must create curiosity or tension — the reader must NEED to know more
- Must feel like a social media hook, NOT an article title or blog headline
- No emojis, no excessive punctuation
- No "How to", "5 tips", "Did you know", "Unpopular opinion"
- Each hook must be specific to the topic — nothing generic
- Vary the formats across all 5 types

OUTPUT: Return a JSON object with this exact structure:
{
  "hooks": [
    { "hook": "the hook text", "format": "contradiction" | "hidden_truth" | "mechanism" | "extreme" | "threat" }
  ]
}

Generate exactly ${count} hooks. Every hook must be unique.`;
}

// ─── STEP 2: Score hooks ─────────────────────────────────────

export function buildHookScoringV2Prompt(hooks: string[], contentMode: TopicContentMode): string {
  const hookList = hooks.map((h, i) => `  ${i + 1}. "${h}"`).join('\n');

  const factPenaltyClause = contentMode === 'fact'
    ? `
CRITICAL — NEWS PENALTY (fact-topic mode):
This is a FACT-BASED evergreen topic. Any hook that sounds like a news headline,
references a recent event, mentions a date, location-based sighting, birth, return,
reintroduction, or uses phrases like "scientists just", "new study", "for the first time"
must receive curiosityGap = 0 and novelty = 0. These are NOT fact hooks — they are
news hooks and must be penalized to totalScore < 10.`
    : '';

  return `You are a social media content strategist. Score each hook on 5 dimensions.

HOOKS TO SCORE:
${hookList}
${factPenaltyClause}

SCORING CRITERIA (0-5 scale for each):

1. curiosityGap (0-5):
   How strongly does the hook make you NEED to know more?
   0 = no gap, 5 = impossible to scroll past

2. clarity (0-5):
   Is the hook instantly understandable in under 2 seconds?
   0 = confusing, 5 = crystal clear

3. novelty (0-5):
   Does this feel fresh, or is it a recycled take?
   0 = seen a thousand times, 5 = never heard this before

4. emotionalTrigger (0-5):
   Does it provoke fear, surprise, anger, or excitement?
   0 = no emotion, 5 = visceral reaction

5. specificity (0-5):
   Does it reference concrete things (numbers, tools, scenarios)?
   0 = vague and abstract, 5 = razor-specific

Also compute: totalScore = curiosityGap + clarity + novelty + emotionalTrigger + specificity

Be strict. Most hooks should score 12-18. Only exceptional hooks score 20+. Generic hooks should score below 12.

OUTPUT: Return a JSON object with this exact structure:
{
  "hooks": [
    {
      "hook": "the hook text",
      "scores": {
        "curiosityGap": number,
        "clarity": number,
        "novelty": number,
        "emotionalTrigger": number,
        "specificity": number,
        "totalScore": number
      }
    }
  ]
}

Score ALL ${hooks.length} hooks. Maintain the original text exactly.`;
}

// ─── STEP 4: Refine top hooks ────────────────────────────────

export function buildHookRefinementV2Prompt(hooks: string[], contentMode: TopicContentMode): string {
  const hookList = hooks.map((h, i) => `  ${i + 1}. "${h}"`).join('\n');

  const factConstraint = contentMode === 'fact'
    ? `
CRITICAL — EVERGREEN FACT MODE:
These hooks are for a fact-based educational channel. When refining:
- Keep the hook about a TIMELESS, verifiable fact
- Do NOT add any news framing, dates, locations, or recent events
- Do NOT turn a fact hook into a news headline
- The refined hook must still be true 10 years from now
- Focus on making the fact MORE surprising, not more timely`
    : '';

  return `You are an elite hook editor. Your job: make good hooks GREAT.

HOOKS TO REFINE:
${hookList}
${factConstraint}

For each hook, rewrite it to be:
- SHORTER — cut every unnecessary word
- SHARPER — make the tension hit harder
- MORE SURPRISING — flip expectations
- MORE SCROLL-STOPPING — the reader physically cannot keep scrolling

RULES:
- Maximum 12 words. Aim for 6-9.
- The rewrite must be meaningfully different — not a minor word swap
- Keep the core insight but deliver it with more impact
- No generic words: "explore", "interesting", "discover", "amazing"
- Must create immediate curiosity or tension

OUTPUT: Return a JSON object with this exact structure:
{
  "hooks": [
    {
      "original": "the original hook text",
      "improved": "the refined hook text"
    }
  ]
}

Refine ALL ${hooks.length} hooks. Preserve the "original" text exactly as provided.`;
}

// ─── LLM Fact-Hook Validator ─────────────────────────────────

export function buildFactHookValidatorPrompt(hooks: string[]): string {
  const hookList = hooks.map((h, i) => `  ${i + 1}. "${h}"`).join('\n');

  return `You are a strict fact-hook validator. Your ONLY job is to judge whether each hook qualifies as a valid evergreen fact hook. You do NOT generate hooks — you only judge.

HOOKS TO VALIDATE:
${hookList}

DEFINITION — A valid evergreen fact hook MUST be:
- Based on a timeless, verifiable fact (true 10 years ago, true 10 years from now)
- Fact-led: the hook states or strongly implies a concrete factual claim
- Evergreen: not tied to any recent event, moment, discovery, or time period
- Not a news headline, not editorial commentary, not a story or narrative

REJECT any hook that is:
- A news or event hook ("Scientists just discovered...", "X returns to Y")
- A narrative or story hook ("The viral moment that...", "The story of...")
- Editorial or clickbait framing ("The controversial truth about...", "X revealed")
- Person-led or organization-led ("Elon Musk's...", "NASA's plan to...")
  Exception: A person or org can appear IF the fact itself is timeless and scientific
  (e.g. "Newton's laws govern every object" is fine; "Newton's controversial feud" is not)
- Not timeless — references a date, year, "recently", "latest", "new study"
- Too generic to stand as a strong fact hook ("Animals are cool", "Nature is wild")
- Not fact-based — it's an opinion, question-only, or motivational statement

VERDICT RULES:
- "accept": clearly a valid evergreen fact hook. Confidence >= 0.8.
- "reject": clearly fails one or more criteria. Set isValidFactHook = false and provide failReason.
- "borderline": could go either way — partially factual but with weak framing or slight editorial tone. Confidence 0.4-0.7.

failReason must be one of:
  "news_event" | "story_narrative" | "editorial_framing" | "person_or_org_led" | "not_timeless" | "too_generic" | "not_fact_based"
Set failReason to null ONLY for "accept" verdicts. For "borderline", provide the closest failReason.

Be STRICT. When in doubt, reject. It is better to lose a borderline hook than to let a bad one through.

OUTPUT: Return a JSON object with this exact structure:
{
  "hooks": [
    {
      "hook": "the exact hook text",
      "isValidFactHook": true/false,
      "verdict": "accept" | "reject" | "borderline",
      "failReason": "news_event" | "story_narrative" | "editorial_framing" | "person_or_org_led" | "not_timeless" | "too_generic" | "not_fact_based" | null,
      "confidence": 0.0 to 1.0,
      "explanation": "1-sentence reason for the verdict"
    }
  ]
}

Validate ALL ${hooks.length} hooks. Preserve the "hook" text exactly as provided.`;
}

import type { MinedFact, ExpandedFact, CarouselMode } from '@/lib/validation/schemas';
import type { TopicDomainStyle } from '@/lib/utils/topic-classifier';

type ComposeFact = MinedFact | ExpandedFact;

interface ComposePromptParams {
  topic: string;
  hook: {
    text: string;
    type: string;
  };
  selectedFacts: ComposeFact[];
  memory?: {
    tone?: string;
    aggressionLevel?: number;
    style?: string;
    avoidPatterns?: string[];
    forbiddenWords?: string[];
  };
  /** Carousel mode — used for mode-specific prompt sections. */
  mode?: CarouselMode;
  /** The specific entity or theme for this carousel. */
  concept?: string;
  /** Domain style — narrative (mythology/history) vs informational (animals/science). */
  domainStyle?: TopicDomainStyle;
  /** Layout — BOLD produces shorter, punchier text for big-type rendering. */
  layout?: 'DETAILED' | 'BOLD';
}

function hasExpansion(fact: ComposeFact): fact is ExpandedFact {
  return 'expansion' in fact && typeof fact.expansion === 'string';
}

export function buildComposePrompt({
  topic,
  hook,
  selectedFacts,
  memory,
  mode,
  concept,
  domainStyle,
  layout,
}: ComposePromptParams): string {
  const factList = selectedFacts.map((f, i) => {
    const expansionLine = hasExpansion(f) ? `\n  expansion: ${f.expansion}` : '';
    return `FACT ${i + 1}:
  claim: ${f.claim}
  evidence: ${f.evidence}${expansionLine}
  entities: ${f.entities.join(', ')}
  has_number: ${f.has_number}
  source: ${f.source_type}${f.fact_ref ? `\n  fact_ref: ${f.fact_ref}` : ''}`;
  }).join('\n\n');

  const factCount = selectedFacts.length;
  const slideCount = factCount + 3; // OPENER + N FACTs + IMPLICATION + CTA

  const memoryBlock = memory
    ? `
═══════════════════════════════════════════
CHANNEL CONSTRAINTS
═══════════════════════════════════════════

- Tone: ${memory.tone ?? 'Not set'}
- Aggression level: ${memory.aggressionLevel ?? 'Not set'}/10
- Style: ${memory.style ?? 'Not set'}
- Avoid these patterns: ${memory.avoidPatterns?.join(', ') ?? 'None'}
- Forbidden words: ${memory.forbiddenWords?.join(', ') ?? 'None'}
`
    : '';

  const domainStyleBlock = domainStyle === 'informational' ? `
═══════════════════════════════════════════
DOMAIN STYLE: INFORMATIONAL
═══════════════════════════════════════════

This is an INFORMATIONAL topic (animals, science, nature, space, etc.).

WRITING RULES FOR INFORMATIONAL DOMAINS:
- Each FACT slide should have 1 strong factual headline + 1–2 explanatory sentences
- Explain the surprising MECHANISM, BEHAVIOR, or TRAIT — the HOW and WHY
- Use concrete, visualizable detail the reader can picture
- Do NOT force narrative storytelling (no setup → action → consequence arcs)
- Do NOT use myth-style drama ("Its tail cuts through water swiftly")
- Do NOT use forced escalation ("Becomes ocean's efficient predator")
- The tone should be direct, clear, and informational — like a nature documentary narrator

GOOD informational slide body:
"Shortfin mako sharks can reach 45 mph in short bursts. Their crescent-shaped tail generates
twice the thrust of other shark species, letting them chase down tuna in open ocean sprints."

BAD informational slide body (forced narrative):
"Its tail cuts through water swiftly. Catches fast prey easily. Becomes ocean's efficient predator."
` : domainStyle === 'narrative' ? `
═══════════════════════════════════════════
DOMAIN STYLE: NARRATIVE
═══════════════════════════════════════════

This is a NARRATIVE topic (mythology, history, crime, legendary events).

WRITING RULES FOR NARRATIVE DOMAINS:
- Use micro-story format where natural: setup → action → consequence
- Seek the PEAK MOMENT — the single dramatic instant
- Use strong action verbs, not passive description
- Include stakes: what was risked, lost, or transformed
- Punishment, reversal, or transformation makes the ending land
` : '';

  return `You are a carousel fact engine. You produce Instagram carousel slides where every slide teaches something concrete. You are not a storyteller. You are not a copywriter. You are a curator of specific, surprising, verifiable knowledge.

TASK: Write a ${slideCount}-slide carousel about "${topic}".

OPENER TO BUILD FROM:
"${hook.text}" (type: ${hook.type})
${domainStyleBlock}

═══════════════════════════════════════════
SELECTED FACTS (your raw material)
═══════════════════════════════════════════

These ${factCount} facts have been pre-selected and expanded for quality. Each fact includes:
- claim: the core factual statement
- evidence: supporting detail
- expansion: a rich, 2–3 sentence explanation with mechanism, context, and surprising details

Your job is to turn each one into a well-written slide. USE THE EXPANSION as the primary
source material for each FACT slide's body. The expansion contains the depth and insight
that makes each slide valuable — do not fall back to just the short claim or evidence.

Do NOT invent new facts. Do NOT ignore any of these facts.
Write one FACT slide per fact below, in the order given.

${factList}

${layout === 'BOLD' ? `
═══════════════════════════════════════════
BOLD LAYOUT — SHORT, PUNCHY TEXT
═══════════════════════════════════════════

This carousel uses the BOLD layout: each slide shows a full-bleed image with ONLY a big,
centered headline overlaid on top. There is NO paragraph body visible to the reader.

WRITING RULES FOR BOLD LAYOUT:
- The HEADLINE is the entire slide. It must hit in under 1 second.
- Headlines: 20–60 characters, target 4–8 WORDS (not 3).
- Body: Write ONE sentence only (50–100 chars). This backup context is used for
  caption generation but is NOT rendered on the slide. Keep it minimal.
- Prefer: numbers, named entities, concrete comparisons, strong verbs
- Avoid: setup phrases, hedge words ("some", "many"), vague generalities

═══════════════════════════════════════════
CRITICAL: THE VERB RULE (strict, no exceptions)
═══════════════════════════════════════════

EVERY Bold headline MUST contain at least one ACTION VERB. Not a preposition. Not a
copula pretending to be a verb. An actual verb carrying the claim.

ACCEPTABLE verbs (carry the claim): mentioned, sold, killed, pump, stops, survived,
 swallowed, broke, destroyed, discovered, crafted, used, detected, produces, lived,
 fears, became, reaches, outlasts, defeated, turned

NOT acceptable as the sole "verb":
  - Prepositions: in, of, on, at, for, with, from, by, about, as
  - Copulas alone (is/are/was/were) when they just link two nouns without action
  - Possessives: "X's Y" is just a noun phrase, no claim
  - Colons: "X: Y" labels X with Y — zero claim

THE PARSE TEST (apply to every headline before writing it):
Say the headline out loud. Could you put it on its own slide and understand what
happened / what is true? If it reads like the name of a Wikipedia section header
or a book chapter title, it's a LABEL and must be rewritten.

LABEL PATTERNS TO REJECT (these ALL failed real generations — do NOT produce them):

  ✗ "X in Y"                  (e.g. "Unicorns in the King James Bible")
     → Tells you the topic intersects Y. Doesn't tell you what.
     ✓ "The Bible Mentions Unicorns 9 Times"

  ✗ "X: Y"                    (e.g. "Alicorns: Medieval Poison Deterrents")
     → Colon label. X is being CLASSIFIED as Y. No claim.
     ✓ "Medieval Goblets Used Alicorn Horns to Detect Poison"

  ✗ "X as Y"                  (e.g. "Narwhal Tusks as Unicorn Horns")
     → Equivalence. States X equals Y. Inert.
     ✓ "Narwhal Tusks Were Sold as Unicorn Horns"

  ✗ "X of Y"                  (e.g. "Qilin: Eastern Unicorn of Prosperity")
     → Classification. No claim. Same problem as colon.
     ✓ "China's Unicorn Is a Qilin — It Brings Prosperity"

  ✗ "X's [adjective] Y"       (e.g. "Zeus's Unique Birth of Athena")
     → Teases but doesn't deliver.
     ✓ "Athena Sprang Fully Armored From Zeus's Skull"

  ✗ "X's Failed/Hidden/Secret Y" (e.g. "Zeus's Failed Prophecy Thwart")
     → Tease + possessive = no claim.
     ✓ "Zeus Swallowed Metis to Stop the Prophecy"

  ✗ "[Topic] Facts You Didn't Know"   (clickbait, zero claim)

If a headline matches ANY label pattern above, it is broken. Rewrite it into subject + verb + object.

BOLD HEADLINE PATTERNS THAT WORK:
  Subject + action verb + object: "Zeus Swallowed Metis Whole"
  Subject + happens/happened: "Athena Sprang From Zeus's Skull"
  Subject + number + verb: "A Single Cow Drinks 50 Gallons a Day"
  Subject + negation verb: "Honey Never Spoils"
  Subject + comparison verb: "Cleopatra Lived Closer to the iPhone Than the Pyramids"
  Subject + consequence verb: "Zeus Became What He Feared"

FINAL SELF-CHECK before returning each FACT headline (BOLD layout):
  STEP 1 — Underline the verb in your headline. If you can't point to one, REWRITE.
  STEP 2 — Does the verb carry the claim (something happened / is true)? If the only
           "verb" is a preposition or a bare copula, REWRITE.
  STEP 3 — Is the headline a complete sentence you could say aloud without it feeling
           like a book-chapter heading? If not, REWRITE.

${mode === 'single_entity' ? `BOLD + SINGLE_ENTITY — SEQUENTIAL HEADLINES (critical):
Because the carousel answers ONE question about ONE subject, headlines must chain into a
single flowing explanation. Read as spoken-word narration, one short line at a time.

Each FACT headline is a beat in the story, NOT a standalone statement. The reader should feel
like they're being walked through an answer step by step.

GOOD sequence (topic: why octopuses have 3 hearts):
  OPENER: "Octopuses Have 3 Hearts"
  FACT 1: "Two Pump Blood to the Gills"
  FACT 2: "One Pumps to the Body"
  FACT 3: "The Body Heart Stops When They Swim"
  FACT 4: "So They Mostly Crawl Instead"
  IMPLICATION: "A Heart That Pauses Is a Tradeoff"
  → Each line is short, each one needs the previous to feel complete. The sequence TELLS A STORY.

BAD sequence (disconnected factoids — what we DON'T want):
  OPENER: "Why Octopuses Have More Hearts"
  FACT 1: "Octopus Hearts Beat 180 Times a Minute"  ← random stat, doesn't answer
  FACT 2: "Octopuses' Three-Heart System"            ← just labels it
  FACT 3: "Greeks Noticed Octopus Blue Blood"        ← tangent
  → Each headline is independent. No story. No reason to swipe.

Test each FACT headline: does removing it break the flow between its neighbors? If not, rewrite it.
` : `BOLD + THEMATIC_COLLECTION — STANDALONE HEADLINES:
Each slide features a DIFFERENT specific item from the theme. Headlines are self-contained —
each one works as an isolated poster. No narrative chain needed.

GOOD (topic: animals with unusual defenses):
  OPENER: "5 Animals That Fight Back With Chemistry"
  FACT 1: "Bombardier Beetles Spray 100°C Acid"
  FACT 2: "Hagfish Drown Predators in Slime"
  FACT 3: "Texas Horned Lizards Shoot Blood From Their Eyes"
`}

GOOD BOLD headlines (general):
  ✓ "Honey Found in 3,000-Year-Old Tombs — Still Edible"
  ✓ "A Single Cow Drinks 50 Gallons a Day"
  ✓ "Cleopatra Lived Closer to the iPhone Than the Pyramids"

BAD BOLD headlines (too long, need context, or vague):
  ✗ "The Fascinating Reason Why Ancient Egyptian Honey Never Goes Bad" — too long
  ✗ "Its Unique Properties Make This Possible" — needs context
  ✗ "Nature Has Incredible Preservation Methods" — vague, no specifics
` : ''}
═══════════════════════════════════════════
SLIDE STRUCTURE (exactly ${slideCount} slides)
═══════════════════════════════════════════

Slide 0 — OPENER
  headline: 20–80 characters. This is the THUMBNAIL — the specific angle title for this carousel.

  The OPENER must be DERIVED from the hook and concept — NOT the topic name slotted into a generic template.

  Your anchor material:
  - Hook: "${hook.text}" (type: ${hook.type})
  ${concept ? `- Concept: "${concept}"` : ''}

  The hook captures the specific surprising angle of this carousel. Your OPENER headline must
  make that angle visible — not promise a generic collection of facts about the subject.

  OPENER PATTERNS (pick ONE that best fits the hook's angle):

  PATTERN A — Specific event or discovery:
     Name the actual thing that happened or was revealed.
     e.g. "The Night Prince Lost a Year of Unreleased Music"

  PATTERN B — Provocative question from the angle:
     "[Subject]: [specific question the facts answer]?"
     e.g. "Prince: Did One Flood Destroy His Greatest Work?"

  PATTERN C — Myth-busting on a specific aspect:
     "Everything You Think About [Subject]'s [specific aspect] Is Wrong"
     e.g. "Everything You Think About Prince's Studio Is Wrong"

  PATTERN D — Curiosity pull tied to concept:
     "[Subject]'s [specific thing] — Not What You'd Expect"
     e.g. "Prince's Secret Vault — Not What You'd Expect"

  PATTERN E — Direct intrigue from the hook:
     "Why [Subject] [surprising verb phrase from the hook angle]"
     e.g. "Why Prince Kept His Flood Recordings a Secret"

  ALL PATTERNS must follow these rules:
  1. MUST reflect the hook's specific angle — not just name the topic broadly
  2. Readable in under 1 second at phone width — aim for 6–10 words
  3. Do NOT use vague action words: "Discover", "Explore", "Uncover", "Find out", "Learn"
  4. Do NOT use clickbait phrases like "You won't believe" or "What they don't tell you"

  AVOID:
     ✗ "Discover Prince's Studio Disaster Impact" — vague verb + no specific angle
     ✗ "Prince: 4 Amazing Facts You Didn't Know" — ignores the hook, generic count title
     ✗ "The Most Fascinating Things About Prince" — no angle, could be any carousel about Prince
     ✓ "The Night Prince's Studio Flooded and Erased His Vault" — angle-specific, vivid

  body: Always empty string for OPENER.
  The OPENER body must be "" (empty string). All context comes from the headline.

Slides 1–${factCount} — FACT (exactly ${factCount})
  headline: 20–100 characters. A specific claim. Not a category label like "The history" or "Fun fact #3".

  HEADLINE SELF-CONTAINMENT (critical):
  The headline must be understandable by someone who knows NOTHING about the topic.
  If the headline references a proper noun, technical term, or unfamiliar concept,
  it must include enough context to explain what it is.

  Pass the "solo post test": would this headline make sense if posted alone with no carousel context?
     ✗ "Codex Leicester Sold for $30.8 Million" — reader has no idea what Codex Leicester is
     ✓ "Da Vinci's Notebook Sold for $30.8 Million" — instantly clear who and what
     ✗ "The Antikythera Mechanism Predicted Eclipses" — unfamiliar proper noun, no context
     ✓ "A 2,000-Year-Old Greek Computer Predicted Eclipses" — self-explanatory
     ✗ "Scoville Units Measure 2.2 Million" — what are Scoville units?
     ✓ "The World's Hottest Pepper Scores 2.2 Million on the Heat Scale" — clear

  body: ${layout === 'BOLD' ? '50–100 characters. ONE sentence only — backup context for captions, NOT rendered on the slide.' : '200–400 characters. The evidence, mechanism, example, or context that makes the headline land. USE the expansion text provided — it contains the depth and insight each slide needs. Do NOT compress or summarize it down.'}
  supportingDetail: Optional. A single stat, quote, date, or named reference that anchors the body.

Slide ${factCount + 1} — IMPLICATION
  headline: 20–100 characters. The "so what" — what changes in the reader's understanding.
  body: 50–400 characters. Synthesize across 2+ facts from the carousel. Not a CTA. Not motivation.
  MUST NOT start with "From X to Y" or list facts — state a specific CONCLUSION that only
  makes sense after reading the facts. The implication should feel like a new insight, not a summary.

  CONCRETENESS FLOOR — the implication headline MUST include at least ONE of:
  - A number or measurement ("10% less", "3,000 years", "2x faster")
  - A named entity (species, person, place, substance — not the broad topic name)
  - A strong comparison ("outlasts X", "heavier than Y", "older than Z")
  If the headline contains none of these, it is too abstract. Rewrite it.
     ✗ "Nature's Preservation Methods Are Remarkable" — no anchor, pure fluff
     ✗ "These Animals Are More Complex Than We Think" — vague, could apply to anything
     ✓ "Isolated Cows Produce 10% Less Milk" — number + entity + surprise
     ✓ "Tardigrades Outlast Dolphins Underwater" — two entities + comparison

  SYNTHESIS APPROACHES — use whichever produces the strongest, most natural statement:
  - INVERSION: If [Fact A] and [Fact B] are both true, then [common belief] is wrong
  - SCALE SHIFT: [Fact A] alone is surprising — combined with [Fact B], the scale becomes [X]
  - HIDDEN CONNECTION: [Fact A] and [Fact B] seem unrelated but both prove [non-obvious principle]
  - REFRAME: Given [Facts], what we call [common label] is actually [new label]
  These are thinking tools, not templates. Do NOT announce which approach you used.
  Do NOT force a pattern if stating the conclusion directly is stronger.
  The goal is a concrete, specific, non-obvious takeaway — however you get there.

  ANTI-RESTATEMENT:
  The implication should NOT simply repeat the hook or restate a single fact with slightly
  better wording. Prefer a takeaway that emerges from combining 2+ facts.
  However — if the strongest possible line is a refined version of a fact, allow it, but
  ONLY if it becomes significantly more concrete, surprising, or specific than the original.

  Test: Does the implication feel like "the same idea, reworded"? → too weak, rewrite.
        Does it feel like a deeper or stronger conclusion? → acceptable.
     ✗ Hook: "Honey never spoils" → Implication: "Honey Outlasts 3,000-Year-Old Tombs" — same idea restated
     ✓ Hook: "Honey never spoils" → Implication: "Egypt Had Germ Theory 3,400 Years Before Europe" — new conclusion from combining mold + honey + surgical texts
     ✗ Hook: "Your brain decides early" → Implication: "Brain Acts 550ms Before We Decide" — same claim, more precise number
     ✓ Hook: "Your brain decides early" → Implication: "Free Will May Be a 550ms Afterthought" — reframes the meaning

Slide ${factCount + 2} — CTA
  headline: 20–80 characters. A channel follow prompt that references this carousel's topic.
  body: 20–100 characters. A direct follow/save call-to-action.

  Generate a CTA that feels earned by THIS carousel's content — not a generic "follow for facts."
  Reference the specific topic, concept, or angle so it feels relevant to what was just shared.

  RULES:
  - MUST include an action verb: follow, save, share, comment, subscribe
  - MUST NOT introduce new factual claims, numbers, dates, or comparisons
  - MUST NOT use these banned phrases: "follow us for more", "don't forget to like",
    "share this post", "hit the follow button", "smash that follow", "save this for later"
  - Keep it brief and direct

  GOOD examples (for a carousel about Prince's studio flood):
  ✓ headline: "More music secrets — follow to keep learning"
     body: "Follow for more stories artists never wanted public"
  ✓ headline: "Save this — more untold music history every week"
     body: "Follow if you love discovering what really happened"

  BAD examples:
  ✗ "We post only interesting facts!" — generic, ignores the topic
  ✗ "Follow us to get fresh facts everyday" — could be any channel, zero topic connection

═══════════════════════════════════════════
WHAT MAKES A SLIDE HIGH-VALUE
═══════════════════════════════════════════

Every FACT slide must contain at least ONE of these value signals in its body:

1. A NUMBER WITH CONTEXT
   ✓ "Tesla produced 1.8M cars in 2023 — more than BMW, Mercedes, and Audi combined"
   ✗ "Tesla produces a lot of cars"

2. A COMPARISON
   ✓ "Rome's Colosseum held 50,000 spectators — the same capacity as Yankee Stadium"
   ✗ "The Colosseum was very large"

3. A SCALE REFERENCE
   ✓ "The Great Pacific Garbage Patch is twice the size of Texas"
   ✗ "There is a lot of garbage in the ocean"

4. HISTORICAL CONTEXT
   ✓ "Coffee was banned 5 times in history — the last time was Sweden in 1756"
   ✗ "Coffee has a long and interesting history"

5. AN UNEXPECTED MECHANISM
   ✓ "Honey never spoils because its low moisture content starves bacteria"
   ✗ "Honey has unique properties"

6. A NAMED ENTITY + SPECIFIC DETAIL
   ✓ "Wilt Chamberlain averaged 48.5 minutes per game in 1962 — games are only 48 minutes long"
   ✗ "Some basketball players played a lot of minutes"

7. A CONCRETE IMPLICATION OF A FACT
   ✓ "Octopuses have 3 hearts — one stops when they swim, which is why they prefer crawling"
   ✗ "Octopuses are fascinating creatures"

If a slide body contains none of these signals, the slide is invalid. Do not produce it.

═══════════════════════════════════════════
WHAT IS FORBIDDEN
═══════════════════════════════════════════

VAGUE SLIDES — could apply to 3+ unrelated topics:
  ✗ "There are hidden truths most people never discover"
  ✗ "The real story is more complex than you think"
  ✗ "Everything is about to change"
  Test: Replace the topic noun with a different topic. If the slide still reads fine, it is vague. Reject it.

GENERIC LANGUAGE — appears in thousands of carousels:
  ✗ "game changer", "level up", "mindset shift", "wake up call"
  ✗ "most people don't know", "nobody talks about", "here's the truth"
  ✗ "the secret is", "what they don't tell you", "you need to understand"

FILLER SLIDES — exist to connect other slides, not to deliver value:
  ✗ "But that's not the whole story"
  ✗ "And it gets even more interesting"
  ✗ "Let's break this down"
  ✗ Any slide whose body references "the previous point" or "as we saw"
  Test: If the slide is removed and the carousel still makes sense, the slide was filler.

META-COMMENTARY — sentences that describe the fact instead of adding to it:
  ✗ "This fact highlights the importance of..."
  ✗ "This strange event showcases..."
  ✗ "This achievement underscores..."
  ✗ "This is a testament to..."
  ✗ Any sentence starting with "This [noun] shows/highlights/illustrates/demonstrates"
  Every sentence in the body must add NEW information. Do not end with a sentence that
  comments on the fact, restates its significance, or reflects on what it means abstractly.
  If your last sentence starts with "This", delete it and add another concrete detail instead.

ABSTRACT FLUFF — more feeling than fact:
  ✗ Bodies dominated by: truth, journey, power, meaning, discover, transform, evolve, reveal, imagine
  ✗ SPECIFICALLY BANNED: "power", "energy", "duality", "balance", "harmony", "essence", "force", "spirit", "aura", "vibration", "synergy", "cosmic"
  These words almost NEVER add factual value. If a slide needs them, it is too abstract. Rewrite with a concrete mechanism, number, or named entity instead.
  Test: If more than 40% of the body's content words are abstract, the slide fails.

PLACEHOLDER HEADLINES — category labels instead of claims:
  ✗ "The history", "Another example", "Here's the thing", "Fun fact"
  ✓ Headlines must make a specific claim that the body then supports.

TOPIC-NAME ECHOING — do not start body text with the topic name or a rephrasing of it:
  ✗ "Good news from Finland: In 2023, it was ranked..."
  ✗ "AI facts show that..."
  ✗ "A strange historical fact is that..."
  ✓ Start bodies with the actual content, not with the topic as a prefix.
  The reader already knows the topic from the carousel context.

═══════════════════════════════════════════
TOPIC LOCK
═══════════════════════════════════════════

- ALL content must stay within: ${topic}
- Every FACT slide must contain at least one entity, name, number, or detail specific to ${topic}
- If a slide could appear in a carousel about a completely different topic, reject it and write a new one
- ANGLE SELECTION: If "${topic}" is broad (e.g., "Greek mythology", "World War II", "Space"),
  you MUST select a clear, specific angle BEFORE writing any slides. The OPENER must reflect
  that angle explicitly. Do NOT try to cover the entire topic — pick ONE surprising corner.
  ✗ "Greek Mythology Facts" → too broad, no angle
  ✓ "Cerberus Had a Day Job — and It Wasn't Guarding the Underworld" → specific angle on one entity
  ✗ "World War II Facts" → too broad
  ✓ "The Pigeon That Saved 194 Soldiers in WWI" → specific story, specific angle
${mode === 'single_entity' && concept ? `
═══════════════════════════════════════════
ENTITY LOCK (non-negotiable)
═══════════════════════════════════════════

This carousel is entirely about: ${concept}
- Reference "${concept}" by name or recognizable shorthand (e.g., pronoun, abbreviation, "the hat")
  in most slides. You do not need to repeat the full name in every body — natural writing uses
  pronouns and shorthands after the first mention.
- Do NOT include facts about other entities within "${topic}" unless they directly involve "${concept}"
- The OPENER must frame the carousel around "${concept}" specifically, not "${topic}" broadly

═══════════════════════════════════════════
NARRATIVE CONTINUITY (critical for single_entity)
═══════════════════════════════════════════

The FACT slides must form a SEQUENTIAL EXPLANATION, not a list of disconnected facts.
The OPENER poses a question or promise. Each FACT slide delivers ONE step of the answer,
building directly on the previous slide. The final FACT (or IMPLICATION) lands the payoff.

STRUCTURE:
  OPENER → sets up the question
  FACT 1 → the foundational claim (the "what")
  FACT 2 → builds on FACT 1 (the first "why" or mechanism step)
  FACT 3 → builds on FACT 2 (the consequence or next step)
  FACT 4 (if present) → the twist, detail, or final mechanism
  IMPLICATION → the payoff / what this all means

CONNECTIVE LANGUAGE — each FACT slide after the first should naturally flow from the previous.
  Use framing like: "This is because...", "As a result...", "And here's the twist...",
  "But something changes when...", "Which means...", "The trick is...", numbered steps ("First...", "Then..."),
  or cause-effect pairs. The headline itself can imply the chain without needing the connective word.

SELF-CHECK (critical):
  Read the FACT headlines in order. Does each one FOLLOW from the previous? Would removing
  slide N break the flow between N-1 and N+1?
    ✓ YES — slides are linked, good
    ✗ NO (they're independent factoids) — rewrite

GOOD narrative sequence (topic: "Why octopuses have 3 hearts"):
  OPENER: "Why Octopuses Have 3 Hearts"
  FACT 1: "Two pump blood to the gills" ← the foundational what
  FACT 2: "The third pumps to the rest of the body" ← builds on #1
  FACT 3: "But the body heart stops when they swim" ← the twist
  FACT 4: "That's why octopuses mostly crawl" ← the consequence
  IMPLICATION: "A heart that pauses is a design tradeoff" ← payoff

BAD sequence (what we want to AVOID — disconnected factoids):
  OPENER: "Why Octopuses Have More Hearts"
  FACT 1: "Octopus hearts beat 180 times a minute" ← random stat, doesn't answer "why"
  FACT 2: "Octopuses' three-heart system" ← just names it, adds nothing new
  FACT 3: "Greeks noticed octopus blue blood" ← historical tangent, off-angle

SLIDE-SPECIFIC topicEntity (critical for distinct images):
  Even though the subject is "${concept}" throughout, each FACT slide's topicEntity must describe
  the SPECIFIC ASPECT shown in THAT slide — not the overall subject. This drives image generation
  so each slide gets a distinct image.

    ✗ All slides: topicEntity = "${concept}"  (produces identical images)
    ✓ FACT 1: "${concept} gills with blood vessels visible"
    ✓ FACT 2: "${concept} systemic heart in body cavity"
    ✓ FACT 3: "${concept} swimming in open water"
    ✓ FACT 4: "${concept} resting on rocks"

  The topicEntity must be a photographable noun phrase, not the raw concept name.
` : ''}${mode === 'thematic_collection' && concept ? `
═══════════════════════════════════════════
THEME LOCK (non-negotiable)
═══════════════════════════════════════════

This carousel is a themed collection: "${concept}"
- Each FACT slide must feature a DIFFERENT specific item that fits the theme
- Every slide must clearly connect to the theme — the body should explain HOW or WHY
  that item fits "${concept}", not just describe the item generally
- topicEntity for each FACT slide must be the specific item featured (e.g., "Bananas",
  "Brazil nuts"), NOT the theme itself and NOT the broad topic "${topic}"
- No two slides may feature the same item
- The OPENER must frame the collection theme, not any single item
` : ''}${memoryBlock}
═══════════════════════════════════════════
SLIDE INDEPENDENCE RULE
═══════════════════════════════════════════

Every FACT slide must pass this test:

  "If I extract this slide, put it on a plain background, and post it alone —
   does it teach something? Would someone screenshot and share it?"

If the answer is no, the slide is not ready.

The OPENER creates curiosity. The IMPLICATION creates meaning. The CTA drives the follow.
The ${factCount} FACT slides between OPENER and IMPLICATION must each earn their place independently.

═══════════════════════════════════════════
SELF-CHECK (run before returning output)
═══════════════════════════════════════════

Before returning your JSON, verify each slide against this checklist:

□ OPENER: Does the headline reflect the hook's specific angle — not just the topic name?
□ OPENER: Does it avoid vague action verbs like "Discover", "Explore", "Uncover"?
□ OPENER: Does it feel like a carousel cover tied to THIS angle, not a generic title?
□ OPENER: Is it 6–10 words and readable in under 1 second?
□ OPENER: Is the body an empty string?

For each FACT slide (1–${factCount}):
  □ Does the headline make a specific claim (not a label)?
  □ Does the body contain at least 1 of the 7 value signals?
  □ Does the body contain at least 1 named entity, number, or date?
${layout === 'BOLD' ? `  □ VERB CHECK — can you underline an action verb in the headline? (not a preposition, not a bare copula)
  □ Does the headline match ANY of these label patterns? If yes, REWRITE: "X in Y", "X: Y", "X as Y", "X of Y", "X's [adjective] Y"
  □ Would the reader understand the full fact from the headline alone (no body needed)?
  □ Is the headline 4–8 words (not 3, not a one-word label)?
  ` : ''}${mode === 'single_entity'
  ? `  □ Does this FACT build on the previous slide? Is there narrative continuity?\n  □ If you removed this slide, would slide N-1 and slide N+1 still flow naturally? (should be NO — slides must be linked)\n  □ Is topicEntity a SLIDE-SPECIFIC aspect (e.g., "octopus gills with blood vessels"), NOT the bare subject name?`
  : `  □ Would this slide make sense posted alone, out of context?\n  □ Is topicEntity the SPECIFIC entity (e.g., "AlphaFold"), not the topic name (e.g., "AI")?\n  □ Is this slide's FEATURED ITEM different from every other slide (collection mode)?`}
  □ Is the body between ${layout === 'BOLD' ? '50 and 100' : '200 and 400'} characters?
  □ Does the body end with a factual sentence, not meta-commentary like "This achievement marks..."?

□ IMPLICATION: Does the headline contain a number, named entity, or strong comparison?
□ IMPLICATION: Does it synthesize 2+ specific facts into a NON-OBVIOUS conclusion?
□ IMPLICATION: Is it a concrete insight, not a CTA or motivational line?
□ IMPLICATION: Could it NOT be written without the preceding facts?
□ IMPLICATION: Is it MORE than the hook or a single fact reworded? (anti-restatement check)
□ IMPLICATION: Would someone screenshot this slide and send it to a friend?

□ CTA: Does the headline or body reference the carousel's topic or angle?
□ CTA: Does it include an action verb (follow, save, share, subscribe)?
□ CTA: Does it avoid banned generic phrases (e.g. "follow us for more", "don't forget to like")?
□ CTA: Is the body between 20 and 100 characters?

If any check fails, fix that slide before returning.

═══════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════

Return exactly this JSON structure:

{
  "title": "string (3–8 words, internal reference)",
  "topicConfidence": number (1–10, how well do these facts fit the topic?),
  "slides": [
    {
      "slideNumber": 0,
      "role": "OPENER",
      "headline": "string (20–100 chars)",
      "body": "string (OPENER: always empty string)",
      "supportingDetail": null,
      "factType": null,
      "containsNumber": false,
      "concretenessScore": 1-5,
      "noveltyScore": 1-5,
      "topicEntity": "string — the most concrete, photographable visual subject of this carousel (e.g., 'ancient Roman statue', 'whispering statue', 'great white shark'). Must be a noun phrase, never a question or sentence. Never null for OPENER.",
      "factRefs": []
    },
    {
      "slideNumber": 1,
      "role": "FACT",
      "headline": "string (20–100 chars, a specific claim)",
      "body": "string (${layout === 'BOLD' ? '50–100' : '200–400'} chars, the evidence and detail)",
      "supportingDetail": "string or null (a single anchoring stat/quote/date)",
      "factType": "statistic" | "comparison" | "mechanism" | "historical" | "example" | "definition",
      "containsNumber": true/false,
      "concretenessScore": 1-5,
      "noveltyScore": 1-5,
      "topicEntity": ${mode === 'single_entity'
  ? `"string — a PHOTOGRAPHABLE NOUN PHRASE describing the specific aspect shown in THIS slide (not the overall subject). Example: if the carousel is about '${concept || 'octopuses'}', topicEntity for slide 1 might be '${concept || 'octopus'} gills with blood vessels visible', slide 2 '${concept || 'octopus'} resting on rocks'. MUST DIFFER between slides to produce distinct images. Never just the bare subject name."`
  : `"string — the SPECIFIC named entity featured in THIS slide, not the overall topic. Example: if topic is 'AI facts' and slide is about AlphaFold, topicEntity = 'AlphaFold', not 'AI'. For collection mode, each slide must feature a DIFFERENT specific item."`},
      "factRefs": ["fact-id"] or []
    },
    ... (one FACT slide per selected fact, in order) ...
    {
      "slideNumber": ${factCount + 1},
      "role": "IMPLICATION",
      "headline": "string (20–100 chars)",
      "body": "string (50–400 chars, synthesizes 2+ facts)",
      "supportingDetail": null,
      "factType": null,
      "containsNumber": false,
      "concretenessScore": 1-5,
      "noveltyScore": 1-5,
      "topicEntity": null,
      "factRefs": []
    },
    {
      "slideNumber": ${factCount + 2},
      "role": "CTA",
      "headline": "string (20–80 chars, topic-referencing follow prompt)",
      "body": "string (20–100 chars, direct call-to-action with action verb)",
      "supportingDetail": null,
      "factType": null,
      "containsNumber": false,
      "concretenessScore": 1,
      "noveltyScore": 1,
      "topicEntity": null,
      "factRefs": []
    }
  ]
}

The slides array must contain exactly ${slideCount} objects:
- Index 0: role = "OPENER"
- Index 1–${factCount}: role = "FACT" (one per selected fact, same order)
- Index ${factCount + 1}: role = "IMPLICATION"
- Index ${factCount + 2}: role = "CTA" (always last, never skipped)

CRITICAL: slideNumber must equal the array index (0-indexed). Role values must be exact uppercase strings. factType is REQUIRED for every FACT slide and must be one of the six allowed values. CTA is ALWAYS the final slide. The CTA headline and body must be generated — do NOT copy the placeholder strings from the output format above.`;
}

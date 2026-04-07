interface CaptionSlide {
  role: string;
  // V2 structured fields (preferred)
  headline?: string;
  body?: string;
  supportingDetail?: string | null;
  // V1 fallback
  text?: string;
}

interface CaptionGenerationParams {
  channelName: string;
  post: {
    title: string;
    hook: string;
    type: string;
  };
  slides: CaptionSlide[];
  article?: string;
  memory?: {
    tone?: string;
    aggressionLevel?: number;
    style?: string;
    avoidPatterns?: string[];
    forbiddenWords?: string[];
  };
}

function formatSlide(s: CaptionSlide): string {
  // V2: structured headline + body
  if (s.headline) {
    const detail = s.supportingDetail ? ` [${s.supportingDetail}]` : '';
    const body = s.body ? ` — ${s.body}` : '';
    return `  ${s.role}: "${s.headline}"${body}${detail}`;
  }
  // V1 fallback: single text field
  return `  ${s.role}: "${s.text || ''}"`;
}

export function buildCaptionGenerationPrompt({
  channelName,
  post,
  slides,
  article,
  memory,
}: CaptionGenerationParams): string {
  const slidesSummary = slides.map(formatSlide).join('\n');

  const articleContext = article
    ? `
REFERENCE ARTICLE (use as narrative foundation — your caption body should be a condensed version of this article, not a re-invention):
${article}
`
    : '';

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

  return `You are an elite Instagram caption writer.

TASK: Write the caption for a carousel post on channel "${channelName}".

POST CONTEXT:
- Title: "${post.title}"
- Hook: "${post.hook}"
- Type: ${post.type}

SLIDE CONTENT:
${slidesSummary}

${memoryContext}
${articleContext}
CAPTION FORMAT (follow this structure exactly):

HOOK — A punchy FIRST FACT or insight that drops the reader straight into the content. This is what appears before "...more". Do NOT write an intro, teaser, or "discovery" preamble (e.g. "Discover the surprising truths about…", "You won't believe…", "Here's what you didn't know…"). The reader already tapped the post — they don't need to be sold on opening it. Start with the most compelling specific fact or claim from the slides. One sentence.

BODY — A mini-article that synthesizes ALL slides into one cohesive narrative. This is the core of the caption. It must:
  - Weave together the key points from EVERY slide, connecting ideas into a flowing story
  - Add context, insight, or perspective that ties the slides together — not just list them
  - Read like a short blog post or mini-article, not a summary or bullet list
  - NOT repeat slide headlines verbatim — rephrase, reframe, and connect them
  - Be 150-250 words on its own

CTA — A specific call to action that feels earned and relevant to the post's topic. Not generic ("like and follow!") but contextual ("Send this to someone still posting daily out of guilt").

HASHTAGS — 4-6 hashtags that maximize discoverability:
  - FIRST, include the most obvious, high-volume hashtag for the subject (e.g. a post about lions → #lions, about sharks → #sharks, about coffee → #coffee). This is the anchor tag — never skip it.
  - THEN add 2-3 popular community/niche hashtags that real Instagram users actually follow and search (e.g. #lionfacts, #wildlifephotography, #prideofafrica — NOT invented compound words like #savannaecology or #lionterritory that nobody follows)
  - Validate each tag: would this hashtag have thousands of posts on Instagram? If not, replace it with one that would.
  - At most 1 broad-reach tag (e.g. #wildlife, #nature, #science) — the rest should be niche-specific but REAL
  - Multi-word phrases become single hashtags (e.g. "lion facts" → #lionfacts)
  - NEVER generate aspirational slogans as hashtags (e.g. #UnlockPotential #TimelessTalent #EmbraceWisdom) — these are not searchable and no one follows them
  - NEVER invent compound-word hashtags that don't exist as real Instagram tags (e.g. #wildlifehistory, #onionchemistry) — use established tags instead
  - NEVER use generic filler like #facts #didyouknow #education #interesting unless the post is literally about those topics

CAPTION RULES:
- The caption body must reference or synthesize content from EVERY slide in the carousel
- The caption EXTENDS the carousel argument, it does not REPEAT it
- The caption hook must NEVER restate the post title or carousel cover text — the reader already saw it. Jump straight into substance.
- No emoji spam — zero emojis in the caption body, hashtags may include them only if organic
- No line breaks between every sentence — write naturally
- Total caption length (hook + body + CTA): 150-300 words. Minimum 150 words in the "text" field — anything shorter is a failure
- The tone should match the carousel but be slightly more conversational
- No "Hey guys!" or "What do you think?" energy
- Hashtags go at the very end, separated by a line break

EXACT JSON SCHEMA (follow precisely):
{
  "text": "string (the full caption text WITHOUT hashtags)",
  "hashtags": ["#example1", "#example2"]
}

CRITICAL: Use exactly these field names: "text" and "hashtags". The "text" field must NOT contain hashtags. The "hashtags" array must contain strings each starting with #.`;
}

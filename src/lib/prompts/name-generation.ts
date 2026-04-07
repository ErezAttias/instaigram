interface NameGenerationParams {
  niche: string;
  positioning: {
    angle: string;
    tone: string;
    contentStyle: string;
    audienceFeel: string;
  };
  style?: 'descriptive' | 'bold' | 'minimal' | 'personal';
}

const STYLE_INSTRUCTIONS: Record<string, string> = {
  descriptive: `STYLE: DESCRIPTIVE
- Names that clearly communicate what the channel is about
- The audience should instantly understand the content angle
- Examples: "Digital Minimalism", "AI Shortcuts Daily", "The Burnout Report"`,

  bold: `STYLE: BOLD / OPINIONATED
- Names that take a stance or provoke curiosity
- Should feel like a declaration or challenge
- Examples: "No More Hustle", "Unfiltered Takes", "The Anti-Guru"`,

  minimal: `STYLE: MINIMAL / ABSTRACT
- Short, punchy, often one word or a tight two-word combo
- Evocative rather than literal — hints at the vibe, not the topic
- Examples: "Stripped", "Offgrid", "Slow Burn", "Contrast"`,

  personal: `STYLE: PERSONAL BRAND
- Names that feel like a person's editorial voice
- Could be a handle-style name, a persona, or a "by" credit
- Examples: "The Honest Creator", "Dear Algorithm", "Notes from the Feed"`,
};

export function buildNameGenerationPrompt(params: NameGenerationParams): string {
  const styleBlock = params.style
    ? STYLE_INSTRUCTIONS[params.style]
    : `Generate names across ALL four styles:
- 2-3 DESCRIPTIVE names (clearly communicate the content angle)
- 2-3 BOLD names (take a stance, provoke curiosity)
- 2-3 MINIMAL names (short, abstract, evocative)
- 2 PERSONAL BRAND names (editorial voice, persona-driven)`;

  return `You are an elite brand naming specialist for Instagram content channels.

TASK: Generate 8-10 channel name suggestions.

NICHE: "${params.niche}"

POSITIONING:
- Angle: ${params.positioning.angle}
- Tone: ${params.positioning.tone}
- Content style: ${params.positioning.contentStyle}
- Audience feel: ${params.positioning.audienceFeel}

LANGUAGE: All names must work in English.

${styleBlock}

NAMING RULES:
- Keep names SHORT: 1-3 words is ideal, never more than 4
- Names must be MEMORABLE — easy to say, easy to spell, easy to search
- Names must MATCH the positioning — a contrarian channel shouldn't have a soft name
- Avoid generic words: "hub", "zone", "tips", "hacks", "guru", "academy", "master"
- Avoid names that sound like every other Instagram account
- Each name should feel like it could sustain a brand, not just a page
- The name should make someone curious enough to tap the profile

ANTI-PATTERNS:
- No "[Topic] Tips" or "[Topic] Hacks" — too generic
- No "The [Adjective] [Noun]" unless it's genuinely sharp
- No emoji-dependent names
- No names that only make sense with context
- No names longer than 4 words

For each name, specify its style and a one-sentence rationale explaining why it fits this channel's positioning.

Return a JSON object with a "names" array containing 8-10 name objects.

EXACT JSON SCHEMA (follow precisely):
{
  "names": [
    {
      "name": "string",
      "style": "descriptive" | "bold" | "minimal" | "personal",
      "rationale": "string"
    }
  ]
}

CRITICAL: The "style" field MUST be one of these exact lowercase strings: "descriptive", "bold", "minimal", "personal". No other values are accepted.`;
}

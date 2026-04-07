interface ChannelContext {
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
    style?: string;
    avoidPatterns?: string[];
    preferredHooks?: string[];
    forbiddenWords?: string[];
  };
}

// ─── Regenerate Hook ──────────────────────────────────────────

interface RegenerateHookParams {
  existingHooks: Array<{ text: string; type: string }>;
  channelContext: ChannelContext;
}

export function buildRegenerateHookPrompt({
  existingHooks,
  channelContext,
}: RegenerateHookParams): string {
  const existingList = existingHooks
    .map((h, i) => `  ${i + 1}. "${h.text}" (${h.type})`)
    .join('\n');

  const memoryContext = channelContext.memory
    ? `
CHANNEL MEMORY:
- Tone: ${channelContext.memory.tone ?? 'Not set'}
- Aggression: ${channelContext.memory.aggressionLevel ?? 'Not set'}/10
- Avoid patterns: ${channelContext.memory.avoidPatterns?.join(', ') ?? 'None'}
- Preferred hooks: ${channelContext.memory.preferredHooks?.join(', ') ?? 'None'}
- Forbidden words: ${channelContext.memory.forbiddenWords?.join(', ') ?? 'None'}
`
    : '';

  return `You are an elite Instagram hook writer. A hook needs to be replaced.

CHANNEL: "${channelContext.channelName}"
NICHE: ${channelContext.niche}

POSITIONING:
- Angle: ${channelContext.positioning.angle}
- Tone: ${channelContext.positioning.tone}
- Content style: ${channelContext.positioning.contentStyle}

${memoryContext}

EXISTING HOOKS (do NOT repeat or closely resemble any of these):
${existingList}

ANTI-REPETITION RULES:
- The new hook must cover a DIFFERENT angle than all existing hooks
- Do not reuse the same sentence structure as any existing hook
- Do not address the same specific behavior or belief as any existing hook
- If existing hooks are heavy on one type, vary the type
- Produce something COMPLETELY DIFFERENT from all existing hooks — different vocabulary, different structure, different angle

Generate exactly 1 new hook. Maximum 12 words. Same quality standards as the originals.

EXACT JSON SCHEMA (follow precisely):
{
  "text": "string",
  "type": "CONTRARIAN" | "CALL_OUT" | "MISTAKE_EXPOSURE" | "HIDDEN_TRUTH"
}

CRITICAL: The "type" field MUST be one of these exact uppercase strings: "CONTRARIAN", "CALL_OUT", "MISTAKE_EXPOSURE", "HIDDEN_TRUTH". No other values are accepted.`;
}

// ─── Regenerate Single Slide (V1 Legacy) ─────────────────────
// Kept for backward compatibility with v1 slides (headline === null).
// Used via dynamic import in regeneration-service.ts v1 fallback path.
// Will be removed in Step 20 cleanup.

interface RegenerateSlideParams {
  existingSlide: {
    role: string;
    text: string;
    slideIndex: number;
  };
  postContext: {
    title: string;
    hook: string;
    type: string;
    slides: Array<{ role: string; text: string }>;
  };
  channelContext: ChannelContext;
}

export function buildRegenerateSlidePrompt({
  existingSlide,
  postContext,
  channelContext,
}: RegenerateSlideParams): string {
  const allSlides = postContext.slides
    .map((s, i) => {
      const marker = i === existingSlide.slideIndex ? ' ← THIS IS THE SLIDE TO REWRITE' : '';
      return `  Slide ${i + 1} (${s.role}): "${s.text}"${marker}`;
    })
    .join('\n');

  const otherSlides = postContext.slides
    .filter((_, i) => i !== existingSlide.slideIndex)
    .map((s) => `  ${s.role}: "${s.text}"`)
    .join('\n');

  const memoryContext = channelContext.memory
    ? `
CHANNEL MEMORY:
- Tone: ${channelContext.memory.tone ?? 'Not set'}
- Aggression: ${channelContext.memory.aggressionLevel ?? 'Not set'}/10
- Style: ${channelContext.memory.style ?? 'Not set'}
- Forbidden words: ${channelContext.memory.forbiddenWords?.join(', ') ?? 'None'}
`
    : '';

  return `You are an elite Instagram carousel slide writer. One slide needs to be rewritten to produce something COMPLETELY DIFFERENT.

CHANNEL: "${channelContext.channelName}"
NICHE: ${channelContext.niche}

POSITIONING:
- Angle: ${channelContext.positioning.angle}
- Tone: ${channelContext.positioning.tone}

${memoryContext}

POST CONTEXT:
- Title: "${postContext.title}"
- Hook: "${postContext.hook}" (${postContext.type})

FULL POST SLIDES (so you maintain narrative flow):
${allSlides}

OTHER SLIDES (the new slide must flow coherently with these):
${otherSlides}

SLIDE TO REWRITE:
- Role: ${existingSlide.role}
- Current text: "${existingSlide.text}"
- Position: Slide ${existingSlide.slideIndex + 1} of 6

CRITICAL: Produce something COMPLETELY DIFFERENT from the current text. Do not reuse any words or phrases from "${existingSlide.text}". Use entirely different vocabulary, a different sentence structure, and a different angle — while still fulfilling the ${existingSlide.role} role.

ANTI-REPETITION RULES:
- The new text must be completely different from the current text
- Do not reuse any words or phrases from the current slide text
- Must still fit the ${existingSlide.role} role in the carousel narrative
- Must flow naturally from the previous slide and into the next

ROLE REQUIREMENTS:
${getSlideRoleGuidance(existingSlide.role)}

CONSTRAINTS:
- Maximum 12 words
- One idea only
- No filler words, no emojis

EXACT JSON SCHEMA (follow precisely):
{
  "role": "HOOK" | "SETUP" | "BUILD" | "TWIST" | "INSIGHT" | "CTA",
  "text": "string"
}

CRITICAL: The "role" field MUST be exactly "${existingSlide.role}" (matching the slide being regenerated).`;
}

function getSlideRoleGuidance(role: string): string {
  switch (role) {
    case 'HOOK':
      return '- HOOK: Stop the scroll. Maximum provocation. Create cognitive dissonance.';
    case 'SETUP':
      return '- SETUP: Establish the problem. Make the reader recognize themselves.';
    case 'BUILD':
      return '- BUILD: Escalate the tension. Add evidence or a deeper layer to the problem.';
    case 'TWIST':
      return '- TWIST: Reframe everything. Shift the reader\'s perspective. This is the "aha" moment.';
    case 'INSIGHT':
      return '- INSIGHT: Actionable takeaway. What to do differently. Specific, not motivational.';
    case 'CTA':
      return '- CTA: Drive action. Save, share, follow, comment. Make it feel earned, not desperate.';
    default:
      return `- ${role}: Write compelling content appropriate to this role.`;
  }
}

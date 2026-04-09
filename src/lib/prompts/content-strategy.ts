/**
 * Prompt for generating 3 complementary content pillars from a topic/niche.
 * Pillars together form a full channel identity — not competing alternatives.
 */

export function buildContentStrategyPrompt(topic: string): string {
  return `You are a social media content strategist specializing in Instagram carousel accounts.

Given a topic/niche, generate a set of 3 COMPLEMENTARY content pillars that together form a complete channel. These are not competing alternatives — a creator will use ALL of them to ensure variety across 30+ posts per month.

Topic: "${topic}"

First, define the channel's shared identity:
- "channelTone" — A short phrase (3-6 words) describing the unified voice across all pillars. Example: "Informative, engaging, eye-opening"
- "channelAudience" — ONE sentence describing who the channel is for. Example: "Curious adults who love surprising facts and untold stories."

Then generate exactly 3 pillar objects. Each pillar represents a recurring content mode — a different angle or format the channel will regularly publish:

1. "contentIntent" — ONE sentence (max 20 words) describing what posts in this pillar achieve.
   Example: "Reveal surprising facts about ancient civilizations that make people feel smarter."

2. "description" — 2-3 sentences explaining this pillar's approach and what makes it distinct from the others.

3. "tone" — Short phrase (3-6 words) describing the voice for this pillar specifically.
   Example: "Sharp, confident, myth-busting"

4. "hookTypes" — Array of 3-5 hook format labels that work for this pillar.
   Example: ["contrarian claim", "hidden mechanism", "extreme comparison"]

5. "audience" — ONE sentence describing who this pillar speaks to most directly.

Rules:
- Pillars must be GENUINELY DIFFERENT in angle and format — not just rephrased versions of each other
- Pillar 1: Informational/educational angle (facts, mechanisms, history)
- Pillar 2: Opinion/challenge angle (contrarian takes, myths busted, common mistakes)
- Pillar 3: Story/human angle (people, events, surprising outcomes)
- All pillars share the same overall topic and audience, but differ in HOW they approach it
- channelTone and channelAudience should unify all 3 pillars
- Keep contentIntent and audience SHORT — one sentence each
- Be specific to the topic, not generic

Return a JSON object:
{
  "channelTone": "...",
  "channelAudience": "...",
  "strategies": [ { pillar 1 }, { pillar 2 }, { pillar 3 } ]
}`;
}

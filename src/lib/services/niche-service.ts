import { prisma } from '@/lib/db/prisma';
import { getAIProvider } from '@/lib/ai/provider';
import {
  buildNicheGenerationPrompt,
  buildRegenerateMorePrompt,
} from '@/lib/prompts/niche-generation';
import { GeneratedNicheOptions } from '@/lib/validation/schemas';
import type { NicheSelectionMode } from '@/generated/prisma/client';
import { isFactTopic } from '@/lib/utils/topic-classifier';

// ─── Topic Relevance Validation ──────────────────────────────

/**
 * Extracts keywords from a topic string for relevance checking.
 * Splits on spaces, lowercases, and filters out stop words.
 */
function extractTopicKeywords(topic: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'about', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
    'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
    'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'not', 'only', 'same', 'so',
    'than', 'too', 'very', 'just', 'because', 'as', 'until', 'while',
    'facts', 'tips', 'ideas', 'things', 'stuff', 'content',
  ]);
  return topic
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 1 && !stopWords.has(w));
}

/**
 * Checks if a niche option is relevant to the given topic.
 * Returns true if any topic keyword appears in the title, description, or rationale.
 */
function isRelevantToTopic(
  option: { title: string; description: string; rationale: string },
  topicKeywords: string[]
): boolean {
  const combined = `${option.title} ${option.description} ${option.rationale}`.toLowerCase();
  return topicKeywords.some((keyword) => combined.includes(keyword));
}

/**
 * Filters generated niches to only those relevant to the topic.
 * Logs input, raw output, and filtered output for debugging.
 */
function validateTopicRelevance(
  topic: string,
  generated: GeneratedNicheOptions
): GeneratedNicheOptions {
  const keywords = extractTopicKeywords(topic);

  console.log(`[NicheService] Topic: "${topic}"`);
  console.log(`[NicheService] Keywords: [${keywords.join(', ')}]`);
  console.log(`[NicheService] Raw output (${generated.options.length} options):`);
  generated.options.forEach((opt, i) => {
    console.log(`  ${i + 1}. "${opt.title}"`);
  });

  const relevant = generated.options.filter((opt) =>
    isRelevantToTopic(opt, keywords)
  );

  const rejected = generated.options.filter(
    (opt) => !isRelevantToTopic(opt, keywords)
  );

  if (rejected.length > 0) {
    console.warn(
      `[NicheService] Rejected ${rejected.length} off-topic options:`
    );
    rejected.forEach((opt) => console.warn(`  ✗ "${opt.title}"`));
  }

  console.log(
    `[NicheService] Filtered output: ${relevant.length}/${generated.options.length} passed`
  );

  return { options: relevant };
}

// ─── Helpers ──────────────────────────────────────────────────

async function getChannelWithMemory(channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { memory: true },
  });
  if (!channel) throw new Error('Channel not found');
  return channel;
}

function extractMemory(memory: { tone: string; avoidPatterns: unknown; style: string } | null) {
  return memory
    ? {
        tone: memory.tone,
        avoidPatterns: memory.avoidPatterns as string[],
        style: memory.style,
      }
    : undefined;
}

async function persistNicheOptions(channelId: string, generated: GeneratedNicheOptions, maxOptions?: number) {
  await prisma.nicheOption.deleteMany({ where: { channelId } });

  const limit = maxOptions ?? generated.options.length;
  const nicheOptions = await Promise.all(
    generated.options.slice(0, limit).map((option) =>
      prisma.nicheOption.create({
        data: {
          channelId,
          title: option.title,
          description: option.description,
          competitionScore: 5,
          viralityScore: 5,
          contentEaseScore: 5,
          monetizationScore: 5,
          rationale: option.rationale,
          // contentIntent: option.contentIntent ?? null, // TODO: add DB migration for this column
          selected: false,
        },
      })
    )
  );

  await prisma.generationJob.create({
    data: {
      channelId,
      jobType: 'NICHE_GENERATION',
      status: 'COMPLETED',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result: generated as any,
    },
  });

  return nicheOptions;
}

// ─── Discover Mode ────────────────────────────────────────────
// User has no idea — generate 5 niche options from scratch

export async function generateNichesFromScratch(channelId: string) {
  const channel = await getChannelWithMemory(channelId);

  const prompt = buildNicheGenerationPrompt({
    mode: 'discover',
    channelName: channel.name,
    memory: extractMemory(channel.memory),
  });

  const ai = getAIProvider();
  const { data: generated } = await ai.generateObject(prompt, GeneratedNicheOptions);
  return persistNicheOptions(channelId, generated, 5);
}

// ─── Explore Mode ─────────────────────────────────────────────
// User has a broad direction — generate 7 sharper angles within it

export async function generateNicheAnglesWithinTopic(channelId: string, topic: string) {
  const channel = await getChannelWithMemory(channelId);

  // Persist the exploration topic
  await prisma.channel.update({
    where: { id: channelId },
    data: { exploreTopic: topic, nicheMode: 'EXPLORE' },
  });

  const prompt = buildNicheGenerationPrompt({
    mode: 'explore',
    channelName: channel.name,
    topic,
    memory: extractMemory(channel.memory),
  });

  const ai = getAIProvider();
  const MAX_ATTEMPTS = 3;

  let bestValidated: GeneratedNicheOptions = { options: [] };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`[NicheService] Explore generation attempt ${attempt}/${MAX_ATTEMPTS} for topic: "${topic}"`);

    const { data: generated } = await ai.generateObject(prompt, GeneratedNicheOptions);
    const validated = validateTopicRelevance(topic, generated);

    if (validated.options.length >= 3) {
      return persistNicheOptions(channelId, validated, 7);
    }

    // Keep the best attempt so far
    if (validated.options.length > bestValidated.options.length) {
      bestValidated = validated;
    }

    console.warn(
      `[NicheService] Only ${validated.options.length} relevant options found (need ≥3). ${attempt < MAX_ATTEMPTS ? 'Retrying...' : 'Using best effort.'}`
    );
  }

  // After all attempts, use the best validated set if we have any
  if (bestValidated.options.length > 0) {
    return persistNicheOptions(channelId, bestValidated, 7);
  }

  // Never save off-topic results — throw so the user can retry
  throw new Error(`Could not generate angles relevant to "${topic}". Please try again or rephrase your topic.`);
}

// ─── Direct Topic Mode ───────────────────────────────────────
// User already knows their topic — optionally refine into sharper angles

export async function setDirectTopic(channelId: string, topic: string, refine: boolean) {
  const channel = await getChannelWithMemory(channelId);

  await prisma.channel.update({
    where: { id: channelId },
    data: { nicheMode: 'DIRECT', exploreTopic: topic },
  });

  if (!refine) {
    // Skip niche discovery entirely — create a single "selected" niche option and advance
    // For direct topics without LLM generation, use legacy classifier as fallback
    const directContentIntent = isFactTopic(topic) ? 'evergreen_fact' : 'general';

    await prisma.nicheOption.deleteMany({ where: { channelId } });

    const nicheOption = await prisma.nicheOption.create({
      data: {
        channelId,
        title: topic,
        description: `Direct topic chosen by the creator: ${topic}`,
        competitionScore: 5,
        viralityScore: 5,
        contentEaseScore: 5,
        monetizationScore: 5,
        rationale: 'Creator-selected topic — skipped niche discovery.',
        contentIntent: directContentIntent,
        selected: true,
      },
    });

    await prisma.channel.update({
      where: { id: channelId },
      data: { niche: topic, contentIntent: directContentIntent, status: 'NICHE_SELECTED' },
    });

    console.log(`[NicheService] Direct topic: "${topic}" → contentIntent=${directContentIntent}`);
    return [nicheOption];
  }

  // Refine: generate 5 sharper angles on the given topic
  const prompt = buildNicheGenerationPrompt({
    mode: 'direct',
    channelName: channel.name,
    topic,
    memory: extractMemory(channel.memory),
  });

  const ai = getAIProvider();
  const { data: generated } = await ai.generateObject(prompt, GeneratedNicheOptions);
  return persistNicheOptions(channelId, generated, 5);
}

// ─── Regenerate More ──────────────────────────────────────────
// Generate more options with a specific intent bias

export async function regenerateMore(
  channelId: string,
  intent: 'more_viral' | 'more_niche' | 'more_monetizable' | 'more_unconventional',
  existingTitles?: string[]
) {
  const channel = await getChannelWithMemory(channelId);

  // Gather existing titles if not provided
  const titles =
    existingTitles ??
    (await prisma.nicheOption.findMany({ where: { channelId }, select: { title: true } })).map(
      (n) => n.title
    );

  const prompt = buildRegenerateMorePrompt({
    channelName: channel.name,
    memory: extractMemory(channel.memory),
    existingTitles: titles,
    intent,
    topic: channel.exploreTopic ?? undefined,
  });

  const ai = getAIProvider();
  const { data: generated } = await ai.generateObject(prompt, GeneratedNicheOptions);
  return persistNicheOptions(channelId, generated, 5);
}

// ─── Unified Entry Point (backward-compatible) ───────────────

export async function generateNiches(channelId: string, mode?: NicheSelectionMode, topic?: string) {
  switch (mode) {
    case 'EXPLORE':
      if (!topic) throw new Error('Topic is required for explore mode');
      return generateNicheAnglesWithinTopic(channelId, topic);
    case 'DIRECT':
      if (!topic) throw new Error('Topic is required for direct mode');
      return setDirectTopic(channelId, topic, true);
    case 'DISCOVER':
    default:
      return generateNichesFromScratch(channelId);
  }
}

// ─── Select Niche (unchanged) ────────────────────────────────

export async function selectNiche(channelId: string, nicheOptionId: string) {
  const nicheOption = await prisma.nicheOption.findUnique({
    where: { id: nicheOptionId },
  });

  if (!nicheOption) {
    throw new Error('Niche option not found');
  }

  if (nicheOption.channelId !== channelId) {
    throw new Error('Niche option does not belong to this channel');
  }

  await prisma.nicheOption.updateMany({
    where: { channelId },
    data: { selected: false },
  });

  await prisma.nicheOption.update({
    where: { id: nicheOptionId },
    data: { selected: true },
  });

  const updatedChannel = await prisma.channel.update({
    where: { id: channelId },
    data: {
      niche: nicheOption.title,
      contentIntent: nicheOption.contentIntent ?? null,
      status: 'NICHE_SELECTED',
    },
    include: {
      memory: true,
      nicheOptions: true,
    },
  });

  console.log(`[NicheService] Niche selected: "${nicheOption.title}" → contentIntent=${nicheOption.contentIntent ?? 'null (legacy fallback)'}`);
  return updatedChannel;
}

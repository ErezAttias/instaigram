import { prisma } from '@/lib/db/prisma';
import { getAIProvider } from '@/lib/ai/provider';
import { buildArticleGenerationPrompt } from '@/lib/prompts/article-generation';
import { GeneratedArticle } from '@/lib/validation/schemas';
import type { AIProvider } from '@/lib/ai/types';

interface ExpandedFactInput {
  claim: string;
  expansion: string;
}

interface SlideInput {
  role: string;
  headline: string;
  body: string;
  supportingDetail?: string | null;
}

/**
 * Generates a mini-article for a carousel job during pipeline execution.
 * Called with expanded facts + final slides already in memory.
 * Persists the result on the CarouselJob record.
 */
export async function generateArticle(
  jobId: string,
  expandedFacts: ExpandedFactInput[],
  slides: SlideInput[],
  topic: string,
  hook: string,
  ai: AIProvider,
): Promise<string> {
  const prompt = buildArticleGenerationPrompt({
    topic,
    hook,
    expandedFacts,
    slides,
  });

  const { data } = await ai.generateObject(prompt, GeneratedArticle);

  await prisma.carouselJob.update({
    where: { id: jobId },
    data: { article: data.text },
  });

  return data.text;
}

/**
 * Regenerates the mini-article for an existing carousel job.
 * Reconstructs fact content from pipelineMeta (if available) or slide content.
 */
export async function regenerateArticle(jobId: string): Promise<string> {
  const job = await prisma.carouselJob.findUnique({
    where: { id: jobId },
    include: { slides: { orderBy: { slideIndex: 'asc' } } },
  });

  if (!job) throw new Error('CarouselJob not found');

  // Try to recover expanded facts from pipelineMeta
  const meta = job.pipelineMeta as Record<string, unknown> | null;
  let expandedFacts: ExpandedFactInput[];

  if (meta?.expandedFacts && Array.isArray(meta.expandedFacts)) {
    expandedFacts = (meta.expandedFacts as ExpandedFactInput[]).filter(
      f => f.claim && f.expansion,
    );
  } else {
    // Fallback: derive from slide content (FACT slides only)
    expandedFacts = job.slides
      .filter(s => s.role === 'FACT' && s.headline && s.body)
      .map(s => ({
        claim: s.headline!,
        expansion: s.body!,
      }));
  }

  if (expandedFacts.length === 0) {
    throw new Error('No fact content available for article generation');
  }

  const slides: SlideInput[] = job.slides
    .filter(s => s.headline && s.body)
    .map(s => ({
      role: s.role,
      headline: s.headline!,
      body: s.body!,
      supportingDetail: s.supportingDetail,
    }));

  const hook = meta?.hook as string || job.slides[0]?.headline || job.topic;

  const ai = getAIProvider();
  return generateArticle(jobId, expandedFacts, slides, job.topic, hook, ai);
}

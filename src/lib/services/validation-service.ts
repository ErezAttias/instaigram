import { prisma } from '@/lib/db/prisma';
import {
  jaccardSimilarity,
  findRepeatedPhrases,
  extractPattern,
  wordFrequency,
  startingWordDistribution,
  isStopWord,
} from '@/lib/utils/similarity';

// ─── Types ───────────────────────────────────────────────────

interface PostSlide {
  id: string;
  postId: string;
  slideIndex: number;
  role: string;
  text: string;
}

interface PostWithSlides {
  id: string;
  channelId: string;
  hook: string;
  slides: PostSlide[];
  caption: { id: string; text: string; hashtags: unknown } | null;
}

interface ValidationIssue {
  type: string;
  severity: 'warning' | 'error';
  description: string;
  affectedPosts: string[];
}

interface ValidationReport {
  overallScore: number;
  issues: ValidationIssue[];
  suggestions: string[];
}

// ─── Validation Service ──────────────────────────────────────

export async function generateValidationReport(
  channelId: string
): Promise<ValidationReport> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  });

  if (!channel) {
    throw new Error('Channel not found');
  }

  const posts: PostWithSlides[] = await prisma.post.findMany({
    where: { channelId },
    orderBy: { dayIndex: 'asc' },
    include: {
      slides: { orderBy: { slideIndex: 'asc' } },
      caption: true,
    },
  });

  if (posts.length === 0) {
    return { overallScore: 100, issues: [], suggestions: [] };
  }

  const issues: ValidationIssue[] = [];

  // ─── Check 1: Hook Similarity ──────────────────────────────
  // Use a lower Jaccard threshold for short hooks (under 10 words)
  for (let i = 0; i < posts.length; i++) {
    for (let j = i + 1; j < posts.length; j++) {
      const similarity = jaccardSimilarity(posts[i].hook, posts[j].hook);

      // Adaptive threshold: short hooks (< 10 words each) are noisier,
      // so we lower the warning threshold from 0.6 to 0.5
      const hookAWordCount = posts[i].hook.split(/\s+/).length;
      const hookBWordCount = posts[j].hook.split(/\s+/).length;
      const bothShort = hookAWordCount < 10 && hookBWordCount < 10;
      const warningThreshold = bothShort ? 0.5 : 0.6;

      if (similarity > warningThreshold) {
        const severity = similarity > 0.8 ? 'error' : 'warning';
        issues.push({
          type: 'hook_similarity',
          severity,
          description: `Hooks are too similar (${Math.round(similarity * 100)}%): "${posts[i].hook}" and "${posts[j].hook}"`,
          affectedPosts: [posts[i].id, posts[j].id],
        });
      }
    }
  }

  // ─── Check 2: Repeated Phrases ─────────────────────────────
  const allTexts: string[] = [];
  for (const post of posts) {
    allTexts.push(post.hook);
    for (const slide of post.slides) {
      allTexts.push(slide.text);
    }
  }

  const repeatedPhrases = findRepeatedPhrases(allTexts, 3);
  for (const [phrase, count] of repeatedPhrases) {
    if (count >= 3) {
      // Find which posts contain this phrase
      const affectedPostIds = posts
        .filter((post) => {
          const postTexts = [post.hook, ...post.slides.map((s) => s.text)];
          return postTexts.some((t) =>
            t.toLowerCase().includes(phrase.toLowerCase())
          );
        })
        .map((p) => p.id);

      issues.push({
        type: 'repeated_phrase',
        severity: 'warning',
        description: `Phrase "${phrase}" appears ${count} times across posts`,
        affectedPosts: affectedPostIds,
      });
    }
  }

  // ─── Check 3: Similar Slide Structures ─────────────────────
  const slideRoles = ['HOOK', 'SETUP', 'BUILD', 'TWIST', 'INSIGHT', 'CTA'] as const;

  for (const role of slideRoles) {
    const slidesForRole = posts
      .map((post) => ({
        postId: post.id,
        slide: post.slides.find((s) => s.role === role),
      }))
      .filter((s) => s.slide != null);

    if (slidesForRole.length < 2) continue;

    let similarPairs = 0;
    const totalPairs = (slidesForRole.length * (slidesForRole.length - 1)) / 2;
    const affectedPostIds = new Set<string>();

    for (let i = 0; i < slidesForRole.length; i++) {
      for (let j = i + 1; j < slidesForRole.length; j++) {
        const sim = jaccardSimilarity(
          slidesForRole[i].slide!.text,
          slidesForRole[j].slide!.text
        );
        if (sim > 0.5) {
          similarPairs++;
          affectedPostIds.add(slidesForRole[i].postId);
          affectedPostIds.add(slidesForRole[j].postId);
        }
      }
    }

    if (totalPairs > 0 && similarPairs / totalPairs > 0.4) {
      issues.push({
        type: 'similar_slide_structure',
        severity: 'warning',
        description: `${role} slides are too similar across posts — ${Math.round((similarPairs / totalPairs) * 100)}% of pairs exceed similarity threshold`,
        affectedPosts: Array.from(affectedPostIds),
      });
    }
  }

  // ─── Check 4: Repeated Post Openings (SETUP slides) ────────
  const setupPatterns = new Map<string, string[]>();
  for (const post of posts) {
    const setupSlide = post.slides.find((s) => s.slideIndex === 1);
    if (!setupSlide) continue;

    const pattern = extractPattern(setupSlide.text);
    if (!pattern) continue;

    const existing = setupPatterns.get(pattern) ?? [];
    existing.push(post.id);
    setupPatterns.set(pattern, existing);
  }

  for (const [pattern, postIds] of setupPatterns) {
    if (postIds.length >= 3) {
      issues.push({
        type: 'repeated_opening',
        severity: 'warning',
        description: `${postIds.length} posts start with the same opening pattern: "${pattern}..."`,
        affectedPosts: postIds,
      });
    }
  }

  // ─── Check 5: Repeated CTA Patterns ───────────────────────
  // Use first 2 words for CTA patterns (CTAs often start with
  // "Save this", "Follow for", "Send this")
  const ctaPatterns = new Map<string, string[]>();
  for (const post of posts) {
    const ctaSlide = post.slides.find((s) => s.slideIndex === 5);
    if (!ctaSlide) continue;

    const pattern = extractPattern(ctaSlide.text, 2);
    if (!pattern) continue;

    const existing = ctaPatterns.get(pattern) ?? [];
    existing.push(post.id);
    ctaPatterns.set(pattern, existing);
  }

  const totalCTAs = Array.from(ctaPatterns.values()).reduce(
    (sum, ids) => sum + ids.length,
    0
  );

  for (const [pattern, postIds] of ctaPatterns) {
    if (totalCTAs > 0 && postIds.length / totalCTAs > 0.3) {
      issues.push({
        type: 'repeated_cta',
        severity: 'error',
        description: `${Math.round((postIds.length / totalCTAs) * 100)}% of CTAs share the same pattern: "${pattern}..."`,
        affectedPosts: postIds,
      });
    }
  }

  // ─── Check 6: Starting Word Repetition in Hooks ────────────
  const hooks = posts.map((p) => p.hook);
  const hookStartDist = startingWordDistribution(hooks);

  for (const [word, count] of hookStartDist) {
    if (count > 6) {
      const affectedPostIds = posts
        .filter((p) => p.hook.toLowerCase().trim().startsWith(word))
        .map((p) => p.id);
      issues.push({
        type: 'starting_word_repetition',
        severity: 'error',
        description: `${count} hooks start with the word "${word}" — this creates a monotonous pattern that readers will notice`,
        affectedPosts: affectedPostIds,
      });
    } else if (count > 4) {
      const affectedPostIds = posts
        .filter((p) => p.hook.toLowerCase().trim().startsWith(word))
        .map((p) => p.id);
      issues.push({
        type: 'starting_word_repetition',
        severity: 'warning',
        description: `${count} hooks start with the word "${word}" — vary your opening words to keep content fresh`,
        affectedPosts: affectedPostIds,
      });
    }
  }

  // ─── Check 7: Overused Words ───────────────────────────────
  // If any non-trivial word appears in more than 40% of all slide texts
  const freq = wordFrequency(allTexts);
  const threshold = allTexts.length * 0.4;

  for (const [word, count] of freq) {
    // Skip stop words and very short words
    if (isStopWord(word) || word.length <= 2) continue;

    if (count > threshold) {
      // Find which posts contain this word
      const affectedPostIds = posts
        .filter((post) => {
          const postTexts = [post.hook, ...post.slides.map((s) => s.text)];
          return postTexts.some((t) =>
            t.toLowerCase().includes(word)
          );
        })
        .map((p) => p.id);

      issues.push({
        type: 'overused_word',
        severity: 'warning',
        description: `The word "${word}" appears in ${count} of ${allTexts.length} texts (${Math.round((count / allTexts.length) * 100)}%) — consider using synonyms or rephrasing`,
        affectedPosts: affectedPostIds,
      });
    }
  }

  // ─── Calculate Overall Score ───────────────────────────────
  let overallScore = 100;
  for (const issue of issues) {
    overallScore -= issue.severity === 'error' ? 10 : 5;
  }
  overallScore = Math.max(0, overallScore);

  // ─── Generate Suggestions ─────────────────────────────────
  const suggestions: string[] = [];

  const issueTypes = new Set(issues.map((i) => i.type));

  if (issueTypes.has('hook_similarity')) {
    const similarHookCount = issues.filter((i) => i.type === 'hook_similarity').length;
    suggestions.push(
      `${similarHookCount} hook pair(s) are too similar. Rewrite them using different angles, sentence structures, and vocabulary — e.g., swap a question for a bold statement, or change the topic focus entirely.`
    );
  }

  if (issueTypes.has('repeated_phrase')) {
    const repeatedPhraseIssues = issues.filter((i) => i.type === 'repeated_phrase');
    const topPhrase = repeatedPhraseIssues[0]?.description.match(/"([^"]+)"/)?.[1] ?? '';
    suggestions.push(
      `Phrases like "${topPhrase}" are overused across posts. Replace them with varied wording — use a thesaurus or rephrase the idea from a different angle.`
    );
  }

  if (issueTypes.has('similar_slide_structure')) {
    const roles = issues
      .filter((i) => i.type === 'similar_slide_structure')
      .map((i) => i.description.match(/^(\w+)/)?.[1])
      .filter(Boolean);
    suggestions.push(
      `${roles.join(', ')} slides follow the same structure across posts. Mix up sentence lengths, use different rhetorical devices (questions, metaphors, data points), and vary your opening words.`
    );
  }

  if (issueTypes.has('repeated_opening')) {
    suggestions.push(
      'Multiple SETUP slides share the same opening pattern. Start with different sentence structures: try a statistic, a short question, a bold claim, or a "when/if" conditional.'
    );
  }

  if (issueTypes.has('repeated_cta')) {
    const ctaIssues = issues.filter((i) => i.type === 'repeated_cta');
    const topPattern = ctaIssues[0]?.description.match(/"([^"]+)"/)?.[1] ?? '';
    suggestions.push(
      `Too many CTAs start with "${topPattern}". Rotate between different CTA styles: direct asks ("Follow for..."), social proof ("Join X others who..."), urgency ("Don\'t miss..."), or value-first ("Get the full guide...").`
    );
  }

  if (issueTypes.has('starting_word_repetition')) {
    const wordIssues = issues.filter((i) => i.type === 'starting_word_repetition');
    const topWord = wordIssues[0]?.description.match(/"([^"]+)"/)?.[1] ?? '';
    suggestions.push(
      `Too many hooks start with "${topWord}". Diversify opening words — try numbers, questions, "Stop", "Most people", "The truth about", or other attention-grabbing starters.`
    );
  }

  if (issueTypes.has('overused_word')) {
    const wordIssues = issues.filter((i) => i.type === 'overused_word');
    const overusedWords = wordIssues
      .map((i) => i.description.match(/"([^"]+)"/)?.[1])
      .filter(Boolean)
      .slice(0, 3);
    suggestions.push(
      `Words like ${overusedWords.map((w) => `"${w}"`).join(', ')} appear in too many slides. Use synonyms or restructure sentences to reduce word repetition across the content plan.`
    );
  }

  if (issues.length === 0) {
    suggestions.push(
      'Content variety looks good! Keep monitoring as you add more posts.'
    );
  }

  return { overallScore, issues, suggestions };
}

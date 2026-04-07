// Auto-infer content style from topic — replaces manual positioning step

export interface InferredContentStyle {
  angle: string;
  tone: string;
  contentStyle: string;
  audienceFeel: string;
}

const KNOWLEDGE_SIGNALS = ['facts', 'history', 'mythology', 'science', 'trivia', 'wiki', 'encyclopedia', 'guide', 'explained', 'how .* works', 'anatomy', 'biology', 'physics', 'chemistry', 'geography', 'origin', 'evolution'];
const OPINION_SIGNALS = ['debate', 'vs', 'controversy', 'hot take', 'unpopular opinion', 'overrated', 'underrated', 'worst', 'best', 'ranking'];
const STORY_SIGNALS = ['story', 'journey', 'memoir', 'behind the scenes', 'untold', 'secret', 'mystery', 'case', 'crime', 'scandal'];

export function inferContentStyle(topic: string): InferredContentStyle {
  const lower = topic.toLowerCase();

  const isKnowledge = KNOWLEDGE_SIGNALS.some(s => new RegExp(s, 'i').test(lower));
  const isOpinion = OPINION_SIGNALS.some(s => new RegExp(s, 'i').test(lower));
  const isStory = STORY_SIGNALS.some(s => new RegExp(s, 'i').test(lower));

  if (isKnowledge) {
    return {
      angle: 'knowledge curator — surfaces surprising facts and details most people miss',
      tone: 'informative with a sense of wonder, authoritative but accessible',
      contentStyle: 'fact-driven carousels with specific details, numbers, and named entities',
      audienceFeel: 'smarter after every post — "I didn\'t know that" moments',
    };
  }

  if (isOpinion) {
    return {
      angle: 'sharp critic — takes clear positions and backs them with evidence',
      tone: 'bold, direct, slightly provocative but never mean-spirited',
      contentStyle: 'contrast-heavy carousels that challenge assumptions with concrete examples',
      audienceFeel: 'challenged to rethink — "wait, that\'s actually a good point"',
    };
  }

  if (isStory) {
    return {
      angle: 'storyteller — reveals the human drama behind the subject',
      tone: 'narrative, engaging, builds tension and releases with insight',
      contentStyle: 'story-driven carousels with scenes, turning points, and revelations',
      audienceFeel: 'captivated and wanting more — "I need to know what happened next"',
    };
  }

  // Default: informative + engaging
  return {
    angle: 'insider educator — breaks down the topic with clarity and unexpected depth',
    tone: 'confident and conversational, sharp without being aggressive',
    contentStyle: 'insight-driven carousels mixing facts, examples, and perspective shifts',
    audienceFeel: 'informed and engaged — "this account actually knows what they\'re talking about"',
  };
}

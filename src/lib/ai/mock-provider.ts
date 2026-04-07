import type { z } from 'zod';
import type { AIProvider, AIResult } from './types';
import { logAICall, inferTaskName, summarizeInput } from './logger';
import type {
  GeneratedNicheOptions,
  GeneratedHooks,
  GeneratedPost,
  GeneratedCaption,
  GeneratedChannelNames,
  GeneratedCarousel,
  SelectedConcept,
  MinedFactPool,
  ExpandedFactPool,
  PatchResponse,
  GeneratedHooksV2,
  ScoredHooksV2,
  RefinedHooksV2,
  ValidatedFactHooks,
} from '@/lib/validation/schemas';

// ─── Mock Niche Data ──────────────────────────────────────────

const MOCK_NICHES: GeneratedNicheOptions['options'] = [
  {
    title: 'Digital Minimalism',
    description:
      'Helping people reclaim attention by ruthlessly cutting digital noise. Anti-app, anti-notification, pro-boredom content that challenges the always-on culture.',
    rationale:
      'Low competition because most creators glorify productivity apps. High virality because digital overwhelm is universal. Easy to produce because real examples are everywhere.',
    contentIntent: 'general',
  },
  {
    title: 'Tech Skepticism',
    description:
      'Calling out Silicon Valley hype cycles, vaporware launches, and the tech industry\'s pattern of solving problems it created. Sharp, research-backed takes.',
    rationale:
      'Moderate competition but most critics lack depth. Extremely viral because tech backlash is growing. Harder to produce well because it requires real research.',
    contentIntent: 'general',
  },
  {
    title: 'Anti-Hustle Culture',
    description:
      'Dismantling the "rise and grind" mythology. Exposing how hustle porn damages health, relationships, and ironically — actual productivity.',
    rationale:
      'More competitive but most anti-hustle content is lazy. High virality because burned-out millennials are the largest demo. Easy content — the hustle bros provide endless material.',
    contentIntent: 'general',
  },
  {
    title: 'Design Brutalism',
    description:
      'Championing raw, unpolished, function-first design in a world drowning in gradient-soaked Figma templates. Anti-Dribbble, pro-substance.',
    rationale:
      'Very low competition — niche within a niche. Moderate virality limited to design community. Harder to produce because you need real design knowledge.',
    contentIntent: 'general',
  },
  {
    title: 'Creator Burnout',
    description:
      'The dark side of the creator economy nobody posts about. Algorithm anxiety, content treadmills, parasocial exhaustion, and the myth of passive income.',
    rationale:
      'Almost zero competition because burned-out creators stop creating. Insanely viral because every creator relates. Easiest content — you are the case study.',
    contentIntent: 'story',
  },
];

// ─── Mock Explore Mode Data (topic-aware) ─────────────────────
// Generates mock niches dynamically based on the user's input topic

interface ExploreAngleTemplate {
  titleTemplate: (topic: string) => string;
  descriptionTemplate: (topic: string) => string;
  rationaleTemplate: (topic: string) => string;
  contentIntent?: 'evergreen_fact' | 'story' | 'general';
}

const EXPLORE_ANGLE_TEMPLATES: ExploreAngleTemplate[] = [
  {
    titleTemplate: (t) => `${t} facts that sound fake`,
    descriptionTemplate: (t) => `The most unbelievable true facts about ${t}. Content built around surprise and curiosity gaps — the kind of posts people screenshot and send to friends.`,
    rationaleTemplate: (t) => `"Sounds fake but isn't" is a proven viral format. Applied to ${t}, it creates endless shareable content with built-in curiosity gaps.`,
    contentIntent: 'evergreen_fact',
  },
  {
    titleTemplate: (t) => `${t} myths debunked`,
    descriptionTemplate: (t) => `Calling out the biggest misconceptions about ${t}. Sharp, research-backed corrections that make people rethink what they thought they knew.`,
    rationaleTemplate: (t) => `Debunking content drives saves and shares. Most people have wrong assumptions about ${t} — correcting them builds authority fast.`,
    contentIntent: 'evergreen_fact',
  },
  {
    titleTemplate: (t) => `The dark side of ${t}`,
    descriptionTemplate: (t) => `Exploring the uncomfortable, disturbing, or hidden aspects of ${t} that mainstream content ignores. Not shock value — genuine depth that reframes the subject.`,
    rationaleTemplate: (t) => `Dark/hidden angle content about ${t} is underserved. People crave depth over surface-level coverage. Strong save rates and comment engagement.`,
    contentIntent: 'story',
  },
  {
    titleTemplate: (t) => `${t} for people who think they know`,
    descriptionTemplate: (t) => `Advanced, surprising, and counter-intuitive takes on ${t} designed for people who already have a surface-level understanding. The "actually..." account.`,
    rationaleTemplate: (t) => `Targeting the "I know this already" audience creates engagement through challenge. Applied to ${t}, the depth is there — most people only know the basics.`,
    contentIntent: 'general',
  },
  {
    titleTemplate: (t) => `${t} ranked and rated`,
    descriptionTemplate: (t) => `Hot takes, tier lists, and opinionated rankings within ${t}. Every post sparks debate in the comments because everyone has a different opinion.`,
    rationaleTemplate: (t) => `Ranking content is engagement gold — people cannot resist commenting to disagree. Applied to ${t}, there is endless material to rank and debate.`,
    contentIntent: 'general',
  },
  {
    titleTemplate: (t) => `What ${t} reveals about today`,
    descriptionTemplate: (t) => `Drawing unexpected parallels between ${t} and modern life. Making old/niche knowledge feel urgently relevant to a contemporary audience.`,
    rationaleTemplate: (t) => `Bridging ${t} to modern relevance expands the audience beyond enthusiasts. The "why this matters now" framing increases saves and shares.`,
    contentIntent: 'general',
  },
  {
    titleTemplate: (t) => `${t} stories nobody tells`,
    descriptionTemplate: (t) => `The overlooked, forgotten, or deliberately ignored stories within ${t}. Deep cuts and hidden gems that even enthusiasts haven't heard.`,
    rationaleTemplate: (t) => `Discovery content within ${t} has the highest save rate. Superfans share it to prove depth, newcomers save it to learn. Low competition for the deep cuts.`,
    contentIntent: 'story',
  },
];

function generateTopicAwareMockNiches(topic: string): GeneratedNicheOptions['options'] {
  // Capitalize first letter of each word for titles
  const formatted = topic.replace(/\b\w/g, (c) => c.toUpperCase());
  return EXPLORE_ANGLE_TEMPLATES.map((template) => ({
    title: template.titleTemplate(formatted),
    description: template.descriptionTemplate(topic),
    rationale: template.rationaleTemplate(topic),
    contentIntent: template.contentIntent,
  }));
}

// ─── Mock Direct Refinement Data (topic-aware) ──────────────

const DIRECT_ANGLE_TEMPLATES: ExploreAngleTemplate[] = [
  {
    titleTemplate: (t) => `The brutally honest ${t} guide`,
    descriptionTemplate: (t) => `No fluff, no hype — just honest, tested takes on ${t}. Every claim comes with receipts and real experience.`,
    rationaleTemplate: (t) => `Trust-first positioning within ${t}. In a space full of surface-level takes, depth and honesty build loyal audiences.`,
    contentIntent: 'general',
  },
  {
    titleTemplate: (t) => `${t} confessions`,
    descriptionTemplate: (t) => `The messy, uncomfortable, and surprising truths about ${t} that most people won't say out loud. Vulnerability meets expertise.`,
    rationaleTemplate: (t) => `Confession-style content about ${t} creates relatability and trust. High share rates because people tag friends who need to hear it.`,
    contentIntent: 'story',
  },
  {
    titleTemplate: (t) => `${t} secrets insiders know`,
    descriptionTemplate: (t) => `The insider knowledge about ${t} that superfans gatekeep. Deep cuts, hidden details, and overlooked angles.`,
    rationaleTemplate: (t) => `Insider knowledge content about ${t} drives saves and shares. People love feeling like they discovered something exclusive.`,
    contentIntent: 'general',
  },
  {
    titleTemplate: (t) => `${t} for skeptics`,
    descriptionTemplate: (t) => `A contrarian, skeptic-friendly take on ${t}. Questioning popular assumptions and testing conventional wisdom with evidence.`,
    rationaleTemplate: (t) => `Contrarian positioning within ${t} attracts high-quality audiences. Skeptics who convert become the most loyal followers.`,
    contentIntent: 'general',
  },
  {
    titleTemplate: (t) => `The ${t} deep dive`,
    descriptionTemplate: (t) => `Going deeper into ${t} than anyone else on the platform. Long-form analysis, unexpected connections, and thorough breakdowns.`,
    rationaleTemplate: (t) => `Deep-dive content within ${t} is underserved on Instagram. The audience that craves depth is highly engaged and loyal.`,
    contentIntent: 'general',
  },
];

function generateTopicAwareDirectNiches(topic: string): GeneratedNicheOptions['options'] {
  const formatted = topic.replace(/\b\w/g, (c) => c.toUpperCase());
  return DIRECT_ANGLE_TEMPLATES.map((template) => ({
    title: template.titleTemplate(formatted),
    description: template.descriptionTemplate(topic),
    rationale: template.rationaleTemplate(topic),
    contentIntent: template.contentIntent,
  }));
}

// ─── Mock Regenerate-More Data (topic-aware) ─────────────────

const REGENERATE_MORE_TEMPLATES: ExploreAngleTemplate[] = [
  {
    titleTemplate: (t) => `${t} hot takes nobody agrees with`,
    descriptionTemplate: (t) => `Deliberately controversial and opinionated perspectives on ${t}. Every post is designed to spark debate and challenge mainstream thinking.`,
    rationaleTemplate: (t) => `Hot take content within ${t} drives comments and shares. The controversy is productive — it positions the creator as someone with real opinions.`,
    contentIntent: 'general',
  },
  {
    titleTemplate: (t) => `${t} in 60 seconds`,
    descriptionTemplate: (t) => `Bite-sized, rapid-fire breakdowns of ${t} concepts. Designed for people who want to learn without the commitment of a deep dive.`,
    rationaleTemplate: (t) => `Short-form educational content about ${t} has massive reach potential. Low barrier to entry for new followers.`,
    contentIntent: 'general',
  },
  {
    titleTemplate: (t) => `The ${t} rabbit hole`,
    descriptionTemplate: (t) => `Taking one obscure detail from ${t} and following it to unexpected places. Each post is a journey from a single fact to a mind-blowing connection.`,
    rationaleTemplate: (t) => `Rabbit hole content within ${t} creates binge-worthy series. High save rates because people want to revisit the connections later.`,
    contentIntent: 'story',
  },
  {
    titleTemplate: (t) => `${t} vs reality`,
    descriptionTemplate: (t) => `Comparing popular perceptions of ${t} with what actually happened or is actually true. The gap between myth and reality is the content.`,
    rationaleTemplate: (t) => `Expectation vs reality content is universally engaging. Applied to ${t}, it corrects misconceptions while entertaining.`,
    contentIntent: 'evergreen_fact',
  },
  {
    titleTemplate: (t) => `${t} for the obsessed`,
    descriptionTemplate: (t) => `Ultra-niche, detail-oriented content for the true fans of ${t}. No beginner explanations — just the good stuff for people who already care.`,
    rationaleTemplate: (t) => `Super-niche ${t} content builds the most loyal audience. These are the people who share, comment, and buy without hesitation.`,
    contentIntent: 'general',
  },
];

function generateTopicAwareRegenerateMore(topic: string): GeneratedNicheOptions['options'] {
  const formatted = topic.replace(/\b\w/g, (c) => c.toUpperCase());
  return REGENERATE_MORE_TEMPLATES.map((template) => ({
    title: template.titleTemplate(formatted),
    description: template.descriptionTemplate(topic),
    rationale: template.rationaleTemplate(topic),
    contentIntent: template.contentIntent,
  }));
}

// ─── Mock Channel Names ──────────────────────────────────────

const MOCK_CHANNEL_NAMES: GeneratedChannelNames['names'] = [
  { name: 'The Uncomfortable Mirror', style: 'bold', rationale: 'Directly mirrors the positioning angle — confrontational, self-reflective, impossible to ignore.' },
  { name: 'Pattern Breaker', style: 'bold', rationale: 'Positions the channel as the antidote to formula-driven content creation.' },
  { name: 'Creator Autopsy', style: 'bold', rationale: 'Evokes dissecting what went wrong — sharp, clinical, slightly uncomfortable.' },
  { name: 'Offscript', style: 'minimal', rationale: 'One word that captures going against the playbook. Clean, memorable, searchable.' },
  { name: 'Contrast', style: 'minimal', rationale: 'Abstract but evocative — hints at showing the other side of every popular take.' },
  { name: 'Stripped', style: 'minimal', rationale: 'Suggests removing the noise. Minimal name for a minimal, no-fluff channel.' },
  { name: 'The Feed Audit', style: 'descriptive', rationale: 'Clearly communicates the channel examines and critiques content strategies.' },
  { name: 'Content Reckoning', style: 'descriptive', rationale: 'Descriptive but with edge — signals a moment of truth for creators.' },
  { name: 'Dear Algorithm', style: 'personal', rationale: 'Epistolary feel — personal, witty, like letters to the machine that controls reach.' },
  { name: 'Notes from the Feed', style: 'personal', rationale: 'Observational and editorial — positions the creator as a thoughtful insider.' },
];

// ─── Mock Hooks ───────────────────────────────────────────────

const MOCK_HOOKS: GeneratedHooks['hooks'] = [
  // CONTRARIAN (8) — challenges widely-held beliefs
  { text: '5am wake-ups are performative — not productive', type: 'CONTRARIAN', visualHint: 'split-screen: alarm clock vs creative work at midnight', pattern: 'CONTRAST' },
  { text: 'Posting daily for 90 days and still at 200 followers', type: 'CONTRARIAN', visualHint: 'flat growth chart with "day 90" marker', pattern: 'STORY' },
  { text: 'Niching down is how you niche yourself into irrelevance', type: 'CONTRARIAN', visualHint: 'funnel narrowing to a dead end', pattern: 'OPINION' },
  { text: 'Taste beats strategy — and no course teaches taste', type: 'CONTRARIAN', visualHint: 'contrast between strategic grid vs curated aesthetic feed', pattern: 'CONTRAST' },
  { text: 'When you post daily but your best ideas come monthly', type: 'CONTRARIAN', visualHint: 'calendar with 30 gray posts and 1 highlighted gold post', pattern: 'CONTRAST' },
  { text: 'The "authentic" creators you follow rehearse every caption', type: 'CONTRARIAN', visualHint: 'behind-the-scenes of polished vs raw draft', pattern: 'MYTH' },
  { text: 'What if your best content breaks every "rule" you follow?', type: 'CONTRARIAN', visualHint: 'content rules list with each one crossed out', pattern: 'OPINION' },
  { text: 'Carousels outperform Reels — but creators won\'t admit it', type: 'CONTRARIAN', visualHint: 'side-by-side engagement metrics comparison', pattern: 'CONTRAST' },
  // CALL_OUT (7) — directly names audience behavior
  { text: 'Three hours on your hook — twelve seconds on the insight', type: 'CALL_OUT', visualHint: 'time split visualization: huge hook section vs tiny insight', pattern: 'MISTAKE' },
  { text: 'Recycling 2019 strategies while expecting 2026 growth', type: 'CALL_OUT', visualHint: 'old strategy playbook with a 2026 date stamp', pattern: 'LIST' },
  { text: 'That Canva template is why they scroll past you', type: 'CALL_OUT', visualHint: 'identical Canva carousel grid from multiple accounts', pattern: 'MISTAKE' },
  { text: '"Passive income" requires more hustle than your day job did', type: 'CALL_OUT', visualHint: 'work hours comparison chart: job vs side hustle', pattern: 'MYTH' },
  { text: 'Buying a course about courses is not a business model', type: 'CALL_OUT', visualHint: 'infinite loop diagram of course sellers selling to course sellers', pattern: 'OPINION' },
  { text: 'Screenshot your screen time — that\'s your real content strategy', type: 'CALL_OUT', visualHint: 'phone screen time report with Instagram at 4 hours', pattern: 'LIST' },
  { text: 'Every "value post" you make sounds like the last twelve', type: 'CALL_OUT', visualHint: 'feed grid showing identical-looking value posts', pattern: 'MISTAKE' },
  // MISTAKE_EXPOSURE (8) — reveals hidden mistakes
  { text: 'Engagement pods train the algorithm to distrust your content', type: 'MISTAKE_EXPOSURE', visualHint: 'algorithm trust score dropping after pod engagement', pattern: 'BREAKDOWN' },
  { text: 'Batch creating on Sunday makes every post sound like Monday', type: 'MISTAKE_EXPOSURE', visualHint: 'row of posts with same flat energy level', pattern: 'MISTAKE' },
  { text: 'Reels destroyed your audience\'s attention span — and yours', type: 'MISTAKE_EXPOSURE', visualHint: 'attention span shrinking graph over time', pattern: 'BREAKDOWN' },
  { text: 'Optimizing for saves while ignoring DMs is backwards', type: 'MISTAKE_EXPOSURE', visualHint: 'dashboard showing high saves but empty DM inbox', pattern: 'CONTRAST' },
  { text: 'When was the last time your CTA wasn\'t just "follow me"?', type: 'MISTAKE_EXPOSURE', visualHint: 'collection of identical "follow for more" CTAs', pattern: 'LIST' },
  { text: 'Cross-posting the same content to five platforms helps none', type: 'MISTAKE_EXPOSURE', visualHint: 'same post pasted across 5 platform mockups with zero engagement', pattern: 'BREAKDOWN' },
  { text: 'Checking analytics hourly is procrastination with a dashboard', type: 'MISTAKE_EXPOSURE', visualHint: 'phone notification stream of analytics checks', pattern: 'OPINION' },
  { text: 'A/B testing hooks while ignoring slide 4 is the real problem', type: 'MISTAKE_EXPOSURE', visualHint: 'carousel with strong slide 1 and empty slide 4', pattern: 'BREAKDOWN' },
  // HIDDEN_TRUTH (7) — insider truths
  { text: 'Accounts with 10K followers outsell accounts with 500K', type: 'HIDDEN_TRUTH', visualHint: 'revenue comparison: small account vs large account', pattern: 'MYTH' },
  { text: 'Delete your content calendar for a week and watch what happens', type: 'HIDDEN_TRUTH', visualHint: 'before/after: calendar vs blank page with better results', pattern: 'STORY' },
  { text: 'Strangers convert — followers just spectate', type: 'HIDDEN_TRUTH', visualHint: 'funnel showing strangers buying vs followers watching', pattern: 'MYTH' },
  { text: 'The post that scares you to publish is the one that works', type: 'HIDDEN_TRUTH', visualHint: 'draft with "delete?" hover vs the same post with high engagement', pattern: 'STORY' },
  { text: 'Instagram rewards conviction — not consistency or volume', type: 'HIDDEN_TRUTH', visualHint: 'engagement spike on opinionated post vs flat line on daily posts', pattern: 'OPINION' },
  { text: 'How many of your last 30 posts would you actually save?', type: 'HIDDEN_TRUTH', visualHint: 'feed grid with save icons on only 2 out of 30 posts', pattern: 'LIST' },
  { text: 'People who never liked your posts will buy first', type: 'HIDDEN_TRUTH', visualHint: 'customer list vs top likers list with zero overlap', pattern: 'MYTH' },
];

// ─── Slide Template Pools (10+ per role) ──────────────────────

const SETUP_SLIDES: string[] = [
  'Every top creator sells you their morning ritual',
  'The internet taught you to optimize everything',
  'Somewhere along the way, strategy replaced instinct',
  'You learned content creation from people who sell content courses',
  'The playbook everyone follows was written for a different era',
  'Social media promised freedom and delivered a second job',
  'You started creating because you had something to say',
  'The creator economy has a dirty secret nobody mentions',
  'Algorithms train you like a lab rat — click, reward, repeat',
  'Everyone is chasing reach while ignoring resonance',
  'You built an audience that looks impressive on paper',
  'The gap between your content and your actual thinking is growing',
];

const BUILD_SLIDES: string[] = [
  'But their best work happened at 2am in chaos',
  'And now you can\'t tell what\'s yours and what\'s borrowed',
  'So you copy formats without understanding the intent behind them',
  'The result is content that performs but doesn\'t connect',
  'Then you wonder why the followers don\'t buy anything',
  'Three years of posting and your conversion rate is embarrassing',
  'You\'re producing more and saying less with every single post',
  'The numbers go up but the DMs stopped being interesting',
  'Meanwhile the accounts you admire post once a week',
  'Your feed is a highlight reel of someone else\'s strategy',
  'Every carousel looks like the last one with different words',
  'You\'re stuck in a loop of diminishing returns and you know it',
];

const TWIST_SLIDES: string[] = [
  'Routines optimize comfort — not breakthroughs',
  'Virality trains the algorithm to expect spikes not consistency',
  'Old playbooks attract old audiences — not growth',
  'The problem was never effort — it was direction',
  'What feels productive is actually just familiar',
  'Volume is a hedge against having nothing real to say',
  'The platform doesn\'t reward your best work — it rewards compliance',
  'Your audience isn\'t bored of you — they\'re bored of your patterns',
  'Strategy without taste is just organized mediocrity',
  'The metrics you celebrate are the ones keeping you stuck',
  'Consistency without evolution is just repetition with better branding',
  'You\'re not building an audience — you\'re collecting spectators',
];

const INSIGHT_SLIDES: string[] = [
  'Creativity needs friction not five-step systems',
  'Steady growth beats one hit every single time',
  'Study what works now not what worked then',
  'The creators who last are the ones who refuse to perform',
  'One genuine idea outweighs thirty optimized ones',
  'Your edge is the thing you\'re afraid to post about',
  'Depth converts. Surface-level reach is just expensive vanity',
  'The market rewards originality — your feed rewards conformity',
  'Taste is the only competitive advantage algorithms can\'t copy',
  'Real authority comes from saying what nobody else will',
  'The content that scares you to post is the content that works',
  'Less content, more conviction — that\'s the actual formula',
];

const CTA_SLIDES: string[] = [
  'Drop your routine for a week and watch what happens',
  'Save this before your next dopamine-chasing post',
  'Follow for strategies that actually match the current landscape',
  'Send this to a creator who needs the wake-up call',
  'Share this with someone still following 2019 advice',
  'Bookmark this and revisit it next time you feel stuck',
  'DM me "depth" if you\'re done performing for algorithms',
  'Comment "real" if this hit different than your usual feed',
  'Follow if you want content that respects your intelligence',
  'Save this. Then delete the post you were about to make',
  'Repost this to your story — the right people will find it',
  'Tag a creator who needs to hear this today',
];

// ─── Caption Template Pool ────────────────────────────────────

interface CaptionTemplate {
  build: (hookText: string) => string;
  hashtags: string[];
}

const CAPTION_TEMPLATES: CaptionTemplate[] = [
  {
    build: (hook) =>
      `${hook}.\n\nMost people won't tell you this because it doesn't sell courses. But the truth is simpler and harder than any framework.\n\nThe real shift happens when you stop performing and start observing what actually resonates.\n\nSave this. Send it to a creator who needs to hear it.`,
    hashtags: ['#contentcreator', '#creatoreconomy', '#instagramgrowth', '#contentmistakes', '#realtalk'],
  },
  {
    build: (hook) =>
      `${hook}.\n\nI watched this pattern destroy three accounts before I understood it. The people growing fastest right now all figured out the same thing:\n\nStop optimizing for the algorithm. Start optimizing for one person who'll screenshot your post.\n\nShare this if you've felt the treadmill.`,
    hashtags: ['#creatorlife', '#socialmediastrategy', '#growthmindset', '#contentstrategy', '#honestcreator'],
  },
  {
    build: (hook) =>
      `${hook}.\n\nUnpopular opinion? Maybe. But look at your analytics. Really look.\n\nYour highest-performing post and your most impactful post are probably not the same one. That gap is the whole problem.\n\nDM me "clarity" if this resonated.`,
    hashtags: ['#instagramtips', '#creatorburnout', '#digitalmedia', '#contentcreation', '#uncomfortable'],
  },
  {
    build: (hook) =>
      `${hook}.\n\nEvery creator hits this wall eventually. The ones who break through aren't working harder — they're thinking differently about what "working" even means.\n\nThe answer isn't more content. It's better questions about why you're making it.\n\nComment "shift" if you needed this today.`,
    hashtags: ['#creatoreconomy', '#contentmarketing', '#onlinebusiness', '#mindsetshift', '#buildingpublic'],
  },
  {
    build: (hook) =>
      `${hook}.\n\nI'm not saying this to be contrarian. I'm saying it because I burned two years learning it the hard way.\n\nThe creators who win long-term all share one trait: they'd rather be right than popular.\n\nFollow for more takes your algorithm won't show you.`,
    hashtags: ['#growthhacking', '#creatortools', '#instagramreels', '#authenticity', '#deepwork'],
  },
  {
    build: (hook) =>
      `${hook}.\n\nRead that again.\n\nNow look at your last 10 posts and ask yourself: am I creating from conviction or from a template?\n\nThe difference is obvious to your audience even when it isn't obvious to you.\n\nBookmark this for your next content day.`,
    hashtags: ['#contentcreator', '#socialmediacreator', '#instagramgrowth', '#realtalk', '#creativestrategy'],
  },
  {
    build: (hook) =>
      `${hook}.\n\nThis is the post I was afraid to make. Because it calls out the exact thing I used to do.\n\nBut growth starts where comfort ends — and your audience can smell inauthenticity through the screen.\n\nRepost to your story if you agree.`,
    hashtags: ['#creatortips', '#socialmediamarketing', '#contentisking', '#vulnerability', '#buildingbrand'],
  },
];

// ─── Coherent Slide Sequences ────────────────────────────────
// Each sequence is a complete narrative arc, not random slides

interface SlideSequence {
  title: string;
  setup: string;
  build: string;
  twist: string;
  insight: string;
  cta: string;
}

const COHERENT_SEQUENCES: SlideSequence[] = [
  {
    title: 'The Consistency Trap',
    setup: 'You followed the playbook — post daily, engage, repeat',
    build: 'And it worked. Until March when reach dropped 60%',
    twist: 'Creators who survived weren\'t consistent — they were adaptable',
    insight: 'Kill the calendar. Start with one idea worth saying',
    cta: 'Save this before your next "content day"',
  },
  {
    title: 'The Audience Illusion',
    setup: 'You built an audience that looks impressive on paper',
    build: 'But your DMs are empty and nobody buys anything',
    twist: 'Followers watch. Strangers who find you through search convert',
    insight: 'Optimize for discovery, not for your existing feed',
    cta: 'Bookmark this and check your conversion source',
  },
  {
    title: 'The Template Economy',
    setup: 'Everyone uses the same Canva templates and carousel formats',
    build: 'So every feed looks identical — and the audience notices',
    twist: 'The accounts that stand out broke the template on purpose',
    insight: 'Design friction creates recognition. Sameness creates invisibility',
    cta: 'Send this to a creator still using default templates',
  },
  {
    title: 'The Hustle Mirage',
    setup: 'The guru told you to post daily and never miss a day',
    build: 'So you burned out trying to fill a content calendar',
    twist: 'Meanwhile the top accounts in your niche post twice a week',
    insight: 'Volume is a hedge against having nothing real to say',
    cta: 'Follow if you want quality over quantity takes',
  },
  {
    title: 'The Metrics Trap',
    setup: 'You check analytics every hour looking for validation',
    build: 'Saves are up but revenue hasn\'t moved in six months',
    twist: 'The metrics you celebrate are the ones keeping you stuck',
    insight: 'Track DMs and link clicks — everything else is vanity',
    cta: 'DM me "metrics" if this hit different',
  },
  {
    title: 'The Authenticity Performance',
    setup: 'Creators preach authenticity as their brand differentiator',
    build: 'But every "authentic" post is rehearsed, edited, and optimized',
    twist: 'Authenticity became a performance — and the audience can tell',
    insight: 'Real authenticity means posting the draft, not the polished version',
    cta: 'Comment "real" if you\'ve noticed this too',
  },
  {
    title: 'The Hook Obsession',
    setup: 'Three hours perfecting slide one. Twelve seconds on slide four',
    build: 'Your hooks are perfect but nobody finishes the carousel',
    twist: 'A mediocre hook with a great payoff beats perfection on slide one',
    insight: 'Invest in the twist — that\'s where saves happen',
    cta: 'Save this for your next carousel build',
  },
  {
    title: 'The Algorithm Reality',
    setup: 'You blame the algorithm every time reach drops',
    build: 'But the algorithm didn\'t change — your audience\'s taste did',
    twist: 'Platforms reward conviction, not consistency or tricks',
    insight: 'One opinionated post outperforms thirty safe ones',
    cta: 'Share this with someone blaming the algorithm today',
  },
  {
    title: 'The Niche Prison',
    setup: 'You niched down so hard you ran out of things to say',
    build: 'Now every post sounds like the last twelve you made',
    twist: 'The best accounts aren\'t niched — they have a perspective',
    insight: 'A point of view scales. A topic doesn\'t',
    cta: 'Repost this if your niche feels like a cage',
  },
  {
    title: 'The Engagement Lie',
    setup: 'Engagement pods made your posts look popular instantly',
    build: 'But the algorithm detected the pattern within weeks',
    twist: 'Fake engagement trains the algorithm to distrust your real audience',
    insight: 'Slow, organic growth compounds. Pods create debt',
    cta: 'Save this and quit the pod — starting today',
  },
  {
    title: 'The Batch Creating Myth',
    setup: 'Sunday batch sessions feel productive and efficient',
    build: 'But every post sounds the same — same energy, same voice',
    twist: 'Great content comes from real-time reaction, not scheduled production',
    insight: 'Create when you feel something — not when the calendar says',
    cta: 'Bookmark this for the next time you force a batch day',
  },
  {
    title: 'The Silent Buyer',
    setup: 'You track likes, comments, and follower count obsessively',
    build: 'Your top commenter has never bought anything from you',
    twist: 'The people who buy are the ones who never liked a post',
    insight: 'Silent readers are your real audience. Build for them',
    cta: 'Follow for more uncomfortable truths about your audience',
  },
];

// ─── Mock Post Generator ─────────────────────────────────────

function generateMockPost(hookIndex: number): GeneratedPost {
  const safeIndex = hookIndex % MOCK_HOOKS.length;
  const hook = MOCK_HOOKS[safeIndex];
  const seqIdx = safeIndex % COHERENT_SEQUENCES.length;
  const seq = COHERENT_SEQUENCES[seqIdx];

  return {
    title: seq.title,
    slides: [
      { role: 'HOOK', text: hook.text },
      { role: 'SETUP', text: seq.setup },
      { role: 'BUILD', text: seq.build },
      { role: 'TWIST', text: seq.twist },
      { role: 'INSIGHT', text: seq.insight },
      { role: 'CTA', text: seq.cta },
    ],
  };
}

// ─── Mock Caption Generator ──────────────────────────────────

function generateMockCaption(post: GeneratedPost, hookIndex: number): GeneratedCaption {
  const templateIdx = hookIndex % CAPTION_TEMPLATES.length;
  const template = CAPTION_TEMPLATES[templateIdx];
  const hookText = post.slides[0].text;

  return {
    text: template.build(hookText),
    hashtags: template.hashtags,
  };
}

// ─── V2 Pipeline Mock Data ───────────────────────────────────

const MOCK_CONCEPT: SelectedConcept = {
  mode: 'single_entity',
  concept: 'Honey',
  conceptType: 'object',
  angle: 'narrow',
  angleDescription: 'How honey defeats bacteria through osmotic dehydration',
  suggestedHook: null,
  rationale: 'Honey has surprising depth — preservation science, history, biology — enough for 6 distinct facts',
};

// Mock mined facts — all about honey (matches MOCK_CONCEPT.concept = 'Honey')
const MOCK_MINED_FACTS: MinedFactPool = {
  candidates: [
    { claim: 'Honey never spoils because its low moisture content starves bacteria', evidence: 'Archaeologists found 3,000-year-old honey in Egyptian tombs that was still perfectly edible. Honey\'s combination of low water activity (around 0.6), acidic pH (3.2-4.5), and natural hydrogen peroxide production creates an environment where microorganisms simply cannot survive.', entities: ['Honey', 'Egypt'], has_number: true, has_comparison: false, source_type: 'internal_knowledge' },
    { claim: 'Honey bees must visit 2 million flowers to produce one pound of honey', evidence: 'A single bee visits 50 to 100 flowers per foraging trip and makes about 10 trips per day. At this rate, the entire colony must collectively visit roughly 2 million flowers and fly over 55,000 miles to produce a single pound of honey.', entities: ['Honey', 'Honey bees'], has_number: true, has_comparison: false, source_type: 'internal_knowledge' },
    { claim: 'Honey contains trace amounts of hydrogen peroxide, giving it natural antiseptic properties', evidence: 'The enzyme glucose oxidase, added by bees during honey production, slowly generates hydrogen peroxide when honey is diluted. This gives honey natural wound-healing properties, which is why medical-grade Manuka honey is used in modern hospitals to treat burns and chronic wounds.', entities: ['Honey', 'Manuka honey'], has_number: false, has_comparison: false, source_type: 'internal_knowledge' },
    { claim: 'The color of honey ranges from nearly clear to dark brown depending on the flower source', evidence: 'Honey from clover is typically light and mild, while buckwheat honey is dark and strong-flavored. Over 300 unique types of honey are produced in the United States alone, each with a distinct color, flavor, and mineral profile determined by the nectar source.', entities: ['Honey', 'United States'], has_number: true, has_comparison: true, source_type: 'internal_knowledge' },
    { claim: 'Ancient Egyptians used honey as a wound dressing and embalming fluid', evidence: 'Medical papyri from 1550 BCE describe honey-based wound treatments. Egyptians also used honey in the mummification process, packing it into body cavities. The antibacterial properties of honey made it one of the most valued medicinal substances in the ancient world.', entities: ['Honey', 'Ancient Egypt'], has_number: true, has_comparison: false, source_type: 'internal_knowledge' },
    { claim: 'A single honey bee produces only about 1/12th of a teaspoon of honey in its lifetime', evidence: 'Worker bees live an average of 6 weeks during summer foraging season. In that time, each individual bee produces roughly 1/12th of a teaspoon of honey — a tiny contribution that adds up only because a healthy colony has 20,000 to 60,000 workers.', entities: ['Honey', 'Honey bee'], has_number: true, has_comparison: false, source_type: 'internal_knowledge' },
    { claim: 'Honey is the only food produced by insects that humans eat in significant quantities', evidence: 'While some cultures consume other insect products like silk worm pupae or ant larvae, honey is the only insect-produced food consumed globally as a mainstream dietary staple. Humans have harvested honey for at least 8,000 years, as evidenced by cave paintings in Spain.', entities: ['Honey', 'Spain'], has_number: true, has_comparison: false, source_type: 'internal_knowledge' },
    { claim: 'Honey has a glycemic index of 58, lower than table sugar at 65', evidence: 'Despite being primarily composed of fructose and glucose, honey has a lower glycemic index than refined sugar. The presence of trace enzymes, minerals, and organic acids slows absorption. However, honey is still calorie-dense at roughly 64 calories per tablespoon.', entities: ['Honey'], has_number: true, has_comparison: true, source_type: 'internal_knowledge' },
    { claim: 'New Zealand exports over $300 million worth of Manuka honey annually', evidence: 'Manuka honey, produced from the nectar of the Manuka bush native to New Zealand, commands premium prices due to its high antibacterial activity measured by the UMF (Unique Manuka Factor) rating. A single jar of high-UMF Manuka honey can retail for over $100.', entities: ['Honey', 'New Zealand', 'Manuka honey'], has_number: true, has_comparison: false, source_type: 'internal_knowledge' },
    { claim: 'Crystallized honey is not spoiled — warming it to 40°C restores its liquid form', evidence: 'Crystallization is a natural process that occurs when glucose molecules in honey separate from water and form crystals. The speed depends on the glucose-to-fructose ratio; high-glucose honeys like canola crystallize within weeks, while acacia honey can stay liquid for years.', entities: ['Honey'], has_number: true, has_comparison: true, source_type: 'internal_knowledge' },
    { claim: 'Honey was used as currency in 11th-century Germany', evidence: 'In medieval Germany, peasants paid feudal lords with honey and beeswax instead of money. Honey was so valuable that German law included specific provisions governing beekeeping rights and honey theft, treating apiaries as protected property.', entities: ['Honey', 'Germany'], has_number: true, has_comparison: false, source_type: 'internal_knowledge' },
    { claim: 'Bees communicate honey locations through the waggle dance, encoding distance and direction', evidence: 'Discovered by Karl von Frisch in 1967 (earning him a Nobel Prize), the waggle dance encodes the distance to a food source in the duration of the waggle run, and the direction relative to the sun in the angle of the dance on the comb.', entities: ['Honey', 'Karl von Frisch'], has_number: true, has_comparison: false, source_type: 'internal_knowledge' },
    { claim: 'A beehive maintains an internal temperature of exactly 35°C year-round for honey production', evidence: 'Bees regulate hive temperature by fanning their wings to cool it in summer and clustering together to generate heat in winter. This precise 35°C is critical: too hot and the wax melts, too cold and the honey thickens and cannot be processed by the bees.', entities: ['Honey', 'Beehive'], has_number: true, has_comparison: false, source_type: 'internal_knowledge' },
    { claim: 'Honey contains all the substances needed to sustain life, including water, minerals, and vitamins', evidence: 'While not nutritionally complete by modern standards, honey contains vitamins B1, B2, B3, B5, B6, and C, along with minerals including calcium, iron, zinc, potassium, and magnesium. Ancient civilizations considered it a complete food.', entities: ['Honey'], has_number: false, has_comparison: false, source_type: 'internal_knowledge' },
    { claim: 'The world produces approximately 1.9 million tonnes of honey annually', evidence: 'China is the world\'s largest producer at over 450,000 tonnes per year, followed by Turkey, Argentina, and Iran. Global honey demand has been growing at roughly 2% annually, driven by health-conscious consumers seeking natural sweetener alternatives.', entities: ['Honey', 'China', 'Turkey'], has_number: true, has_comparison: true, source_type: 'internal_knowledge' },
    { claim: 'Raw honey contains propolis, a resinous substance bees use to seal the hive', evidence: 'Propolis is made from tree resin mixed with beeswax and enzymes. It has strong antimicrobial properties and has been used in traditional medicine for centuries. Modern research has identified over 300 bioactive compounds in propolis.', entities: ['Honey', 'Propolis'], has_number: true, has_comparison: false, source_type: 'internal_knowledge' },
    { claim: 'Feeding honey to infants under 12 months can cause botulism', evidence: 'Honey occasionally contains Clostridium botulinum spores, which are harmless to older children and adults but can germinate in an infant\'s immature digestive system. The CDC recommends no honey for children under one year of age.', entities: ['Honey', 'CDC'], has_number: true, has_comparison: false, source_type: 'internal_knowledge' },
    { claim: 'Honey\'s viscosity is 10,000 times that of water at room temperature', evidence: 'At 20°C, honey has a viscosity of roughly 10,000 centipoise compared to water\'s 1 centipoise. This extreme thickness is why honey pours slowly, but it decreases rapidly with temperature — at 50°C, honey flows almost like syrup.', entities: ['Honey'], has_number: true, has_comparison: true, source_type: 'internal_knowledge' },
  ],
};

// Mock expanded facts — built dynamically from MOCK_MINED_FACTS at call time
function buildMockExpandedFacts(prompt: string): ExpandedFactPool {
  // Extract how many facts we need from the prompt (count FACT N: patterns)
  const factMatches = prompt.match(/FACT \d+:/g) || [];
  const count = factMatches.length || 4;

  // Use the top candidates from mined facts (same ones the select step picks)
  const sourceFacts = MOCK_MINED_FACTS.candidates.slice(0, count);

  const MOCK_EXPANSIONS = [
    "Honey's extremely low moisture content (water activity of ~0.6) and acidic pH (3.2–4.5) create an environment where bacteria literally cannot survive. Archaeologists have unsealed 3,000-year-old jars from Egyptian tombs and found the honey still perfectly edible — the sugar molecules bind so tightly to available water that microbes starve before they can multiply.",
    "A single honey bee visits 50–100 flowers per foraging trip, making roughly 10 trips a day during peak season. To produce just one pound of honey, the colony must collectively visit about 2 million flowers and fly over 55,000 miles — more than twice around the Earth — yet each individual worker produces only 1/12th of a teaspoon in its entire six-week lifespan.",
    "The enzyme glucose oxidase, which bees add during production, slowly generates hydrogen peroxide when honey is diluted with wound moisture. This gives honey natural antiseptic properties so effective that medical-grade Manuka honey is now FDA-approved for treating burns and chronic wounds in modern hospitals.",
    "Honey's color ranges from nearly clear to dark brown depending entirely on the nectar source — clover honey is light and mild, while buckwheat honey is dark and intensely flavored. Over 300 unique varieties are produced in the United States alone, each with a distinct mineral profile that reflects the soil chemistry where the source flowers grew.",
    "In 11th-century Germany, peasants paid feudal obligations with honey and beeswax instead of coins. Honey was so prized that German law treated apiaries as protected property, with specific provisions punishing honey theft as severely as livestock rustling — making beekeepers some of the most legally protected workers in medieval Europe.",
    "Karl von Frisch discovered in 1967 that bees encode distance to food sources in the duration of a waggle run, and direction relative to the sun in the angle of the dance on the comb. This discovery earned him a Nobel Prize, and subsequent research showed the dance is so precise that other bees can navigate to a food source up to 6 miles away using the information.",
  ];

  return {
    facts: sourceFacts.map((fact, i) => ({
      ...fact,
      expansion: MOCK_EXPANSIONS[i] || MOCK_EXPANSIONS[0],
    })),
  };
}

// Mock carousel — all slides about honey (matches MOCK_CONCEPT)
function generateMockCarousel(): GeneratedCarousel {
  return {
    title: 'Honey: Nature\'s Perfect Preservative',
    topicConfidence: 9,
    slides: [
      {
        slideNumber: 0, role: 'OPENER',
        headline: 'Honey is the only food that never spoils — and the science behind it is stranger than you think',
        body: '',
        supportingDetail: null, factType: null,
        containsNumber: false, concretenessScore: 3, noveltyScore: 4,
        topicEntity: 'Honey', factRefs: [],
      },
      {
        slideNumber: 1, role: 'FACT',
        headline: 'Archaeologists found 3,000-year-old honey that was still edible',
        body: 'Honey discovered in Egyptian tombs dating to around 1000 BCE was perfectly preserved and safe to eat. Honey\'s combination of low water activity (around 0.6), acidic pH (3.2-4.5), and natural hydrogen peroxide production creates an environment where bacteria simply cannot survive.',
        supportingDetail: 'Water activity of 0.6 — most bacteria need at least 0.91 to grow',
        factType: 'mechanism', containsNumber: true, concretenessScore: 5, noveltyScore: 4,
        topicEntity: 'Honey', factRefs: [],
      },
      {
        slideNumber: 2, role: 'FACT',
        headline: 'Producing one pound of honey requires visiting 2 million flowers',
        body: 'A single honey bee visits 50 to 100 flowers per foraging trip, making about 10 trips per day. The entire colony must collectively visit roughly 2 million flowers and fly over 55,000 miles — more than twice around the Earth — to produce a single pound of honey.',
        supportingDetail: '2 million flowers, 55,000 miles of flight',
        factType: 'statistic', containsNumber: true, concretenessScore: 5, noveltyScore: 5,
        topicEntity: 'Honey', factRefs: [],
      },
      {
        slideNumber: 3, role: 'FACT',
        headline: 'Manuka honey is so valuable that New Zealand exports $300 million of it yearly',
        body: 'Manuka honey, produced from the nectar of the Manuka bush native to New Zealand, commands premium prices due to its exceptional antibacterial activity. A single jar of high-UMF (Unique Manuka Factor) rated honey can retail for over $100, making it one of the most expensive foods per ounce.',
        supportingDetail: 'Over $300 million in annual exports',
        factType: 'statistic', containsNumber: true, concretenessScore: 5, noveltyScore: 4,
        topicEntity: 'Manuka honey', factRefs: [],
      },
      {
        slideNumber: 4, role: 'FACT',
        headline: 'In medieval Germany, honey was used as currency to pay feudal lords',
        body: 'In 11th-century Germany, peasants paid taxes and feudal obligations with honey and beeswax instead of money. Honey was so valuable that German law included specific provisions governing beekeeping rights and honey theft, treating apiaries as protected property alongside land.',
        supportingDetail: '11th-century Germany — honey as legal tender',
        factType: 'historical', containsNumber: true, concretenessScore: 5, noveltyScore: 5,
        topicEntity: 'Honey', factRefs: [],
      },
      {
        slideNumber: 5, role: 'IMPLICATION',
        headline: 'Honey\'s chemistry makes it the most resilient edible substance on Earth',
        body: 'The same antimicrobial properties that preserve honey for millennia also make it a wound healer, a currency, and a global commodity worth billions. No other natural food combines indefinite shelf life with active medicinal properties — a fact that 3,000 years of human history has confirmed.',
        supportingDetail: null, factType: null,
        containsNumber: false, concretenessScore: 4, noveltyScore: 4,
        topicEntity: 'Honey', factRefs: [],
      },
    ],
  };
}

function generateMockPatchResponse(prompt: string): PatchResponse {
  // Extract which slide indices need patching from the prompt
  const slideMatches = prompt.match(/SLIDE (\d+)/g) || [];
  const indices = slideMatches.map(m => parseInt(m.replace('SLIDE ', ''), 10));

  const replacements = indices.map(idx => ({
    slideIndex: idx,
    role: 'FACT' as const,
    headline: 'Replacement: The Eiffel Tower grows 15 centimeters every summer',
    body: 'Thermal expansion of the 7,000-tonne iron structure causes the tower to grow measurably in hot weather. The 330-meter structure also leans slightly away from the sun as the heated side expands faster than the shaded side — a tilt that reverses as the sun moves.',
    supportingDetail: 'Up to 15 cm growth at peak summer temperatures',
    factType: 'mechanism' as const,
    containsNumber: true,
    concretenessScore: 5,
    noveltyScore: 4,
    topicEntity: 'Eiffel Tower',
    factRefs: [],
  }));

  // If no indices found, return one default replacement
  if (replacements.length === 0) {
    replacements.push({
      slideIndex: 1,
      role: 'FACT' as const,
      headline: 'Replacement: The Eiffel Tower grows 15 centimeters every summer',
      body: 'Thermal expansion of the 7,000-tonne iron structure causes the tower to grow measurably in hot weather. The 330-meter structure also leans slightly away from the sun as the heated side expands faster than the shaded side — a tilt that reverses as the sun moves.',
      supportingDetail: 'Up to 15 cm growth at peak summer temperatures',
      factType: 'mechanism' as const,
      containsNumber: true,
      concretenessScore: 5,
      noveltyScore: 4,
      topicEntity: 'Eiffel Tower',
      factRefs: [],
    });
  }

  return { replacements };
}

// ─── Mock Hook Engine V2 Data ────────────────────────────────

const MOCK_HOOKS_V2: GeneratedHooksV2['hooks'] = [
  { hook: 'You think posting daily helps — it kills your reach', format: 'contradiction' },
  { hook: 'Small accounts outsell big ones 3 to 1', format: 'hidden_truth' },
  { hook: 'The algorithm buries your best posts on purpose', format: 'mechanism' },
  { hook: 'Your content calendar is doing more harm than good', format: 'extreme' },
  { hook: 'Everything you learned about hashtags is outdated', format: 'threat' },
  { hook: 'Followers watch — strangers actually buy', format: 'hidden_truth' },
  { hook: 'Engagement pods train the algorithm to distrust you', format: 'mechanism' },
  { hook: 'Your "authentic" voice sounds like everyone else\'s', format: 'contradiction' },
  { hook: 'More content means less impact per post', format: 'extreme' },
  { hook: 'Your best post is the one you\'re afraid to publish', format: 'hidden_truth' },
  { hook: 'Reels destroyed your audience\'s attention span', format: 'mechanism' },
  { hook: 'That Canva template is why they scroll past', format: 'threat' },
  { hook: 'Consistency without taste is just organized noise', format: 'contradiction' },
  { hook: 'Your analytics obsession is sophisticated procrastination', format: 'extreme' },
  { hook: 'The creator economy rewards conformity not creativity', format: 'hidden_truth' },
  { hook: '10K followers and zero sales says everything', format: 'threat' },
  { hook: 'Batch creating kills the energy in every post', format: 'mechanism' },
  { hook: 'You\'re optimizing for saves but ignoring DMs', format: 'contradiction' },
  { hook: 'Cross-posting the same content helps no platform', format: 'extreme' },
  { hook: 'Your niche is so narrow nobody can find you', format: 'threat' },
];

// Fact-topic mock hooks (evergreen, no news framing)
const MOCK_FACT_HOOKS_V2: GeneratedHooksV2['hooks'] = [
  { hook: 'You think goldfish have bad memory — they remember months', format: 'contradiction' },
  { hook: 'Octopuses have three hearts and blue blood', format: 'hidden_truth' },
  { hook: 'Flamingos are pink because of the shrimp they eat', format: 'mechanism' },
  { hook: 'A mantis shrimp punches harder than a bullet', format: 'extreme' },
  { hook: 'Daddy longlegs aren\'t actually spiders', format: 'threat' },
  { hook: 'Crows remember human faces for years', format: 'hidden_truth' },
  { hook: 'Elephants mourn their dead like humans do', format: 'mechanism' },
  { hook: 'A group of flamingos is called a flamboyance', format: 'hidden_truth' },
  { hook: 'Sharks are older than trees by 50 million years', format: 'extreme' },
  { hook: 'Honey never spoils — 3000-year-old jars still edible', format: 'contradiction' },
  { hook: 'Dolphins sleep with one eye open — literally', format: 'mechanism' },
  { hook: 'Sloths can hold their breath longer than dolphins', format: 'extreme' },
  { hook: 'Wombat poop is cube-shaped and nobody knows exactly why', format: 'hidden_truth' },
  { hook: 'Bananas are berries but strawberries aren\'t', format: 'contradiction' },
  { hook: 'Tardigrades survive in the vacuum of outer space', format: 'extreme' },
  { hook: 'Koalas have fingerprints nearly identical to humans', format: 'hidden_truth' },
  { hook: 'Pigeons can do math at the level of primates', format: 'threat' },
  { hook: 'The heart of a blue whale weighs 400 pounds', format: 'extreme' },
  { hook: 'Cows have best friends and get stressed apart', format: 'mechanism' },
  { hook: 'Cats can\'t taste sweetness — they lack the receptor', format: 'contradiction' },
];

const MOCK_SCORED_HOOKS_V2: ScoredHooksV2['hooks'] = MOCK_HOOKS_V2.map((h, i) => ({
  hook: h.hook,
  scores: {
    curiosityGap: Math.min(5, 3 + (i % 3)),
    clarity: Math.min(5, 3 + ((i + 1) % 3)),
    novelty: Math.min(5, 2 + (i % 4)),
    emotionalTrigger: Math.min(5, 3 + (i % 3)),
    specificity: Math.min(5, 2 + ((i + 2) % 4)),
    totalScore: 0, // computed below
  },
})).map(h => ({
  ...h,
  scores: {
    ...h.scores,
    totalScore: h.scores.curiosityGap + h.scores.clarity + h.scores.novelty + h.scores.emotionalTrigger + h.scores.specificity,
  },
}));

const MOCK_REFINED_HOOKS_V2: RefinedHooksV2['hooks'] = MOCK_HOOKS_V2.slice(0, 8).map(h => ({
  original: h.hook,
  improved: h.hook.split('—')[0]?.trim() || h.hook, // mock: shorten at em-dash
}));

// Fact-topic scored and refined mocks
const MOCK_SCORED_FACT_HOOKS_V2: ScoredHooksV2['hooks'] = MOCK_FACT_HOOKS_V2.map((h, i) => ({
  hook: h.hook,
  scores: {
    curiosityGap: Math.min(5, 3 + (i % 3)),
    clarity: Math.min(5, 4 + (i % 2)),
    novelty: Math.min(5, 3 + (i % 3)),
    emotionalTrigger: Math.min(5, 3 + ((i + 1) % 3)),
    specificity: Math.min(5, 3 + (i % 3)),
    totalScore: 0,
  },
})).map(h => ({
  ...h,
  scores: {
    ...h.scores,
    totalScore: h.scores.curiosityGap + h.scores.clarity + h.scores.novelty + h.scores.emotionalTrigger + h.scores.specificity,
  },
}));

const MOCK_REFINED_FACT_HOOKS_V2: RefinedHooksV2['hooks'] = MOCK_FACT_HOOKS_V2.slice(0, 8).map(h => ({
  original: h.hook,
  improved: h.hook.split('—')[0]?.trim() || h.hook,
}));

// Mock LLM fact-hook validator data (accepts all fact hooks, rejects general hooks)
function buildMockFactValidation(hooks: string[]): ValidatedFactHooks['hooks'] {
  return hooks.map(hook => ({
    hook,
    isValidFactHook: true,
    verdict: 'accept' as const,
    failReason: null,
    confidence: 0.92,
    explanation: 'Timeless, verifiable biological or scientific fact.',
  }));
}

// ─── Mock Provider Implementation ─────────────────────────────

export class MockAIProvider implements AIProvider {
  readonly providerName = 'mock';
  readonly modelName = 'mock-deterministic';

  private buildMeta(prompt: string, startTime: number) {
    const meta = {
      provider: this.providerName,
      model: this.modelName,
      task: inferTaskName(prompt),
      inputSummary: summarizeInput(prompt),
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
    logAICall(meta);
    return meta;
  }

  private detectPromptType(prompt: string): 'channel_names' | 'content_strategy' | 'niches_discover' | 'niches_explore' | 'niches_direct' | 'niches_regenerate_more' | 'hooks' | 'single_hook' | 'post' | 'single_slide' | 'caption' | 'v2_concept' | 'v2_mine' | 'v2_expand' | 'v2_carousel' | 'v2_patch' | 'hooks_v2_generate' | 'hooks_v2_score' | 'hooks_v2_refine' | 'hooks_v2_fact_generate' | 'hooks_v2_fact_score' | 'hooks_v2_fact_refine' | 'hooks_v2_fact_validate' | 'unknown' {
    const lower = prompt.toLowerCase();

    // Hook Engine V2 — LLM fact-hook validator
    if (lower.includes('strict fact-hook validator')) return 'hooks_v2_fact_validate';

    // Hook Engine V2 prompts — fact mode (check before general V2)
    if (lower.includes('evergreen facts only') && lower.includes('every hook must follow one of these 5 formats')) return 'hooks_v2_fact_generate';
    if (lower.includes('news penalty (fact-topic mode)') && lower.includes('score each hook on 5 dimensions')) return 'hooks_v2_fact_score';
    if (lower.includes('evergreen fact mode') && lower.includes('make good hooks great')) return 'hooks_v2_fact_refine';

    // Hook Engine V2 prompts — general mode
    if (lower.includes('every hook must follow one of these 5 formats')) return 'hooks_v2_generate';
    if (lower.includes('score each hook on 5 dimensions')) return 'hooks_v2_score';
    if (lower.includes('make good hooks great')) return 'hooks_v2_refine';

    // V2 pipeline prompts (check first — most specific identifiers)
    if (lower.includes('decide how this carousel should be structured')) return 'v2_concept';
    if (lower.includes('fact expansion engine')) return 'v2_expand';
    if (lower.includes('fact mining engine')) return 'v2_mine';
    if (lower.includes('repairing specific slides')) return 'v2_patch';
    if (lower.includes('carousel fact engine')) return 'v2_carousel';

    // Content strategy prompt
    if (lower.includes('content strategist') && lower.includes('contentintent')) return 'content_strategy';

    // Batch hooks (content-first flow)
    if (lower.includes('content strategy:') && lower.includes('instagram carousel hook writer')) return 'hooks';

    // Check for channel name generation
    if (lower.includes('channel name suggestions') || lower.includes('brand naming specialist')) return 'channel_names';

    // Check for regeneration patterns first (most specific)
    if (lower.includes('slide needs to be rewritten') || lower.includes('one slide needs to')) return 'single_slide';
    if (lower.includes('post needs to be regenerated')) return 'post';
    if (lower.includes('hook needs to be replaced')) return 'single_hook';

    // Niche sub-types (check before generic niche detection)
    if (lower.includes('existing options to avoid') && lower.includes('intent:')) return 'niches_regenerate_more';
    if (lower.includes('sharp content angles within broad topic')) return 'niches_explore';
    if (lower.includes('sharpening content positioning') || lower.includes('sharper angles or positioning variants')) return 'niches_direct';

    // Use the TASK line to detect intent
    const taskMatch = lower.match(/task:\s*([^\n]+)/);
    const taskLine = taskMatch ? taskMatch[1] : '';

    if (taskLine.includes('niche')) return 'niches_discover';
    if (taskLine.includes('hook') || taskLine.includes('30 hooks')) return 'hooks';
    if (taskLine.includes('caption')) return 'caption';
    if (taskLine.includes('post') || taskLine.includes('carousel') || taskLine.includes('slide')) return 'post';

    // Fallback: check the first line of the prompt for role hints
    const firstLine = lower.split('\n')[0];
    if (firstLine.includes('hook writer')) return 'single_hook';
    if (firstLine.includes('niche')) return 'niches_discover';
    if (firstLine.includes('caption writer')) return 'caption';
    if (firstLine.includes('carousel') || firstLine.includes('slide writer')) return 'post';
    if (firstLine.includes('post needs to be regenerated')) return 'post';

    return 'unknown';
  }

  async generateObject<T>(prompt: string, schema: z.ZodSchema<T>): Promise<AIResult<T>> {
    const startTime = Date.now();
    const promptType = this.detectPromptType(prompt);

    let result: unknown;

    switch (promptType) {
      case 'channel_names': {
        // If a specific style is requested, filter to that style
        const styleMatch = prompt.toLowerCase().match(/style:\s*(descriptive|bold|minimal|personal)/);
        if (styleMatch) {
          const targetStyle = styleMatch[1];
          const filtered = MOCK_CHANNEL_NAMES.filter(n => n.style === targetStyle);
          result = { names: filtered.length > 0 ? filtered : MOCK_CHANNEL_NAMES } satisfies GeneratedChannelNames;
        } else {
          result = { names: MOCK_CHANNEL_NAMES } satisfies GeneratedChannelNames;
        }
        break;
      }
      case 'niches_discover':
        result = { options: MOCK_NICHES } satisfies GeneratedNicheOptions;
        break;
      case 'niches_explore': {
        // Extract topic from the prompt to generate topic-aware mock data
        const topicMatch = prompt.match(/topic(?:\s+area)?[:\s]+"([^"]+)"/i);
        const exploreTopic = topicMatch ? topicMatch[1] : 'the given topic';
        console.log(`[MockAI] Explore mode — topic: "${exploreTopic}"`);
        result = { options: generateTopicAwareMockNiches(exploreTopic) } satisfies GeneratedNicheOptions;
        break;
      }
      case 'niches_direct': {
        const directTopicMatch = prompt.match(/topic[:\s]+"([^"]+)"/i);
        const directTopic = directTopicMatch ? directTopicMatch[1] : 'the given topic';
        console.log(`[MockAI] Direct mode — topic: "${directTopic}"`);
        result = { options: generateTopicAwareDirectNiches(directTopic) } satisfies GeneratedNicheOptions;
        break;
      }
      case 'niches_regenerate_more': {
        const regenTopicMatch = prompt.match(/area of[:\s]+"([^"]+)"/i);
        const regenTopic = regenTopicMatch ? regenTopicMatch[1] : 'the given topic';
        console.log(`[MockAI] Regenerate-more mode — topic: "${regenTopic}"`);
        result = { options: generateTopicAwareRegenerateMore(regenTopic) } satisfies GeneratedNicheOptions;
        break;
      }
      case 'content_strategy':
        result = {
          contentIntent: 'Reveal surprising, little-known facts that challenge common assumptions and make people feel smarter after reading.',
          description: 'A fact-driven carousel account that digs deep into overlooked corners of the topic. Each post delivers a concrete, verifiable surprise — not opinions, not hot takes, but genuine "I had no idea" moments backed by evidence. Stands out by prioritizing depth and specificity over generic listicles.',
          tone: 'Sharp and confident, like a knowledgeable friend who cuts through BS — never preachy, always surprising. Uses precise language and concrete details instead of vague claims.',
          hookTypes: ['contrarian claim', 'hidden mechanism', 'extreme comparison', 'myth-busting', 'scale revelation'],
          audience: 'Curious adults who love "I didn\'t know that" moments — they share content that makes them look smart to their friends. They scroll past generic tips but stop for specific, surprising facts.',
        };
        break;
      case 'hooks':
        result = { hooks: MOCK_HOOKS } satisfies GeneratedHooks;
        break;
      case 'single_hook': {
        // Return a random hook different from existing ones
        const randomIdx = Math.floor(Math.random() * MOCK_HOOKS.length);
        result = MOCK_HOOKS[randomIdx];
        break;
      }
      case 'single_slide': {
        // Return a regenerated slide with a random role-appropriate text
        const roleMatch = prompt.toLowerCase().match(/role:\s*(\w+)/);
        const role = roleMatch ? roleMatch[1].toUpperCase() : 'SETUP';
        const pool = role === 'SETUP' ? SETUP_SLIDES : role === 'BUILD' ? BUILD_SLIDES : role === 'TWIST' ? TWIST_SLIDES : role === 'INSIGHT' ? INSIGHT_SLIDES : role === 'CTA' ? CTA_SLIDES : SETUP_SLIDES;
        const slideIdx = Math.floor(Math.random() * pool.length);
        result = { role, text: pool[slideIdx] };
        break;
      }
      case 'caption': {
        const captionDayMatch = prompt.toLowerCase().match(/day\s*(\d+)/);
        const captionDayIndex = captionDayMatch ? parseInt(captionDayMatch[1], 10) : 0;
        const captionPost = generateMockPost(captionDayIndex);
        result = generateMockCaption(captionPost, captionDayIndex) satisfies GeneratedCaption;
        break;
      }
      case 'post': {
        const dayMatch = prompt.toLowerCase().match(/day\s*(\d+)/);
        const dayIndex = dayMatch ? parseInt(dayMatch[1], 10) : 0;
        result = generateMockPost(dayIndex) satisfies GeneratedPost;
        break;
      }
      case 'v2_concept':
        result = MOCK_CONCEPT satisfies SelectedConcept;
        break;
      case 'v2_mine':
        result = MOCK_MINED_FACTS satisfies MinedFactPool;
        break;
      case 'v2_expand':
        result = buildMockExpandedFacts(prompt) satisfies ExpandedFactPool;
        break;
      case 'v2_carousel':
        result = generateMockCarousel() satisfies GeneratedCarousel;
        break;
      case 'v2_patch':
        result = generateMockPatchResponse(prompt) satisfies PatchResponse;
        break;
      case 'hooks_v2_generate':
        result = { hooks: MOCK_HOOKS_V2 } satisfies GeneratedHooksV2;
        break;
      case 'hooks_v2_score':
        result = { hooks: MOCK_SCORED_HOOKS_V2 } satisfies ScoredHooksV2;
        break;
      case 'hooks_v2_refine':
        result = { hooks: MOCK_REFINED_HOOKS_V2 } satisfies RefinedHooksV2;
        break;
      case 'hooks_v2_fact_generate':
        result = { hooks: MOCK_FACT_HOOKS_V2 } satisfies GeneratedHooksV2;
        break;
      case 'hooks_v2_fact_score':
        result = { hooks: MOCK_SCORED_FACT_HOOKS_V2 } satisfies ScoredHooksV2;
        break;
      case 'hooks_v2_fact_refine':
        result = { hooks: MOCK_REFINED_FACT_HOOKS_V2 } satisfies RefinedHooksV2;
        break;
      case 'hooks_v2_fact_validate': {
        // Extract hooks from prompt and build mock validations
        const hookMatches = prompt.match(/"\d+\.\s+"([^"]+)"/g) || [];
        const extractedHooks = hookMatches.map(m => {
          const inner = m.match(/"([^"]+)"$/);
          return inner ? inner[1] : '';
        }).filter(Boolean);
        const hooksToValidate = extractedHooks.length > 0 ? extractedHooks : MOCK_FACT_HOOKS_V2.map(h => h.hook);
        result = { hooks: buildMockFactValidation(hooksToValidate) } satisfies ValidatedFactHooks;
        break;
      }
      default:
        result = { options: MOCK_NICHES } satisfies GeneratedNicheOptions;
        break;
    }

    const meta = this.buildMeta(prompt, startTime);
    return { data: schema.parse(result), meta };
  }

  async generateText(prompt: string): Promise<AIResult<string>> {
    const startTime = Date.now();
    const lowerPrompt = prompt.toLowerCase();

    let text: string;

    if (lowerPrompt.includes('niche')) {
      text = 'Based on current market analysis, the creator economy is oversaturated in productivity and fitness. The highest-opportunity niches combine cultural criticism with practical takeaways.';
    } else if (lowerPrompt.includes('hook')) {
      text = 'The strongest hooks create cognitive dissonance in under 3 seconds. They challenge an assumption the reader holds dear, making it impossible not to swipe.';
    } else if (lowerPrompt.includes('caption')) {
      text = 'Your caption should extend the carousel\'s argument, not repeat it. Open with the sharpest line, add one layer of depth, then close with a CTA that feels like a dare.';
    } else {
      text = 'Content that converts doesn\'t just inform — it reframes. Every piece should leave the reader seeing their situation differently than before they swiped.';
    }

    const meta = this.buildMeta(prompt, startTime);
    return { data: text, meta };
  }
}

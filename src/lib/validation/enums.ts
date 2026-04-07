export {
  ChannelStatus,
  PostStatus,
  PostType,
  PostPattern,
  SlideRole,
  JobType,
  JobStatus,
  NicheSelectionMode,
} from '@/generated/prisma/client';

export type {
  ChannelStatus as ChannelStatusType,
  PostStatus as PostStatusType,
  PostType as PostTypeType,
  PostPattern as PostPatternType,
  SlideRole as SlideRoleType,
  JobType as JobTypeType,
  JobStatus as JobStatusType,
  NicheSelectionMode as NicheSelectionModeType,
} from '@/generated/prisma/client';

// ─── Human-Readable Label Maps ────────────────────────────────

export const ChannelStatusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  NICHE_SELECTED: 'Niche Selected',
  POSITIONED: 'Positioned',
  HOOKS_GENERATED: 'Hooks Generated',
  CONTENT_GENERATED: 'Content Generated',
  COMPLETE: 'Complete',
};

export const PostStatusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  GENERATED: 'Generated',
  REVIEWED: 'Reviewed',
  APPROVED: 'Approved',
};

export const PostTypeLabels: Record<string, string> = {
  CONTRARIAN: 'Contrarian',
  CALL_OUT: 'Call Out',
  MISTAKE_EXPOSURE: 'Mistake Exposure',
  HIDDEN_TRUTH: 'Hidden Truth',
};

export const PostPatternLabels: Record<string, string> = {
  CONTRAST: 'Contrast',
  MISTAKE: 'Mistake',
  MYTH: 'Myth Buster',
  LIST: 'List',
  STORY: 'Story',
  BREAKDOWN: 'Breakdown',
  OPINION: 'Opinion',
};

export const SlideRoleLabels: Record<string, string> = {
  HOOK: 'Hook',
  SETUP: 'Setup',
  BUILD: 'Build',
  TWIST: 'Twist',
  INSIGHT: 'Insight',
  CTA: 'Call to Action',
};

export const JobTypeLabels: Record<string, string> = {
  NICHE_GENERATION: 'Niche Generation',
  POSITIONING: 'Positioning',
  HOOK_GENERATION: 'Hook Generation',
  POST_GENERATION: 'Post Generation',
  CAPTION_GENERATION: 'Caption Generation',
  REGENERATION: 'Regeneration',
};

export const JobStatusLabels: Record<string, string> = {
  PENDING: 'Pending',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};

export const NicheSelectionModeLabels: Record<string, string> = {
  DISCOVER: 'Discover',
  EXPLORE: 'Explore',
  DIRECT: 'Direct',
};

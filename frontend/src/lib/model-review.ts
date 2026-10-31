import reviews from '@/config/model-review.json';
import { reviewStatus } from '@/lib/model-review-format.mjs';

export { complianceMark, formatHourlyPrice, formatTokenPrice, formatUsd, reviewLabel, reviewStatus } from '@/lib/model-review-format.mjs';

export type ReviewTask = 'transcription' | 'analysis' | 'chat';

export type ModelReview = {
  tested: boolean;
  transcription: boolean;
  analysis: boolean;
  chat: boolean;
};

const table = reviews as Record<string, { transcription?: boolean; analysis?: boolean; chat?: boolean }>;

export function reviewFor(id: string): ModelReview {
  return reviewStatus(table[id]);
}

export function recommendedFirst<T extends { id: string }>(models: T[], task: ReviewTask): T[] {
  return [...models].sort((a, b) => {
    const rank = Number(!reviewFor(a.id)[task]) - Number(!reviewFor(b.id)[task]);
    return rank || a.id.localeCompare(b.id);
  });
}

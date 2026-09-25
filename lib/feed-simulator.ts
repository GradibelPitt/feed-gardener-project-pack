import type { FeederCandidate } from './feeder.ts';

export type JevRating = {
  score: number;
  confidence: number;
  model?: string;
};

export type SimulatedFeed = {
  items: Array<{ candidate: FeederCandidate; rating: JevRating }>;
  average: number | null;
  targetMet: boolean;
  ratedCount: number;
  lowConfidenceCount: number;
};

/** Feedback can reorder candidates without changing any inputs to title scoring. */
export function feedRatingContext(candidates: FeederCandidate[], goalKey: string): string {
  return JSON.stringify([
    goalKey,
    candidates.map((candidate) => JSON.stringify([candidate.key, candidate.item.title])).sort(),
  ]);
}

/** The persisted slider value is a minimum score for each displayed item. */
export function relevanceThreshold(target: number): number {
  return Number.isInteger(target) && target >= 1 && target <= 10 ? target : 8;
}

export function matchesJevRelevance(rating: JevRating | undefined, target: number): boolean {
  return Boolean(
    rating &&
    Number.isFinite(rating.confidence) &&
    rating.confidence >= 0.7 &&
    rating.confidence <= 1 &&
    Number.isFinite(rating.score) &&
    rating.score >= relevanceThreshold(target) &&
    rating.score <= 10,
  );
}

export function simulateFeed(
  candidates: FeederCandidate[],
  ratings: ReadonlyMap<string, JevRating>,
  target: number,
  size = 12,
): SimulatedFeed {
  const goal = relevanceThreshold(target);
  const selected = candidates
    .flatMap((candidate) => {
      const rating = ratings.get(candidate.key);
      return rating && matchesJevRelevance(rating, goal) ? [{ candidate, rating }] : [];
    })
    .sort((a, b) => b.rating.score - a.rating.score || b.candidate.score - a.candidate.score)
    .slice(0, size);
  const sum = selected.reduce((total, entry) => total + entry.rating.score, 0);
  const average = selected.length ? Math.round((sum / selected.length) * 100) / 100 : null;
  return {
    items: selected,
    average,
    targetMet: selected.length > 0 && average !== null && average >= goal,
    ratedCount: candidates.filter((candidate) => ratings.has(candidate.key)).length,
    lowConfidenceCount: candidates.filter((candidate) => {
      const rating = ratings.get(candidate.key);
      return rating !== undefined && rating.confidence < 0.7;
    }).length,
  };
}

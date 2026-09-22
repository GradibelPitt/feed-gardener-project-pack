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

/** A target is a minimum mean, not a minimum score for every item. */
export function simulateFeed(
  candidates: FeederCandidate[],
  ratings: ReadonlyMap<string, JevRating>,
  target: number,
  size = 12,
): SimulatedFeed {
  const goal = Number.isInteger(target) && target >= 1 && target <= 10 ? target : 8;
  const minimumItemScore = Math.max(1, goal - 3);
  const eligible = candidates
    .flatMap((candidate) => {
      const rating = ratings.get(candidate.key);
      return rating &&
        rating.confidence >= 0.7 &&
        rating.score >= minimumItemScore &&
        rating.score <= 10
        ? [{ candidate, rating }]
        : [];
    })
    .sort((a, b) => b.rating.score - a.rating.score || b.candidate.score - a.candidate.score);
  const selected = eligible.slice(0, Math.min(5, size));
  let sum = selected.reduce((total, entry) => total + entry.rating.score, 0);
  const remaining = eligible.slice(selected.length).sort((a, b) => a.rating.score - b.rating.score);
  while (selected.length < size && remaining.length) {
    const index = remaining.findIndex(
      (entry) => (sum + entry.rating.score) / (selected.length + 1) >= goal,
    );
    if (index < 0) break;
    const [entry] = remaining.splice(index, 1);
    selected.push(entry);
    sum += entry.rating.score;
  }
  selected.sort((a, b) => b.rating.score - a.rating.score || b.candidate.score - a.candidate.score);
  const average = selected.length ? Math.round((sum / selected.length) * 100) / 100 : null;
  return {
    items: selected,
    average,
    targetMet: selected.length >= 5 && average !== null && average >= goal,
    ratedCount: candidates.filter((candidate) => ratings.has(candidate.key)).length,
    lowConfidenceCount: candidates.filter((candidate) => {
      const rating = ratings.get(candidate.key);
      return rating !== undefined && rating.confidence < 0.7;
    }).length,
  };
}

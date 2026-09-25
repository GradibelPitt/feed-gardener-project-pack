import { createHash } from 'node:crypto';
import type { CachedScore } from './score-cache.ts';

// Worker isolates have no local SQLite file. This cache avoids repeated Jev
// calls within an isolate without affecting scoring when an isolate restarts.
const RUBRIC_VERSION = 4;
const TTL_MS = 6 * 60 * 60_000;
const scores = new Map<string, { rating: CachedScore; scoredAt: number }>();

export function scoreCacheKey(title: string, tags: readonly string[], model: string): string {
  const normalizedTags = [...new Set(tags.map((tag) => tag.trim().toLowerCase()))].sort();
  return createHash('sha256')
    .update(JSON.stringify([RUBRIC_VERSION, title.trim(), normalizedTags, model]))
    .digest('hex');
}

export function readScore(key: string, now = Date.now()): CachedScore | null {
  const entry = scores.get(key);
  if (!entry) return null;
  if (entry.scoredAt <= now - TTL_MS) {
    scores.delete(key);
    return null;
  }
  return entry.rating;
}

export function writeScore(key: string, rating: CachedScore, now = Date.now()): void {
  scores.set(key, { rating, scoredAt: now });
  for (const [scoreKey, entry] of scores) {
    if (entry.scoredAt <= now - TTL_MS) scores.delete(scoreKey);
  }
}

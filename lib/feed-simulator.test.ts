import assert from 'node:assert/strict';
import test from 'node:test';
import { simulateFeed, type JevRating } from './feed-simulator.ts';
import type { FeederCandidate } from './feeder.ts';

const candidates = Array.from({ length: 12 }, (_, index) => ({
  key: `https://example.org/${index}`,
  score: 12 - index,
  item: { title: `Item ${index}` },
})) as FeederCandidate[];
const ratings = new Map<string, JevRating>(
  candidates.map((candidate, index) => [
    candidate.key,
    { score: index < 5 ? 10 : 8 - (index - 5), confidence: 0.9 },
  ]),
);

test('all ten targets are accepted and lower targets include weaker relevant items', () => {
  const counts = Array.from(
    { length: 10 },
    (_, index) => simulateFeed(candidates, ratings, index + 1).items.length,
  );
  assert.equal(counts[9], 5);
  assert.equal(counts[0], 12);
  assert.ok(counts.every((count, index) => index === 0 || count <= counts[index - 1]));
  for (let target = 1; target <= 10; target += 1) {
    const result = simulateFeed(candidates, ratings, target);
    assert.ok(result.average !== null && result.average >= target);
  }
});

test('unavailable and low-confidence scores cannot make a target appear reached', () => {
  const weak = new Map(ratings);
  for (const candidate of candidates.slice(0, 5))
    weak.set(candidate.key, { score: 10, confidence: 0.4 });
  const result = simulateFeed(candidates, weak, 9);
  assert.equal(result.targetMet, false);
  assert.equal(result.lowConfidenceCount, 5);
  assert.ok(result.average !== null && result.average < 9);
});

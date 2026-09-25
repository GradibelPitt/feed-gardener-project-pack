import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesJevRelevance, simulateFeed, type JevRating } from './feed-simulator.ts';
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
    assert.ok(result.items.every(({ rating }) => rating.score >= target));
  }
});

test('unavailable and low-confidence scores cannot make a target appear reached', () => {
  const weak = new Map(ratings);
  for (const candidate of candidates.slice(0, 5))
    weak.set(candidate.key, { score: 10, confidence: 0.4 });
  const result = simulateFeed(candidates, weak, 9);
  assert.equal(result.targetMet, false);
  assert.equal(result.lowConfidenceCount, 5);
  assert.equal(result.average, null);
  assert.deepEqual(result.items, []);
});

test('Relevance 9 excludes 6 and 1 even when ten-point items could subsidize the average', () => {
  const scores = new Map(ratings);
  scores.set(candidates[5].key, { score: 9, confidence: 0.9 });
  scores.set(candidates[6].key, { score: 6, confidence: 0.9 });
  scores.set(candidates[7].key, { score: 1, confidence: 0.9 });
  const strict = simulateFeed(candidates, scores, 9);
  assert.deepEqual(
    strict.items.map(({ rating }) => rating.score),
    [10, 10, 10, 10, 10, 9],
  );
  assert.ok(simulateFeed(candidates, scores, 6).items.some(({ rating }) => rating.score === 6));
  assert.ok(simulateFeed(candidates, scores, 1).items.some(({ rating }) => rating.score === 1));
  assert.deepEqual(simulateFeed(candidates, scores, 9).items, strict.items);
});

test('a small result set never backfills below the threshold', () => {
  const scores = new Map([
    [candidates[0].key, { score: 9, confidence: 0.7 }],
    [candidates[1].key, { score: 6, confidence: 1 }],
  ]);
  const result = simulateFeed(candidates, scores, 9);
  assert.equal(result.items.length, 1);
  assert.equal(result.targetMet, true);
  assert.equal(result.average, 9);
});

test('shared feed and source gate hides pending, invalid, and low-confidence scores', () => {
  assert.equal(matchesJevRelevance(undefined, 9), false);
  for (const rating of [
    { score: 6, confidence: 0.9 },
    { score: 1, confidence: 1 },
    { score: 10, confidence: 0.69 },
    { score: 11, confidence: 1 },
    { score: NaN, confidence: 1 },
    { score: 9, confidence: Infinity },
    { score: 9, confidence: 1.1 },
  ])
    assert.equal(matchesJevRelevance(rating, 9), false);
  assert.equal(matchesJevRelevance({ score: 9, confidence: 0.7 }, 9), true);
  assert.equal(matchesJevRelevance({ score: 7, confidence: 1 }, NaN), false);
  assert.equal(matchesJevRelevance({ score: 8, confidence: 1 }, NaN), true);
});

test('Bilibili and YouTube share the minimum score and neither can bypass missing scores', () => {
  for (const source of ['Bilibili', 'YouTube'] as const) {
    const videos = candidates.slice(0, 5).map((candidate) => ({
      ...candidate,
      item: { ...candidate.item, source },
    }));
    const videoRatings = new Map([
      [videos[0].key, { score: 9, confidence: 0.9 }],
      [videos[1].key, { score: 6, confidence: 0.9 }],
      [videos[2].key, { score: 1, confidence: 0.9 }],
      [videos[3].key, { score: 10, confidence: 0.6 }],
    ]);
    assert.deepEqual(simulateFeed(videos, new Map(), 9).items, []);
    const result = simulateFeed(videos, videoRatings, 9);
    assert.deepEqual(
      result.items.map(({ candidate }) => candidate.key),
      [videos[0].key],
    );
    assert.equal(result.items[0].candidate.item.source, source);
  }
});

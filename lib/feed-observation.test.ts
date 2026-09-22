import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateObservedRun, evaluateObservedRuns, type ObservedRun } from './feed-observation.ts';

const run = (id: string, beforeMatches: number, afterMatches: number): ObservedRun => {
  const entries = (matches: number) =>
    Array.from({ length: 10 }, (_, index) => ({
      rank: index + 1,
      tags: index < matches ? ['robotics'] : ['cooking'],
      creatorId: `creator-${index}`,
    }));
  return {
    runId: id,
    platform: 'simulator',
    targetTags: ['Robotics'],
    baseline: {
      snapshotId: `${id}-before`,
      capturedAt: '2026-09-20T10:00:00Z',
      surface: 'home',
      entries: entries(beforeMatches),
    },
    followup: {
      snapshotId: `${id}-after`,
      capturedAt: '2026-09-20T11:00:00Z',
      surface: 'home',
      entries: entries(afterMatches),
    },
  };
};

test('one run reports actual tag appearance and rank-weighted changes', () => {
  const result = evaluateObservedRun(run('one', 2, 5));
  assert.equal(result.targetAppearanceRateBefore, 20);
  assert.equal(result.targetAppearanceRateAfter, 50);
  assert.equal(result.targetAppearanceRateChangePp, 30);
  assert.ok(result.rankWeightedRateChangePp > 0);
});

test('multiple runs are retained and do not become causal platform weights', () => {
  const two = evaluateObservedRuns([run('one', 2, 5), run('two', 3, 4)]);
  assert.equal(two.aggregate.status, 'insufficient_runs');
  const three = evaluateObservedRuns([run('one', 2, 5), run('two', 3, 4), run('three', 1, 3)]);
  assert.equal(three.aggregate.status, 'observed_association');
  assert.match(three.aggregate.note, /not a platform weight or causal proof/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  behaviorSignalKeys,
  compileStrategyPlan,
  defaultBehaviorWeights,
  normalizeBehaviorWeights,
} from './strategy.ts';

test('default behavior weights are explicit product priors that total 100', () => {
  assert.equal(
    behaviorSignalKeys.reduce((sum, key) => sum + defaultBehaviorWeights[key], 0),
    100,
  );
  assert.deepEqual(normalizeBehaviorWeights(), defaultBehaviorWeights);
});

test('custom weights are clamped and normalized without mutating defaults', () => {
  const result = normalizeBehaviorWeights({ watchTime: 100, completion: 0, save: -20 });
  assert.equal(
    behaviorSignalKeys.reduce((sum, key) => sum + result[key], 0),
    100,
  );
  assert.equal(result.save, 0);
  assert.equal(defaultBehaviorWeights.save, 10);
});

test('live plans stay blocked while simulator plans are bounded and executable', () => {
  const live = compileStrategyPlan({
    platform: 'youtube',
    interface: 'local_agent',
    goalTags: [' local inference ', 'local inference', 'agents'],
    sessionMinutes: 500,
    maxVideos: 100,
  });
  assert.equal(live.executionStatus, 'policy_blocked');
  assert.equal(live.strategyMode, 'simple');
  assert.deepEqual(live.weights, defaultBehaviorWeights);
  assert.deepEqual(live.goalTags, ['local inference', 'agents']);
  assert.deepEqual(live.budget, { sessionMinutes: 60, maxVideos: 20 });
  assert.ok(live.phases.find((phase) => phase.id === 'execute')?.writesAccountState);

  const simulator = compileStrategyPlan({
    platform: 'simulator',
    interface: 'multimodal_api',
    strategyMode: 'expert',
    goalTags: ['robotics'],
    weights: { watchTime: 100 },
  });
  assert.equal(simulator.executionStatus, 'simulator_ready');
  assert.equal(simulator.strategyMode, 'expert');
  assert.equal(simulator.blockedReason, null);
});

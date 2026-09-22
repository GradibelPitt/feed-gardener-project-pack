import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHANNELS,
  gardenReducer as reduce,
  initialGardenState,
  restoreGardenState,
  selectGardenTargets,
} from './garden.ts';
import type { GardenState } from './garden.ts';
import { defaultPreferences, domains } from './feed.ts';

const now = 1_000;
test('selected-tags mode constrains simulator candidates while preserving explicit blocks', () => {
  const preferences = {
    ...defaultPreferences,
    onlySelectedTags: true,
    tags: ['local-inference'],
    exploration: 50,
  };
  assert.deepEqual(
    selectGardenTargets(preferences).map((channel) => channel.id),
    ['sim-practical-ml'],
  );
  assert.deepEqual(selectGardenTargets({ ...preferences, tags: [] }), []);
  assert.deepEqual(selectGardenTargets({ ...preferences, blockedTags: ['quantization'] }), []);
  assert.ok(selectGardenTargets({ ...preferences, onlySelectedTags: false }).length > 1);
});
const version = 7;
const expectedTargets = CHANNELS.slice(0, 3).map((channel) => channel.id);
const tick = (state: GardenState) => reduce(state, { type: 'TICK', version, now });
const preview = (state = initialGardenState()) => reduce(state, { type: 'PLAN', version, now });
const consent = (state: GardenState) => reduce(state, { type: 'CONSENT', value: true });
const start = (state = initialGardenState()) =>
  reduce(consent(preview(state)), { type: 'START', version, now });
const resume = (state: GardenState) => reduce(state, { type: 'RESUME', version, now });
const advance = (state: GardenState, count: number) => {
  for (let index = 0; index < count; index++) state = tick(state);
  return state;
};
const complete = (state: GardenState) => {
  // A bounded loop also catches stalls without hanging the test runner.
  for (let count = 0; state.status === 'running' && count < 20; count++) state = tick(state);
  assert.equal(state.status, 'finished');
  return state;
};

// Test outcomes and safety boundaries independently of the React timer/UI.
test('neither an empty session nor an unapproved preview can execute writes', () => {
  for (const state of [initialGardenState(), preview()]) {
    assert.equal(reduce(state, { type: 'START', version, now }), state);
    assert.equal(resume(state), state);
    assert.equal(tick(state), state);
    assert.deepEqual(state.subscriptions, { A: [], B: [] });
  }
  assert.equal(start().status, 'running');
});

test('a complete plan processes only the three permitted targets and preserves actor provenance', () => {
  const initial = start();
  const before = structuredClone(initial);
  const state = complete(initial);
  assert.deepEqual(initial, before, 'reducer must not mutate previous snapshots');
  assert.deepEqual(state.subscriptions.A, expectedTargets);
  assert.deepEqual(state.subscriptions.B, []);
  assert.equal(state.index, 3);
  assert.equal(state.logs.filter((entry) => entry.code === 'EXECUTE').length, 3);
  assert.ok(state.logs.filter((entry) => entry.target).every((entry) => entry.actor === 'agent'));
  assert.equal(state.logs.find((entry) => entry.code === 'STARTED')?.actor, 'user');
  assert.equal(state.logs.find((entry) => entry.code === 'PLAN_READY')?.actor, 'system');
  assert.equal(tick(state), state, 'a finished run must never produce another write');
});

test('repeating an approved plan records pre-existing subscriptions as no-ops', () => {
  const first = complete(start());
  const nextPreview = preview(first);
  assert.equal(nextPreview.consent, false, 'each new plan requires fresh consent');
  const second = complete(start(first));
  assert.deepEqual(second.subscriptions, first.subscriptions);
  assert.equal(second.logs.filter((entry) => entry.code === 'EXECUTE').length, 0);
  assert.equal(second.logs.filter((entry) => entry.code === 'NOOP_ALREADY_SATISFIED').length, 3);
});

test('manual pause blocks new actions at every stage and resumes from the saved stage', () => {
  for (let step = 0; step < 5; step++) {
    const running = advance(start(), step);
    const paused = reduce(running, { type: 'PAUSE' });
    assert.equal(paused.reason, 'MANUAL_PAUSE');
    assert.equal(tick(paused), paused);
    assert.deepEqual(paused.subscriptions, running.subscriptions);
    const finished = complete(resume(paused));
    assert.deepEqual(finished.subscriptions.A, expectedTargets);
    assert.equal(finished.logs.filter((entry) => entry.code === 'EXECUTE').length, 3);
  }
});

test('lost receipt pauses after exactly one write and reconciliation never repeats that action', () => {
  let state = advance(reduce(start(), { type: 'FAULT' }), 3);
  assert.equal(state.reason, 'UNCERTAIN_RESULT');
  assert.equal(state.status, 'paused');
  assert.deepEqual(state.subscriptions.A, [expectedTargets[0]]);
  assert.equal(tick(state), state);
  assert.equal(resume(state), state, 'uncertain results cannot be blindly resumed');
  state = reduce(state, { type: 'RECONCILE' });
  assert.equal(state.reason, 'RECONCILED');
  assert.equal(state.status, 'paused', 'successful reconciliation must not silently restart');
  assert.deepEqual(state.subscriptions.A, [expectedTargets[0]]);
  const finished = complete(resume(state));
  assert.deepEqual(finished.subscriptions.A, expectedTargets);
  assert.equal(finished.logs.filter((entry) => entry.code === 'EXECUTE').length, 2);
  assert.equal(finished.logs.filter((entry) => entry.code === 'UNCERTAIN_RESULT').length, 1);
  assert.equal(finished.logs.filter((entry) => entry.code === 'RECONCILED').length, 1);
});

test('a receipt fault armed after a write survives the checkpoint until the next new write', () => {
  let state = advance(start(), 3);
  assert.deepEqual(state.subscriptions.A, [expectedTargets[0]]);
  state = reduce(state, { type: 'FAULT' });
  state = advance(state, 5);
  assert.equal(state.reason, 'UNCERTAIN_RESULT');
  assert.deepEqual(state.subscriptions.A, expectedTargets.slice(0, 2));
  assert.equal(
    state.logs.find((entry) => entry.code === 'UNCERTAIN_RESULT')?.target,
    expectedTargets[1],
  );
});

test('reconciliation requires observable target state and the original account', () => {
  const uncertain = advance(reduce(start(), { type: 'FAULT' }), 3);
  const noEvidence = { ...uncertain, subscriptions: { A: [], B: [] } };
  assert.equal(reduce(noEvidence, { type: 'RECONCILE' }), noEvidence);
  const changedAccount: GardenState = { ...uncertain, account: 'B' };
  assert.equal(reduce(changedAccount, { type: 'RECONCILE' }), changedAccount);
});

test('account switching invalidates consent and isolates existing subscriptions from the new account', () => {
  const first = advance(start(), 3);
  let state = reduce(first, { type: 'ACCOUNT' });
  assert.equal(state.account, 'B');
  assert.equal(state.reason, 'ACCOUNT_CHANGED');
  assert.equal(state.consent, false);
  assert.equal(tick(state), state);
  assert.equal(
    resume(consent(state)).status,
    'paused',
    'checking consent cannot revive an identity-invalid plan',
  );
  assert.deepEqual(state.subscriptions.B, []);
  state = complete(start(state));
  assert.deepEqual(state.subscriptions.A, [expectedTargets[0]]);
  assert.deepEqual(state.subscriptions.B, expectedTargets);
});

test('switching away and back still requires a newly reviewed plan', () => {
  const state = reduce(reduce(start(), { type: 'ACCOUNT' }), { type: 'ACCOUNT' });
  assert.equal(state.account, 'A');
  assert.equal(state.reason, 'ACCOUNT_CHANGED');
  assert.equal(resume(consent(state)).status, 'paused');
});

test('preference revision changes stop writes both on notification and at the write boundary', () => {
  const beforeWrite = advance(start(), 2);
  for (const event of [
    { type: 'PROFILE', version: version + 1 } as const,
    { type: 'TICK', version: version + 1, now } as const,
  ]) {
    const state = reduce(beforeWrite, event);
    assert.equal(state.reason, 'PROFILE_CHANGED');
    assert.equal(state.consent, false);
    assert.deepEqual(state.subscriptions.A, []);
    assert.equal(resume(consent(state)).status, 'paused');
  }
});

test('reload pauses each interrupted stage and requires fresh consent before resuming', () => {
  for (let count = 0; count < 15; count++) {
    const running = advance(start(), count);
    const restored = restoreGardenState(JSON.stringify(running), version);
    assert.equal(restored.reason, 'RELOADED');
    assert.equal(restored.status, 'paused');
    assert.equal(restored.consent, false);
    assert.equal(restored.index, running.index);
    assert.equal(restored.step, running.step);
    assert.deepEqual(restored.subscriptions, running.subscriptions);
    assert.equal(resume(restored), restored);
    const finished = complete(resume(consent(restored)));
    assert.deepEqual(finished.subscriptions.A, expectedTargets);
    assert.equal(finished.logs.filter((entry) => entry.code === 'EXECUTE').length, 3);
  }
});

test('reload retains uncertainty and version invalidation instead of silently clearing safety gates', () => {
  const uncertain = advance(reduce(start(), { type: 'FAULT' }), 3);
  const restored = restoreGardenState(JSON.stringify(uncertain), version);
  assert.equal(restored.reason, 'UNCERTAIN_RESULT');
  assert.equal(resume(consent(restored)).status, 'paused');
  const reconciled = reduce(restored, { type: 'RECONCILE' });
  const finished = complete(resume(consent(reconciled)));
  assert.deepEqual(finished.subscriptions.A, expectedTargets);
  const changed = restoreGardenState(JSON.stringify(start()), version + 1);
  assert.equal(changed.reason, 'PROFILE_CHANGED');
  assert.equal(changed.consent, false);
});

test('plan expiration is enforced at start, resume and the next write boundary', () => {
  const expiredNow = now + 120_000;
  const startExpired = reduce(consent(preview()), { type: 'START', version, now: expiredNow });
  const resumeExpired = reduce(reduce(start(), { type: 'PAUSE' }), {
    type: 'RESUME',
    version,
    now: expiredNow,
  });
  const writeExpired = reduce(advance(start(), 2), { type: 'TICK', version, now: expiredNow });
  for (const state of [startExpired, resumeExpired, writeExpired]) {
    assert.equal(state.status, 'paused');
    assert.equal(state.reason, 'PLAN_EXPIRED');
    assert.equal(state.consent, false);
    assert.deepEqual(state.subscriptions.A, []);
  }
});

test('missing, malformed and out-of-bound local snapshots safely start a fresh simulation', () => {
  const malformed = [
    null,
    '{broken',
    'null',
    JSON.stringify({ ...start(), schema: 99 }),
    JSON.stringify({ ...start(), index: 40 }),
    JSON.stringify({ ...start(), account: 'unknown' }),
    JSON.stringify({ ...start(), subscriptions: { A: ['arbitrary-target'], B: [] } }),
  ];
  for (const raw of malformed)
    assert.deepEqual(restoreGardenState(raw, version), initialGardenState());
});

test('garden candidates follow selected core domains before explicitly permitted exploration', () => {
  const preferences = {
    ...defaultPreferences,
    domains: ['robotics-edge'],
    relatedDomains: ['web-interaction', 'open-source'],
    exploration: 20,
  };
  assert.deepEqual(
    selectGardenTargets(preferences).map((channel) => channel.domain),
    ['robotics-edge', 'web-interaction', 'open-source'],
  );
  assert.deepEqual(
    selectGardenTargets({ ...preferences, exploration: 0 }).map((channel) => channel.domain),
    ['robotics-edge'],
  );
  assert.equal(
    selectGardenTargets({ ...preferences, domains: domains.map((domain) => domain.id) }).length,
    3,
  );
  assert.deepEqual(selectGardenTargets({ ...preferences, domains: [], relatedDomains: [] }), []);
});

test('garden hard exclusions suppress a creator, a tagged channel, or the entire YouTube simulator source', () => {
  const preferences = {
    ...defaultPreferences,
    domains: ['ai-infrastructure'],
    relatedDomains: [],
    exploration: 0,
  };
  assert.equal(selectGardenTargets(preferences)[0]?.name, 'Kernel Lab');
  assert.deepEqual(selectGardenTargets({ ...preferences, blockedSources: ['Kernel Lab'] }), []);
  assert.deepEqual(selectGardenTargets({ ...preferences, blockedSources: ['YouTube'] }), []);
  assert.deepEqual(selectGardenTargets({ ...preferences, blockedTags: ['local-inference'] }), []);
  assert.equal(
    selectGardenTargets({ ...preferences, blockedSources: ['Bluesky'], blockedTags: ['webgpu'] })
      .length,
    1,
  );
});

test('one- and two-target plans finish at their actual budget and only write the frozen targets', () => {
  for (const count of [1, 2]) {
    const targetIds = CHANNELS.slice(3, 3 + count).map((channel) => channel.id);
    const plan = reduce(initialGardenState(), { type: 'PLAN', version, now, targetIds });
    targetIds.reverse(); // The caller cannot mutate an already frozen plan.
    const expected = CHANNELS.slice(3, 3 + count).map((channel) => channel.id);
    assert.deepEqual(plan.targetIds, expected);
    const running = reduce(consent(plan), { type: 'START', version, now });
    const state = advance(running, count * 5);
    assert.equal(state.status, 'finished');
    assert.equal(state.index, count);
    assert.deepEqual(state.subscriptions.A, expected);
    assert.equal(state.logs.filter((entry) => entry.code === 'EXECUTE').length, count);
    assert.deepEqual(restoreGardenState(JSON.stringify(state), version).targetIds, expected);
    assert.equal(tick(state), state);
  }
});

test('plans cannot authorize empty, unknown, duplicate or over-budget target lists', () => {
  for (const targetIds of [
    [],
    ['not-a-channel'],
    [expectedTargets[0], expectedTargets[0]],
    CHANNELS.slice(0, 4).map((channel) => channel.id),
  ]) {
    const idle = initialGardenState();
    assert.equal(reduce(idle, { type: 'PLAN', version, now, targetIds }), idle);
    assert.deepEqual(
      restoreGardenState(JSON.stringify({ ...start(), targetIds }), version),
      initialGardenState(),
    );
  }
});

test('subscriptions from different valid plans accumulate without expanding any single run budget', () => {
  const first = complete(start());
  const targets = CHANNELS.slice(3).map((channel) => channel.id);
  const plan = reduce(first, { type: 'PLAN', version, now, targetIds: targets });
  const finished = complete(reduce(consent(plan), { type: 'START', version, now }));
  assert.equal(finished.subscriptions.A.length, 6);
  assert.equal(finished.index, 3);
  assert.deepEqual(
    restoreGardenState(JSON.stringify(finished), version).subscriptions,
    finished.subscriptions,
  );
});

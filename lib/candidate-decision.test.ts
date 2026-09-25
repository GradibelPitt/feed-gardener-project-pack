import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { closeScoreCache } from './score-cache.ts';
import {
  CandidateDecisionInputError,
  decideCandidate,
  deterministicCandidateDecision,
  parseJevCandidateDecision,
  validateCandidateDecisionInput,
} from './candidate-decision.ts';

const request = () => ({
  platform: 'simulator',
  videoTitle: 'Robot-arm control for robotics',
  goalTags: ['robotics'],
  remainingVideoBudget: 3,
  remainingMinuteBudget: 10,
  provider: 'auto',
});
const input = () => validateCandidateDecisionInput(request());
const answer = (score: unknown, confidence: unknown = 0.9) => ({
  model: 'mock-jev',
  answers: { target_relevance: { type: 'score', score, confidence } },
});

test('title-only input requires no prior multimodal analysis', () => {
  assert.equal(input().videoTitle, request().videoTitle);
  assert.deepEqual(input().goalTags, ['robotics']);
});

test('Feeder can reuse title scoring without changing legacy video requests', () => {
  const feeder = validateCandidateDecisionInput({
    platform: 'feeder',
    contentTitle: 'An article about robotics',
    goalTags: ['robotics'],
    remainingVideoBudget: 1,
    remainingMinuteBudget: 1,
    provider: 'jev',
  });
  assert.equal(feeder.videoTitle, 'An article about robotics');
  assert.equal(parseJevCandidateDecision(answer(8), feeder).relevanceScore, 9);
  assert.throws(
    () => validateCandidateDecisionInput({ ...feeder, platform: 'feeder' }),
    CandidateDecisionInputError,
  );
});

test('reject invalid titles, tags, providers and missing or invalid budgets', () => {
  for (const override of [
    { videoTitle: '' },
    { videoTitle: ' '.repeat(2) },
    { videoTitle: 'x'.repeat(1001) },
    { videoTitle: undefined, analysis: { contentSummary: 'legacy summary' } },
    { goalTags: [] },
    { goalTags: [''] },
    { goalTags: [1] },
    { goalTags: Array(13).fill('tag') },
    { provider: 'unknown' },
    { remainingVideoBudget: undefined },
    { remainingMinuteBudget: NaN },
    { remainingVideoBudget: -1 },
    { remainingVideoBudget: 0.5 },
    { remainingMinuteBudget: 241 },
  ])
    assert.throws(
      () => validateCandidateDecisionInput({ ...request(), ...override }),
      CandidateDecisionInputError,
    );
});

test('application maps all score boundaries and preserves fractional scores', () => {
  for (const [score, action] of [
    [0, 'skip_candidate'],
    [2, 'skip_candidate'],
    [2.01, 'escalate_for_review'],
    [5.99, 'escalate_for_review'],
    [6, 'watch_candidate'],
    [9, 'watch_candidate'],
  ] as const) {
    const result = parseJevCandidateDecision(answer(score), input());
    assert.equal(result.relevanceScore, score + 1);
    assert.equal(result.action, action);
    assert.equal(result.executionAuthorization, 'none');
    assert.equal(result.requiresRunnerValidation, true);
    assert.equal(result.evidenceBasis, 'title_only');
  }
});

test('budget and confidence gates override even a high relevance score', () => {
  assert.equal(parseJevCandidateDecision(answer(9, 0.69), input()).action, 'escalate_for_review');
  assert.equal(parseJevCandidateDecision(answer(9, 0.7), input()).action, 'watch_candidate');
  for (const budget of [{ remainingVideoBudget: 0 }, { remainingMinuteBudget: 0.9 }]) {
    const result = parseJevCandidateDecision(answer(9), { ...input(), ...budget });
    assert.equal(result.action, 'escalate_for_review');
    assert.deepEqual(result.policyOverrides, ['budget_exhausted']);
  }
});

test('malformed Jev responses are rejected, never clamped into valid scores', () => {
  for (const payload of [
    null,
    {},
    answer(-0.1),
    answer(10),
    answer('9'),
    answer(NaN),
    answer(Infinity),
    answer(8, -1),
    answer(8, '0.9'),
    answer(8, Infinity),
    { answers: { next_action: { choice: 'watch_candidate' } } },
    { answers: { target_relevance: { score: 9, confidence: 0.9 } } },
  ]) {
    assert.throws(() => parseJevCandidateDecision(payload, input()), /JEV_INVALID_RESPONSE/);
  }
  assert.throws(
    () =>
      parseJevCandidateDecision(
        { answers: { target_relevance: { type: 'score', score: 8 } } },
        input(),
      ),
    /JEV_INVALID_RESPONSE/,
  );
});

test('Jev action fields cannot control the application action', () => {
  const payload = answer(0);
  Object.assign(payload.answers, { next_action: { choice: 'watch_candidate', confidence: 1 } });
  assert.equal(parseJevCandidateDecision(payload, input()).action, 'skip_candidate');
});

test('deterministic fallback does not fabricate a relevance score', () => {
  const result = deterministicCandidateDecision(input(), true);
  assert.equal(result.relevanceScore, null);
  assert.equal(result.confidence, null);
  assert.equal(result.provider, 'deterministic_fallback');
  assert.equal(result.action, 'escalate_for_review');
});

test('provider sends only title/tags and one ten-level score question; failures stay failures', async (t) => {
  const previousKey = process.env.TYPESAFE_API_KEY;
  t.after(() => {
    if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previousKey;
  });
  delete process.env.TYPESAFE_API_KEY;
  assert.equal((await decideCandidate(input())).provider, 'deterministic_fallback');
  await assert.rejects(
    decideCandidate({ ...input(), provider: 'jev' }),
    /JEV_MODEL_NOT_CONFIGURED/,
  );
  process.env.TYPESAFE_API_KEY = 'test-only-not-a-real-key';
  let response: Response | Error = Response.json(answer(8));
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    assert.deepEqual(body.state, {
      video_title: request().videoTitle,
      user_selected_tags: ['robotics'],
    });
    assert.deepEqual(Object.keys(body.questions), ['target_relevance']);
    assert.equal(body.questions.target_relevance.type, 'score');
    assert.equal(body.questions.target_relevance.criteria.length, 10);
    const rubric = body.questions.target_relevance.instructions;
    assert.match(rubric, /every user-selected topic/);
    assert.match(rubric, /title itself identifies that topic as the main subject/);
    assert.match(rubric, /Use only the title as evidence/);
    assert.match(rubric, /A title about a different subject must score low/);
    assert.match(rubric, /A broad selected topic still needs clear title evidence/);
    assert.doesNotMatch(rubric, /热血高校|AI search/);
    assert.match(body.questions.target_relevance.criteria[0], /different subject/);
    if (response instanceof Error) throw response;
    return response;
  });
  assert.equal((await decideCandidate(input())).relevanceScore, 9);
  for (response of [
    new Response('', { status: 429 }),
    Response.json(answer(20)),
    new DOMException('Timeout', 'AbortError'),
  ]) {
    await assert.rejects(decideCandidate(input()));
  }
});

test('Feeder reuses a verified title score while applying each request policy', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'feeder-decision-'));
  const previousKey = process.env.TYPESAFE_API_KEY;
  const previousPath = process.env.FEEDER_SCORE_DB;
  process.env.TYPESAFE_API_KEY = 'test-only-not-a-real-key';
  process.env.FEEDER_SCORE_DB = join(directory, 'scores.db');
  t.after(() => {
    closeScoreCache();
    if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previousKey;
    if (previousPath === undefined) delete process.env.FEEDER_SCORE_DB;
    else process.env.FEEDER_SCORE_DB = previousPath;
    rmSync(directory, { recursive: true, force: true });
  });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return Response.json(answer(8));
  });
  const feeder = validateCandidateDecisionInput({
    platform: 'feeder',
    contentTitle: 'A robotics article',
    goalTags: ['robotics'],
    remainingVideoBudget: 1,
    remainingMinuteBudget: 1,
    provider: 'jev',
  });
  const [first, second] = await Promise.all([
    decideCandidate(feeder),
    decideCandidate({ ...feeder, remainingVideoBudget: 0 }),
  ]);
  assert.equal(calls, 1);
  assert.equal(first.action, 'watch_candidate');
  assert.equal(second.action, 'escalate_for_review');
  closeScoreCache();
  assert.equal((await decideCandidate(feeder)).relevanceScore, 9);
  assert.equal(calls, 1);
  await decideCandidate({ ...feeder, goalTags: ['gardening'] });
  assert.equal(calls, 2);
  delete process.env.TYPESAFE_API_KEY;
  await assert.rejects(decideCandidate(feeder), /JEV_MODEL_NOT_CONFIGURED/);
});

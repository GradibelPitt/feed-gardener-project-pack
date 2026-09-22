import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ObservationInputError,
  parseObservationAnalysis,
  validateObservationInput,
} from './agent-observation.ts';

test('observation input requires bounded goals and evidence', () => {
  assert.throws(
    () => validateObservationInput({ platform: 'youtube', goalTags: ['ai'] }),
    ObservationInputError,
  );
  const input = validateObservationInput({
    platform: 'youtube',
    goalTags: [' AI ', 'AI', 'robotics'],
    visibleText: 'A robotics demo',
  });
  assert.deepEqual(input.goalTags, ['AI', 'robotics']);
});

test('analysis cannot invent matched goals and derives coverage from actual input', () => {
  const input = validateObservationInput({
    platform: 'simulator',
    goalTags: ['robotics'],
    visibleText: 'robot arm',
    screenshotDataUrl: 'data:image/png;base64,aGVsbG8=',
  });
  const result = parseObservationAnalysis(
    {
      matchedGoalTags: ['robotics', 'finance'],
      candidateTags: ['manipulation'],
      contentSummary: 'Robot arm demonstration.',
      confidence: 4,
      evidence: ['robot arm'],
    },
    input,
  );
  assert.deepEqual(result.matchedGoalTags, ['robotics']);
  assert.equal(result.confidence, 1);
  assert.equal(result.analysisCoverage, 'text_and_image');
});

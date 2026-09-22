import assert from 'node:assert/strict';
import test from 'node:test';
import {
  githubTopicSuggestions,
  seedTagSuggestions,
  translateGithubTopicToZh,
} from './tag-suggestions.ts';

test('seed suggestions retain curated tags inside selected domains', () => {
  const suggestions = seedTagSuggestions(['agents'], ['ai-infrastructure']);
  assert.ok(suggestions.length > 0);
  assert.ok(suggestions.every((suggestion) => suggestion.origin === 'seed'));
  assert.ok(!suggestions.some((suggestion) => suggestion.knownTagId === 'agents'));
});

test('live suggestions derive and rank public repository topics with evidence', () => {
  const suggestions = githubTopicSuggestions(
    [
      {
        html_url: 'https://github.com/example/one',
        topics: ['local-llm', 'open-source', 'edge-ai'],
      },
      {
        html_url: 'https://github.com/example/two',
        topics: ['local-llm', 'agents'],
      },
    ],
    ['agents'],
  );
  assert.equal(suggestions[0].id, 'live:github:local-llm');
  assert.equal(suggestions[0].origin, 'live');
  assert.match(suggestions[0].evidenceUrl ?? '', /^https:\/\/github\.com\//);
  assert.ok(!suggestions.some((suggestion) => suggestion.label === 'Open Source'));
  assert.ok(!suggestions.some((suggestion) => suggestion.label === 'Agents'));
});

test('tag labels adapt to the selected reading language and preserve unknown source labels', () => {
  assert.deepEqual(translateGithubTopicToZh('local-llm'), {
    label: '本地大模型',
    status: 'translated',
  });
  const chinese = githubTopicSuggestions(
    [{ html_url: 'https://github.com/example/one', topics: ['local-llm', 'brand-name'] }],
    [],
    'zh',
  );
  assert.equal(chinese.find((tag) => tag.id.endsWith('local-llm'))?.displayLabel, '本地大模型');
  assert.match(chinese.find((tag) => tag.id.endsWith('brand-name'))?.displayLabel ?? '', /原文/);
});

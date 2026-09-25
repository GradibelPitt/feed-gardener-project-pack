import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contents,
  defaultPreferences,
  domains,
  interestCategories,
  formatDuration,
  rankFeed,
  matchesHarvestPreferences,
  searchInterests,
} from './feed.ts';
import type { Preferences } from './feed.ts';

const profile = (overrides: Partial<Preferences> = {}): Preferences => ({
  ...defaultPreferences,
  ...overrides,
});

test('interest navigation resolves to unique persisted domain and tag IDs', () => {
  const categoryIds = interestCategories.map((category) => category.id);
  const domainIds = domains.map((domain) => domain.id);
  const tags = domains.flatMap((domain) => domain.tags);
  assert.equal(new Set(categoryIds).size, categoryIds.length);
  assert.equal(new Set(domainIds).size, domainIds.length);
  assert.equal(new Set(tags.map((tag) => tag.id)).size, tags.length);
  for (const category of interestCategories) {
    assert.ok(category.domains.length > 0);
    for (const domain of category.domains) {
      assert.ok(domains.includes(domain), 'Navigation and preferences must share the same catalog');
      assert.ok(domain.tags.length > 0);
      assert.ok(domain.tags.every((tag) => tag.id && tag.label && tag.labelEn));
    }
  }
  assert.equal(
    domains
      .find((domain) => domain.id === 'ai-infrastructure')
      ?.tags.find((tag) => tag.id === 'agents')?.labelEn,
    'Agents',
  );
});

test('domain-only interests drive search and matching until specific tags are chosen', () => {
  const domainOnly = profile({
    domains: ['backend-systems'],
    tags: [],
    customTags: [],
    onlySelectedTags: true,
    excludeUnselectedTags: true,
  });
  assert.deepEqual(searchInterests(domainOnly), [
    { labelEn: 'Backend & distributed systems', labelZh: '后端与分布式系统' },
  ]);
  assert.equal(
    matchesHarvestPreferences(
      { tags: ['Distributed systems'], source: 'Bilibili', author: 'creator' },
      domainOnly,
    ),
    true,
  );
  assert.equal(
    matchesHarvestPreferences(
      { tags: ['Game reviews'], source: 'Bilibili', author: 'creator' },
      domainOnly,
    ),
    false,
  );
  const specific = { ...domainOnly, tags: ['databases'] };
  assert.deepEqual(searchInterests(specific), [{ labelEn: 'Databases', labelZh: '数据库' }]);
});

test('nontechnical interests survive preference serialization without selecting technical fixtures', () => {
  const teaDomain = domains.find((domain) => domain.id === 'tea')!;
  const musicDomain = domains.find((domain) => domain.id === 'music-genres')!;
  const interests = profile({
    domains: [teaDomain.id],
    tags: [teaDomain.tags[0].id],
    relatedDomains: [],
    exploration: 0,
    blockedTags: [musicDomain.tags[0].id],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(interests)), interests);
  assert.deepEqual(
    rankFeed(interests),
    [],
    'An expanded preference catalog must not fabricate matching content',
  );
});

test('all synthetic fixtures have stable unique IDs and valid taxonomy', () => {
  assert.equal(new Set(contents.map((item) => item.id)).size, contents.length);
  const domainIds = new Set(domains.map((domain) => domain.id));
  const tagIds = new Set(domains.flatMap((domain) => domain.tags.map((tag) => tag.id)));
  for (const item of contents) {
    assert.ok(domainIds.has(item.domain));
    assert.ok(item.tags.every((tag) => tagIds.has(tag)));
    assert.match(item.summaryEn, /^Demo fixture:/);
  }
});

test('same explicit inputs always produce the same feed without mutating preferences', () => {
  const preferences = structuredClone(defaultPreferences);
  const before = structuredClone(preferences);
  const first = rankFeed(preferences);
  assert.deepEqual(first, rankFeed(preferences));
  assert.deepEqual(preferences, before);
  assert.ok(first.length >= 9 && first.length <= 12);
  assert.ok(first.every((item) => item.reasons.length && item.reasonsEn.length));
});

test('hard source, tag, and hidden exclusions are honored even for saved content', () => {
  const result = rankFeed(profile({ blockedSources: ['YouTube'], blockedTags: ['agents'] }), {
    savedOnly: true,
    savedIds: contents.map((item) => item.id),
    hiddenIds: ['fg-003'],
  });
  assert.ok(result.length > 0);
  assert.ok(
    result.every(
      (item) => item.source !== 'YouTube' && !item.tags.includes('agents') && item.id !== 'fg-003',
    ),
  );
});

test('blocking an author excludes every item from that author across platforms', () => {
  const preferences = profile({ blockedSources: ['Kernel Lab'] });
  assert.ok(rankFeed(preferences).every((item) => item.creator !== 'Kernel Lab'));
  assert.deepEqual(
    rankFeed(preferences, { savedOnly: true, savedIds: ['fg-001', 'fg-009', 'fg-010'] }),
    [],
  );
});

test('a saved exploratory item stays visible without any saved core items', () => {
  const result = rankFeed(profile(), { savedOnly: true, savedIds: ['fg-008'] });
  assert.deepEqual(
    result.map((item) => item.id),
    ['fg-008'],
  );
  assert.equal(result[0].exploratory, false);
  assert.equal(result[0].reasonsEn[0], 'Saved by you');
});

test('saved collection survives interest changes and is not restricted by author quotas', () => {
  const preferences = profile({ domains: [], tags: [], relatedDomains: [], exploration: 0 });
  const result = rankFeed(preferences, {
    savedOnly: true,
    savedIds: ['fg-001', 'fg-009', 'fg-010', 'fg-018'],
  });
  assert.equal(result.length, 4);
  assert.equal(result.filter((item) => item.creator === 'Kernel Lab').length, 3);
  assert.ok(result.some((item) => item.id === 'fg-018'));
  assert.equal(
    rankFeed(preferences, {
      savedOnly: true,
      savedIds: ['fg-001', 'fg-009', 'fg-010'],
      source: 'Bluesky',
    }).length,
    1,
  );
  assert.equal(
    rankFeed(preferences, {
      savedOnly: true,
      savedIds: ['fg-001', 'fg-009', 'fg-010'],
      hiddenIds: ['fg-001'],
      query: 'context',
    }).length,
    1,
  );
});

test('zero exploration never backfills from related domains', () => {
  const preferences = profile({ exploration: 0 });
  const result = rankFeed(preferences, { limit: 20 });
  assert.ok(result.length < 20);
  assert.ok(result.every((item) => !item.exploratory && preferences.domains.includes(item.domain)));
});

test('selected-tags mode excludes same-domain and exploratory nonmatches, and can be turned off', () => {
  const preferences = profile({ tags: ['agents'], onlySelectedTags: true, exploration: 50 });
  const result = rankFeed(preferences);
  assert.ok(result.length > 0);
  assert.ok(result.every((item) => item.tags.includes('agents')));
  assert.ok(
    result.some((item) => item.tags.some((tag) => tag !== 'agents')),
    'Unselected secondary tags are not explicit exclusions',
  );
  assert.deepEqual(rankFeed({ ...preferences, tags: [] }), []);
  assert.deepEqual(rankFeed({ ...preferences, blockedTags: ['agents'] }), []);
  assert.ok(
    rankFeed({ ...preferences, onlySelectedTags: false }).some(
      (item) => !item.tags.includes('agents'),
    ),
  );
  assert.equal(rankFeed(preferences, { savedOnly: true, savedIds: ['fg-001'] })[0]?.id, 'fg-001');
});

test('all-selected and no-unselected rules are independent and composable', () => {
  const preferences = profile({
    domains: ['ai-infrastructure'],
    tags: ['agents', 'evaluation'],
    onlySelectedTags: true,
    exploration: 0,
  });
  const both = rankFeed({
    ...preferences,
    requireAllSelectedTags: true,
    excludeUnselectedTags: true,
  });
  assert.ok(both.length > 0);
  assert.ok(both.every((item) => item.tags.includes('agents') && item.tags.includes('evaluation')));
  assert.ok(both.every((item) => item.tags.every((tag) => preferences.tags.includes(tag))));
  assert.deepEqual(rankFeed({ ...preferences, tags: ['agents'], excludeUnselectedTags: true }), []);
  assert.deepEqual(
    rankFeed({ ...preferences, tags: ['agents', 'rag'], requireAllSelectedTags: true }),
    [],
  );
});

test('public-source filtering uses explicit metadata tags, exclusions, and selected custom tags', () => {
  const preferences = profile({ tags: ['local-inference'], onlySelectedTags: true });
  const item = { tags: ['Local inference', 'quantization'], source: 'GitHub', author: 'example' };
  assert.equal(matchesHarvestPreferences(item, preferences), true);
  assert.equal(
    matchesHarvestPreferences({ ...item, tags: ['LOCAL_INFERENCE'] }, preferences),
    true,
  );
  assert.equal(matchesHarvestPreferences({ ...item, tags: ['Agents'] }, preferences), false);
  assert.equal(matchesHarvestPreferences({ ...item, tags: [] }, preferences), false);
  assert.equal(
    matchesHarvestPreferences(item, { ...preferences, blockedTags: ['quantization'] }),
    false,
  );
  assert.equal(
    matchesHarvestPreferences(item, { ...preferences, blockedSources: ['GitHub'] }),
    false,
  );
  assert.equal(
    matchesHarvestPreferences(item, {
      ...preferences,
      onlySelectedTags: false,
      blockedSources: ['example'],
    }),
    false,
  );
  assert.equal(
    matchesHarvestPreferences(
      { ...item, tags: ['Agents'] },
      { ...preferences, onlySelectedTags: false },
    ),
    true,
  );
  const custom = {
    id: 'live:github:custom-topic',
    label: 'Custom topic',
    labelEn: 'Custom topic',
    labelZh: '自选主题',
    translationStatus: 'translated' as const,
    source: 'github_live' as const,
    evidenceUrl: 'https://github.com/topics/custom-topic',
  };
  assert.equal(
    matchesHarvestPreferences(
      { ...item, tags: ['custom-topic'] },
      { ...preferences, tags: [], customTags: [custom] },
    ),
    true,
  );
});

test('public-source strict rules match known interest labels and ignore source labels', () => {
  const preferences = profile({
    tags: ['agents', 'rag'],
    requireAllSelectedTags: true,
    excludeUnselectedTags: true,
  });
  const item = { tags: ['GitHub', 'Agent', 'RAG'], source: 'GitHub', author: 'example' };
  assert.equal(matchesHarvestPreferences(item, preferences), true);
  assert.equal(
    matchesHarvestPreferences({ ...item, tags: ['GitHub', 'Agent'] }, preferences),
    false,
  );
  assert.equal(
    matchesHarvestPreferences({ ...item, tags: [...item.tags, 'Quantization'] }, preferences),
    false,
  );
  assert.equal(matchesHarvestPreferences(item, { ...preferences, blockedTags: ['agents'] }), false);
});

test('exploration uses only explicitly allowed related domains and respects its share', () => {
  const preferences = profile({ relatedDomains: ['backend-systems'], exploration: 20 });
  const result = rankFeed(preferences, { limit: 10 });
  const explored = result.filter((item) => item.exploratory);
  assert.ok(explored.length > 0);
  assert.ok(explored.every((item) => item.domain === 'backend-systems'));
  assert.ok(explored.length / result.length <= 0.2);
  assert.ok(
    rankFeed(profile({ relatedDomains: [], exploration: 80 })).every((item) => !item.exploratory),
  );
});

test('every author is capped at two across the combined feed', () => {
  const result = rankFeed(
    profile({ domains: domains.map((domain) => domain.id), exploration: 0 }),
    { limit: 100 },
  );
  const counts = new Map<string, number>();
  for (const item of result) counts.set(item.creator, (counts.get(item.creator) ?? 0) + 1);
  assert.equal(counts.get('Kernel Lab'), 2);
  assert.ok([...counts.values()].every((count) => count <= 2));
});

test('source, bilingual search, saved-only, and finite limit compose', () => {
  const result = rankFeed(profile(), {
    source: 'RSS',
    query: '检索',
    savedOnly: true,
    savedIds: ['fg-003'],
    limit: 1,
  });
  assert.deepEqual(
    result.map((item) => item.id),
    ['fg-003'],
  );
  assert.deepEqual(rankFeed(profile(), { savedOnly: true, savedIds: [] }), []);
  assert.deepEqual(rankFeed(profile(), { query: 'no such fixture' }), []);
  assert.deepEqual(rankFeed(profile(), { limit: 0 }), []);
});

test('explicit tag matches carry truthful explanations and improve ranking', () => {
  const result = rankFeed(profile({ exploration: 0 }));
  const local = result.find((item) => item.id === 'fg-001')!;
  assert.ok(local.reasons.some((reason) => reason.includes('本地推理')));
  assert.ok(local.reasonsEn.some((reason) => reason.includes('Local inference')));
  assert.ok(local.score > result.find((item) => item.id === 'fg-012')!.score);
});

test('an empty profile does not silently subscribe the user to anything', () => {
  assert.deepEqual(rankFeed(profile({ domains: [], tags: [], exploration: 100 })), []);
});

test('duration formatting handles hours and invalid numbers', () => {
  assert.equal(formatDuration(18), '18 min');
  assert.equal(formatDuration(75), '1h 15m');
  assert.equal(formatDuration(60), '1h');
  assert.equal(formatDuration(-1), '0 min');
  assert.equal(formatDuration(Number.NaN), '0 min');
});

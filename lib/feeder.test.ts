import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultPreferences, type Preferences } from './feed.ts';
import {
  effectiveTagJev,
  matchedHarvestTagIds,
  rankHarvestCandidates,
  readFeederEvents,
  readTagJev,
  type FeederEvent,
} from './feeder.ts';
import type { HarvestItem } from './crawler/types.ts';

const now = Date.parse('2026-09-21T12:00:00.000Z');
const profile = (overrides: Partial<Preferences> = {}): Preferences => ({
  ...structuredClone(defaultPreferences),
  tags: ['agents', 'rag'],
  domains: ['ai-infrastructure'],
  onlySelectedTags: false,
  exploration: 20,
  ...overrides,
});
function item(id: string, tag: string, url = `https://example.org/${id}`): HarvestItem {
  return {
    id,
    section: 'opensource',
    source: 'GitHub',
    title: id,
    summary: '',
    author: 'example',
    url,
    publishedAt: '2026-09-20T12:00:00.000Z',
    tags: [tag],
    domain: 'Open source',
    domainKeywords: [],
    provenance: { mode: 'public_feed', sourceUrl: url, fetchedAt: '2026-09-21T12:00:00.000Z' },
  };
}
const signal = (itemKey: string, signal: FeederEvent['signal'], tagIds: string[]): FeederEvent => ({
  id: 'event-1',
  actor: 'user',
  itemKey,
  signal,
  tagIds,
  at: new Date(now).toISOString(),
});

test('legacy preferences and event storage are bounded and user-only', () => {
  assert.deepEqual(readTagJev({ agents: 2, rag: -1, unknown: 0.6, cli: NaN }), {
    agents: 1,
    rag: 0,
  });
  assert.deepEqual(
    readFeederEvents([{ ...signal('https://example.org/a', 'save', ['agents']), actor: 'agent' }]),
    [],
  );
  assert.deepEqual(
    readFeederEvents([{ ...signal('https://example.org/a', 'save', ['agents', 'unknown']) }])[0]
      .tagIds,
    ['agents'],
  );
});

test('public metadata matches catalog labels without inventing content relevance', () => {
  assert.deepEqual(matchedHarvestTagIds(item('one', 'Agent')), ['agents']);
  assert.deepEqual(matchedHarvestTagIds(item('two', 'unrelated')), []);
  assert.deepEqual(rankHarvestCandidates([item('x', 'unrelated')], profile(), [], { now }), []);
});

test('a selected area without tags admits and ranks its actual topic metadata', () => {
  const selected = profile({
    domains: ['backend-systems'],
    tags: [],
    customTags: [],
    onlySelectedTags: true,
    excludeUnselectedTags: true,
  });
  const result = rankHarvestCandidates(
    [item('distributed', 'Distributed systems'), item('unrelated', 'Game reviews')],
    selected,
    [],
    { now },
  );
  assert.deepEqual(
    result.map((candidate) => candidate.item.id),
    ['distributed'],
  );
  assert.equal(result[0].exploratory, false);
});

test('hard exclusions, URL deduplication and selected-only mode win over exploration', () => {
  const items = [
    item('one', 'Agent'),
    item('duplicate', 'Agent', 'https://example.org/one/'),
    item('blocked', 'RAG'),
    item('explore', 'Quantization'),
  ];
  const result = rankHarvestCandidates(
    items,
    profile({ blockedTags: ['rag'], onlySelectedTags: true, exploration: 50 }),
    [],
    { now },
  );
  assert.deepEqual(
    result.map((candidate) => candidate.item.id),
    ['one'],
  );
  assert.equal(result[0].exploratory, false);
  assert.deepEqual(
    rankHarvestCandidates(items, profile({ blockedSources: ['GitHub'] }), [], { now }),
    [],
  );
});

test('Discover candidate ranking obeys all-selected and no-unselected rules', () => {
  const items = [
    { ...item('both', 'Agent'), tags: ['GitHub', 'Agent', 'RAG'] },
    item('one', 'Agent'),
    { ...item('extra', 'Agent'), tags: ['Agent', 'RAG', 'Quantization'] },
  ];
  const result = rankHarvestCandidates(
    items,
    profile({ requireAllSelectedTags: true, excludeUnselectedTags: true }),
    [],
    { now },
  );
  assert.deepEqual(
    result.map((candidate) => candidate.item.id),
    ['both'],
  );
});

test('save changes the next ranking gently, while hide and undo affect only this feed', () => {
  const items = [item('agent', 'Agent'), item('rag', 'RAG')];
  const before = rankHarvestCandidates(items, profile(), [], { now });
  const saved = signal('https://example.org/rag', 'save', ['rag']);
  const after = rankHarvestCandidates(items, profile(), [saved], { now });
  assert.equal(before[0].item.id, 'agent');
  assert.equal(after[0].item.id, 'rag');
  assert.equal(effectiveTagJev('rag', profile(), [saved], now), 0.75);
  const hidden = signal('https://example.org/rag', 'hide', ['rag']);
  assert.deepEqual(
    rankHarvestCandidates(items, profile(), [saved, hidden], { now }).map((entry) => entry.item.id),
    ['agent'],
  );
  assert.equal(rankHarvestCandidates(items, profile(), [saved], { now }).length, 2);
});

test('exploration uses bounded slots and never bypasses explicit blocked tags', () => {
  const items = [
    ...Array.from({ length: 9 }, (_, index) => item(`core-${index}`, 'Agent')),
    item('adjacent', 'Quantization'),
    item('blocked', 'Databases'),
  ];
  const result = rankHarvestCandidates(items, profile({ blockedTags: ['databases'] }), [], {
    now,
    limit: 10,
  });
  assert.equal(result.filter((entry) => entry.exploratory).length, 1);
  assert.ok(result.every((entry) => entry.item.id !== 'blocked'));
});

test('source and creator feedback is a bounded local preference, not a platform action', () => {
  const sameCreator = item('same-creator', 'Agent');
  const differentCreator = { ...item('other-creator', 'Agent'), author: 'another author' };
  const saved = {
    ...signal('https://example.org/saved', 'save', ['agents']),
    source: 'GitHub',
    author: 'example',
  };
  const result = rankHarvestCandidates([differentCreator, sameCreator], profile(), [saved], {
    now,
  });
  assert.equal(result[0].item.id, 'same-creator');
  assert.ok(result[0].reasons.some((reason) => reason.includes('positive feedback')));
});

test('unused exploration slots are filled with eligible selected-topic items', () => {
  const items = Array.from({ length: 5 }, (_, index) => item(`core-${index}`, 'Agent'));
  assert.equal(
    rankHarvestCandidates(items, profile({ exploration: 50 }), [], { now, limit: 5 }).length,
    5,
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inferResourceType,
  nextDefaultCollectionName,
  readResourceCollections,
  readResourceRecords,
  resourceFromHarvest,
  resourceFromLink,
  resourceUrlKey,
  resourceWebsite,
} from './resources.ts';

test('harvested public metadata becomes a local knowledge-base record', () => {
  const record = resourceFromHarvest(
    {
      id: 'item-1',
      section: 'opensource',
      source: 'GitHub',
      title: 'A useful project',
      summary: 'Public metadata.',
      url: 'https://github.com/example/project',
      author: 'example',
      publishedAt: null,
      domain: 'Developer tools',
      domainKeywords: ['developer tool'],
      tags: ['agents', 'agents', 'cli'],
      provenance: {
        mode: 'official_api',
        sourceUrl: 'https://api.github.com/repos/example/project',
        fetchedAt: '2026-09-20T11:59:00Z',
      },
    },
    new Date('2026-09-20T12:00:00Z'),
  );
  assert.equal(record.knowledgeState, 'inbox');
  assert.deepEqual(record.tags, ['agents', 'cli']);
  assert.equal(record.savedAt, '2026-09-20T12:00:00.000Z');
  assert.equal(record.resourceType, 'repository');
});

test('stored knowledge-base records reject unsafe links and migrate older records', () => {
  const result = readResourceRecords([
    { id: 'bad', title: 'Bad', url: 'javascript:alert(1)' },
    {
      id: 'ok',
      title: 'Good',
      url: 'https://arxiv.org/abs/1234',
      source: 'arXiv',
      knowledgeState: 'unknown',
    },
    { id: 'http', title: 'HTTP', url: 'http://example.com/page', resourceType: 'audio' },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].knowledgeState, 'inbox');
  assert.equal(result[0].resourceType, 'paper');
  assert.equal(result[0].collectionId, null);
  assert.equal(result[1].resourceType, 'audio');
});

test('named collections survive storage reads and reject duplicate names', () => {
  const collections = readResourceCollections([
    { id: 'one', name: '  AI videos  ', createdAt: '2026-09-24T00:00:00Z' },
    { id: 'two', name: 'ai videos' },
    { id: 'three', name: 'Papers' },
    { id: 'four', name: '  ' },
  ]);
  assert.deepEqual(
    collections.map((collection) => collection.name),
    ['AI videos', 'Papers'],
  );
  const [record] = readResourceRecords([
    { id: 'saved', title: 'Video', url: 'https://bilibili.com/video/BV123', collectionId: 'one' },
  ]);
  assert.equal(record.collectionId, 'one');
});

test('unnamed collections receive the next default folder number without colliding with custom names', () => {
  const existing = readResourceCollections([
    { id: 'one', name: 'default folder 1' },
    { id: 'custom', name: 'Articles' },
    { id: 'three', name: 'DEFAULT FOLDER 3' },
  ]);
  assert.equal(nextDefaultCollectionName([]), 'default folder 1');
  assert.equal(nextDefaultCollectionName(existing), 'default folder 4');
  assert.equal(
    nextDefaultCollectionName([
      ...existing,
      { id: 'four', name: 'default folder 4', createdAt: '' },
    ]),
    'default folder 5',
  );
});

test('saved video records retain previews and migrate older Bilibili links', () => {
  const newBilibili = resourceFromHarvest({
    id: 'bilibili-new',
    section: 'social',
    source: 'Bilibili',
    title: 'New video',
    summary: '',
    author: 'creator',
    url: 'https://www.bilibili.com/video/BV1Sqhz6uEHT',
    publishedAt: null,
    tags: [],
    domain: 'Other',
    domainKeywords: [],
    imageUrl: 'https://i0.hdslb.com/bfs/archive/cover.jpg',
    embedUrl: 'https://player.bilibili.com/player.html?bvid=BV1Sqhz6uEHT&autoplay=0',
    provenance: {
      mode: 'public_api',
      sourceUrl: 'https://api.bilibili.com/',
      fetchedAt: '2026-09-24T00:00:00Z',
    },
  });
  assert.equal(readResourceRecords([newBilibili])[0].imageUrl, newBilibili.imageUrl);
  const [olderBilibili, olderYouTube] = readResourceRecords([
    {
      id: 'bilibili-old',
      title: 'Bilibili video',
      url: 'https://www.bilibili.com/video/BV1Sqhz6uEHT',
      source: 'Bilibili',
    },
    {
      id: 'youtube-old',
      title: 'YouTube video',
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
      source: 'YouTube',
    },
  ]);
  assert.equal(
    olderBilibili.embedUrl,
    'https://player.bilibili.com/player.html?bvid=BV1Sqhz6uEHT&autoplay=0',
  );
  assert.equal(olderYouTube.imageUrl, 'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg');
  assert.equal(olderYouTube.embedUrl, undefined);
});

test('any external web link can be saved locally with a website and editable type', () => {
  const record = resourceFromLink(
    ' https://www.example.org/path?x=1#section ',
    '',
    'article',
    new Date('2026-09-20T12:00:00Z'),
  );
  assert.ok(record);
  assert.equal(record.title, 'example.org');
  assert.equal(record.source, 'example.org');
  assert.equal(record.resourceType, 'article');
  assert.equal(record.savedAt, '2026-09-20T12:00:00.000Z');
  assert.equal(resourceWebsite(record.url), 'example.org');
  assert.equal(
    resourceUrlKey(record.url),
    resourceUrlKey('https://www.example.org/path?x=1#other'),
  );
  assert.equal(inferResourceType('https://unknown.example/movie.mp4'), 'video');
  assert.equal(inferResourceType('https://unknown.example/anything'), 'webpage');
});

test('pasted links reject executable schemes, credentials, and invalid URLs', () => {
  for (const url of [
    'javascript:alert(1)',
    'file:///tmp/a',
    'https://user:pass@example.com',
    'not a link',
  ]) {
    assert.equal(resourceFromLink(url), null);
  }
});

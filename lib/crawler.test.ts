import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArxivFeed } from './crawler/arxiv.ts';
import { classifyDomain } from './crawler/core.ts';
import { parseGithubTrendingRss } from './crawler/github.ts';
import { detectSocialPlatform, SocialResolveError } from './crawler/social.ts';
import { defaultPreferences, matchesHarvestPreferences } from './feed.ts';
import { fetchYouTubeSearch, youtubeEmbedUrl } from './crawler/youtube.ts';

test('classifier keeps vector database content out of the short RAG token false positive', () => {
  const [domain, matches] = classifyDomain(
    'TurboVec: a fast vector index',
    'A vector database with Python bindings, faster than FAISS.',
  );
  assert.equal(domain, '数据与向量库');
  assert.ok(matches.includes('vector index') || matches.includes('vector database'));
});

test('arXiv Atom parser filters old and unrelated records and keeps provenance', () => {
  const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
    <entry><id>https://arxiv.org/abs/2609.12345</id><title>Agent evaluation for code tools</title>
      <summary>A benchmark for tool calling agents.</summary><published>2026-09-19T10:00:00Z</published>
      <author><name>Ada Example</name></author><category term="cs.AI" />
      <link rel="alternate" href="https://arxiv.org/abs/2609.12345" /></entry>
    <entry><id>https://arxiv.org/abs/2201.00001</id><title>Old LLM work</title>
      <summary>language model</summary><published>2022-01-01T00:00:00Z</published></entry>
  </feed>`;
  const items = parseArxivFeed(xml, 14, new Date('2026-09-20T12:00:00Z'));
  assert.equal(items.length, 1);
  assert.equal(items[0].source, 'arXiv');
  assert.equal(items[0].author, 'Ada Example');
  assert.equal(items[0].provenance.mode, 'official_api');
  const preferences = { ...defaultPreferences, onlySelectedTags: true, tags: ['agents'] };
  assert.equal(matchesHarvestPreferences(items[0], preferences), true);
  assert.equal(
    matchesHarvestPreferences(items[0], { ...preferences, blockedTags: ['agents'] }),
    false,
  );
});

test('GitHub RSS parser normalizes repositories and removes markup', () => {
  const xml = `<?xml version="1.0"?><rss><channel><item>
    <title>openai / example</title><link>https://github.com/openai/example</link>
    <description><![CDATA[<p>An agentic developer tool</p>]]></description>
    <pubDate>Sat, 19 Sep 2026 10:00:00 GMT</pubDate>
  </item></channel></rss>`;
  const items = parseGithubTrendingRss(xml, new Date('2026-09-20T12:00:00Z'));
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'openai/example');
  assert.equal(items[0].url, 'https://github.com/openai/example');
  assert.equal(items[0].summary, 'An agentic developer tool');
});

test('social adapter only accepts HTTPS URLs on known platform hosts', () => {
  assert.equal(detectSocialPlatform('https://www.tiktok.com/@a/video/1').platform, 'tiktok');
  assert.equal(detectSocialPlatform('https://x.com/a/status/1').platform, 'x');
  assert.equal(detectSocialPlatform('https://www.instagram.com/p/abc/').platform, 'instagram');
  assert.throws(
    () => detectSocialPlatform('https://x.com.evil.example/status/1'),
    (error) => error instanceof SocialResolveError && error.code === 'HOST_NOT_ALLOWED',
  );
  assert.throws(
    () => detectSocialPlatform('http://x.com/a/status/1'),
    (error) => error instanceof SocialResolveError && error.code === 'HTTPS_REQUIRED',
  );
});

test('YouTube search maps official title and thumbnail and ignores malformed video ids', async () => {
  const before = process.env.YOUTUBE_API_KEY;
  const fetchBefore = globalThis.fetch;
  process.env.YOUTUBE_API_KEY = 'test-key';
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'www.googleapis.com');
    if (url.pathname.endsWith('/videos'))
      return Response.json({
        items: [{ id: 'abcdefghijk', status: { embeddable: true, madeForKids: false } }],
      });
    assert.equal(url.searchParams.get('q'), 'Robotics');
    return Response.json({
      items: [
        {
          id: { videoId: 'abcdefghijk' },
          snippet: {
            title: 'Robot demo',
            description: 'Robotics',
            channelTitle: 'Lab',
            thumbnails: { medium: { url: 'https://i.ytimg.com/example.jpg' } },
          },
        },
        { id: { videoId: 'invalid' }, snippet: { title: 'Ignore me' } },
      ],
    });
  };
  try {
    const items = await fetchYouTubeSearch(['Robotics']);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Robot demo');
    assert.equal(items[0].imageUrl, 'https://i.ytimg.com/example.jpg');
    assert.equal(
      items[0].embedUrl,
      'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=0',
    );
    assert.equal(items[0].provenance.mode, 'official_api');
    assert.equal(youtubeEmbedUrl('https://youtu.be/abcdefghijk'), items[0].embedUrl);
    assert.equal(youtubeEmbedUrl('https://youtube.com.evil.example/watch?v=abcdefghijk'), null);
  } finally {
    globalThis.fetch = fetchBefore;
    if (before === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = before;
  }
});

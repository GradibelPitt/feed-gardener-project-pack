import { classifyDomain, cleanText, fetchWithTimeout, keywordTags, stableId } from './core.ts';
import type { HarvestItem } from './types.ts';

const HN_API = 'https://hacker-news.firebaseio.com/v0';

type HnStory = {
  id?: number;
  by?: string;
  descendants?: number;
  score?: number;
  time?: number;
  title?: string;
  type?: string;
  url?: string;
  deleted?: boolean;
  dead?: boolean;
};

export async function fetchHackerNews(): Promise<HarvestItem[]> {
  const listResponse = await fetchWithTimeout(`${HN_API}/beststories.json`, {}, 10_000);
  if (!listResponse.ok) throw new Error(`Hacker News list HTTP ${listResponse.status}`);
  const ids = ((await listResponse.json()) as unknown[])
    .filter((id): id is number => typeof id === 'number')
    .slice(0, 18);
  const fetchedAt = new Date().toISOString();
  const rows = await Promise.allSettled(
    ids.map(async (id) => {
      const response = await fetchWithTimeout(`${HN_API}/item/${id}.json`, {}, 8_000);
      if (!response.ok) throw new Error(`story ${id} HTTP ${response.status}`);
      return (await response.json()) as HnStory;
    }),
  );

  return rows.flatMap((result): HarvestItem[] => {
    if (result.status !== 'fulfilled') return [];
    const story = result.value;
    if (!story.id || story.type !== 'story' || story.deleted || story.dead || !story.title)
      return [];
    const url = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
    const discussionUrl = `https://news.ycombinator.com/item?id=${story.id}`;
    const summary = story.url
      ? `Hacker News discussion: ${discussionUrl}`
      : 'Hacker News community discussion';
    const [domain, domainKeywords] = classifyDomain(story.title, summary);
    return [
      {
        id: `hn-${stableId(String(story.id))}`,
        section: 'opensource',
        source: 'Hacker News',
        title: cleanText(story.title),
        summary,
        author: cleanText(story.by) || 'Hacker News',
        url,
        publishedAt: story.time ? new Date(story.time * 1000).toISOString() : null,
        tags: [...new Set(['Hacker News', ...keywordTags(story.title)])].slice(0, 6),
        domain,
        domainKeywords,
        metrics: { score: story.score, comments: story.descendants },
        provenance: {
          mode: 'official_api',
          sourceUrl: `${HN_API}/beststories.json`,
          fetchedAt,
        },
      },
    ];
  });
}

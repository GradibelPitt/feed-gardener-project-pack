import { domains } from '../feed.ts';
import { classifyDomain, cleanText, fetchWithTimeout, keywordTags } from './core.ts';
import type { HarvestItem } from './types.ts';

const SEARCH_URL = 'https://api.bilibili.com/x/web-interface/wbi/search/type';
const catalog = domains.flatMap((domain) => domain.tags);
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().trim();

type SearchVideo = {
  bvid?: unknown;
  title?: unknown;
  description?: unknown;
  author?: unknown;
  pic?: unknown;
  tag?: unknown;
  pubdate?: unknown;
};

export function bilibiliSearchTerms(tags: string[], localizedTags: string[] = []): string[] {
  return [
    ...new Set(
      tags.slice(0, 2).flatMap((value, index) => {
        const original = value.normalize('NFKC').trim().slice(0, 80);
        if (!original) return [];
        const known = catalog.find((tag) =>
          [tag.id, tag.label, tag.labelEn].some(
            (label) => normalize(label) === normalize(original),
          ),
        );
        const localized = localizedTags[index]?.normalize('NFKC').trim().slice(0, 80);
        return known
          ? [known.labelEn, known.label]
          : localized
            ? [original, localized]
            : [original];
      }),
    ),
  ].slice(0, 4);
}

function catalogMatches(text: string): string[] {
  const normalized = normalize(text);
  return catalog
    .filter((tag) =>
      [tag.label, tag.labelEn].some((label) => {
        const needle = normalize(label);
        if (!needle) return false;
        if (/^[a-z0-9 ]+$/i.test(needle)) {
          return new RegExp(
            `(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`,
            'i',
          ).test(normalized);
        }
        return normalized.includes(needle);
      }),
    )
    .map((tag) => tag.id);
}

export function bilibiliEmbedUrl(bvid: string): string | null {
  return /^BV[0-9A-Za-z]{10}$/.test(bvid)
    ? `https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=0`
    : null;
}

export function parseBilibiliSearch(
  payload: unknown,
  fetchedAt = new Date().toISOString(),
): HarvestItem[] {
  const response = payload as { code?: unknown; data?: { result?: unknown } } | null;
  if (response?.code !== 0 || !Array.isArray(response.data?.result))
    throw new Error('Bilibili search returned invalid data');
  return response.data.result.flatMap((entry: SearchVideo) => {
    const bvid = typeof entry.bvid === 'string' ? entry.bvid : '';
    const embedUrl = bilibiliEmbedUrl(bvid);
    if (!embedUrl) return [];
    const title = cleanText(entry.title).slice(0, 320);
    if (!title) return [];
    const summary = cleanText(entry.description).slice(0, 620);
    const rawTags =
      typeof entry.tag === 'string'
        ? entry.tag
            .split(',')
            .map((tag) => cleanText(tag).slice(0, 64))
            .filter(Boolean)
        : [];
    const [domain, domainKeywords] = classifyDomain(title, summary);
    const pic = typeof entry.pic === 'string' ? entry.pic : '';
    const imageUrl = pic.startsWith('//') ? `https:${pic}` : pic;
    const publishedAt =
      typeof entry.pubdate === 'number' && Number.isFinite(entry.pubdate)
        ? new Date(entry.pubdate * 1000).toISOString()
        : null;
    return [
      {
        id: `bilibili-${bvid}`,
        section: 'social' as const,
        source: 'Bilibili' as const,
        title,
        summary,
        author: cleanText(entry.author).slice(0, 200),
        url: `https://www.bilibili.com/video/${bvid}`,
        publishedAt,
        tags: [
          ...new Set([
            'Bilibili',
            ...catalogMatches([title, ...rawTags].join(' ')),
            ...rawTags,
            ...keywordTags(`${title} ${summary}`),
          ]),
        ].slice(0, 16),
        domain,
        domainKeywords,
        ...(imageUrl.startsWith('https://') ? { imageUrl } : {}),
        embedUrl,
        provenance: { mode: 'public_api' as const, sourceUrl: SEARCH_URL, fetchedAt },
      },
    ];
  });
}

export async function fetchBilibiliSearch(
  tags: string[],
  localizedTags: string[] = [],
): Promise<HarvestItem[]> {
  const terms = bilibiliSearchTerms(tags, localizedTags);
  if (!terms.length) return [];
  const outcomes = await Promise.allSettled(
    terms.map(async (term) => {
      const endpoint = new URL(SEARCH_URL);
      endpoint.searchParams.set('search_type', 'video');
      endpoint.searchParams.set('keyword', term);
      endpoint.searchParams.set('page', '1');
      const response = await fetchWithTimeout(endpoint.toString(), {
        headers: { Referer: 'https://search.bilibili.com/' },
      });
      if (!response.ok) throw new Error(`Bilibili search returned HTTP ${response.status}`);
      return parseBilibiliSearch(await response.json()).slice(0, 12);
    }),
  );
  const successes = outcomes.filter(
    (result): result is PromiseFulfilledResult<HarvestItem[]> => result.status === 'fulfilled',
  );
  if (!successes.length) throw new Error('Bilibili search could not be completed');
  return [
    ...new Map(successes.flatMap((result) => result.value).map((item) => [item.id, item])).values(),
  ].slice(0, 32);
}

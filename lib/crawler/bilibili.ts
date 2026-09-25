import { domains } from '../feed.ts';
import { classifyDomain, cleanText, fetchWithTimeout, keywordTags } from './core.ts';
import type { HarvestItem } from './types.ts';

const SEARCH_URL = 'https://api.bilibili.com/x/web-interface/wbi/search/type';
const SEARCH_HOME_URL = 'https://search.bilibili.com/';
const ANONYMOUS_SESSION_URL = 'https://api.bilibili.com/x/frontend/finger/spi';
const BILIBILI_HEADERS = {
  Referer: SEARCH_HOME_URL,
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};
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
  const response = payload as {
    code?: unknown;
    data?: { result?: unknown; v_voucher?: unknown };
  } | null;
  if (response?.code === -352 || response?.data?.v_voucher)
    throw new Error('Bilibili requires verification for this connection; try again later');
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

async function searchPage(
  term: string,
  page: number,
  before?: number,
  session?: { cookie: string | null },
): Promise<{ items: HarvestItem[]; hasMore: boolean }> {
  const endpoint = new URL(SEARCH_URL);
  endpoint.searchParams.set('search_type', 'video');
  endpoint.searchParams.set('keyword', term);
  endpoint.searchParams.set('order', 'pubdate');
  endpoint.searchParams.set('page', String(page));
  if (before !== undefined) {
    endpoint.searchParams.set('pubtime_begin_s', '1');
    endpoint.searchParams.set('pubtime_end_s', String(before));
  }
  const search = () =>
    fetchWithTimeout(endpoint.toString(), {
      headers: {
        ...BILIBILI_HEADERS,
        ...(session?.cookie ? { Cookie: session.cookie } : {}),
      },
    });
  let response = await search();
  if (response.status === 412 && session && !session.cookie) {
    // Bilibili sometimes requires an anonymous search session from cloud hosts.
    session.cookie = await anonymousSearchCookie();
    response = await search();
  }
  if (!response.ok) throw new Error(`Bilibili search returned HTTP ${response.status}`);
  const payload = await response.json();
  const items = parseBilibiliSearch(payload);
  const numPages = Number(payload?.data?.numPages);
  return { items, hasMore: Number.isInteger(numPages) ? page < numPages : items.length >= 20 };
}

async function anonymousSearchCookie(): Promise<string> {
  const fingerprint = await fetchWithTimeout(
    ANONYMOUS_SESSION_URL,
    { headers: BILIBILI_HEADERS },
    6_000,
  );
  if (fingerprint.ok) {
    const payload = (await fingerprint.json()) as {
      code?: unknown;
      data?: { b_3?: unknown; b_4?: unknown };
    };
    if (
      payload.code === 0 &&
      typeof payload.data?.b_3 === 'string' &&
      typeof payload.data?.b_4 === 'string'
    ) {
      return `buvid3=${payload.data.b_3}; buvid4=${payload.data.b_4}; b_nut=${Math.floor(Date.now() / 1000)}`;
    }
  }
  const response = await fetchWithTimeout(
    SEARCH_HOME_URL,
    { headers: BILIBILI_HEADERS, redirect: 'manual' },
    6_000,
  );
  if (!response.ok) throw new Error(`Bilibili session returned HTTP ${response.status}`);
  const setCookie = response.headers.get('set-cookie') ?? '';
  const cookies = ['buvid3', 'b_nut'].flatMap((name) => {
    const match = setCookie.match(new RegExp(`(?:^|[,\\s])${name}=([^;,\\s]+)`));
    return match ? [`${name}=${match[1]}`] : [];
  });
  await response.body?.cancel();
  if (!cookies.some((cookie) => cookie.startsWith('buvid3=')))
    throw new Error('Bilibili did not provide an anonymous search session');
  return cookies.join('; ');
}

async function searchTerms(terms: string[], page: number) {
  const successes: { items: HarvestItem[]; hasMore: boolean }[] = [];
  const errors: string[] = [];
  const session = { cookie: null as string | null };
  // Bilibili can require verification after a burst of requests. Keep the
  // bilingual searches small and stop immediately when verification appears.
  for (const term of terms) {
    try {
      successes.push(await searchPage(term, page, undefined, session));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      if (message.includes('requires verification')) break;
    }
  }
  if (!successes.length)
    throw new Error(
      errors.find((message) => message.includes('requires verification')) ??
        errors[0] ??
        'Bilibili search could not be completed',
    );
  return successes;
}

export async function fetchBilibiliSearch(
  tags: string[],
  localizedTags: string[] = [],
): Promise<HarvestItem[]> {
  const terms = bilibiliSearchTerms(tags, localizedTags);
  if (!terms.length) return [];
  const successes = await searchTerms(terms, 1);
  return [
    ...new Map(
      successes.flatMap((result) => result.items.slice(0, 12)).map((item) => [item.id, item]),
    ).values(),
  ].slice(0, 32);
}

export async function fetchBilibiliSearchPage(
  tags: string[],
  localizedTags: string[] = [],
  cursor?: string,
): Promise<{ items: HarvestItem[]; nextCursor: string | null }> {
  const terms = bilibiliSearchTerms(tags, localizedTags);
  if (!terms.length) return { items: [], nextCursor: null };
  let bounds: Array<number | null | false> = Array(terms.length).fill(null);
  if (cursor !== undefined) {
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as {
        bounds?: unknown;
      };
      if (
        !Array.isArray(parsed.bounds) ||
        parsed.bounds.length !== terms.length ||
        parsed.bounds.some(
          (bound) =>
            bound !== null &&
            bound !== false &&
            (!Number.isInteger(bound) || bound < 1 || bound > Date.now() / 1000 + 86400),
        )
      )
        throw new Error('Invalid cursor');
      bounds = parsed.bounds as Array<number | null | false>;
    } catch {
      throw new Error('Invalid Bilibili search cursor');
    }
  }
  const nextBounds = [...bounds];
  const successes: HarvestItem[][] = [];
  const errors: string[] = [];
  const session = { cookie: null as string | null };
  for (let index = 0; index < terms.length; index += 1) {
    const bound = bounds[index];
    if (bound === false) continue;
    try {
      const result = await searchPage(terms[index], 1, bound ?? undefined, session);
      successes.push(result.items);
      const oldest = Math.min(
        ...result.items
          .map((item) => (item.publishedAt ? Date.parse(item.publishedAt) / 1000 : NaN))
          .filter(Number.isFinite),
      );
      nextBounds[index] =
        result.items.length > 0 &&
        Number.isFinite(oldest) &&
        oldest > 1 &&
        (bound === null || oldest < bound)
          ? Math.floor(oldest) - 1
          : false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      if (message.includes('requires verification')) break;
    }
  }
  if (!successes.length)
    throw new Error(
      errors.find((message) => message.includes('requires verification')) ??
        errors[0] ??
        'Bilibili search could not be completed',
    );
  return {
    items: [...new Map(successes.flat().map((item) => [item.id, item])).values()],
    nextCursor: nextBounds.some((bound) => bound !== false)
      ? Buffer.from(JSON.stringify({ bounds: nextBounds })).toString('base64url')
      : null,
  };
}

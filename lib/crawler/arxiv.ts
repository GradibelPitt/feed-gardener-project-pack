import { XMLParser } from 'fast-xml-parser';
import {
  classifyDomain,
  cleanText,
  fetchWithTimeout,
  keywordTags,
  stableId,
  toArray,
} from './core.ts';
import type { HarvestItem } from './types.ts';

const ARXIV_API = 'https://export.arxiv.org/api/query';
const CATEGORIES = ['cs.AI', 'cs.CL', 'cs.CV', 'cs.LG', 'cs.SE', 'cs.CR'];
const KEYWORDS = [
  'agent',
  'agents',
  'llm',
  'large language model',
  'multimodal',
  'reasoning',
  'video',
  'benchmark',
  'dataset',
  'coding',
  'code generation',
  'repository',
  'rag',
  'retrieval',
  'mcp',
  'embodied',
  'cyber',
];

type ParsedEntry = {
  id?: string;
  title?: string;
  summary?: string;
  published?: string;
  author?: { name?: string } | Array<{ name?: string }>;
  category?: { '@_term'?: string } | Array<{ '@_term'?: string }>;
  link?: { '@_href'?: string; '@_rel'?: string } | Array<{ '@_href'?: string; '@_rel'?: string }>;
};

export function parseArxivFeed(xml: string, days = 14, now = new Date()): HarvestItem[] {
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, trimValues: true });
  const parsed = parser.parse(xml) as { feed?: { entry?: ParsedEntry | ParsedEntry[] } };
  const cutoff = now.getTime() - days * 86_400_000;
  const fetchedAt = now.toISOString();

  return toArray(parsed.feed?.entry)
    .flatMap((entry): HarvestItem[] => {
      const title = cleanText(entry.title);
      const summary = cleanText(entry.summary);
      const combined = `${title}\n${summary}`.toLowerCase();
      const published = new Date(String(entry.published ?? ''));
      if (!title || !Number.isFinite(published.getTime()) || published.getTime() < cutoff)
        return [];
      if (!KEYWORDS.some((keyword) => combined.includes(keyword))) return [];

      const links = toArray(entry.link);
      const url =
        links.find((link) => link['@_rel'] === 'alternate')?.['@_href'] || cleanText(entry.id);
      if (!url) return [];
      const authors = toArray(entry.author)
        .map((author) => cleanText(author.name))
        .filter(Boolean);
      const categories = toArray(entry.category)
        .map((category) => cleanText(category['@_term']))
        .filter(Boolean);
      const [domain, domainKeywords] = classifyDomain(title, summary);

      return [
        {
          id: `arxiv-${stableId(url)}`,
          section: 'academic',
          source: 'arXiv',
          title,
          summary,
          author: authors.join(', ') || 'arXiv authors',
          url,
          publishedAt: published.toISOString(),
          tags: [...new Set(['arXiv', ...keywordTags(combined), ...categories.slice(0, 2)])].slice(
            0,
            8,
          ),
          domain,
          domainKeywords,
          provenance: {
            mode: 'official_api',
            sourceUrl: ARXIV_API,
            fetchedAt,
          },
        },
      ];
    })
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
}

export async function fetchArxiv(days = 14): Promise<HarvestItem[]> {
  const query = CATEGORIES.map((category) => `cat:${category}`).join(' OR ');
  const url = new URL(ARXIV_API);
  url.searchParams.set('search_query', query);
  url.searchParams.set('start', '0');
  url.searchParams.set('max_results', '80');
  url.searchParams.set('sortBy', 'submittedDate');
  url.searchParams.set('sortOrder', 'descending');

  const response = await fetchWithTimeout(url.toString(), {}, 18_000);
  if (!response.ok) throw new Error(`arXiv HTTP ${response.status}`);
  return parseArxivFeed(await response.text(), days);
}

import { domains, matchesHarvestPreferences, type Preferences } from './feed.ts';
import { resourceUrlKey } from './resources.ts';
import type { HarvestItem } from './crawler/types.ts';

export type FeederSignal = 'open' | 'save' | 'hide' | 'not_interested';
export type FeederEvent = {
  id: string;
  actor: 'user';
  itemKey: string;
  signal: FeederSignal;
  tagIds: string[];
  source?: string;
  author?: string;
  at: string;
};
export type FeederCandidate = {
  item: HarvestItem;
  key: string;
  score: number;
  matchedTagIds: string[];
  reasons: string[];
  exploratory: boolean;
};

const tagCatalog = domains.flatMap((domain) =>
  domain.tags.map((tag) => ({ ...tag, domainId: domain.id })),
);
const tagById = new Map(tagCatalog.map((tag) => [tag.id, tag]));
const tagIds = new Set(tagCatalog.map((tag) => tag.id));
const signalDelta: Record<FeederSignal, number> = {
  open: 0.01,
  save: 0.05,
  hide: -0.04,
  not_interested: -0.08,
};

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[-_\s]+/g, ' ');

export function matchedHarvestTagIds(item: Pick<HarvestItem, 'tags'>): string[] {
  const labels = new Set(item.tags.map(normalize));
  return tagCatalog
    .filter(
      (tag) =>
        labels.has(normalize(tag.id)) ||
        labels.has(normalize(tag.label)) ||
        labels.has(normalize(tag.labelEn)) ||
        (tag.id === 'agents' && labels.has('agent')),
    )
    .map((tag) => tag.id);
}

export function readTagJev(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([id, weight]) => tagIds.has(id) && typeof weight === 'number' && Number.isFinite(weight),
      )
      .map(([id, weight]) => [id, Math.max(0, Math.min(1, weight as number))]),
  );
}

export function readFeederEvents(value: unknown): FeederEvent[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)),
    )
    .filter(
      (entry) =>
        typeof entry.id === 'string' &&
        entry.actor === 'user' &&
        typeof entry.itemKey === 'string' &&
        entry.itemKey.length <= 2048 &&
        resourceUrlKey(entry.itemKey) === entry.itemKey &&
        ['open', 'save', 'hide', 'not_interested'].includes(String(entry.signal)) &&
        typeof entry.at === 'string' &&
        Number.isFinite(Date.parse(entry.at)),
    )
    .slice(-500)
    .map((entry) => ({
      id: String(entry.id),
      actor: 'user' as const,
      itemKey: String(entry.itemKey),
      signal: entry.signal as FeederSignal,
      tagIds: Array.isArray(entry.tagIds)
        ? [
            ...new Set(
              entry.tagIds.filter((id): id is string => typeof id === 'string' && tagIds.has(id)),
            ),
          ].slice(0, 12)
        : [],
      source: typeof entry.source === 'string' ? entry.source.slice(0, 80) : undefined,
      author: typeof entry.author === 'string' ? entry.author.slice(0, 200) : undefined,
      at: String(entry.at),
    }));
}

export function effectiveTagJev(
  tagId: string,
  preferences: Preferences,
  events: FeederEvent[],
  now = Date.now(),
): number {
  const selected = preferences.tags.includes(tagId);
  const base = preferences.tagJev?.[tagId] ?? (selected ? 0.7 : 0.15);
  const feedback = events.reduce((sum, event) => {
    if (!event.tagIds.includes(tagId)) return sum;
    const ageDays = Math.max(0, (now - Date.parse(event.at)) / 86_400_000);
    if (!Number.isFinite(ageDays) || ageDays > 90) return sum;
    return sum + signalDelta[event.signal] * Math.exp(-ageDays / 30);
  }, 0);
  return (
    Math.round(Math.max(0, Math.min(1, base + Math.max(-0.2, Math.min(0.2, feedback)))) * 100) / 100
  );
}

export function rankHarvestCandidates(
  items: HarvestItem[],
  preferences: Preferences,
  events: FeederEvent[],
  options: { limit?: number; now?: number; pool?: boolean } = {},
): FeederCandidate[] {
  const now = options.now ?? Date.now();
  const limit = Math.max(0, Math.min(100, Math.floor(options.limit ?? 30)));
  const excluded = new Set(
    events
      .filter((event) => event.signal === 'hide' || event.signal === 'not_interested')
      .map((event) => event.itemKey),
  );
  const selected = new Set(preferences.tags);
  const useDomains = selected.size === 0 && preferences.customTags.length === 0;
  const selectedDomains = new Set(
    useDomains
      ? preferences.domains
      : preferences.tags
          .map((id) => tagById.get(id)?.domainId)
          .filter((id): id is string => Boolean(id)),
  );
  const customTerms = new Set(
    preferences.customTags.flatMap((tag) => [tag.label, tag.labelEn, tag.labelZh].map(normalize)),
  );
  const affinity = (field: 'source' | 'author', value: string) =>
    Math.max(
      -0.3,
      Math.min(
        0.3,
        events.reduce((sum, event) => {
          if (!value || event[field] !== value) return sum;
          const ageDays = Math.max(0, (now - Date.parse(event.at)) / 86_400_000);
          if (!Number.isFinite(ageDays) || ageDays > 90) return sum;
          return sum + signalDelta[event.signal] * Math.exp(-ageDays / 30);
        }, 0),
      ),
    );
  const byUrl = new Map<string, HarvestItem>();
  for (const item of items) {
    const key = resourceUrlKey(item.url);
    if (!key || excluded.has(key) || !matchesHarvestPreferences(item, preferences)) continue;
    const previous = byUrl.get(key);
    if (!previous || (item.publishedAt ?? '') > (previous.publishedAt ?? '')) byUrl.set(key, item);
  }
  const candidates = [...byUrl].map(([key, item]) => {
    const matchedTagIds = matchedHarvestTagIds(item);
    const coreTags = matchedTagIds.filter(
      (id) =>
        selected.has(id) || (useDomains && selectedDomains.has(tagById.get(id)?.domainId ?? '')),
    );
    const customMatch = item.tags.some((tag) => customTerms.has(normalize(tag)));
    const domainMatch =
      useDomains &&
      domains.some(
        (domain) =>
          selectedDomains.has(domain.id) &&
          item.tags.some((tag) =>
            [domain.id, domain.label, domain.labelEn].some(
              (label) => normalize(tag) === normalize(label),
            ),
          ),
      );
    const exploratory = coreTags.length === 0 && !customMatch && !domainMatch;
    const adjacent = matchedTagIds.some((id) =>
      selectedDomains.has(tagById.get(id)?.domainId ?? ''),
    );
    const ageDays = item.publishedAt
      ? Math.max(0, (now - Date.parse(item.publishedAt)) / 86_400_000)
      : 60;
    const freshness = Number.isFinite(ageDays) ? Math.exp(-ageDays / 30) : 0;
    const relevance = coreTags.reduce(
      (sum, id) => sum + effectiveTagJev(id, preferences, events, now),
      0,
    );
    const sourcePreference = affinity('source', item.source);
    const authorPreference = affinity('author', item.author);
    const score =
      Math.round(
        (relevance * 10 +
          (customMatch ? 7 : 0) +
          (domainMatch ? 7 : 0) +
          (adjacent ? 1 : 0) +
          freshness * 2 +
          sourcePreference * 2 +
          authorPreference * 2) *
          100,
      ) / 100;
    const reasons = coreTags.map((id) => {
      const tag = tagById.get(id);
      return `${tag?.labelEn ?? id} · interest ${effectiveTagJev(id, preferences, events, now).toFixed(2)}`;
    });
    if (customMatch) reasons.push('Matches a topic you chose');
    if (domainMatch) reasons.push('Matches an area you chose');
    if (sourcePreference > 0) reasons.push(`Your positive feedback from ${item.source}`);
    if (authorPreference > 0) reasons.push(`Your positive feedback for ${item.author}`);
    if (exploratory) reasons.push(adjacent ? 'Explore a nearby topic' : 'Explore a public source');
    if (freshness > 0.6) reasons.push('Recently published');
    return { item, key, score, matchedTagIds, reasons, exploratory } satisfies FeederCandidate;
  });
  const ordered = (a: FeederCandidate, b: FeederCandidate) =>
    b.score - a.score ||
    (b.item.publishedAt ?? '').localeCompare(a.item.publishedAt ?? '') ||
    a.key.localeCompare(b.key);
  if (options.pool) return candidates.sort(ordered).slice(0, limit);
  const core = candidates.filter((item) => !item.exploratory).sort(ordered);
  if (preferences.onlySelectedTags || preferences.exploration <= 0) return core.slice(0, limit);
  const noSelectedInterests =
    selected.size === 0 && customTerms.size === 0 && selectedDomains.size === 0;
  if (noSelectedInterests) return candidates.sort(ordered).slice(0, limit);
  if (core.length === 0) return [];
  const explorationFraction = Math.min(0.5, Math.max(0, preferences.exploration / 100));
  const explorationSlots = Math.min(limit, Math.floor(limit * explorationFraction));
  const exploratory = candidates.filter((item) => item.exploratory).sort(ordered);
  const exploreCount = Math.min(explorationSlots, exploratory.length);
  return [...core.slice(0, limit - exploreCount), ...exploratory.slice(0, exploreCount)]
    .sort(ordered)
    .slice(0, limit);
}

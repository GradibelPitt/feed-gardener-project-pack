import { apiError, apiSuccess } from '@/lib/api-contract';
import {
  fetchGithubTagSuggestions,
  seedTagSuggestions,
  type TagSuggestion,
} from '@/lib/tag-suggestions';

export const runtime = 'nodejs';

const liveCache = new Map<string, { expiresAt: number; suggestions: TagSuggestion[] }>();

const cleanStrings = (value: unknown, limit: number) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter((item) => item.length > 0 && item.length <= 80),
        ),
      ].slice(0, limit)
    : [];

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError(400, 'INVALID_JSON', 'Expected JSON.');
  }
  const tagIds = cleanStrings(body.tagIds, 12);
  const domainIds = cleanStrings(body.domainIds, 6);
  const customTerms = cleanStrings(body.customTerms, 6);
  const readingLanguage =
    body.readingLanguage === 'zh' || body.readingLanguage === 'en'
      ? body.readingLanguage
      : 'bilingual';
  const seed = seedTagSuggestions(tagIds, domainIds, readingLanguage);
  let live: TagSuggestion[] = [];
  let liveStatus: 'live' | 'degraded' | 'idle' =
    tagIds.length || customTerms.length ? 'live' : 'idle';
  let warning: string | null = null;
  if (liveStatus === 'live') {
    try {
      const cacheKey = JSON.stringify({ tagIds, customTerms, readingLanguage });
      const cached = liveCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        live = cached.suggestions;
      } else {
        live = await fetchGithubTagSuggestions(tagIds, customTerms, readingLanguage);
        liveCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60_000, suggestions: live });
      }
    } catch (error) {
      liveStatus = 'degraded';
      warning = error instanceof Error ? error.message : 'LIVE_SUGGESTION_FAILED';
    }
  }
  return apiSuccess(
    {
      suggestions: [...live, ...seed].slice(0, 16),
      liveStatus,
      warning,
      readingLanguage,
      provenance: {
        live: 'Public GitHub repository topics from a current search.',
        seed: 'Bundled taxonomy retained as a deterministic fallback.',
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

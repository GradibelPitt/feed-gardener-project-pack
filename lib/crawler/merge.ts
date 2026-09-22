import type { FeedSection, HarvestPayload } from './types.ts';

const sections: FeedSection[] = ['social', 'academic', 'opensource'];

/** Replace only the sources present in a scoped harvest response. */
export function mergeHarvestPayload(
  current: HarvestPayload | null,
  incoming: HarvestPayload,
): HarvestPayload {
  if (!current) return incoming;
  const updated = new Set(incoming.health.map((health) => health.source));
  return {
    ...incoming,
    sections: Object.fromEntries(
      sections.map((section) => [
        section,
        [
          ...current.sections[section].filter((item) => !updated.has(item.source)),
          ...incoming.sections[section],
        ],
      ]),
    ) as HarvestPayload['sections'],
    health: [...current.health.filter((health) => !updated.has(health.source)), ...incoming.health],
    warnings: [
      ...current.warnings.filter(
        (warning) => ![...updated].some((source) => warning.startsWith(`${source}:`)),
      ),
      ...incoming.warnings,
    ],
  };
}

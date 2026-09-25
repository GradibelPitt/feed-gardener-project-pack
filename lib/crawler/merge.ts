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

/** Append a video page without moving or dropping cards already on screen. */
export function appendHarvestPayload(
  current: HarvestPayload | null,
  incoming: HarvestPayload,
): HarvestPayload {
  if (!current) return incoming;
  const merged = mergeHarvestPayload(current, incoming);
  const source = incoming.health.find(
    (item) => item.source === 'YouTube' || item.source === 'Bilibili',
  )?.source;
  if (!source) return merged;
  const seen = new Set<string>();
  const social = [
    ...current.sections.social.filter((item) => item.source === source),
    ...incoming.sections.social.filter((item) => item.source === source),
  ].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return {
    ...merged,
    sections: {
      ...merged.sections,
      social: [...merged.sections.social.filter((item) => item.source !== source), ...social],
    },
    health: merged.health.map((item) =>
      item.source === source ? { ...item, itemCount: social.length } : item,
    ),
  };
}

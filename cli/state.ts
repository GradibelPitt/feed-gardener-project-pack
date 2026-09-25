import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { contents, defaultPreferences, domains, type Preferences } from '../lib/feed.ts';
import {
  gardenReducer,
  initialGardenState,
  restoreGardenState,
  type GardenState,
} from '../lib/garden.ts';
import { readResourceRecords, type ResourceRecord } from '../lib/resources.ts';
import { normalizeBehaviorWeights } from '../lib/strategy.ts';
import { readFeederEvents, readTagJev, type FeederEvent } from '../lib/feeder.ts';

export type CliState = {
  schema: 'feed-gardener-cli/1';
  preferences: Preferences;
  saved: string[];
  hidden: string[];
  resources: ResourceRecord[];
  feederEvents: FeederEvent[];
  simulator: GardenState;
};

const domainIds = new Set(domains.map((domain) => domain.id));
const tagDomain = new Map(
  domains.flatMap((domain) => domain.tags.map((tag) => [tag.id, domain.id] as const)),
);
const contentIds = new Set(contents.map((content) => content.id));

export function defaultState(): CliState {
  return {
    schema: 'feed-gardener-cli/1',
    preferences: { ...structuredClone(defaultPreferences), readingLanguage: 'en' },
    saved: [],
    hidden: [],
    resources: [],
    feederEvents: [],
    simulator: initialGardenState(),
  };
}

function strings(value: unknown, allowed?: Set<string>): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (item): item is string => typeof item === 'string' && (!allowed || allowed.has(item)),
          ),
        ),
      ]
    : [];
}

export function readState(value: unknown): CliState {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid CLI data file.');
  const raw = value as Record<string, unknown>;
  if (raw.schema !== 'feed-gardener-cli/1') throw new Error('Unsupported CLI data file schema.');
  const input =
    raw.preferences && typeof raw.preferences === 'object'
      ? (raw.preferences as Record<string, unknown>)
      : {};
  const baseline = defaultState();
  const tags = strings(input.tags, new Set(tagDomain.keys()));
  const blockedTags = strings(input.blockedTags, new Set(tagDomain.keys())).filter(
    (id) => !tags.includes(id),
  );
  const domainsFromTags = tags.map((id) => tagDomain.get(id)!);
  const version =
    typeof input.version === 'number' && Number.isSafeInteger(input.version) && input.version > 0
      ? input.version
      : 1;
  const preferences: Preferences = {
    ...baseline.preferences,
    domains: [...new Set([...strings(input.domains, domainIds), ...domainsFromTags])],
    tags,
    tagJev: readTagJev(input.tagJev),
    blockedTags,
    relatedDomains: strings(input.relatedDomains, domainIds),
    blockedSources: strings(input.blockedSources)
      .filter((item) => item.length <= 200)
      .slice(0, 100),
    customTags: Array.isArray(input.customTags)
      ? input.customTags
          .filter((item): item is Record<string, unknown> =>
            Boolean(item && typeof item === 'object'),
          )
          .filter(
            (item) =>
              typeof item.id === 'string' &&
              ((item.source === 'manual' && item.id.startsWith('manual:')) ||
                (item.id.startsWith('live:github:') &&
                  typeof item.evidenceUrl === 'string' &&
                  item.evidenceUrl.startsWith('https://github.com/'))) &&
              typeof item.label === 'string' &&
              item.label.trim().length > 0,
          )
          .slice(0, 12)
          .map((item) => ({
            id: String(item.id),
            label: String(item.label).slice(0, 80),
            labelZh:
              typeof item.labelZh === 'string'
                ? item.labelZh.slice(0, 80)
                : String(item.label).slice(0, 80),
            labelEn:
              typeof item.labelEn === 'string'
                ? item.labelEn.slice(0, 80)
                : String(item.label).slice(0, 80),
            translationStatus:
              item.translationStatus === 'translated'
                ? ('translated' as const)
                : ('source_label' as const),
            source: item.source === 'manual' ? ('manual' as const) : ('github_live' as const),
            evidenceUrl: item.source === 'manual' ? '' : String(item.evidenceUrl),
          }))
      : [],
    exploration:
      typeof input.exploration === 'number' && Number.isFinite(input.exploration)
        ? Math.min(50, Math.max(0, input.exploration))
        : baseline.preferences.exploration,
    onlySelectedTags: input.onlySelectedTags === true,
    strategyMode: input.strategyMode === 'expert' ? 'expert' : 'simple',
    behaviorWeights: normalizeBehaviorWeights(
      input.behaviorWeights && typeof input.behaviorWeights === 'object'
        ? (input.behaviorWeights as Preferences['behaviorWeights'])
        : undefined,
    ),
    readingLanguage: 'en',
    version,
  };
  return {
    schema: 'feed-gardener-cli/1',
    preferences,
    saved: strings(raw.saved, contentIds),
    hidden: strings(raw.hidden, contentIds),
    resources: readResourceRecords(raw.resources),
    feederEvents: readFeederEvents(raw.feederEvents),
    simulator: readCliSimulator(raw.simulator, version),
  };
}

function readCliSimulator(value: unknown, version: number): GardenState {
  const checked = restoreGardenState(JSON.stringify(value ?? null), version);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return checked;
  const original = value as GardenState;
  if (checked.status === 'idle') return checked;
  if (checked.reason === 'PROFILE_CHANGED') return checked;
  // Each CLI step starts a process. Preserve a validated simulator snapshot;
  // TICK and START still enforce the plan version and expiry.
  return {
    ...checked,
    status: original.status,
    reason: original.reason,
    consent: original.consent === true,
    fault: original.fault === true,
    logs: checked.logs.filter((entry) => entry.id <= original.revision),
    revision: original.revision,
  };
}

export function dataPath(override?: string): string {
  return (
    override ??
    join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'feed-gardener', 'state.json')
  );
}

export async function loadState(path: string): Promise<CliState> {
  try {
    return readState(JSON.parse(await readFile(path, 'utf8')));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      return defaultState();
    throw error;
  }
}

export async function saveState(path: string, state: CliState): Promise<void> {
  const folder = dirname(path);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const temporary = join(folder, `.state-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export function bumpPreferences(state: CliState): void {
  state.preferences.version += 1;
  state.simulator = gardenReducer(state.simulator, {
    type: 'PROFILE',
    version: state.preferences.version,
  });
}

export function tagDomainId(id: string): string | undefined {
  return tagDomain.get(id);
}

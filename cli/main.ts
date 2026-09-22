#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { inspect } from 'node:util';
import {
  contents,
  domains,
  interestCategories,
  matchesHarvestPreferences,
  rankFeed,
  type Source,
} from '../lib/feed.ts';
import { harvestPublicSources } from '../lib/crawler/harvest.ts';
import { resolveSocialUrl } from '../lib/crawler/social.ts';
import {
  resourceFromHarvest,
  resourceFromLink,
  resourceUrlKey,
  RESOURCE_TYPES,
} from '../lib/resources.ts';
import { fetchGithubTagSuggestions, seedTagSuggestions } from '../lib/tag-suggestions.ts';
import { CHANNELS, gardenReducer, selectGardenTargets, STEPS } from '../lib/garden.ts';
import {
  behaviorSignalKeys,
  compileStrategyPlan,
  isStrategyInterface,
  isStrategyPlatform,
  normalizeBehaviorWeights,
} from '../lib/strategy.ts';
import {
  decideCandidate,
  isJevConfigured,
  validateCandidateDecisionInput,
} from '../lib/candidate-decision.ts';
import { evaluateObservedRuns, parseObservedRuns } from '../lib/feed-observation.ts';
import { analyzeObservation, validateObservationInput } from '../lib/agent-observation.ts';
import {
  matchedHarvestTagIds,
  rankHarvestCandidates,
  type FeederEvent,
  type FeederSignal,
} from '../lib/feeder.ts';
import {
  dataPath,
  loadState,
  saveState,
  bumpPreferences,
  readState,
  tagDomainId,
  type CliState,
} from './state.ts';

type Args = { positionals: string[]; options: Map<string, string | true> };
const valueFlags = new Set([
  'data',
  'domain',
  'source',
  'section',
  'query',
  'limit',
  'title',
  'type',
  'state',
  'note',
  'term',
  'platform',
  'interface',
  'provider',
  'videos',
  'minutes',
  'input',
  'file',
  'website',
]);
const booleanFlags = new Set(['json', 'all', 'refresh', 'live', 'save', 'replace']);

function parse(argv: string[]): Args {
  const positionals: string[] = [];
  const options = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === '--') continue;
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const equal = token.indexOf('=');
    const name = token.slice(2, equal < 0 ? undefined : equal);
    if (options.has(name)) throw new Error(`Repeated option --${name}.`);
    if (booleanFlags.has(name)) {
      if (equal >= 0) throw new Error(`--${name} takes no value.`);
      options.set(name, true);
    } else if (valueFlags.has(name)) {
      const value = equal >= 0 ? token.slice(equal + 1) : argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`--${name} needs a value.`);
      options.set(name, value);
    } else throw new Error(`Unknown option --${name}.`);
  }
  return { positionals, options };
}

const option = (args: Args, name: string) => args.options.get(name) as string | undefined;
const flag = (args: Args, name: string) => args.options.has(name);
function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
function integer(
  value: string | undefined,
  name: string,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max)
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  return parsed;
}
function oneOf<T extends string>(value: string | undefined, values: readonly T[], name: string): T {
  if (!value || !values.includes(value as T))
    throw new Error(`${name} must be one of: ${values.join(', ')}.`);
  return value as T;
}
function rows(items: Array<Record<string, unknown>>, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(items, null, 2));
    return;
  }
  if (!items.length) {
    console.log('(empty)');
    return;
  }
  for (const item of items)
    console.log(
      Object.values(item)
        .map((value) => String(value ?? ''))
        .join('  |  '),
    );
}
function output(value: unknown, json: boolean): void {
  console.log(
    json
      ? JSON.stringify(value, null, 2)
      : inspect(value, { depth: 6, colors: process.stdout.isTTY, maxArrayLength: 100 }),
  );
}
function changed(state: CliState): void {
  bumpPreferences(state);
}
function addResource(
  state: CliState,
  record: NonNullable<ReturnType<typeof resourceFromLink>>,
): void {
  if (state.resources.some((item) => resourceUrlKey(item.url) === resourceUrlKey(record.url)))
    throw new Error('This URL is already in the library.');
  if (state.resources.length >= 500) throw new Error('The library has reached its 500-item limit.');
  state.resources.unshift(record);
}
function findResource(state: CliState, id: string) {
  const record = state.resources.find((item) => item.id === id);
  if (!record) throw new Error(`Resource ${id} was not found.`);
  return record;
}
function help(): void {
  console.log(`Feed Gardener CLI — local preferences, discovery, public sources, library, and previews

Usage: pnpm cli -- <command> [options]    (or node --experimental-strip-types cli/main.ts)
Global: --data <file>  --json   (for clean JSON via pnpm, use pnpm --silent cli -- ...)

  status
  catalog categories | domains | tags [--domain ID]
  prefs show | add-tag ID | remove-tag ID | block-tag ID | unblock-tag ID
  prefs add-domain ID | remove-domain ID | block-source NAME | unblock-source NAME
  prefs set only-selected on|off | exploration 0..50 | mode simple|expert
  prefs weight SIGNAL 0..100             (expert mode)
  feed list [--limit N] [--refresh]       (rank current public-source candidates)
  feed weight TAG_ID 0..1                 (set your editable tag JEV)
  feed save|hide|not-interested ITEM_ID   (local Feeder feedback; no platform write)
  feed undo EVENT_ID                      (undo a local feedback event)
  discover [--query TEXT] [--source YouTube|Bluesky|RSS] [--limit N]  (legacy demo)
  saved list | add ID | remove ID         (bundled demo items)
  hidden list | add ID | remove ID        (bundled demo items)
  harvest [--section academic|opensource|social] [--source NAME] [--limit N] [--all] [--refresh]
  harvest save ID                         (save a current public item with metadata)
  social resolve URL [--save]
  tags suggest [--live] [--term TEXT] | accept ID [--term TEXT] | remove ID
  library list [--type TYPE] [--website HOST] | show ID | add URL [--title TEXT] [--type TYPE]
  library note ID TEXT | state ID inbox|reviewing|reference | type ID TYPE | remove ID
  simulator status | plan | consent yes|no | start | tick [COUNT] | pause | resume
  simulator account | fault | reconcile | reset
  agent capabilities | plan [--platform youtube|bilibili|simulator] [--interface local_agent|multimodal_api]
  agent decision --title TEXT [--platform PLATFORM] [--provider auto|deterministic|jev] [--videos N] [--minutes N]
  agent evaluate --input runs.json | observe --input observation.json
  state export --file FILE | import --file FILE --replace | import-browser --file FILE --replace

Public-source items are metadata. Agent commands only preview or evaluate. Simulator actions never touch platform accounts.
CLI data is separate from browser localStorage; import-browser accepts a browser JSON export.`);
}

async function run(argv: string[]): Promise<void> {
  const args = parse(argv);
  const [group = 'help', action, ...rest] = args.positionals;
  if (group === 'help' || group === '--help') {
    help();
    return;
  }
  const json = flag(args, 'json');
  const path = dataPath(option(args, 'data'));
  const state = await loadState(path);
  let mutate = false;
  let result: unknown;

  if (group === 'status') {
    result = {
      dataFile: path,
      preferenceVersion: state.preferences.version,
      selectedTags: state.preferences.tags,
      blockedTags: state.preferences.blockedTags,
      savedDemoItems: state.saved.length,
      resources: state.resources.length,
      feederFeedback: state.feederEvents.length,
      simulator: state.simulator.status,
      platformExecution: 'blocked_external',
    };
  } else if (group === 'catalog') {
    if (action === 'categories')
      rows(
        interestCategories.map((item) => ({
          id: item.id,
          name: item.labelEn,
          domains: item.domains.length,
        })),
        json,
      );
    else if (action === 'domains')
      rows(
        domains.map((item) => ({ id: item.id, name: item.labelEn, tags: item.tags.length })),
        json,
      );
    else if (action === 'tags')
      rows(
        domains
          .filter((item) => !option(args, 'domain') || item.id === option(args, 'domain'))
          .flatMap((item) =>
            item.tags.map((tag) => ({ id: tag.id, name: tag.labelEn, domain: item.id })),
          ),
        json,
      );
    else throw new Error('Use catalog categories, domains, or tags.');
    return;
  } else if (group === 'prefs') {
    const prefs = state.preferences;
    const id = rest[0];
    if (action === 'show') result = prefs;
    else if (['add-tag', 'remove-tag', 'block-tag', 'unblock-tag'].includes(action || '')) {
      const tag = required(id, 'Tag ID');
      const domain = tagDomainId(tag);
      if (!domain) throw new Error(`Unknown tag ID: ${tag}. Use catalog tags.`);
      if (action === 'add-tag') {
        prefs.tags = [...new Set([...prefs.tags, tag])];
        prefs.blockedTags = prefs.blockedTags.filter((item) => item !== tag);
        prefs.domains = [...new Set([...prefs.domains, domain])];
      }
      if (action === 'remove-tag') prefs.tags = prefs.tags.filter((item) => item !== tag);
      if (action === 'block-tag') {
        prefs.blockedTags = [...new Set([...prefs.blockedTags, tag])];
        prefs.tags = prefs.tags.filter((item) => item !== tag);
      }
      if (action === 'unblock-tag')
        prefs.blockedTags = prefs.blockedTags.filter((item) => item !== tag);
      changed(state);
      mutate = true;
      result = prefs;
    } else if (action === 'add-domain' || action === 'remove-domain') {
      const domain = required(id, 'Domain ID');
      if (!domains.some((item) => item.id === domain))
        throw new Error(`Unknown domain ID: ${domain}.`);
      prefs.domains =
        action === 'add-domain'
          ? [...new Set([...prefs.domains, domain])]
          : prefs.domains.filter((item) => item !== domain);
      if (action === 'remove-domain')
        prefs.tags = prefs.tags.filter((tag) => tagDomainId(tag) !== domain);
      changed(state);
      mutate = true;
      result = prefs;
    } else if (action === 'block-source' || action === 'unblock-source') {
      const source = required(id, 'Source name').trim();
      if (!source || source.length > 200)
        throw new Error('Source name must contain 1–200 characters.');
      prefs.blockedSources =
        action === 'block-source'
          ? [...new Set([...prefs.blockedSources, source])]
          : prefs.blockedSources.filter((item) => item !== source);
      changed(state);
      mutate = true;
      result = prefs;
    } else if (action === 'set') {
      const field = required(id, 'Preference field');
      const value = required(rest[1], 'Value');
      if (field === 'only-selected')
        prefs.onlySelectedTags = oneOf(value, ['on', 'off'], 'Value') === 'on';
      else if (field === 'exploration')
        prefs.exploration = integer(value, 'Exploration', 0, 50, 20);
      else if (field === 'mode') prefs.strategyMode = oneOf(value, ['simple', 'expert'], 'Mode');
      else throw new Error('Set only-selected, exploration, or mode.');
      changed(state);
      mutate = true;
      result = prefs;
    } else if (action === 'weight') {
      if (prefs.strategyMode !== 'expert')
        throw new Error('Set mode to expert before editing weights.');
      const signal = oneOf(id, behaviorSignalKeys, 'Signal');
      const weight = integer(rest[1], 'Weight', 0, 100, 0);
      prefs.behaviorWeights = normalizeBehaviorWeights({
        ...prefs.behaviorWeights,
        [signal]: weight,
      });
      changed(state);
      mutate = true;
      result = prefs.behaviorWeights;
    } else throw new Error('Unknown prefs command. Run pnpm cli -- help.');
  } else if (group === 'feed') {
    if (action === 'weight') {
      const tagId = required(rest[0], 'Tag ID');
      if (!tagDomainId(tagId)) throw new Error(`Unknown tag ID: ${tagId}.`);
      const weight = Number(required(rest[1], 'Weight'));
      if (!Number.isFinite(weight) || weight < 0 || weight > 1)
        throw new Error('Weight must be a number from 0 to 1.');
      state.preferences.tagJev = { ...state.preferences.tagJev, [tagId]: weight };
      bumpPreferences(state);
      mutate = true;
      result = { tagId, weight };
    } else if (action === 'undo') {
      const eventId = required(rest[0], 'Event ID');
      if (!state.feederEvents.some((event) => event.id === eventId))
        throw new Error(`Unknown Feeder event ID: ${eventId}.`);
      state.feederEvents = state.feederEvents.filter((event) => event.id !== eventId);
      mutate = true;
      result = { undone: eventId };
    } else if (
      action === 'list' ||
      action === 'save' ||
      action === 'hide' ||
      action === 'not-interested'
    ) {
      const payload = await harvestPublicSources(flag(args, 'refresh'));
      const items = Object.values(payload.sections).flat();
      if (action === 'list') {
        const ranked = rankHarvestCandidates(items, state.preferences, state.feederEvents, {
          limit: integer(option(args, 'limit'), 'Limit', 1, 100, 30),
        });
        if (json)
          result = {
            generatedAt: payload.generatedAt,
            cache: payload.cache,
            health: payload.health,
            warnings: payload.warnings,
            items: ranked,
          };
        else
          rows(
            ranked.map((entry) => ({
              id: entry.item.id,
              title: entry.item.title,
              source: entry.item.source,
              score: entry.score,
              reason: entry.reasons.join('; '),
            })),
            false,
          );
        if (!json) return;
      } else {
        const id = required(rest[0], 'Public item ID');
        const item = items.find((candidate) => candidate.id === id);
        if (!item)
          throw new Error(
            `Public item ${id} was not found in this harvest. Refresh and try again.`,
          );
        if (action === 'save') addResource(state, resourceFromHarvest(item));
        const event: FeederEvent = {
          id: crypto.randomUUID(),
          actor: 'user',
          itemKey: resourceUrlKey(item.url),
          signal: (action === 'not-interested' ? 'not_interested' : action) as FeederSignal,
          tagIds: matchedHarvestTagIds(item).slice(0, 12),
          source: item.source,
          author: item.author,
          at: new Date().toISOString(),
        };
        state.feederEvents = [...state.feederEvents, event].slice(-500);
        mutate = true;
        result = { event, boundary: 'Local Feeder feedback only; no source-platform action.' };
      }
    } else throw new Error('Use feed list, weight, save, hide, not-interested, or undo.');
  } else if (group === 'discover' || group === 'saved' || group === 'hidden') {
    if (group !== 'discover' && action !== 'list') {
      const id = required(rest[0], 'Demo item ID');
      if (!contents.some((item) => item.id === id)) throw new Error(`Unknown demo item ID: ${id}.`);
      const key = group === 'saved' ? 'saved' : 'hidden';
      if (action === 'add') state[key] = [...new Set([...state[key], id])];
      else if (action === 'remove') state[key] = state[key].filter((item) => item !== id);
      else throw new Error(`Use ${group} list, add, or remove.`);
      mutate = true;
      result = { [key]: state[key] };
    } else if (group !== 'discover' && action === 'list' && group === 'hidden')
      result = state.hidden.map((id) => contents.find((item) => item.id === id));
    else {
      const source = option(args, 'source');
      if (source && !['YouTube', 'Bluesky', 'RSS'].includes(source))
        throw new Error('Demo source must be YouTube, Bluesky, or RSS.');
      const items = rankFeed(state.preferences, {
        query: option(args, 'query'),
        source: source as Source | undefined,
        limit: integer(option(args, 'limit'), 'Limit', 1, 100, 20),
        savedOnly: group === 'saved',
        savedIds: state.saved,
        hiddenIds: state.hidden,
      });
      if (json) result = { provenance: 'bundled_demo_fixture', items };
      else
        rows(
          items.map((item) => ({
            id: item.id,
            score: item.score,
            title: item.titleEn,
            source: item.source,
            reason: item.reasonsEn.join('; '),
          })),
          false,
        );
      if (!json) return;
    }
  } else if (group === 'harvest') {
    const payload = await harvestPublicSources(flag(args, 'refresh'));
    if (action === 'save') {
      const id = required(rest[0], 'Public item ID');
      const item = Object.values(payload.sections)
        .flat()
        .find((candidate) => candidate.id === id);
      if (!item)
        throw new Error(`Public item ${id} was not found in this harvest. Refresh and try again.`);
      const record = resourceFromHarvest(item);
      addResource(state, record);
      mutate = true;
      result = record;
    } else {
      const section = option(args, 'section');
      if (section && !['academic', 'opensource', 'social'].includes(section))
        throw new Error('Section must be academic, opensource, or social.');
      const items = Object.entries(payload.sections)
        .filter(([key]) => !section || key === section)
        .flatMap(([, values]) => values)
        .filter(
          (item) =>
            (!option(args, 'source') || item.source === option(args, 'source')) &&
            (flag(args, 'all') || matchesHarvestPreferences(item, state.preferences)),
        )
        .slice(0, integer(option(args, 'limit'), 'Limit', 1, 500, 30));
      if (json)
        result = {
          generatedAt: payload.generatedAt,
          cache: payload.cache,
          health: payload.health,
          warnings: payload.warnings,
          items,
        };
      else {
        rows(
          items.map((item) => ({
            id: item.id,
            source: item.source,
            title: item.title,
            url: item.url,
          })),
          false,
        );
        if (payload.warnings.length) console.error(payload.warnings.join('\n'));
        return;
      }
    }
  } else if (group === 'social') {
    if (action !== 'resolve') throw new Error('Use social resolve URL.');
    const item = await resolveSocialUrl(required(rest[0], 'Public URL'));
    if (flag(args, 'save')) {
      addResource(state, resourceFromHarvest(item));
      mutate = true;
    }
    result = { item, saved: flag(args, 'save') };
  } else if (group === 'tags') {
    if (action === 'remove') {
      const id = required(rest[0], 'Custom tag ID');
      if (!state.preferences.customTags.some((tag) => tag.id === id))
        throw new Error(`Custom tag ${id} was not found.`);
      state.preferences.customTags = state.preferences.customTags.filter((tag) => tag.id !== id);
      changed(state);
      mutate = true;
      result = state.preferences.customTags;
    } else if (action === 'accept') {
      const id = required(rest[0], 'Live suggestion ID');
      const suggestions = await fetchGithubTagSuggestions(
        state.preferences.tags,
        option(args, 'term') ? [option(args, 'term')!] : [],
        'en',
      );
      const suggestion = suggestions.find(
        (item) => item.id === id && item.origin === 'live' && item.evidenceUrl,
      );
      if (!suggestion)
        throw new Error(`Live suggestion ${id} was not found in the current GitHub results.`);
      if (
        state.preferences.customTags.length >= 12 &&
        !state.preferences.customTags.some((item) => item.id === id)
      )
        throw new Error('The profile has reached its 12 custom-tag limit.');
      state.preferences.customTags = [
        ...state.preferences.customTags.filter((item) => item.id !== id),
        {
          id,
          label: suggestion.label,
          labelZh: suggestion.label,
          labelEn: suggestion.labelEn,
          translationStatus:
            suggestion.translationStatus === 'translated' ? 'translated' : 'source_label',
          source: 'github_live',
          evidenceUrl: suggestion.evidenceUrl!,
        },
      ];
      changed(state);
      mutate = true;
      result = state.preferences.customTags;
    } else if (action === 'suggest') {
      const seed = seedTagSuggestions(state.preferences.tags, state.preferences.domains, 'en');
      let live = [] as Awaited<ReturnType<typeof fetchGithubTagSuggestions>>;
      let warning: string | null = null;
      if (flag(args, 'live')) {
        try {
          live = await fetchGithubTagSuggestions(
            state.preferences.tags,
            option(args, 'term') ? [option(args, 'term')!] : [],
            'en',
          );
        } catch (error) {
          warning = error instanceof Error ? error.message : String(error);
        }
      }
      result = {
        suggestions: [...live, ...seed].slice(0, 16),
        liveStatus: flag(args, 'live') ? (warning ? 'degraded' : 'live') : 'idle',
        warning,
      };
    } else throw new Error('Use tags suggest, accept, or remove.');
  } else if (group === 'library') {
    if (action === 'list') {
      const items = state.resources.filter(
        (item) =>
          (!option(args, 'type') || item.resourceType === option(args, 'type')) &&
          (!option(args, 'website') ||
            new URL(item.url).hostname.replace(/^www\./, '') === option(args, 'website')),
      );
      if (json) result = items;
      else {
        rows(
          items.map((item) => ({
            id: item.id,
            type: item.resourceType,
            state: item.knowledgeState,
            title: item.title,
            url: item.url,
          })),
          false,
        );
        return;
      }
    } else if (action === 'show') result = findResource(state, required(rest[0], 'Resource ID'));
    else if (action === 'add') {
      const kind = option(args, 'type');
      if (kind && !RESOURCE_TYPES.includes(kind as (typeof RESOURCE_TYPES)[number]))
        throw new Error(`Type must be one of: ${RESOURCE_TYPES.join(', ')}.`);
      const record = resourceFromLink(
        required(rest[0], 'URL'),
        option(args, 'title'),
        kind as (typeof RESOURCE_TYPES)[number] | undefined,
      );
      if (!record) throw new Error('Enter a complete HTTP(S) URL without credentials.');
      addResource(state, record);
      mutate = true;
      result = record;
    } else if (action === 'remove') {
      const id = required(rest[0], 'Resource ID');
      findResource(state, id);
      state.resources = state.resources.filter((item) => item.id !== id);
      mutate = true;
      result = { removed: id };
    } else if (['note', 'state', 'type'].includes(action || '')) {
      const record = findResource(state, required(rest[0], 'Resource ID'));
      const value = required(rest[1], 'Value');
      if (action === 'note') record.note = value.slice(0, 10_000);
      if (action === 'state')
        record.knowledgeState = oneOf(value, ['inbox', 'reviewing', 'reference'], 'State');
      if (action === 'type') record.resourceType = oneOf(value, RESOURCE_TYPES, 'Type');
      mutate = true;
      result = record;
    } else throw new Error('Unknown library command.');
  } else if (group === 'simulator') {
    const now = Date.now();
    const version = state.preferences.version;
    if (action === 'status')
      result = {
        simulationOnly: true,
        ...state.simulator,
        selectedTargets: selectGardenTargets(state.preferences),
      };
    else {
      if (action === 'plan') {
        const targets = selectGardenTargets(state.preferences).map((item) => item.id);
        if (!targets.length) throw new Error('No simulator targets match the current preferences.');
        state.simulator = gardenReducer(state.simulator, {
          type: 'PLAN',
          version,
          now,
          targetIds: targets,
        });
      } else if (action === 'consent')
        state.simulator = gardenReducer(state.simulator, {
          type: 'CONSENT',
          value: oneOf(rest[0], ['yes', 'no'], 'Consent') === 'yes',
        });
      else if (action === 'start' || action === 'resume')
        state.simulator = gardenReducer(state.simulator, {
          type: action.toUpperCase() as 'START' | 'RESUME',
          version,
          now,
        });
      else if (action === 'tick') {
        const count = integer(rest[0], 'Tick count', 1, 100, 1);
        for (let index = 0; index < count; index++)
          state.simulator = gardenReducer(state.simulator, {
            type: 'TICK',
            version,
            now: Date.now(),
          });
      } else if (['pause', 'account', 'fault', 'reconcile', 'reset'].includes(action || ''))
        state.simulator = gardenReducer(state.simulator, {
          type: action!.toUpperCase() as 'PAUSE' | 'ACCOUNT' | 'FAULT' | 'RECONCILE' | 'RESET',
        });
      else throw new Error('Unknown simulator command.');
      mutate = true;
      result = {
        simulationOnly: true,
        ...state.simulator,
        currentStep: STEPS[state.simulator.step] ?? null,
        availableTargets: CHANNELS.map((item) => item.id),
      };
    }
  } else if (group === 'agent') {
    if (action === 'capabilities')
      result = {
        simulator: 'tested_simulator',
        youtube: 'blocked_external',
        bilibili: 'blocked_external',
        jev: isJevConfigured() ? 'configured_unverified' : 'not_configured',
        multimodal:
          process.env.MULTIMODAL_API_BASE_URL &&
          process.env.MULTIMODAL_API_KEY &&
          process.env.MULTIMODAL_MODEL
            ? 'configured_unverified'
            : 'not_configured',
      };
    else if (action === 'plan') {
      const platform = option(args, 'platform') ?? 'simulator';
      const iface = option(args, 'interface') ?? 'local_agent';
      if (!isStrategyPlatform(platform) || !isStrategyInterface(iface))
        throw new Error('Unsupported platform or interface.');
      result = compileStrategyPlan({
        platform,
        interface: iface,
        strategyMode: state.preferences.strategyMode,
        goalTags: state.preferences.tags,
        weights: state.preferences.behaviorWeights,
        sessionMinutes: integer(option(args, 'minutes'), 'Minutes', 1, 60, 15),
        maxVideos: integer(option(args, 'videos'), 'Videos', 1, 20, 5),
      });
    } else if (action === 'decision') {
      const input = validateCandidateDecisionInput({
        platform: option(args, 'platform') ?? 'simulator',
        videoTitle: required(option(args, 'title'), 'Video title'),
        goalTags: state.preferences.tags,
        remainingVideoBudget: integer(option(args, 'videos'), 'Videos', 0, 50, 5),
        remainingMinuteBudget: integer(option(args, 'minutes'), 'Minutes', 0, 240, 15),
        provider: option(args, 'provider') ?? 'auto',
      });
      if (input.provider === 'jev' && !isJevConfigured())
        throw new Error(
          'JEV_MODEL_NOT_CONFIGURED: Set TYPESAFE_API_KEY in the environment or .env.local.',
        );
      result = {
        decision: await decideCandidate(input),
        boundary: 'Preview only. No platform action or authorization.',
      };
    } else if (action === 'evaluate') {
      const runs = parseObservedRuns(
        JSON.parse(await readFile(required(option(args, 'input'), 'Input file'), 'utf8')),
      );
      result = {
        report: evaluateObservedRuns(runs),
        boundary: 'Observed association only; input provenance is not verified by the CLI.',
      };
    } else if (action === 'observe') {
      const input = validateObservationInput(
        JSON.parse(await readFile(required(option(args, 'input'), 'Input file'), 'utf8')),
      );
      result = {
        analysis: await analyzeObservation(input),
        boundary: 'Content observation only; no account action.',
      };
    } else throw new Error('Unknown agent command.');
  } else if (group === 'state') {
    const file = required(option(args, 'file'), 'File');
    if (action === 'export') {
      await saveState(file, state);
      result = { exported: file, schema: state.schema };
    } else if (action === 'import' || action === 'import-browser') {
      if (!flag(args, 'replace')) throw new Error('Import replaces CLI data; pass --replace.');
      const incoming = JSON.parse(await readFile(file, 'utf8'));
      if (action === 'import-browser' && incoming?.schema !== 'feed-gardener-demo/1')
        throw new Error('Expected a feed-gardener-demo/1 browser JSON export.');
      const restored = readState(
        action === 'import-browser' ? { ...incoming, schema: 'feed-gardener-cli/1' } : incoming,
      );
      await saveState(path, restored);
      result = {
        imported: basename(file),
        dataFile: path,
        schema: restored.schema,
        resources: restored.resources.length,
        note:
          action === 'import-browser' && !incoming.resources
            ? 'This browser export contained no resource library records.'
            : undefined,
      };
    } else throw new Error('Use state export or import.');
  } else throw new Error(`Unknown command ${group}. Run pnpm cli -- help.`);

  if (mutate) await saveState(path, state);
  output(result, json);
}

run(process.argv.slice(2)).catch((error) => {
  console.error(`feed-gardener: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

/** Deterministic local simulator. This module performs no browser or network operations. */
import type { Preferences } from './feed.ts';

type Status = 'idle' | 'ready' | 'running' | 'paused' | 'finished';
type Reason =
  | ''
  | 'MANUAL_PAUSE'
  | 'ACCOUNT_CHANGED'
  | 'UNCERTAIN_RESULT'
  | 'PROFILE_CHANGED'
  | 'RELOADED'
  | 'RECONCILED'
  | 'PLAN_EXPIRED';
export type GardenLog = {
  id: number;
  code: string;
  actor: 'agent' | 'user' | 'system';
  target?: string;
};
export type GardenState = {
  schema: 1;
  status: Status;
  reason: Reason;
  account: 'A' | 'B';
  planAccount: 'A' | 'B';
  planVersion: number;
  targetIds: string[];
  consent: boolean;
  expiresAt: number;
  index: number;
  step: number;
  subscriptions: { A: string[]; B: string[] };
  fault: boolean;
  logs: GardenLog[];
  revision: number;
};
export type GardenAction =
  | { type: 'RESTORE'; state: GardenState }
  | { type: 'PLAN'; version: number; now: number; targetIds?: string[] }
  | { type: 'CONSENT'; value: boolean }
  | { type: 'START' | 'RESUME' | 'TICK'; version: number; now: number }
  | { type: 'PAUSE' | 'ACCOUNT' | 'FAULT' | 'RECONCILE' | 'RESET' }
  | { type: 'PROFILE'; version: number };

export const CHANNELS = [
  {
    id: 'sim-open-systems',
    name: 'Stateful',
    domain: 'backend-systems',
    tags: ['databases', 'distributed-systems'],
    topic: ['系统设计 · 分布式架构', 'System design · distributed systems'],
    letters: 'ST',
    color: 'sage',
  },
  {
    id: 'sim-practical-ml',
    name: 'Kernel Lab',
    domain: 'ai-infrastructure',
    tags: ['local-inference', 'quantization'],
    topic: ['本地推理 · AI 工程', 'Local inference · AI engineering'],
    letters: 'KL',
    color: 'sand',
  },
  {
    id: 'sim-builders',
    name: 'Prompt & Pipe',
    domain: 'developer-tools',
    tags: ['cli', 'dev-environments'],
    topic: ['命令行 · 开发者工具', 'Command line · developer tools'],
    letters: 'PP',
    color: 'lavender',
  },
  {
    id: 'sim-open-practice',
    name: 'Open Practice',
    domain: 'open-source',
    tags: ['open-source', 'local-first', 'self-hosting'],
    topic: ['开源应用 · 本地优先', 'Open source · local-first'],
    letters: 'OP',
    color: 'sage',
  },
  {
    id: 'sim-pixel-field',
    name: 'Pixel Field',
    domain: 'web-interaction',
    tags: ['webgpu', 'web-performance'],
    topic: ['WebGPU · Web 性能', 'WebGPU · web performance'],
    letters: 'PF',
    color: 'lavender',
  },
  {
    id: 'sim-edge-workshop',
    name: 'Edge Workshop',
    domain: 'robotics-edge',
    tags: ['edge-ai', 'computer-vision', 'embedded'],
    topic: ['边缘 AI · 嵌入式系统', 'Edge AI · embedded systems'],
    letters: 'EW',
    color: 'sand',
  },
];

/** Preference matching proposes candidates; it never grants permission to subscribe. */
export function selectGardenTargets(preferences: Preferences): typeof CHANNELS {
  if (preferences.blockedSources.includes('YouTube')) return [];
  const orderedDomains = [
    ...new Set([
      ...preferences.domains,
      ...(!preferences.onlySelectedTags && preferences.exploration > 0
        ? preferences.relatedDomains
        : []),
    ]),
  ];
  return orderedDomains
    .flatMap((domain) =>
      CHANNELS.filter(
        (channel) =>
          channel.domain === domain &&
          (!preferences.onlySelectedTags ||
            channel.tags.some((tag) => preferences.tags.includes(tag))) &&
          !preferences.blockedSources.includes(channel.name) &&
          !preferences.blockedSources.includes(channel.id) &&
          !channel.tags.some((tag) => preferences.blockedTags.includes(tag)),
      ),
    )
    .slice(0, 3);
}

function validTargetIds(ids: unknown, allowEmpty = false): ids is string[] {
  return (
    Array.isArray(ids) &&
    (allowEmpty || ids.length > 0) &&
    ids.length <= 3 &&
    new Set(ids).size === ids.length &&
    ids.every((id) => CHANNELS.some((channel) => channel.id === id))
  );
}

export const STORAGE_KEY = 'feed-gardener.simulator.v1';
export const STEPS = ['OBSERVE', 'PREPARE', 'EXECUTE', 'VERIFY', 'CHECKPOINT'];
export const blockedReasons: Reason[] = [
  'ACCOUNT_CHANGED',
  'PROFILE_CHANGED',
  'UNCERTAIN_RESULT',
  'PLAN_EXPIRED',
];

export function initialGardenState(): GardenState {
  return {
    schema: 1,
    status: 'idle',
    reason: '',
    account: 'A',
    planAccount: 'A',
    planVersion: 0,
    targetIds: [],
    consent: false,
    expiresAt: 0,
    index: 0,
    step: 0,
    subscriptions: { A: [], B: [] },
    fault: false,
    logs: [],
    revision: 0,
  };
}
function log(
  state: GardenState,
  code: string,
  actor: GardenLog['actor'] = 'agent',
  target?: string,
): GardenState {
  const revision = state.revision + 1;
  return {
    ...state,
    revision,
    logs: [...state.logs, { id: revision, code, actor, target }].slice(-40),
  };
}
function guarded(state: GardenState, version: number, now: number): GardenState {
  const reason: Reason =
    state.planVersion !== version
      ? 'PROFILE_CHANGED'
      : state.account !== state.planAccount
        ? 'ACCOUNT_CHANGED'
        : now >= state.expiresAt
          ? 'PLAN_EXPIRED'
          : '';
  return reason
    ? log({ ...state, status: 'paused', reason, consent: false }, reason, 'system')
    : state;
}
export function gardenReducer(state: GardenState, action: GardenAction): GardenState {
  switch (action.type) {
    case 'RESTORE':
      return action.state;
    case 'RESET':
      return initialGardenState();
    case 'PLAN': {
      const targetIds = action.targetIds ?? CHANNELS.slice(0, 3).map((channel) => channel.id);
      if (state.status === 'running' || !validTargetIds(targetIds)) return state;
      return log(
        {
          ...state,
          status: 'ready',
          reason: '',
          planVersion: action.version,
          targetIds: [...targetIds],
          planAccount: state.account,
          expiresAt: action.now + 120_000,
          consent: false,
          index: 0,
          step: 0,
          fault: false,
          logs: [],
        },
        'PLAN_READY',
        'system',
      );
    }
    case 'CONSENT':
      return state.status === 'running' ? state : { ...state, consent: action.value };
    case 'START':
    case 'RESUME': {
      if (
        !state.consent ||
        !state.targetIds.length ||
        !(state.status === 'ready' || state.status === 'paused') ||
        blockedReasons.includes(state.reason)
      )
        return state;
      const checked = guarded(state, action.version, action.now);
      return checked !== state
        ? checked
        : log(
            { ...state, status: 'running', reason: '' },
            action.type === 'START' ? 'STARTED' : 'RESUMED',
            'user',
          );
    }
    case 'PAUSE':
      return state.status === 'running'
        ? log({ ...state, status: 'paused', reason: 'MANUAL_PAUSE' }, 'MANUAL_PAUSE', 'user')
        : state;
    case 'PROFILE':
      return state.status !== 'idle' &&
        state.planVersion !== action.version &&
        state.reason !== 'PROFILE_CHANGED'
        ? log(
            { ...state, status: 'paused', reason: 'PROFILE_CHANGED', consent: false, fault: false },
            'PROFILE_CHANGED',
            'system',
          )
        : state;
    case 'ACCOUNT': {
      const next = {
        ...state,
        account: state.account === 'A' ? ('B' as const) : ('A' as const),
        consent: false,
        fault: false,
      };
      return state.status === 'idle'
        ? next
        : log(
            { ...next, status: 'paused', reason: 'ACCOUNT_CHANGED' },
            'ACCOUNT_CHANGED',
            'system',
          );
    }
    case 'FAULT':
      return state.status === 'running'
        ? log({ ...state, fault: true }, 'FAULT_ARMED', 'system')
        : state;
    case 'RECONCILE': {
      if (state.reason !== 'UNCERTAIN_RESULT') return state;
      const target = state.targetIds[state.index];
      if (
        !target ||
        state.account !== state.planAccount ||
        !state.subscriptions[state.account].includes(target)
      )
        return state;
      return log(
        { ...state, status: 'paused', reason: 'RECONCILED', step: 4, fault: false },
        'RECONCILED',
        'agent',
        target,
      );
    }
    case 'TICK': {
      if (state.status !== 'running') return state;
      const checked = guarded(state, action.version, action.now);
      if (checked !== state) return checked;
      if (!state.consent || state.index >= state.targetIds.length) return state;
      const target = state.targetIds[state.index];
      if (state.step === 2) {
        const exists = state.subscriptions[state.account].includes(target);
        const subscriptions = exists
          ? state.subscriptions
          : {
              ...state.subscriptions,
              [state.account]: [...state.subscriptions[state.account], target],
            };
        if (state.fault && !exists)
          return log(
            {
              ...state,
              subscriptions,
              status: 'paused',
              reason: 'UNCERTAIN_RESULT',
              fault: false,
              step: 3,
            },
            'UNCERTAIN_RESULT',
            'agent',
            target,
          );
        return log(
          { ...state, subscriptions, step: 3 },
          exists ? 'NOOP_ALREADY_SATISFIED' : 'EXECUTE',
          'agent',
          target,
        );
      }
      if (state.step === 4) {
        const last = state.index === state.targetIds.length - 1;
        return log(
          {
            ...state,
            index: state.index + 1,
            step: 0,
            status: last ? 'finished' : 'running',
            fault: last ? false : state.fault,
          },
          last ? 'FINISHED' : 'CHECKPOINT',
          'agent',
          target,
        );
      }
      return log({ ...state, step: state.step + 1 }, STEPS[state.step], 'agent', target);
    }
  }
}

export function restoreGardenState(raw: string | null, version: number): GardenState {
  if (!raw) return initialGardenState();
  try {
    const value = JSON.parse(raw) as GardenState;
    // Previous demo snapshots used this fixed three-target plan.
    if (value && value.targetIds === undefined)
      value.targetIds =
        value.status === 'idle' ? [] : CHANNELS.slice(0, 3).map((channel) => channel.id);
    if (
      !value ||
      value.schema !== 1 ||
      !validTargetIds(value.targetIds, value.status === 'idle') ||
      !['idle', 'ready', 'running', 'paused', 'finished'].includes(value.status) ||
      !['A', 'B'].includes(value.account) ||
      !['A', 'B'].includes(value.planAccount) ||
      !Number.isInteger(value.index) ||
      value.index < 0 ||
      value.index > value.targetIds.length ||
      !Number.isInteger(value.step) ||
      value.step < 0 ||
      value.step > 4 ||
      !Number.isFinite(value.expiresAt) ||
      !Number.isInteger(value.planVersion) ||
      !Number.isInteger(value.revision) ||
      !Array.isArray(value.logs) ||
      ![value.subscriptions?.A, value.subscriptions?.B].every(
        (items) =>
          Array.isArray(items) &&
          items.length <= CHANNELS.length &&
          new Set(items).size === items.length &&
          items.every((id) => CHANNELS.some((channel) => channel.id === id)),
      )
    )
      return initialGardenState();
    value.logs = value.logs
      .filter(
        (entry) =>
          Number.isInteger(entry.id) &&
          typeof entry.code === 'string' &&
          ['agent', 'user', 'system'].includes(entry.actor) &&
          (!entry.target || CHANNELS.some((channel) => channel.id === entry.target)),
      )
      .slice(-40);
    value.consent = false;
    value.fault = false;
    if (value.status !== 'idle' && value.planVersion !== version)
      return log(
        { ...value, status: 'paused', reason: 'PROFILE_CHANGED' },
        'PROFILE_CHANGED',
        'system',
      );
    if (
      value.status === 'running' ||
      value.status === 'ready' ||
      (value.status === 'paused' && !blockedReasons.includes(value.reason))
    )
      return log({ ...value, status: 'paused', reason: 'RELOADED' }, 'RELOADED', 'system');
    return value;
  } catch {
    return initialGardenState();
  }
}

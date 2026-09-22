export const behaviorSignalKeys = [
  'nativeSearch',
  'watchTime',
  'completion',
  'positiveFeedback',
  'save',
  'negativeFeedback',
  'repetition',
  'diversity',
] as const;

export type BehaviorSignal = (typeof behaviorSignalKeys)[number];
export type BehaviorWeights = Record<BehaviorSignal, number>;

/**
 * Feed Gardener's starting hypothesis for allocating an intervention budget.
 * These are product defaults, not claimed YouTube or bilibili algorithm weights.
 */
export const defaultBehaviorWeights: BehaviorWeights = {
  nativeSearch: 15,
  watchTime: 20,
  completion: 20,
  positiveFeedback: 10,
  save: 10,
  negativeFeedback: 10,
  repetition: 5,
  diversity: 10,
};

export type StrategyPlatform = 'youtube' | 'bilibili' | 'simulator';
export type StrategyInterface = 'multimodal_api' | 'local_agent';
export type StrategyMode = 'simple' | 'expert';

export type StrategyRequest = {
  platform: StrategyPlatform;
  interface: StrategyInterface;
  strategyMode?: StrategyMode;
  goalTags: string[];
  weights?: Partial<BehaviorWeights>;
  sessionMinutes?: number;
  maxVideos?: number;
};

export type StrategyPlan = {
  contractVersion: 'feed-gardener-agent/1';
  platform: StrategyPlatform;
  interface: StrategyInterface;
  strategyMode: StrategyMode;
  goalTags: string[];
  weights: BehaviorWeights;
  budget: {
    sessionMinutes: number;
    maxVideos: number;
  };
  executionStatus: 'simulator_ready' | 'policy_blocked';
  blockedReason: string | null;
  phases: Array<{
    id: 'baseline' | 'select' | 'execute' | 'verify' | 'measure';
    actor: 'agent';
    writesAccountState: boolean;
  }>;
};

const cleanWeight = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, value));
};

export function normalizeBehaviorWeights(input?: Partial<BehaviorWeights>): BehaviorWeights {
  const raw = Object.fromEntries(
    behaviorSignalKeys.map((key) => [key, cleanWeight(input?.[key], defaultBehaviorWeights[key])]),
  ) as BehaviorWeights;
  const total = behaviorSignalKeys.reduce((sum, key) => sum + raw[key], 0);
  if (total <= 0) return { ...defaultBehaviorWeights };

  const normalized = {} as BehaviorWeights;
  let allocated = 0;
  behaviorSignalKeys.forEach((key, index) => {
    const value =
      index === behaviorSignalKeys.length - 1
        ? Math.max(0, 100 - allocated)
        : Math.round((raw[key] / total) * 1000) / 10;
    normalized[key] = value;
    allocated += value;
  });
  return normalized;
}

const cleanTags = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0 && value.length <= 80),
    ),
  ].slice(0, 12);
};

export function compileStrategyPlan(request: StrategyRequest): StrategyPlan {
  const sessionMinutes = Math.min(60, Math.max(1, Math.floor(request.sessionMinutes ?? 15)));
  const maxVideos = Math.min(20, Math.max(1, Math.floor(request.maxVideos ?? 5)));
  const live = request.platform !== 'simulator';
  const strategyMode = request.strategyMode === 'expert' ? 'expert' : 'simple';

  return {
    contractVersion: 'feed-gardener-agent/1',
    platform: request.platform,
    interface: request.interface,
    strategyMode,
    goalTags: cleanTags(request.goalTags),
    weights:
      strategyMode === 'expert'
        ? normalizeBehaviorWeights(request.weights)
        : { ...defaultBehaviorWeights },
    budget: { sessionMinutes, maxVideos },
    executionStatus: live ? 'policy_blocked' : 'simulator_ready',
    blockedReason: live
      ? 'Real account playback and feedback remain blocked until platform policy, identity, consent, and result verification all pass.'
      : null,
    phases: [
      { id: 'baseline', actor: 'agent', writesAccountState: false },
      { id: 'select', actor: 'agent', writesAccountState: false },
      { id: 'execute', actor: 'agent', writesAccountState: true },
      { id: 'verify', actor: 'agent', writesAccountState: false },
      { id: 'measure', actor: 'agent', writesAccountState: false },
    ],
  };
}

export function isStrategyPlatform(value: unknown): value is StrategyPlatform {
  return value === 'youtube' || value === 'bilibili' || value === 'simulator';
}

export function isStrategyInterface(value: unknown): value is StrategyInterface {
  return value === 'multimodal_api' || value === 'local_agent';
}

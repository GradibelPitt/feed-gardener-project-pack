export type ObservedFeedCard = {
  rank: number;
  tags: string[];
  creatorId?: string;
};

export type NativeFeedSnapshot = {
  snapshotId: string;
  capturedAt: string;
  surface: 'home';
  entries: ObservedFeedCard[];
};

export type ObservedRun = {
  runId: string;
  platform: 'youtube' | 'bilibili' | 'simulator';
  targetTags: string[];
  baseline: NativeFeedSnapshot;
  followup: NativeFeedSnapshot;
};

export type RunFeedShift = {
  runId: string;
  platform: ObservedRun['platform'];
  targetTags: string[];
  baselineCount: number;
  followupCount: number;
  targetAppearanceRateBefore: number;
  targetAppearanceRateAfter: number;
  targetAppearanceRateChangePp: number;
  rankWeightedRateBefore: number;
  rankWeightedRateAfter: number;
  rankWeightedRateChangePp: number;
  perTag: Array<{
    tag: string;
    before: number;
    after: number;
    changePp: number;
  }>;
};

export type FeedShiftReport = {
  runs: RunFeedShift[];
  aggregate: {
    runCount: number;
    status: 'insufficient_runs' | 'observed_association';
    meanAppearanceRateChangePp: number;
    meanRankWeightedRateChangePp: number;
    appearanceRateRangePp: [number, number] | null;
    note: string;
  };
};

export class FeedObservationError extends Error {}

const normalizeTag = (value: string) =>
  value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');

const round = (value: number) => Math.round(value * 10) / 10;

const snapshotRates = (snapshot: NativeFeedSnapshot, targetTags: string[]) => {
  const targets = new Set(targetTags.map(normalizeTag));
  const entries = [...snapshot.entries]
    .filter(
      (entry) =>
        Number.isInteger(entry.rank) &&
        entry.rank > 0 &&
        Array.isArray(entry.tags) &&
        entry.tags.length > 0,
    )
    .sort((a, b) => a.rank - b.rank);
  if (!entries.length) throw new FeedObservationError('Each snapshot needs tagged feed entries.');
  const matches = entries.map((entry) => {
    const tags = new Set(entry.tags.map(normalizeTag));
    return [...targets].some((target) => tags.has(target));
  });
  const totalWeight = entries.reduce((sum, entry) => sum + 1 / Math.log2(entry.rank + 1), 0);
  const matchedWeight = entries.reduce(
    (sum, entry, index) => sum + (matches[index] ? 1 / Math.log2(entry.rank + 1) : 0),
    0,
  );
  const perTag = new Map<string, number>();
  for (const target of targets) {
    const matched = entries.filter((entry) => entry.tags.map(normalizeTag).includes(target)).length;
    perTag.set(target, (matched / entries.length) * 100);
  }
  return {
    count: entries.length,
    appearanceRate: (matches.filter(Boolean).length / entries.length) * 100,
    rankWeightedRate: totalWeight ? (matchedWeight / totalWeight) * 100 : 0,
    perTag,
  };
};

export function evaluateObservedRun(run: ObservedRun): RunFeedShift {
  const targetTags = [...new Set(run.targetTags.map(normalizeTag).filter(Boolean))].slice(0, 20);
  if (!targetTags.length) throw new FeedObservationError('A run needs at least one target tag.');
  const before = snapshotRates(run.baseline, targetTags);
  const after = snapshotRates(run.followup, targetTags);
  return {
    runId: run.runId,
    platform: run.platform,
    targetTags,
    baselineCount: before.count,
    followupCount: after.count,
    targetAppearanceRateBefore: round(before.appearanceRate),
    targetAppearanceRateAfter: round(after.appearanceRate),
    targetAppearanceRateChangePp: round(after.appearanceRate - before.appearanceRate),
    rankWeightedRateBefore: round(before.rankWeightedRate),
    rankWeightedRateAfter: round(after.rankWeightedRate),
    rankWeightedRateChangePp: round(after.rankWeightedRate - before.rankWeightedRate),
    perTag: targetTags.map((tag) => ({
      tag,
      before: round(before.perTag.get(tag) ?? 0),
      after: round(after.perTag.get(tag) ?? 0),
      changePp: round((after.perTag.get(tag) ?? 0) - (before.perTag.get(tag) ?? 0)),
    })),
  };
}

export function evaluateObservedRuns(runs: ObservedRun[]): FeedShiftReport {
  const results = runs.slice(0, 100).map(evaluateObservedRun);
  const appearanceChanges = results.map((run) => run.targetAppearanceRateChangePp);
  const rankChanges = results.map((run) => run.rankWeightedRateChangePp);
  const mean = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  return {
    runs: results,
    aggregate: {
      runCount: results.length,
      status: results.length >= 3 ? 'observed_association' : 'insufficient_runs',
      meanAppearanceRateChangePp: round(mean(appearanceChanges)),
      meanRankWeightedRateChangePp: round(mean(rankChanges)),
      appearanceRateRangePp: appearanceChanges.length
        ? [Math.min(...appearanceChanges), Math.max(...appearanceChanges)]
        : null,
      note:
        results.length >= 3
          ? 'Repeated before/after observations show an association, not a platform weight or causal proof.'
          : 'Record at least three comparable runs before presenting an aggregate direction; causal proof still requires a control.',
    },
  };
}

export function parseObservedRuns(value: unknown): ObservedRun[] {
  if (!Array.isArray(value)) throw new FeedObservationError('runs must be an array.');
  return value.slice(0, 100).map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') {
      throw new FeedObservationError(`run ${index + 1} is invalid.`);
    }
    const raw = candidate as Record<string, unknown>;
    if (!['youtube', 'bilibili', 'simulator'].includes(String(raw.platform))) {
      throw new FeedObservationError(`run ${index + 1} has an unsupported platform.`);
    }
    const parseSnapshot = (snapshot: unknown, name: string): NativeFeedSnapshot => {
      if (!snapshot || typeof snapshot !== 'object') {
        throw new FeedObservationError(`run ${index + 1} ${name} is invalid.`);
      }
      const record = snapshot as Record<string, unknown>;
      if (!Array.isArray(record.entries) || record.entries.length > 100) {
        throw new FeedObservationError(`run ${index + 1} ${name} entries are invalid.`);
      }
      return {
        snapshotId: String(record.snapshotId ?? `${index}-${name}`),
        capturedAt: String(record.capturedAt ?? ''),
        surface: 'home',
        entries: record.entries.map((entry) => {
          const card = entry as Record<string, unknown>;
          return {
            rank: Number(card.rank),
            tags: Array.isArray(card.tags)
              ? card.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 20)
              : [],
            ...(typeof card.creatorId === 'string' ? { creatorId: card.creatorId } : {}),
          };
        }),
      };
    };
    return {
      runId: String(raw.runId ?? `run-${index + 1}`),
      platform: raw.platform as ObservedRun['platform'],
      targetTags: Array.isArray(raw.targetTags)
        ? raw.targetTags.filter((tag): tag is string => typeof tag === 'string').slice(0, 20)
        : [],
      baseline: parseSnapshot(raw.baseline, 'baseline'),
      followup: parseSnapshot(raw.followup, 'followup'),
    };
  });
}

'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, Bookmark, Compass, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import type { HarvestItem, HarvestPayload } from '@/lib/crawler/types';
import type { Locale } from '@/lib/locale';
import { readApiData } from '@/lib/api-contract';
import { domains, type Preferences } from '@/lib/feed';
import {
  effectiveTagJev,
  matchedHarvestTagIds,
  rankHarvestCandidates,
  type FeederEvent,
  type FeederSignal,
} from '@/lib/feeder';
import { resourceUrlKey, type ResourceRecord } from '@/lib/resources';
import { mergeHarvestPayload } from '@/lib/crawler/merge';
import { simulateFeed, type JevRating } from '@/lib/feed-simulator';
import SourceBoards, { readSocialImports } from './SourceBoards';
import YouTubeVideo from './YouTubeVideo';
import styles from './FeederWorkspace.module.css';

type WorkspacePage = 'discover' | 'garden' | 'saved';
type Props = {
  page: WorkspacePage;
  locale: Locale;
  preferences: Preferences;
  resources: ResourceRecord[];
  events: FeederEvent[];
  onSaveResource: (item: HarvestItem) => void;
  onRemoveResource: (id: string) => void;
  onRecordEvent: (event: FeederEvent) => void;
  onUndoEvent: (id: string) => void;
  onTagJevChange: (id: string, value: number) => void;
  onTargetJevAverageChange: (value: number) => void;
  onOnlySelectedTagsChange: (value: boolean) => void;
  onInterestRuleChange: (
    rule: 'requireAllSelectedTags' | 'excludeUnselectedTags',
    value: boolean,
  ) => void;
  onEditInterests: () => void;
};

const catalog = domains.flatMap((domain) =>
  domain.tags.map((tag) => ({ ...tag, domainId: domain.id })),
);
const t = (zh: string, en: string, locale: Locale) => (locale === 'zh' ? zh : en);

function HelpHint({ title, children }: { title: string; children: ReactNode }) {
  const tooltipId = useId();
  return (
    <span className={styles.helpHint}>
      <button
        type="button"
        className={styles.helpIcon}
        aria-label={`About ${title}`}
        aria-describedby={tooltipId}
      >
        ?
      </button>
      <span id={tooltipId} role="tooltip" className={styles.helpText}>
        {children}
      </span>
    </span>
  );
}

export default function FeederWorkspace({
  page,
  locale,
  preferences,
  resources,
  events,
  onSaveResource,
  onRemoveResource,
  onRecordEvent,
  onUndoEvent,
  onTagJevChange,
  onTargetJevAverageChange,
  onOnlySelectedTagsChange,
  onInterestRuleChange,
  onEditInterests,
}: Props) {
  const [payload, setPayload] = useState<HarvestPayload | null>(null);
  const [socialImports, setSocialImports] = useState<HarvestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'feed' | 'sources'>('feed');
  const [query, setQuery] = useState('');
  const [displayCount, setDisplayCount] = useState(20);
  const [ratingRevision, setRatingRevision] = useState(0);
  const [scoring, setScoring] = useState(false);
  const [scoringError, setScoringError] = useState('');
  const [scoringDone, setScoringDone] = useState(false);
  const ratingsRef = useRef(new Map<string, JevRating>());
  const ratingContextRef = useRef('');

  async function refresh(force = false) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (force) params.set('refresh', 'true');
      catalog
        .filter((tag) => preferences.tags.includes(tag.id))
        .slice(0, 2)
        .forEach((tag) => params.append('tag', tag.labelEn));
      const response = await fetch(`/api/harvest?${params}`, {
        cache: 'no-store',
      });
      setPayload(await readApiData<HarvestPayload>(response));
      setSocialImports(readSocialImports());
    } catch {
      setError('Public sources could not be loaded. Try again.');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }

  useEffect(() => {
    setSocialImports(readSocialImports());
  }, []);

  const savedKeys = useMemo(
    () => new Set(resources.map((item) => resourceUrlKey(item.url))),
    [resources],
  );
  // Target average and legacy Agent settings do not affect candidate eligibility or ranking.
  const candidatePreferences = useMemo(
    () => preferences,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      preferences.tags,
      preferences.domains,
      preferences.customTags,
      preferences.tagJev,
      preferences.blockedTags,
      preferences.blockedSources,
      preferences.onlySelectedTags,
      preferences.requireAllSelectedTags,
      preferences.excludeUnselectedTags,
      preferences.relatedDomains,
      preferences.exploration,
    ],
  );
  const candidates = useMemo(
    () =>
      rankHarvestCandidates(
        [
          ...(payload?.sections.social ?? []).filter((item) => item.source !== 'YouTube'),
          ...(payload?.sections.academic ?? []),
          ...(payload?.sections.opensource ?? []),
          ...socialImports,
        ],
        candidatePreferences,
        events,
        { limit: 60, pool: true },
      ),
    [payload, socialImports, candidatePreferences, events],
  );
  const publicCandidateCount =
    (payload?.sections.social ?? []).filter((item) => item.source !== 'YouTube').length +
    (payload?.sections.academic ?? []).length +
    (payload?.sections.opensource ?? []).length +
    socialImports.length;
  const targetAverage = preferences.targetJevAverage ?? 8;
  const targetAverageRef = useRef(targetAverage);
  targetAverageRef.current = targetAverage;
  const goalTags = useMemo(
    () =>
      [
        ...catalog.filter((tag) => preferences.tags.includes(tag.id)).map((tag) => tag.labelEn),
        ...preferences.customTags.map((tag) => tag.labelEn),
      ].slice(0, 12),
    [preferences.tags, preferences.customTags],
  );
  const goalKey = goalTags.join('\u0000');
  const ratingContext = `${goalKey}\u0001${candidates.map((candidate) => `${candidate.key}\u0000${candidate.item.title}`).join('\u0001')}`;
  const simulation = useMemo(
    () => simulateFeed(candidates, ratingsRef.current, targetAverage),
    // ratingRevision signals mutations to the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, targetAverage, ratingRevision],
  );
  useEffect(() => {
    if (!loaded || page !== 'discover' || view !== 'feed' || !candidates.length || !goalTags.length)
      return;
    if (ratingContextRef.current !== ratingContext) {
      ratingsRef.current.clear();
      ratingContextRef.current = ratingContext;
      setRatingRevision((value) => value + 1);
    }
    let cancelled = false;
    const controller = new AbortController();
    setScoring(true);
    setScoringDone(false);
    setScoringError('');
    const ordered = candidates.flatMap((_, index) => {
      if (index >= Math.ceil(candidates.length / 2)) return [];
      const opposite = candidates[candidates.length - 1 - index];
      return opposite && opposite !== candidates[index]
        ? [candidates[index], opposite]
        : [candidates[index]];
    });
    async function run() {
      let failures = 0;
      for (let offset = 0; offset < ordered.length && !cancelled; offset += 4) {
        const batch = ordered
          .slice(offset, offset + 4)
          .filter((candidate) => !ratingsRef.current.has(candidate.key));
        const results = await Promise.all(
          batch.map(async (candidate) => {
            try {
              const response = await fetch('/api/agent/v1/decisions/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  platform: 'feeder',
                  contentTitle: candidate.item.title,
                  goalTags,
                  remainingVideoBudget: 1,
                  remainingMinuteBudget: 1,
                  provider: 'jev',
                }),
                signal: controller.signal,
              });
              if (response.status === 503) {
                setScoringError('Jev is not configured on this server.');
                controller.abort();
                return null;
              }
              const data = await readApiData<{
                decision: {
                  relevanceScore: number | null;
                  confidence: number | null;
                  provider: string;
                  model?: string;
                };
              }>(response);
              const decision = data.decision;
              if (
                decision.provider !== 'jev' ||
                decision.relevanceScore === null ||
                decision.confidence === null
              )
                throw new Error('Jev score unavailable');
              return {
                key: candidate.key,
                rating: {
                  score: decision.relevanceScore,
                  confidence: decision.confidence,
                  model: decision.model,
                },
              };
            } catch {
              if (controller.signal.aborted) return null;
              failures += 1;
              return null;
            }
          }),
        );
        if (cancelled || controller.signal.aborted) break;
        for (const result of results) if (result) ratingsRef.current.set(result.key, result.rating);
        setRatingRevision((value) => value + 1);
        const next = simulateFeed(candidates, ratingsRef.current, targetAverageRef.current);
        if (next.targetMet && next.items.length >= 12 && next.ratedCount >= 24) break;
      }
      if (!cancelled) {
        setScoring(false);
        setScoringDone(true);
        if (failures && !controller.signal.aborted)
          setScoringError(`${failures} candidates could not be scored by Jev.`);
      }
    }
    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // goalKey represents the selected tags and candidates represents the current eligible pool.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, page, view, ratingContext]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? simulation.items.filter(({ candidate }) =>
          [
            candidate.item.title,
            candidate.item.summary,
            candidate.item.author,
            candidate.item.source,
          ]
            .join(' ')
            .toLowerCase()
            .includes(needle),
        )
      : simulation.items;
  }, [simulation, query]);
  const shown = visible.slice(0, displayCount);
  const dismissed = events
    .filter((event) => event.signal === 'hide' || event.signal === 'not_interested')
    .slice(-5)
    .reverse();
  const scoringState = scoring
    ? 'Scoring'
    : !loaded
      ? 'Fetch candidates'
      : candidates.length < 5
        ? 'Candidates insufficient'
        : simulation.targetMet
          ? 'Target reached'
          : scoringError && simulation.ratedCount === 0
            ? 'Jev unavailable'
            : scoringDone
              ? 'Target not reached'
              : 'Waiting for scores';
  const ratedPercent = candidates.length
    ? Math.round((simulation.ratedCount / candidates.length) * 100)
    : 0;
  const selectedTags = catalog.filter((tag) => preferences.tags.includes(tag.id));
  const relatedTags = catalog
    .filter(
      (tag) =>
        !preferences.tags.includes(tag.id) &&
        selectedTags.some((selected) => selected.domainId === tag.domainId),
    )
    .slice(0, 12);

  function record(item: HarvestItem, signal: FeederSignal): FeederEvent {
    const event: FeederEvent = {
      id: crypto.randomUUID(),
      actor: 'user',
      itemKey: resourceUrlKey(item.url),
      signal,
      tagIds: matchedHarvestTagIds(item).slice(0, 12),
      source: item.source,
      author: item.author,
      at: new Date().toISOString(),
    };
    onRecordEvent(event);
    return event;
  }

  function save(item: HarvestItem) {
    if (savedKeys.has(resourceUrlKey(item.url))) return;
    onSaveResource(item);
    record(item, 'save');
  }

  if (page === 'garden') {
    return (
      <div className={styles.workspace}>
        <header className={styles.header}>
          <span className={styles.eyebrow}>YOUR INTEREST MODEL</span>
          <h1>My garden</h1>
          <p>
            These are Feeder’s own topic weights. They shape this feed, not any source platform.
          </p>
          <button className={styles.secondary} onClick={onEditInterests}>
            <SlidersHorizontal size={16} /> Manage interests in Discover
          </button>
        </header>
        <section className={styles.panel}>
          <div className={styles.sectionHeading}>
            <div>
              <div className={styles.headingWithHelp}>
                <h2>Tag JEV</h2>
                <HelpHint title="Tag JEV">
                  Your own topic interest weights start from the topics you chose. Feeder actions
                  make small, time-decaying changes; you can adjust the starting weight here. These
                  weights shape Feeder’s ranking, not a source platform’s recommendations.
                </HelpHint>
              </div>
            </div>
            <span>{selectedTags.length} selected</span>
          </div>
          {selectedTags.length ? (
            <div className={styles.weightList}>
              {selectedTags.map((tag) => {
                const weight = effectiveTagJev(tag.id, preferences, events);
                return (
                  <label className={styles.weightRow} key={tag.id}>
                    <span>{tag.labelEn}</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={preferences.tagJev?.[tag.id] ?? 0.7}
                      onChange={(event) => onTagJevChange(tag.id, Number(event.target.value))}
                      aria-label={`${tag.labelEn} interest weight`}
                    />
                    <strong>{weight.toFixed(2)}</strong>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className={styles.empty}>Choose some topics to start shaping your feed.</p>
          )}
        </section>
        <div className={styles.twoColumns}>
          <section className={styles.panel}>
            <div className={styles.headingWithHelp}>
              <h2>Nearby topics</h2>
              <HelpHint title="Nearby topics">
                These topics share a catalog group with your selections. Feeder may include a small
                number as exploration when relevant public items exist. Your excluded topics,
                sources, and creators always stay excluded.
              </HelpHint>
            </div>
            <div className={styles.chips}>
              {relatedTags.map((tag) => (
                <span key={tag.id}>{tag.labelEn}</span>
              ))}
              {!relatedTags.length && <span>No nearby topics yet</span>}
            </div>
          </section>
          <section className={styles.panel}>
            <div className={styles.headingWithHelp}>
              <h2>Feed boundaries</h2>
              <HelpHint title="Feed boundaries">
                Discover controls which selected topics must appear and whether other recognized
                topics are allowed. Exclusions are hard filters. Saved, hidden, and open actions are
                recorded locally for Feeder; an open click is not a verified watch, and none of
                these actions writes feedback to a source platform.
              </HelpHint>
            </div>
            <p>Manage matching rules in Discover.</p>
            <p>
              {preferences.blockedTags.length} excluded topics · {preferences.blockedSources.length}{' '}
              excluded sources or creators
            </p>
            <p>
              {events.length} local user actions recorded. Opening a link is not a verified watch.
            </p>
            {events.filter((event) => event.signal === 'hide' || event.signal === 'not_interested')
              .length > 0 && (
              <details className={styles.why}>
                <summary>Hidden items · restore individually</summary>
                <div className={styles.restoreList}>
                  {events
                    .filter((event) => event.signal === 'hide' || event.signal === 'not_interested')
                    .slice(-20)
                    .map((event) => (
                      <button
                        className={styles.secondary}
                        key={event.id}
                        onClick={() => onUndoEvent(event.id)}
                      >
                        <RotateCcw size={14} /> Restore {new URL(event.itemKey).hostname} item
                      </button>
                    ))}
                </div>
              </details>
            )}
          </section>
        </div>
      </div>
    );
  }

  if (page === 'saved') {
    return (
      <div className={styles.workspace}>
        <header className={styles.header}>
          <span className={styles.eyebrow}>YOUR COLLECTION</span>
          <h1>Saved for later</h1>
          <p>Your saved links stay here even when your interests change.</p>
        </header>
        {resources.length ? (
          <div className={styles.cards}>
            {resources.map((resource) => (
              <article className={styles.card} key={resource.id}>
                <div className={styles.cardMeta}>
                  {resource.source} · {resource.resourceType}
                </div>
                <h2>{resource.title}</h2>
                {resource.summary && <p>{resource.summary}</p>}
                <div className={styles.actions}>
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      const key = resourceUrlKey(resource.url);
                      if (!key) return;
                      onRecordEvent({
                        id: crypto.randomUUID(),
                        actor: 'user',
                        itemKey: key,
                        signal: 'open',
                        tagIds: matchedHarvestTagIds({ tags: resource.tags }),
                        source: resource.source,
                        author: resource.author,
                        at: new Date().toISOString(),
                      });
                    }}
                  >
                    Open source <ArrowUpRight size={15} />
                  </a>
                  <button
                    onClick={() => {
                      onRemoveResource(resource.id);
                      const key = resourceUrlKey(resource.url);
                      events
                        .filter((event) => event.itemKey === key && event.signal === 'save')
                        .forEach((event) => onUndoEvent(event.id));
                    }}
                  >
                    Remove from saved <X size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            Nothing saved yet. Discover a few public-source items or paste a link in Resource
            library.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>YOUR OWN DISCOVERY LAYER</span>
        <h1>Discover</h1>
        <p>
          A feed shaped by your topics, using public-source candidates. Source platforms are not
          being trained.
        </p>
        <div className={styles.toolbar}>
          <div className={styles.tabs} role="tablist" aria-label="Discover view">
            <button aria-selected={view === 'feed'} role="tab" onClick={() => setView('feed')}>
              For you
            </button>
            <button
              aria-selected={view === 'sources'}
              role="tab"
              onClick={() => setView('sources')}
            >
              Sources
            </button>
          </div>
          {view === 'feed' && (
            <button
              className={styles.secondary}
              onClick={() => void refresh(true)}
              disabled={loading}
            >
              <RotateCcw size={15} />{' '}
              {loading ? 'Fetching…' : loaded ? 'Refresh sources' : 'Fetch public sources'}
            </button>
          )}
        </div>
      </header>
      {view === 'feed' && (
        <section className={styles.interestsPanel} aria-label="My interests">
          <div className={styles.interestsHeading}>
            <div>
              <span className={styles.eyebrow}>MY INTERESTS</span>
              <h2>Your interests</h2>
            </div>
            <button className={styles.secondary} onClick={onEditInterests}>
              <SlidersHorizontal size={16} /> Manage interests
            </button>
          </div>
          <div className={styles.domainList}>
            {domains
              .filter((domain) => preferences.domains.includes(domain.id))
              .map((domain, index) => (
                <span key={domain.id}>
                  <i
                    className={styles.domainDot}
                    style={{
                      backgroundColor: ['#a6b48a', '#dfbd91', '#aec0cb', '#aa9ab7'][index % 4],
                    }}
                  />
                  {domain.labelEn}
                </span>
              ))}
          </div>
          <div className={styles.chips}>
            {selectedTags.map((tag) => (
              <span key={tag.id}>{tag.labelEn}</span>
            ))}
            {preferences.customTags.map((tag) => (
              <span key={tag.id}>{tag.labelEn}</span>
            ))}
            {!selectedTags.length && !preferences.customTags.length && (
              <span>No topics selected</span>
            )}
          </div>
          <fieldset className={styles.matchRules}>
            <legend>Content matching</legend>
            <label>
              <input
                type="checkbox"
                checked={preferences.onlySelectedTags === true}
                onChange={(event) => onOnlySelectedTagsChange(event.target.checked)}
              />
              Include any selected topic
            </label>
            <label>
              <input
                type="checkbox"
                checked={preferences.requireAllSelectedTags === true}
                onChange={(event) =>
                  onInterestRuleChange('requireAllSelectedTags', event.target.checked)
                }
              />
              Include all selected topics
            </label>
            <label>
              <input
                type="checkbox"
                checked={preferences.excludeUnselectedTags === true}
                onChange={(event) =>
                  onInterestRuleChange('excludeUnselectedTags', event.target.checked)
                }
              />
              Exclude unselected topics
            </label>
          </fieldset>
          <p className={styles.matchHint}>
            Uses available topic tags. Explicit exclusions always apply.
            {loaded &&
              ` ${candidates.length} of ${publicCandidateCount} fetched items are in this prioritized scoring batch (maximum 60).`}
          </p>
        </section>
      )}
      {view === 'sources' ? (
        <SourceBoards
          locale={locale}
          interestLabels={[
            ...selectedTags.map((tag) => tag.labelEn),
            ...preferences.customTags.map((tag) => tag.labelEn),
          ]}
          preferences={preferences}
          initialPayload={payload}
          onHarvested={(incoming) => {
            setPayload((current) => mergeHarvestPayload(current, incoming));
            setLoaded(true);
          }}
          onSocialImport={(item) => {
            setSocialImports((current) => [
              item,
              ...current.filter((entry) => entry.url !== item.url),
            ]);
            setLoaded(true);
          }}
          t={(zh, en) => t(zh, en, locale)}
          savedResourceIds={resources.map((resource) => resource.id)}
          onSaveResource={save}
          onRelaxMatching={() => {
            onOnlySelectedTagsChange(false);
            onInterestRuleChange('requireAllSelectedTags', false);
            onInterestRuleChange('excludeUnselectedTags', false);
          }}
        />
      ) : (
        <>
          <section className={styles.scorePanel} aria-label="Jev feed status">
            <div className={styles.scorePanelTop}>
              <div>
                <span className={styles.eyebrow}>YOUR FEED TARGET</span>
                <h2>Jev average {simulation.average?.toFixed(2) ?? '—'} / 10</h2>
              </div>
              <strong className={styles.scoreState}>{scoringState}</strong>
            </div>
            <p>
              Target {targetAverage} is the minimum average title relevance of displayed items.
              Lower values allow more nearby topics; explicit exclusions still apply.
            </p>
            <label className={styles.scoreSlider}>
              <span>Choose target average: {targetAverage}</span>
              <input
                type="range"
                aria-label="Jev target average"
                min="1"
                max="10"
                step="1"
                value={targetAverage}
                onChange={(event) => onTargetJevAverageChange(Number(event.target.value))}
              />
              <span className={styles.rangeEndpoints}>
                <span>1 · More variety</span>
                <span>10 · More focused</span>
              </span>
            </label>
            <div className={styles.scoreProgressText}>
              {simulation.ratedCount} of {candidates.length} candidates scored ({ratedPercent}%) ·{' '}
              {simulation.items.length} shown
              {simulation.lowConfidenceCount > 0 &&
                ` · ${simulation.lowConfidenceCount} low confidence excluded`}
            </div>
            <progress
              className={styles.scoreProgress}
              max={Math.max(1, candidates.length)}
              value={simulation.ratedCount}
              aria-label="Jev scoring progress"
            />
          </section>
          <div className={styles.feedControls}>
            <label>
              <Compass size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter this feed"
                aria-label="Filter this feed"
              />
            </label>
          </div>
          <div className={styles.simulationStatus} role="status">
            {scoringState}
            {scoringDone &&
              !simulation.targetMet &&
              candidates.length >= 5 &&
              ': available confident scores cannot meet this target.'}
          </div>
          {scoringError && (
            <div className={styles.warning} role="alert">
              {scoringError}
            </div>
          )}
          {error && (
            <div className={styles.warning} role="alert">
              {error} Saved links remain available.
            </div>
          )}
          {payload?.warnings.length ? (
            <div className={styles.warning}>
              Some sources could not refresh; other sources are still shown.
            </div>
          ) : null}
          {dismissed.length > 0 && (
            <div className={styles.undo}>
              <span>Recently hidden</span>
              <div className={styles.undoItems}>
                {dismissed.map((event) => (
                  <button key={event.id} onClick={() => onUndoEvent(event.id)}>
                    <RotateCcw size={14} /> Restore {new URL(event.itemKey).hostname}
                  </button>
                ))}
              </div>
            </div>
          )}
          {loading && !payload ? <div className={styles.empty}>Loading public sources…</div> : null}
          {!loading && !loaded && !goalTags.length && (
            <div className={styles.empty}>
              Choose interests to score a personal feed, or browse public items in Sources.
              <button className={styles.secondary} onClick={onEditInterests}>
                Choose interests
              </button>
            </div>
          )}
          {!loading && !loaded && goalTags.length > 0 && (
            <div className={styles.empty}>
              Fetch public sources above, or choose one in Sources to begin.
            </div>
          )}
          {!loading && loaded && candidates.length === 0 ? (
            <div className={styles.empty}>
              No matching public candidates right now. Try adjusting your interests or inspect the
              source boards. Feeder does not invent matches.
            </div>
          ) : null}
          {!loading && loaded && candidates.length > 0 && !scoring && visible.length === 0 ? (
            <div className={styles.empty}>No confident Jev scores are available for this feed.</div>
          ) : null}
          {scoring && shown.length === 0 && (
            <div className={styles.scoringPlaceholder} aria-live="polite">
              <span className={styles.skeleton} />
              <span>Scoring candidate titles with Jev…</span>
            </div>
          )}
          <div className={styles.cards}>
            {shown.map(({ candidate, rating }) => {
              const { item } = candidate;
              const saved = savedKeys.has(candidate.key);
              return (
                <article className={styles.card} key={candidate.key}>
                  <div className={styles.cardMeta}>
                    <span>{item.source}</span>
                    <span>·</span>
                    <span>{item.author || 'Creator unavailable'}</span>
                    {item.publishedAt && (
                      <>
                        <span>·</span>
                        <time dateTime={item.publishedAt}>
                          {new Date(item.publishedAt).toLocaleDateString('en-US')}
                        </time>
                      </>
                    )}
                  </div>
                  {item.imageUrl && (
                    <img className={styles.cover} src={item.imageUrl} alt="" loading="lazy" />
                  )}
                  <h2>{item.title}</h2>
                  {item.summary && <p>{item.summary}</p>}
                  <div className={styles.chips}>
                    {item.tags.slice(0, 4).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                    {candidate.exploratory && <span>Explore</span>}
                  </div>
                  <div className={styles.ratingBadge}>
                    <strong>Jev {rating.score.toFixed(1)} / 10</strong>
                    <span>Confidence {Math.round(rating.confidence * 100)}%</span>
                    <progress max="1" value={rating.confidence} aria-label="Jev confidence" />
                  </div>
                  <details className={styles.why}>
                    <summary>Why this is here</summary>
                    <ul>
                      {candidate.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                    <small>
                      Title relevance with {Math.round(rating.confidence * 100)}% confidence. Feeder
                      simulation, not a source-platform score.
                    </small>
                  </details>
                  <div className={styles.actions}>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => record(item, 'open')}
                    >
                      Open source <ArrowUpRight size={15} />
                    </a>
                    <button onClick={() => save(item)} disabled={saved}>
                      <Bookmark size={15} /> {saved ? 'Saved' : 'Save for later'}
                    </button>
                    <details className={styles.moreActions}>
                      <summary>More actions</summary>
                      <div>
                        <button
                          onClick={(event) => {
                            record(item, 'hide');
                            event.currentTarget.closest('details')?.removeAttribute('open');
                          }}
                          aria-label={`Hide ${item.title}`}
                        >
                          Hide
                        </button>
                        <button
                          onClick={(event) => {
                            record(item, 'not_interested');
                            event.currentTarget.closest('details')?.removeAttribute('open');
                          }}
                          aria-label={`Not interested in ${item.title}`}
                        >
                          Not interested
                        </button>
                      </div>
                    </details>
                  </div>
                </article>
              );
            })}
          </div>
          {visible.length > shown.length && (
            <button
              className={styles.loadMore}
              onClick={() => setDisplayCount((count) => count + 20)}
            >
              Show more · {visible.length - shown.length} remaining
            </button>
          )}
          {(payload?.sections.social ?? []).some((item) => item.source === 'YouTube') && (
            <section className={styles.youtubeResults} aria-label="YouTube videos">
              <h2>YouTube videos</h2>
              <p>Official search results · outside the Jev average</p>
              <div className={styles.cards}>
                {(payload?.sections.social ?? [])
                  .filter(
                    (item) =>
                      item.source === 'YouTube' && !preferences.blockedSources.includes('YouTube'),
                  )
                  .slice(0, 6)
                  .map((item) => (
                    <article className={styles.card} key={item.id}>
                      <YouTubeVideo item={item} />
                      <div className={styles.cardMeta}>YouTube · {item.author}</div>
                      <h2>{item.title}</h2>
                      <div className={styles.actions}>
                        <a href={item.url} target="_blank" rel="noreferrer">
                          Open on YouTube <ArrowUpRight size={15} />
                        </a>
                      </div>
                    </article>
                  ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

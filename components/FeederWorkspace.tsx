'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, Bookmark, Compass, RotateCcw, SlidersHorizontal } from 'lucide-react';
import type { HarvestItem, HarvestPayload } from '@/lib/crawler/types';
import type { Locale } from '@/lib/locale';
import { readApiData } from '@/lib/api-contract';
import { bilingualInterestLabel, domains, searchInterests, type Preferences } from '@/lib/feed';
import {
  matchedHarvestTagIds,
  rankHarvestCandidates,
  type FeederEvent,
  type FeederSignal,
} from '@/lib/feeder';
import { resourceUrlKey, type ResourceRecord } from '@/lib/resources';
import { mergeHarvestPayload } from '@/lib/crawler/merge';
import { simulateFeed, type JevRating } from '@/lib/feed-simulator';
import type { TagSuggestion } from '@/lib/tag-suggestions';
import SourceBoards, { readSocialImports } from './SourceBoards';
import YouTubeVideo from './YouTubeVideo';
import BilibiliVideo from './BilibiliVideo';
import InterestIntro, { InterestIntroTarget } from './InterestIntro';
import styles from './FeederWorkspace.module.css';

type WorkspacePage = 'discover' | 'garden';
type Props = {
  page: WorkspacePage;
  locale: Locale;
  preferences: Preferences;
  resources: ResourceRecord[];
  events: FeederEvent[];
  onSaveResource: (item: HarvestItem) => void;
  onRecordEvent: (event: FeederEvent) => void;
  onUndoEvent: (id: string) => void;
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
const broadGithubTopics = ['ai', 'c', 'java', 'javascript', 'python', 'rust', 'typescript'];
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
  onRecordEvent,
  onUndoEvent,
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
  const [nearbyTopics, setNearbyTopics] = useState<TagSuggestion[]>([]);
  const [nearbyStatus, setNearbyStatus] = useState<
    'idle' | 'loading' | 'live' | 'curated' | 'unavailable'
  >('idle');
  const [nearbyUpdatedAt, setNearbyUpdatedAt] = useState<string | null>(null);
  const [nearbyRefresh, setNearbyRefresh] = useState(0);
  const ratingsRef = useRef(new Map<string, JevRating>());
  const ratingContextRef = useRef('');
  const interests = searchInterests(preferences);
  const nearbyQuery = JSON.stringify({
    domainIds: preferences.domains,
    tagIds: preferences.tags,
    customTerms: preferences.customTags.map((tag) => tag.labelEn),
    excludeTerms: [
      ...preferences.tags,
      ...preferences.blockedTags,
      ...catalog
        .filter((tag) => preferences.blockedTags.includes(tag.id))
        .flatMap((tag) => [tag.labelEn, tag.label]),
      ...broadGithubTopics,
    ],
    readingLanguage: preferences.readingLanguage,
    fresh: true,
  });

  useEffect(() => {
    if (page !== 'garden') return;
    const query = JSON.parse(nearbyQuery) as {
      domainIds: string[];
      tagIds: string[];
      customTerms: string[];
    };
    if (!query.domainIds.length && !query.tagIds.length && !query.customTerms.length) {
      setNearbyTopics([]);
      setNearbyUpdatedAt(null);
      setNearbyStatus('idle');
      return;
    }
    const controller = new AbortController();
    setNearbyTopics([]);
    setNearbyUpdatedAt(null);
    setNearbyStatus('loading');
    async function loadNearbyTopics() {
      try {
        const response = await fetch('/api/tags/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: nearbyQuery,
          cache: 'no-store',
          signal: controller.signal,
        });
        const result = await readApiData<{
          suggestions: TagSuggestion[];
          liveStatus: 'live' | 'degraded' | 'idle';
          retrievedAt: string | null;
        }>(response);
        if (controller.signal.aborted) return;
        setNearbyTopics(result.suggestions);
        setNearbyUpdatedAt(result.liveStatus === 'live' ? result.retrievedAt : null);
        setNearbyStatus(
          result.suggestions.length
            ? result.suggestions.some((suggestion) => suggestion.origin === 'live')
              ? 'live'
              : 'curated'
            : 'unavailable',
        );
      } catch {
        if (controller.signal.aborted) return;
        setNearbyTopics([]);
        setNearbyUpdatedAt(null);
        setNearbyStatus('unavailable');
      }
    }
    void loadNearbyTopics();
    return () => controller.abort();
  }, [page, nearbyQuery, nearbyRefresh]);

  async function refresh(force = false) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (force) params.set('refresh', 'true');
      interests.slice(0, 2).forEach((interest) => {
        params.append('tag', interest.labelEn);
        params.append('tagZh', interest.labelZh);
      });
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
          ...socialImports.filter((item) => !['TikTok', 'Instagram', 'X'].includes(item.source)),
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
    socialImports.filter((item) => !['TikTok', 'Instagram', 'X'].includes(item.source)).length;
  const targetAverage = preferences.targetJevAverage ?? 8;
  const targetAverageRef = useRef(targetAverage);
  targetAverageRef.current = targetAverage;
  const goalTags = useMemo(
    () =>
      searchInterests(preferences)
        .map((interest) => bilingualInterestLabel(interest.labelEn, interest.labelZh))
        .slice(0, 12),
    [preferences],
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
          <span className={styles.eyebrow}>YOUR INTERESTS</span>
          <h1>My garden</h1>
          <p>Choose your topics and adjust Relevance in Discover to shape your feed.</p>
          <button className={styles.secondary} onClick={onEditInterests}>
            <SlidersHorizontal size={16} /> Manage interests in Discover
          </button>
        </header>
        <div className={styles.twoColumns}>
          <section className={styles.panel}>
            <div className={styles.headingWithHelp}>
              <h2>Nearby topics</h2>
              <HelpHint title="Nearby topics">
                Generated from current public information related to your interests. Explicit topic
                exclusions still apply to your feed.
              </HelpHint>
              <button
                type="button"
                className={styles.nearbyRefresh}
                onClick={() => setNearbyRefresh((value) => value + 1)}
                disabled={nearbyStatus === 'loading' || nearbyStatus === 'idle'}
                aria-label="Refresh nearby topics"
              >
                <RotateCcw size={15} /> Refresh
              </button>
            </div>
            <div className={styles.nearbyChips} aria-live="polite">
              {nearbyTopics.map((topic) => (
                <span key={topic.id}>{topic.displayLabel}</span>
              ))}
            </div>
            {nearbyStatus === 'idle' && <p>Choose an interest to find nearby topics online.</p>}
            {nearbyStatus === 'loading' && <p>Finding nearby topics…</p>}
            {nearbyStatus === 'curated' && <p>Related topics from the built-in catalog.</p>}
            {nearbyStatus === 'unavailable' && (
              <p>Live nearby topics are unavailable. Try refreshing.</p>
            )}
            {nearbyStatus === 'live' && !nearbyTopics.length && (
              <p>No nearby topics found in the current public results.</p>
            )}
            {nearbyUpdatedAt && nearbyTopics.length > 0 && (
              <p className={styles.nearbyChecked}>
                Updated {new Date(nearbyUpdatedAt).toLocaleString()}
              </p>
            )}
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

  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>YOUR OWN DISCOVERY LAYER</span>
        <h1>Discover</h1>
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
        <InterestIntro className={styles.interestsPanel}>
          <div className={styles.interestsHeading}>
            <div>
              <span className={styles.eyebrow}>MY INTERESTS</span>
              <h2>Your interests</h2>
            </div>
            <InterestIntroTarget>
              <button className={styles.secondary} onClick={onEditInterests}>
                <SlidersHorizontal size={16} /> Manage interests
              </button>
            </InterestIntroTarget>
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
            {!selectedTags.length &&
              !preferences.customTags.length &&
              preferences.domains.length > 0 && (
                <span>Using selected areas until you add specific tags</span>
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
        </InterestIntro>
      )}
      {view === 'sources' ? (
        <SourceBoards
          locale={locale}
          interestLabels={interests.map((interest) => interest.labelEn)}
          localizedInterestLabels={interests.map((interest) => interest.labelZh)}
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
          onEditInterests={onEditInterests}
          onRelaxMatching={() => {
            onOnlySelectedTagsChange(false);
            onInterestRuleChange('requireAllSelectedTags', false);
            onInterestRuleChange('excludeUnselectedTags', false);
          }}
        />
      ) : (
        <>
          <section className={styles.scorePanel} aria-label="Feed relevance">
            <div className={styles.scorePanelTop}>
              <div>
                <span className={styles.eyebrow}>YOUR FEED</span>
                <h2>Relevance</h2>
              </div>
              <strong className={styles.scoreState}>{scoringState}</strong>
            </div>
            <label className={styles.scoreSlider}>
              <span>Relevance: {targetAverage} / 10</span>
              <input
                type="range"
                aria-label="Relevance"
                min="1"
                max="10"
                step="1"
                value={targetAverage}
                onChange={(event) => onTargetJevAverageChange(Number(event.target.value))}
              />
              <span className={styles.rangeEndpoints}>
                <span>Lower · Broader</span>
                <span>Higher · More focused</span>
              </span>
            </label>
            <p>
              Higher: closer to your tags, with fewer and narrower results. Lower: more related
              topics, though some results may drift from your tags.
            </p>
            <p>Actual average: {simulation.average?.toFixed(2) ?? '—'} / 10</p>
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
                  {item.source === 'Bilibili' ? (
                    <BilibiliVideo item={item} />
                  ) : (
                    item.imageUrl && (
                      <img className={styles.cover} src={item.imageUrl} alt="" loading="lazy" />
                    )
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
                      <Bookmark size={15} /> {saved ? 'Saved' : 'Save to library'}
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

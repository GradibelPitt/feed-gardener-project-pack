'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  Compass,
  Cpu,
  FlaskConical,
  Globe2,
  Layers3,
  Leaf,
  Menu,
  MoreHorizontal,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Rss,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import DiscoveryGallery from '@/components/DiscoveryGallery';
import Onboarding, { type OnboardingStep } from '@/components/Onboarding';
import ResourceLibrary from '@/components/ResourceLibrary';
import WorkspaceSidebar, {
  WORKSPACE_TABS,
  type WorkspacePage,
} from '@/components/WorkspaceSidebar';
import SourceBoards from '@/components/SourceBoards';
import FeederWorkspace from '@/components/FeederWorkspace';
import SelectedTagsToggle from '@/components/SelectedTagsToggle';
import YouTubeConnection from '@/components/YouTubeConnection';
import { readApiData } from '@/lib/api-contract';
import {
  contents,
  defaultPreferences,
  domains,
  formatDuration,
  rankFeed,
  type CustomTag,
  type Content,
  type Preferences,
  type RankedContent,
  type Source,
} from '@/lib/feed';
import { type Locale, visibleInterfaceLocale } from '@/lib/locale';
import {
  behaviorSignalKeys,
  defaultBehaviorWeights,
  normalizeBehaviorWeights,
  type BehaviorSignal,
} from '@/lib/strategy';
import type { TagSuggestion } from '@/lib/tag-suggestions';
import {
  readResourceRecords,
  resourceFromHarvest,
  resourceUrlKey,
  type ResourceRecord,
} from '@/lib/resources';
import type { HarvestItem } from '@/lib/crawler/types';
import { readFeederEvents, readTagJev, type FeederEvent } from '@/lib/feeder';

type Page = WorkspacePage;
type Feedback = {
  contentId: string;
  actor: 'user';
  event: 'explicit_positive' | 'explicit_negative';
  reason?: string;
  at: string;
};
const STORAGE = 'feed-gardener-demo-v1';
const sources: (Source | 'all')[] = ['all', 'YouTube', 'Bluesky', 'RSS'];
const allTags = domains.flatMap((domain) => domain.tags);
const readingLanguageOptions: ReadonlyArray<{
  id: Preferences['readingLanguage'];
  zh: string;
  en: string;
}> = [
  { id: 'zh', zh: '中文', en: 'Chinese' },
  { id: 'en', zh: '英文', en: 'English' },
  { id: 'bilingual', zh: '中英双语', en: 'Bilingual' },
];
// Keep the full set above for a later re-enable, but do not expose Chinese display options yet.
const visibleReadingLanguageOptions = readingLanguageOptions.filter(({ id }) => id === 'en');
const validTagIds = new Set(allTags.map((tag) => tag.id));
const tagName = (id: string, locale: Locale) => {
  const tag = allTags.find((tag) => tag.id === id);
  return tag ? (locale === 'zh' ? tag.label : tag.labelEn) : id;
};
const customTagName = (tag: CustomTag, readingLanguage: Preferences['readingLanguage']) => {
  if (readingLanguage === 'en') return tag.labelEn;
  if (readingLanguage === 'zh')
    return tag.translationStatus === 'translated' ? tag.labelZh : `${tag.labelEn}（原文）`;
  return tag.translationStatus === 'translated' && tag.labelZh !== tag.labelEn
    ? `${tag.labelZh} / ${tag.labelEn}`
    : tag.labelEn;
};

function englishDefaultPreferences(): Preferences {
  return { ...structuredClone(defaultPreferences), readingLanguage: 'en' };
}

function readTagIds(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter((id): id is string => typeof id === 'string' && validTagIds.has(id)),
        ),
      ]
    : [];
}

function isOnboardingStep(value: unknown): value is OnboardingStep {
  return value === 'intro' || value === 'explore' || value === 'exclude';
}

function readPreferences(value: unknown): Preferences {
  if (!value || typeof value !== 'object') return englishDefaultPreferences();
  const raw = value as Record<string, unknown>;
  const strings = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const domainIds = domains.map((d) => d.id);
  const customTags = Array.isArray(raw.customTags)
    ? raw.customTags
        .filter((value): value is Record<string, unknown> =>
          Boolean(value && typeof value === 'object'),
        )
        .filter(
          (value) =>
            typeof value.id === 'string' &&
            value.id.startsWith('live:github:') &&
            typeof value.label === 'string' &&
            typeof value.evidenceUrl === 'string' &&
            value.evidenceUrl.startsWith('https://github.com/'),
        )
        .slice(0, 12)
        .map((value): CustomTag => ({
          id: String(value.id),
          label: String(value.label).slice(0, 80),
          labelZh:
            typeof value.labelZh === 'string'
              ? value.labelZh.slice(0, 80)
              : String(value.label).slice(0, 80),
          labelEn:
            typeof value.labelEn === 'string'
              ? value.labelEn.slice(0, 80)
              : String(value.label).slice(0, 80),
          translationStatus:
            value.translationStatus === 'translated' ? 'translated' : 'source_label',
          source: 'github_live',
          evidenceUrl: String(value.evidenceUrl),
        }))
    : [];
  return {
    domains: strings(raw.domains).filter((id) => domainIds.includes(id)),
    tags: strings(raw.tags).filter((id) =>
      domains.some((d) => strings(raw.domains).includes(d.id) && d.tags.some((t) => t.id === id)),
    ),
    tagJev: readTagJev(raw.tagJev),
    targetJevAverage:
      typeof raw.targetJevAverage === 'number' &&
      Number.isInteger(raw.targetJevAverage) &&
      raw.targetJevAverage >= 1 &&
      raw.targetJevAverage <= 10
        ? raw.targetJevAverage
        : 8,
    customTags,
    onlySelectedTags: raw.onlySelectedTags === true,
    requireAllSelectedTags: raw.requireAllSelectedTags === true,
    excludeUnselectedTags: raw.excludeUnselectedTags === true,
    relatedDomains: strings(raw.relatedDomains).filter((id) => domainIds.includes(id)),
    exploration:
      typeof raw.exploration === 'number' && Number.isFinite(raw.exploration)
        ? Math.min(50, Math.max(0, raw.exploration))
        : 20,
    behaviorWeights: normalizeBehaviorWeights(
      raw.behaviorWeights && typeof raw.behaviorWeights === 'object'
        ? (raw.behaviorWeights as Partial<Record<BehaviorSignal, number>>)
        : undefined,
    ),
    strategyMode: raw.strategyMode === 'expert' ? 'expert' : 'simple',
    readingLanguage: 'en',
    blockedSources: strings(raw.blockedSources),
    blockedTags: strings(raw.blockedTags).filter((id) => allTags.some((t) => t.id === id)),
    version:
      typeof raw.version === 'number' && Number.isFinite(raw.version)
        ? Math.max(1, Math.floor(raw.version))
        : 1,
  };
}

function SourceIcon({ source, size = 14 }: { source: Source; size?: number }) {
  return source === 'YouTube' ? (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className="youtube"
      aria-hidden="true"
    >
      <rect x="2" y="5" width="20" height="14" rx="4" />
      <path d="m10 8 6 4-6 4Z" fill="white" />
    </svg>
  ) : source === 'RSS' ? (
    <Rss size={size} className="rss" />
  ) : (
    <span className="bluesky" style={{ fontSize: size + 2 }}>
      🦋
    </span>
  );
}

function Botanical() {
  return (
    <svg className="botanical" viewBox="0 0 380 250" aria-hidden="true">
      <defs>
        <pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#b7c5a9" opacity=".55" />
        </pattern>
      </defs>
      <circle cx="220" cy="135" r="106" fill="#e1e9d6" />
      <rect x="73" y="23" width="280" height="215" fill="url(#dots)" />
      <ellipse cx="227" cy="226" rx="81" ry="9" fill="#cbd8bf" opacity=".6" />
      <path d="M222 224C226 160 214 91 254 40" fill="none" stroke="#56734d" strokeWidth="3" />
      <path d="M225 174C167 180 133 137 142 101c55 0 81 30 83 73Z" fill="#9cad82" />
      <path d="M222 140c53 0 87-35 85-72-47-3-79 27-85 72Z" fill="#658762" />
      <path d="M235 85c-33-3-54-23-51-51 35 3 51 23 51 51Z" fill="#c3cba0" />
      <path d="M247 56c35-4 54-21 50-45-29 5-49 21-50 45Z" fill="#879c6e" />
      <path
        d="M158 119l65 55M288 87l-64 53M194 44l40 40"
        stroke="#f4f5df"
        strokeWidth="1.2"
        fill="none"
        opacity=".65"
      />
      <g transform="translate(79 174) rotate(-9)">
        <rect width="92" height="44" rx="11" fill="#fff" stroke="#e1e5d7" />
        <path d="m13 22 5 5 9-11" fill="none" stroke="#618463" strokeWidth="2" />
        <path d="M38 17h36M38 25h26" stroke="#b8c3ae" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g transform="translate(275 155) rotate(8)">
        <rect width="71" height="48" rx="11" fill="#f9fbf3" stroke="#d8e1cc" />
        <path
          d="M16 30V21m11 9V14m11 16V18m11 12V10"
          stroke="#80936a"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
      <path d="M94 66v14m-7-7h14M322 117v10m-5-5h10" stroke="#a1af89" strokeWidth="1.5" />
    </svg>
  );
}

function Cover({ item, large = false }: { item: Content; large?: boolean }) {
  return (
    <div
      className={`cover cover-${item.art} ${large ? 'cover-large' : ''}`}
      style={{ '--cover-accent': item.accent } as React.CSSProperties}
    >
      {item.art === 'terminal' ? (
        <>
          <div className="terminal-window">
            <div className="terminal-bar">
              <i />
              <i />
              <i />
              <span>~/workspace</span>
            </div>
            <div className="terminal-code">
              <span>$ run --local</span>
              <br />
              <em>✓ model loaded</em>
              <br />
              {item.coverLabel}
              <br />
              <b>▍</b>
            </div>
          </div>
          <span className="cover-corner">LOCAL FIRST ↗</span>
        </>
      ) : item.art === 'network' ? (
        <>
          <div className="network-grid" />
          <div className="network-line l1" />
          <div className="network-line l2" />
          <div className="network-line l3" />
          <span className="network-node n1">
            <Code2 />
          </span>
          <span className="network-node n2">
            <Cpu />
          </span>
          <span className="network-node n3">
            <Layers3 />
          </span>
          <strong>{item.coverLabel}</strong>
          <span className="cover-kicker">CONNECT THE DOTS</span>
        </>
      ) : item.art === 'code' ? (
        <>
          <div className="code-sheet">
            <span className="code-tab">
              index.ts <span>●</span>
            </span>
            <div>
              <em>const</em> idea = <b>create</b>({'{'}
              <br />
              &nbsp; simple: <i>true</i>,<br />
              &nbsp; possibilities: <i>Infinity</i>
              <br />
              {'}'});
              <br />
              <em>export default</em> idea;
            </div>
          </div>
          <strong>{item.coverLabel}</strong>
        </>
      ) : item.art === 'layers' ? (
        <>
          <div className="layer-shape layer-one" />
          <div className="layer-shape layer-two" />
          <div className="layer-shape layer-three" />
          <strong>{item.coverLabel}</strong>
          <span className="cover-kicker">BUILD SOMETHING BETTER</span>
        </>
      ) : item.art === 'waves' ? (
        <>
          <div className="wave-ring r1" />
          <div className="wave-ring r2" />
          <div className="wave-ring r3" />
          <div className="wave-ring r4" />
          <span className="cover-kicker">A DIFFERENT PERSPECTIVE</span>
          <strong>{item.coverLabel}</strong>
        </>
      ) : (
        <>
          <div className="abstract-orb orb-one" />
          <div className="abstract-orb orb-two" />
          <div className="abstract-orb orb-three" />
          <span className="cover-kicker">IDEAS WORTH EXPLORING</span>
          <strong>{item.coverLabel}</strong>
        </>
      )}
      <span className="cover-duration">{formatDuration(item.duration)}</span>
      <span className="cover-play">
        <Play size={18} fill="currentColor" />
      </span>
    </div>
  );
}

function Modal({
  children,
  title,
  closeLabel,
  onClose,
  wide = false,
  drawer = false,
}: {
  children: React.ReactNode;
  title: string;
  closeLabel: string;
  onClose: () => void;
  wide?: boolean;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`modal ${wide ? 'modal-wide' : ''} ${drawer ? 'modal-drawer' : ''}`}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) {
          const rect = ref.current.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label={closeLabel}>
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function Home() {
  const locale = visibleInterfaceLocale;
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep | 'complete' | null>(null);
  const [onboardingDirection, setOnboardingDirection] = useState<'forward' | 'backward'>('forward');
  const [onboardingWantedTags, setOnboardingWantedTags] = useState<string[]>([]);
  const [onboardingBlockedTags, setOnboardingBlockedTags] = useState<string[]>([]);
  const [page, setPage] = useState<Page>('discover');
  const [preferences, setPreferences] = useState<Preferences>(englishDefaultPreferences);
  const [saved, setSaved] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [resources, setResources] = useState<ResourceRecord[]>([]);
  const [feederEvents, setFeederEvents] = useState<FeederEvent[]>([]);
  const [source, setSource] = useState<Source | 'all'>('all');
  const [query, setQuery] = useState('');
  const [activeTopic, setActiveTopic] = useState('all');
  const [draft, setDraft] = useState<Preferences | null>(null);
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestion[]>([]);
  const [tagSuggestionStatus, setTagSuggestionStatus] = useState<
    'idle' | 'loading' | 'live' | 'degraded'
  >('idle');
  const [tagSuggestionWarning, setTagSuggestionWarning] = useState('');
  const [detail, setDetail] = useState<RankedContent | null>(null);
  const [negative, setNegative] = useState<Content | null>(null);
  const [toast, setToast] = useState('');
  const [ready, setReady] = useState(false);
  const [youtubeOutcome, setYoutubeOutcome] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [timeBudget, setTimeBudget] = useState<10 | 25 | 'all'>(25);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE) || 'null');
      if (stored && typeof stored === 'object') {
        if (stored.preferences) setPreferences(readPreferences(stored.preferences));
        const storedWantedTags = readTagIds(stored.onboardingWantedTags);
        const storedBlockedTags = readTagIds(stored.onboardingBlockedTags).filter(
          (id) => !storedWantedTags.includes(id),
        );
        setOnboardingWantedTags(storedWantedTags);
        setOnboardingBlockedTags(storedBlockedTags);
        setOnboardingStep(
          stored.onboardingCompleted === false && isOnboardingStep(stored.onboardingStep)
            ? stored.onboardingStep
            : 'complete',
        );
        const ids = (v: unknown) =>
          Array.isArray(v)
            ? v.filter(
                (x): x is string => typeof x === 'string' && contents.some((c) => c.id === x),
              )
            : [];
        setSaved(ids(stored.saved));
        setHidden(ids(stored.hidden));
        if (Array.isArray(stored.feedback))
          setFeedback(
            stored.feedback.filter(
              (f: Feedback) =>
                f?.actor === 'user' &&
                ['explicit_positive', 'explicit_negative'].includes(f.event) &&
                contents.some((c) => c.id === f.contentId),
            ),
          );
        setResources(readResourceRecords(stored.resources));
        setFeederEvents(readFeederEvents(stored.feederEvents));
        if (['discover', 'saved', 'library', 'garden', 'connections'].includes(stored.page))
          setPage(stored.page);
      } else {
        setOnboardingStep('intro');
      }
    } catch {
      setOnboardingStep('intro');
      setToast('Local data could not be loaded. Sample preferences are ready instead.');
    }
    const returnUrl = new URL(window.location.href);
    if (returnUrl.searchParams.has('youtube')) {
      setYoutubeOutcome(returnUrl.searchParams.get('youtube') || '');
      setPage('connections');
      returnUrl.searchParams.delete('youtube');
      window.history.replaceState(null, '', returnUrl.pathname + returnUrl.search + returnUrl.hash);
    }
    setReady(true);
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem(
          STORAGE,
          JSON.stringify({
            preferences,
            saved,
            hidden,
            feedback,
            resources,
            feederEvents,
            localePreference: visibleInterfaceLocale,
            onboardingCompleted: onboardingStep === 'complete',
            onboardingStep: onboardingStep === 'complete' ? undefined : onboardingStep,
            onboardingWantedTags,
            onboardingBlockedTags,
            page,
          }),
        );
      } catch {
        setToast(
          t(
            '浏览器存储不可用，本次更改只保留在当前页面。',
            'Storage unavailable. Changes are kept only for this session.',
          ),
        );
      }
    }
  }, [
    preferences,
    saved,
    hidden,
    feedback,
    resources,
    feederEvents,
    onboardingStep,
    onboardingWantedTags,
    onboardingBlockedTags,
    page,
    ready,
  ]);
  useEffect(() => {
    document.documentElement.lang = visibleInterfaceLocale;
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  const tagSuggestionQuery = useMemo(
    () =>
      draft
        ? JSON.stringify({
            domainIds: draft.domains,
            tagIds: draft.tags,
            customTerms: draft.customTags.map((tag) => tag.labelEn),
            readingLanguage: draft.readingLanguage,
          })
        : '',
    [draft?.domains, draft?.tags, draft?.customTags, draft?.readingLanguage],
  );
  useEffect(() => {
    if (!draft || (!draft.domains.length && !draft.tags.length && !draft.customTags.length)) {
      setTagSuggestions([]);
      setTagSuggestionStatus('idle');
      setTagSuggestionWarning('');
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setTagSuggestionStatus('loading');
      setTagSuggestionWarning('');
      try {
        const response = await fetch('/api/tags/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: tagSuggestionQuery,
          signal: controller.signal,
        });
        const payload = await readApiData<{
          suggestions?: TagSuggestion[];
          liveStatus?: 'live' | 'degraded' | 'idle';
          warning?: string | null;
        }>(response);
        setTagSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : []);
        setTagSuggestionStatus(payload.liveStatus ?? 'degraded');
        setTagSuggestionWarning(payload.warning ?? '');
      } catch (error) {
        if (controller.signal.aborted) return;
        setTagSuggestions([]);
        setTagSuggestionStatus('degraded');
        setTagSuggestionWarning(error instanceof Error ? error.message : String(error));
      }
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [tagSuggestionQuery]);

  const feed = useMemo(
    () =>
      rankFeed(preferences, {
        source,
        query,
        savedOnly: page === 'saved',
        savedIds: saved,
        hiddenIds: hidden,
        limit: 20,
      }),
    [preferences, source, query, page, saved, hidden],
  );
  const visibleFeed =
    activeTopic === 'all' ? feed : feed.filter((item) => item.tags.includes(activeTopic));
  const sessionFeed = useMemo(() => {
    if (timeBudget === 'all' || page === 'saved') return visibleFeed;
    const picked: RankedContent[] = [];
    let used = 0;
    for (const item of visibleFeed) {
      if (used + item.duration <= timeBudget) {
        picked.push(item);
        used += item.duration;
      }
    }
    return picked.length ? picked : visibleFeed.slice(0, 1);
  }, [visibleFeed, timeBudget, page]);
  const focusedItem = sessionFeed.find((item) => item.id === focusedId) ?? sessionFeed[0];
  const sessionMinutes = sessionFeed.reduce((total, item) => total + item.duration, 0);
  const selectedDomains = domains.filter((domain) => preferences.domains.includes(domain.id));
  const related = domains.filter(
    (domain) =>
      !preferences.onlySelectedTags &&
      preferences.relatedDomains.includes(domain.id) &&
      !preferences.domains.includes(domain.id),
  );
  const effectiveExploration = preferences.onlySelectedTags ? 0 : preferences.exploration;
  const changeOnlySelectedTags = (value: boolean) =>
    setPreferences((current) => ({
      ...current,
      onlySelectedTags: value,
      version: current.version + 1,
    }));
  const changeInterestRule = (
    rule: 'requireAllSelectedTags' | 'excludeUnselectedTags',
    value: boolean,
  ) =>
    setPreferences((current) => ({
      ...current,
      [rule]: value,
      version: current.version + 1,
    }));
  const selectedTags = preferences.tags.slice(0, 6);
  const toggleSaved = (id: string) => {
    const exists = saved.includes(id);
    setSaved((prev) => (exists ? prev.filter((item) => item !== id) : [...prev, id]));
    setToast(
      exists
        ? t('已从稍后阅读移除', 'Removed from your reading list')
        : t('已收藏，留给下一次灵感', 'Saved for your next moment of inspiration'),
    );
  };
  const saveResource = (item: HarvestItem) => {
    if (
      resources.some(
        (resource) =>
          resource.id === item.id || resourceUrlKey(resource.url) === resourceUrlKey(item.url),
      )
    ) {
      setToast(t('这条资源已经在知识库中', 'This resource is already in your library'));
      return;
    }
    setResources((previous) => [resourceFromHarvest(item), ...previous]);
    setToast(t('已收藏到资源库', 'Saved to the resource library'));
  };
  const navigate = (next: Page) => {
    setPage(next);
    setMobileNav(false);
    setQuery('');
    setSource('all');
    setActiveTopic('all');
  };
  const editPreferences = () => setDraft(structuredClone(preferences));
  const manageInterests = () => {
    navigate('discover');
    editPreferences();
  };
  const recordPositive = (item: Content) => {
    setFeedback((prev) => [
      ...prev.filter(
        (entry) => !(entry.contentId === item.id && entry.event === 'explicit_positive'),
      ),
      {
        contentId: item.id,
        actor: 'user',
        event: 'explicit_positive',
        at: new Date().toISOString(),
      },
    ]);
    setToast(
      t(
        '已记录「想看更多」。你的手选偏好保持不变。',
        'More like this recorded. Your explicit preferences stay unchanged.',
      ),
    );
  };
  const submitNegative = (reason: string) => {
    if (!negative) return;
    setHidden((prev) => [...new Set([...prev, negative.id])]);
    setFeedback((prev) => [
      ...prev,
      {
        contentId: negative.id,
        actor: 'user',
        event: 'explicit_negative',
        reason,
        at: new Date().toISOString(),
      },
    ]);
    setNegative(null);
    setDetail(null);
    setToast(t('已隐藏这条内容，并记录你的反馈', 'Item hidden and your feedback recorded'));
  };
  const blockCreator = (creator: string) => {
    setPreferences((prev) => ({
      ...prev,
      blockedSources: [...new Set([...prev.blockedSources, creator])],
      version: prev.version + 1,
    }));
    setDetail(null);
    setNegative(null);
    setToast(t(`已屏蔽 ${creator} 的全部内容`, `All content from ${creator} is now blocked`));
  };
  const exportData = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            schema: 'feed-gardener-demo/1',
            preferences,
            saved,
            hidden,
            feedback,
            resources,
            feederEvents,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'feed-gardener-local-data.json';
    a.click();
    URL.revokeObjectURL(url);
    setToast(t('偏好和个人记录已导出', 'Preferences and personal records exported'));
  };
  const completeOnboarding = () => {
    const wantedTags = readTagIds(onboardingWantedTags);
    if (wantedTags.length === 0) return;
    const blockedTags = readTagIds(onboardingBlockedTags).filter((id) => !wantedTags.includes(id));
    const selectedDomainIds = domains
      .filter((domain) => domain.tags.some((tag) => wantedTags.includes(tag.id)))
      .map((domain) => domain.id);
    setPreferences((current) => ({
      ...englishDefaultPreferences(),
      domains: selectedDomainIds,
      tags: wantedTags,
      relatedDomains: [],
      exploration: 0,
      onlySelectedTags: blockedTags.length === 0,
      blockedTags,
      version: current.version + 1,
    }));
    setOnboardingWantedTags(wantedTags);
    setOnboardingBlockedTags(blockedTags);
    setOnboardingStep('complete');
    setPage('discover');
    setActiveTopic('all');
    window.scrollTo({ top: 0, behavior: 'instant' });
    setToast('Your feed is ready. Your selected tags are now in sync.');
  };

  const changeOnboardingStep = (nextStep: OnboardingStep) => {
    const steps: OnboardingStep[] = ['intro', 'explore', 'exclude'];
    const currentIndex =
      onboardingStep === null || onboardingStep === 'complete' ? 0 : steps.indexOf(onboardingStep);
    setOnboardingDirection(steps.indexOf(nextStep) < currentIndex ? 'backward' : 'forward');
    setOnboardingStep(nextStep);
  };

  if (!ready || onboardingStep === null) {
    return (
      <div className="boot-screen" aria-label="Feed Gardener">
        <span className="brand-mark">
          <Sprout size={27} strokeWidth={1.6} />
        </span>
        <span className="boot-brand">
          feed<span className="brand-serif">gardener</span>
        </span>
      </div>
    );
  }

  if (onboardingStep !== 'complete') {
    return (
      <Onboarding
        key={onboardingStep}
        step={onboardingStep}
        transitionDirection={onboardingDirection}
        wantedTags={onboardingWantedTags}
        blockedTags={onboardingBlockedTags}
        onStepChange={changeOnboardingStep}
        onWantedTagsChange={(tags) => {
          setOnboardingWantedTags(tags);
          setOnboardingBlockedTags((blocked) => blocked.filter((id) => !tags.includes(id)));
        }}
        onBlockedTagsChange={setOnboardingBlockedTags}
        onComplete={completeOnboarding}
      />
    );
  }

  return (
    <div className="app-shell">
      <WorkspaceSidebar
        page={page}
        t={t}
        mobileOpen={mobileNav}
        resourceCount={resources.length}
        savedCount={resources.length}
        interests={selectedDomains}
        onNavigate={navigate}
        onCloseMobile={() => setMobileNav(false)}
        onEditInterests={editPreferences}
      />
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              onClick={() => setMobileNav(true)}
              aria-label={t('打开导航', 'Open navigation')}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb-root">{t('我的工作台', 'My workspace')}</span>
            <ChevronRight size={13} />
            <span>
              {page === 'connections'
                ? t('连接与隐私', 'Connections & privacy')
                : t(
                    WORKSPACE_TABS.find((item) => item.id === page)?.zh || '',
                    WORKSPACE_TABS.find((item) => item.id === page)?.en || '',
                  )}
            </span>
          </div>
          <div className="topbar-actions">
            {page === 'connections' && <YouTubeConnection compact />}
            <span className="demo-status">
              <i />
              {page === 'discover'
                ? t('公开来源候选', 'PUBLIC CANDIDATES')
                : t('本地工作空间', 'LOCAL WORKSPACE')}
            </span>
            <span className="topbar-separator" />
            <span className="small-avatar">M</span>
          </div>
        </header>
        {offline && (
          <div className="offline-banner">
            <Radio size={16} />
            {t(
              '当前离线。已保存内容仍可浏览，更改保存在本机。',
              'You are offline. Saved items and local changes remain available.',
            )}
          </div>
        )}
        {page === 'discover' || page === 'saved' || page === 'garden' ? (
          <main className="discover-page">
            <FeederWorkspace
              page={page}
              locale={locale}
              preferences={preferences}
              resources={resources}
              events={feederEvents}
              onSaveResource={saveResource}
              onRemoveResource={(id) =>
                setResources((current) => current.filter((item) => item.id !== id))
              }
              onRecordEvent={(event) =>
                setFeederEvents((current) => [...current, event].slice(-500))
              }
              onUndoEvent={(id) =>
                setFeederEvents((current) => current.filter((event) => event.id !== id))
              }
              onTagJevChange={(id, value) =>
                setPreferences((current) => ({
                  ...current,
                  tagJev: { ...current.tagJev, [id]: value },
                  version: current.version + 1,
                }))
              }
              onTargetJevAverageChange={(value) =>
                setPreferences((current) => ({
                  ...current,
                  targetJevAverage: value,
                  version: current.version + 1,
                }))
              }
              onOnlySelectedTagsChange={changeOnlySelectedTags}
              onInterestRuleChange={changeInterestRule}
              onEditInterests={manageInterests}
            />
          </main>
        ) : page === 'connections' ? (
          <main className="settings-page">
            <h1>{t('连接与隐私', 'Connections & privacy')}</h1>
            <YouTubeConnection outcome={youtubeOutcome} />
            <div className="privacy-banner">
              <ShieldCheck size={26} />
              <div>
                <strong>{t('仅本机数据', 'Local data only')}</strong>
              </div>
            </div>
            <div className="connection-list">
              {[
                {
                  name: 'TikTok',
                  mark: 'TT',
                  statusZh: '受限可用',
                  statusEn: 'Limited',
                  live: true,
                },
                {
                  name: 'X',
                  mark: 'X',
                  statusZh: '受限可用',
                  statusEn: 'Limited',
                  live: true,
                },
                {
                  name: 'Instagram',
                  mark: 'IG',
                  statusZh: '需配置',
                  statusEn: 'Setup needed',
                  live: false,
                },
                {
                  name: 'arXiv',
                  mark: 'AX',
                  statusZh: '公开源',
                  statusEn: 'Public source',
                  live: true,
                },
                {
                  name: 'GitHub',
                  mark: 'GH',
                  statusZh: '公开源',
                  statusEn: 'Public source',
                  live: true,
                },
                {
                  name: 'Hacker News',
                  mark: 'HN',
                  statusZh: '公开源',
                  statusEn: 'Public source',
                  live: true,
                },
              ].map((connection) => (
                <div className="connection-row" key={connection.name}>
                  <span className="connection-logo connection-lettermark">{connection.mark}</span>
                  <div>
                    <h3>{connection.name}</h3>
                  </div>
                  <span className={`status-neutral ${connection.live ? 'status-live' : ''}`}>
                    {t(connection.statusZh, connection.statusEn)}
                  </span>
                </div>
              ))}
            </div>
            <div className="settings-two">
              <section className="panel settings-panel">
                <h3>
                  <ArrowDownToLine size={18} />
                  {t('导出数据', 'Export data')}
                </h3>
                <button className="secondary-button" onClick={exportData}>
                  {t('导出本地数据', 'Export local data')}
                  <ArrowDownToLine size={15} />
                </button>
              </section>
              <section className="panel settings-panel">
                <h3>
                  <Trash2 size={18} />
                  {t('清除数据', 'Clear data')}
                </h3>
                <button
                  className="secondary-button danger-text"
                  onClick={() => setResetConfirm(true)}
                >
                  {t('清除演示数据', 'Clear demo data')}
                </button>
              </section>
            </div>
          </main>
        ) : page === 'library' ? (
          <ResourceLibrary
            locale={locale}
            resources={resources}
            t={t}
            onAdd={(record) => {
              setResources((previous) => [record, ...previous]);
              setToast(t('已收藏到资源库', 'Saved to the resource library'));
            }}
            onUpdate={(id, patch) =>
              setResources((previous) =>
                previous.map((resource) =>
                  resource.id === id ? { ...resource, ...patch } : resource,
                ),
              )
            }
            onRemove={(id) => {
              setResources((previous) => previous.filter((resource) => resource.id !== id));
              setToast(t('已移出资源库', 'Removed from the resource library'));
            }}
            onDiscover={() => navigate('discover')}
          />
        ) : (
          <main className="discover-page">
            <div className="new-workbench">
              {page === 'discover' ? (
                <SourceBoards
                  locale={locale}
                  preferences={preferences}
                  interestLabels={[
                    ...selectedTags.map((id) => tagName(id, locale)),
                    ...preferences.customTags.map((tag) =>
                      customTagName(tag, preferences.readingLanguage),
                    ),
                  ]}
                  t={t}
                  savedResourceIds={resources.map((resource) => resource.id)}
                  onSaveResource={saveResource}
                />
              ) : (
                <DiscoveryGallery
                  locale={locale}
                  page={page}
                  items={visibleFeed}
                  sessionItems={sessionFeed}
                  sessionMinutes={sessionMinutes}
                  timeBudget={timeBudget}
                  source={source}
                  query={query}
                  activeTopic={activeTopic}
                  selectedTags={selectedTags}
                  saved={saved}
                  tagName={tagName}
                  t={t}
                  onBudgetChange={setTimeBudget}
                  onSourceChange={setSource}
                  onQueryChange={setQuery}
                  onTopicChange={setActiveTopic}
                  onOpen={(item) => {
                    setFocusedId(item.id);
                    setDetail(item);
                  }}
                  onSave={toggleSaved}
                  onHide={setNegative}
                  onEditPreferences={editPreferences}
                  onDiscover={() => navigate('discover')}
                />
              )}
              <div className="obsolete-workbench">
                <section className="workbench-heading">
                  <div>
                    <span className="context-label">
                      <FlaskConical size={13} />
                      {t('本地交互原型 · 合成内容', 'LOCAL PROTOTYPE · SYNTHETIC CONTENT')}
                    </span>
                    <h1>
                      {page === 'saved'
                        ? t('稍后阅读', 'Saved for later')
                        : t('今天值得看什么？', 'What is worth your time today?')}
                    </h1>
                    <p>
                      {page === 'saved'
                        ? t(
                            '这里仅收录你明确收藏的内容。',
                            'Only items you explicitly saved appear here.',
                          )
                        : t(
                            '按偏好排序、按时间组队列。选择一条，右侧会直接解释推荐依据。',
                            'Ranked by your choices and shaped to your time. Select an item to inspect the reasoning.',
                          )}
                    </p>
                  </div>
                  <button className="secondary-button heading-button" onClick={editPreferences}>
                    <SlidersHorizontal size={16} />
                    {t('编辑偏好', 'Edit preferences')}
                  </button>
                </section>

                {page === 'discover' && (
                  <section className="session-builder" aria-label={t('时间预算', 'Time budget')}>
                    <div className="session-title">
                      <span className="session-icon">
                        <Clock3 size={18} />
                      </span>
                      <div>
                        <strong>{t('先决定投入多少时间', 'Start with the time you have')}</strong>
                        <small>
                          {t(
                            '自动选出能在预算内看完的高相关内容',
                            'Build a focused queue from the highest-ranked items',
                          )}
                        </small>
                      </div>
                    </div>
                    <div
                      className="budget-switch"
                      role="group"
                      aria-label={t('选择时间', 'Choose time')}
                    >
                      {([10, 25, 'all'] as const).map((budget) => (
                        <button
                          key={budget}
                          aria-pressed={timeBudget === budget}
                          className={timeBudget === budget ? 'selected' : ''}
                          onClick={() => setTimeBudget(budget)}
                        >
                          {budget === 'all' ? t('全部', 'All') : budget + ' min'}
                        </button>
                      ))}
                    </div>
                    <div className="session-result">
                      <span>
                        <b>{sessionFeed.length}</b> {t('条', 'items')}
                      </span>
                      <span>
                        <b>{sessionMinutes}</b> min
                      </span>
                      <button
                        disabled={!sessionFeed.length}
                        onClick={() => sessionFeed[0] && setDetail(sessionFeed[0])}
                      >
                        {t('打开第一条', 'Open first')}
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  </section>
                )}

                <section className="filter-deck">
                  <div className="source-tabs" aria-label={t('内容来源', 'Content sources')}>
                    {sources.map((s) => (
                      <button
                        key={s}
                        aria-pressed={source === s}
                        className={source === s ? 'selected' : ''}
                        onClick={() => setSource(s)}
                      >
                        {s === 'all' ? <Layers3 size={14} /> : <SourceIcon source={s} />}
                        {s === 'all' ? t('全部来源', 'All sources') : s}
                      </button>
                    ))}
                  </div>
                  <div className="filter-divider" />
                  <div className="topic-filters">
                    <button
                      aria-pressed={activeTopic === 'all'}
                      className={activeTopic === 'all' ? 'selected' : ''}
                      onClick={() => setActiveTopic('all')}
                    >
                      {t('全部主题', 'All topics')}
                    </button>
                    {selectedTags.slice(0, 4).map((id) => (
                      <button
                        key={id}
                        aria-pressed={activeTopic === id}
                        className={activeTopic === id ? 'selected' : ''}
                        onClick={() => setActiveTopic(id)}
                      >
                        {tagName(id, locale)}
                      </button>
                    ))}
                  </div>
                  <label className="search-box">
                    <Search size={15} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('搜标题、作者或标签', 'Search title, creator or tag')}
                      aria-label={t('搜索内容', 'Search content')}
                    />
                    {query && (
                      <button
                        aria-label={t('清除搜索', 'Clear search')}
                        onClick={() => setQuery('')}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </label>
                </section>

                <div className="workbench-grid">
                  <section className="queue-panel">
                    <div className="queue-heading">
                      <div>
                        <span>
                          {page === 'saved' ? t('收藏夹', 'SAVED') : t('本次队列', 'TODAY’S QUEUE')}
                        </span>
                        <strong>
                          {sessionFeed.length} {t('条内容', 'items')} · {sessionMinutes} min
                        </strong>
                      </div>
                      <button
                        className={'text-button refresh-button ' + (refreshing ? 'refreshing' : '')}
                        disabled={refreshing}
                        onClick={() => {
                          setRefreshing(true);
                          setTimeout(() => {
                            setRefreshing(false);
                            setToast(
                              t(
                                '已根据当前偏好重新排序 · 示例内容未联网更新',
                                'Re-ranked from current preferences · Demo sources are not live',
                              ),
                            );
                          }, 600);
                        }}
                      >
                        <RefreshCw size={14} />
                        {t('重新排序', 'Re-rank')}
                      </button>
                    </div>

                    {visibleFeed.length === 0 ? (
                      <div className="empty-state">
                        <span>
                          <Sprout size={32} />
                        </span>
                        <h3>
                          {page === 'saved' && saved.length === 0
                            ? t('收藏夹还是空的', 'Nothing saved yet')
                            : t('当前筛选没有结果', 'No matches for these filters')}
                        </h3>
                        <p>
                          {page === 'saved' && saved.length === 0
                            ? t(
                                '在发现页点击书签，就能把内容放到这里。',
                                'Use the bookmark action in Discover to place an item here.',
                              )
                            : t(
                                '清除筛选，或调整兴趣与排除项。',
                                'Clear the filters or adjust your interests and exclusions.',
                              )}
                        </p>
                        <button
                          className="secondary-button"
                          onClick={() => {
                            if (page === 'saved' && saved.length === 0) navigate('discover');
                            else {
                              setQuery('');
                              setSource('all');
                              setActiveTopic('all');
                            }
                          }}
                        >
                          {page === 'saved' && saved.length === 0
                            ? t('去发现', 'Go to Discover')
                            : t('清除筛选', 'Clear filters')}
                        </button>
                      </div>
                    ) : (
                      <div className="queue-list">
                        {sessionFeed.map((item, index) => (
                          <article
                            className={
                              'queue-item ' + (focusedItem?.id === item.id ? 'is-focused' : '')
                            }
                            key={item.id}
                          >
                            <button
                              className="queue-select"
                              onClick={() => setFocusedId(item.id)}
                              aria-label={
                                t('选择并查看推荐依据：', 'Select and inspect: ') +
                                (locale === 'zh' ? item.title : item.titleEn)
                              }
                            >
                              <span className="queue-index">
                                {String(index + 1).padStart(2, '0')}
                              </span>
                              <span className="queue-cover">
                                <Cover item={item} />
                              </span>
                              <span className="queue-copy">
                                <span className="queue-meta">
                                  <SourceIcon source={item.source} />
                                  {item.source} · {item.creator} · {formatDuration(item.duration)}
                                </span>
                                <strong>{locale === 'zh' ? item.title : item.titleEn}</strong>
                                <span className="queue-summary">
                                  {locale === 'zh' ? item.summary : item.summaryEn}
                                </span>
                                <span className="queue-tags">
                                  {item.tags.slice(0, 2).map((id) => (
                                    <i key={id}>{tagName(id, locale)}</i>
                                  ))}
                                  {item.exploratory && (
                                    <i className="explore-tag">{t('相邻探索', 'Explore')}</i>
                                  )}
                                </span>
                              </span>
                            </button>
                            <div className="queue-actions">
                              <button
                                className={saved.includes(item.id) ? 'is-active' : ''}
                                onClick={() => toggleSaved(item.id)}
                                aria-label={
                                  saved.includes(item.id)
                                    ? t('取消收藏', 'Unsave')
                                    : t('收藏', 'Save')
                                }
                              >
                                <Bookmark
                                  size={16}
                                  fill={saved.includes(item.id) ? 'currentColor' : 'none'}
                                />
                              </button>
                              <button
                                onClick={() => setNegative(item)}
                                aria-label={t('不适合我', 'Not for me')}
                              >
                                <ThumbsDown size={16} />
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                    {visibleFeed.length > sessionFeed.length && page === 'discover' && (
                      <button className="queue-remainder" onClick={() => setTimeBudget('all')}>
                        <Plus size={14} />
                        {t(
                          '还有 ' + (visibleFeed.length - sessionFeed.length) + ' 条符合偏好的内容',
                          visibleFeed.length - sessionFeed.length + ' more matching items',
                        )}
                        <span>{t('查看全部', 'Show all')}</span>
                      </button>
                    )}
                  </section>

                  <aside className="evidence-rail">
                    {focusedItem ? (
                      <section className="evidence-card">
                        <div className="evidence-head">
                          <span>{t('推荐依据', 'MATCH TRACE')}</span>
                          <span className={focusedItem.exploratory ? 'explore-status' : ''}>
                            {focusedItem.exploratory
                              ? t('相邻探索', 'Adjacent')
                              : t('核心兴趣', 'Core match')}
                          </span>
                        </div>
                        <button
                          className="evidence-cover"
                          onClick={() => setDetail(focusedItem)}
                          aria-label={t('打开内容详情', 'Open item details')}
                        >
                          <Cover item={focusedItem} />
                        </button>
                        <div className="evidence-body">
                          <span className="evidence-source">
                            <SourceIcon source={focusedItem.source} />
                            {focusedItem.source} · {focusedItem.creator}
                          </span>
                          <h2>{locale === 'zh' ? focusedItem.title : focusedItem.titleEn}</h2>
                          <p>{locale === 'zh' ? focusedItem.summary : focusedItem.summaryEn}</p>
                          <div className="reason-stack">
                            {(locale === 'zh' ? focusedItem.reasons : focusedItem.reasonsEn).map(
                              (reason, index) => (
                                <div key={reason}>
                                  <span>{index + 1}</span>
                                  <p>{reason}</p>
                                </div>
                              ),
                            )}
                          </div>
                          <small className="ranking-note">
                            {t(
                              '以上是规则匹配解释，不是喜欢概率，也不是模型读取了真实视频后的判断。',
                              'These are rule-based matches, not like probabilities or analysis of a real video.',
                            )}
                          </small>
                          <div className="evidence-actions">
                            <button
                              className="primary-button"
                              onClick={() => setDetail(focusedItem)}
                            >
                              {t('打开简报', 'Open brief')}
                              <ArrowUpRight size={15} />
                            </button>
                            <button
                              className={
                                feedback.some(
                                  (entry) =>
                                    entry.contentId === focusedItem.id &&
                                    entry.event === 'explicit_positive',
                                )
                                  ? 'is-active'
                                  : ''
                              }
                              onClick={() => recordPositive(focusedItem)}
                            >
                              <ThumbsUp size={15} />
                              {t('想看更多', 'More like this')}
                            </button>
                            <button onClick={() => setNegative(focusedItem)}>
                              <ThumbsDown size={15} />
                              {t('不适合', 'Not for me')}
                            </button>
                          </div>
                        </div>
                        <div className="evidence-foot">
                          <ShieldCheck size={14} />
                          {t(
                            '反馈由 user 记录；系统动作不会改写你的明确偏好。',
                            'Feedback is recorded as user input; system actions never rewrite explicit choices.',
                          )}
                        </div>
                      </section>
                    ) : (
                      <section className="evidence-empty">
                        <Compass size={24} />
                        <p>
                          {t(
                            '从左侧选择一条内容查看依据。',
                            'Select an item to inspect its reasoning.',
                          )}
                        </p>
                      </section>
                    )}
                    <button className="garden-shortcut" onClick={() => navigate('garden')}>
                      <span>
                        <Sprout size={17} />
                        <b>{t('信息花园模拟器', 'Garden simulator')}</b>
                      </span>
                      <small>
                        {t(
                          '查看可暂停、可核验的本地调校计划',
                          'Inspect a pausable, verifiable local plan',
                        )}
                      </small>
                      <ArrowRight size={15} />
                    </button>
                  </aside>
                </div>
              </div>
            </div>
            <div className="legacy-discover">
              <section className="page-heading">
                <div>
                  <div className="eyebrow">
                    {page === 'saved'
                      ? 'A LITTLE SOMETHING FOR LATER'
                      : 'A LITTLE CURIOSITY, EVERY DAY'}
                  </div>
                  <h1>
                    {page === 'saved'
                      ? t('把灵感，留给稍后。', 'Good ideas can wait.')
                      : t('让好内容，自然生长。', 'Grow a feed that feels like you.')}
                  </h1>
                  <p>
                    {page === 'saved'
                      ? t(
                          '你亲手留下的内容，在这里慢慢读。',
                          'A thoughtful collection, ready when you are.',
                        )
                      : t(
                          '从你在意的事出发，少一点噪声，多一点发现。',
                          'Rooted in your interests. Less noise, more discovery.',
                        )}
                  </p>
                </div>
                <button className="secondary-button heading-button" onClick={editPreferences}>
                  <SlidersHorizontal size={16} />
                  {t('调整我的偏好', 'Tune my interests')}
                </button>
              </section>
              <div className="workspace-grid">
                <section className="feed-column">
                  {page === 'discover' && (
                    <section className="hero-card">
                      <div className="hero-copy">
                        <span className="hero-label">
                          <span />
                          {t('为好奇心，留一片空间', 'A SPACE FOR YOUR CURIOSITY')}
                        </span>
                        <h2>
                          {t('你的兴趣，', 'Your interests.')}
                          <br />
                          {t('值得被认真对待。', 'Room to grow.')}
                        </h2>
                        <p>
                          {t(
                            '种下你喜欢的，让值得看的浮现。',
                            'Plant what you love. Find what matters.',
                          )}
                          <br />
                          {t('每一次发现，都有迹可循。', 'Every recommendation has a reason.')}
                        </p>
                        <button onClick={editPreferences}>
                          {t('看看我的兴趣种子', 'Explore my interests')}
                          <ArrowRight size={16} />
                        </button>
                      </div>
                      <Botanical />
                    </section>
                  )}
                  <div className="feed-section-heading">
                    <div>
                      <h2>
                        {page === 'saved'
                          ? t('我的收藏', 'Your reading list')
                          : t('为你发现', 'Picked for you')}
                      </h2>
                      <span>
                        {visibleFeed.length} {t('条内容', 'finds')}
                      </span>
                    </div>
                    <button
                      className={`text-button refresh-button ${refreshing ? 'refreshing' : ''}`}
                      disabled={refreshing}
                      onClick={() => {
                        setRefreshing(true);
                        setTimeout(() => {
                          setRefreshing(false);
                          setToast(
                            t(
                              '已根据当前偏好重新整理 · 示例内容未联网更新',
                              'Re-ranked with your preferences · Demo sources are not live',
                            ),
                          );
                        }, 600);
                      }}
                    >
                      <RefreshCw size={14} />
                      {t('重新整理', 'Refresh picks')}
                    </button>
                  </div>
                  <div className="feed-toolbar">
                    <div className="source-tabs" aria-label={t('内容来源', 'Content sources')}>
                      {sources.map((s) => (
                        <button
                          key={s}
                          aria-pressed={source === s}
                          className={source === s ? 'selected' : ''}
                          onClick={() => setSource(s)}
                        >
                          {s === 'all' ? <Layers3 size={14} /> : <SourceIcon source={s} />}
                          {s === 'all' ? t('全部来源', 'All sources') : s}
                        </button>
                      ))}
                    </div>
                    <label className="search-box">
                      <Search size={15} />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t('搜索内容…', 'Search finds…')}
                        aria-label={t('搜索内容', 'Search content')}
                      />
                      {query && (
                        <button
                          aria-label={t('清除搜索', 'Clear search')}
                          onClick={() => setQuery('')}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </label>
                  </div>
                  <div className="topic-filters">
                    <button
                      aria-pressed={activeTopic === 'all'}
                      className={activeTopic === 'all' ? 'selected' : ''}
                      onClick={() => setActiveTopic('all')}
                    >
                      {t('全部兴趣', 'All interests')}
                    </button>
                    {selectedTags.slice(0, 4).map((id) => (
                      <button
                        key={id}
                        aria-pressed={activeTopic === id}
                        className={activeTopic === id ? 'selected' : ''}
                        onClick={() => setActiveTopic(id)}
                      >
                        {tagName(id, locale)}
                      </button>
                    ))}
                    <span className="fixture-label">
                      <FlaskConical size={12} />
                      {t('示例内容', 'SAMPLE CONTENT')}
                    </span>
                  </div>
                  {!ready ? (
                    <div className="empty-state">
                      <Sprout />
                      <h3>{t('正在整理你的空间…', 'Preparing your space…')}</h3>
                    </div>
                  ) : visibleFeed.length === 0 ? (
                    <div className="empty-state">
                      <span>
                        <Sprout size={32} />
                      </span>
                      <h3>
                        {page === 'saved' && saved.length === 0
                          ? t('好内容，值得留一会儿', 'Leave room for a good idea')
                          : t('给发现留一点空间', 'Make a little room for discovery')}
                      </h3>
                      <p>
                        {page === 'saved' && saved.length === 0
                          ? t(
                              '点击内容卡片上的书签，就能在这里找到它。',
                              'Bookmark a card and find it here when you are ready.',
                            )
                          : t(
                              '当前筛选下没有内容。试试其他关键词，或调整兴趣和排除项。',
                              'No items match these filters. Try another search or adjust your interests and exclusions.',
                            )}
                      </p>
                      <button
                        className="secondary-button"
                        onClick={() => {
                          if (page === 'saved' && saved.length === 0) navigate('discover');
                          else {
                            setQuery('');
                            setSource('all');
                            setActiveTopic('all');
                            editPreferences();
                          }
                        }}
                      >
                        {page === 'saved' && saved.length === 0
                          ? t('去发现好内容', 'Explore your feed')
                          : t('调整偏好', 'Adjust preferences')}
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  ) : (
                    <div className="feed-grid">
                      {visibleFeed.map((item) => (
                        <article className="content-card" key={item.id}>
                          <button
                            className="cover-button"
                            onClick={() => setDetail(item)}
                            aria-label={`${t('查看', 'View')} ${locale === 'zh' ? item.title : item.titleEn}`}
                          >
                            <Cover item={item} />
                          </button>
                          <div className="card-body">
                            <div className="card-source">
                              <span>
                                <SourceIcon source={item.source} />
                                {item.source}
                                <i />
                                {t(
                                  `${item.ageHours < 24 ? item.ageHours + ' 小时' : Math.floor(item.ageHours / 24) + ' 天'}前`,
                                  `${item.ageHours < 24 ? item.ageHours + 'h' : Math.floor(item.ageHours / 24) + 'd'} ago`,
                                )}
                              </span>
                              <button
                                className={`bookmark-button ${saved.includes(item.id) ? 'is-saved' : ''}`}
                                aria-label={
                                  saved.includes(item.id)
                                    ? t('取消收藏', 'Remove bookmark')
                                    : t('收藏内容', 'Save content')
                                }
                                onClick={() => toggleSaved(item.id)}
                              >
                                <Bookmark
                                  size={17}
                                  fill={saved.includes(item.id) ? 'currentColor' : 'none'}
                                />
                              </button>
                            </div>
                            <button className="card-title" onClick={() => setDetail(item)}>
                              {locale === 'zh' ? item.title : item.titleEn}
                            </button>
                            <div className="creator-row">
                              <span className={`creator-avatar avatar-${item.art}`}>
                                {item.creator.slice(0, 1)}
                              </span>
                              <span>{item.creator}</span>
                              <span className="card-format">
                                {item.format === 'demo'
                                  ? t('实操演示', 'Demo')
                                  : item.format === 'tutorial'
                                    ? t('深度教程', 'Tutorial')
                                    : item.format === 'discussion'
                                      ? t('观点讨论', 'Discussion')
                                      : t('动态', 'News')}
                              </span>
                            </div>
                            <div className="card-tags">
                              {item.tags.slice(0, 2).map((id) => (
                                <span key={id}>{tagName(id, locale)}</span>
                              ))}
                            </div>
                            <button
                              className={`card-reason ${item.exploratory ? 'reason-explore' : ''}`}
                              onClick={() => setDetail(item)}
                            >
                              {item.exploratory ? <Compass size={13} /> : <Sparkles size={13} />}
                              <span>
                                {item.exploratory
                                  ? t(
                                      '来自你允许探索的相邻领域',
                                      'From your chosen adjacent interests',
                                    )
                                  : locale === 'zh'
                                    ? item.reasons[0]
                                    : item.reasonsEn[0]}
                              </span>
                              <ChevronRight size={13} />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                  {visibleFeed.length > 0 && (
                    <div className="feed-end">
                      <span />
                      <Leaf size={16} />
                      <span />
                      <p>
                        {t(
                          '今天的发现到这里。好内容，慢慢消化。',
                          'You’ve reached the end. Let the good ideas sink in.',
                        )}
                      </p>
                      <small>
                        {t(
                          '有限的信息流 · 你的注意力值得被尊重',
                          'A finite feed. Your attention matters.',
                        )}
                      </small>
                    </div>
                  )}
                </section>
                <aside className="insights-column">
                  <section className="panel interests-panel">
                    <div className="panel-title">
                      <h3>
                        <Sprout size={18} />
                        {t('我的兴趣种子', 'Your interest seeds')}
                      </h3>
                      <button
                        className="icon-button"
                        onClick={editPreferences}
                        aria-label={t('编辑偏好', 'Edit preferences')}
                      >
                        <Settings2 size={16} />
                      </button>
                    </div>
                    <p className="panel-subtitle">
                      {t(
                        '你决定方向，我们帮你发现。',
                        'You choose the direction. We help you explore.',
                      )}
                    </p>
                    {selectedDomains.map((domain, i) => (
                      <div className="interest-group" key={domain.id}>
                        <h4>
                          <span className={`interest-dot dot-${i}`} />
                          {locale === 'zh' ? domain.label : domain.labelEn}
                        </h4>
                        <div className="mini-tags">
                          {domain.tags
                            .filter((tag) => preferences.tags.includes(tag.id))
                            .map((tag) => (
                              <span key={tag.id}>{locale === 'zh' ? tag.label : tag.labelEn}</span>
                            ))}
                          {!domain.tags.some((tag) => preferences.tags.includes(tag.id)) && (
                            <span>{t('整个领域', 'Whole domain')}</span>
                          )}
                        </div>
                      </div>
                    ))}
                    <button className="add-interest" onClick={editPreferences}>
                      <Plus size={14} />
                      {t('管理兴趣', 'Manage interests')}
                    </button>
                    <div className="panel-divider" />
                    <div className="explore-heading">
                      <span>
                        <Compass size={15} />
                        {t('留一点探索空间', 'Room to explore')}
                      </span>
                      <strong>{effectiveExploration}%</strong>
                    </div>
                    <div className="explore-meter">
                      <span style={{ width: `${100 - effectiveExploration}%` }} />
                      <span style={{ width: `${effectiveExploration}%` }} />
                    </div>
                    <div className="meter-labels">
                      <span>
                        <i />
                        {t('核心兴趣', 'Core interests')}
                      </span>
                      <span>
                        <i />
                        {t('相邻发现', 'Adjacent finds')}
                      </span>
                    </div>
                    <p className="explore-copy">
                      {related.length
                        ? t(
                            `也许，${related.map((d) => d.label).join('、')}会带来下一次灵感。`,
                            `Your next idea might come from ${related.map((d) => d.labelEn).join(' or ')}.`,
                          )
                        : t(
                            '只专注于你当前选择的核心领域。',
                            'Focused on your selected core interests.',
                          )}
                    </p>
                  </section>
                  <section className="garden-invite">
                    <span className="garden-invite-icon">
                      <Sprout size={25} strokeWidth={1.5} />
                    </span>
                    <span className="tiny-eyebrow">GROW WITH INTENTION</span>
                    <h3>{t('不止发现，更能慢慢养成。', 'A better feed starts with you.')}</h3>
                    <p>
                      {t(
                        '看看一份偏好，如何变成可观察、可暂停的调校计划。',
                        'See how your interests become a visible, pausable gardening plan.',
                      )}
                    </p>
                    <button className="secondary-button" onClick={() => navigate('garden')}>
                      {t('走进我的花园', 'Step into your garden')}
                      <ArrowUpRight size={16} />
                    </button>
                    <span className="simulation-note">
                      <FlaskConical size={12} />
                      {t('本地模拟，不操作真实账号', 'Local simulation · No real account actions')}
                    </span>
                  </section>
                  <section className="quiet-note">
                    <ShieldCheck size={17} />
                    <div>
                      <strong>{t('你的偏好，始终由你做主', 'Your preferences stay yours')}</strong>
                      <p>
                        {t(
                          '一次误点不会改变你的兴趣。明确的选择，永远优先。',
                          'An accidental click never changes your interests. Explicit choices always come first.',
                        )}
                      </p>
                      <button onClick={() => navigate('connections')}>
                        {t('了解数据与隐私', 'About your data')}
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  </section>
                  <div className="aside-footer">
                    {t('用心选择，而非无尽滚动。', 'A considered feed, not an endless scroll.')}
                    <span>Feed Gardener · Demo 0.1</span>
                  </div>
                </aside>
              </div>
            </div>
          </main>
        )}
      </div>
      {draft && (
        <Modal
          wide
          title={t('种下你的兴趣', 'Plant your interests')}
          closeLabel={t('关闭', 'Close')}
          onClose={() => setDraft(null)}
        >
          <div className="preferences-body">
            <div className="form-step">
              <span>01</span>
              <h3>{t('选择想深入的领域', 'Choose where to grow')}</h3>
            </div>
            <div className="domain-grid">
              {domains.map((domain, i) => {
                const selected = draft.domains.includes(domain.id);
                const Icon = [Cpu, Layers3, Code2, Globe2, Compass, Radio][i] ?? Compass;
                return (
                  <button
                    key={domain.id}
                    aria-pressed={selected}
                    className={`domain-option ${selected ? 'chosen' : ''}`}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        domains: selected
                          ? draft.domains.filter((id) => id !== domain.id)
                          : [...draft.domains, domain.id],
                        tags: selected
                          ? draft.tags.filter((id) => !domain.tags.some((tag) => tag.id === id))
                          : draft.tags,
                        relatedDomains: selected
                          ? draft.relatedDomains
                          : draft.relatedDomains.filter((id) => id !== domain.id),
                      })
                    }
                  >
                    <Icon size={19} />
                    <span>{locale === 'zh' ? domain.label : domain.labelEn}</span>
                    {selected ? <Check size={16} /> : <Plus size={15} />}
                  </button>
                );
              })}
            </div>
            <div className="form-step">
              <span>02</span>
              <h3>{t('再具体一点，你对什么好奇？', 'What sparks your curiosity?')}</h3>
            </div>
            <div className="preference-tags">
              {domains
                .filter((d) => draft.domains.includes(d.id))
                .flatMap((domain) => domain.tags)
                .map((tag) => (
                  <button
                    key={tag.id}
                    aria-pressed={draft.tags.includes(tag.id)}
                    className={draft.tags.includes(tag.id) ? 'chosen' : ''}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        tags: draft.tags.includes(tag.id)
                          ? draft.tags.filter((id) => id !== tag.id)
                          : [...draft.tags, tag.id],
                      })
                    }
                  >
                    {draft.tags.includes(tag.id) ? <Check size={13} /> : <Plus size={13} />}
                    {locale === 'zh' ? tag.label : tag.labelEn}
                  </button>
                ))}
            </div>
            {draft.domains.length === 0 && (
              <p className="field-hint">
                {t('先选择一个领域，展开相关主题。', 'Choose a domain to explore its topics.')}
              </p>
            )}
            <div className="form-step connected-tag-step">
              <span>02B</span>
              <div>
                <h3>{t('联网联想更多方向', 'Discover adjacent tags online')}</h3>
                <p>
                  {t(
                    '保留内置标签，同时从当前公开 GitHub 仓库主题中寻找共现方向。联想结果不会自动加入偏好。',
                    'Keep the built-in taxonomy while finding co-occurring topics from current public GitHub repositories. Suggestions are never added automatically.',
                  )}
                </p>
              </div>
              <strong className={`suggestion-status status-${tagSuggestionStatus}`}>
                {tagSuggestionStatus === 'loading'
                  ? t('正在联网', 'Checking live sources')
                  : tagSuggestionStatus === 'live'
                    ? t('公开源已更新', 'Live source updated')
                    : tagSuggestionStatus === 'degraded'
                      ? t('仅显示内置联想', 'Curated fallback')
                      : t('等待选择', 'Select an interest')}
              </strong>
            </div>
            <div className="reading-language-picker">
              <span>{t('你实际阅读内容时使用', 'Content reading language')}</span>
              <div>
                {visibleReadingLanguageOptions.map(({ id, zh, en }) => (
                  <button
                    key={id}
                    className={draft.readingLanguage === id ? 'chosen' : ''}
                    aria-pressed={draft.readingLanguage === id}
                    onClick={() => setDraft({ ...draft, readingLanguage: id })}
                  >
                    {draft.readingLanguage === id && <Check size={12} />}
                    {t(zh, en)}
                  </button>
                ))}
              </div>
            </div>
            {draft.customTags.length > 0 && (
              <div className="selected-live-tags">
                {draft.customTags.map((tag) => (
                  <button
                    key={tag.id}
                    className="chosen"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        customTags: draft.customTags.filter((item) => item.id !== tag.id),
                      })
                    }
                  >
                    <Check size={13} />
                    {customTagName(tag, draft.readingLanguage)}
                    <small>LIVE</small>
                    <X size={12} />
                  </button>
                ))}
              </div>
            )}
            <div className="preference-tags suggestion-tags" aria-live="polite">
              {tagSuggestions.map((suggestion) => {
                const selected = suggestion.knownTagId
                  ? draft.tags.includes(suggestion.knownTagId)
                  : draft.customTags.some((tag) => tag.id === suggestion.id);
                return (
                  <button
                    key={suggestion.id}
                    aria-pressed={selected}
                    className={selected ? 'chosen' : ''}
                    title={suggestion.reason}
                    onClick={() => {
                      if (suggestion.knownTagId) {
                        setDraft({
                          ...draft,
                          tags: selected
                            ? draft.tags.filter((id) => id !== suggestion.knownTagId)
                            : [...draft.tags, suggestion.knownTagId],
                        });
                        return;
                      }
                      if (!suggestion.evidenceUrl) return;
                      setDraft({
                        ...draft,
                        customTags: selected
                          ? draft.customTags.filter((tag) => tag.id !== suggestion.id)
                          : [
                              ...draft.customTags,
                              {
                                id: suggestion.id,
                                label: suggestion.displayLabel,
                                labelZh: suggestion.label,
                                labelEn: suggestion.labelEn,
                                translationStatus:
                                  suggestion.translationStatus === 'translated'
                                    ? ('translated' as const)
                                    : ('source_label' as const),
                                source: 'github_live' as const,
                                evidenceUrl: suggestion.evidenceUrl,
                              },
                            ].slice(0, 12),
                      });
                    }}
                  >
                    {selected ? <Check size={13} /> : <Plus size={13} />}
                    {suggestion.displayLabel}
                    <small>{suggestion.origin === 'live' ? 'LIVE' : t('内置', 'SEED')}</small>
                  </button>
                );
              })}
            </div>
            {tagSuggestionWarning && (
              <p className="field-hint">
                {t(
                  '联网来源暂不可用，已保留内置标签联想。',
                  'The live source is unavailable; curated suggestions remain available.',
                )}
              </p>
            )}
            <div className="form-step">
              <span>03</span>
              <h3>{t('为相邻领域留一点空间', 'Leave some room for discovery')}</h3>
              <strong>{draft.onlySelectedTags ? 0 : draft.exploration}%</strong>
            </div>
            <SelectedTagsToggle
              checked={draft.onlySelectedTags === true}
              onChange={(value) => setDraft({ ...draft, onlySelectedTags: value })}
            />
            <input
              className="explore-range"
              aria-label={t('探索比例', 'Exploration ratio')}
              type="range"
              min="0"
              max="50"
              step="5"
              disabled={draft.onlySelectedTags}
              value={draft.onlySelectedTags ? 0 : draft.exploration}
              onChange={(e) => setDraft({ ...draft, exploration: Number(e.target.value) })}
            />
            <div className="range-labels">
              <span>{t('专注核心兴趣', 'Stay focused')}</span>
              <span>{t('多一点意外收获', 'Explore a little more')}</span>
            </div>
            <div className="preference-tags adjacent-tags">
              {domains
                .filter((d) => !draft.domains.includes(d.id))
                .map((domain) => (
                  <button
                    aria-pressed={draft.relatedDomains.includes(domain.id)}
                    disabled={draft.onlySelectedTags}
                    className={draft.relatedDomains.includes(domain.id) ? 'chosen' : ''}
                    key={domain.id}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        relatedDomains: draft.relatedDomains.includes(domain.id)
                          ? draft.relatedDomains.filter((id) => id !== domain.id)
                          : [...draft.relatedDomains, domain.id],
                      })
                    }
                  >
                    {draft.relatedDomains.includes(domain.id) ? (
                      <Check size={13} />
                    ) : (
                      <Plus size={13} />
                    )}
                    {locale === 'zh' ? domain.label : domain.labelEn}
                  </button>
                ))}
            </div>
            <section className="strategy-mode-picker">
              <div>
                <span>04</span>
                <div>
                  <h3>{t('选择使用方式', 'Choose an experience')}</h3>
                  <p>
                    {draft.strategyMode === 'simple'
                      ? t(
                          '简单模式使用默认策略，只需要选择你想看的方向。',
                          'Simple mode uses the default strategy; you only choose what you want to see.',
                        )
                      : t(
                          '专家模式开放行为权重与运行观测参数。',
                          'Expert mode reveals behavior weights and run-observation controls.',
                        )}
                  </p>
                </div>
              </div>
              <div className="strategy-mode-buttons">
                <button
                  className={draft.strategyMode === 'simple' ? 'chosen' : ''}
                  aria-pressed={draft.strategyMode === 'simple'}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      strategyMode: 'simple',
                      behaviorWeights: { ...defaultBehaviorWeights },
                    })
                  }
                >
                  <Sprout size={15} />
                  <span>
                    <strong>{t('简单模式', 'Simple')}</strong>
                    <small>{t('默认算法 · 推荐', 'Default strategy · Recommended')}</small>
                  </span>
                  {draft.strategyMode === 'simple' && <Check size={15} />}
                </button>
                <button
                  className={draft.strategyMode === 'expert' ? 'chosen' : ''}
                  aria-pressed={draft.strategyMode === 'expert'}
                  onClick={() => setDraft({ ...draft, strategyMode: 'expert' })}
                >
                  <SlidersHorizontal size={15} />
                  <span>
                    <strong>{t('专家模式', 'Expert')}</strong>
                    <small>{t('权重与运行观测', 'Weights & run observations')}</small>
                  </span>
                  {draft.strategyMode === 'expert' && <Check size={15} />}
                </button>
              </div>
            </section>
            {draft.strategyMode === 'expert' && (
              <details className="strategy-settings" open>
                <summary>
                  <SlidersHorizontal size={16} />
                  {t('Agent 调校策略权重', 'Agent gardening strategy weights')}
                  <span>
                    {Math.round(
                      behaviorSignalKeys.reduce((sum, key) => sum + draft.behaviorWeights[key], 0),
                    )}
                  </span>
                  <ChevronDown size={15} />
                </summary>
                <p className="strategy-disclosure">
                  {t(
                    '这些是 Feed Gardener 分配实验预算的可调优先级，会在生成计划时归一化；不是 YouTube 或 B站公开的内部算法权重。真实点赞、收藏和负反馈默认仍不获授权。',
                    'These adjustable priorities allocate Feed Gardener experiment budgets and are normalized when a plan is built. They are not claimed platform algorithm weights. Live likes, saves, and negative feedback remain unauthorized by default.',
                  )}
                </p>
                <div className="strategy-weight-list">
                  {behaviorSignalKeys.map((key) => {
                    const labels: Record<BehaviorSignal, [string, string]> = {
                      nativeSearch: ['原生站内搜索', 'Native search'],
                      watchTime: ['有效播放时间', 'Effective watch time'],
                      completion: ['内容覆盖率', 'Content coverage'],
                      positiveFeedback: ['正向反馈', 'Positive feedback'],
                      save: ['收藏/加入列表', 'Save / add to list'],
                      negativeFeedback: ['负向反馈', 'Negative feedback'],
                      repetition: ['日/周重复强度', 'Daily/weekly repetition'],
                      diversity: ['来源与作者多样性', 'Source and creator diversity'],
                    };
                    return (
                      <label key={key}>
                        <span>{t(labels[key][0], labels[key][1])}</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={draft.behaviorWeights[key]}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              behaviorWeights: {
                                ...draft.behaviorWeights,
                                [key]: Number(event.target.value),
                              },
                            })
                          }
                        />
                        <strong>{draft.behaviorWeights[key]}</strong>
                      </label>
                    );
                  })}
                </div>
                <button
                  className="secondary-button strategy-reset"
                  onClick={() =>
                    setDraft({ ...draft, behaviorWeights: { ...defaultBehaviorWeights } })
                  }
                >
                  <RefreshCw size={14} />
                  {t('恢复默认权重', 'Restore defaults')}
                </button>
              </details>
            )}
            <details className="exclusion-settings">
              <summary>
                <ShieldCheck size={16} />
                {t('不想看的内容与来源', 'Topics and sources to exclude')}
                <span>{draft.blockedTags.length + draft.blockedSources.length}</span>
                <ChevronDown size={15} />
              </summary>
              <label>{t('屏蔽整个来源', 'Block a platform')}</label>
              <div className="preference-tags">
                {(['YouTube', 'Bluesky', 'RSS'] as Source[]).map((s) => (
                  <button
                    key={s}
                    aria-pressed={draft.blockedSources.includes(s)}
                    className={draft.blockedSources.includes(s) ? 'blocked' : ''}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        blockedSources: draft.blockedSources.includes(s)
                          ? draft.blockedSources.filter((id) => id !== s)
                          : [...draft.blockedSources, s],
                      })
                    }
                  >
                    {draft.blockedSources.includes(s) ? <X size={13} /> : <Plus size={13} />}
                    {s}
                  </button>
                ))}
              </div>
              <label>{t('屏蔽主题（优先于喜欢）', 'Block topics (overrides likes)')}</label>
              <div className="preference-tags">
                {allTags.map((tag) => (
                  <button
                    key={tag.id}
                    aria-pressed={draft.blockedTags.includes(tag.id)}
                    className={draft.blockedTags.includes(tag.id) ? 'blocked' : ''}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        blockedTags: draft.blockedTags.includes(tag.id)
                          ? draft.blockedTags.filter((id) => id !== tag.id)
                          : [...draft.blockedTags, tag.id],
                      })
                    }
                  >
                    {draft.blockedTags.includes(tag.id) ? <X size={12} /> : <Plus size={12} />}
                    {locale === 'zh' ? tag.label : tag.labelEn}
                  </button>
                ))}
              </div>
              {draft.blockedSources
                .filter((s) => !sources.includes(s as Source))
                .map((s) => (
                  <button
                    className="unblock-button"
                    key={s}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        blockedSources: draft.blockedSources.filter((id) => id !== s),
                      })
                    }
                  >
                    {s}
                    <X size={13} />
                    {t('解除屏蔽', 'Unblock')}
                  </button>
                ))}
            </details>
          </div>
          <div className="modal-footer">
            <span>{t('保存在当前浏览器', 'Saved in this browser')}</span>
            <button
              className="primary-button"
              disabled={draft.domains.length === 0}
              onClick={() => {
                setPreferences({
                  ...draft,
                  behaviorWeights: normalizeBehaviorWeights(draft.behaviorWeights),
                  version: preferences.version + 1,
                });
                setDraft(null);
                setActiveTopic('all');
                setToast(
                  t(
                    '兴趣已更新，新发现正在生长',
                    'Interests updated. New discoveries are taking root.',
                  ),
                );
              }}
            >
              <Check size={16} />
              {t('保存，让发现开始', 'Save my interests')}
            </button>
          </div>
        </Modal>
      )}
      {detail && (
        <Modal
          title={t('一次值得了解的发现', 'A closer look')}
          closeLabel={t('关闭', 'Close')}
          onClose={() => setDetail(null)}
          drawer
        >
          <div className="detail-body">
            <div className={`detail-material material-stage card-${detail.art}`}>
              <span className="material-texture" aria-hidden="true">
                <i className="material-form form-a" />
                <i className="material-form form-b" />
                <i className="material-form form-c" />
              </span>
              <span className="material-badge">{detail.source}</span>
              <span className="material-duration">{formatDuration(detail.duration)}</span>
            </div>
            <div className="detail-source">
              <SourceIcon source={detail.source} />
              {detail.source}
              <span>·</span>
              {detail.creator}
              <span>·</span>
              {formatDuration(detail.duration)}
            </div>
            <h2>{locale === 'zh' ? detail.title : detail.titleEn}</h2>
            <p>{locale === 'zh' ? detail.summary : detail.summaryEn}</p>
            <div className="detail-disclosure">
              <FlaskConical size={17} />
              <div>
                <strong>
                  {t('合成内容 · 交互示例', 'Synthetic content · Interactive example')}
                </strong>
                <p>{t('无真实视频', 'No real video')}</p>
              </div>
            </div>
            <div className="why-box">
              <h3>
                <Sparkles size={17} />
                {t('为什么推荐给你', 'Why this is in your feed')}
              </h3>
              {(locale === 'zh' ? detail.reasons : detail.reasonsEn).map((reason, i) => (
                <p key={i}>
                  <Check size={14} />
                  {reason}
                </p>
              ))}
            </div>
            <div className="detail-actions">
              <button className="primary-button" onClick={() => toggleSaved(detail.id)}>
                <Bookmark size={16} fill={saved.includes(detail.id) ? 'currentColor' : 'none'} />
                {saved.includes(detail.id)
                  ? t('已收藏', 'Saved')
                  : t('收藏，稍后阅读', 'Save for later')}
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  setFeedback((prev) => [
                    ...prev.filter(
                      (f) => !(f.contentId === detail.id && f.event === 'explicit_positive'),
                    ),
                    {
                      contentId: detail.id,
                      actor: 'user',
                      event: 'explicit_positive',
                      at: new Date().toISOString(),
                    },
                  ]);
                  setToast(
                    t(
                      '已记录喜欢。你的手选偏好保持不变。',
                      'Like recorded. Your explicit preferences are preserved.',
                    ),
                  );
                }}
              >
                <ThumbsUp size={16} />
                {feedback.some((f) => f.contentId === detail.id && f.event === 'explicit_positive')
                  ? t('已喜欢', 'Liked')
                  : t('喜欢', 'Like')}
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  setNegative(detail);
                  setDetail(null);
                }}
              >
                <ThumbsDown size={16} />
                {t('不适合我', 'Not for me')}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {negative && (
        <Modal
          title={t('这条内容哪里不适合？', 'What did not fit?')}
          closeLabel={t('关闭', 'Close')}
          onClose={() => setNegative(null)}
        >
          <div className="feedback-options">
            {[
              ['irrelevant_topic', '与兴趣无关', 'Not relevant'],
              ['too_beginner', '内容太基础', 'Too introductory'],
              ['too_advanced', '内容太深入', 'Too advanced'],
              ['too_promotional', '推广内容太多', 'Too promotional'],
              ['already_known', '已经了解了', 'Already familiar'],
            ].map(([id, zh, en]) => (
              <button key={id} onClick={() => submitNegative(id)}>
                {t(zh, en)}
                <ChevronRight size={15} />
              </button>
            ))}
            <button className="danger-text" onClick={() => blockCreator(negative.creator)}>
              {t(`屏蔽 ${negative.creator}`, `Block ${negative.creator}`)}
              <X size={15} />
            </button>
          </div>
        </Modal>
      )}
      {resetConfirm && (
        <Modal
          title={t('清除这个演示空间？', 'Clear this demo space?')}
          closeLabel={t('关闭', 'Close')}
          onClose={() => setResetConfirm(false)}
        >
          <div className="reset-content">
            <p>{t('清除当前浏览器中的演示数据。', 'Clear demo data in this browser.')}</p>
            <button className="secondary-button" onClick={() => setResetConfirm(false)}>
              {t('保留数据', 'Keep my data')}
            </button>
            <button
              className="primary-button"
              onClick={() => {
                try {
                  Object.keys(localStorage)
                    .filter((key) => key.startsWith('feed-gardener'))
                    .forEach((key) => localStorage.removeItem(key));
                } catch {
                  setToast(
                    t(
                      '无法清除浏览器存储，请在浏览器设置中清理。',
                      'Cannot clear browser storage. Please use browser settings.',
                    ),
                  );
                  return;
                }
                setPreferences(englishDefaultPreferences());
                setOnboardingWantedTags([]);
                setOnboardingBlockedTags([]);
                setOnboardingDirection('forward');
                setOnboardingStep('intro');
                setSaved([]);
                setHidden([]);
                setFeedback([]);
                setResources([]);
                setFeederEvents([]);
                setResetConfirm(false);
                setToast(t('演示空间已重置', 'Your demo space has been reset'));
              }}
            >
              {t('确认清除', 'Clear demo data')}
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCheck size={18} />
          {toast}
          <button onClick={() => setToast('')} aria-label={t('关闭通知', 'Dismiss notification')}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

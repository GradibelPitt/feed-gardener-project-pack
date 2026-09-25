'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  Check,
  CheckCheck,
  ChevronDown,
  Code2,
  Compass,
  Cpu,
  Globe2,
  Layers3,
  Menu,
  Plus,
  Radio,
  ShieldCheck,
  Sprout,
  Trash2,
  X,
} from 'lucide-react';
import ResourceLibrary from '@/components/ResourceLibrary';
import WorkspaceSidebar, { type WorkspacePage } from '@/components/WorkspaceSidebar';
import FeederWorkspace from '@/components/FeederWorkspace';
import SelectedTagsToggle from '@/components/SelectedTagsToggle';
import YouTubeConnection from '@/components/YouTubeConnection';
import { readApiData } from '@/lib/api-contract';
import { defaultPreferences, domains, type CustomTag, type Preferences } from '@/lib/feed';
import { visibleInterfaceLocale } from '@/lib/locale';
import { normalizeBehaviorWeights, type BehaviorSignal } from '@/lib/strategy';
import type { TagSuggestion } from '@/lib/tag-suggestions';
import {
  readResourceCollections,
  readResourceRecords,
  resourceFromHarvest,
  resourceUrlKey,
  type ResourceCollection,
  type ResourceRecord,
} from '@/lib/resources';
import type { HarvestItem } from '@/lib/crawler/types';
import { matchedHarvestTagIds, readFeederEvents, readTagJev, type FeederEvent } from '@/lib/feeder';

type Page = WorkspacePage;
const STORAGE = 'feed-gardener-demo-v1';
const RESOURCES_STORAGE = 'feed-gardener-resources-v1';
const COLLECTIONS_STORAGE = 'feed-gardener-collections-v1';
const EVENTS_STORAGE = 'feed-gardener-events-v1';
const knownSources = [
  'YouTube',
  'Bilibili',
  'TikTok',
  'Instagram',
  'X',
  'arXiv',
  'GitHub',
  'Hacker News',
];
const visibleSources = knownSources.filter(
  (source) => !['TikTok', 'Instagram', 'X'].includes(source),
);
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
const customTagName = (tag: CustomTag, readingLanguage: Preferences['readingLanguage']) => {
  if (readingLanguage === 'en') return tag.labelEn;
  if (readingLanguage === 'zh')
    return tag.translationStatus === 'translated' ? tag.labelZh : `${tag.labelEn}（原文）`;
  return tag.translationStatus === 'translated' && tag.labelZh !== tag.labelEn
    ? `${tag.labelZh} / ${tag.labelEn}`
    : tag.labelEn;
};

function englishDefaultPreferences(): Preferences {
  return {
    ...structuredClone(defaultPreferences),
    domains: [],
    tags: [],
    customTags: [],
    relatedDomains: [],
    readingLanguage: 'en',
  };
}

function readStoredSlice(key: string, fallback: unknown): unknown {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
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
            ((value.source === 'manual' && value.id.startsWith('manual:')) ||
              (value.id.startsWith('live:github:') &&
                typeof value.evidenceUrl === 'string' &&
                value.evidenceUrl.startsWith('https://github.com/'))) &&
            typeof value.label === 'string' &&
            value.label.trim().length > 0,
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
          source: value.source === 'manual' ? 'manual' : 'github_live',
          evidenceUrl: value.source === 'manual' ? '' : String(value.evidenceUrl),
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
    blockedSources: strings(raw.blockedSources).filter((source) => knownSources.includes(source)),
    blockedTags: strings(raw.blockedTags).filter((id) => allTags.some((t) => t.id === id)),
    version:
      typeof raw.version === 'number' && Number.isFinite(raw.version)
        ? Math.max(1, Math.floor(raw.version))
        : 1,
  };
}

function Modal({
  children,
  title,
  closeLabel,
  onClose,
  wide = false,
}: {
  children: React.ReactNode;
  title: string;
  closeLabel: string;
  onClose: () => void;
  wide?: boolean;
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
      className={`modal ${wide ? 'modal-wide' : ''}`}
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
  const [customTagInput, setCustomTagInput] = useState('');
  const [customTagError, setCustomTagError] = useState('');
  const [page, setPage] = useState<Page>('discover');
  const [preferences, setPreferences] = useState<Preferences>(englishDefaultPreferences);
  const [resources, setResources] = useState<ResourceRecord[]>([]);
  const [collections, setCollections] = useState<ResourceCollection[]>([]);
  const [feederEvents, setFeederEvents] = useState<FeederEvent[]>([]);
  const [draft, setDraft] = useState<Preferences | null>(null);
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestion[]>([]);
  const [tagSuggestionStatus, setTagSuggestionStatus] = useState<
    'idle' | 'loading' | 'live' | 'degraded'
  >('idle');
  const [tagSuggestionWarning, setTagSuggestionWarning] = useState('');
  const [toast, setToast] = useState('');
  const [ready, setReady] = useState(false);
  const [splitStorageReady, setSplitStorageReady] = useState(false);
  const [youtubeOutcome, setYoutubeOutcome] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [offline, setOffline] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);

  useEffect(() => {
    try {
      const stored = readStoredSlice(STORAGE, null) as Record<string, unknown> | null;
      if (stored && typeof stored === 'object') {
        const savedPreferences = readPreferences(stored.preferences);
        if (stored.onboardingCompleted === false) {
          const pendingTags = Array.isArray(stored.onboardingWantedTags)
            ? stored.onboardingWantedTags.filter(
                (id): id is string =>
                  typeof id === 'string' && allTags.some((tag) => tag.id === id),
              )
            : [];
          const pendingCustom = readPreferences({
            customTags: stored.onboardingCustomTags,
          }).customTags;
          if (pendingTags.length || pendingCustom.length) {
            savedPreferences.tags = [...new Set([...savedPreferences.tags, ...pendingTags])];
            savedPreferences.domains = [
              ...new Set([
                ...savedPreferences.domains,
                ...domains
                  .filter((domain) => domain.tags.some((tag) => pendingTags.includes(tag.id)))
                  .map((domain) => domain.id),
              ]),
            ];
            savedPreferences.customTags = [
              ...savedPreferences.customTags,
              ...pendingCustom.filter(
                (tag) => !savedPreferences.customTags.some((saved) => saved.id === tag.id),
              ),
            ].slice(0, 12);
          }
        }
        setPreferences(savedPreferences);
        if (
          typeof stored.page === 'string' &&
          ['discover', 'library', 'saved', 'garden', 'connections'].includes(stored.page)
        ) {
          setPage(stored.page as Page);
        }
      }
      const legacy = stored && typeof stored === 'object' ? stored : {};
      const resourceSlice = readStoredSlice(RESOURCES_STORAGE, legacy.resources);
      const collectionSlice = readStoredSlice(COLLECTIONS_STORAGE, legacy.collections);
      const eventSlice = readStoredSlice(EVENTS_STORAGE, legacy.feederEvents);
      const savedCollections = readResourceCollections(collectionSlice);
      const savedResources = readResourceRecords(
        Array.isArray(resourceSlice) ? resourceSlice : legacy.resources,
      ).map((resource) => ({
        ...resource,
        collectionId: savedCollections.some((collection) => collection.id === resource.collectionId)
          ? resource.collectionId
          : null,
      }));
      const savedEvents = readFeederEvents(
        Array.isArray(eventSlice) ? eventSlice : legacy.feederEvents,
      );
      setResources(savedResources);
      setCollections(savedCollections);
      setFeederEvents(savedEvents);
      try {
        localStorage.setItem(RESOURCES_STORAGE, JSON.stringify(savedResources));
        localStorage.setItem(COLLECTIONS_STORAGE, JSON.stringify(savedCollections));
        localStorage.setItem(EVENTS_STORAGE, JSON.stringify(savedEvents));
        setSplitStorageReady(true);
      } catch {
        setToast(
          'Storage is full. Existing saved data is intact, but new changes stay in this session.',
        );
      }
    } catch {
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
    if (ready && splitStorageReady) {
      try {
        localStorage.setItem(
          STORAGE,
          JSON.stringify({
            preferences,
            localePreference: visibleInterfaceLocale,
            onboardingCompleted: true,
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
  }, [preferences, page, ready, splitStorageReady]);
  useEffect(() => {
    if (!ready || !splitStorageReady) return;
    try {
      localStorage.setItem(RESOURCES_STORAGE, JSON.stringify(resources));
    } catch {
      setToast('Saved items could not be stored. Export your data before closing this session.');
    }
  }, [resources, ready, splitStorageReady]);
  useEffect(() => {
    if (!ready || !splitStorageReady) return;
    try {
      localStorage.setItem(COLLECTIONS_STORAGE, JSON.stringify(collections));
    } catch {
      setToast('Collections could not be stored. Export your data before closing this session.');
    }
  }, [collections, ready, splitStorageReady]);
  useEffect(() => {
    if (!ready || !splitStorageReady) return;
    try {
      localStorage.setItem(EVENTS_STORAGE, JSON.stringify(feederEvents));
    } catch {
      setToast('Feedback could not be stored. Export your data before closing this session.');
    }
  }, [feederEvents, ready, splitStorageReady]);
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
      } catch {
        if (controller.signal.aborted) return;
        setTagSuggestions([]);
        setTagSuggestionStatus('degraded');
        setTagSuggestionWarning(
          t(
            '联网标签建议暂时不可用，仍可使用内置标签。',
            'Live tag suggestions are unavailable. Built-in topics still work.',
          ),
        );
      }
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [tagSuggestionQuery]);

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
  };
  const editPreferences = () => {
    setCustomTagInput('');
    setCustomTagError('');
    setDraft(structuredClone(preferences));
  };
  const manageInterests = () => {
    navigate('discover');
    editPreferences();
  };
  const exportData = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            schema: 'feed-gardener-demo/1',
            preferences,
            resources,
            collections,
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
  if (!ready) {
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

  return (
    <div className="app-shell">
      <WorkspaceSidebar
        page={page}
        t={t}
        mobileOpen={mobileNav}
        onNavigate={navigate}
        onCloseMobile={() => setMobileNav(false)}
      />
      <div className="main-shell">
        <button
          className="mobile-menu icon-button"
          onClick={() => setMobileNav(true)}
          aria-label={t('打开导航', 'Open navigation')}
        >
          <Menu size={21} />
        </button>
        {offline && (
          <div className="offline-banner">
            <Radio size={16} />
            {t(
              '当前离线。已保存内容仍可浏览，更改保存在本机。',
              'You are offline. Saved items and local changes remain available.',
            )}
          </div>
        )}
        {page === 'discover' || page === 'garden' ? (
          <main className="discover-page">
            <FeederWorkspace
              page={page}
              locale={locale}
              preferences={preferences}
              resources={resources}
              events={feederEvents}
              onSaveResource={saveResource}
              onRecordEvent={(event) =>
                setFeederEvents((current) => [...current, event].slice(-500))
              }
              onUndoEvent={(id) =>
                setFeederEvents((current) => current.filter((event) => event.id !== id))
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
                  name: 'Bilibili',
                  mark: 'B站',
                  statusZh: '公开源',
                  statusEn: 'Public source',
                  live: true,
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
        ) : page === 'library' || page === 'saved' ? (
          <ResourceLibrary
            mode={page === 'saved' ? 'saved' : 'library'}
            locale={locale}
            resources={resources}
            collections={collections}
            t={t}
            onCreateCollection={(collection) =>
              setCollections((previous) => [...previous, collection])
            }
            onRenameCollection={(id, name) =>
              setCollections((previous) =>
                previous.map((collection) =>
                  collection.id === id ? { ...collection, name } : collection,
                ),
              )
            }
            onDeleteCollection={(id) => {
              setCollections((previous) => previous.filter((collection) => collection.id !== id));
              setResources((previous) =>
                previous.map((resource) =>
                  resource.collectionId === id ? { ...resource, collectionId: null } : resource,
                ),
              );
            }}
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
              const resource = resources.find((item) => item.id === id);
              const key = resource && resourceUrlKey(resource.url);
              setResources((previous) => previous.filter((resource) => resource.id !== id));
              if (key) {
                setFeederEvents((previous) =>
                  previous.filter((event) => event.itemKey !== key || event.signal !== 'save'),
                );
              }
              setToast(t('已移出资源库', 'Removed from the resource library'));
            }}
            onOpen={(resource) => {
              const key = resourceUrlKey(resource.url);
              if (!key) return;
              const event: FeederEvent = {
                id: crypto.randomUUID(),
                actor: 'user',
                itemKey: key,
                signal: 'open',
                tagIds: matchedHarvestTagIds({ tags: resource.tags }),
                source: resource.source,
                author: resource.author,
                at: new Date().toISOString(),
              };
              setFeederEvents((previous) => [...previous, event].slice(-500));
            }}
            onDiscover={() => navigate('discover')}
          />
        ) : null}
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
                    <small>{tag.source === 'manual' ? 'YOUR TAG' : 'LIVE'}</small>
                    <X size={12} />
                  </button>
                ))}
              </div>
            )}
            <form
              className="console-custom-tag-form"
              onSubmit={(event) => {
                event.preventDefault();
                const label = customTagInput.trim().replace(/\s+/g, ' ');
                const normalized = label.toLocaleLowerCase();
                if (!label || label.length > 80) {
                  setCustomTagError('Enter a tag with 1–80 characters.');
                  return;
                }
                if (
                  allTags.some(
                    (tag) =>
                      tag.labelEn.toLocaleLowerCase() === normalized ||
                      tag.label.toLocaleLowerCase() === normalized,
                  ) ||
                  draft.customTags.some((tag) => tag.labelEn.toLocaleLowerCase() === normalized)
                ) {
                  setCustomTagError('That tag already exists. Select it above.');
                  return;
                }
                if (draft.customTags.length >= 12) {
                  setCustomTagError('You can add up to 12 custom tags.');
                  return;
                }
                setDraft({
                  ...draft,
                  customTags: [
                    ...draft.customTags,
                    {
                      id: `manual:${encodeURIComponent(normalized)}`,
                      label,
                      labelEn: label,
                      labelZh: label,
                      translationStatus: 'source_label',
                      source: 'manual',
                      evidenceUrl: '',
                    },
                  ],
                });
                setCustomTagInput('');
                setCustomTagError('');
              }}
            >
              <label htmlFor="console-custom-tag">Can’t find a tag? Add your own</label>
              <div>
                <input
                  id="console-custom-tag"
                  value={customTagInput}
                  maxLength={80}
                  onChange={(event) => {
                    setCustomTagInput(event.target.value);
                    setCustomTagError('');
                  }}
                  placeholder="e.g. Indie game design"
                />
                <button type="submit" className="secondary-button">
                  <Plus size={15} /> Add tag
                </button>
              </div>
              {customTagError && <p role="alert">{customTagError}</p>}
            </form>
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
            <details className="exclusion-settings">
              <summary>
                <ShieldCheck size={16} />
                {t('不想看的内容与来源', 'Topics and sources to exclude')}
                <span>
                  {draft.blockedTags.length +
                    draft.blockedSources.filter((source) => visibleSources.includes(source)).length}
                </span>
                <ChevronDown size={15} />
              </summary>
              <label>{t('屏蔽整个来源', 'Block a platform')}</label>
              <div className="preference-tags">
                {visibleSources.map((s) => (
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
                .filter((s) => !knownSources.includes(s))
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
              disabled={draft.domains.length === 0 && draft.customTags.length === 0}
              onClick={() => {
                setPreferences({
                  ...draft,
                  behaviorWeights: normalizeBehaviorWeights(draft.behaviorWeights),
                  version: preferences.version + 1,
                });
                setDraft(null);
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
                setResources([]);
                setCollections([]);
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

'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Bookmark,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Code2,
  ExternalLink,
  FileSearch,
  LoaderCircle,
  MessageCircle,
  Newspaper,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
} from 'lucide-react';
import type {
  FeedSection,
  HarvestItem,
  HarvestPayload,
  LiveSource,
  SourceHealth,
} from '@/lib/crawler/types';
import { mergeHarvestPayload } from '@/lib/crawler/merge';
import { readApiData } from '@/lib/api-contract';
import type { Locale } from '@/lib/locale';
import { matchesHarvestPreferences, type Preferences } from '@/lib/feed';

type Props = {
  locale: Locale;
  interestLabels: string[];
  preferences: Preferences;
  initialPayload?: HarvestPayload | null;
  onHarvested?: (payload: HarvestPayload) => void;
  onSocialImport?: (item: HarvestItem) => void;
  t: (zh: string, en: string) => string;
  savedResourceIds: string[];
  onSaveResource: (item: HarvestItem) => void;
};

const SOCIAL_STORAGE = 'feed-gardener-social-imports-v1';
const sectionSources: Record<FeedSection, LiveSource[]> = {
  social: ['TikTok', 'Instagram', 'X', 'YouTube'],
  academic: ['arXiv'],
  opensource: ['GitHub', 'Hacker News'],
};
const urlSources = new Set<LiveSource>(['TikTok', 'Instagram', 'X']);
const sourcePrompt: Record<LiveSource, string> = {
  TikTok: 'Select to import a public URL',
  Instagram: 'Select to import a public URL',
  X: 'Select to import a public URL',
  YouTube: 'Select to fetch videos',
  arXiv: 'Select to fetch papers',
  GitHub: 'Select to fetch repositories',
  'Hacker News': 'Select to fetch stories',
};

const sectionMeta: Array<{
  id: FeedSection;
  icon: typeof Share2;
  zh: string;
  en: string;
  eyebrow: string;
}> = [
  {
    id: 'social',
    icon: Share2,
    zh: '社交雷达',
    en: 'Social radar',
    eyebrow: 'SOCIAL SIGNALS',
  },
  {
    id: 'academic',
    icon: BookOpen,
    zh: '学术前沿',
    en: 'Research frontier',
    eyebrow: 'ACADEMIC LENS',
  },
  {
    id: 'opensource',
    icon: Code2,
    zh: '开源社区',
    en: 'Open-source community',
    eyebrow: 'BUILD IN PUBLIC',
  },
];

const sourceMark: Record<LiveSource, string> = {
  YouTube: 'YT',
  TikTok: 'TT',
  Instagram: 'IG',
  X: 'X',
  arXiv: 'AX',
  GitHub: 'GH',
  'Hacker News': 'HN',
};

function relativeDate(value: string | null, locale: Locale): string {
  if (!value) return locale === 'zh' ? '时间未提供' : 'Date unavailable';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return locale === 'zh' ? '时间未提供' : 'Date unavailable';
  const hours = Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000));
  if (hours < 1) return locale === 'zh' ? '刚刚' : 'Just now';
  if (hours < 24) return locale === 'zh' ? `${hours} 小时前` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return locale === 'zh' ? `${days} 天前` : `${days}d ago`;
}

function healthText(health: SourceHealth, locale: Locale): string {
  return locale === 'zh' ? health.label : health.labelEn;
}

function urlMatchesSource(value: string, source: LiveSource): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (source === 'TikTok') return host === 'tiktok.com' || host.endsWith('.tiktok.com');
    if (source === 'Instagram') return host === 'instagram.com' || host.endsWith('.instagram.com');
    if (source === 'X')
      return [
        'x.com',
        'www.x.com',
        'twitter.com',
        'www.twitter.com',
        'mobile.twitter.com',
      ].includes(host);
    return false;
  } catch {
    return false;
  }
}

export function readSocialImports(): HarvestItem[] {
  try {
    const stored = JSON.parse(localStorage.getItem(SOCIAL_STORAGE) || '[]') as unknown;
    if (!Array.isArray(stored)) return [];
    return stored.filter((item): item is HarvestItem =>
      Boolean(
        item &&
        typeof item === 'object' &&
        (item as HarvestItem).section === 'social' &&
        typeof (item as HarvestItem).url === 'string',
      ),
    );
  } catch {
    return [];
  }
}

function ItemCard({
  item,
  locale,
  saved,
  onSave,
}: {
  item: HarvestItem;
  locale: Locale;
  saved: boolean;
  onSave: () => void;
}) {
  const metric = item.metrics?.stars
    ? `★ ${item.metrics.stars.toLocaleString()}`
    : item.metrics?.score
      ? `${item.metrics.score} pts`
      : null;
  return (
    <article className="source-item">
      <div className={`source-stamp source-stamp-${item.source.toLowerCase().replace(/\s/g, '-')}`}>
        {sourceMark[item.source]}
      </div>
      <div className="source-item-main">
        {item.source === 'YouTube' && item.embedUrl ? (
          <iframe
            className="source-item-embed"
            src={item.embedUrl}
            title={`YouTube: ${item.title}`}
            loading="lazy"
            allow="encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : item.imageUrl ? (
          <img className="source-item-cover" src={item.imageUrl} alt="" loading="lazy" />
        ) : null}
        <div className="source-item-meta">
          <span>{item.source}</span>
          <i />
          <span>{relativeDate(item.publishedAt, locale)}</span>
          {metric && (
            <>
              <i />
              <span>{metric}</span>
            </>
          )}
        </div>
        <h3>{item.title}</h3>
        <p>{item.summary}</p>
        <div className="source-item-bottom">
          <div className="source-tags">
            <span className="domain-chip">{item.domain}</span>
            {item.tags
              .filter((tag) => tag !== item.source)
              .slice(0, 3)
              .map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
          </div>
          <a href={item.url} target="_blank" rel="noreferrer">
            {locale === 'zh' ? '查看原文' : 'Open source'} <ExternalLink size={13} />
          </a>
          <button
            className={saved ? 'source-save saved' : 'source-save'}
            onClick={onSave}
            aria-label={
              saved
                ? locale === 'zh'
                  ? '已收藏到资源库'
                  : 'Saved to resource library'
                : locale === 'zh'
                  ? '收藏到资源库'
                  : 'Save to resource library'
            }
          >
            <Bookmark size={13} fill={saved ? 'currentColor' : 'none'} />
            {saved ? (locale === 'zh' ? '已入库' : 'Saved') : locale === 'zh' ? '收藏' : 'Save'}
          </button>
        </div>
      </div>
    </article>
  );
}

export default function SourceBoards({
  locale,
  interestLabels,
  preferences,
  initialPayload,
  onHarvested,
  onSocialImport,
  t,
  savedResourceIds,
  onSaveResource,
}: Props) {
  const [active, setActive] = useState<FeedSection>('social');
  const [selectedSource, setSelectedSource] = useState<LiveSource | null>(null);
  const [payload, setPayload] = useState<HarvestPayload | null>(initialPayload ?? null);
  const [loadingSource, setLoadingSource] = useState<LiveSource | null>(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [socialUrl, setSocialUrl] = useState('');
  const [socialImports, setSocialImports] = useState<HarvestItem[]>([]);
  const [socialBusy, setSocialBusy] = useState(false);
  const [socialError, setSocialError] = useState('');
  const [youtubeApiKey, setYoutubeApiKey] = useState('');
  const [youtubeKeyBusy, setYoutubeKeyBusy] = useState(false);
  const [youtubeKeyError, setYoutubeKeyError] = useState('');
  const [jevFallbackOpen, setJevFallbackOpen] = useState(false);

  const loadSource = async (source: LiveSource, refresh = false) => {
    setLoadingSource(source);
    setLoadError('');
    try {
      const params = new URLSearchParams();
      params.set('source', source);
      if (refresh) params.set('refresh', 'true');
      interestLabels.slice(0, 2).forEach((tag) => params.append('tag', tag));
      const response = await fetch(`/api/harvest?${params}`, {
        cache: 'no-store',
      });
      const incoming = await readApiData<HarvestPayload>(response);
      setPayload((current) => mergeHarvestPayload(current, incoming));
      onHarvested?.(incoming);
    } catch (error) {
      setLoadError(
        t(
          `实时来源暂时不可用：${error instanceof Error ? error.message : String(error)}`,
          `Live sources are temporarily unavailable: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    } finally {
      setLoadingSource(null);
    }
  };

  const selectSource = (source: LiveSource) => {
    setSelectedSource(source);
    setQuery('');
    setLoadError('');
    setSocialError('');
    setYoutubeApiKey('');
    setYoutubeKeyError('');
    if (!urlSources.has(source)) void loadSource(source);
  };

  useEffect(() => {
    setSocialImports(readSocialImports());
  }, []);

  const sectionItems =
    selectedSource === null
      ? []
      : [
          ...(payload?.sections[active] ?? []),
          ...(active === 'social' ? socialImports : []),
        ].filter((item) => item.source === selectedSource);
  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sectionItems.filter(
      (item) =>
        matchesHarvestPreferences(item, preferences) &&
        (!needle ||
          [item.title, item.summary, item.author, item.source, item.domain, ...item.tags]
            .join(' ')
            .toLowerCase()
            .includes(needle)),
    );
  }, [query, sectionItems, preferences]);
  const health = payload?.health.filter((item) => item.section === active) ?? [];
  const selectedHealth = health.find((item) => item.source === selectedSource);
  const activeMeta = sectionMeta.find((section) => section.id === active) ?? sectionMeta[0];
  const crawlerNeedsAttention =
    active !== 'social' && (Boolean(loadError) || selectedHealth?.state === 'error');

  const configureYouTube = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!youtubeApiKey.trim() || youtubeKeyBusy) return;
    setYoutubeKeyBusy(true);
    setYoutubeKeyError('');
    try {
      const response = await fetch('/api/harvest', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ source: 'YouTube', apiKey: youtubeApiKey.trim() }),
      });
      await readApiData<{ configured: boolean }>(response);
      setYoutubeApiKey('');
      await loadSource('YouTube', true);
    } catch (error) {
      setYoutubeKeyError(
        error instanceof Error ? error.message : t('保存失败', 'Could not save key'),
      );
    } finally {
      setYoutubeKeyBusy(false);
    }
  };

  const importSocial = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!socialUrl.trim() || !selectedSource || !urlSources.has(selectedSource)) return;
    if (!urlMatchesSource(socialUrl.trim(), selectedSource)) {
      setSocialError(`Enter a public ${selectedSource} HTTPS post URL.`);
      return;
    }
    setSocialBusy(true);
    setSocialError('');
    try {
      const response = await fetch('/api/social/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: socialUrl.trim() }),
      });
      const result = await readApiData<{ item: HarvestItem }>(response);
      const next = [
        result.item,
        ...socialImports.filter((item) => item.url !== result.item?.url),
      ].slice(0, 30);
      setSocialImports(next);
      localStorage.setItem(SOCIAL_STORAGE, JSON.stringify(next));
      onSocialImport?.(result.item);
      setSocialUrl('');
    } catch (error) {
      setSocialError(error instanceof Error ? error.message : t('导入失败', 'Import failed'));
    } finally {
      setSocialBusy(false);
    }
  };

  return (
    <div className="discovery-gallery source-boards">
      <header className="source-hero">
        <div>
          <span className="source-hero-kicker">
            <Sparkles size={13} /> LIVE PUBLIC-SOURCE WORKBENCH
          </span>
          <h1>{t('发现', 'Discover')}</h1>
        </div>
      </header>

      <section className="source-section-grid" aria-label={t('内容板块', 'Content sections')}>
        {sectionMeta.map((section) => {
          const Icon = section.icon;
          const count = (
            section.id === 'social'
              ? [...(payload?.sections.social ?? []), ...socialImports]
              : (payload?.sections[section.id] ?? [])
          ).filter((item) => matchesHarvestPreferences(item, preferences)).length;
          const sectionHealth = payload?.health.filter((item) => item.section === section.id) ?? [];
          const hasError = sectionHealth.some((item) => item.state === 'error');
          return (
            <button
              key={section.id}
              className={`source-section-card source-section-${section.id} ${active === section.id ? 'active' : ''}`}
              onClick={() => {
                setActive(section.id);
                setSelectedSource(null);
                setQuery('');
                setJevFallbackOpen(false);
                setYoutubeApiKey('');
                setYoutubeKeyError('');
              }}
              aria-pressed={active === section.id}
            >
              <span className="section-card-top">
                <Icon size={20} />
                <em>{section.eyebrow}</em>
                <ArrowUpRight size={16} />
              </span>
              <strong>{t(section.zh, section.en)}</strong>
              <span className="section-card-count">
                <b>{count}</b> {t('条可浏览', 'items ready')}
                <i className={hasError ? 'degraded' : ''} />
              </span>
            </button>
          );
        })}
      </section>

      <section className="source-board">
        <header className="source-board-heading">
          <div>
            <span>{activeMeta.eyebrow}</span>
            <h2>{t(activeMeta.zh, activeMeta.en)}</h2>
          </div>
          {(active !== 'social' || (selectedSource && !urlSources.has(selectedSource))) && (
            <div className="source-board-actions">
              {active !== 'social' && (
                <button
                  className={`source-jev-fallback ${crawlerNeedsAttention ? 'needs-attention' : ''}`}
                  type="button"
                  aria-expanded={jevFallbackOpen}
                  aria-controls="jev-fallback-note"
                  onClick={() => setJevFallbackOpen((open) => !open)}
                >
                  <Sparkles size={13} />
                  <span>Jev scoring</span>
                  <small>{t('预留', 'reserved')}</small>
                </button>
              )}
              {selectedSource && !urlSources.has(selectedSource) && (
                <button
                  className="source-refresh"
                  type="button"
                  disabled={loadingSource !== null || youtubeKeyBusy}
                  onClick={() => void loadSource(selectedSource, true)}
                >
                  <RefreshCw size={15} className={loadingSource ? 'spinning' : ''} />
                  {loadingSource
                    ? t('正在刷新', 'Refreshing')
                    : t('刷新该来源', 'Refresh this source')}
                </button>
              )}
            </div>
          )}
        </header>

        <div className="source-health-row">
          {sectionSources[active].map((source) => {
            const item = health.find((entry) => entry.source === source);
            return (
              <button
                type="button"
                className={`source-health ${item ? `source-health-${item.state}` : 'source-health-idle'} ${selectedSource === source ? 'source-health-active' : ''}`}
                key={source}
                aria-pressed={selectedSource === source}
                disabled={loadingSource !== null || youtubeKeyBusy}
                onClick={() => selectSource(source)}
              >
                <span className="health-mark">{sourceMark[source]}</span>
                <span className="source-health-copy">
                  <strong>{source}</strong>
                  <small>{item ? healthText(item, locale) : sourcePrompt[source]}</small>
                </span>
                {loadingSource === source ? (
                  <LoaderCircle size={15} className="spinning" />
                ) : item && (item.state === 'live' || item.state === 'limited') ? (
                  <CheckCircle2 size={15} />
                ) : item ? (
                  <CircleAlert size={15} />
                ) : (
                  <ArrowUpRight size={15} />
                )}
              </button>
            );
          })}
        </div>

        {active !== 'social' && jevFallbackOpen && (
          <aside
            id="jev-fallback-note"
            className={`source-jev-note ${crawlerNeedsAttention ? 'needs-attention' : ''}`}
            aria-labelledby="jev-fallback-title"
          >
            <Sparkles size={16} />
            <div>
              <span>{t('预留交接点', 'RESERVED HANDOFF')}</span>
              <strong id="jev-fallback-title">
                {crawlerNeedsAttention
                  ? t('检测到采集异常', 'A crawler needs attention')
                  : t('当前为待命状态', 'Standing by')}
              </strong>
              <p>
                {t(
                  '程序负责采集标题，Jev 只根据用户标签评估 1–10 分相关度，再由程序按分数选择操作。采集异常需要修复采集程序；此处尚未连接评分和真实播放。',
                  'The program collects titles. Jev scores their relevance to your tags from 1–10, then program rules select an action. Collection failures need a crawler fix. Scoring and real playback are not connected here yet.',
                )}
              </p>
            </div>
          </aside>
        )}

        {active === 'social' && selectedSource && urlSources.has(selectedSource) && (
          <div className="social-import-panel">
            <div className="social-import-copy">
              <span className="social-import-icon">
                <Share2 size={21} />
              </span>
              <div>
                <h3>{t('导入一条公开帖子', `Import one ${selectedSource} post`)}</h3>
              </div>
            </div>
            <form onSubmit={importSocial}>
              <label>
                <Share2 size={15} />
                <input
                  value={socialUrl}
                  onChange={(event) => setSocialUrl(event.target.value)}
                  placeholder={
                    selectedSource === 'TikTok'
                      ? 'https://www.tiktok.com/@creator/video/…'
                      : selectedSource === 'X'
                        ? 'https://x.com/creator/status/…'
                        : 'https://www.instagram.com/p/…'
                  }
                  aria-label={t('公开帖子链接', 'Public post URL')}
                />
              </label>
              <button disabled={socialBusy || !socialUrl.trim()}>
                {socialBusy ? (
                  <LoaderCircle size={15} className="spinning" />
                ) : (
                  <FileSearch size={15} />
                )}
                {t('解析并加入', 'Resolve & add')}
              </button>
            </form>
            {socialError && (
              <p className="social-import-error">
                <CircleAlert size={14} /> {socialError}
              </p>
            )}
            {selectedSource === 'Instagram' && (
              <p className="social-import-error">
                Instagram requires an official server connection.
              </p>
            )}
          </div>
        )}

        <div className="source-board-toolbar">
          <label>
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('搜索这个板块', 'Search this section')}
            />
          </label>
          <span>
            <Clock3 size={13} />
            {selectedSource && payload?.health.some((item) => item.source === selectedSource)
              ? t(
                  `更新于 ${new Date(payload.generatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
                  `Updated ${new Date(payload.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
                )
              : t('等待首次采集', 'Waiting for first harvest')}
          </span>
        </div>

        {loadingSource ? (
          <div className="source-loading">
            <LoaderCircle className="spinning" />
            <strong>{t('正在采集', `Fetching ${loadingSource}`)}</strong>
          </div>
        ) : loadError ? (
          <div className="source-empty source-error-state">
            <CircleAlert size={22} />
            <h3>{t('这次没有采到新内容', 'No fresh items this time')}</h3>
            <p>{loadError}</p>
            {selectedSource && !urlSources.has(selectedSource) && (
              <button onClick={() => void loadSource(selectedSource, true)}>
                {t('重新尝试', 'Try again')}
              </button>
            )}
          </div>
        ) : filteredItems.length ? (
          <div className="source-items">
            {filteredItems.slice(0, 24).map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                locale={locale}
                saved={savedResourceIds.includes(item.id)}
                onSave={() => onSaveResource(item)}
              />
            ))}
          </div>
        ) : (
          <div className="source-empty">
            {active === 'academic' ? (
              <BookOpen size={22} />
            ) : active === 'opensource' ? (
              <Code2 size={22} />
            ) : (
              <MessageCircle size={22} />
            )}
            <h3>
              {!selectedSource
                ? t('选择上方来源开始', 'Select a source above to fetch')
                : query
                  ? t('没有匹配当前搜索的内容', 'Nothing matches this search')
                  : (preferences.onlySelectedTags ||
                        preferences.requireAllSelectedTags ||
                        preferences.excludeUnselectedTags) &&
                      sectionItems.length > 0
                    ? t('没有匹配当前兴趣规则的内容', 'No items match your interest rules')
                    : urlSources.has(selectedSource)
                      ? t('输入一条公开帖子链接', 'Enter one public post URL above')
                      : selectedHealth?.state === 'configuration_required' ||
                          selectedHealth?.state === 'error'
                        ? healthText(selectedHealth, locale)
                        : t('该来源暂时没有内容', 'No items from this source yet')}
            </h3>
            {selectedSource === 'YouTube' &&
              !query &&
              (selectedHealth?.state === 'configuration_required' ||
                selectedHealth?.state === 'error') && (
                <form className="source-key-form" onSubmit={configureYouTube}>
                  <label htmlFor="youtube-search-api-key">
                    {t('YouTube Data API key', 'YouTube Data API key')}
                  </label>
                  <div>
                    <input
                      id="youtube-search-api-key"
                      type="password"
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={youtubeApiKey}
                      onChange={(event) => {
                        setYoutubeApiKey(event.target.value);
                        setYoutubeKeyError('');
                      }}
                      placeholder={t('粘贴 API key', 'Paste API key')}
                      disabled={youtubeKeyBusy}
                    />
                    <button type="submit" disabled={youtubeKeyBusy || !youtubeApiKey.trim()}>
                      {youtubeKeyBusy
                        ? t('连接中', 'Connecting')
                        : interestLabels.length
                          ? t('保存并搜索', 'Save & search')
                          : t('保存 key', 'Save key')}
                    </button>
                  </div>
                  <p>
                    {t(
                      '仅在本机服务内存中保存，重启后失效。',
                      'Saved in this local server until restart.',
                    )}
                  </p>
                  {youtubeKeyError && (
                    <p className="source-key-error" role="alert">
                      {youtubeKeyError}
                    </p>
                  )}
                </form>
              )}
            {(preferences.onlySelectedTags ||
              preferences.requireAllSelectedTags ||
              preferences.excludeUnselectedTags) &&
              sectionItems.length > 0 && (
                <p>Try another section or adjust content matching in For you.</p>
              )}
          </div>
        )}

        {payload?.warnings.length ? (
          <details className="source-warnings">
            <summary>
              <CircleAlert size={13} />{' '}
              {t(
                `${payload.warnings.length} 条采集警告`,
                `${payload.warnings.length} source warnings`,
              )}
            </summary>
            {payload.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </details>
        ) : null}

        <footer className="source-board-footer">
          <span>
            <Newspaper size={14} />
            {t('公开来源', 'Public sources')}
          </span>
          <span>{t('不改变原生推荐', 'No native feed changes')}</span>
        </footer>
      </section>
    </div>
  );
}

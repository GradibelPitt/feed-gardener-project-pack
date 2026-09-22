'use client';

import {
  ArrowRight,
  Bookmark,
  Clock3,
  Compass,
  Layers3,
  Search,
  SlidersHorizontal,
  Sparkles,
  ThumbsDown,
  X,
} from 'lucide-react';
import { formatDuration, type RankedContent, type Source } from '@/lib/feed';
import type { Locale } from '@/lib/locale';

type Budget = 10 | 25 | 'all';

type Props = {
  locale: Locale;
  page: 'discover' | 'saved';
  items: RankedContent[];
  sessionItems: RankedContent[];
  sessionMinutes: number;
  timeBudget: Budget;
  source: Source | 'all';
  query: string;
  activeTopic: string;
  selectedTags: string[];
  saved: string[];
  tagName: (id: string, locale: Locale) => string;
  t: (zh: string, en: string) => string;
  onBudgetChange: (budget: Budget) => void;
  onSourceChange: (source: Source | 'all') => void;
  onQueryChange: (query: string) => void;
  onTopicChange: (topic: string) => void;
  onOpen: (item: RankedContent) => void;
  onSave: (id: string) => void;
  onHide: (item: RankedContent) => void;
  onEditPreferences: () => void;
  onDiscover: () => void;
};

const sources: Array<Source | 'all'> = ['all', 'YouTube', 'Bluesky', 'RSS'];

export default function DiscoveryGallery({
  locale,
  page,
  items,
  sessionItems,
  sessionMinutes,
  timeBudget,
  source,
  query,
  activeTopic,
  selectedTags,
  saved,
  tagName,
  t,
  onBudgetChange,
  onSourceChange,
  onQueryChange,
  onTopicChange,
  onOpen,
  onSave,
  onHide,
  onEditPreferences,
  onDiscover,
}: Props) {
  return (
    <div className="discovery-gallery">
      <header className="gallery-intro">
        <div className="gallery-intro-copy">
          <h1>{page === 'saved' ? t('稍后阅读', 'Saved for later') : t('发现', 'Discover')}</h1>
        </div>
        <button className="gallery-edit" onClick={onEditPreferences}>
          <SlidersHorizontal size={16} />
          {t('调整偏好', 'Tune interests')}
        </button>
      </header>

      {page === 'discover' && (
        <section className="attention-strip" aria-label={t('浏览时间', 'Browsing time')}>
          <div className="attention-label">
            <Clock3 size={16} />
            <span>{t('这次留给好内容', 'Time for this session')}</span>
          </div>
          <div className="attention-options" role="group" aria-label={t('选择时间', 'Choose time')}>
            {([10, 25, 'all'] as const).map((budget) => (
              <button
                key={budget}
                aria-pressed={timeBudget === budget}
                className={timeBudget === budget ? 'selected' : ''}
                onClick={() => onBudgetChange(budget)}
              >
                {budget === 'all' ? t('不限', 'Open') : `${budget} min`}
              </button>
            ))}
          </div>
          <button
            className="attention-result"
            disabled={!sessionItems.length}
            onClick={() => sessionItems[0] && onOpen(sessionItems[0])}
          >
            <span>
              <b>{sessionItems.length}</b> {t('条精选', 'selected')} · {sessionMinutes} min
            </span>
            <ArrowRight size={15} />
          </button>
        </section>
      )}

      <section className="gallery-tools" aria-label={t('筛选内容', 'Filter content')}>
        <div className="gallery-source-tabs">
          {sources.map((item) => (
            <button
              key={item}
              className={source === item ? 'selected' : ''}
              aria-pressed={source === item}
              onClick={() => onSourceChange(item)}
            >
              {item === 'all' ? t('全部来源', 'Everything') : item}
            </button>
          ))}
        </div>
        <label className="gallery-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('搜索标题、作者或标签', 'Search title, creator, or tag')}
            aria-label={t('搜索内容', 'Search content')}
          />
          {query && (
            <button onClick={() => onQueryChange('')} aria-label={t('清除搜索', 'Clear search')}>
              <X size={14} />
            </button>
          )}
        </label>
      </section>

      <nav className="gallery-topics" aria-label={t('主题', 'Topics')}>
        <button
          className={activeTopic === 'all' ? 'selected' : ''}
          onClick={() => onTopicChange('all')}
        >
          <Sparkles size={13} /> {t('为你精选', 'For you')}
        </button>
        {selectedTags.slice(0, 5).map((id) => (
          <button
            key={id}
            className={activeTopic === id ? 'selected' : ''}
            onClick={() => onTopicChange(id)}
          >
            {tagName(id, locale)}
          </button>
        ))}
      </nav>

      {items.length === 0 ? (
        <section className="gallery-empty">
          <Compass size={25} />
          <h2>
            {page === 'saved' && saved.length === 0
              ? t('这里还很安静', 'It is quiet here for now')
              : t('没有找到相符内容', 'Nothing matches this view')}
          </h2>
          {page === 'saved' && saved.length === 0 && (
            <button onClick={onDiscover}>{t('去发现', 'Explore now')}</button>
          )}
        </section>
      ) : (
        <section className="material-masonry" aria-label={t('精选内容', 'Curated content')}>
          {items.map((item, index) => {
            const inSession = sessionItems.some((sessionItem) => sessionItem.id === item.id);
            const isSaved = saved.includes(item.id);
            return (
              <article
                key={item.id}
                className={`material-card card-${item.art} rhythm-${index % 6}`}
              >
                <div className="material-stage">
                  <button
                    className="material-open"
                    onClick={() => onOpen(item)}
                    aria-label={
                      t('打开内容与推荐依据：', 'Open content and recommendation reasoning: ') +
                      (locale === 'zh' ? item.title : item.titleEn)
                    }
                  >
                    <span className="material-texture" aria-hidden="true">
                      <i className="material-form form-a" />
                      <i className="material-form form-b" />
                      <i className="material-form form-c" />
                    </span>
                    <span className="material-badge">
                      {inSession ? t('本次精选', 'Session pick') : item.source}
                    </span>
                    <span className="material-duration">{formatDuration(item.duration)}</span>
                    <span className="material-hint">
                      <Layers3 size={14} /> {t('查看依据', 'Why this?')}
                    </span>
                  </button>
                  <div className="material-actions">
                    <button
                      className={isSaved ? 'selected' : ''}
                      onClick={() => onSave(item.id)}
                      aria-label={isSaved ? t('取消收藏', 'Unsave') : t('收藏', 'Save')}
                    >
                      <Bookmark size={15} fill={isSaved ? 'currentColor' : 'none'} />
                    </button>
                    <button onClick={() => onHide(item)} aria-label={t('不适合我', 'Not for me')}>
                      <ThumbsDown size={15} />
                    </button>
                  </div>
                </div>
                <button className="material-caption" onClick={() => onOpen(item)}>
                  <span className="material-meta">
                    {item.creator} · {item.source}
                  </span>
                  <strong>{locale === 'zh' ? item.title : item.titleEn}</strong>
                  <span className="material-tags">
                    {item.tags.slice(0, 2).map((id) => (
                      <i key={id}>{tagName(id, locale)}</i>
                    ))}
                    {item.exploratory && <i>{t('相邻探索', 'Adjacent')}</i>}
                  </span>
                </button>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

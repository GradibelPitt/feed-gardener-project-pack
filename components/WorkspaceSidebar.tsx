'use client';

import {
  ArrowUpRight,
  Bookmark,
  CircleHelp,
  Compass,
  Layers3,
  Leaf,
  Link2,
  Sprout,
} from 'lucide-react';

export type WorkspacePage = 'discover' | 'garden' | 'library' | 'saved' | 'connections';

export const WORKSPACE_TABS = [
  { id: 'discover', icon: Compass, zh: '发现好内容', en: 'Discover' },
  { id: 'garden', icon: Sprout, zh: '我的信息花园', en: 'My garden' },
  { id: 'library', icon: Layers3, zh: '资源库', en: 'Resource library' },
  { id: 'saved', icon: Bookmark, zh: '稍后阅读', en: 'Saved for later' },
] as const;

type Props = {
  page: WorkspacePage;
  t: (zh: string, en: string) => string;
  mobileOpen: boolean;
  resourceCount: number;
  savedCount: number;
  onNavigate: (page: WorkspacePage) => void;
  onCloseMobile: () => void;
};

export default function WorkspaceSidebar({
  page,
  t,
  mobileOpen,
  resourceCount,
  savedCount,
  onNavigate,
  onCloseMobile,
}: Props) {
  return (
    <>
      {mobileOpen && (
        <button
          className="nav-scrim"
          aria-label={t('关闭导航', 'Close navigation')}
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}
        aria-label={t('工作台导航', 'Workspace navigation')}
      >
        <button className="brand" onClick={() => onNavigate('discover')}>
          <span className="brand-mark">
            <Sprout size={27} strokeWidth={1.6} />
          </span>
          <span>
            <span className="brand-serif">Feeder</span>
            <small>YOUR INTERESTS. YOUR FEED.</small>
          </span>
        </button>
        <span className="nav-label">{t('你的工作台', 'WORKSPACE')}</span>
        <nav aria-label={t('主页面', 'Main pages')}>
          {WORKSPACE_TABS.map((item) => (
            <button
              key={item.id}
              aria-current={page === item.id ? 'page' : undefined}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <item.icon size={19} strokeWidth={1.7} />
              <span>{t(item.zh, item.en)}</span>
              {item.id === 'saved' && savedCount > 0 && <small>{savedCount}</small>}
              {item.id === 'library' && resourceCount > 0 && <small>{resourceCount}</small>}
              {item.id === 'garden' && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="slow-note">
            <div>
              <Leaf size={19} />
              <span>{t('让注意力，回到你手里。', 'Make room for what matters.')}</span>
            </div>
            <p>
              {t('信息不必更多，只需更适合你。', 'A little less scrolling. A little more growing.')}
            </p>
          </div>
          <button
            className={`nav-item ${page === 'connections' ? 'active' : ''}`}
            onClick={() => onNavigate('connections')}
          >
            <Link2 size={18} />
            {t('连接与隐私', 'Connections & privacy')}
          </button>
          <a className="nav-item" href="/instructions">
            <CircleHelp size={18} />
            {t('使用说明', 'Instructions')}
            <ArrowUpRight size={14} className="push-right" />
          </a>
          <div className="sidebar-footer">Feeder · {t('本地工作空间', 'Local workspace')}</div>
        </div>
      </aside>
    </>
  );
}

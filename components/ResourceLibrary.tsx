'use client';

import { useState, type FormEvent } from 'react';
import { BookOpen, ExternalLink, FileText, Link2, Plus, Search, Trash2 } from 'lucide-react';
import type { Locale } from '@/lib/locale';
import {
  RESOURCE_TYPES,
  resourceFromLink,
  resourceUrlKey,
  resourceWebsite,
  type KnowledgeState,
  type ResourceRecord,
  type ResourceType,
} from '@/lib/resources';

type Props = {
  locale: Locale;
  resources: ResourceRecord[];
  t: (zh: string, en: string) => string;
  onAdd: (record: ResourceRecord) => void;
  onUpdate: (
    id: string,
    patch: Partial<Pick<ResourceRecord, 'note' | 'knowledgeState' | 'resourceType'>>,
  ) => void;
  onRemove: (id: string) => void;
  onDiscover: () => void;
};

const typeNames: Record<ResourceType, { zh: string; en: string }> = {
  webpage: { zh: '网页', en: 'Web page' },
  article: { zh: '文章', en: 'Article' },
  video: { zh: '视频', en: 'Video' },
  paper: { zh: '论文', en: 'Paper' },
  repository: { zh: '代码库', en: 'Repository' },
  social: { zh: '社交帖子', en: 'Social post' },
  document: { zh: '文档', en: 'Document' },
  audio: { zh: '音频', en: 'Audio' },
};

export default function ResourceLibrary({
  resources,
  t,
  onAdd,
  onUpdate,
  onRemove,
  onDiscover,
}: Props) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [newType, setNewType] = useState<ResourceType | 'auto'>('auto');
  const [websiteFilter, setWebsiteFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<ResourceType | 'all'>('all');
  const [formError, setFormError] = useState('');
  const states: Array<{ id: KnowledgeState; zh: string; en: string }> = [
    { id: 'inbox', zh: '待整理', en: 'Inbox' },
    { id: 'reviewing', zh: '正在研究', en: 'Reviewing' },
    { id: 'reference', zh: '知识参考', en: 'Reference' },
  ];
  const websites = [...new Set(resources.map((resource) => resourceWebsite(resource.url)))].sort();
  const visible = resources.filter(
    (resource) =>
      (websiteFilter === 'all' || resourceWebsite(resource.url) === websiteFilter) &&
      (typeFilter === 'all' || resource.resourceType === typeFilter),
  );

  const addLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const record = resourceFromLink(url, title, newType === 'auto' ? undefined : newType);
    if (!record) {
      setFormError(
        t('请输入完整的 http:// 或 https:// 链接。', 'Enter a complete http:// or https:// link.'),
      );
      return;
    }
    if (resources.some((resource) => resourceUrlKey(resource.url) === resourceUrlKey(record.url))) {
      setFormError(t('这个链接已在资源库中。', 'This link is already in your library.'));
      return;
    }
    if (resources.length >= 500) {
      setFormError(
        t('资源库已达到 500 条本地收藏上限。', 'The local library has reached its 500-link limit.'),
      );
      return;
    }
    onAdd(record);
    setUrl('');
    setTitle('');
    setNewType('auto');
    setFormError('');
    setWebsiteFilter('all');
    setTypeFilter('all');
  };

  return (
    <main className="resource-library">
      <header className="resource-library-head">
        <div>
          <span>LOCAL KNOWLEDGE REPOSITORY</span>
          <h1>{t('资源库', 'Resource library')}</h1>
          <p>
            {t(
              '收藏公开来源或粘贴任意第三方网页链接，在浏览器中按网站和类型整理。',
              'Save discoveries or paste any third-party web link. Organize them by website and type in this browser.',
            )}
          </p>
        </div>
        <strong>{resources.length}</strong>
      </header>

      <form className="resource-add" onSubmit={addLink}>
        <div className="resource-add-heading">
          <Link2 size={18} />
          <div>
            <h2>{t('粘贴链接收藏', 'Save a pasted link')}</h2>
            <p>
              {t(
                '仅保存链接和你填写的信息；不会读取第三方页面。',
                'Saves the link and details you enter locally. It does not fetch the third-party page.',
              )}
            </p>
          </div>
        </div>
        <div className="resource-add-fields">
          <label>
            {t('网页链接', 'Web link')}
            <input
              type="url"
              value={url}
              required
              maxLength={2_048}
              placeholder="https://example.com/page"
              onChange={(event) => {
                setUrl(event.target.value);
                setFormError('');
              }}
            />
          </label>
          <label>
            {t('标题（选填）', 'Title (optional)')}
            <input
              value={title}
              maxLength={500}
              placeholder={t('留空则使用网站名称', 'Defaults to the website name')}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            {t('类型', 'Type')}
            <select
              value={newType}
              onChange={(event) => setNewType(event.target.value as ResourceType | 'auto')}
            >
              <option value="auto">{t('自动判断', 'Detect automatically')}</option>
              {RESOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(typeNames[type].zh, typeNames[type].en)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="primary-button">
            <Plus size={15} /> {t('加入收藏', 'Save link')}
          </button>
        </div>
        {formError && (
          <p className="resource-form-error" role="alert">
            {formError}
          </p>
        )}
      </form>

      {resources.length === 0 ? (
        <section className="resource-empty">
          <BookOpen size={27} />
          <h2>{t('还没有收藏资源', 'No resources saved yet')}</h2>
          <p>
            {t(
              '粘贴上方链接，或从发现页收藏公开来源。',
              'Paste a link above or save a public-source item from Discover.',
            )}
          </p>
          <button className="primary-button" onClick={onDiscover}>
            <Search size={15} /> {t('去发现资源', 'Discover resources')}
          </button>
        </section>
      ) : (
        <>
          <div className="resource-filters">
            <label>
              {t('按网站分类', 'Website')}
              <select
                value={websiteFilter}
                onChange={(event) => setWebsiteFilter(event.target.value)}
              >
                <option value="all">
                  {t('所有网站', 'All websites')} ({resources.length})
                </option>
                {websites.map((website) => (
                  <option key={website} value={website}>
                    {website} (
                    {
                      resources.filter((resource) => resourceWebsite(resource.url) === website)
                        .length
                    }
                    )
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('按类型分类', 'Type')}
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as ResourceType | 'all')}
              >
                <option value="all">
                  {t('所有类型', 'All types')} ({resources.length})
                </option>
                {RESOURCE_TYPES.filter((type) =>
                  resources.some((resource) => resource.resourceType === type),
                ).map((type) => (
                  <option key={type} value={type}>
                    {t(typeNames[type].zh, typeNames[type].en)} (
                    {resources.filter((resource) => resource.resourceType === type).length})
                  </option>
                ))}
              </select>
            </label>
            <span>
              {t(`显示 ${visible.length} 条`, `Showing ${visible.length} of ${resources.length}`)}
            </span>
          </div>
          {visible.length === 0 ? (
            <div className="resource-filter-empty">
              {t('没有符合这两个分类的资源。', 'No resources match these categories.')}
            </div>
          ) : (
            <section className="resource-list">
              {visible.map((resource) => (
                <article key={resource.id} className="resource-record">
                  <div className="resource-record-main">
                    <div className="resource-record-meta">
                      <span>{resourceWebsite(resource.url)}</span>
                      <i />
                      <span>
                        {t(
                          typeNames[resource.resourceType].zh,
                          typeNames[resource.resourceType].en,
                        )}
                      </span>
                      {resource.source !== resourceWebsite(resource.url) && (
                        <>
                          <i />
                          <span>{resource.source}</span>
                        </>
                      )}
                      {resource.domain !== 'Other' && (
                        <>
                          <i />
                          <span>{resource.domain}</span>
                        </>
                      )}
                      {resource.author && (
                        <>
                          <i />
                          <span>{resource.author}</span>
                        </>
                      )}
                    </div>
                    <h2>{resource.title}</h2>
                    {resource.summary && <p>{resource.summary}</p>}
                    {resource.tags.length > 0 && (
                      <div className="resource-record-tags">
                        {resource.tags.slice(0, 6).map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    )}
                    <a href={resource.url} target="_blank" rel="noopener noreferrer">
                      {t('查看原始来源', 'Open original source')} <ExternalLink size={13} />
                    </a>
                  </div>
                  <aside className="resource-knowledge">
                    <label>
                      {t('类型', 'Type')}
                      <select
                        value={resource.resourceType}
                        onChange={(event) =>
                          onUpdate(resource.id, {
                            resourceType: event.target.value as ResourceType,
                          })
                        }
                      >
                        {RESOURCE_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {t(typeNames[type].zh, typeNames[type].en)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="resource-field-heading">
                        <FileText size={14} /> {t('知识状态', 'Knowledge state')}
                      </span>
                      <select
                        value={resource.knowledgeState}
                        onChange={(event) =>
                          onUpdate(resource.id, {
                            knowledgeState: event.target.value as KnowledgeState,
                          })
                        }
                      >
                        {states.map((state) => (
                          <option key={state.id} value={state.id}>
                            {t(state.zh, state.en)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t('我的笔记', 'My note')}
                      <textarea
                        value={resource.note}
                        maxLength={10_000}
                        placeholder={t(
                          '记录为什么值得保留、下一步要验证什么……',
                          'Why keep this? What should be verified next?',
                        )}
                        onChange={(event) => onUpdate(resource.id, { note: event.target.value })}
                      />
                    </label>
                    <button className="resource-remove" onClick={() => onRemove(resource.id)}>
                      <Trash2 size={13} /> {t('移出资源库', 'Remove from library')}
                    </button>
                  </aside>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}

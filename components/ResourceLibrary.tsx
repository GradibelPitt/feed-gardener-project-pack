'use client';

import { useState, type FormEvent } from 'react';
import {
  BookOpen,
  ExternalLink,
  FileText,
  Folder,
  Link2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import type { Locale } from '@/lib/locale';
import BilibiliVideo from './BilibiliVideo';
import YouTubeVideo from './YouTubeVideo';
import {
  RESOURCE_TYPES,
  nextDefaultCollectionName,
  resourceFromLink,
  resourceUrlKey,
  resourceWebsite,
  type KnowledgeState,
  type ResourceCollection,
  type ResourceRecord,
  type ResourceType,
} from '@/lib/resources';

type Props = {
  mode?: 'library' | 'saved';
  locale: Locale;
  resources: ResourceRecord[];
  collections: ResourceCollection[];
  t: (zh: string, en: string) => string;
  onCreateCollection: (collection: ResourceCollection) => void;
  onRenameCollection: (id: string, name: string) => void;
  onDeleteCollection: (id: string) => void;
  onAdd: (record: ResourceRecord) => void;
  onUpdate: (
    id: string,
    patch: Partial<
      Pick<ResourceRecord, 'note' | 'knowledgeState' | 'resourceType' | 'collectionId'>
    >,
  ) => void;
  onRemove: (id: string) => void;
  onOpen: (record: ResourceRecord) => void;
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
  mode = 'library',
  resources,
  collections,
  t,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onAdd,
  onUpdate,
  onRemove,
  onOpen,
  onDiscover,
}: Props) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [newCollectionId, setNewCollectionId] = useState('unfiled');
  const [selectedCollection, setSelectedCollection] = useState('all');
  const [collectionName, setCollectionName] = useState('');
  const [collectionError, setCollectionError] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
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
      mode === 'saved' ||
      ((selectedCollection === 'all' ||
        (selectedCollection === 'unfiled'
          ? !resource.collectionId
          : resource.collectionId === selectedCollection)) &&
        (websiteFilter === 'all' || resourceWebsite(resource.url) === websiteFilter) &&
        (typeFilter === 'all' || resource.resourceType === typeFilter)),
  );

  const chooseCollection = (id: string) => {
    setSelectedCollection(id);
    setNewCollectionId(id === 'all' ? 'unfiled' : id);
    setWebsiteFilter('all');
    setTypeFilter('all');
  };

  const createCollection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = collectionName.trim() || nextDefaultCollectionName(collections);
    if (collections.some((collection) => collection.name.toLowerCase() === name.toLowerCase())) {
      setCollectionError(t('请输入不重复的收藏夹名称。', 'Enter a unique collection name.'));
      return;
    }
    if (collections.length >= 50) {
      setCollectionError(t('最多创建 50 个收藏夹。', 'You can create up to 50 collections.'));
      return;
    }
    const collection = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
    onCreateCollection(collection);
    setCollectionName('');
    setCollectionError('');
    chooseCollection(collection.id);
  };

  const renameCollection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!renamingId) return;
    const name = renameName.trim();
    if (
      !name ||
      collections.some(
        (collection) =>
          collection.id !== renamingId && collection.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setCollectionError(t('请输入不重复的收藏夹名称。', 'Enter a unique collection name.'));
      return;
    }
    onRenameCollection(renamingId, name);
    setRenamingId(null);
    setRenameName('');
    setCollectionError('');
  };

  const addLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const record = resourceFromLink(url, title);
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
    record.collectionId = collections.some((collection) => collection.id === newCollectionId)
      ? newCollectionId
      : null;
    onAdd(record);
    setUrl('');
    setTitle('');
    setFormError('');
    setWebsiteFilter('all');
    setTypeFilter('all');
  };

  return (
    <main className="resource-library">
      <header className="resource-library-head">
        <div>
          <h1>
            {mode === 'saved' ? t('稍后阅读', 'Saved for later') : t('资源库', 'Resource library')}
          </h1>
          <p>
            {mode === 'saved'
              ? t(
                  '快速查看已收藏的内容；可以在资源库中整理收藏夹。',
                  'A quick view of your saved content. Organize it in Resource library.',
                )
              : t(
                  '收藏公开来源或粘贴链接，再按收藏夹、网站和类型整理。',
                  'Save discoveries or paste a link, then organize by collection, website, and type.',
                )}
          </p>
        </div>
      </header>

      {mode === 'library' && (
        <section className="resource-collections" aria-label={t('收藏夹', 'Collections')}>
          <div className="resource-collections-heading">
            <div>
              <Folder size={17} />
              <h2>{t('收藏夹', 'Collections')}</h2>
            </div>
            <span>{t('将收藏按主题整理', 'Organize saved content by topic')}</span>
          </div>
          <div className="resource-collection-list">
            <button
              type="button"
              className={
                selectedCollection === 'all' ? 'resource-collection active' : 'resource-collection'
              }
              aria-pressed={selectedCollection === 'all'}
              onClick={() => chooseCollection('all')}
            >
              <span>{t('全部收藏', 'All saved')}</span>
              <small>{resources.length}</small>
            </button>
            <button
              type="button"
              className={
                selectedCollection === 'unfiled'
                  ? 'resource-collection active'
                  : 'resource-collection'
              }
              aria-pressed={selectedCollection === 'unfiled'}
              onClick={() => chooseCollection('unfiled')}
            >
              <span>{t('默认', 'Default')}</span>
              <small>{resources.filter((resource) => !resource.collectionId).length}</small>
            </button>
            {collections.map((collection) => (
              <div className="resource-collection-entry" key={collection.id}>
                <button
                  type="button"
                  className={
                    selectedCollection === collection.id
                      ? 'resource-collection active'
                      : 'resource-collection'
                  }
                  aria-pressed={selectedCollection === collection.id}
                  onClick={() => chooseCollection(collection.id)}
                >
                  <span>{collection.name}</span>
                  <small>
                    {resources.filter((resource) => resource.collectionId === collection.id).length}
                  </small>
                </button>
                <button
                  type="button"
                  className="resource-collection-rename"
                  aria-label={t(`重命名 ${collection.name}`, `Rename ${collection.name}`)}
                  onClick={() => {
                    setRenamingId(collection.id);
                    setRenameName(collection.name);
                    setCollectionError('');
                  }}
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  className="resource-collection-rename"
                  aria-label={t(`删除 ${collection.name}`, `Delete ${collection.name}`)}
                  onClick={() => setDeletingId(collection.id)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          {deletingId && (
            <div className="resource-collection-confirm">
              <span>
                {t(
                  '删除收藏夹后，其中的内容会移到“默认”。',
                  'Deleting this collection moves its content to Default.',
                )}
              </span>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  onDeleteCollection(deletingId);
                  if (selectedCollection === deletingId) chooseCollection('unfiled');
                  if (newCollectionId === deletingId) setNewCollectionId('unfiled');
                  if (renamingId === deletingId) setRenamingId(null);
                  setDeletingId(null);
                }}
              >
                {t('删除收藏夹', 'Delete collection')}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDeletingId(null)}
              >
                {t('取消', 'Cancel')}
              </button>
            </div>
          )}
          {renamingId && (
            <form className="resource-collection-form" onSubmit={renameCollection}>
              <input
                aria-label={t('收藏夹新名称', 'New collection name')}
                value={renameName}
                maxLength={60}
                required
                onChange={(event) => setRenameName(event.target.value)}
              />
              <button type="submit" className="secondary-button">
                {t('保存名称', 'Save name')}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setRenamingId(null);
                  setCollectionError('');
                }}
              >
                {t('取消', 'Cancel')}
              </button>
            </form>
          )}
          <form className="resource-collection-form" onSubmit={createCollection}>
            <input
              aria-label={t('新收藏夹名称（选填）', 'New collection name (optional)')}
              placeholder={t('留空自动命名', 'Leave blank for an automatic name')}
              value={collectionName}
              maxLength={60}
              onChange={(event) => {
                setCollectionName(event.target.value);
                setCollectionError('');
              }}
            />
            <button type="submit" className="secondary-button">
              <Plus size={14} /> {t('新建收藏夹', 'Create collection')}
            </button>
          </form>
          {collectionError && (
            <p className="resource-form-error" role="alert">
              {collectionError}
            </p>
          )}
        </section>
      )}

      {mode === 'library' && (
        <form className="resource-add" onSubmit={addLink}>
          <div className="resource-add-heading">
            <Link2 size={18} />
            <div>
              <h2>{t('粘贴链接收藏', 'Save a pasted link')}</h2>
              <p>
                {t(
                  '保存链接和你填写的信息，类型会自动识别。',
                  'Save the link and details you enter. Its type is detected automatically.',
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
              {t('收藏夹', 'Collection')}
              <select
                value={newCollectionId}
                onChange={(event) => setNewCollectionId(event.target.value)}
              >
                <option value="unfiled">{t('默认', 'Default')}</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
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
      )}

      {resources.length === 0 ? (
        <section className="resource-empty">
          <BookOpen size={27} />
          <h2>{t('还没有收藏资源', 'No resources saved yet')}</h2>
          <p>
            {mode === 'saved'
              ? t(
                  '从发现页收藏一些内容，之后可以在这里快速查看。',
                  'Save a few items from Discover to find them here later.',
                )
              : t(
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
          {mode === 'library' && (
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
          )}
          {visible.length === 0 ? (
            <div className="resource-filter-empty">
              {selectedCollection !== 'all' && websiteFilter === 'all' && typeFilter === 'all'
                ? t(
                    '这个收藏夹还没有内容。可以在上方收藏链接，或在已有卡片的“编辑”中移入。',
                    'This collection is empty. Save a link above or move an existing item here from Edit.',
                  )
                : t('没有符合筛选条件的资源。', 'No resources match these filters.')}
            </div>
          ) : (
            <section className="resource-list">
              {visible.map((resource) => (
                <article key={resource.id} className="resource-record">
                  <div className="resource-record-main">
                    <button
                      type="button"
                      className="resource-record-edit"
                      aria-expanded={editingResourceId === resource.id}
                      aria-label={t(`编辑 ${resource.title}`, `Edit ${resource.title}`)}
                      onClick={() =>
                        setEditingResourceId(editingResourceId === resource.id ? null : resource.id)
                      }
                    >
                      <Pencil size={14} />
                      {editingResourceId === resource.id ? t('完成', 'Done') : t('编辑', 'Edit')}
                    </button>
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
                    {(resource.embedUrl || resource.imageUrl) &&
                      (resource.source === 'Bilibili' ||
                      resourceWebsite(resource.url) === 'bilibili.com' ? (
                        <div className="resource-record-video">
                          <BilibiliVideo item={resource} />
                        </div>
                      ) : resource.source === 'YouTube' ||
                        ['youtube.com', 'm.youtube.com', 'youtu.be'].includes(
                          resourceWebsite(resource.url),
                        ) ? (
                        <div className="resource-record-video">
                          <YouTubeVideo item={resource} />
                        </div>
                      ) : null)}
                    {resource.summary && <p>{resource.summary}</p>}
                    {resource.tags.length > 0 && (
                      <div className="resource-record-tags">
                        {resource.tags.slice(0, 6).map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    )}
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onOpen(resource)}
                    >
                      {t('查看原始来源', 'Open original source')} <ExternalLink size={13} />
                    </a>
                  </div>
                  {editingResourceId === resource.id && (
                    <div className="resource-knowledge">
                      <label>
                        {t('收藏夹', 'Collection')}
                        <select
                          value={resource.collectionId ?? 'unfiled'}
                          onChange={(event) =>
                            onUpdate(resource.id, {
                              collectionId:
                                event.target.value === 'unfiled' ? null : event.target.value,
                            })
                          }
                        >
                          <option value="unfiled">{t('默认', 'Default')}</option>
                          {collections.map((collection) => (
                            <option key={collection.id} value={collection.id}>
                              {collection.name}
                            </option>
                          ))}
                        </select>
                      </label>
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
                      <label className="resource-note-field">
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
                      <button
                        className="resource-remove"
                        onClick={() => {
                          onRemove(resource.id);
                          setEditingResourceId(null);
                        }}
                      >
                        <Trash2 size={13} /> {t('移出资源库', 'Remove from library')}
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}

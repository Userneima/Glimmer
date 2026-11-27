import React, { useMemo, useState } from 'react';
import { Plus, Search, Trash2, Calendar, CalendarPlus, Folder, Menu, FileText } from 'lucide-react';
import { TEMPLATE_DIARY_ID } from '../../types';
import type { Diary, Folder as DiaryFolder } from '../../types';
import {
  diaryDay,
  formatDate,
  formatRelativeTime,
  isSameDay,
  parseDateInputValue,
  toDateInputValue,
} from '../../utils/date';
import { getDiaryWordCount } from '../../utils/text';
import { isLongTermMasterDiary, isSystemDiary } from '../../utils/diarySystem';
import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';
import { t } from '../../i18n';
import { showToast } from '../../utils/toast';

const DIARY_SORT_MODE_KEY = 'diary-sort-mode';
const DIARY_SORT_MODE_TOUCHED_KEY = 'diary-sort-mode-touched';
type DiarySortMode = 'updated-desc' | 'updated-asc' | 'created-desc' | 'created-asc' | 'title-asc' | 'title-desc';
type FolderOption = DiaryFolder & { depth: number };
const DIARY_SORT_MODES: DiarySortMode[] = [
  'updated-desc',
  'updated-asc',
  'created-desc',
  'created-asc',
  'title-asc',
  'title-desc',
];
const DEFAULT_DIARY_SORT_MODE: DiarySortMode = 'created-desc';

interface DiaryListProps {
  diaries: Diary[];
  currentDiaryId: string | null;
  onSelectDiary: (id: string) => void;
  onCreateDiary: (day?: number) => void;
  onDeleteDiary: (id: string) => void;
  onMoveDiary: (diaryId: string, folderId: string | null) => void;
  searchQuery: string;
  onSearch: (query: string) => void;
  selectedFolderId: string | null;
  folders: DiaryFolder[];
}

export const DiaryList: React.FC<DiaryListProps> = ({
  diaries,
  currentDiaryId,
  onSelectDiary,
  onCreateDiary,
  onDeleteDiary,
  onMoveDiary,
  searchQuery,
  onSearch,
  selectedFolderId,
  folders,
}) => {
  const [sortMode, setSortMode] = useState<DiarySortMode>(() => {
    const saved = localStorage.getItem(DIARY_SORT_MODE_KEY);
    const userTouchedSort = localStorage.getItem(DIARY_SORT_MODE_TOUCHED_KEY) === 'true';
    if (saved && DIARY_SORT_MODES.includes(saved as DiarySortMode)) {
      return userTouchedSort ? (saved as DiarySortMode) : DEFAULT_DIARY_SORT_MODE;
    }
    return DEFAULT_DIARY_SORT_MODE;
  });

  // 持久化排序模式
  const handleSortModeChange = (newMode: typeof sortMode) => {
    setSortMode(newMode);
    localStorage.setItem(DIARY_SORT_MODE_KEY, newMode);
    localStorage.setItem(DIARY_SORT_MODE_TOUCHED_KEY, 'true');
  };

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingDiaryId, setDeletingDiaryId] = useState<string | null>(null);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [movingDiaryId, setMovingDiaryId] = useState<string | null>(null);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);

  // 补写：默认停在昨天，也可以选更早的一天。选中的那天已经有日记时按钮变成「打开」。
  const [isBackfillOpen, setIsBackfillOpen] = useState(false);
  const [backfillMax, setBackfillMax] = useState(() => toDateInputValue(Date.now()));
  const [backfillDate, setBackfillDate] = useState(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return toDateInputValue(yesterday.getTime());
  });
  const diaryForDay = (timestamp: number) => diaries.find((diary) => (
    !isSystemDiary(diary) && isSameDay(diaryDay(diary).getTime(), timestamp)
  ));
  const selectedTimestamp = parseDateInputValue(backfillDate);
  const selectedDiary = selectedTimestamp === null ? undefined : diaryForDay(selectedTimestamp);

  const openBackfill = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    setBackfillDate(toDateInputValue(yesterday.getTime()));
    setBackfillMax(toDateInputValue(Date.now()));
    setIsBackfillOpen(true);
  };

  const openOrCreateForDay = (timestamp: number, existing?: Diary) => {
    if (existing) onSelectDiary(existing.id);
    else onCreateDiary(timestamp);
    setIsBackfillOpen(false);
  };

  const folderDescendantIds = useMemo(() => {
    const childrenByParent = new Map<string | null, DiaryFolder[]>();
    folders.forEach((folder) => {
      const key = folder.parentId ?? null;
      childrenByParent.set(key, [...(childrenByParent.get(key) ?? []), folder]);
    });

    const map = new Map<string, Set<string>>();
    const collect = (folderId: string): Set<string> => {
      const cached = map.get(folderId);
      if (cached) return cached;
      const ids = new Set<string>([folderId]);
      (childrenByParent.get(folderId) ?? []).forEach((child) => {
        collect(child.id).forEach((id) => ids.add(id));
      });
      map.set(folderId, ids);
      return ids;
    };

    folders.forEach((folder) => collect(folder.id));
    return map;
  }, [folders]);

  const selectedFolderIds = useMemo(() => {
    if (!selectedFolderId) return null;
    return folderDescendantIds.get(selectedFolderId) ?? new Set([selectedFolderId]);
  }, [folderDescendantIds, selectedFolderId]);

  // 搜索时在所有日记里找，不只当前文件夹：左侧总会选中某个月份，只搜当前文件夹的话，
  // 上个月写的内容永远搜不到。
  const isSearching = searchQuery.trim().length > 0;
  const filteredDiaries = diaries.filter((diary) => {
    const isLongTermMaster = isLongTermMasterDiary(diary);
    return (
      diary.id !== TEMPLATE_DIARY_ID &&
      (isSearching || isLongTermMaster || selectedFolderId === null || (diary.folderId !== null && selectedFolderIds?.has(diary.folderId)))
    );
  });

  const sortedDiaries = useMemo(() => {
    const normalizedTitle = (title: string) => (title || '').trim().toLocaleLowerCase();
    const master = filteredDiaries.find((d) => isLongTermMasterDiary(d));
    const others = filteredDiaries.filter((d) => !isLongTermMasterDiary(d));
    const list = [...others];

    const sortedOthers = list.sort((a, b) => {
      switch (sortMode) {
        case 'updated-asc':
          return a.updatedAt - b.updatedAt;
        case 'created-desc':
          return b.createdAt - a.createdAt;
        case 'created-asc':
          return a.createdAt - b.createdAt;
        case 'title-asc':
          return normalizedTitle(a.title).localeCompare(normalizedTitle(b.title), 'zh-CN', {
            sensitivity: 'base',
          });
        case 'title-desc':
          return normalizedTitle(b.title).localeCompare(normalizedTitle(a.title), 'zh-CN', {
            sensitivity: 'base',
          });
        case 'updated-desc':
        default:
          return b.updatedAt - a.updatedAt;
      }
    });

    return master ? [master, ...sortedOthers] : sortedOthers;
  }, [filteredDiaries, sortMode]);

  const totalCount = diaries.length;
  const visibleCount = sortedDiaries.length;

  const openDeleteModal = (diaryId: string) => {
    setDeletingDiaryId(diaryId);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteDiary = () => {
    if (deletingDiaryId) {
      onDeleteDiary(deletingDiaryId);
      setDeletingDiaryId(null);
      setIsDeleteModalOpen(false);
    }
  };

  const openMoveModal = (diary: Diary) => {
    setMovingDiaryId(diary.id);
    setTargetFolderId(diary.folderId);
    setIsMoveModalOpen(true);
  };

  const handleMoveDiary = () => {
    if (!movingDiaryId) {
      return;
    }
    onMoveDiary(movingDiaryId, targetFolderId);
    showToast(t('Diary moved successfully'), 'success');
    setIsMoveModalOpen(false);
    setMovingDiaryId(null);
    setTargetFolderId(null);
  };

  const folderOptions = useMemo<FolderOption[]>(() => {
    const childrenByParent = new Map<string | null, DiaryFolder[]>();
    folders.forEach((folder) => {
      const key = folder.parentId ?? null;
      childrenByParent.set(key, [...(childrenByParent.get(key) ?? []), folder]);
    });
    childrenByParent.forEach((items) => {
      items.sort((a, b) => {
        const createdAtDiff = b.createdAt - a.createdAt;
        if (createdAtDiff !== 0) return createdAtDiff;
        return b.id.localeCompare(a.id);
      });
    });

    const result: FolderOption[] = [];
    const append = (items: DiaryFolder[], depth: number) => {
      items.forEach((folder) => {
        result.push({ ...folder, depth });
        append(childrenByParent.get(folder.id) ?? [], depth + 1);
      });
    };
    const root = [...(childrenByParent.get(null) ?? [])].sort((a, b) => {
      const createdAtDiff = b.createdAt - a.createdAt;
      if (createdAtDiff !== 0) return createdAtDiff;
      return b.id.localeCompare(a.id);
    });
    append(root, 0);
    return result;
  }, [folders]);

  // 摘要按段落取字，段与段之间用「 · 」隔开。直接取整篇纯文字的话，
  // 标题和正文会挤成一串（「流水账今日计划」），分不清哪里是哪里。
  const getPreviewText = (content: string): string => {
    const div = document.createElement('div');
    div.innerHTML = content;
    const blocks = Array.from(div.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote, pre'))
      .filter((node) => !node.querySelector('p, li'))
      .map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const text = blocks.length > 0 ? blocks.join(' · ') : (div.textContent ?? '').trim();
    return text.slice(0, 100) + (text.length > 100 ? '...' : '');
  };

  return (
    <div className="glimmer-panel h-full flex flex-col border-r">
      <div className="glimmer-panel-header p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          {/* 移动端侧边栏按钮 */}
          <button
            onClick={() => {
              // 触发侧边栏打开事件
              const event = new CustomEvent('openSidebar');
              window.dispatchEvent(event);
            }}
            className="p-2 rounded-lg text-primary-600 hover:bg-primary-50 transition-colors md:hidden"
            aria-label="Open sidebar"
          >
            <Menu size={20} />
          </button>
          {/* 标题区域 - 居中显示 */}
          <div className="flex-1 text-center">
            <h2 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--aurora-primary)' }}>{t('Diaries')}</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--aurora-muted)' }}>
              {t('Showing diaries summary').replace('{visible}', String(visibleCount)).replace('{total}', String(totalCount))}
            </p>
          </div>
          <div className="relative flex items-center gap-2">
            {/* 加号按钮 - 弥散光渐变强调色 */}
            <button
              onClick={() => onCreateDiary()}
              className="glimmer-accent-button p-2.5 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 active:scale-95"
              title={t('New Diary')}
            >
              <Plus size={18} strokeWidth={2} />
            </button>
            {/* 补写：默认今天还是主按钮，这里专门给过去的日子留入口 */}
            <button
              type="button"
              onClick={() => (isBackfillOpen ? setIsBackfillOpen(false) : openBackfill())}
              className="p-2.5 rounded-xl border transition-colors duration-200"
              style={{
                borderColor: 'var(--glimmer-border)',
                backgroundColor: 'var(--glimmer-surface-card)',
                color: 'var(--aurora-secondary)',
              }}
              title={t('Backfill a diary')}
              aria-label={t('Backfill a diary')}
              aria-expanded={isBackfillOpen}
            >
              <CalendarPlus size={18} strokeWidth={1.75} />
            </button>

            {isBackfillOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsBackfillOpen(false)}
                />
                <div
                  className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border p-3 shadow-lg"
                  style={{
                    borderColor: 'var(--glimmer-border)',
                    backgroundColor: 'var(--glimmer-surface-strong)',
                  }}
                >
                  <p className="text-sm font-semibold" style={{ color: 'var(--aurora-primary)' }}>
                    {t('Backfill a diary')}
                  </p>

                  <label className="mt-3 block text-xs font-medium" style={{ color: 'var(--aurora-muted)' }}>
                    {t('Pick a day')}
                  </label>
                  <input
                    type="date"
                    value={backfillDate}
                    max={backfillMax}
                    onChange={(event) => setBackfillDate(event.target.value)}
                    className="glimmer-field mt-1 w-full rounded-lg px-2.5 py-2 text-sm focus:outline-none"
                    style={{ color: 'var(--aurora-primary)' }}
                  />

                  <button
                    type="button"
                    disabled={selectedTimestamp === null}
                    onClick={() => {
                      if (selectedTimestamp === null) return;
                      openOrCreateForDay(selectedTimestamp, selectedDiary);
                    }}
                    className="glimmer-accent-button mt-2 w-full rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {selectedDiary ? t("Open that day's diary") : t('Backfill this day')}
                  </button>

                  <p className="mt-2 text-[11px] leading-4" style={{ color: 'var(--aurora-muted)' }}>
                    {t('Backfilled diaries only keep the log part, without the today plan.')}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
        {/* 搜索框 - 毛玻璃材质 */}
        <div className="relative">
          <Search
            size={18}
            strokeWidth={1.75}
            className="absolute left-3 top-1/2 transform -translate-y-1/2"
            style={{ color: 'var(--aurora-muted)' }}
          />
          <input
            type="text"
            placeholder={t('Search diaries...')}
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            className="glimmer-field w-full pl-10 pr-4 py-2.5 rounded-xl focus:outline-none transition-colors duration-200"
            style={{
              color: 'var(--aurora-primary)'
            }}
          />
        </div>

        <div className="mt-3">
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--aurora-muted)' }}>{t('Sort by')}</label>
          <select
            value={sortMode}
            onChange={(e) => handleSortModeChange(e.target.value as typeof sortMode)}
            className="glimmer-field w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none transition-colors duration-200"
            style={{
              color: 'var(--aurora-primary)'
            }}
          >
            <option value="updated-desc">{t('Last edited (newest first)')}</option>
            <option value="updated-asc">{t('Last edited (oldest first)')}</option>
            <option value="created-desc">{t('Created date (newest first)')}</option>
            <option value="created-asc">{t('Created date (oldest first)')}</option>
            <option value="title-asc">{t('Title A-Z')}</option>
            <option value="title-desc">{t('Title Z-A')}</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {sortedDiaries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: 'var(--glimmer-surface-muted)' }}>
              <Calendar size={32} strokeWidth={1.5} style={{ color: 'var(--aurora-muted)' }} />
            </div>
            <p className="text-sm text-center" style={{ color: 'var(--aurora-muted)' }}>
              {searchQuery ? t('No diaries found') : t('No diaries yet. Create one!')}
            </p>
            {!searchQuery && (
              <button
                onClick={() => onCreateDiary()}
                className="glimmer-accent-button mt-4 px-4 py-2 text-sm rounded-xl font-medium shadow-sm hover:shadow-md transition-all duration-200 active:scale-95"
              >
                {t('Create first diary')}
              </button>
            )}
          </div>
        ) : (
            sortedDiaries.map(diary => {
            const isLongTermMaster = isLongTermMasterDiary(diary);
            return (
            /* 日记卡片 - 轻量材质，Hover时显示柔和阴影 */
            <div
              key={diary.id}
              draggable={!isLongTermMaster}
              className={`p-4 cursor-pointer transition-colors duration-200 group relative mx-1 my-1.5 rounded-xl border ${
                currentDiaryId === diary.id && !isLongTermMaster
                  ? 'shadow-md'
                  : 'hover:shadow-sm'
              } ${isLongTermMaster ? 'glimmer-system-card' : currentDiaryId === diary.id ? 'glimmer-card-active' : 'glimmer-card'}`}
              style={{
                borderColor: currentDiaryId === diary.id && !isLongTermMaster ? 'var(--glimmer-border-strong)' : undefined
              }}
              onMouseEnter={(e) => {
                if (!isLongTermMaster && currentDiaryId !== diary.id) {
                  e.currentTarget.style.backgroundColor = 'var(--glimmer-surface-card-hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isLongTermMaster && currentDiaryId !== diary.id) {
                  e.currentTarget.style.backgroundColor = 'var(--glimmer-surface-card)';
                }
              }}
              onClick={() => onSelectDiary(diary.id)}
              onDragStart={(e) => {
                if (isLongTermMaster) {
                  e.preventDefault();
                  return;
                }
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('application/x-diary-id', diary.id);
              }}
            >
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="font-semibold truncate tracking-tight flex-1" style={{ color: 'var(--aurora-primary)' }}>
                    {isLongTermMaster ? t('Long-term Master') : (diary.title || t('Untitled'))}
                  </h3>
                  {isLongTermMaster && (
                    <div className="glimmer-system-badge ml-2 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium">
                      <FileText size={13} strokeWidth={1.9} />
                      {t('System Document')}
                    </div>
                  )}
                  {!isLongTermMaster && (
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openMoveModal(diary);
                      }}
                      className="p-1.5 rounded-lg transition-all duration-200 active:scale-95"
                      style={{ color: 'var(--aurora-accent)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--glimmer-surface-active)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      title={t('Move to Folder')}
                    >
                      <Folder size={16} strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openDeleteModal(diary.id);
                      }}
                      className="p-1.5 hover:bg-red-100/50 text-red-500 rounded-lg transition-all duration-200 active:scale-95"
                      title={t('Delete')}
                    >
                      <Trash2 size={16} strokeWidth={1.75} />
                    </button>
                  </div>
                  )}
                </div>
                <p className="text-sm line-clamp-2 mb-2 leading-relaxed" style={{ color: 'var(--aurora-secondary)' }}>
                  {getPreviewText(diary.content) || t('No content')}
                </p>
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--aurora-muted)' }}>
                  <span className="font-medium">{getDiaryWordCount(diary.content)} {t('words')}</span>
                  <span>•</span>
                  {isLongTermMaster ? (
                    <span>{t('Long-term task')}</span>
                  ) : (
                    <>
                      <span>{formatRelativeTime(diary.updatedAt)}</span>
                      <span>•</span>
                      <span>{formatDate(diary.createdAt)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            );
          })
        )}
      </div>

      <Modal
        isOpen={isMoveModalOpen}
        onClose={() => {
          setIsMoveModalOpen(false);
          setMovingDiaryId(null);
          setTargetFolderId(null);
        }}
        title={t('Move to Folder')}
      >
        <div className="mb-5">
          <label className="block text-sm font-medium text-primary-700 mb-2">{t('Select destination folder')}</label>
          <select
            className="glimmer-field w-full px-4 py-2.5 rounded-apple text-primary-900 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none transition-all duration-200"
            value={targetFolderId ?? ''}
            onChange={(e) => setTargetFolderId(e.target.value || null)}
          >
            {/* 选这一项是把日记移出所有文件夹，不是「放进所有日记」。 */}
            <option value="">不放进任何文件夹</option>
            {folderOptions.map(folder => (
              <option key={folder.id} value={folder.id}>
                {'　'.repeat(folder.depth)}{folder.depth > 0 ? '↳ ' : ''}{folder.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-3">
          <Button onClick={handleMoveDiary} className="flex-1">
            {t('Move')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setIsMoveModalOpen(false);
              setMovingDiaryId(null);
              setTargetFolderId(null);
            }}
            className="flex-1"
          >
            {t('Cancel')}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeletingDiaryId(null);
        }}
        title={t('Delete Diary')}
      >
        <p className="text-primary-600 mb-5 leading-relaxed">
          {t('Are you sure you want to delete this diary? This action cannot be undone.')}
        </p>
        <div className="flex gap-3">
          <Button variant="danger" onClick={handleDeleteDiary} className="flex-1">
            {t('Delete')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setIsDeleteModalOpen(false);
              setDeletingDiaryId(null);
            }}
            className="flex-1"
          >
            {t('Cancel')}
          </Button>
        </div>
      </Modal>
    </div>
  );
};

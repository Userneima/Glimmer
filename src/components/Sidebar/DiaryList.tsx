import React, { useMemo, useState } from 'react';
import { Plus, Search, Trash2, Calendar, Folder, Menu, FileText } from 'lucide-react';
import { TEMPLATE_DIARY_ID } from '../../types';
import type { Diary, Folder as DiaryFolder } from '../../types';
import { formatDate, formatRelativeTime } from '../../utils/date';
import { getDiaryWordCount } from '../../utils/text';
import { isLongTermMasterDiary } from '../../utils/diarySystem';
import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';
import { t } from '../../i18n';
import { showToast } from '../../utils/toast';

const DIARY_SORT_MODE_KEY = 'diary-sort-mode';
const DIARY_SORT_MODE_TOUCHED_KEY = 'diary-sort-mode-touched';
type DiarySortMode = 'updated-desc' | 'updated-asc' | 'created-desc' | 'created-asc' | 'title-asc' | 'title-desc';
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
  onCreateDiary: () => void;
  onOpenTemplateDiary?: () => void;
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
  onOpenTemplateDiary,
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

  const filteredDiaries = diaries.filter((diary) => {
    const isLongTermMaster = isLongTermMasterDiary(diary);
    return (
      diary.id !== TEMPLATE_DIARY_ID &&
      (isLongTermMaster || selectedFolderId === null || diary.folderId === selectedFolderId)
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

  // Sort folders by createdAt in descending order (latest first)
  const sortedFolders = useMemo(() => {
    return [...folders].sort((a, b) => {
      const createdAtDiff = b.createdAt - a.createdAt;
      if (createdAtDiff !== 0) return createdAtDiff;
      return b.id.localeCompare(a.id);
    });
  }, [folders]);

  const getPreviewText = (content: string): string => {
    const div = document.createElement('div');
    div.innerHTML = content;
    const text = div.textContent || div.innerText || '';
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
          <div className="flex items-center gap-2">
            {onOpenTemplateDiary && (
              <button
                onClick={onOpenTemplateDiary}
                className="glimmer-card inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium shadow-sm transition-all duration-200 active:scale-95"
                title={t('Diary Template')}
              >
                <FileText size={16} strokeWidth={1.8} />
                <span>{t('Diary Template')}</span>
              </button>
            )}
            {/* 加号按钮 - 弥散光渐变强调色 */}
            <button
              onClick={onCreateDiary}
              className="glimmer-accent-button p-2.5 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 active:scale-95"
              title={t('New Diary')}
            >
              <Plus size={18} strokeWidth={2} />
            </button>
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
                onClick={onCreateDiary}
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
                currentDiaryId === diary.id
                  ? 'shadow-md'
                  : 'hover:shadow-sm'
              } ${isLongTermMaster ? 'glimmer-system-card' : currentDiaryId === diary.id ? 'glimmer-card-active' : 'glimmer-card'}`}
              style={{
                borderColor: currentDiaryId === diary.id ? 'var(--glimmer-border-strong)' : undefined
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
                    <div className="ml-2 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
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
            <option value="">{t('All Diaries')}</option>
            {sortedFolders.map(folder => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
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

import React, { useMemo, useState } from 'react';
import { Plus, Search, Trash2, Calendar, Folder, Menu, FileText } from 'lucide-react';
import { LONG_TERM_MASTER_ID, TEMPLATE_DIARY_ID } from '../../types';
import type { Diary, Folder as DiaryFolder } from '../../types';
import { formatDate, formatRelativeTime } from '../../utils/date';
import { getDiaryWordCount } from '../../utils/text';
import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';
import { t } from '../../i18n';
import { showToast } from '../../utils/toast';

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
  const [sortMode, setSortMode] = useState<
    'updated-desc' | 'updated-asc' | 'created-desc' | 'created-asc' | 'title-asc' | 'title-desc'
  >(() => {
    const saved = localStorage.getItem('diary-sort-mode');
    if (saved && ['updated-desc', 'updated-asc', 'created-desc', 'created-asc', 'title-asc', 'title-desc'].includes(saved)) {
      return saved as 'updated-desc' | 'updated-asc' | 'created-desc' | 'created-asc' | 'title-asc' | 'title-desc';
    }
    return 'updated-desc';
  });

  // 持久化排序模式
  const handleSortModeChange = (newMode: typeof sortMode) => {
    setSortMode(newMode);
    localStorage.setItem('diary-sort-mode', newMode);
  };

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingDiaryId, setDeletingDiaryId] = useState<string | null>(null);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [movingDiaryId, setMovingDiaryId] = useState<string | null>(null);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);

  const getTagColor = (tag: string) => {
    const colors = [
      'bg-blue-100 text-blue-700 border-blue-200',
      'bg-green-100 text-green-700 border-green-200',
      'bg-purple-100 text-purple-700 border-purple-200',
      'bg-pink-100 text-pink-700 border-pink-200',
      'bg-yellow-100 text-yellow-700 border-yellow-200',
      'bg-indigo-100 text-indigo-700 border-indigo-200',
      'bg-red-100 text-red-700 border-red-200',
      'bg-orange-100 text-orange-700 border-orange-200',
    ];
    const index = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[index % colors.length];
  };

  const filteredDiaries = diaries.filter(
    diary =>
      diary.id !== TEMPLATE_DIARY_ID &&
      (diary.id === LONG_TERM_MASTER_ID || selectedFolderId === null || diary.folderId === selectedFolderId)
  );

  const sortedDiaries = useMemo(() => {
    const normalizedTitle = (title: string) => (title || '').trim().toLocaleLowerCase();
    const master = filteredDiaries.find((d) => d.id === LONG_TERM_MASTER_ID);
    const others = filteredDiaries.filter((d) => d.id !== LONG_TERM_MASTER_ID);
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
    <div className="h-full flex flex-col border-r border-slate-200/60" style={{ backgroundColor: 'rgba(255, 255, 255, 0.75)' }}>
      {/* 头部区域 - 轻量半透明 */}
      <div className="p-4" style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)', borderBottom: '1px solid rgba(200, 210, 220, 0.4)' }}>
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
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200/70 bg-white/70 text-sm font-medium text-primary-600 shadow-sm transition-all duration-200 hover:bg-primary-50 active:scale-95"
                title={t('Diary Template')}
              >
                <FileText size={16} strokeWidth={1.8} />
                <span>{t('Diary Template')}</span>
              </button>
            )}
            {/* 加号按钮 - 弥散光渐变强调色 */}
            <button
              onClick={onCreateDiary}
              className="p-2.5 text-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 active:scale-95"
              style={{ background: 'linear-gradient(135deg, var(--aurora-accent) 0%, var(--aurora-accent-alt) 100%)' }}
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
            className="w-full pl-10 pr-4 py-2.5 rounded-xl focus:outline-none transition-colors duration-200"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              color: 'var(--aurora-primary)'
            }}
          />
        </div>

        <div className="mt-3">
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--aurora-muted)' }}>{t('Sort by')}</label>
          <select
            value={sortMode}
            onChange={(e) => handleSortModeChange(e.target.value as typeof sortMode)}
            className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none transition-colors duration-200"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
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
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(241, 245, 249, 0.9)' }}>
              <Calendar size={32} strokeWidth={1.5} style={{ color: 'var(--aurora-muted)' }} />
            </div>
            <p className="text-sm text-center" style={{ color: 'var(--aurora-muted)' }}>
              {searchQuery ? t('No diaries found') : t('No diaries yet. Create one!')}
            </p>
            {!searchQuery && (
              <button
                onClick={onCreateDiary}
                className="mt-4 px-4 py-2 text-sm text-white rounded-xl font-medium shadow-sm hover:shadow-md transition-all duration-200 active:scale-95"
                style={{ background: 'linear-gradient(135deg, var(--aurora-accent) 0%, var(--aurora-accent-alt) 100%)' }}
              >
                {t('Create first diary')}
              </button>
            )}
          </div>
        ) : (
            sortedDiaries.map(diary => (
            /* 日记卡片 - 轻量材质，Hover时显示柔和阴影 */
            <div
              key={diary.id}
              draggable
              className={`p-4 cursor-pointer transition-colors duration-200 group relative mx-1 my-1.5 rounded-xl border border-slate-200/60 ${
                currentDiaryId === diary.id
                  ? 'shadow-md'
                  : 'hover:shadow-sm'
              }`}
              style={{
                backgroundColor: currentDiaryId === diary.id ? 'rgba(14, 165, 233, 0.12)' : 'rgba(255, 255, 255, 0.85)',
                borderColor: currentDiaryId === diary.id ? 'var(--aurora-accent)' : 'rgba(226, 232, 240, 0.6)'
              }}
              onMouseEnter={(e) => {
                if (currentDiaryId !== diary.id) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
                }
              }}
              onMouseLeave={(e) => {
                if (currentDiaryId !== diary.id) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
                }
              }}
              onClick={() => onSelectDiary(diary.id)}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('application/x-diary-id', diary.id);
              }}
            >
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="font-semibold truncate tracking-tight flex-1" style={{ color: 'var(--aurora-primary)' }}>
                    {diary.id === LONG_TERM_MASTER_ID ? t('Long-term Master') : (diary.title || t('Untitled'))}
                  </h3>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openMoveModal(diary);
                      }}
                      className="p-1.5 rounded-lg transition-all duration-200 active:scale-95"
                      style={{ color: 'var(--aurora-accent)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(14, 165, 233, 0.15)'; }}
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
                </div>
                <p className="text-sm line-clamp-2 mb-2 leading-relaxed" style={{ color: 'var(--aurora-secondary)' }}>
                  {getPreviewText(diary.content) || t('No content')}
                </p>
                {diary.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {diary.tags.slice(0, 3).map(tag => (
                      <span
                        key={tag}
                        className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full border ${getTagColor(tag)}`}
                      >
                        {tag}
                      </span>
                    ))}
                    {diary.tags.length > 3 && (
                      <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-primary-100 text-primary-600 border border-primary-200">
                        +{diary.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--aurora-muted)' }}>
                  <span className="font-medium">{getDiaryWordCount(diary.content)} {t('words')}</span>
                  <span>•</span>
                  <span>{formatRelativeTime(diary.updatedAt)}</span>
                  <span>•</span>
                  <span>{formatDate(diary.createdAt)}</span>
                </div>
              </div>
            </div>
          ))
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
            className="w-full px-4 py-2.5 bg-primary-50/80 border border-primary-200 rounded-apple text-primary-900 focus:bg-white focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none transition-all duration-200"
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

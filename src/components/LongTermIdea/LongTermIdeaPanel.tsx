import React, { useMemo, useState } from 'react';
import { useLongTermIdeas } from '../../hooks/useLongTermIdeas';
import { useTasks } from '../../hooks/useTasks';
import { t } from '../../i18n';
import { Trash2, Edit3, ExternalLink, Clock, AlertTriangle, Plus, Flame, ArrowUpDown, Check, Bell } from 'lucide-react';
import { Modal } from '../UI/Modal';
import { showToast } from '../../utils/toast';
import type { LongTermIdeaProgress, LongTermIdea } from '../../types';

interface LongTermIdeaPanelProps {
  onNavigateToDiary?: (diaryId: string, position?: { from: number; to: number }) => void;
}

const progressLabels: Record<LongTermIdeaProgress, string> = {
  'not-started': '未开始',
  'in-progress': '进行中',
  'pending-review': '待核对',
  'completed': '已完成',
};

const progressColors: Record<LongTermIdeaProgress, string> = {
  'not-started': 'bg-slate-100 text-slate-600 border border-slate-200',
  'in-progress': 'bg-sky-100 text-sky-700 border border-sky-200',
  'pending-review': 'bg-amber-100 text-amber-700 border border-amber-200',
  'completed': 'bg-emerald-100 text-emerald-700 border border-emerald-200',
};

const sortOptions = [
  { value: 'created-desc', label: '创建时间' },
  { value: 'created-asc', label: '最早创建' },
  { value: 'updated-desc', label: '最近编辑' },
] as const;

export const LongTermIdeaPanel: React.FC<LongTermIdeaPanelProps> = ({ onNavigateToDiary }) => {
  const {
    filteredIdeas,
    addIdea,
    deleteIdea,
    accessIdea,
    updateIdea,
  } = useLongTermIdeas();
  const { addTask, sendTaskToReminders } = useTasks();

  const [editingIdea, setEditingIdea] = useState<LongTermIdea | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [sortMode, setSortMode] = useState<'created-desc' | 'created-asc' | 'updated-desc'>(() => {
    const saved = localStorage.getItem('firepit-sort-mode');
    return saved === 'created-asc' || saved === 'updated-desc' ? saved : 'created-desc';
  });
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  const handleEdit = (idea: LongTermIdea) => {
    setEditingIdea(idea);
    setEditTitle(idea.title);
    setEditContent(idea.content);
  };

  const resetForm = () => {
    setEditingIdea(null);
    setIsCreating(false);
    setEditTitle('');
    setEditContent('');
  };

  const handleUpdateIdea = () => {
    if (!editingIdea) return;
    
    if (!editTitle.trim()) {
      showToast(t('Title cannot be empty'), 'error');
      return;
    }

    updateIdea(editingIdea.id, {
      title: editTitle.trim(),
      content: editContent,
    });

    resetForm();
    showToast(t('Long-term idea updated'));
  };

  const handleCreateIdea = () => {
    if (!editTitle.trim()) {
      showToast(t('Title cannot be empty'), 'error');
      return;
    }

    addIdea(editTitle.trim(), editContent);
    resetForm();
  };

  const handleJumpToDiary = (idea: LongTermIdea) => {
    accessIdea(idea.id);
    if (idea.originalDeleted) {
      showToast(t('Original diary has been deleted'), 'error');
      return;
    }
    if (onNavigateToDiary) {
      onNavigateToDiary(idea.originalDiaryId, idea.originalPosition);
    }
  };

  const handleDelete = (ideaId: string) => {
    if (confirm(t('Are you sure you want to delete this long-term idea?'))) {
      deleteIdea(ideaId);
    }
  };

  const handleSendIdeaToReminders = (idea: LongTermIdea) => {
    const task = addTask(idea.title || t('Untitled'), {
      notes: idea.content,
      relatedDiaryId: idea.originalDiaryId || null,
      taskType: 'long-term',
      sourceContext: {
        kind: 'long-term-idea',
        ideaId: idea.id,
        diaryId: idea.originalDiaryId || undefined,
        excerpt: idea.content.slice(0, 500),
      },
    });
    void sendTaskToReminders(task.id, task);
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const visibleIdeas = useMemo(() => {
    const items = [...filteredIdeas];
    items.sort((a, b) => {
      switch (sortMode) {
        case 'created-asc':
          return a.createdAt - b.createdAt;
        case 'updated-desc':
          return (b.lastEditedAt ?? b.createdAt) - (a.lastEditedAt ?? a.createdAt);
        case 'created-desc':
        default:
          return b.createdAt - a.createdAt;
      }
    });
    return items;
  }, [filteredIdeas, sortMode]);

  const createButton = (
    <button
      onClick={() => {
        resetForm();
        setIsCreating(true);
      }}
      className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--aurora-accent)] to-[var(--aurora-accent-alt)] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md active:scale-95"
    >
      <Plus size={16} />
      {t('New Spark')}
    </button>
  );

  if (visibleIdeas.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 rounded-[24px] border border-dashed border-slate-200 bg-white/55 px-6 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-sky-500">
          <Flame size={24} strokeWidth={1.8} />
        </div>
        <div className="space-y-2">
          <p className="text-base font-medium text-primary-900">{t('No long-term ideas yet')}</p>
          <p className="max-w-md text-sm leading-6 text-primary-500">
            先丢一颗火花进来。这里适合放还没完全成型、但你知道以后会长成东西的方向。
          </p>
        </div>
        {createButton}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="text-sm text-primary-500">
          {visibleIdeas.length} 条火花
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsSortMenuOpen((prev) => !prev)}
              className="inline-flex items-center rounded-full bg-transparent p-0 text-sm font-medium text-primary-700 transition-colors"
              aria-label={t('Sort by')}
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white/92 text-primary-500 shadow-sm transition-colors hover:border-slate-300 hover:bg-white">
                <ArrowUpDown size={15} />
              </span>
            </button>

            {isSortMenuOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setIsSortMenuOpen(false)}
                  aria-label={t('Close')}
                />
                <div className="absolute right-0 top-[calc(100%+10px)] z-20 min-w-[184px] overflow-hidden rounded-[20px] border border-slate-200 bg-[#f7f8fb] p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
                  {sortOptions.map((option) => {
                    const isActive = option.value === sortMode;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setSortMode(option.value);
                          localStorage.setItem('firepit-sort-mode', option.value);
                          setIsSortMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm transition-colors ${
                          isActive
                            ? 'bg-white text-primary-900 shadow-sm'
                            : 'text-primary-600 hover:bg-white/75'
                        }`}
                      >
                        <span>{option.label}</span>
                        {isActive ? <Check size={16} className="text-sky-500" /> : <span className="w-4" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          {createButton}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-2.5">
          {visibleIdeas.map(idea => (
            <div
              key={idea.id}
              className="group overflow-hidden rounded-[22px] border border-slate-200/80 bg-white/72 shadow-[0_6px_20px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-sky-200/90 hover:bg-white/88"
            >
              <div className="flex items-start gap-3 px-4 py-3.5 md:px-4.5 md:py-3.5">
                <div className="mt-1 h-2.5 w-2.5 flex-none rounded-full bg-gradient-to-br from-[var(--aurora-accent)] to-[var(--aurora-accent-alt)] shadow-[0_0_0_5px_rgba(56,189,248,0.08)]" />
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="truncate text-[15px] font-semibold tracking-[-0.02em] text-primary-900 md:text-[16px]">
                      {idea.title || t('Untitled')}
                    </span>
                    {idea.progress !== 'not-started' && (
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${progressColors[idea.progress]}`}>
                        {progressLabels[idea.progress]}
                      </span>
                    )}
                    {idea.originalDeleted && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                        <AlertTriangle size={12} />
                        {t('Original diary deleted')}
                      </span>
                    )}
                  </div>

                  <p className="line-clamp-2 text-sm leading-7 text-primary-600 md:text-[15px]">
                    {idea.content}
                  </p>

                </div>
              </div>
              <div className="border-t border-slate-200/80 px-4 py-3 md:px-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-primary-400">
                    <Clock size={12} />
                    {t('From')}: {formatDate(idea.createdAt)}
                  </span>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      onClick={() => handleJumpToDiary(idea)}
                      disabled={idea.originalDeleted}
                      className="inline-flex items-center gap-2 rounded-full bg-primary-900 px-3.5 py-2 text-xs font-medium text-white transition-all duration-200 hover:bg-primary-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <ExternalLink size={13} />
                      {t('Jump to original')}
                    </button>
                    <button
                      onClick={() => handleSendIdeaToReminders(idea)}
                      className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3.5 py-2 text-xs font-medium text-sky-600 transition-all duration-200 hover:bg-sky-100"
                    >
                      <Bell size={13} />
                      {t('Send to Reminders')}
                    </button>
                    <button
                      onClick={() => handleEdit(idea)}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-primary-700 transition-all duration-200 hover:bg-slate-50"
                    >
                      <Edit3 size={13} />
                      {t('Edit')}
                    </button>
                    <button
                      onClick={() => handleDelete(idea.id)}
                      className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-600 transition-all duration-200 hover:bg-red-100"
                    >
                      <Trash2 size={13} />
                      {t('Delete')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit / Create Modal */}
      <Modal
        isOpen={!!editingIdea || isCreating}
        onClose={resetForm}
        title={isCreating ? t('New Spark') : t('Edit Long-term Idea')}
        maxWidth="2xl"
      >
        <div className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('Spark Title')}
            </label>
            <input
              type="text"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder={t('Spark title...')}
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('Spark Content')}
            </label>
            <textarea
              className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={12}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={resetForm}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              {t('Cancel')}
            </button>
            <button
              onClick={isCreating ? handleCreateIdea : handleUpdateIdea}
              disabled={!editTitle.trim()}
              className="rounded-full bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {isCreating ? t('Create') : t('Update')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

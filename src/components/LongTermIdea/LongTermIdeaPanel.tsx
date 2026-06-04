import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ExternalLink,
  Inbox,
  ListTodo,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useLongTermIdeas } from '../../hooks/useLongTermIdeas';
import { useTasks } from '../../hooks/useTasks';
import { t } from '../../i18n';
import type { LongTermIdea, LongTermIdeaProgress } from '../../types';
import { Modal } from '../UI/Modal';
import { showToast } from '../../utils/toast';

interface LongTermIdeaPanelProps {
  onNavigateToDiary?: (diaryId: string, position?: { from: number; to: number }) => void;
}

type WorkbenchTab = LongTermIdeaProgress;
type SortMode = 'created-desc' | 'created-asc' | 'updated-desc';

const tabMeta: Array<{
  value: WorkbenchTab;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
}> = [
  {
    value: 'not-started',
    label: '待处理',
    description: '刚从日记里捞出来，还没决定去向。',
    icon: Inbox,
  },
  {
    value: 'in-progress',
    label: '主题库',
    description: '已经确认值得长期保留或反复展开。',
    icon: CheckCircle2,
  },
  {
    value: 'pending-review',
    label: '已转行动',
    description: '已经转成任务或下一步行动。',
    icon: ListTodo,
  },
  {
    value: 'completed',
    label: '已归档',
    description: '暂时不用处理，但保留记录。',
    icon: Archive,
  },
];

const sortOptions: Array<{ value: SortMode; label: string }> = [
  { value: 'created-desc', label: '新线索优先' },
  { value: 'created-asc', label: '旧线索优先' },
  { value: 'updated-desc', label: '最近处理优先' },
];

const statusLabel: Record<LongTermIdeaProgress, string> = {
  'not-started': '未处理线索',
  'in-progress': '长期主题',
  'pending-review': '已转行动',
  completed: '已归档',
};

const statusTone: Record<LongTermIdeaProgress, string> = {
  'not-started': 'border-sky-200 bg-sky-50 text-sky-700',
  'in-progress': 'border-emerald-200 bg-emerald-50 text-emerald-700',
  'pending-review': 'border-amber-200 bg-amber-50 text-amber-700',
  completed: 'border-slate-200 bg-slate-100 text-slate-600',
};

const getModifiedAt = (idea: LongTermIdea) => idea.lastEditedAt ?? idea.lastAccessedAt ?? idea.createdAt;

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

const getEmptyText = (tab: WorkbenchTab) => {
  switch (tab) {
    case 'not-started':
      return '现在没有待处理线索。写日记时遇到值得复用的判断，再放进来。';
    case 'in-progress':
      return '还没有长期主题。只有反复出现、值得继续展开的线索才放这里。';
    case 'pending-review':
      return '还没有转成行动的线索。需要推进的内容可以从待处理里转任务。';
    case 'completed':
      return '还没有归档线索。暂时不处理但不想删除的内容会放这里。';
    default:
      return '';
  }
};

export const LongTermIdeaPanel: React.FC<LongTermIdeaPanelProps> = ({ onNavigateToDiary }) => {
  const { ideas, addIdea, updateIdea, updateProgress, deleteIdea, accessIdea } = useLongTermIdeas();
  const { addTask } = useTasks();

  const [activeTab, setActiveTab] = useState<WorkbenchTab>('not-started');
  const [editingIdea, setEditingIdea] = useState<LongTermIdea | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const saved = localStorage.getItem('clue-workbench-sort-mode');
    return saved === 'created-asc' || saved === 'updated-desc' ? saved : 'created-desc';
  });
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  const counts = useMemo(() => {
    return tabMeta.reduce<Record<WorkbenchTab, number>>((acc, tab) => {
      acc[tab.value] = ideas.filter((idea) => idea.progress === tab.value).length;
      return acc;
    }, {
      'not-started': 0,
      'in-progress': 0,
      'pending-review': 0,
      completed: 0,
    });
  }, [ideas]);

  const visibleIdeas = useMemo(() => {
    const items = ideas.filter((idea) => idea.progress === activeTab);
    items.sort((a, b) => {
      switch (sortMode) {
        case 'created-asc':
          return a.createdAt - b.createdAt;
        case 'updated-desc':
          return getModifiedAt(b) - getModifiedAt(a);
        case 'created-desc':
        default:
          return b.createdAt - a.createdAt;
      }
    });
    return items;
  }, [activeTab, ideas, sortMode]);

  const activeMeta = tabMeta.find((tab) => tab.value === activeTab) ?? tabMeta[0];
  const ActiveIcon = activeMeta.icon;

  const resetForm = () => {
    setEditingIdea(null);
    setIsCreating(false);
    setEditTitle('');
    setEditContent('');
  };

  const startCreate = () => {
    resetForm();
    setIsCreating(true);
  };

  const startEdit = (idea: LongTermIdea) => {
    setEditingIdea(idea);
    setEditTitle(idea.title);
    setEditContent(idea.content);
  };

  const saveEditingIdea = () => {
    if (!editTitle.trim()) {
      showToast(t('Title cannot be empty'), 'error');
      return;
    }

    if (isCreating) {
      const idea = addIdea(editTitle.trim(), editContent.trim());
      updateProgress(idea.id, 'not-started');
      setActiveTab('not-started');
      resetForm();
      return;
    }

    if (!editingIdea) return;
    updateIdea(editingIdea.id, {
      title: editTitle.trim(),
      content: editContent.trim(),
    });
    resetForm();
    showToast('线索已更新');
  };

  const moveIdea = (idea: LongTermIdea, progress: LongTermIdeaProgress, message: string) => {
    updateProgress(idea.id, progress);
    showToast(message);
  };

  const convertToTask = (idea: LongTermIdea) => {
    addTask(idea.title || t('Untitled'), {
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
    updateProgress(idea.id, 'pending-review');
    showToast('已转成任务');
  };

  const jumpToDiary = (idea: LongTermIdea) => {
    accessIdea(idea.id);
    if (idea.originalDeleted || !idea.originalDiaryId) {
      showToast(t('Original diary has been deleted'), 'error');
      return;
    }
    onNavigateToDiary?.(idea.originalDiaryId, idea.originalPosition);
  };

  const handleDelete = (ideaId: string) => {
    if (confirm(t('Are you sure you want to delete this long-term idea?'))) {
      deleteIdea(ideaId);
    }
  };

  const createButton = (
    <button
      onClick={startCreate}
      className="glimmer-accent-button inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-sm transition-all duration-200 hover:shadow-md active:scale-95"
    >
      <Plus size={16} />
      新建线索
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {tabMeta.map(({ value, label, icon: Icon }) => {
          const isActive = activeTab === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setActiveTab(value)}
              className={`rounded-2xl border px-3 py-3 text-left transition-all duration-200 active:scale-[0.98] ${
                isActive ? 'glimmer-card-active' : 'glimmer-card'
              }`}
            >
              <span className="mb-2 flex items-center justify-between gap-2">
                <Icon size={16} strokeWidth={1.9} className={isActive ? 'text-sky-500' : 'text-primary-400'} />
                <span className="rounded-full bg-[var(--glimmer-surface-muted)] px-2 py-0.5 text-xs font-semibold text-primary-500">
                  {counts[value]}
                </span>
              </span>
              <span className="block text-sm font-semibold text-primary-900">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-primary-900">{activeMeta.label}</div>
          <p className="mt-0.5 line-clamp-1 text-xs text-primary-500">{activeMeta.description}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsSortMenuOpen((prev) => !prev)}
              className="glimmer-card inline-flex h-10 w-10 items-center justify-center rounded-2xl border text-primary-500 transition-colors"
              aria-label={t('Sort by')}
            >
              <ArrowUpDown size={15} />
            </button>

            {isSortMenuOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setIsSortMenuOpen(false)}
                  aria-label={t('Close')}
                />
                <div className="glimmer-popover absolute right-0 top-[calc(100%+10px)] z-20 min-w-[184px] overflow-hidden rounded-[20px] border p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
                  {sortOptions.map((option) => {
                    const isActive = option.value === sortMode;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setSortMode(option.value);
                          localStorage.setItem('clue-workbench-sort-mode', option.value);
                          setIsSortMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm transition-colors ${
                          isActive ? 'glimmer-card text-primary-900 shadow-sm' : 'text-primary-600 hover:bg-[var(--glimmer-surface-card-hover)]'
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
        {visibleIdeas.length === 0 ? (
          <div className="glimmer-card flex h-full min-h-[260px] flex-col items-center justify-center gap-4 rounded-[24px] border border-dashed px-6 py-10 text-center">
            <ActiveIcon size={26} strokeWidth={1.7} className="text-primary-400" />
            <div>
              <p className="text-base font-medium text-primary-900">{getEmptyText(activeTab)}</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-primary-500">
                这个入口现在只处理从日记长出来的线索，不再做普通收藏夹。
              </p>
            </div>
            {activeTab === 'not-started' ? createButton : null}
          </div>
        ) : (
          <div className="space-y-2.5">
            {visibleIdeas.map((idea) => (
              <article key={idea.id} className="glimmer-card overflow-hidden rounded-[22px] border transition-all duration-200">
                <div className="px-4 py-3.5 md:px-5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusTone[idea.progress]}`}>
                      {statusLabel[idea.progress]}
                    </span>
                    {idea.originalDeleted ? (
                      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                        原文已删除
                      </span>
                    ) : null}
                  </div>

                  <h3 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-primary-900 md:text-[16px]">
                    {idea.title || t('Untitled')}
                  </h3>
                  {idea.content ? (
                    <p className="mt-2 line-clamp-3 text-sm leading-7 text-primary-600 md:text-[15px]">
                      {idea.content}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-primary-400">没有补充内容。</p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-primary-400">
                    <span>创建：{formatDate(idea.createdAt)}</span>
                    {idea.lastEditedAt ? <span>更新：{formatDate(idea.lastEditedAt)}</span> : null}
                  </div>
                </div>

                <div className="border-t border-slate-200/80 px-4 py-3 md:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      {idea.originalDiaryId ? (
                        <button
                          onClick={() => jumpToDiary(idea)}
                          disabled={idea.originalDeleted}
                          className="glimmer-card inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium text-primary-700 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ExternalLink size={13} />
                          回到原文
                        </button>
                      ) : null}
                      {idea.progress !== 'in-progress' ? (
                        <button
                          onClick={() => moveIdea(idea, 'in-progress', '已归入主题库')}
                          className="glimmer-info-strip inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium"
                        >
                          <CheckCircle2 size={13} />
                          归入主题
                        </button>
                      ) : null}
                      {idea.progress !== 'pending-review' ? (
                        <button
                          onClick={() => convertToTask(idea)}
                          className="glimmer-card inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium text-primary-700 transition-all duration-200"
                        >
                          <ListTodo size={13} />
                          转成任务
                        </button>
                      ) : null}
                      {idea.progress !== 'completed' ? (
                        <button
                          onClick={() => moveIdea(idea, 'completed', '已归档')}
                          className="glimmer-card inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium text-primary-700 transition-all duration-200"
                        >
                          <Archive size={13} />
                          归档
                        </button>
                      ) : (
                        <button
                          onClick={() => moveIdea(idea, 'not-started', '已移回待处理')}
                          className="glimmer-card inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium text-primary-700 transition-all duration-200"
                        >
                          <RotateCcw size={13} />
                          移回待处理
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => startEdit(idea)}
                        className="glimmer-card inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium text-primary-700 transition-all duration-200"
                      >
                        <Pencil size={13} />
                        编辑
                      </button>
                      <button
                        onClick={() => handleDelete(idea.id)}
                        className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-600 transition-all duration-200 hover:bg-red-100"
                      >
                        <Trash2 size={13} />
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={!!editingIdea || isCreating}
        onClose={resetForm}
        title={isCreating ? '新建线索' : '编辑线索'}
        maxWidth="2xl"
      >
        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-primary-700">线索标题</label>
            <input
              type="text"
              className="glimmer-field w-full rounded-2xl px-3 py-2.5 text-sm outline-none transition-all duration-200 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
              placeholder="这条线索在提醒你什么？"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-primary-700">线索内容</label>
            <textarea
              className="glimmer-field w-full resize-none rounded-2xl px-3 py-2.5 text-sm leading-6 outline-none transition-all duration-200 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
              value={editContent}
              onChange={(event) => setEditContent(event.target.value)}
              rows={10}
              placeholder="保留原句、判断依据、或下一步想验证的问题。"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={resetForm} className="glimmer-card rounded-xl border px-4 py-2 text-sm font-medium text-primary-700">
              {t('Cancel')}
            </button>
            <button
              onClick={saveEditingIdea}
              disabled={!editTitle.trim()}
              className="glimmer-accent-button rounded-xl px-4 py-2 text-sm font-medium shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreating ? t('Create') : t('Update')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

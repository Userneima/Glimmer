import React from 'react';
import { ArrowDownToLine, ArrowUpRight, X } from 'lucide-react';
import type { TaskCarryoverSuggestion } from '../../utils/diaryTaskCarryover';
import { formatDate } from '../../utils/date';
import { t } from '../../i18n';

type TaskCarryoverPromptProps = {
  suggestion: TaskCarryoverSuggestion;
  targetDate: number;
  onAccept: () => void;
  onDismiss: () => void;
  onOpenSource: () => void;
};

export const TaskCarryoverPrompt: React.FC<TaskCarryoverPromptProps> = ({
  suggestion,
  targetDate,
  onAccept,
  onDismiss,
  onOpenSource,
}) => {
  const previewTasks = suggestion.tasks.slice(0, 2);
  const hiddenCount = Math.max(0, suggestion.tasks.length - previewTasks.length);

  return (
    <div className="border-b px-4 py-2" style={{ borderColor: 'var(--glimmer-border)', background: 'var(--glimmer-surface-header)' }}>
      <div className="mx-auto flex max-w-5xl flex-col gap-2 rounded-apple border px-3 py-2.5 shadow-apple-sm sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--glimmer-border)', background: 'var(--glimmer-surface-card)' }}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="text-sm font-semibold text-primary-900">
              {t('Carry over unfinished tasks')}
            </p>
            <button
              type="button"
              onClick={onOpenSource}
              className="inline-flex items-center gap-1 text-xs text-primary-500 transition-colors hover:text-accent-500 active:scale-95"
              title={t('Open source diary')}
              aria-label={t('Open source diary')}
            >
              {formatDate(suggestion.sourceDiary.createdAt)} → {formatDate(targetDate)}
              <ArrowUpRight size={12} strokeWidth={1.75} />
            </button>
          </div>
          <p className="mt-1 text-sm text-primary-600">
            {t('Previous diary has unfinished tasks', { count: suggestion.tasks.length })}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {previewTasks.map((task) => (
              <span
                key={task.id}
                className="max-w-full truncate rounded-full border px-2 py-0.5 text-xs text-primary-600"
                style={{ borderColor: 'var(--glimmer-border)', background: 'var(--glimmer-surface-muted)' }}
              >
                {task.text}
              </span>
            ))}
            {hiddenCount > 0 ? (
              <span className="rounded-full px-2 py-0.5 text-xs text-primary-500" style={{ background: 'var(--glimmer-surface-muted)' }}>
                {t('More unfinished tasks', { count: hiddenCount })}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenSource}
            className="inline-flex h-9 items-center gap-1.5 rounded-apple-sm border px-3 text-sm font-medium text-primary-600 transition-all hover:bg-primary-50 hover:text-primary-900 active:scale-95"
            style={{ borderColor: 'var(--glimmer-border)' }}
          >
            <ArrowUpRight size={15} strokeWidth={1.75} />
            {t('Open source diary')}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-9 w-9 items-center justify-center rounded-apple-sm border text-primary-500 transition-all hover:bg-primary-50 hover:text-primary-900 active:scale-95"
            style={{ borderColor: 'var(--glimmer-border)' }}
            title={t('Ignore')}
            aria-label={t('Ignore')}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="inline-flex h-9 items-center gap-2 rounded-apple bg-accent-500 px-3.5 text-sm font-medium text-white shadow-apple transition-all hover:bg-accent-600 active:scale-[0.97]"
          >
            <ArrowDownToLine size={16} strokeWidth={1.75} />
            {t('Carry into this diary')}
          </button>
        </div>
      </div>
    </div>
  );
};

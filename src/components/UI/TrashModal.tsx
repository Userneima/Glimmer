import React, { useMemo, useState } from 'react';
import { RotateCcw, Trash2, Sparkles } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { t } from '../../i18n';
import { formatDate } from '../../utils/date';
import type { TrashedDiary } from '../../types';
import { findAgentDuplicateDiaries } from '../../utils/agentDiaries';
import type { Diary } from '../../types';

type TrashModalProps = {
  isOpen: boolean;
  onClose: () => void;
  trashedDiaries: TrashedDiary[];
  liveDiaries: Diary[];
  retentionDays: number;
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
  onEmpty: () => void;
  onDelete: (id: string) => void;
};

const plainPreview = (html: string) => html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 60);

export const TrashModal: React.FC<TrashModalProps> = ({
  isOpen,
  onClose,
  trashedDiaries,
  liveDiaries,
  retentionDays,
  onRestore,
  onPurge,
  onEmpty,
  onDelete,
}) => {
  const [confirmingEmpty, setConfirmingEmpty] = useState(false);

  // 同一天他自己写过一篇、agent 又推过一篇的日子。没有重复时这个入口不出现。
  const agentDuplicates = useMemo(() => findAgentDuplicateDiaries(liveDiaries), [liveDiaries]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('Trash')}>
      <div className="space-y-3">
        <p className="text-sm text-primary-500">
          {t('Deleted diaries are kept for days', { days: retentionDays })}
        </p>

        {agentDuplicates.length > 0 ? (
          <button
            type="button"
            onClick={() => agentDuplicates.forEach((diary) => onDelete(diary.id))}
            className="flex w-full items-center gap-2 rounded-apple border px-3 py-2 text-left text-sm transition-colors hover:bg-primary-50"
            style={{ borderColor: 'var(--glimmer-border)', background: 'var(--glimmer-surface-card)' }}
          >
            <Sparkles size={15} strokeWidth={1.75} className="flex-shrink-0 text-accent-500" />
            <span className="text-primary-700">
              {t('Clear agent duplicate diaries', { count: agentDuplicates.length })}
            </span>
          </button>
        ) : null}

        {trashedDiaries.length === 0 ? (
          <p className="py-6 text-center text-sm text-primary-400">{t('Trash is empty')}</p>
        ) : (
          <>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {trashedDiaries.map((diary) => (
                <div
                  key={diary.id}
                  className="flex items-start gap-2 rounded-apple border px-3 py-2"
                  style={{ borderColor: 'var(--glimmer-border)', background: 'var(--glimmer-surface-card)' }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-primary-900">
                      {diary.title || t('Untitled')}
                    </p>
                    <p className="truncate text-xs text-primary-500">{plainPreview(diary.content)}</p>
                    <p className="mt-0.5 text-xs text-primary-400">
                      {t('Deleted on', { date: formatDate(diary.deletedAt) })}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onRestore(diary.id)}
                      className="inline-flex h-8 items-center gap-1 rounded-apple-sm border px-2 text-xs text-primary-600 transition-colors hover:bg-primary-50"
                      style={{ borderColor: 'var(--glimmer-border)' }}
                    >
                      <RotateCcw size={13} strokeWidth={1.75} />
                      {t('Restore')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onPurge(diary.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-apple-sm border text-primary-400 transition-colors hover:text-red-500"
                      style={{ borderColor: 'var(--glimmer-border)' }}
                      title={t('Delete permanently')}
                      aria-label={t('Delete permanently')}
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {confirmingEmpty ? (
              <div className="flex items-center justify-between gap-2 rounded-apple border px-3 py-2" style={{ borderColor: 'var(--glimmer-border)' }}>
                <span className="text-sm text-primary-600">{t('Empty the trash for good?')}</span>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setConfirmingEmpty(false)}>{t('Cancel')}</Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      onEmpty();
                      setConfirmingEmpty(false);
                    }}
                  >
                    {t('Empty Trash')}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingEmpty(true)}
                className="text-sm text-primary-500 transition-colors hover:text-red-500"
              >
                {t('Empty Trash')}
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

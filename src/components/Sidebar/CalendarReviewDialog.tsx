import React from 'react';
import { t } from '../../i18n';
import { Modal } from '../UI/Modal';
import type { ReviewDigestDialogProps } from './calendarViewTypes';

export const CalendarReviewDialog: React.FC<ReviewDigestDialogProps> = ({
  isOpen,
  reviewDigest,
  onClose,
  onExport,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={reviewDigest?.periodType === 'week' ? t('Weekly Review') : t('Monthly Review')}
    maxWidth="2xl"
  >
    {reviewDigest && (
      <div className="space-y-4">
        <div className="rounded-2xl bg-sky-50/70 p-4 text-sm leading-relaxed text-slate-700">
          {reviewDigest.summary}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <section className="rounded-2xl border border-slate-100 bg-white/80 p-4">
            <h4 className="mb-2 text-sm font-semibold text-slate-800">{t('Highlights')}</h4>
            <ul className="space-y-1 text-sm text-slate-600">
              {(reviewDigest.highlights.length > 0 ? reviewDigest.highlights : [t('No review clues yet')]).map(item => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-slate-100 bg-white/80 p-4">
            <h4 className="mb-2 text-sm font-semibold text-slate-800">{t('Patterns')}</h4>
            <ul className="space-y-1 text-sm text-slate-600">
              {(reviewDigest.patterns.length > 0 ? reviewDigest.patterns : [t('No repeated patterns yet')]).map(item => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </section>
        </div>
        <div className="flex justify-end">
          <button
            onClick={onExport}
            className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
          >
            {t('Export review')}
          </button>
        </div>
      </div>
    )}
  </Modal>
);

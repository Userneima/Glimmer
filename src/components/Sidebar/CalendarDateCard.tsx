import React from 'react';
import { Calendar as CalendarIconSmall, Sparkles } from 'lucide-react';
import { t } from '../../i18n';
import { formatDate } from '../../utils/date';
import type { DateEntrySectionProps } from './calendarViewTypes';

export const CalendarDateCard: React.FC<DateEntrySectionProps> = ({
  sectionCardStyle,
  selectedDate,
  selectedDateInsights,
  onOpenMonthCalendar,
  onCreateTask,
  onCreateDiary,
  onOpenReviewDigest,
}) => (
  <div
    className="rounded-2xl px-3 py-3"
    style={{
      ...sectionCardStyle,
      background: 'rgba(255, 255, 255, 0.7)',
    }}
  >
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs" style={{ color: 'var(--aurora-muted)' }}>{t('Calendar')}</div>
        <div className="mt-0.5 truncate text-lg font-semibold leading-tight" style={{ color: 'var(--aurora-primary)' }}>
          {formatDate(selectedDate.getTime())}
        </div>
      </div>
      <button
        onClick={onOpenMonthCalendar}
        className="inline-flex h-9 w-10 shrink-0 items-center justify-center rounded-lg transition-all duration-200"
        style={{
          backgroundColor: 'rgba(239, 246, 255, 0.86)',
          color: 'var(--aurora-accent)',
          boxShadow: 'inset 0 0 0 1px rgba(59, 130, 246, 0.12)',
        }}
        onMouseEnter={(event) => { event.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={(event) => { event.currentTarget.style.transform = 'translateY(0)'; }}
        title={t('Month Calendar')}
      >
        <CalendarIconSmall size={19} />
      </button>
    </div>

    <div className="mt-3 flex items-center gap-2">
      <button
        onClick={onCreateTask}
        className="text-sm font-medium px-2.5 py-1.5 rounded-lg transition-all duration-200"
        style={{
          color: 'var(--aurora-accent)',
          backgroundColor: 'transparent',
        }}
        onMouseEnter={(event) => { event.currentTarget.style.backgroundColor = 'rgba(239, 246, 255, 0.86)'; }}
        onMouseLeave={(event) => { event.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        + {t('Task')}
      </button>
      <button
        onClick={onCreateDiary}
        className="text-sm font-medium px-2.5 py-1.5 rounded-lg transition-all duration-200"
        style={{
          color: 'var(--aurora-accent)',
          backgroundColor: 'transparent',
        }}
        onMouseEnter={(event) => { event.currentTarget.style.backgroundColor = 'rgba(239, 246, 255, 0.86)'; }}
        onMouseLeave={(event) => { event.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        + {t('Diary')}
      </button>
    </div>

    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        onClick={() => onOpenReviewDigest('week')}
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
        style={{ color: 'var(--aurora-secondary)', backgroundColor: 'rgba(248, 250, 252, 0.84)' }}
      >
        {t('Weekly Review')}
      </button>
      <button
        onClick={() => onOpenReviewDigest('month')}
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
        style={{ color: 'var(--aurora-secondary)', backgroundColor: 'rgba(248, 250, 252, 0.84)' }}
      >
        {t('Monthly Review')}
      </button>
      {selectedDateInsights.length > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
          <Sparkles size={12} />
          {selectedDateInsights.length} {t('review clues')}
        </span>
      )}
    </div>
  </div>
);

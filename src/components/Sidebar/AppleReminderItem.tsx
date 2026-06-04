import React from 'react';
import { Bell, CalendarClock, Check } from 'lucide-react';
import type { AppleReminder } from '../../types';
import { formatDate, formatTime } from '../../utils/date';
import { t } from '../../i18n';

interface AppleReminderItemProps {
  reminder: AppleReminder;
  compact?: boolean;
  completing?: boolean;
  onComplete?: (reminder: AppleReminder) => void;
}

export const AppleReminderItem: React.FC<AppleReminderItemProps> = ({
  reminder,
  compact = false,
  completing = false,
  onComplete,
}) => {
  const dueText = reminder.dueAt
    ? new Date(reminder.dueAt).toDateString() === new Date().toDateString()
      ? formatTime(reminder.dueAt)
      : formatDate(reminder.dueAt)
    : t('No due date');

  return (
    <li
      className={`glimmer-card rounded-xl border ${compact ? 'px-3 py-2' : 'p-3'} shadow-sm`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          disabled={completing || !onComplete}
          onClick={() => onComplete?.(reminder)}
          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all ${
            completing
              ? 'border-sky-200 bg-sky-50 text-sky-400'
              : 'border-slate-300 bg-white text-transparent hover:border-sky-400 hover:bg-sky-50 hover:text-sky-500'
          }`}
          title={t('Complete reminder')}
          aria-label={t('Complete reminder')}
        >
          <Check size={12} strokeWidth={2.4} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-medium text-primary-900">{reminder.title}</div>
          {!compact && reminder.notes && (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-primary-500">{reminder.notes}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-primary-400">
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-sky-600">
              <Bell size={10} />
              {t('Reminders')}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarClock size={11} />
              {dueText}
            </span>
            {reminder.calendarTitle && <span>{reminder.calendarTitle}</span>}
          </div>
        </div>
      </div>
    </li>
  );
};

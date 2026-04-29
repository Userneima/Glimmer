import React from 'react';
import { Bell, CalendarClock } from 'lucide-react';
import type { AppleReminder } from '../../types';
import { formatDate, formatTime } from '../../utils/date';
import { t } from '../../i18n';

interface AppleReminderItemProps {
  reminder: AppleReminder;
  compact?: boolean;
}

export const AppleReminderItem: React.FC<AppleReminderItemProps> = ({ reminder, compact = false }) => {
  const dueText = reminder.dueAt
    ? new Date(reminder.dueAt).toDateString() === new Date().toDateString()
      ? formatTime(reminder.dueAt)
      : formatDate(reminder.dueAt)
    : t('No due date');

  return (
    <li
      className={`rounded-xl border border-sky-100 bg-white/85 ${compact ? 'px-3 py-2' : 'p-3'} shadow-sm`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-500">
          <Bell size={12} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-medium text-primary-900">{reminder.title}</div>
          {!compact && reminder.notes && (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-primary-500">{reminder.notes}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-primary-400">
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

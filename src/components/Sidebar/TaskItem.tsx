import React from 'react';
import { Bell, Calendar as CalendarIcon, ChevronDown, ChevronUp, Clock, Edit, Sparkles, Trash2 } from 'lucide-react';
import type { Task } from '../../types';
import { t } from '../../i18n';

interface TaskItemProps {
  task: Task;
  isActiveTabCompleted: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggleComplete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSendToReminders: () => void;
  formatDateRange: (startDate: number | null | undefined, endDate: number | null | undefined) => string;
  formatCompletedDate: (timestamp: number | null | undefined) => string;
}

export const TaskItem: React.FC<TaskItemProps> = ({
  task,
  isActiveTabCompleted,
  canMoveUp,
  canMoveDown,
  onToggleComplete,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
  onSendToReminders,
  formatDateRange,
  formatCompletedDate,
}) => {
  const remindersLink = task.externalLinks?.find(link => link.provider === 'apple-reminders');
  const isLinkedToReminders = remindersLink?.status === 'linked';
  const reminderStatusText = isLinkedToReminders
    ? `${t('Sent to Reminders')}${remindersLink.calendarTitle ? ` · ${remindersLink.calendarTitle}` : ''}`
    : remindersLink?.status === 'failed'
      ? t('Reminders send failed')
      : null;

  return (
    <li
      className="glimmer-card p-3 rounded-xl border transition-colors duration-200"
    >
      <div className="flex items-center gap-2">
        <div className="task-item flex-1 min-w-0 flex items-center gap-2">
          <input
            type="checkbox"
            checked={task.completed}
            onChange={onToggleComplete}
            className="w-4 h-4 rounded border-2 border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer flex-shrink-0"
            title={t('Mark as completed')}
          />
          <span
            className={`task-text text-sm font-medium ${
              task.completed ? 'line-through text-gray-400' : 'text-gray-800'
            }`}
          >
            {task.title}
          </span>
          {task.taskType === 'long-term' ? (
            <span title={t('Long-term task')}>
              <Clock size={12} className="text-gray-400 flex-shrink-0" />
            </span>
          ) : (
            <span title={t('Time-range task')}>
              <CalendarIcon size={12} className="text-orange-500 flex-shrink-0" />
            </span>
          )}
        </div>
        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
          <Sparkles size={10} />
          {t('Glimmer')}
        </span>
        <div className="flex flex-col gap-1 flex-shrink-0">
          {!isActiveTabCompleted && (
            <>
              <button
                onClick={onMoveUp}
                disabled={!canMoveUp}
                className="text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                title={t('Move Up')}
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={onMoveDown}
                disabled={!canMoveDown}
                className="text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                title={t('Move Down')}
              >
                <ChevronDown size={14} />
              </button>
            </>
          )}
          <button
            onClick={onSendToReminders}
            disabled={isLinkedToReminders}
            className="text-sky-500 hover:text-sky-700 disabled:text-gray-300 disabled:cursor-not-allowed flex-shrink-0"
            title={isLinkedToReminders ? t('Already sent to Reminders') : t('Send to Reminders')}
          >
            <Bell size={14} />
          </button>
          <button
            onClick={onEdit}
            className="text-blue-500 hover:text-blue-700 flex-shrink-0"
            title={t('Edit')}
          >
            <Edit size={14} />
          </button>
          <button
            onClick={onDelete}
            className="text-red-500 hover:text-red-700 flex-shrink-0"
            title={t('Delete')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {(task.notes ||
        (task.taskType === 'time-range' && task.startDate && task.endDate) ||
        reminderStatusText ||
        (isActiveTabCompleted && task.completedAt)) && (
        <div className="ml-6 mt-1">
          {task.notes && (
            <p className="text-xs text-gray-500 line-clamp-2">{task.notes}</p>
          )}
          {task.taskType === 'time-range' && task.startDate && task.endDate && (
            <p className="text-xs text-orange-600">
              {formatDateRange(task.startDate, task.endDate)}
            </p>
          )}
          {isActiveTabCompleted && task.completedAt && (
            <p className="text-xs text-green-600 flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              {t('Completed at')} {formatCompletedDate(task.completedAt)}
            </p>
          )}
          {reminderStatusText && (
            <p className={`mt-1 text-xs ${isLinkedToReminders ? 'text-sky-600' : 'text-amber-600'}`}>
              {reminderStatusText}
            </p>
          )}
        </div>
      )}
    </li>
  );
};

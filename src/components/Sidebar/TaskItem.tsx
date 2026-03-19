import React from 'react';
import { Calendar as CalendarIcon, ChevronDown, ChevronUp, Clock, Edit, Trash2 } from 'lucide-react';
import type { Task } from '../../types';
import { t } from '../../i18n';
import type { Tag } from '../../types';

interface TaskItemProps {
  task: Task;
  isActiveTabCompleted: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  bulkSelectMode: boolean;
  isSelectedForBulk: boolean;
  onToggleBulkSelect: () => void;
  onToggleComplete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
  formatDateRange: (startDate: number | null | undefined, endDate: number | null | undefined) => string;
  formatCompletedDate: (timestamp: number | null | undefined) => string;
  tags: Tag[];
}

export const TaskItem: React.FC<TaskItemProps> = ({
  task,
  isActiveTabCompleted,
  canMoveUp,
  canMoveDown,
  bulkSelectMode,
  isSelectedForBulk,
  onToggleBulkSelect,
  onToggleComplete,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
  formatDateRange,
  formatCompletedDate,
  tags,
}) => {
  const getContrastTextColor = (backgroundColor: string): string => {
    const hex = backgroundColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#000000' : '#ffffff';
  };

  const tagObjects = (task.tags || [])
    .map((tagId) => tags.find((t) => t.id === tagId))
    .filter((tag): tag is Tag => Boolean(tag));

  return (
    <li
      className="p-3 rounded-xl border transition-colors duration-200"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderColor: 'rgba(226, 232, 240, 0.6)',
      }}
    >
      <div className="flex items-center gap-2">
        <div className="task-item flex-1 min-w-0 flex items-center gap-2">
          {bulkSelectMode && (
            <input
              type="checkbox"
              checked={isSelectedForBulk}
              onChange={onToggleBulkSelect}
              className="w-4 h-4 rounded border-2 border-purple-500 text-purple-600 focus:ring-purple-500 cursor-pointer flex-shrink-0"
              title={t('Select for bulk operation')}
            />
          )}
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
        (task.tags && task.tags.length > 0) ||
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
          {tagObjects.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {tagObjects.slice(0, 2).map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center px-2 py-0.5 text-xs rounded-full"
                  style={{
                    backgroundColor: tag.color,
                    color: getContrastTextColor(tag.color),
                  }}
                >
                  {tag.name}
                </span>
              ))}
              {tagObjects.length > 2 && (
                <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-700">
                  +{tagObjects.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
};


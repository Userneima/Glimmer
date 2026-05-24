import React from 'react';
import { Calendar as CalendarIcon, Calendar as CalendarIconSmall, Sparkles } from 'lucide-react';
import { t } from '../../i18n';
import { getDomainLabel } from '../../utils/diaryReview';
import type { DayContentSectionProps } from './calendarViewTypes';

export const CalendarDayContent: React.FC<DayContentSectionProps> = ({
  sectionCardStyle,
  diaries,
  tasks,
  insights,
  onCreateDiary,
  onCreateTask,
  onSelectDiary,
  onEditDiaryDate,
  onToggleTask,
  formatDateRange,
}) => {
  if (diaries.length === 0 && tasks.length === 0 && insights.length === 0) {
    return (
      <div
        className="text-center py-7 px-4 rounded-2xl"
        style={{ ...sectionCardStyle, color: 'var(--aurora-muted)' }}
      >
        <p className="text-sm">{t('No diaries or tasks on this date')}</p>
        <div className="flex justify-center gap-3 mt-2">
          <button
            onClick={onCreateDiary}
            className="text-sm px-3 py-1.5 rounded-xl transition-all duration-200"
            style={{ color: 'var(--aurora-accent)' }}
            onMouseEnter={(event) => { event.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.5)'; }}
            onMouseLeave={(event) => { event.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            {t('Create diary')}
          </button>
          <button
            onClick={onCreateTask}
            className="text-sm px-3 py-1.5 rounded-xl transition-all duration-200"
            style={{ color: 'var(--aurora-accent)' }}
            onMouseEnter={(event) => { event.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.5)'; }}
            onMouseLeave={(event) => { event.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            {t('Create task')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <section className="rounded-2xl p-3.5" style={sectionCardStyle}>
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--aurora-secondary)' }}>
          <CalendarIconSmall size={15} style={{ color: 'var(--aurora-accent)' }} />
          {t('Tasks')} ({tasks.length})
        </h4>
        {tasks.length > 0 ? (
          <div className="space-y-2">
            {tasks.map(task => (
              <div
                key={task.id}
                className="p-2.5 border border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50/80 rounded-xl shadow-sm"
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => onToggleTask(task.id)}
                    className="mt-0.5 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-medium ${task.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                      {task.title}
                    </span>
                    {task.notes && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.notes}</p>
                    )}
                    {task.startDate && task.endDate && (
                      <p className="text-xs text-orange-600 mt-1">
                        {formatDateRange(task.startDate, task.endDate)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <button
            onClick={onCreateTask}
            className="w-full text-left rounded-lg px-3 py-2.5 text-sm transition-colors"
            style={{
              color: 'var(--aurora-accent)',
              backgroundColor: 'rgba(239, 246, 255, 0.58)',
            }}
          >
            + {t('Create task')}
          </button>
        )}
      </section>

      <section className="rounded-2xl p-3.5" style={sectionCardStyle}>
        <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
          <CalendarIcon size={14} className="text-blue-600" />
          {t('Diaries')} ({diaries.length})
        </h4>
        {diaries.length > 0 ? (
          <div className="space-y-2">
            {diaries.map(diary => (
              <div
                key={diary.id}
                onClick={() => onSelectDiary(diary.id)}
                className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="mr-4 min-w-0">
                    <h4 className="font-medium text-gray-900 mb-1 truncate">
                      {diary.title || t('Untitled')}
                    </h4>
                    {diary.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {diary.tags.slice(0, 3).map(tag => (
                          <span
                            key={tag}
                            className="inline-block px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0 ml-2">
                    <button
                      onClick={(event) => { event.stopPropagation(); onEditDiaryDate(diary); }}
                      className="text-sm text-gray-500 hover:text-blue-600 p-1 rounded"
                      title={t('Change Date')}
                    >
                      <CalendarIcon size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <button
            onClick={onCreateDiary}
            className="w-full text-left rounded-lg px-3 py-2.5 text-sm transition-colors"
            style={{
              color: 'var(--aurora-accent)',
              backgroundColor: 'rgba(239, 246, 255, 0.58)',
            }}
          >
            + {t('Create diary')}
          </button>
        )}
      </section>

      {insights.length > 0 && (
        <section className="rounded-2xl p-3.5" style={sectionCardStyle}>
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--aurora-secondary)' }}>
            <Sparkles size={14} style={{ color: 'var(--aurora-accent)' }} />
            {t('Review clues')} ({insights.length})
          </h4>
          <div className="space-y-2">
            {insights.slice(0, 3).map(insight => (
              <div key={insight.id} className="rounded-xl bg-sky-50/70 px-3 py-2">
                <p className="line-clamp-2 text-sm text-slate-700">{insight.summary}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {insight.domains.slice(0, 4).map(domain => (
                    <span key={domain} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-sky-700">
                      {getDomainLabel(domain)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

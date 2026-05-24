import React from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { Calendar as CalendarIcon, Calendar as CalendarIconSmall, Sparkles } from 'lucide-react';
import { t } from '../../i18n';
import { getInsightItems } from '../../utils/diaryReview';
import { Modal } from '../UI/Modal';
import type { MonthCalendarDialogProps } from './calendarViewTypes';

export const CalendarMonthDialog: React.FC<MonthCalendarDialogProps> = ({
  isOpen,
  monthPreviewDate,
  sectionCardStyle,
  monthPreviewDiaries,
  monthPreviewTasks,
  monthPreviewInsights,
  reasonQuery,
  reasonResults,
  tileContent,
  tileClassName,
  onClose,
  onMonthDateClick,
  onSelectDate,
  onSelectDiary,
  onReasonQueryChange,
  onSearchReasons,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={t('Month Calendar')}
    maxWidth="xl"
  >
    <div className="space-y-4">
      <div className="calendar-container rounded-[24px] p-3" style={sectionCardStyle}>
        <Calendar
          onChange={(value) => onMonthDateClick(value as Date)}
          value={monthPreviewDate}
          tileContent={tileContent}
          tileClassName={tileClassName}
          locale="zh-CN"
          className="w-full border-none shadow-sm rounded-xl"
        />
      </div>

      <div className="rounded-[24px] p-4" style={sectionCardStyle}>
        <div className="grid gap-3 md:grid-cols-2">
          <section
            className="rounded-[20px] p-4"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.76)', border: '1px solid rgba(255,255,255,0.6)' }}
          >
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--aurora-secondary)' }}>
              <CalendarIconSmall size={15} style={{ color: 'var(--aurora-accent)' }} />
              {t('Tasks')} ({monthPreviewTasks.length})
            </h4>
            {monthPreviewTasks.length > 0 ? (
              <div className="space-y-2">
                {monthPreviewTasks.slice(0, 4).map(task => (
                  <div
                    key={task.id}
                    className="rounded-2xl border border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50/80 px-3 py-2"
                  >
                    <div className="text-sm font-medium text-gray-800 line-clamp-1">{task.title}</div>
                    {task.notes && (
                      <div className="mt-1 text-xs text-gray-500 line-clamp-2">{task.notes}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--aurora-muted)' }}>{t('No tasks on this date')}</p>
            )}
          </section>

          <section
            className="rounded-[20px] p-4"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.76)', border: '1px solid rgba(255,255,255,0.6)' }}
          >
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
              <CalendarIcon size={14} className="text-blue-600" />
              {t('Diaries')} ({monthPreviewDiaries.length})
            </h4>
            {monthPreviewDiaries.length > 0 ? (
              <div className="space-y-2">
                {monthPreviewDiaries.slice(0, 4).map(diary => (
                  <button
                    key={diary.id}
                    onClick={() => {
                      onSelectDate(monthPreviewDate);
                      onClose();
                      onSelectDiary(diary.id);
                    }}
                    className="block w-full rounded-2xl border border-gray-200 bg-white/80 px-3 py-2 text-left transition-colors hover:bg-white"
                  >
                    <div className="text-sm font-medium text-gray-900 line-clamp-1">{diary.title || t('Untitled')}</div>
                    {diary.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {diary.tags.slice(0, 3).map(tag => (
                          <span
                            key={tag}
                            className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--aurora-muted)' }}>{t('No diaries on this date')}</p>
            )}
          </section>
        </div>

        {monthPreviewInsights.length > 0 && (
          <section
            className="mt-3 rounded-[20px] p-4"
            style={{ backgroundColor: 'rgba(240, 249, 255, 0.72)', border: '1px solid rgba(186,230,253,0.72)' }}
          >
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--aurora-secondary)' }}>
              <Sparkles size={15} style={{ color: 'var(--aurora-accent)' }} />
              {t('Review clues')} ({monthPreviewInsights.length})
            </h4>
            <div className="space-y-2">
              {monthPreviewInsights.slice(0, 3).map(insight => (
                <div key={insight.id} className="rounded-2xl bg-white/80 px-3 py-2">
                  <p className="line-clamp-2 text-sm text-slate-700">{insight.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {getInsightItems(insight).slice(0, 4).map(item => (
                      <span key={item.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                        {item.title}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section
          className="mt-3 rounded-[20px] p-4"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.76)', border: '1px solid rgba(255,255,255,0.6)' }}
        >
          <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--aurora-secondary)' }}>{t('Find reason from this day')}</h4>
          <div className="flex gap-2">
            <input
              value={reasonQuery}
              onChange={(event) => onReasonQueryChange(event.target.value)}
              placeholder={t('e.g. why absent from class')}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-sky-300"
            />
            <button
              onClick={onSearchReasons}
              className="rounded-xl px-3 py-2 text-sm font-medium text-sky-700"
              style={{ backgroundColor: 'rgba(224, 242, 254, 0.8)' }}
            >
              {t('Find')}
            </button>
          </div>
          {reasonResults.length > 0 && (
            <div className="mt-3 space-y-2">
              {reasonResults.map(result => (
                <button
                  key={result.diaryId}
                  onClick={() => {
                    onSelectDate(new Date(result.date));
                    onClose();
                    onSelectDiary(result.diaryId);
                  }}
                  className="block w-full rounded-xl bg-slate-50 px-3 py-2 text-left text-sm text-slate-700"
                >
                  <div className="font-medium">{result.reason}</div>
                  {result.evidence[0]?.text && (
                    <div className="mt-1 line-clamp-2 text-xs text-slate-500">{result.evidence[0].text}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  </Modal>
);

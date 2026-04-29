import React, { useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import type { Diary, Task } from '../../types';
import { formatDate } from '../../utils/date';
import { Calendar as CalendarIcon, Clock, Calendar as CalendarIconSmall } from 'lucide-react';
import { Modal } from '../UI/Modal';
import { t } from '../../i18n';
import { useTasks } from '../../hooks/useTasks';
import type { TaskType } from '../../types';

interface CalendarViewProps {
  diaries: Diary[];
  onSelectDiary: (id: string) => void;
  onCreateDiary: (date: Date) => void;
  onChangeDiaryDate: (id: string, date: Date) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  diaries,
  onSelectDiary,
  onCreateDiary,
  onChangeDiaryDate,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMonthCalendarOpen, setIsMonthCalendarOpen] = useState(false);
  const [monthPreviewDate, setMonthPreviewDate] = useState<Date>(new Date());
  const [editingDiary, setEditingDiary] = useState<Diary | null>(null);
  const [editDateStr, setEditDateStr] = useState('');

  // Task integration
  const { getTasksForDate, addTask, toggleComplete } = useTasks();
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskNotes, setNewTaskNotes] = useState('');
  const [newTaskType, setNewTaskType] = useState<TaskType>('time-range');
  const [newTaskStartDate, setNewTaskStartDate] = useState('');
  const [newTaskEndDate, setNewTaskEndDate] = useState('');

  const openEditDateModal = (diary: Diary) => {
    setEditingDiary(diary);
    setEditDateStr(new Date(diary.createdAt).toISOString().slice(0, 10));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingDiary(null);
    setEditDateStr('');
  };

  const handleSaveDate = () => {
    if (!editingDiary || !editDateStr) return;
    const newDate = new Date(editDateStr);
    onChangeDiaryDate(editingDiary.id, newDate);
    closeModal();
  };

  // 按日期分组日记
  const diariesByDate = React.useMemo(() => {
    const map = new Map<string, Diary[]>();
    diaries.forEach(diary => {
      const dateKey = new Date(diary.createdAt).toDateString();
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(diary);
    });
    return map;
  }, [diaries]);

  // 获取某天的日记数量
  const getDiaryCountForDate = (date: Date): number => {
    const dateKey = date.toDateString();
    return diariesByDate.get(dateKey)?.length || 0;
  };

  // 获取某天的任务数量
  const getTaskCountForDate = (date: Date): number => {
    return getTasksForDate(date).length;
  };

  // 获取选中日期的日记和任务
  const selectedDateDiaries = diariesByDate.get(selectedDate.toDateString()) || [];
  const selectedDateTasks = getTasksForDate(selectedDate);
  const monthPreviewDiaries = diariesByDate.get(monthPreviewDate.toDateString()) || [];
  const monthPreviewTasks = getTasksForDate(monthPreviewDate);

  // 自定义日期单元格内容
  const tileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view === 'month') {
      const diaryCount = getDiaryCountForDate(date);
      const taskCount = getTaskCountForDate(date);

      if (diaryCount > 0 || taskCount > 0) {
        return (
          <div className="flex justify-center gap-1 mt-1">
            {diaryCount > 0 && (
              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
            )}
            {taskCount > 0 && (
              <div className="w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
            )}
          </div>
        );
      }
    }
    return null;
  };

  // 自定义日期单元格样式
  const tileClassName = ({ date, view }: { date: Date; view: string }) => {
    if (view === 'month') {
      const diaryCount = getDiaryCountForDate(date);
      const taskCount = getTaskCountForDate(date);
      const isSelected = date.toDateString() === monthPreviewDate.toDateString();
      const isToday = date.toDateString() === new Date().toDateString();

      let classes = 'relative ';
      if (diaryCount > 0 || taskCount > 0) classes += 'font-semibold ';
      if (isSelected) classes += 'bg-blue-100 ';
      if (isToday) classes += 'text-blue-600 ';

      return classes;
    }
    return '';
  };

  const openMonthCalendar = () => {
    setMonthPreviewDate(selectedDate);
    setIsMonthCalendarOpen(true);
  };

  const handleMonthDateClick = (date: Date) => {
    setMonthPreviewDate(date);
    setSelectedDate(date);
  };

  const handleCreateDiaryForDate = () => {
    onCreateDiary(selectedDate);
  };

  const handleCreateTaskForDate = () => {
    // Format date as YYYY-MM-DD in local timezone
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    setNewTaskStartDate(dateStr);
    setNewTaskEndDate(dateStr);
    setNewTaskType('time-range');
    setShowCreateTaskModal(true);
  };

  const handleCreateTask = () => {
    if (!newTaskTitle.trim()) return;

    const taskData: {
      notes?: string;
      taskType: Task['taskType'];
      startDate?: number;
      endDate?: number;
    } = {
      notes: newTaskNotes.trim() || undefined,
      taskType: newTaskType,
    };

    if (newTaskType === 'time-range') {
      if (newTaskStartDate) {
        taskData.startDate = new Date(newTaskStartDate).getTime();
      }
      if (newTaskEndDate) {
        taskData.endDate = new Date(newTaskEndDate).setHours(23, 59, 59, 999);
      }
    }

    addTask(newTaskTitle.trim(), taskData);

    // Reset form
    setNewTaskTitle('');
    setNewTaskNotes('');
    setNewTaskType('time-range');
    setNewTaskStartDate('');
    setNewTaskEndDate('');
    setShowCreateTaskModal(false);
  };

  const formatDateRange = (startDate: number | null | undefined, endDate: number | null | undefined) => {
    if (!startDate || !endDate) return '';
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
  };

  const sectionCardStyle = {
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    border: '1px solid rgba(226, 232, 240, 0.72)',
    boxShadow: '0 8px 24px rgba(148, 163, 184, 0.06)',
  };

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'rgba(255, 255, 255, 0.75)' }}>
      {/* 标题区 - 毛玻璃风 */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.2)' }}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--aurora-primary)' }}>{t('Calendar View')}</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-3 space-y-3">
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
                onClick={openMonthCalendar}
                className="inline-flex h-9 w-10 shrink-0 items-center justify-center rounded-lg transition-all duration-200"
                style={{
                  backgroundColor: 'rgba(239, 246, 255, 0.86)',
                  color: 'var(--aurora-accent)',
                  boxShadow: 'inset 0 0 0 1px rgba(59, 130, 246, 0.12)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                title={t('Month Calendar')}
              >
                <CalendarIconSmall size={19} />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={handleCreateTaskForDate}
                className="text-sm font-medium px-2.5 py-1.5 rounded-lg transition-all duration-200"
                style={{
                  color: 'var(--aurora-accent)',
                  backgroundColor: 'transparent',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239, 246, 255, 0.86)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                + {t('Task')}
              </button>
              <button
                onClick={handleCreateDiaryForDate}
                className="text-sm font-medium px-2.5 py-1.5 rounded-lg transition-all duration-200"
                style={{
                  color: 'var(--aurora-accent)',
                  backgroundColor: 'transparent',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239, 246, 255, 0.86)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                + {t('Diary')}
              </button>
            </div>
          </div>

          {selectedDateDiaries.length === 0 && selectedDateTasks.length === 0 ? (
            <div
              className="text-center py-7 px-4 rounded-2xl"
              style={{ ...sectionCardStyle, color: 'var(--aurora-muted)' }}
            >
              <p className="text-sm">{t('No diaries or tasks on this date')}</p>
              <div className="flex justify-center gap-3 mt-2">
                <button
                  onClick={handleCreateDiaryForDate}
                  className="text-sm px-3 py-1.5 rounded-xl transition-all duration-200"
                  style={{ color: 'var(--aurora-accent)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.5)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  {t('Create diary')}
                </button>
                <button
                  onClick={handleCreateTaskForDate}
                  className="text-sm px-3 py-1.5 rounded-xl transition-all duration-200"
                  style={{ color: 'var(--aurora-accent)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.5)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  {t('Create task')}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <section className="rounded-2xl p-3.5" style={sectionCardStyle}>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--aurora-secondary)' }}>
                  <CalendarIconSmall size={15} style={{ color: 'var(--aurora-accent)' }} />
                  {t('Tasks')} ({selectedDateTasks.length})
                </h4>
                {selectedDateTasks.length > 0 ? (
                  <div className="space-y-2">
                    {selectedDateTasks.map(task => (
                      <div
                        key={task.id}
                        className="p-2.5 border border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50/80 rounded-xl shadow-sm"
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={task.completed}
                            onChange={() => toggleComplete(task.id)}
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
                    onClick={handleCreateTaskForDate}
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
                    {t('Diaries')} ({selectedDateDiaries.length})
                </h4>
                {selectedDateDiaries.length > 0 ? (
                  <div className="space-y-2">
                    {selectedDateDiaries.map(diary => (
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
                              onClick={(e) => { e.stopPropagation(); openEditDateModal(diary); }}
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
                    onClick={handleCreateDiaryForDate}
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

              <Modal isOpen={isModalOpen} onClose={closeModal} title={t('Change Diary Date')}>
                <div>
                  <p className="text-sm text-gray-600 mb-2">{t('Diary')}: <strong>{editingDiary?.title || t('Untitled')}</strong></p>
                  <input
                    type="date"
                    value={editDateStr}
                    onChange={(e) => setEditDateStr(e.target.value)}
                    className="border rounded px-3 py-2 w-full"
                  />
                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      onClick={closeModal}
                      className="px-3 py-2 bg-gray-100 rounded"
                    >
                      {t('Cancel')}
                    </button>
                    <button
                      onClick={handleSaveDate}
                      className="px-3 py-2 bg-blue-600 text-white rounded"
                    >
                      {t('Save')}
                    </button>
                  </div>
                </div>
              </Modal>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isMonthCalendarOpen}
        onClose={() => setIsMonthCalendarOpen(false)}
        title={t('Month Calendar')}
        maxWidth="xl"
      >
        <div className="space-y-4">
          <div className="calendar-container rounded-[24px] p-3" style={sectionCardStyle}>
            <Calendar
              onChange={(value) => handleMonthDateClick(value as Date)}
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
                          setSelectedDate(monthPreviewDate);
                          setIsMonthCalendarOpen(false);
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
          </div>
        </div>
      </Modal>

      {/* Create Task Modal */}
      <Modal
        isOpen={showCreateTaskModal}
        onClose={() => setShowCreateTaskModal(false)}
        title={t('Create New Task')}
      >
          <div className="space-y-4">
            {/* Task Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('Task Title')}
              </label>
              <input
                type="text"
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder={t('Enter task title')}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                autoFocus
              />
            </div>

            {/* Task Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('Notes')} <span className="text-gray-400 text-xs">({t('Optional')})</span>
              </label>
              <textarea
                className="w-full border rounded px-3 py-2 text-sm resize-none"
                placeholder={t('Add notes...')}
                value={newTaskNotes}
                onChange={(e) => setNewTaskNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Task Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('Task Type')}
              </label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="taskType"
                    value="long-term"
                    checked={newTaskType === 'long-term'}
                    onChange={(e) => setNewTaskType(e.target.value as TaskType)}
                  />
                  <Clock size={16} className="text-gray-600" />
                  <span className="text-sm">{t('Long-term task')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="taskType"
                    value="time-range"
                    checked={newTaskType === 'time-range'}
                    onChange={(e) => setNewTaskType(e.target.value as TaskType)}
                  />
                  <CalendarIconSmall size={16} className="text-orange-500" />
                  <span className="text-sm">{t('Time-range task')}</span>
                </label>
              </div>
            </div>

            {/* Date Range (only for time-range tasks) */}
            {newTaskType === 'time-range' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('Start Date')}
                  </label>
                  <input
                    type="date"
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={newTaskStartDate}
                    onChange={(e) => setNewTaskStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('End Date')}
                  </label>
                  <input
                    type="date"
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={newTaskEndDate}
                    onChange={(e) => setNewTaskEndDate(e.target.value)}
                    min={newTaskStartDate}
                  />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCreateTaskModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={handleCreateTask}
                disabled={!newTaskTitle.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {t('Create')}
              </button>
            </div>
          </div>
        </Modal>

      <style>{`
        .calendar-container .react-calendar {
          border: none;
          font-family: inherit;
        }
        .calendar-container .react-calendar__tile {
          padding: 0.75em 0.5em;
          border-radius: 0.375rem;
        }
        .calendar-container .react-calendar__tile:enabled:hover {
          background-color: #f3f4f6;
        }
        .calendar-container .react-calendar__tile--active {
          background-color: #dbeafe !important;
          color: #1e40af;
        }
        .calendar-container .react-calendar__tile--now {
          background-color: #fef3c7;
        }
        .calendar-container .react-calendar__navigation button {
          font-size: 1rem;
          font-weight: 600;
        }
        .calendar-container .react-calendar__navigation button:enabled:hover {
          background-color: #f3f4f6;
        }
        .calendar-container .react-calendar__month-view__weekdays {
          font-size: 0.875rem;
          font-weight: 600;
          color: #6b7280;
        }
      `}</style>
    </div>
  );
};

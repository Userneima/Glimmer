import React, { useState } from 'react';
import type { Diary, DiaryInsight, ReviewDigest, ReviewQueryResult } from '../../types';
import { formatDate } from '../../utils/date';
import { Modal } from '../UI/Modal';
import { t } from '../../i18n';
import { useTasks } from '../../hooks/useTasks';
import { storage } from '../../utils/storage';
import {
  buildReviewDigest,
  getMonthRange,
  getWeekRange,
  reviewDigestToMarkdown,
  searchReviewReasons,
} from '../../utils/diaryReview';
import { saveBlobWithPicker, sanitizeFilename } from '../../utils/export';
import { TaskFormModal } from './TaskFormModal';
import { formatDateInput, taskFormValuesToTaskData, type TaskFormValues } from '../../utils/taskForm';
import { useAuth } from '../../context/useAuth';
import { cloud } from '../../utils/cloud';
import { CalendarDateCard } from './CalendarDateCard';
import { CalendarDayContent } from './CalendarDayContent';
import { CalendarMonthDialog } from './CalendarMonthDialog';
import { CalendarReviewDialog } from './CalendarReviewDialog';

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
  const { user, isConfigured } = useAuth();
  const userId = user?.id ?? null;
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMonthCalendarOpen, setIsMonthCalendarOpen] = useState(false);
  const [monthPreviewDate, setMonthPreviewDate] = useState<Date>(new Date());
  const [editingDiary, setEditingDiary] = useState<Diary | null>(null);
  const [editDateStr, setEditDateStr] = useState('');
  const [insights, setInsights] = useState<DiaryInsight[]>(() => storage.getDiaryInsights());
  const [reviewDigest, setReviewDigest] = useState<ReviewDigest | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reasonQuery, setReasonQuery] = useState('');
  const [reasonResults, setReasonResults] = useState<ReviewQueryResult[]>([]);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);

  const { getTasksForDate, addTask, toggleComplete } = useTasks();

  const diariesByDate = React.useMemo(() => {
    const map = new Map<string, Diary[]>();
    diaries.forEach(diary => {
      const dateKey = new Date(diary.createdAt).toDateString();
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(diary);
    });
    return map;
  }, [diaries]);

  const selectedDateDiaries = diariesByDate.get(selectedDate.toDateString()) || [];
  const selectedDateTasks = getTasksForDate(selectedDate);
  const monthPreviewDiaries = diariesByDate.get(monthPreviewDate.toDateString()) || [];
  const monthPreviewTasks = getTasksForDate(monthPreviewDate);
  const selectedDateInsights = insights.filter(insight => new Date(insight.date).toDateString() === selectedDate.toDateString());
  const monthPreviewInsights = insights.filter(insight => new Date(insight.date).toDateString() === monthPreviewDate.toDateString());
  const selectedDateInput = formatDateInput(selectedDate.getTime());

  React.useEffect(() => {
    const refresh = () => setInsights(storage.getDiaryInsights());
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [selectedDate, isMonthCalendarOpen]);

  const getDiaryCountForDate = (date: Date) => diariesByDate.get(date.toDateString())?.length || 0;

  const getTaskCountForDate = (date: Date) => getTasksForDate(date).length;

  const tileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null;

    const diaryCount = getDiaryCountForDate(date);
    const taskCount = getTaskCountForDate(date);
    if (diaryCount === 0 && taskCount === 0) return null;

    return (
      <div className="flex justify-center gap-1 mt-1">
        {diaryCount > 0 && <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />}
        {taskCount > 0 && <div className="w-1.5 h-1.5 bg-orange-500 rounded-full" />}
      </div>
    );
  };

  const tileClassName = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return '';

    const diaryCount = getDiaryCountForDate(date);
    const taskCount = getTaskCountForDate(date);
    const isSelected = date.toDateString() === monthPreviewDate.toDateString();
    const isToday = date.toDateString() === new Date().toDateString();

    let classes = 'relative ';
    if (diaryCount > 0 || taskCount > 0) classes += 'font-semibold ';
    if (isSelected) classes += 'bg-blue-100 ';
    if (isToday) classes += 'text-blue-600 ';
    return classes;
  };

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
    onChangeDiaryDate(editingDiary.id, new Date(editDateStr));
    closeModal();
  };

  const openMonthCalendar = () => {
    setMonthPreviewDate(selectedDate);
    setIsMonthCalendarOpen(true);
  };

  const handleCreateDiaryForDate = () => {
    onCreateDiary(selectedDate);
  };

  const openReviewDigest = (periodType: ReviewDigest['periodType']) => {
    const range = periodType === 'week' ? getWeekRange(selectedDate) : getMonthRange(selectedDate);
    const digest = buildReviewDigest(periodType, range, diaries, storage.getDiaryInsights());
    storage.upsertReviewDigest(digest);
    if (userId && isConfigured) {
      void cloud.upsertReviewDigest(userId, digest).catch(() => {});
    }
    setReviewDigest(digest);
    setIsReviewOpen(true);
  };

  const handleExportReviewDigest = async () => {
    if (!reviewDigest) return;
    const markdown = reviewDigestToMarkdown(reviewDigest);
    await saveBlobWithPicker({
      filename: `${sanitizeFilename(reviewDigest.periodType === 'week' ? 'weekly-review' : 'monthly-review')}-${formatDate(reviewDigest.startDate)}.md`,
      blob: new Blob([markdown], { type: 'text/markdown' }),
    });
  };

  const handleSearchReasons = () => {
    const results = searchReviewReasons(
      diaries,
      storage.getDiaryInsights(),
      reasonQuery || '缺勤 请假 没去',
      [monthPreviewDate],
    );
    setReasonResults(results);
  };

  const handleCreateTask = (values: TaskFormValues) => {
    addTask(values.title, taskFormValuesToTaskData(values, { clearDatesForLongTerm: false }));
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
      <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.2)' }}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--aurora-primary)' }}>{t('Calendar View')}</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-3 space-y-3">
          <CalendarDateCard
            sectionCardStyle={sectionCardStyle}
            selectedDate={selectedDate}
            selectedDateDiaries={selectedDateDiaries}
            selectedDateTasks={selectedDateTasks}
            selectedDateInsights={selectedDateInsights}
            onOpenMonthCalendar={openMonthCalendar}
            onCreateTask={() => setShowCreateTaskModal(true)}
            onCreateDiary={handleCreateDiaryForDate}
            onOpenReviewDigest={openReviewDigest}
          />

          <CalendarDayContent
            sectionCardStyle={sectionCardStyle}
            diaries={selectedDateDiaries}
            tasks={selectedDateTasks}
            insights={selectedDateInsights}
            onCreateDiary={handleCreateDiaryForDate}
            onCreateTask={() => setShowCreateTaskModal(true)}
            onSelectDiary={onSelectDiary}
            onEditDiaryDate={openEditDateModal}
            onToggleTask={toggleComplete}
            formatDateRange={formatDateRange}
          />

          <Modal isOpen={isModalOpen} onClose={closeModal} title={t('Change Diary Date')}>
            <div>
              <p className="text-sm text-gray-600 mb-2">{t('Diary')}: <strong>{editingDiary?.title || t('Untitled')}</strong></p>
              <input
                type="date"
                value={editDateStr}
                onChange={(event) => setEditDateStr(event.target.value)}
                className="border rounded px-3 py-2 w-full"
              />
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={closeModal} className="px-3 py-2 bg-gray-100 rounded">
                  {t('Cancel')}
                </button>
                <button onClick={handleSaveDate} className="px-3 py-2 bg-blue-600 text-white rounded">
                  {t('Save')}
                </button>
              </div>
            </div>
          </Modal>
        </div>
      </div>

      <CalendarMonthDialog
        isOpen={isMonthCalendarOpen}
        monthPreviewDate={monthPreviewDate}
        sectionCardStyle={sectionCardStyle}
        monthPreviewDiaries={monthPreviewDiaries}
        monthPreviewTasks={monthPreviewTasks}
        monthPreviewInsights={monthPreviewInsights}
        reasonQuery={reasonQuery}
        reasonResults={reasonResults}
        tileContent={tileContent}
        tileClassName={tileClassName}
        onClose={() => setIsMonthCalendarOpen(false)}
        onMonthDateClick={(date) => {
          setMonthPreviewDate(date);
          setSelectedDate(date);
        }}
        onSelectDate={setSelectedDate}
        onSelectDiary={onSelectDiary}
        onReasonQueryChange={setReasonQuery}
        onSearchReasons={handleSearchReasons}
      />

      <CalendarReviewDialog
        isOpen={isReviewOpen}
        reviewDigest={reviewDigest}
        onClose={() => setIsReviewOpen(false)}
        onExport={handleExportReviewDigest}
      />

      <TaskFormModal
        key={`calendar-create-task-${selectedDateInput}-${showCreateTaskModal}`}
        isOpen={showCreateTaskModal}
        onClose={() => setShowCreateTaskModal(false)}
        title={t('Create New Task')}
        submitLabel={t('Create')}
        initialTaskType="time-range"
        initialStartDate={selectedDateInput}
        initialEndDate={selectedDateInput}
        onSubmit={handleCreateTask}
      />

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

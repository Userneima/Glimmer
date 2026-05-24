import type { CSSProperties, ReactNode } from 'react';
import type { Diary, DiaryInsight, ReviewDigest, ReviewQueryResult, Task } from '../../types';

export type CalendarSectionStyle = CSSProperties;

export type DateEntrySectionProps = {
  sectionCardStyle: CalendarSectionStyle;
  selectedDate: Date;
  selectedDateDiaries: Diary[];
  selectedDateTasks: Task[];
  selectedDateInsights: DiaryInsight[];
  onOpenMonthCalendar: () => void;
  onCreateTask: () => void;
  onCreateDiary: () => void;
  onOpenReviewDigest: (periodType: ReviewDigest['periodType']) => void;
};

export type DayContentSectionProps = {
  sectionCardStyle: CalendarSectionStyle;
  diaries: Diary[];
  tasks: Task[];
  insights: DiaryInsight[];
  onCreateDiary: () => void;
  onCreateTask: () => void;
  onSelectDiary: (id: string) => void;
  onEditDiaryDate: (diary: Diary) => void;
  onToggleTask: (id: string) => void;
  formatDateRange: (startDate: number | null | undefined, endDate: number | null | undefined) => string;
};

export type MonthCalendarDialogProps = {
  isOpen: boolean;
  monthPreviewDate: Date;
  sectionCardStyle: CalendarSectionStyle;
  monthPreviewDiaries: Diary[];
  monthPreviewTasks: Task[];
  monthPreviewInsights: DiaryInsight[];
  reasonQuery: string;
  reasonResults: ReviewQueryResult[];
  tileContent: (props: { date: Date; view: string }) => ReactNode;
  tileClassName: (props: { date: Date; view: string }) => string;
  onClose: () => void;
  onMonthDateClick: (date: Date) => void;
  onSelectDate: (date: Date) => void;
  onSelectDiary: (id: string) => void;
  onReasonQueryChange: (value: string) => void;
  onSearchReasons: () => void;
};

export type ReviewDigestDialogProps = {
  isOpen: boolean;
  reviewDigest: ReviewDigest | null;
  onClose: () => void;
  onExport: () => void;
};

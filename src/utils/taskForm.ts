import type { Task, TaskType } from '../types';

export type TaskFormValues = {
  title: string;
  notes?: string;
  taskType: TaskType;
  startDate?: number;
  endDate?: number;
};

export const formatDateInput = (timestamp: number | null | undefined) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const taskFormValuesToTaskData = (
  values: TaskFormValues,
  options: { clearDatesForLongTerm: boolean },
): {
  notes?: string;
  taskType: Task['taskType'];
  startDate?: number | null;
  endDate?: number | null;
  sourceContext?: Task['sourceContext'];
} => ({
  notes: values.notes,
  taskType: values.taskType,
  startDate: values.taskType === 'time-range'
    ? values.startDate
    : options.clearDatesForLongTerm ? null : undefined,
  endDate: values.taskType === 'time-range'
    ? values.endDate
    : options.clearDatesForLongTerm ? null : undefined,
});

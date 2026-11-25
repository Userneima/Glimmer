export const LONG_TERM_MASTER_ID = '00000000-0000-4000-a000-000000000001';
export const TEMPLATE_DIARY_ID = '00000000-0000-4000-a000-000000000002';

export interface Diary {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  isLongTermMaster?: boolean;
  isTemplateDiary?: boolean;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  color?: string;
  createdAt: number;
}

export interface AppState {
  diaries: Diary[];
  folders: Folder[];
  currentDiaryId: string | null;
  searchQuery: string;
}

export type TaskType = 'long-term' | 'time-range' | 'recurring';

export type TaskSourceContext = {
  kind: 'manual' | 'diary' | 'long-term-idea' | 'ai-generated';
  diaryId?: string;
  ideaId?: string;
  excerpt?: string;
}

// 删掉的日记先进废纸篓，过了保留期或他主动清空才真的消失。
export type TrashedDiary = Diary & {
  deletedAt: number;
};

export interface Task {
  id: string;
  title: string;
  notes?: string;
  createdAt: number;
  dueAt?: number | null;
  completed: boolean;
  recurring?: string | null; // recurrence rule code: 'daily' | 'weekly:1,3,5' | 'every:3d'
  relatedDiaryId?: string | null; // optional link back to a diary

  // New fields for task enhancement
  taskType: TaskType;           // Task type: long-term or time-range
  startDate?: number | null;    // Start date timestamp (for time-range tasks)
  endDate?: number | null;      // End date timestamp (for time-range tasks)
  completedAt?: number | null;  // Completion timestamp; for recurring tasks, the last time it was done
  rotation?: string | null;     // Comma-separated rotation slots for recurring tasks, e.g. 'A,B'
  rotationIndex?: number | null; // Which rotation slot comes up next
  order?: number;               // Custom order for sorting
  tags: string[];               // Tags associated with the task
  sourceContext?: TaskSourceContext;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  isFavorite: boolean;
  createdAt: number;
  usageCount: number;
}


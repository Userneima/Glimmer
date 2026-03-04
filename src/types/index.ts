export interface Diary {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  tags: string[];
  createdAt: number;
  updatedAt: number;
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

export type TaskType = 'long-term' | 'time-range';

export interface Task {
  id: string;
  title: string;
  notes?: string;
  createdAt: number;
  dueAt?: number | null;
  completed: boolean;
  recurring?: string | null; // e.g. 'daily', 'weekly', cron-like or human text
  relatedDiaryId?: string | null; // optional link back to a diary

  // New fields for task enhancement
  taskType: TaskType;           // Task type: long-term or time-range
  startDate?: number | null;    // Start date timestamp (for time-range tasks)
  endDate?: number | null;      // End date timestamp (for time-range tasks)
  completedAt?: number | null;  // Completion timestamp
  order?: number;               // Custom order for sorting
  tags: string[];               // Tags associated with the task
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  isFavorite: boolean;
  createdAt: number;
  usageCount: number;
}

export interface AnalysisResult {
  id: string;
  diaryId?: string | null;
  summary: string;
  suggestions: string[];
  tags: string[];
  createdAt: number;
  // Optional provider used for this analysis (e.g., 'deepseek','gemini','local')
  source?: string;
}
import { invoke } from '@tauri-apps/api/core';
import { storage } from './storage';

type LocalBackupSnapshot = {
  app: 'Glimmer';
  version: 1;
  source: 'desktop-daily-backup' | 'desktop-major-change-backup';
  reason: LocalBackupReason;
  createdAt: number;
  userId: string | null;
  data: {
    diaries: ReturnType<typeof storage.getDiaries>;
    folders: ReturnType<typeof storage.getFolders>;
    tasks: ReturnType<typeof storage.getTasks>;
    tags: ReturnType<typeof storage.getTags>;
    diaryTagColors: ReturnType<typeof storage.getDiaryTagColors>;
    longTermIdeas: ReturnType<typeof storage.getLongTermIdeas>;
    analyses: ReturnType<typeof storage.getAnalyses>;
  };
};

type LocalBackupResult = {
  path: string;
};

export type LocalBackupReason = 'daily' | 'major-change';

const LAST_DAILY_BACKUP_KEY = 'glimmer-last-daily-local-backup-date';

const isTauriRuntime = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const formatBackupTimestamp = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
};

const localDateKey = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const buildLocalBackupSnapshot = (
  userId: string | null,
  reason: LocalBackupReason,
): LocalBackupSnapshot => ({
  app: 'Glimmer',
  version: 1,
  source: reason === 'daily' ? 'desktop-daily-backup' : 'desktop-major-change-backup',
  reason,
  createdAt: Date.now(),
  userId,
  data: {
    diaries: storage.getDiaries(),
    folders: storage.getFolders(),
    tasks: storage.getTasks(),
    tags: storage.getTags(),
    diaryTagColors: storage.getDiaryTagColors(),
    longTermIdeas: storage.getLongTermIdeas(),
    analyses: storage.getAnalyses(),
  },
});

export const getLocalBackupSignature = () => {
  const snapshot = buildLocalBackupSnapshot(null, 'major-change');
  return JSON.stringify({
    diaryCount: snapshot.data.diaries.length,
    folderCount: snapshot.data.folders.length,
    taskCount: snapshot.data.tasks.length,
    tagCount: snapshot.data.tags.length,
    longTermIdeaCount: snapshot.data.longTermIdeas.length,
    diaryIds: snapshot.data.diaries.map((diary) => diary.id).sort(),
    folderIds: snapshot.data.folders.map((folder) => folder.id).sort(),
    taskIds: snapshot.data.tasks.map((task) => task.id).sort(),
    tagIds: snapshot.data.tags.map((tag) => tag.id).sort(),
    longTermIdeaIds: snapshot.data.longTermIdeas.map((idea) => idea.id).sort(),
  });
};

export const shouldRunDailyLocalBackup = () => {
  if (!isTauriRuntime()) return false;
  const today = localDateKey(new Date());
  return localStorage.getItem(LAST_DAILY_BACKUP_KEY) !== today;
};

export const writeDesktopLocalBackup = async (
  userId: string | null,
  reason: LocalBackupReason,
): Promise<LocalBackupResult | null> => {
  if (!isTauriRuntime()) return null;

  const snapshot = buildLocalBackupSnapshot(userId, reason);
  if (snapshot.data.diaries.length === 0 && snapshot.data.longTermIdeas.length === 0) {
    return null;
  }

  const fileName = `glimmer-backup-${reason}-${formatBackupTimestamp(new Date(snapshot.createdAt))}.json`;
  const result = await invoke<LocalBackupResult>('write_local_backup', {
    payload: {
      fileName,
      content: JSON.stringify(snapshot, null, 2),
    },
  });

  if (reason === 'daily') {
    localStorage.setItem(LAST_DAILY_BACKUP_KEY, localDateKey(new Date(snapshot.createdAt)));
  }

  return result;
};

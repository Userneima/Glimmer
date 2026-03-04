import type { Diary, Folder, Task, AnalysisResult, Tag, LongTermIdea } from '../types';

type Backup = {
  timestamp: number;
  diaries: Diary[];
  folders: Folder[];
};

const DIARIES_KEY = 'diaries';
const FOLDERS_KEY = 'folders';
const BACKUPS_KEY = 'diaries_backups';
const MAX_BACKUPS = 10;

type StorageObject = Record<string, unknown>;

// 添加一个全局变量来存储当前用户 ID
let currentUserId: string | null = null;

// 设置当前用户 ID
export const setCurrentUserId = (userId: string | null) => {
  currentUserId = userId;
};

// 获取带用户 ID 前缀的存储键
const getKey = (key: string): string => {
  if (currentUserId) {
    return `${key}-${currentUserId}`;
  }
  return key;
};

const asStorageObject = (value: unknown): StorageObject => {
  return typeof value === 'object' && value !== null ? (value as StorageObject) : {};
};

export const storage = {
  // Diaries
  getDiaries(): Diary[] {
    const data = localStorage.getItem(getKey(DIARIES_KEY));
    return data ? JSON.parse(data) : [];
  },

  saveDiaries(diaries: Diary[]): void {
    localStorage.setItem(getKey(DIARIES_KEY), JSON.stringify(diaries));
    // record a snapshot after changes to help recovery
    try {
      this.saveSnapshotIfChanged();
    } catch (err) {
      // fail silently to not break normal flow
      console.warn('Failed to save snapshot', err);
    }
  },

  addDiary(diary: Diary): void {
    const diaries = this.getDiaries();
    diaries.push(diary);
    this.saveDiaries(diaries);
  },

  updateDiary(id: string, updates: Partial<Diary>): void {
    const diaries = this.getDiaries();
    const index = diaries.findIndex(d => d.id === id);
    if (index !== -1) {
      diaries[index] = { ...diaries[index], ...updates, updatedAt: Date.now() };
      this.saveDiaries(diaries);
    }
  },

  deleteDiary(id: string): void {
    const diaries = this.getDiaries();
    this.saveDiaries(diaries.filter(d => d.id !== id));
  },

  // Folders
  getFolders(): Folder[] {
    const data = localStorage.getItem(getKey(FOLDERS_KEY));
    return data ? JSON.parse(data) : [];
  },

  saveFolders(folders: Folder[]): void {
    localStorage.setItem(getKey(FOLDERS_KEY), JSON.stringify(folders));
    try {
      this.saveSnapshotIfChanged();
    } catch (err) {
      console.warn('Failed to save snapshot', err);
    }
  },

  addFolder(folder: Folder): void {
    const folders = this.getFolders();
    folders.push(folder);
    this.saveFolders(folders);
  },

  updateFolder(id: string, updates: Partial<Folder>): void {
    const folders = this.getFolders();
    const index = folders.findIndex(f => f.id === id);
    if (index !== -1) {
      folders[index] = { ...folders[index], ...updates };
      this.saveFolders(folders);
    }
  },

  deleteFolder(id: string): void {
    const folders = this.getFolders();
    this.saveFolders(folders.filter(f => f.id !== id));

    // Also update diaries that were in this folder
    const diaries = this.getDiaries();
    const updatedDiaries = diaries.map(d =>
      d.folderId === id ? { ...d, folderId: null } : d
    );
    this.saveDiaries(updatedDiaries);
  },

  // Tasks (new)
  getTasks(): Task[] {
    const data = localStorage.getItem(getKey('tasks'));
    if (!data) return [];

    const tasks = JSON.parse(data) as unknown;
    if (!Array.isArray(tasks)) {
      return [];
    }
    // Data migration: add new fields to old tasks
    return tasks.map((task) => {
      const taskRecord = asStorageObject(task);
      return {
        ...taskRecord,
        taskType: taskRecord.taskType || 'long-term',
        startDate: taskRecord.startDate || null,
        endDate: taskRecord.endDate || null,
        completedAt: taskRecord.completedAt || null,
        tags: taskRecord.tags || [],
      } as Task;
    });
  },

  saveTasks(tasks: Task[]): void {
    localStorage.setItem(getKey('tasks'), JSON.stringify(tasks));
  },

  addTask(task: Task): void {
    const tasks = this.getTasks();
    tasks.push(task);
    this.saveTasks(tasks);
  },

  updateTask(id: string, updates: Partial<Task>): void {
    const tasks = this.getTasks();
    const index = tasks.findIndex(t => t.id === id);
    if (index !== -1) {
      tasks[index] = { ...tasks[index], ...updates };
      this.saveTasks(tasks);
    }
  },

  deleteTask(id: string): void {
    const tasks = this.getTasks();
    this.saveTasks(tasks.filter(t => t.id !== id));
  },

  // Tags
  getTags(): Tag[] {
    const data = localStorage.getItem(getKey('tags'));
    return data ? JSON.parse(data) : [];
  },

  saveTags(tags: Tag[]): void {
    localStorage.setItem(getKey('tags'), JSON.stringify(tags));
  },

  addTag(tag: Tag): void {
    const tags = this.getTags();
    tags.push(tag);
    this.saveTags(tags);
  },

  updateTag(id: string, updates: Partial<Tag>): void {
    const tags = this.getTags();
    const index = tags.findIndex(t => t.id === id);
    if (index !== -1) {
      tags[index] = { ...tags[index], ...updates };
      this.saveTags(tags);
    }
  },

  deleteTag(id: string): void {
    const tags = this.getTags();
    this.saveTags(tags.filter(t => t.id !== id));
  },

  // Long Term Ideas
  getLongTermIdeas(): LongTermIdea[] {
    const data = localStorage.getItem(getKey('long_term_ideas'));
    return data ? JSON.parse(data) : [];
  },

  saveLongTermIdeas(ideas: LongTermIdea[]): void {
    localStorage.setItem(getKey('long_term_ideas'), JSON.stringify(ideas));
  },

  addLongTermIdea(idea: LongTermIdea): void {
    const ideas = this.getLongTermIdeas();
    ideas.push(idea);
    this.saveLongTermIdeas(ideas);
  },

  updateLongTermIdea(id: string, updates: Partial<LongTermIdea>): void {
    const ideas = this.getLongTermIdeas();
    const index = ideas.findIndex(i => i.id === id);
    if (index !== -1) {
      ideas[index] = { ...ideas[index], ...updates, lastEditedAt: Date.now() };
      this.saveLongTermIdeas(ideas);
    }
  },

  deleteLongTermIdea(id: string): void {
    const ideas = this.getLongTermIdeas();
    this.saveLongTermIdeas(ideas.filter(i => i.id !== id));
  },

  // AI settings (store user's Gemini free API key and optional DeepSeek settings locally)
  getAiSettings(): { geminiApiKey?: string | null; deepseekKey?: string | null; deepseekBaseUrl?: string | null; deepseekModel?: string | null } {
    const data = localStorage.getItem(getKey('ai_settings'));
    return data ? JSON.parse(data) : {};
  },

  saveAiSettings(settings: { geminiApiKey?: string | null; deepseekKey?: string | null; deepseekBaseUrl?: string | null; deepseekModel?: string | null }): void {
    localStorage.setItem(getKey('ai_settings'), JSON.stringify(settings));
  },

  // Analysis results
  getAnalyses(): AnalysisResult[] {
    const data = localStorage.getItem(getKey('analyses'));
    return data ? JSON.parse(data) : [];
  },

  addAnalysis(a: AnalysisResult): void {
    const arr = this.getAnalyses();
    arr.push(a);
    localStorage.setItem(getKey('analyses'), JSON.stringify(arr));
  },

  saveAnalyses(arr: AnalysisResult[]): void {
    localStorage.setItem(getKey('analyses'), JSON.stringify(arr));
  },

  clearUserData(): void {
    localStorage.removeItem(getKey(DIARIES_KEY));
    localStorage.removeItem(getKey(FOLDERS_KEY));
    localStorage.removeItem(getKey('tasks'));
    localStorage.removeItem(getKey('tags'));
    localStorage.removeItem(getKey('analyses'));
    localStorage.removeItem(getKey(BACKUPS_KEY));
  },


  // Backups
  getBackups(): Backup[] {
    const data = localStorage.getItem(getKey(BACKUPS_KEY));
    return data ? JSON.parse(data) : [];
  },

  privateSaveBackups(backups: Backup[]) {
    localStorage.setItem(getKey(BACKUPS_KEY), JSON.stringify(backups));
  },

  saveSnapshotIfChanged(): void {
    const diaries = this.getDiaries();
    const folders = this.getFolders();
    const backups = this.getBackups();
    const last = backups.length ? backups[backups.length - 1] : null;
    try {
      const same = last && JSON.stringify(last.diaries) === JSON.stringify(diaries) && JSON.stringify(last.folders) === JSON.stringify(folders);
      if (same) return;
      const next: Backup = { timestamp: Date.now(), diaries, folders };
      backups.push(next);
      if (backups.length > MAX_BACKUPS) {
        backups.splice(0, backups.length - MAX_BACKUPS);
      }
      this.privateSaveBackups(backups);
    } catch (err) {
      console.warn('saveSnapshotIfChanged error', err);
    }
  },

  restoreBackup(timestamp: number): Backup | null {
    const backups = this.getBackups();
    const b = backups.find(x => x.timestamp === timestamp);
    if (!b) return null;
    // restore directly into storage
    this.saveDiaries(b.diaries);
    this.saveFolders(b.folders);
    return b;
  },

  getAllData(): { diaries: Diary[]; folders: Folder[] } {
    return { diaries: this.getDiaries(), folders: this.getFolders() };
  },

  importAllData(data: unknown, options?: { replace?: boolean }) {
    try {
      const incoming = asStorageObject(data);
      const incomingDiaries: Diary[] = Array.isArray(incoming.diaries) ? incoming.diaries as Diary[] : [];
      const incomingFolders: Folder[] = Array.isArray(incoming.folders) ? incoming.folders as Folder[] : [];

      if (options?.replace) {
        this.saveFolders(incomingFolders);
        this.saveDiaries(incomingDiaries);
        return;
      }

      // Merge folders
      const existingFolders = this.getFolders();
      const folderMap = new Map(existingFolders.map(f => [f.id, f]));
      incomingFolders.forEach(f => {
        if (!f.id) f.id = cryptoRandomId();
        folderMap.set(f.id, { ...folderMap.get(f.id), ...f });
      });
      this.saveFolders(Array.from(folderMap.values()));

      // Merge diaries
      const existingDiaries = this.getDiaries();
      const diaryMap = new Map(existingDiaries.map(d => [d.id, d]));
      incomingDiaries.forEach(d => {
        if (!d.id) d.id = cryptoRandomId();
        if (diaryMap.has(d.id)) {
          diaryMap.set(d.id, { ...diaryMap.get(d.id)!, ...d });
        } else {
          diaryMap.set(d.id, d);
        }
      });
      this.saveDiaries(Array.from(diaryMap.values()));
    } catch (err) {
      console.error('importAllData failed', err);
      throw err;
    }
  },
};

// Simple fallback for crypto random id if uuid not available in raw util
function cryptoRandomId() {
  return 'id-' + Math.random().toString(36).slice(2, 9);
}

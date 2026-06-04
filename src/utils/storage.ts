import { LONG_TERM_MASTER_ID, TEMPLATE_DIARY_ID, type Diary, type Folder, type Task, type AnalysisResult, type Tag, type LongTermIdea, type AutoAnalysisState, type DiaryInsight, type ReviewDigest } from '../types';
import { getDesktopStoreItem, isDesktopStoreActive, removeDesktopStoreItem, setDesktopStoreItem } from './desktopStore';

type DiaryTagColors = Record<string, string>;

export type Backup = {
  timestamp: number;
  diaries: Diary[];
  folders: Folder[];
  tasks?: Task[];
  tags?: Tag[];
  diaryTagColors?: DiaryTagColors;
  longTermIdeas?: LongTermIdea[];
  analyses?: AnalysisResult[];
  autoAnalysisState?: Record<string, AutoAnalysisState>;
  diaryInsights?: DiaryInsight[];
  reviewDigests?: ReviewDigest[];
};

const DIARIES_KEY = 'diaries';
const FOLDERS_KEY = 'folders';
const BACKUPS_KEY = 'diaries_backups';
const DIARY_INSIGHTS_KEY = 'diary_insights';
const REVIEW_DIGESTS_KEY = 'review_digests';
const MAX_BACKUPS = 2;
const LEGACY_LONG_TERM_MASTER_ID = 'long-term-master';
const ACCOUNT_SCOPED_DATA_KEYS = [
  DIARIES_KEY,
  FOLDERS_KEY,
  'tasks',
  'tags',
  'diary_tag_colors',
  'analyses',
  'auto_analysis_state',
  DIARY_INSIGHTS_KEY,
  REVIEW_DIGESTS_KEY,
  'long_term_ideas',
  'ai_settings',
  BACKUPS_KEY,
];

type StorageObject = Record<string, unknown>;
export type AiSettings = {
  geminiApiKey?: string | null;
  deepseekKey?: string | null;
  deepseekBaseUrl?: string | null;
  deepseekModel?: string | null;
};

// 添加一个全局变量来存储当前用户 ID
let currentUserId: string | null = null;

// 设置当前用户 ID
export const setCurrentUserId = (userId: string | null) => {
  currentUserId = userId;
};

// 获取带用户 ID 前缀的存储键
const getKey = (key: string): string => {
  return getKeyForUser(key, currentUserId);
};

const getKeyForUser = (key: string, userId: string | null): string => {
  if (userId) {
    return `${key}-${userId}`;
  }
  return key;
};

const asStorageObject = (value: unknown): StorageObject => {
  return typeof value === 'object' && value !== null ? (value as StorageObject) : {};
};

const readJson = (key: string): unknown => {
  const data = getStorageItem(getKey(key));
  if (!data) return null;

  try {
    return JSON.parse(data) as unknown;
  } catch (err) {
    console.warn(`Failed to parse local storage key "${key}"`, err);
    return null;
  }
};

const readJsonArray = <T>(key: string): T[] => {
  const value = readJson(key);
  return Array.isArray(value) ? (value as T[]) : [];
};

const readJsonObject = <T>(key: string): T => {
  return asStorageObject(readJson(key)) as T;
};

const isBlankHtmlContent = (content: unknown) => {
  if (typeof content !== 'string') return true;
  const text = content
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return text.length === 0;
};

const hasMeaningfulDiaryData = (raw: string | null): boolean => {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return false;
    return parsed.some((item) => {
      const diary = asStorageObject(item);
      const id = typeof diary.id === 'string' ? diary.id : '';
      const isSystemDiary =
        id === LONG_TERM_MASTER_ID ||
        id === LEGACY_LONG_TERM_MASTER_ID ||
        id === TEMPLATE_DIARY_ID ||
        diary.isLongTermMaster === true ||
        diary.isTemplateDiary === true;

      if (!isSystemDiary) return true;
      return !isBlankHtmlContent(diary.content);
    });
  } catch {
    return false;
  }
};

const hasMeaningfulStoredData = (key: string, raw: string | null): boolean => {
  if (!raw) return false;
  if (key === DIARIES_KEY) return hasMeaningfulDiaryData(raw);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.length > 0;
    if (typeof parsed === 'object' && parsed !== null) return Object.keys(parsed).length > 0;
    return Boolean(parsed);
  } catch {
    return false;
  }
};

const isQuotaExceededError = (err: unknown): boolean => {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    message.includes('quota')
  );
};

const removeInBrowserBackups = () => {
  localStorage.removeItem(getKey(BACKUPS_KEY));
  localStorage.removeItem(BACKUPS_KEY);
};

const getStorageItem = (key: string): string | null => {
  const desktopValue = getDesktopStoreItem(key);
  if (desktopValue !== null) return desktopValue;
  return localStorage.getItem(key);
};

const setStorageItem = (key: string, value: string): void => {
  if (setDesktopStoreItem(key, value)) {
    removeInBrowserBackups();
    localStorage.removeItem(key);
    return;
  }

  try {
    localStorage.setItem(key, value);
  } catch (err) {
    if (!isQuotaExceededError(err)) throw err;

    // Browser localStorage is small. Keep primary data writable by dropping
    // disposable in-browser snapshots; desktop file backups remain separate.
    removeInBrowserBackups();
    localStorage.setItem(key, value);
  }
};

const removeStorageItem = (key: string): void => {
  if (removeDesktopStoreItem(key)) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.removeItem(key);
};

const mergeArraysByStableKey = <T extends StorageObject>(
  source: unknown,
  target: unknown,
  keyName: string,
): T[] | null => {
  if (!Array.isArray(source)) return null;
  const result = new Map<string, T>();

  const add = (item: unknown, prefix: string, index: number) => {
    const record = asStorageObject(item) as T;
    const stableValue = record[keyName];
    const stableKey = (typeof stableValue === 'string' || typeof stableValue === 'number') && stableValue
      ? String(stableValue)
      : `${prefix}-${index}`;
    result.set(stableKey, record);
  };

  source.forEach((item, index) => add(item, 'source', index));
  if (Array.isArray(target)) {
    target.forEach((item, index) => add(item, 'target', index));
  }

  return Array.from(result.values());
};

const mergeStoredData = (key: string, sourceRaw: string, targetRaw: string | null): string => {
  if (!targetRaw || !hasMeaningfulStoredData(key, targetRaw)) return sourceRaw;

  try {
    const source = JSON.parse(sourceRaw) as unknown;
    const target = JSON.parse(targetRaw) as unknown;

    if (Array.isArray(source)) {
      const stableKey = key === BACKUPS_KEY ? 'timestamp' : 'id';
      const merged = mergeArraysByStableKey(source, target, stableKey);
      return JSON.stringify(merged ?? target);
    }

    if (typeof source === 'object' && source !== null) {
      return JSON.stringify({
        ...asStorageObject(source),
        ...asStorageObject(target),
      });
    }

    return targetRaw;
  } catch {
    return targetRaw;
  }
};

export const storage = {
  copyAnonymousDataToUserIfEmpty(userId: string): boolean {
    let changed = false;

    ACCOUNT_SCOPED_DATA_KEYS.forEach((key) => {
      const sourceKey = getKeyForUser(key, null);
      const targetKey = getKeyForUser(key, userId);
      const source = getStorageItem(sourceKey);
      const target = getStorageItem(targetKey);

      if (source && hasMeaningfulStoredData(key, source)) {
        const next = mergeStoredData(key, source, target);
        if (next !== target) {
          setStorageItem(targetKey, next);
          changed = true;
        }
      }
    });

    return changed;
  },

  // Diaries
  getDiaries(): Diary[] {
    return readJsonArray<Diary>(DIARIES_KEY);
  },

  saveDiaries(diaries: Diary[]): void {
    setStorageItem(getKey(DIARIES_KEY), JSON.stringify(diaries));
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
    return readJsonArray<Folder>(FOLDERS_KEY);
  },

  saveFolders(folders: Folder[]): void {
    setStorageItem(getKey(FOLDERS_KEY), JSON.stringify(folders));
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
    const tasks = readJson('tasks');
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
        externalLinks: Array.isArray(taskRecord.externalLinks) ? taskRecord.externalLinks : [],
        sourceContext: taskRecord.sourceContext || { kind: 'manual' },
      } as Task;
    });
  },

  saveTasks(tasks: Task[]): void {
    setStorageItem(getKey('tasks'), JSON.stringify(tasks));
    try {
      this.saveSnapshotIfChanged();
    } catch (err) {
      console.warn('Failed to save snapshot', err);
    }
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
    return readJsonArray<Tag>('tags');
  },

  saveTags(tags: Tag[]): void {
    setStorageItem(getKey('tags'), JSON.stringify(tags));
    try {
      this.saveSnapshotIfChanged();
    } catch (err) {
      console.warn('Failed to save snapshot', err);
    }
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

  getDiaryTagColors(): DiaryTagColors {
    return readJsonObject<DiaryTagColors>('diary_tag_colors');
  },

  saveDiaryTagColors(colors: DiaryTagColors): void {
    setStorageItem(getKey('diary_tag_colors'), JSON.stringify(colors));
    try {
      this.saveSnapshotIfChanged();
    } catch (err) {
      console.warn('Failed to save snapshot', err);
    }
  },

  // Long Term Ideas
  getLongTermIdeas(): LongTermIdea[] {
    return readJsonArray<LongTermIdea>('long_term_ideas');
  },

  saveLongTermIdeas(ideas: LongTermIdea[]): void {
    setStorageItem(getKey('long_term_ideas'), JSON.stringify(ideas));
    try {
      this.saveSnapshotIfChanged();
    } catch (err) {
      console.warn('Failed to save snapshot', err);
    }
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
  getAiSettings(): AiSettings {
    return readJsonObject<AiSettings>('ai_settings');
  },

  saveAiSettings(settings: AiSettings): void {
    setStorageItem(getKey('ai_settings'), JSON.stringify(settings));
  },

  // Analysis results
  getAnalyses(): AnalysisResult[] {
    return readJsonArray<AnalysisResult>('analyses');
  },

  addAnalysis(a: AnalysisResult): void {
    const arr = this.getAnalyses();
    arr.push(a);
    setStorageItem(getKey('analyses'), JSON.stringify(arr));
  },

  saveAnalyses(arr: AnalysisResult[]): void {
    setStorageItem(getKey('analyses'), JSON.stringify(arr));
    try {
      this.saveSnapshotIfChanged();
    } catch (err) {
      console.warn('Failed to save snapshot', err);
    }
  },

  getAutoAnalysisState(): Record<string, AutoAnalysisState> {
    return readJsonObject<Record<string, AutoAnalysisState>>('auto_analysis_state');
  },

  saveAutoAnalysisState(state: Record<string, AutoAnalysisState>): void {
    setStorageItem(getKey('auto_analysis_state'), JSON.stringify(state));
    try {
      this.saveSnapshotIfChanged();
    } catch (err) {
      console.warn('Failed to save snapshot', err);
    }
  },

  updateAutoAnalysisState(diaryId: string, updates: Partial<AutoAnalysisState>): Record<string, AutoAnalysisState> {
    const state = this.getAutoAnalysisState();
    state[diaryId] = {
      ...(state[diaryId] ?? {}),
      ...updates,
    };
    this.saveAutoAnalysisState(state);
    return state;
  },

  getDiaryInsights(): DiaryInsight[] {
    return readJsonArray<DiaryInsight>(DIARY_INSIGHTS_KEY);
  },

  saveDiaryInsights(insights: DiaryInsight[]): void {
    setStorageItem(getKey(DIARY_INSIGHTS_KEY), JSON.stringify(insights));
    try {
      this.saveSnapshotIfChanged();
    } catch (err) {
      console.warn('Failed to save snapshot', err);
    }
  },

  upsertDiaryInsight(insight: DiaryInsight): DiaryInsight[] {
    const insights = this.getDiaryInsights();
    const index = insights.findIndex((item) => item.diaryId === insight.diaryId);
    if (index >= 0) {
      insights[index] = {
        ...insights[index],
        ...insight,
        confirmedItemIds: insights[index].confirmedItemIds ?? insight.confirmedItemIds,
        dismissedItemIds: insights[index].dismissedItemIds ?? insight.dismissedItemIds,
      };
    } else {
      insights.push(insight);
    }
    this.saveDiaryInsights(insights);
    return insights;
  },

  updateDiaryInsight(diaryId: string, updates: Partial<DiaryInsight>): DiaryInsight | null {
    const insights = this.getDiaryInsights();
    const index = insights.findIndex((item) => item.diaryId === diaryId);
    if (index < 0) return null;
    const updated = { ...insights[index], ...updates, updatedAt: Date.now() };
    insights[index] = updated;
    this.saveDiaryInsights(insights);
    return updated;
  },

  getReviewDigests(): ReviewDigest[] {
    return readJsonArray<ReviewDigest>(REVIEW_DIGESTS_KEY);
  },

  saveReviewDigests(digests: ReviewDigest[]): void {
    setStorageItem(getKey(REVIEW_DIGESTS_KEY), JSON.stringify(digests));
    try {
      this.saveSnapshotIfChanged();
    } catch (err) {
      console.warn('Failed to save snapshot', err);
    }
  },

  upsertReviewDigest(digest: ReviewDigest): ReviewDigest[] {
    const digests = this.getReviewDigests();
    const index = digests.findIndex((item) =>
      item.periodType === digest.periodType &&
      item.startDate === digest.startDate &&
      item.endDate === digest.endDate
    );
    if (index >= 0) {
      digests[index] = { ...digests[index], ...digest };
    } else {
      digests.push(digest);
    }
    this.saveReviewDigests(digests);
    return digests;
  },

  clearUserData(): void {
    removeStorageItem(getKey(DIARIES_KEY));
    removeStorageItem(getKey(FOLDERS_KEY));
    removeStorageItem(getKey('tasks'));
    removeStorageItem(getKey('tags'));
    removeStorageItem(getKey('diary_tag_colors'));
    removeStorageItem(getKey('long_term_ideas'));
    removeStorageItem(getKey('analyses'));
    removeStorageItem(getKey('auto_analysis_state'));
    removeStorageItem(getKey(DIARY_INSIGHTS_KEY));
    removeStorageItem(getKey(REVIEW_DIGESTS_KEY));
    removeStorageItem(getKey('ai_settings'));
    removeStorageItem(getKey(BACKUPS_KEY));
  },


  // Backups
  getBackups(): Backup[] {
    return readJsonArray<Backup>(BACKUPS_KEY);
  },

  privateSaveBackups(backups: Backup[]) {
    if (isDesktopStoreActive()) {
      removeInBrowserBackups();
      return;
    }

    let next = backups.slice(-MAX_BACKUPS);
    while (next.length > 0) {
      try {
        localStorage.setItem(getKey(BACKUPS_KEY), JSON.stringify(next));
        return;
      } catch (err) {
        if (!isQuotaExceededError(err)) throw err;
        next = next.slice(1);
      }
    }
    localStorage.removeItem(getKey(BACKUPS_KEY));
  },

  saveSnapshotIfChanged(): void {
    const diaries = this.getDiaries();
    const folders = this.getFolders();
    const tasks = this.getTasks();
    const tags = this.getTags();
    const diaryTagColors = this.getDiaryTagColors();
    const longTermIdeas = this.getLongTermIdeas();
    const analyses = this.getAnalyses();
    const autoAnalysisState = this.getAutoAnalysisState();
    const diaryInsights = this.getDiaryInsights();
    const reviewDigests = this.getReviewDigests();
    const backups = this.getBackups();
    const last = backups.length ? backups[backups.length - 1] : null;
    try {
      const next: Backup = {
        timestamp: Date.now(),
        diaries,
        folders,
        tasks,
        tags,
        diaryTagColors,
        longTermIdeas,
        analyses,
        autoAnalysisState,
        diaryInsights,
        reviewDigests,
      };
      const same = last && JSON.stringify({
        diaries: last.diaries,
        folders: last.folders,
        tasks: last.tasks ?? [],
        tags: last.tags ?? [],
        diaryTagColors: last.diaryTagColors ?? {},
        longTermIdeas: last.longTermIdeas ?? [],
        analyses: last.analyses ?? [],
        autoAnalysisState: last.autoAnalysisState ?? {},
        diaryInsights: last.diaryInsights ?? [],
        reviewDigests: last.reviewDigests ?? [],
      }) === JSON.stringify({
        diaries: next.diaries,
        folders: next.folders,
        tasks: next.tasks ?? [],
        tags: next.tags ?? [],
        diaryTagColors: next.diaryTagColors ?? {},
        longTermIdeas: next.longTermIdeas ?? [],
        analyses: next.analyses ?? [],
        autoAnalysisState: next.autoAnalysisState ?? {},
        diaryInsights: next.diaryInsights ?? [],
        reviewDigests: next.reviewDigests ?? [],
      });
      if (same) return;
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
    if (b.tasks) this.saveTasks(b.tasks);
    if (b.tags) this.saveTags(b.tags);
    if (b.diaryTagColors) this.saveDiaryTagColors(b.diaryTagColors);
    if (b.longTermIdeas) this.saveLongTermIdeas(b.longTermIdeas);
    if (b.analyses) this.saveAnalyses(b.analyses);
    if (b.autoAnalysisState) this.saveAutoAnalysisState(b.autoAnalysisState);
    if (b.diaryInsights) this.saveDiaryInsights(b.diaryInsights);
    if (b.reviewDigests) this.saveReviewDigests(b.reviewDigests);
    return b;
  },

  getAllData(): {
    diaries: Diary[];
    folders: Folder[];
    tasks: Task[];
    tags: Tag[];
    diaryTagColors: DiaryTagColors;
    longTermIdeas: LongTermIdea[];
    analyses: AnalysisResult[];
    autoAnalysisState: Record<string, AutoAnalysisState>;
    diaryInsights: DiaryInsight[];
    reviewDigests: ReviewDigest[];
  } {
    return {
      diaries: this.getDiaries(),
      folders: this.getFolders(),
      tasks: this.getTasks(),
      tags: this.getTags(),
      diaryTagColors: this.getDiaryTagColors(),
      longTermIdeas: this.getLongTermIdeas(),
      analyses: this.getAnalyses(),
      autoAnalysisState: this.getAutoAnalysisState(),
      diaryInsights: this.getDiaryInsights(),
      reviewDigests: this.getReviewDigests(),
    };
  },

  importAllData(data: unknown, options?: { replace?: boolean }) {
    try {
      const incoming = asStorageObject(data);
      const incomingDiaries: Diary[] = Array.isArray(incoming.diaries) ? incoming.diaries as Diary[] : [];
      const incomingFolders: Folder[] = Array.isArray(incoming.folders) ? incoming.folders as Folder[] : [];
      const incomingTasks: Task[] = Array.isArray(incoming.tasks) ? incoming.tasks as Task[] : [];
      const incomingTags: Tag[] = Array.isArray(incoming.tags) ? incoming.tags as Tag[] : [];
      const incomingLongTermIdeas: LongTermIdea[] = Array.isArray(incoming.longTermIdeas) ? incoming.longTermIdeas as LongTermIdea[] : [];
      const incomingAnalyses: AnalysisResult[] = Array.isArray(incoming.analyses) ? incoming.analyses as AnalysisResult[] : [];
      const incomingDiaryInsights: DiaryInsight[] = Array.isArray(incoming.diaryInsights) ? incoming.diaryInsights as DiaryInsight[] : [];
      const incomingReviewDigests: ReviewDigest[] = Array.isArray(incoming.reviewDigests) ? incoming.reviewDigests as ReviewDigest[] : [];
      const incomingDiaryTagColors = asStorageObject(incoming.diaryTagColors) as DiaryTagColors;
      const incomingAutoAnalysisState = asStorageObject(incoming.autoAnalysisState) as Record<string, AutoAnalysisState>;

      if (options?.replace) {
        this.saveFolders(incomingFolders);
        this.saveDiaries(incomingDiaries);
        if (Array.isArray(incoming.tasks)) this.saveTasks(incomingTasks);
        if (Array.isArray(incoming.tags)) this.saveTags(incomingTags);
        if (incoming.diaryTagColors) this.saveDiaryTagColors(incomingDiaryTagColors);
        if (Array.isArray(incoming.longTermIdeas)) this.saveLongTermIdeas(incomingLongTermIdeas);
        if (Array.isArray(incoming.analyses)) this.saveAnalyses(incomingAnalyses);
        if (incoming.autoAnalysisState) this.saveAutoAnalysisState(incomingAutoAnalysisState);
        if (Array.isArray(incoming.diaryInsights)) this.saveDiaryInsights(incomingDiaryInsights);
        if (Array.isArray(incoming.reviewDigests)) this.saveReviewDigests(incomingReviewDigests);
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

      if (incomingTasks.length > 0) {
        const taskMap = new Map(this.getTasks().map(task => [task.id, task]));
        incomingTasks.forEach(task => taskMap.set(task.id || cryptoRandomId(), { ...taskMap.get(task.id), ...task }));
        this.saveTasks(Array.from(taskMap.values()));
      }

      if (incomingTags.length > 0) {
        const tagMap = new Map(this.getTags().map(tag => [tag.id, tag]));
        incomingTags.forEach(tag => tagMap.set(tag.id || cryptoRandomId(), { ...tagMap.get(tag.id), ...tag }));
        this.saveTags(Array.from(tagMap.values()));
      }

      if (incoming.diaryTagColors) {
        this.saveDiaryTagColors({
          ...this.getDiaryTagColors(),
          ...incomingDiaryTagColors,
        });
      }

      if (incomingLongTermIdeas.length > 0) {
        const ideaMap = new Map(this.getLongTermIdeas().map(idea => [idea.id, idea]));
        incomingLongTermIdeas.forEach(idea => ideaMap.set(idea.id || cryptoRandomId(), { ...ideaMap.get(idea.id), ...idea }));
        this.saveLongTermIdeas(Array.from(ideaMap.values()));
      }

      if (incomingAnalyses.length > 0) {
        const analysisMap = new Map(this.getAnalyses().map(analysis => [analysis.id, analysis]));
        incomingAnalyses.forEach(analysis => analysisMap.set(analysis.id || cryptoRandomId(), { ...analysisMap.get(analysis.id), ...analysis }));
        this.saveAnalyses(Array.from(analysisMap.values()));
      }

      if (incoming.autoAnalysisState) {
        this.saveAutoAnalysisState({
          ...this.getAutoAnalysisState(),
          ...incomingAutoAnalysisState,
        });
      }

      if (incomingDiaryInsights.length > 0) {
        const insightMap = new Map(this.getDiaryInsights().map((insight) => [insight.diaryId, insight]));
        incomingDiaryInsights.forEach((insight) => insightMap.set(insight.diaryId || cryptoRandomId(), { ...insightMap.get(insight.diaryId), ...insight }));
        this.saveDiaryInsights(Array.from(insightMap.values()));
      }

      if (incomingReviewDigests.length > 0) {
        const digestMap = new Map(this.getReviewDigests().map((digest) => [`${digest.periodType}-${digest.startDate}-${digest.endDate}`, digest]));
        incomingReviewDigests.forEach((digest) => {
          const key = `${digest.periodType}-${digest.startDate}-${digest.endDate}`;
          digestMap.set(key, { ...digestMap.get(key), ...digest });
        });
        this.saveReviewDigests(Array.from(digestMap.values()));
      }
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

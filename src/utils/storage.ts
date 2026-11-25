import { LONG_TERM_MASTER_ID, TEMPLATE_DIARY_ID, type Diary, type TrashedDiary, type Folder, type Task, type Tag } from '../types';
import { getDesktopStoreItem, isDesktopStoreActive, listDesktopStoreKeys, removeDesktopStoreItem, setDesktopStoreItem } from './desktopStore';
import { syncQueue } from './syncQueue';

type DiaryTagColors = Record<string, string>;

export type Backup = {
  timestamp: number;
  diaries: Diary[];
  folders: Folder[];
  tasks?: Task[];
  tags?: Tag[];
  diaryTagColors?: DiaryTagColors;
};

const DIARIES_KEY = 'diaries';
const TRASH_KEY = 'diaries_trash';
const FOLDERS_KEY = 'folders';
const BACKUPS_KEY = 'diaries_backups';
const MAX_BACKUPS = 2;
const LEGACY_LONG_TERM_MASTER_ID = 'long-term-master';
const ACCOUNT_SCOPED_DATA_KEYS = [
  DIARIES_KEY,
  FOLDERS_KEY,
  'tasks',
  'tags',
  'diary_tag_colors',
  // 下面两个键来自 2026-09-22 下线的长期想法与 AI 设置，应用已不再读写。
  // 保留在这里，只为让旧机器上的残留仍能走同一条路径被 clearUserData 清掉。
  'long_term_ideas',
  'ai_settings',
  BACKUPS_KEY,
];

type StorageObject = Record<string, unknown>;

// 添加一个全局变量来存储当前用户 ID
let currentUserId: string | null = null;

// 设置当前用户 ID
export const setCurrentUserId = (userId: string | null) => {
  currentUserId = userId;
};

export const getCurrentStorageUserId = () => currentUserId;

// 上次登录成功的用户 ID，存在不带账号后缀的键里。
// 云端连不上时靠它继续读本机数据——否则会退回匿名空间，本地日记全部看不见。
// 只有用户主动退出登录时才清除，网络失败不清。
const LAST_USER_ID_KEY = 'glimmer_last_user_id';

export const rememberLastUserId = (userId: string | null) => {
  if (userId) {
    setStorageItem(LAST_USER_ID_KEY, userId);
  } else {
    removeStorageItem(LAST_USER_ID_KEY);
  }
};

export const getLastUserId = (): string | null => getStorageItem(LAST_USER_ID_KEY);

// 从已存在的数据里认出账号 ID。
// 用于登录记忆还没写过、但本机已经有账号数据的情况——比如会话过期后一直没能重新登录。
// 只有恰好一个账号时才认，多账号说不准该用哪个，宁可不认。
const USER_SCOPED_DIARY_KEY = /^diaries-([0-9a-f-]{36})$/i;

export const inferLastUserIdFromStoredData = (): string | null => {
  const keys = new Set<string>(listDesktopStoreKeys());
  if (typeof localStorage !== 'undefined') {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key) keys.add(key);
    }
  }

  const found = new Set<string>();
  keys.forEach((key) => {
    const match = USER_SCOPED_DIARY_KEY.exec(key);
    if (!match) return;
    const raw = getStorageItem(key);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) found.add(match[1]);
    } catch {
      // 解析不了就当它不存在，不影响其他候选
    }
  });

  return found.size === 1 ? [...found][0] : null;
};

const UNSYNCED_DIARIES_KEY = 'unsynced_diary_ids';

// 恢复备份或整份导入后，把日记的修改时间改成现在。不改的话它们带着备份当时的旧时间，
// 重新加载时一和云端合并，云端那份「更新」的版本就会把刚恢复的内容盖回去；
// 改成现在之后，合并时本机这份胜出，并会被补传到云端。
const stampAsJustEdited = (diaries: Diary[]): Diary[] => {
  const now = Date.now();
  return diaries.map((diary) => ({ ...diary, updatedAt: now }));
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

  // 把「未登录」那块里他写的日记并进账号，并记成待上传，然后从那块里拿掉。
  // 登录过期或从没登录时写的日记都在那块；只做 copyAnonymousDataToUserIfEmpty 的话，
  // 账号里已有的同一篇会压过那块里更新的版本，那块里新写的也不会被上传。
  // 系统日记（模板、长期任务）每块都有一份，不搬。
  adoptAnonymousDiaries(userId: string): number {
    const anonKey = getKeyForUser(DIARIES_KEY, null);
    const accountKey = getKeyForUser(DIARIES_KEY, userId);
    const parseList = (raw: string | null): Diary[] => {
      try {
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        return Array.isArray(parsed) ? (parsed as Diary[]) : [];
      } catch {
        return [];
      }
    };
    const anon = parseList(getStorageItem(anonKey));
    const isSystem = (diary: Diary) =>
      diary.id === LONG_TERM_MASTER_ID || diary.id === LEGACY_LONG_TERM_MASTER_ID || diary.id === TEMPLATE_DIARY_ID
      || Boolean(diary.isLongTermMaster) || Boolean(diary.isTemplateDiary);
    const toAdopt = anon.filter((diary) => diary && typeof diary.id === 'string' && !isSystem(diary));

    const account = parseList(getStorageItem(accountKey));
    const byId = new Map(account.map((diary) => [diary.id, diary]));
    const adoptedIds: string[] = [];
    toAdopt.forEach((diary) => {
      const existing = byId.get(diary.id);
      const newer = !existing || (diary.updatedAt ?? diary.createdAt) > (existing.updatedAt ?? existing.createdAt);
      if (newer) {
        byId.set(diary.id, diary);
        adoptedIds.push(diary.id);
      }
    });

    if (toAdopt.length > 0) {
      setStorageItem(accountKey, JSON.stringify(Array.from(byId.values())));
      const unsyncedKey = getKeyForUser(UNSYNCED_DIARIES_KEY, userId);
      const unsynced = new Set(parseList(getStorageItem(unsyncedKey)) as unknown as string[]);
      adoptedIds.forEach((id) => unsynced.add(id));
      setStorageItem(unsyncedKey, JSON.stringify(Array.from(unsynced)));
      setStorageItem(anonKey, JSON.stringify(anon.filter((diary) => !toAdopt.includes(diary))));
    }

    // 日记引用的文件夹、以及那块里的废纸篓，也一起并过来（账号里没有的才加），再从那块里清掉。
    [FOLDERS_KEY, TRASH_KEY].forEach((key) => {
      const sourceKey = getKeyForUser(key, null);
      const source = parseList(getStorageItem(sourceKey)) as unknown as Array<{ id?: string }>;
      if (source.length === 0) return;
      const targetKey = getKeyForUser(key, userId);
      const target = parseList(getStorageItem(targetKey)) as unknown as Array<{ id?: string }>;
      const known = new Set(target.map((item) => item.id));
      const missing = source.filter((item) => item && typeof item.id === 'string' && !known.has(item.id));
      if (missing.length > 0) setStorageItem(targetKey, JSON.stringify([...target, ...missing]));
      setStorageItem(sourceKey, JSON.stringify([]));
    });

    return adoptedIds.length;
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

  // 删除先进废纸篓。日记是攒出来的东西，误删一篇的代价远高于多留一份副本。
  deleteDiary(id: string): void {
    const diaries = this.getDiaries();
    const target = diaries.find(d => d.id === id);
    if (target) {
      const trash = this.getTrashedDiaries().filter(item => item.id !== id);
      trash.unshift({ ...target, deletedAt: Date.now() });
      this.saveTrashedDiaries(trash);
    }
    this.saveDiaries(diaries.filter(d => d.id !== id));
  },

  // 没登录会话时改过、还没到云端的日记。重新登录后按这份补传，
  // 不然登录过期那几天写的东西会一直只在本机。
  getUnsyncedDiaryIds(): string[] {
    return readJsonArray<string>(UNSYNCED_DIARIES_KEY).filter((id) => typeof id === 'string');
  },

  markDiaryUnsynced(id: string): void {
    const ids = new Set(this.getUnsyncedDiaryIds());
    if (ids.has(id)) return;
    ids.add(id);
    setStorageItem(getKey(UNSYNCED_DIARIES_KEY), JSON.stringify(Array.from(ids)));
  },

  clearUnsyncedDiaryIds(done: string[]): void {
    const doneSet = new Set(done);
    const remaining = this.getUnsyncedDiaryIds().filter((id) => !doneSet.has(id));
    setStorageItem(getKey(UNSYNCED_DIARIES_KEY), JSON.stringify(remaining));
  },

  getTrashedDiaries(): TrashedDiary[] {
    return readJsonArray<TrashedDiary>(TRASH_KEY);
  },

  saveTrashedDiaries(items: TrashedDiary[]): void {
    setStorageItem(getKey(TRASH_KEY), JSON.stringify(items));
  },

  restoreTrashedDiary(id: string): Diary | null {
    const trash = this.getTrashedDiaries();
    const target = trash.find(item => item.id === id);
    if (!target) return null;

    this.saveTrashedDiaries(trash.filter(item => item.id !== id));

    const diary: Diary = {
      id: target.id,
      title: target.title,
      content: target.content,
      folderId: target.folderId,
      tags: target.tags,
      createdAt: target.createdAt,
      updatedAt: Date.now(),
      isLongTermMaster: target.isLongTermMaster,
      isTemplateDiary: target.isTemplateDiary,
    };
    const diaries = this.getDiaries();
    if (!diaries.some(d => d.id === diary.id)) {
      diaries.push(diary);
      this.saveDiaries(diaries);
    }
    return diary;
  },

  purgeTrashedDiary(id: string): void {
    this.saveTrashedDiaries(this.getTrashedDiaries().filter(item => item.id !== id));
  },

  emptyTrash(): void {
    this.saveTrashedDiaries([]);
  },

  // 过了保留期的自己消失，否则废纸篓会一直长，而他永远不会想起来去清。
  purgeExpiredTrash(retentionDays: number): number {
    const trash = this.getTrashedDiaries();
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const kept = trash.filter(item => item.deletedAt > cutoff);
    if (kept.length !== trash.length) {
      this.saveTrashedDiaries(kept);
    }
    return trash.length - kept.length;
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

    // 里面的日记移出文件夹。修改时间记成现在并记为待上传：不然和云端合并时两边时间一样，
    // 云端那份（还指着这个文件夹）会胜出，日记又被拉回已删掉的文件夹。
    const now = Date.now();
    const moved: string[] = [];
    const updatedDiaries = this.getDiaries().map(d => {
      if (d.folderId !== id) return d;
      moved.push(d.id);
      return { ...d, folderId: null, updatedAt: now };
    });
    this.saveDiaries(updatedDiaries);
    moved.forEach((diaryId) => this.markDiaryUnsynced(diaryId));
    // 废纸篓里属于这个文件夹的也一起移出，恢复时才不会回到一个已经不存在的文件夹。
    const trash = this.getTrashedDiaries();
    if (trash.some((item) => item.folderId === id)) {
      this.saveTrashedDiaries(trash.map((item) => (item.folderId === id ? { ...item, folderId: null } : item)));
    }
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
      const recurring = typeof taskRecord.recurring === 'string' && taskRecord.recurring.trim()
        ? taskRecord.recurring
        : null;
      // A recurring task without a rule cannot be scheduled; keep it usable as a
      // long-term task instead of hiding it in a section that cannot render it.
      const taskType = taskRecord.taskType === 'recurring' && !recurring
        ? 'long-term'
        : taskRecord.taskType || 'long-term';
      return {
        ...taskRecord,
        taskType,
        recurring,
        rotation: typeof taskRecord.rotation === 'string' && taskRecord.rotation.trim()
          ? taskRecord.rotation
          : null,
        rotationIndex: typeof taskRecord.rotationIndex === 'number' ? taskRecord.rotationIndex : null,
        startDate: taskRecord.startDate || null,
        endDate: taskRecord.endDate || null,
        completedAt: taskRecord.completedAt || null,
        // Recurring tasks are never "finished"; a stale flag from another client
        // would otherwise bury them in the completed list.
        ...(taskType === 'recurring' ? { completed: false } : {}),
        tags: taskRecord.tags || [],
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

  clearUserData(): void {
    removeStorageItem(getKey(DIARIES_KEY));
    removeStorageItem(getKey(FOLDERS_KEY));
    removeStorageItem(getKey('tasks'));
    removeStorageItem(getKey('tags'));
    removeStorageItem(getKey('diary_tag_colors'));
    removeStorageItem(getKey('long_term_ideas'));
    // 回顾 / 洞察子系统已于 2026-09-22 移除，这两个键只可能来自旧版本。
    // 清空时一并删掉，避免旧数据永远留在本机。
    removeStorageItem(getKey('analyses'));
    removeStorageItem(getKey('auto_analysis_state'));
    removeStorageItem(getKey('diary_insights'));
    removeStorageItem(getKey('review_digests'));
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
      };
      const same = last && JSON.stringify({
        diaries: last.diaries,
        folders: last.folders,
        tasks: last.tasks ?? [],
        tags: last.tags ?? [],
        diaryTagColors: last.diaryTagColors ?? {},
      }) === JSON.stringify({
        diaries: next.diaries,
        folders: next.folders,
        tasks: next.tasks ?? [],
        tags: next.tags ?? [],
        diaryTagColors: next.diaryTagColors ?? {},
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
    this.saveDiaries(stampAsJustEdited(b.diaries));
    this.saveFolders(b.folders);
    if (b.tasks) this.saveTasks(b.tasks);
    if (b.tags) this.saveTags(b.tags);
    if (b.diaryTagColors) this.saveDiaryTagColors(b.diaryTagColors);
    return b;
  },

  getAllData(): {
    diaries: Diary[];
    folders: Folder[];
    tasks: Task[];
    tags: Tag[];
    diaryTagColors: DiaryTagColors;
  } {
    return {
      diaries: this.getDiaries(),
      folders: this.getFolders(),
      tasks: this.getTasks(),
      tags: this.getTags(),
      diaryTagColors: this.getDiaryTagColors(),
    };
  },

  // 导入日记的统一规则：
  // - 合并：同一篇只在导入的版本更新时才替换，旧备份不会盖掉这几天刚改的内容。
  // - 替换：本机日记换成导入的这批（修改时间记成现在），原来有、导入里没有的排队从云端删掉，
  //   不然下次同步又会被拉回来。
  // 被改动的日记都记为待上传，下次和云端合并时补传。返回导入后的完整日记列表。
  importDiaries(incoming: Diary[], options?: { replace?: boolean }): Diary[] {
    const withIds = incoming.map((diary) => (diary.id ? diary : { ...diary, id: cryptoRandomId() }));
    const existing = this.getDiaries();
    const isSystem = (diary: Diary) =>
      diary.id === LONG_TERM_MASTER_ID || diary.id === TEMPLATE_DIARY_ID || Boolean(diary.isLongTermMaster) || Boolean(diary.isTemplateDiary);
    const stamp = (diary: Diary) => diary.updatedAt ?? diary.createdAt;

    let result: Diary[];
    let changedIds: string[];
    if (options?.replace) {
      const stamped = stampAsJustEdited(withIds);
      const incomingIds = new Set(stamped.map((diary) => diary.id));
      const removed = existing.filter((diary) => !isSystem(diary) && !incomingIds.has(diary.id));
      if (currentUserId) {
        removed.forEach((diary) => syncQueue.enqueue({ type: 'diary', action: 'delete', data: diary, userId: currentUserId! }));
      }
      result = stamped;
      changedIds = stamped.map((diary) => diary.id);
    } else {
      const map = new Map(existing.map((diary) => [diary.id, diary]));
      changedIds = [];
      withIds.forEach((diary) => {
        const current = map.get(diary.id);
        if (!current || stamp(diary) > stamp(current)) {
          map.set(diary.id, current ? { ...current, ...diary } : diary);
          changedIds.push(diary.id);
        }
      });
      result = Array.from(map.values());
    }

    this.saveDiaries(result);
    changedIds.forEach((id) => this.markDiaryUnsynced(id));
    return result;
  },

  importAllData(data: unknown, options?: { replace?: boolean }) {
    try {
      const incoming = asStorageObject(data);
      const incomingDiaries: Diary[] = Array.isArray(incoming.diaries) ? incoming.diaries as Diary[] : [];
      const incomingFolders: Folder[] = Array.isArray(incoming.folders) ? incoming.folders as Folder[] : [];
      const incomingTasks: Task[] = Array.isArray(incoming.tasks) ? incoming.tasks as Task[] : [];
      const incomingTags: Tag[] = Array.isArray(incoming.tags) ? incoming.tags as Tag[] : [];
      const incomingDiaryTagColors = asStorageObject(incoming.diaryTagColors) as DiaryTagColors;

      if (options?.replace) {
        this.saveFolders(incomingFolders);
        this.importDiaries(incomingDiaries, { replace: true });
        if (Array.isArray(incoming.tasks)) this.saveTasks(incomingTasks);
        if (Array.isArray(incoming.tags)) this.saveTags(incomingTags);
        if (incoming.diaryTagColors) this.saveDiaryTagColors(incomingDiaryTagColors);
        return;
      }

      // 合并文件夹：本机没有的才加，本机已有的保持现在的名字。
      const existingFolders = this.getFolders();
      const folderMap = new Map(existingFolders.map(f => [f.id, f]));
      incomingFolders.forEach(f => {
        if (!f.id) f.id = cryptoRandomId();
        if (!folderMap.has(f.id)) folderMap.set(f.id, f);
      });
      this.saveFolders(Array.from(folderMap.values()));

      this.importDiaries(incomingDiaries);

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

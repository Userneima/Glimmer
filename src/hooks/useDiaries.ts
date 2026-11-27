import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { LONG_TERM_MASTER_ID, TEMPLATE_DIARY_ID } from '../types';
import type { Diary, TrashedDiary } from '../types';
import { storage, getCurrentStorageUserId } from '../utils/storage';
import { cloud } from '../utils/cloud';
import { useAuth } from '../context/useAuth';
import { useSyncStatus } from '../context/SyncStatusContext';
import { syncQueue } from '../utils/syncQueue';
import { syncManager } from '../utils/syncManager';
import { markSyncSucceeded } from '../utils/lastSync';
import { showToast, getErrorMessage } from '../utils/toast';
import { t } from '../i18n';

// 删掉的日记留这么多天。够长到他想起来能找回，够短到不会积成一座山。
const TRASH_RETENTION_DAYS = 30;
import {
  DEFAULT_TEMPLATE_DIARY_CONTENT,
  DEFAULT_TEMPLATE_DIARY_TITLE,
  buildDiaryFromTemplateDiary,
  removeTodayPlanSection,
} from '../utils/diaryTemplate';
import {
  LEGACY_LONG_TERM_MASTER_ID,
  ensureSystemDiaries,
  isBlankHtmlContent,
  isLongTermMasterDiary,
  isSystemDiary,
} from '../utils/diarySystem';
import { planCloudMerge } from '../utils/diaryMerge';

type CreateDiaryOptions = {
  createdAt?: number;
  title?: string;
  content?: string;
  tags?: string[];
  select?: boolean;
  /** 补写过去的日子时，模板里的「今日计划」不插进来。 */
  skipTodayPlan?: boolean;
};

const CLOUD_PULL_THROTTLE_MS = 60 * 1000;
const QUEUE_RETRY_INTERVAL_MS = 60 * 1000;

// 刷新或重开应用时回到上次在写的那篇。只记在本机，属于界面状态，不进同步。
const LAST_OPENED_DIARY_KEY = 'glimmer-last-opened-diary';

const readLastOpenedDiaryId = () => {
  try {
    return localStorage.getItem(LAST_OPENED_DIARY_KEY);
  } catch {
    return null;
  }
};

export const useDiaries = () => {
  const { user, storageUserId } = useAuth();
  const userId = user?.id ?? null;
  const { startSync, finishSync, failSync, setPendingCount } = useSyncStatus();
  const diarySyncTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const diarySyncInFlightRef = useRef<Set<string>>(new Set());
  const diarySyncDirtyRef = useRef<Record<string, boolean>>({});
  const lastCloudPullAtRef = useRef(0);
  const [diaries, setDiaries] = useState<Diary[]>(() => storage.getDiaries());
  const [currentDiaryId, setCurrentDiaryId] = useState<string | null>(() => {
    const loadedDiaries = storage.getDiaries();
    if (loadedDiaries.length === 0) return null;
    const lastOpened = readLastOpenedDiaryId();
    if (lastOpened && loadedDiaries.some((d) => d.id === lastOpened)) return lastOpened;
    const master = loadedDiaries.find((d) => d.id === LONG_TERM_MASTER_ID || d.id === LEGACY_LONG_TERM_MASTER_ID);
    return master ? master.id : loadedDiaries[0].id;
  });

  useEffect(() => {
    if (!currentDiaryId) return;
    try {
      localStorage.setItem(LAST_OPENED_DIARY_KEY, currentDiaryId);
    } catch {
      // 记不住只是下次打开回到默认那篇
    }
  }, [currentDiaryId]);
  const [searchQuery, setSearchQuery] = useState('');

  // Update pending count whenever queue changes
  useEffect(() => {
    const updateCount = () => {
      setPendingCount(syncManager.getPendingCount());
    };
    updateCount();
    const unsubscribe = syncManager.addListener(updateCount);
    return unsubscribe;
  }, [setPendingCount, userId]);

  // 排队没发出去的修改和删除，登录后马上发一次，之后每分钟再试一次。
  // 以前只在浏览器报「重新联网」或手动点重试时才发，服务器出错后会一直卡在队列里。
  useEffect(() => {
    if (!userId) return;
    const drain = () => {
      if (syncManager.getPendingCount() === 0) return;
      void syncManager.processQueue(undefined, userId).then(() => {
        setPendingCount(syncManager.getPendingCount());
        markSyncSucceeded();
      });
    };
    drain();
    const timer = window.setInterval(drain, QUEUE_RETRY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [userId, setPendingCount]);

  useEffect(() => {
    const timers = diarySyncTimersRef.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const normalizeSystemDiaries = useCallback((items: Diary[]) => (
    ensureSystemDiaries(items, t('Long-term Master'))
  ), []);

  // 把云端拉回来的日记并进本地。返回 false 表示这次结果作废（账号已经换了）。
  const mergeRemoteDiaries = useCallback((targetUserId: string, remote: Diary[]) => {
    // 请求在路上时可能已经换了账号，本机存储也跟着换了空间，这时写进去就串号了。
    if (getCurrentStorageUserId() !== targetUserId) return false;

    // 按请求回来这一刻的本地数据合并：等待期间新写、新建、删除的都要算上。
    const local = storage.getDiaries();

    const { merged: mergedItems, uploadIds, remoteToDelete } = planCloudMerge({
      local,
      remote,
      trashedIds: new Set(storage.getTrashedDiaries().map((diary) => diary.id)),
      pendingDeleteIds: new Set(
        syncQueue.getAll(targetUserId)
          .filter((op) => op.type === 'diary' && op.action === 'delete')
          .map((op) => (op.data as Diary).id),
      ),
      unsyncedIds: new Set(storage.getUnsyncedDiaryIds()),
    });
    const merged = normalizeSystemDiaries(mergedItems).sort(
      (a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)
    );
    storage.saveDiaries(merged);
    setDiaries(merged);
    setCurrentDiaryId((prev) => {
      if (prev && merged.some((d) => d.id === prev)) return prev;
      return merged.length > 0 ? merged[0].id : null;
    });

    const toUpload = merged.filter((diary) => uploadIds.has(diary.id));
    toUpload.forEach((diary) => {
      void cloud.upsertDiary(targetUserId, diary).catch(() => {
        syncQueue.enqueue({ type: 'diary', action: 'update', data: diary, userId: targetUserId });
      });
    });
    storage.clearUnsyncedDiaryIds(toUpload.map((diary) => diary.id));

    remoteToDelete.forEach((diary) => {
      void cloud.deleteDiary(targetUserId, diary.id).catch(() => {
        syncQueue.enqueue({ type: 'diary', action: 'delete', data: diary, userId: targetUserId });
      });
    });

    setPendingCount(syncManager.getPendingCount());
    return true;
  }, [normalizeSystemDiaries, setPendingCount]);

  const refreshDiariesFromCloud = useCallback(async (targetUserId: string) => {
    const remote = await cloud.fetchDiaries(targetUserId);
    lastCloudPullAtRef.current = Date.now();
    if (remote.length === 0) return 0; // Don't overwrite local with empty cloud result
    if (!mergeRemoteDiaries(targetUserId, remote)) return 0;
    return remote.length;
  }, [mergeRemoteDiaries]);

  const pullDiariesFromCloud = useCallback(async (options?: { silent?: boolean; force?: boolean }) => {
    if (!userId) return 0;
    if (
      options?.silent &&
      !options.force &&
      Date.now() - lastCloudPullAtRef.current < CLOUD_PULL_THROTTLE_MS
    ) {
      return 0;
    }

    if (!options?.silent) startSync();
    try {
      const count = await refreshDiariesFromCloud(userId);
      if (!options?.silent) {
        finishSync();
        markSyncSucceeded();
      }
      return count;
    } catch (err) {
      const errorMsg = getErrorMessage(err) || t('Cloud sync failed');
      if (!options?.silent) {
        failSync(errorMsg);
        showToast(errorMsg);
      }
      return 0;
    }
  }, [failSync, finishSync, refreshDiariesFromCloud, startSync, userId]);

  useEffect(() => {
    let active = true;

    const loadDiaries = async () => {
      const raw = storage.getDiaries();
      const local = normalizeSystemDiaries(raw);
      if (local.length !== raw.length || local.some((d, i) => d !== raw[i])) {
        storage.saveDiaries(local);
      }
      if (active) {
        setDiaries(local);
        setCurrentDiaryId((prev) => {
          if (prev) return prev;
          if (local.length === 0) return null;
          const lastOpened = readLastOpenedDiaryId();
          if (lastOpened && local.some((d) => d.id === lastOpened)) return lastOpened;
          const master = local.find((d) => d.id === LONG_TERM_MASTER_ID);
          return master ? master.id : local[0].id;
        });
      }

      if (!userId) return;

      try {
        const remote = await cloud.fetchDiaries(userId);
        lastCloudPullAtRef.current = Date.now();
        if (!active) return;

        if (remote.length === 0) {
          // Cloud empty but local has data — silently backfill cloud, keep showing local
          // 云端还是空的（第一次用云同步）：把本机日记排进队列上传，失败的会留着重试。
          local.forEach((d) => syncQueue.enqueue({ type: 'diary', action: 'update', data: d, userId }));
          void syncManager.processQueue(undefined, userId).then(() => {
            setPendingCount(syncManager.getPendingCount());
            markSyncSucceeded();
          });
          return;
        }

        // Merge: keep all local entries; prefer cloud if newer, but never let
        // a blank cloud Long-term Master erase meaningful local content.
        if (!mergeRemoteDiaries(userId, remote)) return;
        markSyncSucceeded();
      } catch {
        // Cloud error — local data is already shown, nothing to do
      }
    };

    void loadDiaries();

    return () => {
      active = false;
    };
  }, [mergeRemoteDiaries, normalizeSystemDiaries, setPendingCount, userId, storageUserId]);

  useEffect(() => {
    if (!userId || typeof window === 'undefined' || typeof document === 'undefined') return;

    const pullIfVisible = () => {
      if (document.visibilityState === 'visible') {
        void pullDiariesFromCloud({ silent: true });
      }
    };

    const handleVisibilityChange = () => {
      pullIfVisible();
    };

    window.addEventListener('focus', pullIfVisible);
    window.addEventListener('online', pullIfVisible);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(pullIfVisible, 2 * 60 * 1000);

    return () => {
      window.removeEventListener('focus', pullIfVisible);
      window.removeEventListener('online', pullIfVisible);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [pullDiariesFromCloud, userId]);

  const createDiary = useCallback((folderId: string | null = null, options?: CreateDiaryOptions) => {
    const createdAt = options?.createdAt ?? Date.now();
    const templateDiary = diaries.find((diary) => diary.id === TEMPLATE_DIARY_ID) ?? {
      id: TEMPLATE_DIARY_ID,
      title: DEFAULT_TEMPLATE_DIARY_TITLE,
      content: DEFAULT_TEMPLATE_DIARY_CONTENT,
      folderId: null,
      tags: [],
      createdAt,
      updatedAt: createdAt,
      isTemplateDiary: true,
    };
    const newDiary: Diary = {
      id: uuidv4(),
      ...buildDiaryFromTemplateDiary({
        templateDiary,
        createdAt,
        folderId,
      }),
      ...(options?.title !== undefined ? { title: options.title } : {}),
      ...(options?.content !== undefined ? { content: options.content } : {}),
      ...(options?.tags !== undefined ? { tags: options.tags } : {}),
    };
    if (options?.skipTodayPlan) {
      newDiary.content = removeTodayPlanSection(newDiary.content);
    }
    storage.addDiary(newDiary);
    setDiaries(prev => [newDiary, ...prev]);
    if (options?.select !== false) {
      setCurrentDiaryId(newDiary.id);
    }
    if (!userId) storage.markDiaryUnsynced(newDiary.id);
    if (userId) {
      startSync();
      void (async () => {
        try {
          await cloud.upsertDiary(userId, newDiary);
          await refreshDiariesFromCloud(userId);
          finishSync();
          markSyncSucceeded();
        } catch (err) {
          const errorMsg = getErrorMessage(err) || t('Cloud sync failed');
          failSync(errorMsg);
          // Add to queue for retry
          syncQueue.enqueue({
            type: 'diary',
            action: 'create',
            data: newDiary,
            userId,
          });
          setPendingCount(syncManager.getPendingCount());
          showToast(errorMsg);
        }
      })();
    }
    return newDiary;
  }, [diaries, refreshDiariesFromCloud, userId, startSync, finishSync, failSync, setPendingCount]);

  const flushDiarySync = useCallback(async (diaryId: string) => {
    if (!userId) return;

    if (diarySyncInFlightRef.current.has(diaryId)) {
      diarySyncDirtyRef.current[diaryId] = true;
      return;
    }

    const payload = storage.getDiaries().find((diary) => diary.id === diaryId);
    if (!payload) return;

    diarySyncInFlightRef.current.add(diaryId);
    startSync();
    try {
      await cloud.upsertDiary(userId, payload);
      finishSync();
      markSyncSucceeded();
    } catch (err) {
      const errorMsg = getErrorMessage(err) || t('Cloud sync failed');
      failSync(errorMsg);
      syncQueue.enqueue({
        type: 'diary',
        action: 'update',
        data: payload,
        userId,
      });
      setPendingCount(syncManager.getPendingCount());
      showToast(errorMsg);
    } finally {
      diarySyncInFlightRef.current.delete(diaryId);
      if (diarySyncDirtyRef.current[diaryId]) {
        diarySyncDirtyRef.current[diaryId] = false;
        void flushDiarySync(diaryId);
      }
    }
  }, [userId, startSync, finishSync, failSync, setPendingCount]);

  const scheduleDiarySync = useCallback((diaryId: string) => {
    if (!userId) {
      // 登录过期时改的，记下来，重新登录后补传。
      storage.markDiaryUnsynced(diaryId);
      return;
    }
    const existingTimer = diarySyncTimersRef.current[diaryId];
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    diarySyncTimersRef.current[diaryId] = setTimeout(() => {
      delete diarySyncTimersRef.current[diaryId];
      void flushDiarySync(diaryId);
    }, 800);
  }, [flushDiarySync, userId]);

  const updateDiary = useCallback((id: string, updates: Partial<Diary>) => {
    const updatedAt = Date.now();
    const current = diaries.find((d) => d.id === id);
    const safeUpdates = current && isLongTermMasterDiary(current)
      ? {
          ...(updates.content !== undefined ? { content: updates.content } : {}),
        }
      : updates;
    if (current && isLongTermMasterDiary(current) && Object.keys(safeUpdates).length === 0) {
      return;
    }
    if (
      current &&
      isLongTermMasterDiary(current) &&
      typeof safeUpdates.content === 'string' &&
      isBlankHtmlContent(safeUpdates.content) &&
      !isBlankHtmlContent(current.content)
    ) {
      console.warn('[useDiaries] Skip blank overwrite for Long-term Master diary');
      return;
    }
    storage.updateDiary(id, { ...safeUpdates, updatedAt });
    setDiaries(prev =>
      prev.map(d => (d.id === id ? { ...d, ...safeUpdates, updatedAt } : d))
    );
    scheduleDiarySync(id);
  }, [diaries, scheduleDiarySync]);

  const [trashedDiaries, setTrashedDiaries] = useState<TrashedDiary[]>(() => {
    storage.purgeExpiredTrash(TRASH_RETENTION_DAYS);
    return storage.getTrashedDiaries();
  });

  const restoreDiary = useCallback((id: string): Diary | null => {
    const restored = storage.restoreTrashedDiary(id);
    if (!restored) return null;
    setTrashedDiaries(storage.getTrashedDiaries());
    setDiaries(storage.getDiaries());
    if (userId) {
      // 删除时云端那行已经没了，恢复要重新写回去，否则换台设备又是删掉的状态。
      void cloud.upsertDiary(userId, restored).catch((err) => {
        syncQueue.enqueue({ type: 'diary', action: 'update', data: restored, userId });
        showToast(getErrorMessage(err) || t('Cloud sync failed'));
      });
    } else if (storageUserId) {
      // 登录过期时恢复的：排进队列等登录后上传，同时顶掉之前排着的那条删除。
      syncQueue.enqueue({ type: 'diary', action: 'update', data: restored, userId: storageUserId });
    }
    return restored;
  }, [userId, storageUserId]);

  const purgeDiary = useCallback((id: string) => {
    storage.purgeTrashedDiary(id);
    setTrashedDiaries(storage.getTrashedDiaries());
  }, []);

  const emptyTrash = useCallback(() => {
    storage.emptyTrash();
    setTrashedDiaries([]);
  }, []);

  const deleteDiary = useCallback((id: string) => {
    const target = diaries.find(d => d.id === id);
    if (target && isSystemDiary(target)) {
      console.warn('[useDiaries] Skip deleting system diary');
      return;
    }
    storage.deleteDiary(id);
    setDiaries(prev => prev.filter(d => d.id !== id));
    setTrashedDiaries(storage.getTrashedDiaries());
    if (currentDiaryId === id) {
      // 删掉正在看的这篇后，打开同一个文件夹里最近的一篇；那里没有就打开最近的一篇。
      // 系统日记（长期任务、模板）不算，不然删完常常跳到「长期任务」。
      const remaining = diaries
        .filter((d) => d.id !== id && !isSystemDiary(d))
        .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
      const next = remaining.find((d) => target && d.folderId === target.folderId) ?? remaining[0]
        ?? diaries.find((d) => d.id !== id && !d.isTemplateDiary);
      setCurrentDiaryId(next ? next.id : null);
    }
    if (userId && target) {
      startSync();
      void cloud.deleteDiary(userId, id).then(() => {
        finishSync();
        markSyncSucceeded();
      }).catch((err) => {
        const errorMsg = getErrorMessage(err) || t('Cloud sync failed');
        failSync(errorMsg);
        // Add to queue for retry
        syncQueue.enqueue({
          type: 'diary',
          action: 'delete',
          data: target,
          userId,
        });
        setPendingCount(syncManager.getPendingCount());
        showToast(errorMsg);
      });
    } else if (!userId && storageUserId && target) {
      // 登录过期时删的：先排进队列，登录后自动发出去。排着的删除也挡住云端
      // 把这篇拉回来，就算在那之前从废纸篓里永久删了也一样。
      syncQueue.enqueue({ type: 'diary', action: 'delete', data: target, userId: storageUserId });
      setPendingCount(syncManager.getPendingCount());
    }
  }, [currentDiaryId, diaries, userId, storageUserId, startSync, finishSync, failSync, setPendingCount]);

  // Import diaries (merge by default)
  // 导入规则见 storage.importDiaries：合并时只用更新的版本，替换时把多出来的排队删掉。
  // 改动过的都记为待上传，然后马上和云端合并一次，由合并把它们补传上去。
  const importDiaries = useCallback((imported: Diary[], options?: { replace?: boolean }) => {
    const result = normalizeSystemDiaries(storage.importDiaries(imported, options))
      .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
    storage.saveDiaries(result);
    setDiaries(result);
    if (result.length > 0 && (options?.replace || !currentDiaryId)) setCurrentDiaryId(result[0].id);
    setPendingCount(syncManager.getPendingCount());
    if (userId) void pullDiariesFromCloud({ silent: true, force: true });
  }, [currentDiaryId, normalizeSystemDiaries, pullDiariesFromCloud, setPendingCount, userId]);

  const moveDiary = useCallback((diaryId: string, folderId: string | null) => {
    const target = diaries.find((diary) => diary.id === diaryId);
    if (target && isSystemDiary(target)) {
      console.warn('[useDiaries] Skip moving system diary');
      return;
    }
    updateDiary(diaryId, { folderId });
  }, [diaries, updateDiary]);

  // 批量更新多个日记，避免在循环中多次触发存储和云同步
  const batchUpdateDiaries = useCallback((
    updates: Array<{ id: string; changes: Partial<Diary> }>,
    options?: { preserveUpdatedAt?: boolean; silent?: boolean },
  ) => {
    if (updates.length === 0) return;

    const updatedAt = Date.now();
    const nextDiaries = diaries.map((d) => {
      const entry = updates.find((u) => u.id === d.id);
      if (!entry) return d;
      const safeChanges = isLongTermMasterDiary(d)
        ? {
            ...(entry.changes.content !== undefined ? { content: entry.changes.content } : {}),
          }
        : entry.changes;
      if (isLongTermMasterDiary(d) && Object.keys(safeChanges).length === 0) {
        return d;
      }
      return {
        ...d,
        ...safeChanges,
        updatedAt: options?.preserveUpdatedAt ? d.updatedAt : updatedAt,
      };
    });

    storage.saveDiaries(nextDiaries);
    setDiaries(nextDiaries);

    if (userId) {
      if (options?.silent) {
        void Promise.all(
          updates.map(({ id, changes }) => {
            const original = diaries.find((d) => d.id === id);
            if (!original) return Promise.resolve();
            const safeChanges = isLongTermMasterDiary(original)
              ? {
                  ...(changes.content !== undefined ? { content: changes.content } : {}),
                }
              : changes;
            if (isLongTermMasterDiary(original) && Object.keys(safeChanges).length === 0) {
              return Promise.resolve();
            }
            const payload = {
              ...original,
              ...safeChanges,
              updatedAt: options.preserveUpdatedAt ? original.updatedAt : updatedAt,
            };
            return cloud.upsertDiary(userId, payload);
          }),
        ).catch(() => {});
        return;
      }

      startSync();
      void (async () => {
        try {
          await Promise.all(
            updates.map(({ id, changes }) => {
              const original = diaries.find((d) => d.id === id);
              if (!original) return Promise.resolve();
              const safeChanges = isLongTermMasterDiary(original)
                ? {
                    ...(changes.content !== undefined ? { content: changes.content } : {}),
                  }
                : changes;
              if (isLongTermMasterDiary(original) && Object.keys(safeChanges).length === 0) {
                return Promise.resolve();
              }
              const payload = {
                ...original,
                ...safeChanges,
                updatedAt: options?.preserveUpdatedAt ? original.updatedAt : updatedAt,
              };
              return cloud.upsertDiary(userId, payload);
            }),
          );
          finishSync();
        } catch (err) {
          const errorMsg = getErrorMessage(err) || t('Cloud sync failed');
          failSync(errorMsg);
          updates.forEach(({ id, changes }) => {
            const original = diaries.find((d) => d.id === id);
            if (!original) return;
            const safeChanges = isLongTermMasterDiary(original)
              ? {
                  ...(changes.content !== undefined ? { content: changes.content } : {}),
                }
              : changes;
            if (isLongTermMasterDiary(original) && Object.keys(safeChanges).length === 0) {
              return;
            }
            const payload = {
              ...original,
              ...safeChanges,
              updatedAt: options?.preserveUpdatedAt ? original.updatedAt : updatedAt,
            };
            syncQueue.enqueue({
              type: 'diary',
              action: 'update',
              data: payload,
              userId,
            });
          });
          setPendingCount(syncManager.getPendingCount());
          showToast(errorMsg);
        }
      })();
    }
  }, [diaries, userId, startSync, finishSync, failSync, setPendingCount]);

  const searchDiaries = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const filteredDiaries = diaries.filter(diary => {
    if (!searchQuery) return true;
    if (isSystemDiary(diary)) return false;
    const lowerQuery = searchQuery.toLowerCase();
    return (
      diary.title.toLowerCase().includes(lowerQuery) ||
      diary.content.toLowerCase().includes(lowerQuery)
    );
  });

  const currentDiary = diaries.find(d => d.id === currentDiaryId) || null;

  // 别的模块直接改了本机存储里的日记（比如删文件夹会清掉日记的归属），用它把界面状态对上。
  const reloadDiariesFromStorage = useCallback(() => {
    setDiaries(storage.getDiaries());
  }, []);

  return {
    diaries: filteredDiaries,
    allDiaries: diaries,
    trashedDiaries,
    trashRetentionDays: TRASH_RETENTION_DAYS,
    restoreDiary,
    purgeDiary,
    emptyTrash,
    currentDiary,
    currentDiaryId,
    searchQuery,
    createDiary,
    updateDiary,
    deleteDiary,
    moveDiary,
    batchUpdateDiaries,
    setCurrentDiaryId,
    searchDiaries,
    importDiaries,
    pullDiariesFromCloud,
    reloadDiariesFromStorage,
  };
};

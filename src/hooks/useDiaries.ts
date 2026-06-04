import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { LONG_TERM_MASTER_ID, TEMPLATE_DIARY_ID } from '../types';
import type { Diary } from '../types';
import { storage, setCurrentUserId } from '../utils/storage';
import { cloud } from '../utils/cloud';
import { useAuth } from '../context/useAuth';
import { useSyncStatus } from '../context/SyncStatusContext';
import { syncQueue } from '../utils/syncQueue';
import { syncManager } from '../utils/syncManager';
import { syncHistory } from '../utils/syncHistory';
import { showToast, getErrorMessage } from '../utils/toast';
import { t } from '../i18n';
import {
  DEFAULT_TEMPLATE_DIARY_CONTENT,
  DEFAULT_TEMPLATE_DIARY_TITLE,
  buildDiaryFromTemplateDiary,
} from '../utils/diaryTemplate';
import {
  LEGACY_LONG_TERM_MASTER_ID,
  ensureSystemDiaries,
  isBlankHtmlContent,
  isLongTermMasterDiary,
  isSystemDiary,
} from '../utils/diarySystem';
import { mergeDiariesPreferSafeLocal } from '../utils/diaryMerge';

type CreateDiaryOptions = {
  createdAt?: number;
  title?: string;
  content?: string;
  tags?: string[];
  select?: boolean;
};

const CLOUD_PULL_THROTTLE_MS = 60 * 1000;

export const useDiaries = () => {
  const { user } = useAuth();
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
    const master = loadedDiaries.find((d) => d.id === LONG_TERM_MASTER_ID || d.id === LEGACY_LONG_TERM_MASTER_ID);
    return master ? master.id : loadedDiaries[0].id;
  });
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

  // Update current user ID when user changes
  useEffect(() => {
    setCurrentUserId(userId);
  }, [userId]);

  useEffect(() => {
    const timers = diarySyncTimersRef.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const normalizeSystemDiaries = useCallback((items: Diary[]) => (
    ensureSystemDiaries(items, t('Long-term Master'))
  ), []);

  const refreshDiariesFromCloud = useCallback(async (targetUserId: string) => {
    const remote = await cloud.fetchDiaries(targetUserId);
    lastCloudPullAtRef.current = Date.now();
    if (remote.length === 0) return 0; // Don't overwrite local with empty cloud result
    const local = storage.getDiaries();
    const { merged: mergedItems, preservedLocal } = mergeDiariesPreferSafeLocal(local, remote);
    const merged = normalizeSystemDiaries(mergedItems).sort(
      (a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)
    );
    storage.saveDiaries(merged);
    setDiaries(merged);
    setCurrentDiaryId((prev) => {
      if (prev && merged.some((d) => d.id === prev)) return prev;
      return merged.length > 0 ? merged[0].id : null;
    });
    preservedLocal.forEach((diary) => {
      void cloud.upsertDiary(targetUserId, diary).catch(() => {});
    });
    return remote.length;
  }, [normalizeSystemDiaries]);

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
        syncHistory.add({
          type: 'diary',
          action: 'fetch',
          status: 'success',
          message: t('Fetched diaries from cloud'),
          count,
        });
      }
      return count;
    } catch (err) {
      const errorMsg = getErrorMessage(err) || t('Cloud sync failed');
      if (!options?.silent) {
        failSync(errorMsg);
        showToast(errorMsg);
        syncHistory.add({
          type: 'diary',
          action: 'fetch',
          status: 'error',
          message: t('Failed to fetch diaries'),
          error: errorMsg,
        });
      }
      return 0;
    }
  }, [failSync, finishSync, refreshDiariesFromCloud, startSync, userId]);

  useEffect(() => {
    let active = true;

    const loadDiaries = async () => {
      if (userId) {
        setCurrentUserId(userId);
        storage.copyAnonymousDataToUserIfEmpty(userId);
      }
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
          if (local.length > 0) {
            void Promise.all(local.map((d) => cloud.upsertDiary(userId, d))).catch(() => {});
          }
          syncHistory.add({
            type: 'diary',
            action: 'fetch',
            status: 'success',
            message: t('Fetched diaries from cloud'),
            count: 0,
          });
          return;
        }

        // Merge: keep all local entries; prefer cloud if newer, but never let
        // a blank cloud Long-term Master erase meaningful local content.
        const { merged: mergedItems, preservedLocal } = mergeDiariesPreferSafeLocal(local, remote);
        const merged = normalizeSystemDiaries(mergedItems).sort(
          (a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)
        );
        storage.saveDiaries(merged);
        setDiaries(merged);
        setCurrentDiaryId((prev) => {
          if (prev && merged.some((d) => d.id === prev)) return prev;
          return merged.length > 0 ? merged[0].id : null;
        });
        syncHistory.add({
          type: 'diary',
          action: 'fetch',
          status: 'success',
          message: t('Fetched diaries from cloud'),
          count: remote.length,
        });
        preservedLocal.forEach((diary) => {
          void cloud.upsertDiary(userId, diary).catch(() => {});
        });
      } catch {
        // Cloud error — local data is already shown, nothing to do
        syncHistory.add({
          type: 'diary',
          action: 'fetch',
          status: 'error',
          message: t('Failed to fetch diaries'),
          error: t('Network error'),
        });
      }
    };

    void loadDiaries();

    return () => {
      active = false;
    };
  }, [normalizeSystemDiaries, userId]);

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
    storage.addDiary(newDiary);
    setDiaries(prev => [newDiary, ...prev]);
    if (options?.select !== false) {
      setCurrentDiaryId(newDiary.id);
    }
    if (userId) {
      startSync();
      void (async () => {
        try {
          await cloud.upsertDiary(userId, newDiary);
          await refreshDiariesFromCloud(userId);
          finishSync();
          syncHistory.add({
            type: 'diary',
            action: 'create',
            status: 'success',
            message: t('Created diary'),
          });
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
          syncHistory.add({
            type: 'diary',
            action: 'create',
            status: 'error',
            message: t('Failed to create diary'),
            error: errorMsg,
          });
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
      syncHistory.add({
        type: 'diary',
        action: 'update',
        status: 'success',
        message: t('Updated diary'),
      });
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
      syncHistory.add({
        type: 'diary',
        action: 'update',
        status: 'error',
        message: t('Failed to update diary'),
        error: errorMsg,
      });
    } finally {
      diarySyncInFlightRef.current.delete(diaryId);
      if (diarySyncDirtyRef.current[diaryId]) {
        diarySyncDirtyRef.current[diaryId] = false;
        void flushDiarySync(diaryId);
      }
    }
  }, [userId, startSync, finishSync, failSync, setPendingCount]);

  const scheduleDiarySync = useCallback((diaryId: string) => {
    if (!userId) return;
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

  const deleteDiary = useCallback((id: string) => {
    const target = diaries.find(d => d.id === id);
    if (target && isSystemDiary(target)) {
      console.warn('[useDiaries] Skip deleting system diary');
      return;
    }
    storage.deleteDiary(id);
    setDiaries(prev => prev.filter(d => d.id !== id));
    if (currentDiaryId === id) {
      const remaining = diaries.filter(d => d.id !== id);
      setCurrentDiaryId(remaining.length > 0 ? remaining[0].id : null);
    }
    if (userId && target) {
      startSync();
      void cloud.deleteDiary(userId, id).then(() => {
        finishSync();
        syncHistory.add({
          type: 'diary',
          action: 'delete',
          status: 'success',
          message: t('Deleted diary'),
        });
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
        syncHistory.add({
          type: 'diary',
          action: 'delete',
          status: 'error',
          message: t('Failed to delete diary'),
          error: errorMsg,
        });
      });
    }
  }, [currentDiaryId, diaries, userId, startSync, finishSync, failSync, setPendingCount]);

  // Import diaries (merge by default)
  const importDiaries = useCallback((imported: Diary[], options?: { replace?: boolean }) => {
    try {
      if (options?.replace) {
        // Replace all
        const normalized = normalizeSystemDiaries(imported);
        storage.saveDiaries(normalized);
        setDiaries(normalized);
        if (normalized.length > 0) setCurrentDiaryId(normalized[0].id);
        if (userId) {
          void Promise.all(normalized.map((d) => cloud.upsertDiary(userId, d))).catch((err) => {
            showToast(getErrorMessage(err) || t('Cloud sync failed'));
          });
        }
        return;
      }

      const existing = storage.getDiaries();
      const map = new Map<string, Diary>(existing.map(d => [d.id, d]));
      imported.forEach(d => {
        const normalized = {
          ...d,
          id: d.id || uuidv4(),
        };
        // Ensure id exists
        if (map.has(normalized.id)) {
          // Overwrite existing with imported
          map.set(normalized.id, { ...map.get(normalized.id)!, ...normalized });
        } else {
          map.set(normalized.id, normalized);
        }
      });
      const merged = normalizeSystemDiaries(Array.from(map.values())).sort((a, b) => b.updatedAt - a.updatedAt);
      storage.saveDiaries(merged);
      setDiaries(merged);
      if (merged.length > 0 && !currentDiaryId) setCurrentDiaryId(merged[0].id);
      if (userId) {
        void Promise.all(merged.map((d) => cloud.upsertDiary(userId, d))).catch((err) => {
          showToast(getErrorMessage(err) || t('Cloud sync failed'));
        });
      }
    } catch (err) {
      console.error('Import diaries failed', err);
      throw err;
    }
  }, [currentDiaryId, normalizeSystemDiaries, userId]);

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

  return {
    diaries: filteredDiaries,
    allDiaries: diaries,
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
  };
};

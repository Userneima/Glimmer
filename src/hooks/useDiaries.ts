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
  LEGACY_DEFAULT_TEMPLATE_DIARY_TITLE,
  buildDiaryFromTemplateDiary,
} from '../utils/diaryTemplate';

const LEGACY_MASTER_ID = 'long-term-master';

const isLongTermMasterDiary = (diary: Pick<Diary, 'id' | 'isLongTermMaster'>) =>
  diary.id === LONG_TERM_MASTER_ID || diary.id === LEGACY_MASTER_ID || diary.isLongTermMaster;

const isBlankHtmlContent = (content: string | undefined) => {
  if (!content) return true;
  const text = content
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return text.length === 0;
};

const mergeDiariesPreferSafeLocal = (local: Diary[], remote: Diary[]) => {
  const map = new Map<string, Diary>(local.map((d) => [d.id, d]));
  const preservedLocal: Diary[] = [];

  remote.forEach((rd) => {
    const ld = map.get(rd.id);
    const remoteUpdatedAt = rd.updatedAt ?? rd.createdAt;
    const localUpdatedAt = ld ? ld.updatedAt ?? ld.createdAt : 0;

    if (
      ld &&
      isLongTermMasterDiary(rd) &&
      !isBlankHtmlContent(ld.content) &&
      isBlankHtmlContent(rd.content)
    ) {
      preservedLocal.push(ld);
      return;
    }

    if (!ld || remoteUpdatedAt >= localUpdatedAt) {
      map.set(rd.id, rd);
    }
  });

  return {
    merged: Array.from(map.values()),
    preservedLocal,
  };
};

export const useDiaries = () => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { startSync, finishSync, failSync, setPendingCount } = useSyncStatus();
  const diarySyncTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const diarySyncInFlightRef = useRef<Set<string>>(new Set());
  const diarySyncDirtyRef = useRef<Record<string, boolean>>({});
  const [diaries, setDiaries] = useState<Diary[]>(() => storage.getDiaries());
  const [currentDiaryId, setCurrentDiaryId] = useState<string | null>(() => {
    const loadedDiaries = storage.getDiaries();
    if (loadedDiaries.length === 0) return null;
    const master = loadedDiaries.find((d) => d.id === LONG_TERM_MASTER_ID || d.id === LEGACY_MASTER_ID);
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
  }, [setPendingCount]);

  // Update current user ID when user changes
  useEffect(() => {
    setCurrentUserId(userId);
  }, [userId]);

  useEffect(() => {
    return () => {
      Object.values(diarySyncTimersRef.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const ensureSystemDiaries = (items: Diary[]): Diary[] => {
    const legacyIdx = items.findIndex((d) => d.id === LEGACY_MASTER_ID);
    if (legacyIdx !== -1) {
      items[legacyIdx] = { ...items[legacyIdx], id: LONG_TERM_MASTER_ID, isLongTermMaster: true };
    }

    const idx = items.findIndex((d) => d.id === LONG_TERM_MASTER_ID);
    if (idx !== -1) {
      if (!items[idx].isLongTermMaster) {
        items[idx] = { ...items[idx], isLongTermMaster: true };
      }
    } else {
      const now = Date.now();
      const master: Diary = {
        id: LONG_TERM_MASTER_ID,
        title: t('Long-term Master'),
        content: '',
        folderId: null,
        tags: [],
        createdAt: now,
        updatedAt: now,
        isLongTermMaster: true,
      };
      items = [master, ...items];
    }

    const templateIdx = items.findIndex((d) => d.id === TEMPLATE_DIARY_ID);
    if (templateIdx !== -1) {
      const templateDiary = items[templateIdx];
      const nextTitle =
        templateDiary.title.trim() === LEGACY_DEFAULT_TEMPLATE_DIARY_TITLE
          ? DEFAULT_TEMPLATE_DIARY_TITLE
          : templateDiary.title;

      if (!templateDiary.isTemplateDiary || nextTitle !== templateDiary.title) {
        items[templateIdx] = {
          ...templateDiary,
          title: nextTitle,
          isTemplateDiary: true,
        };
      }
      return items;
    }

    const now = Date.now();
    const templateDiary: Diary = {
      id: TEMPLATE_DIARY_ID,
      title: DEFAULT_TEMPLATE_DIARY_TITLE,
      content: DEFAULT_TEMPLATE_DIARY_CONTENT,
      folderId: null,
      tags: [],
      createdAt: now,
      updatedAt: now,
      isTemplateDiary: true,
    };

    return [...items, templateDiary];
  };

  const refreshDiariesFromCloud = useCallback(async (targetUserId: string) => {
    const remote = await cloud.fetchDiaries(targetUserId);
    if (remote.length === 0) return; // Don't overwrite local with empty cloud result
    const local = storage.getDiaries();
    const { merged: mergedItems, preservedLocal } = mergeDiariesPreferSafeLocal(local, remote);
    const merged = ensureSystemDiaries(mergedItems).sort(
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
  }, []);

  useEffect(() => {
    let active = true;

    const loadDiaries = async () => {
      if (userId) {
        setCurrentUserId(userId);
        storage.copyAnonymousDataToUserIfEmpty(userId);
      }
      const raw = storage.getDiaries();
      const local = ensureSystemDiaries(raw);
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
        const merged = ensureSystemDiaries(mergedItems).sort(
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
  }, [userId]);

  const createDiary = useCallback((folderId: string | null = null, options?: { createdAt?: number }) => {
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
    };
    storage.addDiary(newDiary);
    setDiaries(prev => [newDiary, ...prev]);
    setCurrentDiaryId(newDiary.id);
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
    if (
      current &&
      isLongTermMasterDiary(current) &&
      typeof updates.content === 'string' &&
      isBlankHtmlContent(updates.content) &&
      !isBlankHtmlContent(current.content)
    ) {
      console.warn('[useDiaries] Skip blank overwrite for Long-term Master diary');
      return;
    }
    storage.updateDiary(id, { ...updates, updatedAt });
    setDiaries(prev =>
      prev.map(d => (d.id === id ? { ...d, ...updates, updatedAt } : d))
    );
    scheduleDiarySync(id);
  }, [diaries, scheduleDiarySync]);

  const deleteDiary = useCallback((id: string) => {
    const target = diaries.find(d => d.id === id);
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
        const normalized = ensureSystemDiaries(imported);
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
      const merged = ensureSystemDiaries(Array.from(map.values())).sort((a, b) => b.updatedAt - a.updatedAt);
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
  }, [currentDiaryId, userId]);

  const moveDiary = useCallback((diaryId: string, folderId: string | null) => {
    updateDiary(diaryId, { folderId });
  }, [updateDiary]);

  // 批量更新多个日记，避免在循环中多次触发存储和云同步
  const batchUpdateDiaries = useCallback((updates: Array<{ id: string; changes: Partial<Diary> }>) => {
    if (updates.length === 0) return;

    const updatedAt = Date.now();
    const nextDiaries = diaries.map((d) => {
      const entry = updates.find((u) => u.id === d.id);
      if (!entry) return d;
      return { ...d, ...entry.changes, updatedAt };
    });

    storage.saveDiaries(nextDiaries);
    setDiaries(nextDiaries);

    if (userId) {
      startSync();
      void (async () => {
        try {
          await Promise.all(
            updates.map(({ id, changes }) => {
              const original = diaries.find((d) => d.id === id);
              if (!original) return Promise.resolve();
              const payload = { ...original, ...changes, updatedAt };
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
            const payload = { ...original, ...changes, updatedAt };
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
    const lowerQuery = searchQuery.toLowerCase();
    return (
      diary.title.toLowerCase().includes(lowerQuery) ||
      diary.content.toLowerCase().includes(lowerQuery) ||
      diary.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  });

  const currentDiary = diaries.find(d => d.id === currentDiaryId) || null;

  return {
    diaries: filteredDiaries,
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
  };
};

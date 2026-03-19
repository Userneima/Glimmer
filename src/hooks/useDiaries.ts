import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { LONG_TERM_MASTER_ID } from '../types';
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

export const useDiaries = () => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { startSync, finishSync, failSync, setPendingCount } = useSyncStatus();
  const [diaries, setDiaries] = useState<Diary[]>(() => storage.getDiaries());
  const [currentDiaryId, setCurrentDiaryId] = useState<string | null>(() => {
    const loadedDiaries = storage.getDiaries();
    if (loadedDiaries.length === 0) return null;
    const master = loadedDiaries.find((d) => d.id === LONG_TERM_MASTER_ID || d.id === 'long-term-master');
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

  const LEGACY_MASTER_ID = 'long-term-master';

  const ensureLongTermMaster = (items: Diary[]): Diary[] => {
    const legacyIdx = items.findIndex((d) => d.id === LEGACY_MASTER_ID);
    if (legacyIdx !== -1) {
      items[legacyIdx] = { ...items[legacyIdx], id: LONG_TERM_MASTER_ID, isLongTermMaster: true };
    }

    const idx = items.findIndex((d) => d.id === LONG_TERM_MASTER_ID);
    if (idx !== -1) {
      if (!items[idx].isLongTermMaster) {
        items[idx] = { ...items[idx], isLongTermMaster: true };
      }
      return items;
    }
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
    return [master, ...items];
  };

  const refreshDiariesFromCloud = useCallback(async (targetUserId: string) => {
    const remote = await cloud.fetchDiaries(targetUserId);
    if (remote.length === 0) return; // Don't overwrite local with empty cloud result
    const local = storage.getDiaries();
    const map = new Map<string, Diary>(local.map((d) => [d.id, d]));
    remote.forEach((rd) => {
      const ld = map.get(rd.id);
      if (!ld || (rd.updatedAt ?? rd.createdAt) >= (ld.updatedAt ?? ld.createdAt)) {
        map.set(rd.id, rd);
      }
    });
    const merged = ensureLongTermMaster(Array.from(map.values())).sort(
      (a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)
    );
    storage.saveDiaries(merged);
    setDiaries(merged);
    setCurrentDiaryId((prev) => {
      if (prev && merged.some((d) => d.id === prev)) return prev;
      return merged.length > 0 ? merged[0].id : null;
    });
  }, []);

  useEffect(() => {
    let active = true;

    const loadDiaries = async () => {
      const raw = storage.getDiaries();
      const local = ensureLongTermMaster(raw);
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

        // Merge: keep all local entries; prefer cloud version if it is newer
        const map = new Map<string, Diary>(local.map((d) => [d.id, d]));
        remote.forEach((rd) => {
          const ld = map.get(rd.id);
          if (!ld || (rd.updatedAt ?? rd.createdAt) >= (ld.updatedAt ?? ld.createdAt)) {
            map.set(rd.id, rd);
          }
        });
        const merged = ensureLongTermMaster(Array.from(map.values())).sort(
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

  const createDiary = useCallback((folderId: string | null = null) => {
    const newDiary: Diary = {
      id: uuidv4(),
      title: 'Untitled',
      content: '',
      folderId,
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
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
  }, [refreshDiariesFromCloud, userId, startSync, finishSync, failSync, setPendingCount]);

  const updateDiary = useCallback((id: string, updates: Partial<Diary>) => {
    const updatedAt = Date.now();
    storage.updateDiary(id, { ...updates, updatedAt });
    setDiaries(prev =>
      prev.map(d => (d.id === id ? { ...d, ...updates, updatedAt } : d))
    );
    if (userId) {
      const target = diaries.find(d => d.id === id);
      const payload = target ? { ...target, ...updates, updatedAt } : null;
      if (payload) {
        startSync();
        void cloud.upsertDiary(userId, payload).then(() => {
          finishSync();
          syncHistory.add({
            type: 'diary',
            action: 'update',
            status: 'success',
            message: t('Updated diary'),
          });
        }).catch((err) => {
          const errorMsg = getErrorMessage(err) || t('Cloud sync failed');
          failSync(errorMsg);
          // Add to queue for retry
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
        });
      }
    }
  }, [diaries, userId, startSync, finishSync, failSync, setPendingCount]);

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
        storage.saveDiaries(imported);
        setDiaries(imported);
        if (imported.length > 0) setCurrentDiaryId(imported[0].id);
        if (userId) {
          void Promise.all(imported.map((d) => cloud.upsertDiary(userId, d))).catch((err) => {
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
      const merged = Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
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

import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Folder } from '../types';
import { storage } from '../utils/storage';
import { cloud } from '../utils/cloud';
import { useAuth } from '../context/useAuth';
import { showToast, getErrorMessage } from '../utils/toast';
import { t } from '../i18n';
import { syncQueue } from '../utils/syncQueue';

export const useFolders = () => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [folders, setFolders] = useState<Folder[]>(() => storage.getFolders());

  useEffect(() => {
    let active = true;

    const loadFolders = async () => {
      try {
        if (userId) {
          const remote = await cloud.fetchFolders(userId);
          if (!active) return;
          const local = storage.getFolders();
          if (remote.length === 0) {
            setFolders(local);
            if (local.length > 0) {
              void Promise.all(local.map((folder) => cloud.upsertFolder(userId, folder))).catch(() => {});
            }
            return;
          }

          const map = new Map<string, Folder>(local.map((folder) => [folder.id, folder]));
          remote.forEach((folder) => map.set(folder.id, { ...map.get(folder.id), ...folder }));
          const merged = Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
          storage.saveFolders(merged);
          setFolders(merged);
          return;
        }

        const local = storage.getFolders();
        if (!active) return;
        setFolders(local);
      } catch (err) {
        showToast(getErrorMessage(err) || t('Cloud sync failed'));
      }
    };

    void loadFolders();

    return () => {
      active = false;
    };
  }, [userId]);

  const createFolder = useCallback((name: string, parentId: string | null = null) => {
    const newFolder: Folder = {
      id: uuidv4(),
      name,
      parentId,
      createdAt: Date.now(),
    };
    storage.addFolder(newFolder);
    setFolders(prev => [...prev, newFolder]);
    if (userId) {
      void cloud.upsertFolder(userId, newFolder).catch((err) => {
        syncQueue.enqueue({
          type: 'folder',
          action: 'create',
          data: newFolder,
          userId,
        });
        showToast(getErrorMessage(err) || t('Cloud sync failed'));
      });
    }
    return newFolder;
  }, [userId]);

  const updateFolder = useCallback((id: string, updates: Partial<Folder>) => {
    storage.updateFolder(id, updates);
    setFolders(prev => prev.map(f => (f.id === id ? { ...f, ...updates } : f)));
    if (userId) {
      const target = folders.find(f => f.id === id);
      const payload = target ? { ...target, ...updates } : null;
      if (payload) {
        void cloud.upsertFolder(userId, payload).catch((err) => {
          syncQueue.enqueue({
            type: 'folder',
            action: 'update',
            data: payload,
            userId,
          });
          showToast(getErrorMessage(err) || t('Cloud sync failed'));
        });
      }
    }
  }, [folders, userId]);

  const deleteFolder = useCallback((id: string) => {
    const childMap = new Map<string | null, Folder[]>();
    folders.forEach((folder) => {
      const key = folder.parentId ?? null;
      childMap.set(key, [...(childMap.get(key) ?? []), folder]);
    });

    const idsToDelete = new Set<string>();
    const deleteOrder: string[] = [];
    const collect = (folderId: string) => {
      if (idsToDelete.has(folderId)) return;
      idsToDelete.add(folderId);
      (childMap.get(folderId) ?? []).forEach((child) => collect(child.id));
      deleteOrder.push(folderId);
    };
    collect(id);

    deleteOrder.forEach((folderId) => storage.deleteFolder(folderId));
    setFolders(prev => prev.filter(f => !idsToDelete.has(f.id)));
    if (userId) {
      const target = folders.find(f => f.id === id);
      const targets = folders.filter(f => idsToDelete.has(f.id));
      void (async () => {
        for (const folderId of deleteOrder) {
          await cloud.deleteFolder(userId, folderId);
        }
      })().catch((err) => {
        if (target) {
          targets.forEach((folder) => syncQueue.enqueue({
            type: 'folder',
            action: 'delete',
            data: folder,
            userId,
          }));
        }
        showToast(getErrorMessage(err) || t('Cloud sync failed'));
      });
    }
  }, [folders, userId]);

  const importFolders = useCallback((imported: Folder[], options?: { replace?: boolean }) => {
    try {
      if (options?.replace) {
        storage.saveFolders(imported);
        setFolders(imported);
        if (userId) {
          void Promise.all(imported.map((f) => cloud.upsertFolder(userId, f))).catch((err) => {
            showToast(getErrorMessage(err) || t('Cloud sync failed'));
          });
        }
        return;
      }
      const existing = storage.getFolders();
      const map = new Map(existing.map(f => [f.id, f]));
      imported.forEach(f => {
        const normalized = {
          ...f,
          id: f.id || uuidv4(),
        };
        if (map.has(normalized.id)) {
          map.set(normalized.id, { ...map.get(normalized.id)!, ...normalized });
        } else {
          map.set(normalized.id, normalized);
        }
      });
      const merged = Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
      storage.saveFolders(merged);
      setFolders(merged);
      if (userId) {
        void Promise.all(merged.map((f) => cloud.upsertFolder(userId, f))).catch((err) => {
          showToast(getErrorMessage(err) || t('Cloud sync failed'));
        });
      }
    } catch (err) {
      console.error('Import folders failed', err);
      throw err;
    }
  }, [userId]);

  return {
    folders,
    createFolder,
    updateFolder,
    deleteFolder,
    importFolders,
  };
};

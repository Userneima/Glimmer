import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Folder } from '../types';
import { storage } from '../utils/storage';
import { cloud } from '../utils/cloud';
import { useAuth } from '../context/useAuth';
import { showToast, getErrorMessage } from '../utils/toast';
import { t } from '../i18n';

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
          storage.saveFolders(remote);
          setFolders(remote);
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
          showToast(getErrorMessage(err) || t('Cloud sync failed'));
        });
      }
    }
  }, [folders, userId]);

  const deleteFolder = useCallback((id: string) => {
    storage.deleteFolder(id);
    setFolders(prev => prev.filter(f => f.id !== id));
    if (userId) {
      void cloud.deleteFolder(userId, id).catch((err) => {
        showToast(getErrorMessage(err) || t('Cloud sync failed'));
      });
    }
  }, [userId]);

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


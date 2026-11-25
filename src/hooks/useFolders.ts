import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Folder } from '../types';
import { storage, getCurrentStorageUserId } from '../utils/storage';
import { cloud } from '../utils/cloud';
import { useAuth } from '../context/useAuth';
import { syncQueue } from '../utils/syncQueue';
import { syncManager } from '../utils/syncManager';

// 文件夹的每次改动都先排进同步队列，再立刻试着发一次。
// 这样没登录、登录过期、网络出错时的改动都不会丢：队列一直留着，登录后或下一次重试时发出去；
// 同一个文件夹排着的旧改动会被新的顶掉，重试时用的也是本机此刻的版本，不会把旧名字写回云端。
const FOLDER_PULL_THROTTLE_MS = 60 * 1000;

export const useFolders = () => {
  const { user, storageUserId } = useAuth();
  const userId = user?.id ?? null;
  const [folders, setFolders] = useState<Folder[]>(() => storage.getFolders());
  const lastPullAtRef = useRef(0);
  // 存储换了账号（登录、登录过期退回上次账号）就重新读本机文件夹。在渲染时对比着改，
  // 而不是在 effect 里改：效果一样，少一轮用旧数据渲染。
  const [loadedScope, setLoadedScope] = useState(storageUserId);
  if (loadedScope !== storageUserId) {
    setLoadedScope(storageUserId);
    setFolders(storage.getFolders());
  }

  const queueFolderChange = useCallback((action: 'create' | 'update' | 'delete', folder: Folder) => {
    if (!storageUserId) return;
    syncQueue.enqueue({ type: 'folder', action, data: folder, userId: storageUserId });
    if (userId) void syncManager.processQueue(undefined, userId);
  }, [storageUserId, userId]);

  // 从云端拉文件夹，按请求回来这一刻的本机文件夹合并：
  // - 本机删除还排着队的，不拉回来；本机改名或新建还排着队的，以本机为准；
  // - 其余以云端为准（另一台设备改的名字会同步过来），云端没有的本机文件夹保留。
  const pullFolders = useCallback(async (targetUserId: string) => {
    const remote = await cloud.fetchFolders(targetUserId);
    if (getCurrentStorageUserId() !== targetUserId) return;
    lastPullAtRef.current = Date.now();
    const local = storage.getFolders();

    if (remote.length === 0) {
      // 云端还没有文件夹（第一次用云同步）：把本机的排队上传。
      local.forEach((folder) => syncQueue.enqueue({ type: 'folder', action: 'create', data: folder, userId: targetUserId }));
      void syncManager.processQueue(undefined, targetUserId);
      setFolders(local);
      return;
    }

    const pending = syncQueue.getAll(targetUserId).filter((op) => op.type === 'folder');
    const pendingDelete = new Set(pending.filter((op) => op.action === 'delete').map((op) => (op.data as Folder).id));
    const pendingWrite = new Set(pending.filter((op) => op.action !== 'delete').map((op) => (op.data as Folder).id));

    const map = new Map<string, Folder>(local.map((folder) => [folder.id, folder]));
    remote.forEach((folder) => {
      if (pendingDelete.has(folder.id) || pendingWrite.has(folder.id)) return;
      map.set(folder.id, { ...map.get(folder.id), ...folder });
    });
    pendingDelete.forEach((id) => map.delete(id));
    const merged = Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
    storage.saveFolders(merged);
    setFolders(merged);
  }, []);

  useEffect(() => {
    let active = true;
    if (!userId) return;

    const pullIfDue = () => {
      if (!active || Date.now() - lastPullAtRef.current < FOLDER_PULL_THROTTLE_MS) return;
      void pullFolders(userId).catch((err) => console.warn('Failed to pull folders', err));
    };
    lastPullAtRef.current = 0;
    pullIfDue();
    // 切回窗口时再拉一次，另一台设备新建或改名的文件夹不用等重启才出现。
    window.addEventListener('focus', pullIfDue);
    return () => {
      active = false;
      window.removeEventListener('focus', pullIfDue);
    };
  }, [userId, storageUserId, pullFolders]);

  const createFolder = useCallback((name: string, parentId: string | null = null) => {
    const newFolder: Folder = {
      id: uuidv4(),
      name,
      parentId,
      createdAt: Date.now(),
    };
    storage.addFolder(newFolder);
    setFolders(prev => [...prev, newFolder]);
    queueFolderChange('create', newFolder);
    return newFolder;
  }, [queueFolderChange]);

  const updateFolder = useCallback((id: string, updates: Partial<Folder>) => {
    storage.updateFolder(id, updates);
    setFolders(prev => prev.map(f => (f.id === id ? { ...f, ...updates } : f)));
    const updated = storage.getFolders().find((folder) => folder.id === id);
    if (updated) queueFolderChange('update', updated);
  }, [queueFolderChange]);

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

    const targets = folders.filter((folder) => idsToDelete.has(folder.id));
    deleteOrder.forEach((folderId) => storage.deleteFolder(folderId));
    setFolders(prev => prev.filter(f => !idsToDelete.has(f.id)));
    targets.forEach((folder) => queueFolderChange('delete', folder));
  }, [folders, queueFolderChange]);

  // 导入的文件夹：本机没有的才加（替换模式整份换掉），新加的排队上传。
  const importFolders = useCallback((imported: Folder[], options?: { replace?: boolean }) => {
    const existing = options?.replace ? [] : storage.getFolders();
    const map = new Map(existing.map((folder) => [folder.id, folder]));
    const added: Folder[] = [];
    imported.forEach((folder) => {
      const normalized = { ...folder, id: folder.id || uuidv4() };
      if (!map.has(normalized.id)) {
        map.set(normalized.id, normalized);
        added.push(normalized);
      }
    });
    const merged = Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
    storage.saveFolders(merged);
    setFolders(merged);
    added.forEach((folder) => queueFolderChange('create', folder));
  }, [queueFolderChange]);

  return {
    folders,
    createFolder,
    updateFolder,
    deleteFolder,
    importFolders,
  };
};

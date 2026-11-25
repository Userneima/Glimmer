import { syncQueue, type SyncOperation } from './syncQueue';
import { cloud } from './cloud';
import type { Diary, Folder, Task } from '../types';
import { getCurrentStorageUserId, storage } from './storage';

type RetryCallback = (success: boolean, error?: string) => void;

export class SyncManager {
  private static instance: SyncManager;
  private isProcessing = false;
  private listeners: Array<() => void> = [];

  private constructor() {
    // Listen for online event to auto-retry
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        void this.processQueue();
      });
    }
  }

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  // Add listener for queue changes
  addListener(callback: () => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((cb) => cb());
  }

  // Process all operations in the queue
  async processQueue(callback?: RetryCallback, userId?: string | null): Promise<void> {
    if (this.isProcessing) return;
    if (!navigator.onLine) return;

    this.isProcessing = true;
    const operations = syncQueue.getAll(userId);

    for (const op of operations) {
      try {
        await this.executeOperation(op);
        syncQueue.dequeue(op.id, op.userId);
        callback?.(true);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        syncQueue.updateRetry(op.id, errorMsg, op.userId);
        callback?.(false, errorMsg);
      }
    }

    this.isProcessing = false;
    this.notifyListeners();
  }

  // Execute a single operation
  private async executeOperation(op: SyncOperation): Promise<void> {
    switch (op.type) {
      case 'diary':
        await this.executeDiaryOperation(op);
        break;
      case 'folder':
        await this.executeFolderOperation(op);
        break;
      case 'task':
        await this.executeTaskOperation(op);
        break;
    }
  }

  private async executeDiaryOperation(op: SyncOperation): Promise<void> {
    const queued = op.data as Diary;
    switch (op.action) {
      case 'create':
      case 'update': {
        // 排队时存的是当时的版本。重试时优先用本机现在的版本；本机已经删了
        // （进了废纸篓）就不再上传，删除操作会另外排队。
        const diary = this.latestLocalDiary(op.userId, queued);
        if (!diary) return;
        // 云端已经有更新的版本（比如另一台设备改过），就不拿旧的去盖它，
        // 下次拉取会把新版本带回来。
        const remoteUpdatedAt = await cloud.fetchDiaryUpdatedAt(op.userId, diary.id);
        if (remoteUpdatedAt !== null && remoteUpdatedAt > (diary.updatedAt ?? diary.createdAt)) return;
        await cloud.upsertDiary(op.userId, diary);
        break;
      }
      case 'delete':
        await cloud.deleteDiary(op.userId, queued.id);
        break;
    }
  }

  private latestLocalDiary(userId: string, queued: Diary): Diary | null {
    // 本机存储按账号分开，只有这条操作属于当前账号时读到的才是它的日记。
    if (getCurrentStorageUserId() !== userId) return queued;
    const local = storage.getDiaries().find((diary) => diary.id === queued.id);
    if (local) return local;
    if (storage.getTrashedDiaries().some((entry) => entry.id === queued.id)) return null;
    return queued;
  }

  private async executeFolderOperation(op: SyncOperation): Promise<void> {
    const queued = op.data as Folder;
    switch (op.action) {
      case 'create':
      case 'update': {
        // 用本机此刻的版本（改过名就是新名字）。本机已经没有这个文件夹了就不上传，删除会另外排队。
        let folder: Folder | null = queued;
        if (getCurrentStorageUserId() === op.userId) {
          folder = storage.getFolders().find((item) => item.id === queued.id) ?? null;
        }
        if (!folder) return;
        await cloud.upsertFolder(op.userId, folder);
        break;
      }
      case 'delete':
        await cloud.deleteFolder(op.userId, queued.id);
        break;
    }
  }

  private async executeTaskOperation(op: SyncOperation): Promise<void> {
    const task = op.data as Task;
    switch (op.action) {
      case 'create':
      case 'update':
        await cloud.upsertTask(op.userId, task);
        break;
      case 'delete':
        await cloud.deleteTask(op.userId, task.id);
        break;
    }
  }

  // Get pending operation count
  getPendingCount(): number {
    return syncQueue.getCount();
  }
}

export const syncManager = SyncManager.getInstance();

import { syncQueue, type SyncOperation } from './syncQueue';
import { cloud } from './cloud';
import type { Diary, Folder, Task } from '../types';

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
  async processQueue(callback?: RetryCallback): Promise<void> {
    if (this.isProcessing) return;
    if (!navigator.onLine) return;

    this.isProcessing = true;
    const operations = syncQueue.getAll();

    for (const op of operations) {
      try {
        await this.executeOperation(op);
        syncQueue.dequeue(op.id);
        callback?.(true);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        syncQueue.updateRetry(op.id, errorMsg);
        callback?.(false, errorMsg);
      }
    }

    // Remove operations that exceeded max retries
    syncQueue.pruneExpired();
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
    const diary = op.data as Diary;
    switch (op.action) {
      case 'create':
      case 'update':
        await cloud.upsertDiary(op.userId, diary);
        break;
      case 'delete':
        await cloud.deleteDiary(op.userId, diary.id);
        break;
    }
  }

  private async executeFolderOperation(op: SyncOperation): Promise<void> {
    const folder = op.data as Folder;
    switch (op.action) {
      case 'create':
      case 'update':
        await cloud.upsertFolder(op.userId, folder);
        break;
      case 'delete':
        await cloud.deleteFolder(op.userId, folder.id);
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

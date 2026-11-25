// Offline operation queue for retry mechanism
import { getDesktopStoreItem, removeDesktopStoreItem, setDesktopStoreItem } from './desktopStore';

export type SyncOperation = {
  id: string;
  type: 'diary' | 'folder' | 'task' | 'longTermIdea';
  action: 'create' | 'update' | 'delete';
  data: unknown;
  userId: string;
  timestamp: number;
  retryCount: number;
  lastError?: string;
};

const QUEUE_KEY = 'sync_queue';
let currentQueueUserId: string | null = null;

const BACKUP_KEY_PREFIX = 'diaries_backups';

const getQueueKey = (userId: string | null = currentQueueUserId) =>
  userId ? `${QUEUE_KEY}-${userId}` : QUEUE_KEY;

const readQueueFromKey = (key: string): SyncOperation[] => {
  try {
    const data = getQueueItem(key);
    if (!data) return [];
    return JSON.parse(data) as SyncOperation[];
  } catch (err) {
    console.error('Failed to read sync queue', err);
    return [];
  }
};

const writeQueueToKey = (key: string, queue: SyncOperation[]): void => {
  setQueueItem(key, JSON.stringify(queue));
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
  const keysToRemove: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && (key === BACKUP_KEY_PREFIX || key.startsWith(`${BACKUP_KEY_PREFIX}-`))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
};

const getQueueItem = (key: string) => {
  const desktopValue = getDesktopStoreItem(key);
  if (desktopValue !== null) return desktopValue;
  return localStorage.getItem(key);
};

const setQueueItem = (key: string, value: string) => {
  if (setDesktopStoreItem(key, value)) {
    localStorage.removeItem(key);
    removeInBrowserBackups();
    return;
  }

  try {
    localStorage.setItem(key, value);
  } catch (err) {
    if (!isQuotaExceededError(err)) throw err;
    removeInBrowserBackups();
    localStorage.setItem(key, value);
  }
};

const removeQueueItem = (key: string) => {
  removeDesktopStoreItem(key);
  localStorage.removeItem(key);
};

export const setSyncQueueUserId = (userId: string | null) => {
  currentQueueUserId = userId;
  if (!userId) return;

  try {
    const legacy = readQueueFromKey(QUEUE_KEY);
    if (legacy.length === 0) return;

    const matching = legacy.filter((op) => op.userId === userId);
    const remaining = legacy.filter((op) => op.userId !== userId);
    if (matching.length > 0) {
      const scopedKey = getQueueKey(userId);
      writeQueueToKey(scopedKey, [...readQueueFromKey(scopedKey), ...matching]);
    }

    if (remaining.length > 0) {
      writeQueueToKey(QUEUE_KEY, remaining);
    } else {
      removeQueueItem(QUEUE_KEY);
    }
  } catch (err) {
    console.error('Failed to migrate legacy sync queue', err);
  }
};

const getOperationTargetId = (data: unknown): string | null => {
  if (data && typeof data === 'object' && typeof (data as { id?: unknown }).id === 'string') {
    return (data as { id: string }).id;
  }
  return null;
};

// 失败的操作一直留在队列里，直到真的同步成功。以前重试五次就删掉，
// 那次修改或删除就再也到不了云端，而且没有任何提示。
export class SyncQueue {
  private static instance: SyncQueue;

  private constructor() {}

  static getInstance(): SyncQueue {
    if (!SyncQueue.instance) {
      SyncQueue.instance = new SyncQueue();
    }
    return SyncQueue.instance;
  }

  // Get all operations in the queue
  getAll(userId: string | null = currentQueueUserId): SyncOperation[] {
    return readQueueFromKey(getQueueKey(userId));
  }

  // Add operation to queue
  enqueue(operation: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount'>): void {
    try {
      const key = getQueueKey(operation.userId);
      // 同一条记录只留最后一个待办操作：一篇日记改十次不该排十个版本，
      // 排着的旧版本还可能在重试时盖掉新版本。
      const targetId = getOperationTargetId(operation.data);
      const all = readQueueFromKey(key);
      const isSameTarget = (op: SyncOperation) =>
        targetId !== null && op.type === operation.type && getOperationTargetId(op.data) === targetId;
      const earlier = all.filter(isSameTarget);
      const queue = all.filter((op) => !isSameTarget(op));
      // 云端还没建出来就又改了，合并后仍然是一次新建。
      const action = operation.action === 'update' && earlier.some((op) => op.action === 'create')
        ? 'create'
        : operation.action;
      const newOp: SyncOperation = {
        ...operation,
        action,
        id: `${operation.type}_${operation.action}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        timestamp: Date.now(),
        retryCount: 0,
      };
      queue.push(newOp);
      writeQueueToKey(key, queue);
    } catch (err) {
      console.error('Failed to enqueue operation', err);
    }
  }

  // Remove operation from queue
  dequeue(operationId: string, userId: string | null = currentQueueUserId): void {
    try {
      const key = getQueueKey(userId);
      const queue = readQueueFromKey(key);
      const filtered = queue.filter((op) => op.id !== operationId);
      writeQueueToKey(key, filtered);
    } catch (err) {
      console.error('Failed to dequeue operation', err);
    }
  }

  // Update operation retry count and error
  updateRetry(operationId: string, error: string, userId: string | null = currentQueueUserId): void {
    try {
      const key = getQueueKey(userId);
      const queue = readQueueFromKey(key);
      const updated = queue.map((op) => {
        if (op.id === operationId) {
          return {
            ...op,
            retryCount: op.retryCount + 1,
            lastError: error,
          };
        }
        return op;
      });
      writeQueueToKey(key, updated);
    } catch (err) {
      console.error('Failed to update retry count', err);
    }
  }

  // Clear all operations
  clear(userId: string | null = currentQueueUserId): void {
    try {
      removeQueueItem(getQueueKey(userId));
    } catch (err) {
      console.error('Failed to clear sync queue', err);
    }
  }

  // Get pending operations count
  getCount(userId: string | null = currentQueueUserId): number {
    return this.getAll(userId).length;
  }

  // Get operations for a specific type
  getByType(type: 'diary' | 'folder' | 'task' | 'longTermIdea', userId: string | null = currentQueueUserId): SyncOperation[] {
    return this.getAll(userId).filter((op) => op.type === type);
  }
}

export const syncQueue = SyncQueue.getInstance();

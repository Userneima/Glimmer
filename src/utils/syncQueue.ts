// Offline operation queue for retry mechanism
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
const MAX_RETRIES = 5;
let currentQueueUserId: string | null = null;

const getQueueKey = (userId: string | null = currentQueueUserId) =>
  userId ? `${QUEUE_KEY}-${userId}` : QUEUE_KEY;

const readQueueFromKey = (key: string): SyncOperation[] => {
  try {
    const data = localStorage.getItem(key);
    if (!data) return [];
    return JSON.parse(data) as SyncOperation[];
  } catch (err) {
    console.error('Failed to read sync queue', err);
    return [];
  }
};

const writeQueueToKey = (key: string, queue: SyncOperation[]): void => {
  localStorage.setItem(key, JSON.stringify(queue));
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
      localStorage.removeItem(QUEUE_KEY);
    }
  } catch (err) {
    console.error('Failed to migrate legacy sync queue', err);
  }
};

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
      const queue = readQueueFromKey(key);
      const newOp: SyncOperation = {
        ...operation,
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

  // Remove operations that exceeded max retries
  pruneExpired(userId: string | null = currentQueueUserId): void {
    try {
      const key = getQueueKey(userId);
      const queue = readQueueFromKey(key);
      const valid = queue.filter((op) => op.retryCount < MAX_RETRIES);
      writeQueueToKey(key, valid);
    } catch (err) {
      console.error('Failed to prune expired operations', err);
    }
  }

  // Clear all operations
  clear(userId: string | null = currentQueueUserId): void {
    try {
      localStorage.removeItem(getQueueKey(userId));
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

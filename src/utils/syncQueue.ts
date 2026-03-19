// Offline operation queue for retry mechanism
export type SyncOperation = {
  id: string;
  type: 'diary' | 'folder' | 'task';
  action: 'create' | 'update' | 'delete';
  data: unknown;
  userId: string;
  timestamp: number;
  retryCount: number;
  lastError?: string;
};

const QUEUE_KEY = 'sync_queue';
const MAX_RETRIES = 5;

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
  getAll(): SyncOperation[] {
    try {
      const data = localStorage.getItem(QUEUE_KEY);
      if (!data) return [];
      return JSON.parse(data) as SyncOperation[];
    } catch (err) {
      console.error('Failed to read sync queue', err);
      return [];
    }
  }

  // Add operation to queue
  enqueue(operation: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount'>): void {
    try {
      const queue = this.getAll();
      const newOp: SyncOperation = {
        ...operation,
        id: `${operation.type}_${operation.action}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        timestamp: Date.now(),
        retryCount: 0,
      };
      queue.push(newOp);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (err) {
      console.error('Failed to enqueue operation', err);
    }
  }

  // Remove operation from queue
  dequeue(operationId: string): void {
    try {
      const queue = this.getAll();
      const filtered = queue.filter((op) => op.id !== operationId);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
    } catch (err) {
      console.error('Failed to dequeue operation', err);
    }
  }

  // Update operation retry count and error
  updateRetry(operationId: string, error: string): void {
    try {
      const queue = this.getAll();
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
      localStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to update retry count', err);
    }
  }

  // Remove operations that exceeded max retries
  pruneExpired(): void {
    try {
      const queue = this.getAll();
      const valid = queue.filter((op) => op.retryCount < MAX_RETRIES);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(valid));
    } catch (err) {
      console.error('Failed to prune expired operations', err);
    }
  }

  // Clear all operations
  clear(): void {
    try {
      localStorage.removeItem(QUEUE_KEY);
    } catch (err) {
      console.error('Failed to clear sync queue', err);
    }
  }

  // Get pending operations count
  getCount(): number {
    return this.getAll().length;
  }

  // Get operations for a specific type
  getByType(type: 'diary' | 'folder' | 'task'): SyncOperation[] {
    return this.getAll().filter((op) => op.type === type);
  }
}

export const syncQueue = SyncQueue.getInstance();

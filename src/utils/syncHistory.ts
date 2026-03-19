// Sync history tracking for CloudSyncStatus
export type SyncHistoryEntry = {
  id: string;
  timestamp: number;
  type: 'diary' | 'folder' | 'task';
  action: 'create' | 'update' | 'delete' | 'fetch';
  status: 'success' | 'error';
  message: string;
  count?: number; // For batch operations like fetch
  error?: string;
};

const HISTORY_KEY = 'sync_history';
const MAX_HISTORY = 50;

export class SyncHistory {
  private static instance: SyncHistory;
  private listeners: Array<() => void> = [];

  private constructor() {}

  static getInstance(): SyncHistory {
    if (!SyncHistory.instance) {
      SyncHistory.instance = new SyncHistory();
    }
    return SyncHistory.instance;
  }

  // Add listener for history changes
  addListener(callback: () => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((cb) => cb());
  }

  // Get all history entries
  getAll(): SyncHistoryEntry[] {
    try {
      const data = localStorage.getItem(HISTORY_KEY);
      if (!data) return [];
      return JSON.parse(data) as SyncHistoryEntry[];
    } catch (err) {
      console.error('Failed to read sync history', err);
      return [];
    }
  }

  // Add new history entry
  add(entry: Omit<SyncHistoryEntry, 'id' | 'timestamp'>): void {
    try {
      const history = this.getAll();
      const newEntry: SyncHistoryEntry = {
        ...entry,
        id: `${entry.type}_${entry.action}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        timestamp: Date.now(),
      };

      // Add to beginning (most recent first)
      history.unshift(newEntry);

      // Keep only MAX_HISTORY entries
      if (history.length > MAX_HISTORY) {
        history.splice(MAX_HISTORY);
      }

      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      this.notifyListeners();
    } catch (err) {
      console.error('Failed to add sync history', err);
    }
  }

  // Clear all history
  clear(): void {
    try {
      localStorage.removeItem(HISTORY_KEY);
      this.notifyListeners();
    } catch (err) {
      console.error('Failed to clear sync history', err);
    }
  }

  // Get recent entries (default 10)
  getRecent(limit = 10): SyncHistoryEntry[] {
    return this.getAll().slice(0, limit);
  }

  // Get entries by type
  getByType(type: 'diary' | 'folder' | 'task', limit = 10): SyncHistoryEntry[] {
    return this.getAll()
      .filter((entry) => entry.type === type)
      .slice(0, limit);
  }

  // Get statistics
  getStats(): {
    total: number;
    success: number;
    error: number;
    byType: Record<string, number>;
  } {
    const all = this.getAll();
    return {
      total: all.length,
      success: all.filter((e) => e.status === 'success').length,
      error: all.filter((e) => e.status === 'error').length,
      byType: {
        diary: all.filter((e) => e.type === 'diary').length,
        folder: all.filter((e) => e.type === 'folder').length,
        task: all.filter((e) => e.type === 'task').length,
      },
    };
  }
}

export const syncHistory = SyncHistory.getInstance();

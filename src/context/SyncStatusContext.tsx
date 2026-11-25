import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export interface SyncStatusContextValue {
  status: SyncStatus;
  pendingCount: number;
  lastError: string | null;
  setSyncStatus: (status: SyncStatus) => void;
  setPendingCount: (count: number) => void;
  setError: (error: string | null) => void;
  startSync: () => void;
  finishSync: () => void;
  failSync: (error: string) => void;
}

const SyncStatusContext = createContext<SyncStatusContextValue | null>(null);

export const SyncStatusProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  const setSyncStatus = useCallback((newStatus: SyncStatus) => {
    setStatus(newStatus);
  }, []);

  const startSync = useCallback(() => {
    setStatus('syncing');
    setLastError(null);
  }, []);

  const finishSync = useCallback(() => {
    setStatus('synced');
    setLastError(null);
    // Auto-transition to idle after 2 seconds
    setTimeout(() => {
      setStatus((prev) => (prev === 'synced' ? 'idle' : prev));
    }, 2000);
  }, []);

  const failSync = useCallback((error: string) => {
    setStatus('error');
    setLastError(error);
  }, []);

  const setError = useCallback((error: string | null) => {
    setLastError(error);
    if (error) {
      setStatus('error');
    }
  }, []);

  const value = useMemo<SyncStatusContextValue>(
    () => ({
      status,
      pendingCount,
      lastError,
      setSyncStatus,
      setPendingCount,
      setError,
      startSync,
      finishSync,
      failSync,
    }),
    [status, pendingCount, lastError, setSyncStatus, setPendingCount, setError, startSync, finishSync, failSync]
  );

  return <SyncStatusContext.Provider value={value}>{children}</SyncStatusContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSyncStatus = (): SyncStatusContextValue => {
  const context = useContext(SyncStatusContext);
  if (!context) {
    throw new Error('useSyncStatus must be used within SyncStatusProvider');
  }
  return context;
};

import { useCallback, useEffect, useRef } from 'react';
import { getLocalBackupSignature, shouldRunDailyLocalBackup, writeDesktopLocalBackup } from '../utils/localBackup';

interface UseLocalBackupResult {
  runMajorLocalBackup: () => Promise<void>;
  scheduleMajorLocalBackup: (delay?: number) => void;
}

export function useLocalBackup(activeUserId: string | null): UseLocalBackupResult {
  const lastMajorBackupSignatureRef = useRef<string | null>(null);

  const runDailyLocalBackup = useCallback(async () => {
    try {
      if (!shouldRunDailyLocalBackup()) {
        return;
      }

      const result = await writeDesktopLocalBackup(activeUserId, 'daily');
      if (result) {
        console.info('[local-backup] Saved daily Glimmer backup:', result.path);
      }
    } catch (err) {
      console.warn('[local-backup] Failed to save daily Glimmer backup', err);
    }
  }, [activeUserId]);

  const runMajorLocalBackup = useCallback(async () => {
    try {
      const signature = getLocalBackupSignature();
      if (signature === lastMajorBackupSignatureRef.current) {
        return;
      }

      const result = await writeDesktopLocalBackup(activeUserId, 'major-change');
      if (result) {
        lastMajorBackupSignatureRef.current = signature;
        console.info('[local-backup] Saved major-change Glimmer backup:', result.path);
      }
    } catch (err) {
      console.warn('[local-backup] Failed to save major-change Glimmer backup', err);
    }
  }, [activeUserId]);

  const scheduleMajorLocalBackup = useCallback((delay = 1000) => {
    window.setTimeout(() => {
      void runMajorLocalBackup();
    }, delay);
  }, [runMajorLocalBackup]);

  useEffect(() => {
    const startupTimer = window.setTimeout(() => {
      void runDailyLocalBackup();
    }, 15 * 1000);

    const intervalTimer = window.setInterval(() => {
      void runDailyLocalBackup();
    }, 60 * 60 * 1000);

    return () => {
      window.clearTimeout(startupTimer);
      window.clearInterval(intervalTimer);
    };
  }, [runDailyLocalBackup]);

  return {
    runMajorLocalBackup,
    scheduleMajorLocalBackup,
  };
}

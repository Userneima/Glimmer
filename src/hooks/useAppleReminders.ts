import { useCallback, useEffect, useState } from 'react';
import type { AppleReminder } from '../types';
import { remindersBridge, type ReminderAuthorizationStatus, type ReminderFetchOptions } from '../utils/remindersBridge';
import { getErrorMessage } from '../utils/toast';

export function useAppleReminders(options: ReminderFetchOptions = { scope: 'all-open' }) {
  const [reminders, setReminders] = useState<AppleReminder[]>([]);
  const [status, setStatus] = useState<ReminderAuthorizationStatus>('unsupported');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const capability = remindersBridge.getReminderCapability();
    if (!capability.available) {
      setStatus('unsupported');
      setReminders([]);
      setError(capability.reason ?? null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nextReminders = await remindersBridge.fetchReminders(options);
      setStatus('authorized');
      setReminders(nextReminders);
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to load reminders.');
      setStatus('authorized');
      setReminders([]);
    } finally {
      setLoading(false);
    }
  }, [options]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    reminders,
    status,
    loading,
    error,
    refresh,
  };
}

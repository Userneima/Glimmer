import { useCallback, useEffect, useState } from 'react';
import type { AppleReminder } from '../types';
import { remindersBridge, type ReminderAuthorizationStatus, type ReminderFetchOptions } from '../utils/remindersBridge';
import { getErrorMessage } from '../utils/toast';
import { useAuth } from '../context/useAuth';
import { cloud } from '../utils/cloud';

const REMINDERS_CACHE_PREFIX = 'apple_reminders_cache_v1';
const REMINDERS_CACHE_TTL = 30 * 60 * 1000;
const DEFAULT_REMINDER_OPTIONS: ReminderFetchOptions = { scope: 'all-open' };

type ReminderCacheEntry = {
  fetchedAt: number;
  reminders: AppleReminder[];
};

const memoryCache = new Map<string, ReminderCacheEntry>();
const inFlightRequests = new Map<string, Promise<AppleReminder[]>>();

const getOptionsKey = (options: ReminderFetchOptions) => {
  return JSON.stringify({
    scope: options.scope ?? 'all-open',
    daysAhead: options.daysAhead ?? null,
    includeCompleted: options.includeCompleted ?? false,
  });
};

const getCacheKey = (options: ReminderFetchOptions) => {
  return `${REMINDERS_CACHE_PREFIX}:${getOptionsKey(options)}`;
};

const readCachedReminders = (options: ReminderFetchOptions): ReminderCacheEntry | null => {
  const optionsKey = getOptionsKey(options);
  const memoryEntry = memoryCache.get(optionsKey);
  if (memoryEntry) return memoryEntry;

  if (typeof localStorage === 'undefined') return null;

  try {
    const raw = localStorage.getItem(getCacheKey(options));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ReminderCacheEntry;
    if (!Array.isArray(parsed.reminders) || typeof parsed.fetchedAt !== 'number') {
      return null;
    }

    memoryCache.set(optionsKey, parsed);
    return parsed;
  } catch {
    return null;
  }
};

const saveCachedReminders = (options: ReminderFetchOptions, reminders: AppleReminder[]) => {
  const entry: ReminderCacheEntry = {
    fetchedAt: Date.now(),
    reminders,
  };
  const optionsKey = getOptionsKey(options);
  memoryCache.set(optionsKey, entry);

  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(getCacheKey(options), JSON.stringify(entry));
  } catch {
    // Reminder cache is only a performance helper; never block the task view.
  }
};

const fetchRemindersWithDedupe = async (options: ReminderFetchOptions, force = false) => {
  const optionsKey = getOptionsKey(options);
  if (!force) {
    const existing = inFlightRequests.get(optionsKey);
    if (existing) return existing;
  }

  const request = remindersBridge
    .fetchReminders(options)
    .then((nextReminders) => {
      saveCachedReminders(options, nextReminders);
      return nextReminders;
    })
    .finally(() => {
      inFlightRequests.delete(optionsKey);
    });

  inFlightRequests.set(optionsKey, request);
  return request;
};

const fetchCloudReminderMirror = async (userId: string, options: ReminderFetchOptions) => {
  const reminders = await cloud.fetchAppleReminders(userId);
  saveCachedReminders(options, reminders);
  return reminders;
};

const replaceCloudReminderMirror = async (userId: string, reminders: AppleReminder[]) => {
  try {
    await cloud.replaceAppleReminders(userId, reminders);
  } catch (err) {
    console.warn('Failed to sync Apple reminders mirror', err);
  }
};

type PreloadAppleRemindersArgs = {
  options?: ReminderFetchOptions;
  userId?: string | null;
  syncCloud?: boolean;
};

export const preloadAppleReminders = async ({
  options = DEFAULT_REMINDER_OPTIONS,
  userId,
  syncCloud = false,
}: PreloadAppleRemindersArgs = {}) => {
  const capability = remindersBridge.getReminderCapability();
  if (!capability.available) return [];

  const cached = readCachedReminders(options);
  if (cached && Date.now() - cached.fetchedAt < REMINDERS_CACHE_TTL) {
    if (syncCloud && userId) {
      void replaceCloudReminderMirror(userId, cached.reminders);
    }
    return cached.reminders;
  }

  const reminders = await fetchRemindersWithDedupe(options);
  if (syncCloud && userId) {
    void replaceCloudReminderMirror(userId, reminders);
  }
  return reminders;
};

export function useAppleReminders(options: ReminderFetchOptions = DEFAULT_REMINDER_OPTIONS) {
  const { user, isConfigured } = useAuth();
  const [reminders, setReminders] = useState<AppleReminder[]>(() => readCachedReminders(options)?.reminders ?? []);
  const [status, setStatus] = useState<ReminderAuthorizationStatus>(() => {
    return remindersBridge.getReminderCapability().available ? 'authorized' : 'unsupported';
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (force = false) => {
    const capability = remindersBridge.getReminderCapability();
    if (!capability.available) {
      if (!user?.id || !isConfigured) {
        setStatus('unsupported');
        setReminders([]);
        setError(capability.reason ?? null);
        return;
      }

      setStatus('authorized');
      setLoading(true);
      setError(null);
      try {
        const remoteReminders = await fetchCloudReminderMirror(user.id, options);
        setReminders(remoteReminders);
      } catch (err) {
        setError(getErrorMessage(err) || 'Failed to load cloud reminders.');
        if (!readCachedReminders(options)) {
          setReminders([]);
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    const cached = readCachedReminders(options);
    const hasFreshCache = cached && Date.now() - cached.fetchedAt < REMINDERS_CACHE_TTL;

    if (!force && cached) {
      setStatus('authorized');
      setReminders(cached.reminders);
      setError(null);

      if (hasFreshCache) {
        setLoading(false);
        if (user?.id && isConfigured) {
          void replaceCloudReminderMirror(user.id, cached.reminders);
        }
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const nextReminders = await fetchRemindersWithDedupe(options, force);
      setStatus('authorized');
      setReminders(nextReminders);
      if (user?.id && isConfigured) {
        void replaceCloudReminderMirror(user.id, nextReminders);
      }
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to load reminders.');
      setStatus('authorized');
      if (!cached) {
        setReminders([]);
      }
    } finally {
      setLoading(false);
    }
  }, [isConfigured, options, user?.id]);

  const setReminderCompleted = useCallback(async (reminder: AppleReminder, completed: boolean) => {
    const capability = remindersBridge.getReminderCapability();
    if (!capability.available) {
      setError(capability.reason ?? 'Reminders integration requires the macOS desktop app.');
      throw new Error(capability.reason ?? 'Reminders integration requires the macOS desktop app.');
    }

    const previousReminders = reminders;
    const nextReminders = completed
      ? reminders.filter((item) => item.externalId !== reminder.externalId)
      : reminders.map((item) => (
          item.externalId === reminder.externalId ? { ...item, completed } : item
        ));

    setReminders(nextReminders);
    saveCachedReminders(options, nextReminders);
    if (user?.id && isConfigured) {
      void replaceCloudReminderMirror(user.id, nextReminders);
    }
    setError(null);

    try {
      await remindersBridge.setReminderCompleted({
        externalId: reminder.externalId,
        completed,
      });
      await refresh(true);
    } catch (err) {
      setReminders(previousReminders);
      saveCachedReminders(options, previousReminders);
      if (user?.id && isConfigured) {
        void replaceCloudReminderMirror(user.id, previousReminders);
      }
      setError(getErrorMessage(err) || 'Failed to update reminder.');
      throw err;
    }
  }, [isConfigured, options, refresh, reminders, user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    reminders,
    status,
    loading,
    error,
    refresh,
    setReminderCompleted,
  };
}

import { invoke } from '@tauri-apps/api/core';
import type { AppleReminder } from '../types';

export type ReminderAuthorizationStatus =
  | 'not-determined'
  | 'authorized'
  | 'denied'
  | 'restricted'
  | 'unsupported';

export type ReminderCapability = {
  available: boolean;
  reason?: string;
};

export type ReminderCreatePayload = {
  title: string;
  notes?: string;
  dueAt?: number | null;
  sourceTaskId: string;
  sourceDiaryId?: string | null;
  sourceIdeaId?: string | null;
};

export type ReminderCreateResult = {
  externalId: string;
  calendarId?: string;
  calendarTitle?: string;
};

export type ReminderFetchScope = 'today' | 'upcoming' | 'all-open';

export type ReminderFetchOptions = {
  scope?: ReminderFetchScope;
  daysAhead?: number;
  includeCompleted?: boolean;
};

const isTauriRuntime = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

export const remindersBridge = {
  getReminderCapability(): ReminderCapability {
    if (!isTauriRuntime()) {
      return {
        available: false,
        reason: 'Reminders integration requires the macOS desktop app.',
      };
    }
    return { available: true };
  },

  async getReminderAuthorizationStatus(): Promise<ReminderAuthorizationStatus> {
    if (!isTauriRuntime()) return 'unsupported';
    return invoke<ReminderAuthorizationStatus>('get_reminder_authorization_status');
  },

  async requestReminderAccess(): Promise<ReminderAuthorizationStatus> {
    if (!isTauriRuntime()) return 'unsupported';
    return invoke<ReminderAuthorizationStatus>('request_reminder_access');
  },

  async createReminder(payload: ReminderCreatePayload): Promise<ReminderCreateResult> {
    if (!isTauriRuntime()) {
      throw new Error('Reminders integration requires the macOS desktop app.');
    }
    return invoke<ReminderCreateResult>('create_reminder', { payload });
  },

  async fetchReminders(options: ReminderFetchOptions = {}): Promise<AppleReminder[]> {
    if (!isTauriRuntime()) return [];
    return invoke<AppleReminder[]>('fetch_reminders', { options });
  },
};

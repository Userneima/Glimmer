import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from './desktopStore';

export type CalendarEvent = {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  allDay: boolean;
  calendarTitle: string;
};

export type CalendarAccess = 'authorized' | 'denied' | 'restricted' | 'not-determined' | 'unsupported';

export type CalendarDay = {
  status: CalendarAccess;
  events: CalendarEvent[];
};

// 只读 Mac 日历里某一天的安排。网页版读不到本机日历，直接回 unsupported。
export const fetchCalendarDay = async (day: Date): Promise<CalendarDay> => {
  if (!isTauriRuntime()) return { status: 'unsupported', events: [] };

  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return invoke<CalendarDay>('calendar_events', { startMs: start.getTime(), endMs: end.getTime() });
};

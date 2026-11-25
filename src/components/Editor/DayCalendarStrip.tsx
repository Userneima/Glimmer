import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight } from 'lucide-react';
import type { Diary } from '../../types';
import { t } from '../../i18n';
import { diaryDay } from '../../utils/date';
import { isSystemDiary } from '../../utils/diarySystem';
import { fetchCalendarDay, type CalendarDay, type CalendarEvent } from '../../utils/calendarBridge';
import { openCalendarPrivacySettings } from '../../utils/fileSave';

// 日记上方显示这一天 Mac 日历里的安排。只读：改日程去日历里改，
// 这里不提供任何编辑，也不往正文里写，免得一件事在两个地方各有一份。
const COLLAPSED_KEY = 'glimmer-calendar-strip-collapsed';

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
};

const pad = (value: number) => String(value).padStart(2, '0');
const clock = (ms: number) => {
  const date = new Date(ms);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// 跨天的定时事件只显示落在这一天里的那段：前一天开始的写「…–18:00」，
// 第二天才结束的写「10:00–…」，整天都在当中的算全天。
const eventTime = (event: CalendarEvent, dayStart: number) => {
  if (event.allDay) return t('All day');
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const startsBefore = event.startMs < dayStart;
  const endsAfter = event.endMs > dayEnd;
  if (startsBefore && endsAfter) return t('All day');
  return `${startsBefore ? '…' : clock(event.startMs)}–${endsAfter ? '…' : clock(event.endMs)}`;
};

type DayCalendarStripProps = {
  diary: Diary;
};

export const DayCalendarStrip: React.FC<DayCalendarStripProps> = ({ diary }) => {
  const [day, setDay] = useState<CalendarDay | null>(null);
  const latestRequestRef = useRef(0);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [now, setNow] = useState(() => Date.now());

  const skip = isSystemDiary(diary);
  const dayStart = diaryDay(diary).getTime();

  // 换到另一天的日记时，先清掉上一天的安排，不然新结果回来之前会显示错的那天。
  const [shownDay, setShownDay] = useState(dayStart);
  if (shownDay !== dayStart) {
    setShownDay(dayStart);
    setDay(null);
  }

  const load = useCallback(() => {
    if (skip) return;
    // 只认最后一次请求的结果：切得快的时候，前一天的请求可能比后一天的晚回来。
    const requestId = ++latestRequestRef.current;
    fetchCalendarDay(new Date(dayStart))
      .then((result) => {
        if (requestId !== latestRequestRef.current) return;
        setDay(result);
        setNow(Date.now());
      })
      .catch((err) => {
        if (requestId !== latestRequestRef.current) return;
        // 读不到日历不影响写日记，安静地不显示。
        console.warn('Failed to read calendar', err);
        setDay(null);
      });
  }, [dayStart, skip]);

  useEffect(() => {
    load();
    // 他在日历里改完切回来，要看到新的安排。
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);

  const toggle = () => {
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // 记不住只是下次打开还是展开
      }
      return next;
    });
  };

  if (skip || !day || day.status === 'unsupported' || day.status === 'not-determined') return null;

  const wrapper = (children: React.ReactNode) => (
    <div className="border-b px-4 py-2" style={{ borderColor: 'var(--glimmer-border)', background: 'var(--glimmer-surface-header)' }}>
      <div className="mx-auto max-w-5xl text-sm">{children}</div>
    </div>
  );

  if (day.status !== 'authorized') {
    // 拒绝过一次之后系统不会再弹授权框，只能去系统设置里打开。打开后切回 Glimmer 会自动重读。
    return wrapper(
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-primary-500">
        <span className="flex items-center gap-2">
          <CalendarDays size={13} strokeWidth={1.75} />
          {t('Calendar access is off')}
        </span>
        <button
          type="button"
          onClick={() => {
            void openCalendarPrivacySettings().catch((err) => console.warn('Failed to open settings', err));
          }}
          className="font-medium text-accent-500 transition-colors hover:text-accent-600"
        >
          {t('Open calendar settings')}
        </button>
      </div>,
    );
  }

  // 没有安排就不占地方。
  if (day.events.length === 0) return null;

  return wrapper(
    <>
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 text-xs font-medium text-primary-500 transition-colors hover:text-primary-900"
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        <CalendarDays size={13} strokeWidth={1.75} />
        {t('Calendar for this day', { count: day.events.length })}
      </button>
      {!collapsed && (
        <ul className="mt-1.5 space-y-1 pl-5">
          {day.events.map((event) => {
            const past = !event.allDay && event.endMs < now;
            return (
              <li
                key={`${event.id}-${event.startMs}`}
                className={`flex items-baseline gap-3 ${past ? 'opacity-50' : ''}`}
              >
                <span className="w-24 flex-shrink-0 tabular-nums text-xs text-primary-500">{eventTime(event, dayStart)}</span>
                <span className="min-w-0 flex-1 truncate text-primary-900">{event.title}</span>
                <span className="hidden flex-shrink-0 text-xs text-primary-400 sm:inline">{event.calendarTitle}</span>
              </li>
            );
          })}
        </ul>
      )}
    </>,
  );
};

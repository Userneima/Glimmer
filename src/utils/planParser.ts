export type ParsedPlanItem = {
  title: string;
  notes?: string;
  startDate: number | null;
  endDate: number | null;
  source?: string;
};

const CHINESE_WEEKDAY_MAP: Record<string, number> = {
  '周日': 0,
  '周天': 0,
  '周一': 1,
  '周二': 2,
  '周三': 3,
  '周四': 4,
  '周五': 5,
  '周六': 6,
  '星期日': 0,
  '星期天': 0,
  '星期一': 1,
  '星期二': 2,
  '星期三': 3,
  '星期四': 4,
  '星期五': 5,
  '星期六': 6,
};

const startOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const toDateRange = (date: Date) => {
  return {
    startDate: startOfDay(date).getTime(),
    endDate: endOfDay(date).getTime(),
  };
};

const resolveWeekday = (weekday: number, reference: Date, forceNextWeek: boolean) => {
  const ref = startOfDay(reference);
  const current = ref.getDay();
  let delta = weekday - current;
  if (forceNextWeek || delta <= 0) {
    delta += 7;
  }
  const target = new Date(ref);
  target.setDate(ref.getDate() + delta);
  return target;
};

const parseExplicitDate = (text: string, reference: Date): Date | null => {
  const yearMonthDay = text.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (yearMonthDay) {
    const year = Number(yearMonthDay[1]);
    const month = Number(yearMonthDay[2]);
    const day = Number(yearMonthDay[3]);
    const date = new Date(year, month - 1, day);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  const chineseDate = text.match(/(\d{1,2})月(\d{1,2})日/);
  if (chineseDate) {
    const month = Number(chineseDate[1]);
    const day = Number(chineseDate[2]);
    let year = reference.getFullYear();
    if (/明年/.test(text)) {
      year += 1;
    }
    const date = new Date(year, month - 1, day);
    if (!Number.isNaN(date.getTime())) {
      if (date < startOfDay(reference)) {
        date.setFullYear(date.getFullYear() + 1);
      }
      return date;
    }
  }

  const monthDay = text.match(/(\d{1,2})[./-](\d{1,2})/);
  if (monthDay) {
    const month = Number(monthDay[1]);
    const day = Number(monthDay[2]);
    const year = reference.getFullYear();
    const date = new Date(year, month - 1, day);
    if (!Number.isNaN(date.getTime())) {
      if (date < startOfDay(reference)) {
        date.setFullYear(date.getFullYear() + 1);
      }
      return date;
    }
  }

  return null;
};

const parseRelativeDate = (text: string, reference: Date): Date | null => {
  const ref = startOfDay(reference);
  if (/今天|今日/.test(text)) {
    return ref;
  }
  if (/明天/.test(text)) {
    const date = new Date(ref);
    date.setDate(ref.getDate() + 1);
    return date;
  }
  if (/后天/.test(text)) {
    const date = new Date(ref);
    date.setDate(ref.getDate() + 2);
    return date;
  }

  const weekdayMatch = Object.keys(CHINESE_WEEKDAY_MAP).find((key) => text.includes(key));
  if (weekdayMatch) {
    const forceNextWeek = /下周/.test(text);
    return resolveWeekday(CHINESE_WEEKDAY_MAP[weekdayMatch], ref, forceNextWeek);
  }

  return null;
};

const extractDates = (text: string, reference: Date): Date[] => {
  const dates: Date[] = [];
  const explicit = parseExplicitDate(text, reference);
  if (explicit) {
    dates.push(explicit);
  }

  const relative = parseRelativeDate(text, reference);
  if (relative) {
    dates.push(relative);
  }

  return dates;
};

export const parsePlanLine = (line: string, reference: Date) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const dates = extractDates(trimmed, reference);
  if (dates.length === 0) {
    return {
      title: trimmed,
      notes: undefined,
      startDate: null,
      endDate: null,
    } as ParsedPlanItem;
  }

  if (dates.length >= 2 || /到|至|-/u.test(trimmed)) {
    const [first, second] = dates;
    const start = first ?? dates[0];
    const end = second ?? dates[dates.length - 1];
    return {
      title: trimmed,
      notes: undefined,
      startDate: startOfDay(start).getTime(),
      endDate: endOfDay(end).getTime(),
    } as ParsedPlanItem;
  }

  const { startDate, endDate } = toDateRange(dates[0]);
  return {
    title: trimmed,
    notes: undefined,
    startDate,
    endDate,
  } as ParsedPlanItem;
};

export const parsePlansLocal = (text: string, reference: Date) => {
  const lines = text
    .split(/\n|;|；|。/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line) => parsePlanLine(line, reference))
    .filter((item): item is ParsedPlanItem => Boolean(item));
};

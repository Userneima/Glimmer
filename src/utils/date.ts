export const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

export const formatDateForTitle = (timestamp: number): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

export const formatDateTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

export const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diffMs = now - timestamp;
  const future = diffMs < 0;
  const absMs = Math.abs(diffMs);

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  let value: number;
  let unit: string;

  if (absMs < minute) {
    return future ? '马上' : '刚刚';
  }

  if (absMs < hour) {
    value = Math.floor(absMs / minute);
    unit = '分钟';
  } else if (absMs < day) {
    value = Math.floor(absMs / hour);
    unit = '小时';
  } else {
    value = Math.floor(absMs / day);
    unit = '天';
  }

  return future ? `${value}${unit}后` : `${value}${unit}前`;
};

export const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

// 一篇日记写的是哪一天。标题开头的 20260924 优先：他有时隔天补写，
// 这时创建时间是补写那天，不是日记说的那天。
export const diaryDay = (diary: { title?: string; createdAt: number }): Date => {
  const match = (diary.title || '').trim().match(/^(\d{4})(\d{2})(\d{2})/);
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day) {
      return parsed;
    }
  }
  const created = new Date(diary.createdAt);
  return new Date(created.getFullYear(), created.getMonth(), created.getDate());
};

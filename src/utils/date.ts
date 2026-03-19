export const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
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

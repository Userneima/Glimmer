import { getDesktopStoreItem, setDesktopStoreItem } from './desktopStore';
import { getCurrentStorageUserId } from './storage';
import { syncQueue } from './syncQueue';

// 上一次和云端同步成功的时间。同步状态面板里显示「上次同步成功：几分钟前」，
// 用来一眼判断同步是不是还在正常工作。
// 按账号分开记，换了账号不会显示上一个账号的时间。
const LAST_SYNC_KEY = 'last_sync_success_at';
const keyForCurrentUser = () => {
  const userId = getCurrentStorageUserId();
  return userId ? `${LAST_SYNC_KEY}-${userId}` : LAST_SYNC_KEY;
};
const listeners = new Set<() => void>();

export const getLastSyncSuccessAt = (): number | null => {
  const key = keyForCurrentUser();
  const raw = getDesktopStoreItem(key) ?? localStorage.getItem(key);
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) ? value : null;
};

// 只有本机没有排着队没发出去的改动时，才算「同步成功」。
// 拉取成功了、但还有删除或修改卡在队列里，不更新这个时间，免得显示一切正常。
export const markSyncSucceeded = () => {
  if (syncQueue.getCount() > 0) return;
  const now = String(Date.now());
  const key = keyForCurrentUser();
  if (!setDesktopStoreItem(key, now)) {
    try {
      localStorage.setItem(key, now);
    } catch {
      // 记不住只是面板上的时间不更新
    }
  }
  listeners.forEach((listener) => listener());
};

export const subscribeLastSync = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

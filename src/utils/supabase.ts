import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let runtimeUnavailable = false;
let runtimeUnavailableReason: string | null = null;
let runtimeUnavailableAt = 0;
// 断网后先停一会儿别反复撞，过了这段时间下一次请求就重新试。
// 只靠浏览器的 online 事件恢复不够：服务端短暂出错时浏览器根本不会发这个事件，
// 同步就会一直停着。
const UNAVAILABLE_RETRY_AFTER_MS = 30 * 1000;
const availabilityListeners = new Set<() => void>();

const notifyAvailabilityListeners = () => {
  availabilityListeners.forEach((listener) => listener());
};

const markSupabaseUnavailable = (reason: string) => {
  if (runtimeUnavailable && runtimeUnavailableReason === reason) return;
  runtimeUnavailable = true;
  runtimeUnavailableReason = reason;
  runtimeUnavailableAt = Date.now();
  notifyAvailabilityListeners();
};

// 停用超过冷却时间就解除，让这次请求真的发出去试一下。
const releaseIfCooledDown = () => {
  if (runtimeUnavailable && Date.now() - runtimeUnavailableAt >= UNAVAILABLE_RETRY_AFTER_MS) {
    resetSupabaseAvailability();
  }
};

export const resetSupabaseAvailability = () => {
  if (!runtimeUnavailable && !runtimeUnavailableReason) return;
  runtimeUnavailable = false;
  runtimeUnavailableReason = null;
  notifyAvailabilityListeners();
};

export const subscribeSupabaseAvailability = (listener: () => void) => {
  availabilityListeners.add(listener);
  return () => {
    availabilityListeners.delete(listener);
  };
};

export const isSupabaseAvailable = () => isSupabaseConfigured && !runtimeUnavailable;

export const getSupabaseUnavailableReason = () => runtimeUnavailableReason;

const isSupabaseNetworkError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    error instanceof TypeError ||
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('err_name_not_resolved') ||
    message.includes('load failed')
  );
};

const supabaseFetch: typeof fetch = async (input, init) => {
  releaseIfCooledDown();
  if (runtimeUnavailable) {
    throw new Error(runtimeUnavailableReason ?? 'Supabase is temporarily unavailable.');
  }

  try {
    return await fetch(input, init);
  } catch (error) {
    if (isSupabaseNetworkError(error)) {
      const reason = 'Supabase is temporarily unreachable.';
      markSupabaseUnavailable(reason);
      throw new Error(reason);
    }
    throw error;
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    resetSupabaseAvailability();
  });
  // 没有请求在跑时也要能自己恢复，否则界面会一直显示云端连不上。
  window.setInterval(releaseIfCooledDown, UNAVAILABLE_RETRY_AFTER_MS);
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        fetch: supabaseFetch,
      },
    })
  : null;

export const requireSupabase = () => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }
  releaseIfCooledDown();
  if (runtimeUnavailable) {
    throw new Error(runtimeUnavailableReason ?? 'Supabase is temporarily unavailable.');
  }
  return supabase;
};

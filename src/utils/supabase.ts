import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let runtimeUnavailable = false;
let runtimeUnavailableReason: string | null = null;
const availabilityListeners = new Set<() => void>();

const notifyAvailabilityListeners = () => {
  availabilityListeners.forEach((listener) => listener());
};

const markSupabaseUnavailable = (reason: string) => {
  if (runtimeUnavailable && runtimeUnavailableReason === reason) return;
  runtimeUnavailable = true;
  runtimeUnavailableReason = reason;
  notifyAvailabilityListeners();
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
  if (runtimeUnavailable) {
    throw new Error(runtimeUnavailableReason ?? 'Supabase is temporarily unavailable.');
  }
  return supabase;
};

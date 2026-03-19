export type ToastType = 'success' | 'error' | 'info';

export type ToastPayload = {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
};

const TOAST_EVENT = 'diary-app:toast';

const createToastId = () => `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const showToast = (
  message: string,
  type: ToastType = 'info',
  duration = 2800
): string => {
  const payload: ToastPayload = {
    id: createToastId(),
    message,
    type,
    duration,
  };

  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: payload }));
  return payload.id;
};

export const toastEventName = TOAST_EVENT;

// Safely extract a human-readable message from any thrown value,
// including Supabase error objects { code, message, details, hint }
export const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === 'string' && obj.message) return obj.message;
  }
  return String(err);
};

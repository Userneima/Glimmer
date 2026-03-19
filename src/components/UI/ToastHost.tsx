import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { toastEventName } from '../../utils/toast';
import type { ToastPayload } from '../../utils/toast';

type ToastItem = Required<Pick<ToastPayload, 'id' | 'message' | 'type'>> & {
  duration: number;
};

const iconByType = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const classByType = {
  success: 'bg-semantic-success/10 border-semantic-success/25 text-semantic-success',
  error: 'bg-semantic-error/10 border-semantic-error/25 text-semantic-error',
  info: 'bg-accent-500/10 border-accent-500/25 text-accent-600',
};

export const ToastHost: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handleToast = (event: Event) => {
      const customEvent = event as CustomEvent<ToastPayload>;
      const nextToast: ToastItem = {
        id: customEvent.detail.id,
        message: customEvent.detail.message,
        type: customEvent.detail.type,
        duration: customEvent.detail.duration ?? 2800,
      };

      setToasts(prev => [...prev, nextToast]);
      window.setTimeout(() => {
        setToasts(prev => prev.filter(item => item.id !== nextToast.id));
      }, nextToast.duration);
    };

    window.addEventListener(toastEventName, handleToast as EventListener);
    return () => {
      window.removeEventListener(toastEventName, handleToast as EventListener);
    };
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed top-5 right-5 z-[1000] flex max-w-sm flex-col gap-2.5">
      {toasts.map(toast => {
        const Icon = iconByType[toast.type];
        return (
          <div
            key={toast.id}
            className={`
              pointer-events-auto 
              flex items-start gap-2.5 
              rounded-apple 
              border 
              backdrop-blur-apple
              bg-white/90
              px-4 py-3 
              shadow-apple-lg
              animate-slide-up
              ${classByType[toast.type]}
            `}
            role="status"
            aria-live="polite"
          >
            <Icon size={18} strokeWidth={1.75} className="mt-0.5 flex-shrink-0" />
            <span className="text-sm font-medium leading-5 text-primary-800">{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
};

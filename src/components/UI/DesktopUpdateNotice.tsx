import React, { useEffect, useRef, useState } from 'react';
import { DownloadCloud, RotateCcw, X } from 'lucide-react';
import { t } from '../../i18n';

type TauriUpdate = {
  version: string;
  date?: string;
  body?: string;
  downloadAndInstall: (onProgress?: (event: UpdateDownloadEvent) => void) => Promise<void>;
};

type UpdateDownloadEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished'; data?: undefined };

type UpdateState = 'checking' | 'available' | 'installing' | 'installed' | 'error';

const isTauriDesktop = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const formatProgress = (downloaded: number, total: number | null) => {
  if (!total || total <= 0) return '';
  return `${Math.min(100, Math.round((downloaded / total) * 100))}%`;
};

export const DesktopUpdateNotice: React.FC = () => {
  const updateRef = useRef<TauriUpdate | null>(null);
  const [state, setState] = useState<UpdateState>('checking');
  const [isVisible, setIsVisible] = useState(false);
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [downloaded, setDownloaded] = useState(0);
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !isTauriDesktop()) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { check } = await import('@tauri-apps/plugin-updater');
          const update = (await check()) as TauriUpdate | null;
          if (cancelled || !update) return;

          updateRef.current = update;
          setVersion(update.version);
          setNotes(update.body ?? '');
          setState('available');
          setIsVisible(true);
        } catch (err) {
          console.info('[desktop-updater] Update check skipped or failed:', err);
        }
      })();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const handleInstall = async () => {
    const update = updateRef.current;
    if (!update) return;

    try {
      setState('installing');
      setDownloaded(0);
      setTotal(null);

      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          setTotal(event.data.contentLength ?? null);
          setDownloaded(0);
          return;
        }

        if (event.event === 'Progress') {
          setDownloaded((value) => value + event.data.chunkLength);
          return;
        }

        setState('installed');
      });

      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err) {
      console.warn('[desktop-updater] Failed to install update:', err);
      setState('error');
    }
  };

  if (!isVisible) return null;

  const progressText = state === 'installing' ? formatProgress(downloaded, total) : '';

  return (
    <div className="fixed bottom-5 right-5 z-[990] w-[360px] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-apple-lg backdrop-blur-apple">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
          {state === 'installed' ? <RotateCcw size={19} /> : <DownloadCloud size={19} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                {state === 'error' ? t('Update failed') : t('Desktop update available')}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {state === 'installing'
                  ? `${t('Installing update')} ${progressText}`
                  : state === 'installed'
                    ? t('Restarting to finish update')
                    : t('New desktop version is ready').replace('{version}', version)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsVisible(false)}
              className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label={t('Dismiss')}
              title={t('Dismiss')}
            >
              <X size={15} />
            </button>
          </div>

          {notes && state === 'available' && (
            <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-500">{notes}</p>
          )}

          <div className="mt-3 flex justify-end gap-2">
            {state === 'error' ? (
              <button
                type="button"
                onClick={() => setIsVisible(false)}
                className="rounded-xl px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
              >
                {t('Close')}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsVisible(false)}
                  disabled={state === 'installing' || state === 'installed'}
                  className="rounded-xl px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('Later')}
                </button>
                <button
                  type="button"
                  onClick={handleInstall}
                  disabled={state !== 'available'}
                  className="rounded-xl bg-sky-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t('Update and restart')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

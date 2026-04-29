import React, { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAppleReminders } from '../../hooks/useAppleReminders';
import { t } from '../../i18n';
import { AppleReminderItem } from './AppleReminderItem';

interface AppleRemindersPanelProps {
  compact?: boolean;
  limit?: number;
}

export const AppleRemindersPanel: React.FC<AppleRemindersPanelProps> = ({ compact = false, limit }) => {
  const options = useMemo(() => ({ scope: 'all-open' as const }), []);
  const { reminders, status, loading, error, refresh } = useAppleReminders(options);
  const visibleReminders = typeof limit === 'number' ? reminders.slice(0, limit) : reminders;

  if (status === 'unsupported') {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 text-sm text-primary-500">
        {t('Reminders requires the macOS app')}
      </div>
    );
  }

  if (status === 'denied' || status === 'restricted') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-700">
        {t('Reminders permission denied')}
      </div>
    );
  }

  return (
    <div className={compact ? 'rounded-2xl border border-sky-100 bg-sky-50/50 p-3' : 'flex min-h-0 flex-1 flex-col'}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-primary-900">{t('Apple Reminders')}</h3>
          {!compact && (
            <p className="text-xs text-primary-400">{t('Open reminders from Apple Reminders')}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-primary-500 shadow-sm transition-colors hover:text-sky-500"
          title={t('Refresh')}
          aria-label={t('Refresh')}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="mb-2 rounded-xl border border-red-100 bg-red-50 p-2 text-xs text-red-600">
          {error}
        </div>
      )}

      {loading && visibleReminders.length === 0 ? (
        <div className="rounded-xl bg-white/75 p-3 text-sm text-primary-400">{t('Loading...')}</div>
      ) : visibleReminders.length === 0 ? (
        <div className="rounded-xl bg-white/75 p-3 text-sm text-primary-400">{t('No Apple reminders')}</div>
      ) : (
        <ul className={`space-y-2 ${compact ? '' : 'min-h-0 flex-1 overflow-y-auto pr-1'}`}>
          {visibleReminders.map((reminder) => (
            <AppleReminderItem
              key={reminder.externalId}
              reminder={reminder}
              compact={compact}
            />
          ))}
        </ul>
      )}
    </div>
  );
};

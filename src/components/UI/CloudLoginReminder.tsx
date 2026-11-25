import React, { useState } from 'react';
import { CloudOff, X } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { t } from '../../i18n';

// 登录过期但网络正常时的常驻提醒。
// 云端连不上（cloudAvailable 为 false）时不出现：那种情况下登录了也同步不了，提醒只会变成噪音。
// 放在右下角：顶部居中会盖住窄窗口下日记列表的「新建日记」按钮。
// 关掉后记在 sessionStorage，刷新不再冒出来，重开应用才会再提醒。
const DISMISS_KEY = 'glimmer-login-reminder-dismissed';

const readDismissed = () => {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

export const CloudLoginReminder: React.FC<{ hidden?: boolean }> = ({ hidden = false }) => {
  const { user, isConfigured, cloudAvailable, localUserId, autoSigningIn, requestSignIn } = useAuth();
  const [dismissed, setDismissed] = useState(readDismissed);

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // 存不进去只是下次刷新还会提醒，不影响使用
    }
  };

  const sessionExpired = isConfigured && cloudAvailable && !user && Boolean(localUserId) && !autoSigningIn;
  if (!sessionExpired || dismissed || hidden) return null;

  return (
    <div
      className="glimmer-info-strip fixed bottom-4 right-4 z-50 flex items-center gap-2.5 rounded-lg border px-3.5 py-2 text-xs shadow-sm max-w-[calc(100vw-2rem)]"
      role="status"
    >
      <CloudOff size={14} className="shrink-0" />
      <span className="truncate">{t('Signed out of cloud — showing local diaries only')}</span>
      <button
        onClick={requestSignIn}
        className="shrink-0 rounded-md px-2 py-1 font-medium text-white transition-colors"
        style={{ background: 'var(--aurora-accent)' }}
      >
        {t('Sign in again')}
      </button>
      <button
        onClick={dismiss}
        className="shrink-0 p-0.5 opacity-60 hover:opacity-100 transition-opacity"
        title={t('Dismiss')}
      >
        <X size={13} />
      </button>
    </div>
  );
};

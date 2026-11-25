import React, { useState, useRef, useEffect } from 'react';
import { Cloud, CheckCircle, AlertCircle, Loader2, RefreshCw, User, Clock } from 'lucide-react';
import { t } from '../../i18n';
import { useSyncStatus } from '../../context/SyncStatusContext';
import { getLastSyncSuccessAt, subscribeLastSync } from '../../utils/lastSync';

interface CloudSyncStatusProps {
  userEmail?: string | null;
  onRetry?: () => void;
  onSignIn?: () => void;
  compact?: boolean;
}

export const CloudSyncStatus: React.FC<CloudSyncStatusProps> = ({
  userEmail,
  onRetry,
  onSignIn,
  compact = false,
}) => {
  const { status, pendingCount, lastError } = useSyncStatus();
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(() => getLastSyncSuccessAt());
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeLastSync(() => setLastSyncAt(getLastSyncSuccessAt())), []);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isExpanded]);

  const getStatusIcon = () => {
    switch (status) {
      case 'syncing':
        return <Loader2 size={16} className="shrink-0 animate-spin text-blue-500" />;
      case 'synced':
        return <CheckCircle size={16} className="shrink-0 text-green-500" />;
      case 'error':
        return <AlertCircle size={16} className="shrink-0 text-red-500" />;
      case 'idle':
      default:
        return <Cloud size={16} className="shrink-0 text-gray-500" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'syncing':
        return 'bg-blue-50 border-blue-200 text-blue-700';
      case 'synced':
        return 'bg-green-50 border-green-200 text-green-700';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-700';
      case 'idle':
      default:
        return 'bg-gray-50 border-gray-200 text-gray-600';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'syncing':
        return t('Syncing...');
      case 'synced':
        return t('Synced');
      case 'error':
        return t('Sync Failed');
      case 'idle':
      default:
        return t('Cloud Sync');
    }
  };

  const handleRetryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRetry) {
      onRetry();
    }
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t('Just now');
    if (minutes < 60) return `${minutes} ${t('minutes ago')}`;
    if (hours < 24) return `${hours} ${t('hours ago')}`;
    if (days < 7) return `${days} ${t('days ago')}`;

    // 回退到通用的日期时间格式工具，保证和全局一致
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  // 未登录：不显示同步状态，直接给一个登录入口。
  // 云端连不上时这是唯一能重新登录的地方，必须常驻。
  if (!userEmail) {
    return (
      <button
        onClick={onSignIn}
        className={`flex items-center justify-center rounded-md border transition-all hover:shadow-sm
          border-primary-200 text-primary-500 hover:text-accent-600 ${
          compact ? 'w-8 h-8 p-1' : 'w-full gap-2 px-3 py-2 text-xs'
        }`}
        title={t('Not signed in — click to sign in')}
      >
        <User size={compact ? 16 : 14} className="shrink-0" />
        {!compact && <span className="truncate">{t('Sign in')}</span>}
      </button>
    );
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Compact Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center justify-center rounded-md border transition-all hover:shadow-sm ${getStatusColor()} ${
          compact ? 'w-8 h-8 p-1' : 'w-full gap-2 px-3 py-2 text-xs'
        }`}
        title={lastError || getStatusText()}
      >
        {getStatusIcon()}
        {!compact && pendingCount > 0 && (
          <span className="shrink-0 bg-yellow-500 text-white rounded-full px-1.5 py-0.5 text-[10px] font-bold">
            {pendingCount}
          </span>
        )}
        {compact && pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-yellow-500 text-white rounded-full w-4 h-4 text-[9px] font-bold flex items-center justify-center">
            {pendingCount}
          </span>
        )}
      </button>

      {/* Expanded Panel */}
      {isExpanded && (
        <div className={`glimmer-popover absolute mb-2 border rounded-lg shadow-lg z-50 ${
          compact ? 'bottom-full left-1/2 -translate-x-1/2 w-72' : 'bottom-full left-0 w-full max-w-xs'
        }`}>
          <>
              {/* Header */}
              <div className={`px-3 py-2 border-b ${getStatusColor()}`}>
                <div className="flex items-center gap-2">
                  {getStatusIcon()}
                  <span className="font-medium text-sm">{getStatusText()}</span>
                  {status === 'error' && onRetry && (
                    <button
                      onClick={handleRetryClick}
                      className="ml-auto p-1 hover:bg-white/50 rounded transition-colors"
                      title={t('Retry sync')}
                    >
                      <RefreshCw size={14} />
                    </button>
                  )}
                </div>
                {pendingCount > 0 && (
                  <div className="mt-1 text-xs opacity-90">
                    {pendingCount} {t('operations pending')}
                  </div>
                )}
                <div className="mt-1 flex items-center gap-1 text-xs opacity-80">
                  <Clock size={11} className="shrink-0" />
                  <span>
                    {t('Last synced')}：{lastSyncAt ? formatTime(lastSyncAt) : t('Not yet')}
                  </span>
                </div>
              </div>

              {/* Manual Sync Button */}
              {onRetry && (
                <div className="px-3 py-2">
                  <button
                    onClick={handleRetryClick}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors"
                    title="手动云端同步"
                  >
                    <RefreshCw size={14} />
                    <span>云端同步</span>
                  </button>
                </div>
              )}
          </>
        </div>
      )}
    </div>
  );
};

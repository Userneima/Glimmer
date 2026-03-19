import React, { useState, useRef, useEffect } from 'react';
import { Cloud, CheckCircle, AlertCircle, Loader2, RefreshCw, User, LogOut, UserCog, History, Trash2, Clock } from 'lucide-react';
import { t } from '../../i18n';
import { useSyncStatus } from '../../context/SyncStatusContext';
import { syncHistory, type SyncHistoryEntry } from '../../utils/syncHistory';

interface CloudSyncStatusProps {
  userEmail?: string | null;
  onRetry?: () => void;
  onSwitchAccount?: () => void;
  onLogout?: () => void;
  compact?: boolean;
}

export const CloudSyncStatus: React.FC<CloudSyncStatusProps> = ({
  userEmail,
  onRetry,
  onSwitchAccount,
  onLogout,
  compact = false,
}) => {
  const { status, pendingCount, lastError } = useSyncStatus();
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'status' | 'history'>('status');
  const [historyEntries, setHistoryEntries] = useState<SyncHistoryEntry[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load history entries
  useEffect(() => {
    const loadHistory = () => {
      setHistoryEntries(syncHistory.getRecent(10));
    };
    loadHistory();
    const unsubscribe = syncHistory.addListener(loadHistory);
    return unsubscribe;
  }, []);

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

  const handleSwitchAccount = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(false);
    if (onSwitchAccount) {
      onSwitchAccount();
    }
  };

  const handleLogout = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(false);
    if (onLogout) {
      onLogout();
    }
  };

  const handleClearHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    syncHistory.clear();
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

  const getHistoryIcon = (entry: SyncHistoryEntry) => {
    if (entry.status === 'success') {
      return <CheckCircle size={12} className="text-green-500" />;
    }
    return <AlertCircle size={12} className="text-red-500" />;
  };

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
        <div className={`absolute mb-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 ${
          compact ? 'bottom-full left-1/2 -translate-x-1/2 w-72' : 'bottom-full left-0 w-full max-w-xs'
        }`}>
          {/* Tabs */}
          <div className="flex border-b bg-gray-50 rounded-t-lg">
            <button
              onClick={() => setActiveTab('status')}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === 'status'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('Status')}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === 'history'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="inline-flex items-center gap-1">
                <History size={14} />
                {t('Sync History')}
              </span>
            </button>
          </div>

          {/* Status Tab */}
          {activeTab === 'status' && (
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
              </div>

              {/* User Info */}
              {userEmail && (
                <div className="px-3 py-2 border-b bg-gray-50">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <User size={14} className="shrink-0" />
                    <span className="truncate">{userEmail}</span>
                  </div>
                </div>
              )}

              {/* Manual Sync Button */}
              {onRetry && (
                <div className="px-3 py-2 border-b">
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

              {/* Actions */}
              <div className="p-1">
                {onSwitchAccount && (
                  <button
                    onClick={handleSwitchAccount}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors"
                  >
                    <UserCog size={14} />
                    <span>{t('Switch Account')}</span>
                  </button>
                )}
                {onLogout && (
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
                  >
                    <LogOut size={14} />
                    <span>{t('Log out')}</span>
                  </button>
                )}
              </div>
            </>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="max-h-80 overflow-y-auto">
              {/* Clear History Button */}
              {historyEntries.length > 0 && (
                <div className="px-3 py-2 border-b bg-gray-50 flex justify-end">
                  <button
                    onClick={handleClearHistory}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
                  >
                    <Trash2 size={12} />
                    {t('Clear History')}
                  </button>
                </div>
              )}

              {/* History Entries */}
              {historyEntries.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-gray-400">
                  {t('No sync history yet')}
                </div>
              ) : (
                <div className="py-1">
                  {historyEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="px-3 py-2 hover:bg-gray-50 border-b last:border-b-0"
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5">{getHistoryIcon(entry)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-900">
                            {entry.message}
                            {entry.count !== undefined && entry.count > 0 && (
                              <span className="text-gray-500"> ({entry.count})</span>
                            )}
                          </div>
                          {entry.error && (
                            <div className="text-xs text-red-600 mt-0.5 truncate">
                              {entry.error}
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                            <Clock size={10} />
                            <span>{formatTime(entry.timestamp)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

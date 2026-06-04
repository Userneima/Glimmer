import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Database, Download, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { formatDateTime } from '../../utils/date';
import { storage, type Backup } from '../../utils/storage';
import { syncManager } from '../../utils/syncManager';
import { syncQueue, type SyncOperation } from '../../utils/syncQueue';

type DataSnapshot = ReturnType<typeof storage.getAllData>;

const MAX_VISIBLE_BACKUPS = 4;

const formatBackupTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
};

const getCounts = (data: DataSnapshot) => ({
  diaries: data.diaries.length,
  folders: data.folders.length,
  tasks: data.tasks.length,
  longTermIdeas: data.longTermIdeas.length,
});

const getBackupCounts = (backup: Backup) => ({
  diaries: backup.diaries.length,
  folders: backup.folders.length,
  tasks: backup.tasks?.length ?? 0,
  longTermIdeas: backup.longTermIdeas?.length ?? 0,
});

const DataSection: React.FC<{ title: string; description: string; children: React.ReactNode }> = ({
  title,
  description,
  children,
}) => (
  <section className="border-t pt-5 first:border-t-0 first:pt-0" style={{ borderColor: 'var(--glimmer-border)' }}>
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </div>
    {children}
  </section>
);

const MetricTile: React.FC<{ label: string; value: number | string; detail?: string }> = ({ label, value, detail }) => (
  <div className="glimmer-card rounded-2xl border px-4 py-3">
    <div className="text-xs font-medium text-slate-400">{label}</div>
    <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</div>
    {detail && <div className="mt-1 truncate text-xs text-slate-500">{detail}</div>}
  </div>
);

const DataBadge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-500" style={{ backgroundColor: 'var(--glimmer-surface-muted)' }}>
    {children}
  </span>
);

export const DataSafetyPanel: React.FC = () => {
  const { user, isConfigured } = useAuth();
  const activeUserId = user?.id ?? null;
  const [data, setData] = useState<DataSnapshot>(() => storage.getAllData());
  const [backups, setBackups] = useState<Backup[]>(() => storage.getBackups());
  const [queueItems, setQueueItems] = useState<SyncOperation[]>(() => syncQueue.getAll(activeUserId));
  const [isRetrying, setIsRetrying] = useState(false);

  const refresh = useCallback(() => {
    setData(storage.getAllData());
    setBackups(storage.getBackups());
    setQueueItems(syncQueue.getAll(activeUserId));
  }, [activeUserId]);

  useEffect(() => {
    refresh();
    const unsubscribe = syncManager.addListener(refresh);
    const timer = window.setInterval(refresh, 3000);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [refresh]);

  const counts = useMemo(() => getCounts(data), [data]);
  const hasLocalData = Object.values(counts).some((count) => count > 0);
  const sortedBackups = useMemo(
    () => [...backups].sort((left, right) => right.timestamp - left.timestamp),
    [backups],
  );
  const visibleBackups = sortedBackups.slice(0, MAX_VISIBLE_BACKUPS);
  const hiddenBackupCount = Math.max(0, sortedBackups.length - visibleBackups.length);
  const latestBackup = sortedBackups[0] ?? null;

  const exportFullData = () => {
    const payload = {
      app: 'Glimmer',
      type: 'full-data-export',
      exportedAt: Date.now(),
      userId: activeUserId,
      ...storage.getAllData(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `glimmer-full-backup-${formatBackupTimestamp(payload.exportedAt)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const restoreBackup = (backup: Backup) => {
    const backupCounts = getBackupCounts(backup);
    const ok = window.confirm(
      [
        `确定要恢复 ${formatDateTime(backup.timestamp)} 的备份吗？`,
        '',
        `包含：${backupCounts.diaries} 篇日记、${backupCounts.folders} 个文件夹、${backupCounts.tasks} 个任务、${backupCounts.longTermIdeas} 条长期想法。`,
        '恢复会覆盖当前本地数据。完成后会重新加载界面，确保所有列表重新读取最新数据。',
      ].join('\n'),
    );
    if (!ok) return;

    const restored = storage.restoreBackup(backup.timestamp);
    if (!restored) {
      window.alert('没有找到这份备份，恢复失败。');
      return;
    }

    window.location.reload();
  };

  const retrySyncQueue = async () => {
    setIsRetrying(true);
    try {
      await syncManager.processQueue(undefined, activeUserId);
    } finally {
      setIsRetrying(false);
      refresh();
    }
  };

  return (
    <div className="space-y-6">
      <div className="glimmer-card rounded-2xl border p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="glimmer-info-strip inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold text-sky-700">
              {hasLocalData ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {hasLocalData ? '本地数据可用' : '未检测到主要本地数据'}
            </div>
            <h3 className="mt-3 text-base font-semibold tracking-tight text-slate-900">数据安全</h3>
            <p className="mt-1 max-w-[56ch] text-sm leading-6 text-slate-500">
              这里只处理本机数据、自动快照和当前账号的同步队列。云端不可用时，本地数据仍然优先保留。
            </p>
          </div>
          <div className="glimmer-card rounded-xl border px-3 py-2 md:min-w-[220px]">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <ShieldCheck size={14} className="text-sky-500" />
              当前账号
            </div>
            <div className="mt-1 truncate text-sm font-medium text-slate-800">
              {user?.email ?? (isConfigured ? '未登录' : '本地模式 / 云端未启用')}
            </div>
          </div>
        </div>
      </div>

      <DataSection title="本机数据" description="快速确认当前设备上有什么内容，并手动导出完整 JSON 留档。">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <MetricTile label="日记" value={counts.diaries} />
          <MetricTile label="文件夹" value={counts.folders} />
          <MetricTile label="任务" value={counts.tasks} />
          <MetricTile label="长期想法" value={counts.longTermIdeas} />
          <MetricTile label="快照" value={backups.length} />
        </div>
        <div className="glimmer-card mt-3 flex flex-col gap-3 rounded-2xl border px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-800">完整数据 JSON</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">包含当前账号或本地模式下的完整本机数据，适合手动备份。</p>
          </div>
          <button
            type="button"
            onClick={exportFullData}
            className="inline-flex items-center justify-center gap-2 rounded-apple-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sky-600 active:scale-[0.98]"
          >
            <Download size={16} />
            导出完整数据
          </button>
        </div>
      </DataSection>

      <DataSection title="自动快照" description="应用内部会保留最近的 localStorage 快照。恢复会覆盖当前本机数据。">
        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <MetricTile
            label="最近一次快照"
            value={latestBackup ? formatDateTime(latestBackup.timestamp) : '无'}
            detail={latestBackup ? '来自自动快照' : '修改数据后会自动产生快照'}
          />
          <MetricTile label="可恢复快照" value={backups.length} detail="只展示最近几份，避免列表过长" />
        </div>

        {visibleBackups.length === 0 ? (
          <div className="glimmer-card rounded-2xl border border-dashed px-4 py-5 text-center text-sm text-slate-500">
            暂无可恢复快照。
          </div>
        ) : (
          <div className="glimmer-card divide-y divide-[var(--glimmer-border)] overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--glimmer-border)' }}>
            {visibleBackups.map((backup) => {
              const backupCounts = getBackupCounts(backup);
              return (
                <div key={backup.timestamp} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <Clock3 size={15} className="text-slate-400" />
                      {formatDateTime(backup.timestamp)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <DataBadge>日记 {backupCounts.diaries}</DataBadge>
                      <DataBadge>文件夹 {backupCounts.folders}</DataBadge>
                      <DataBadge>任务 {backupCounts.tasks}</DataBadge>
                      <DataBadge>长期想法 {backupCounts.longTermIdeas}</DataBadge>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => restoreBackup(backup)}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-apple-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100 active:scale-[0.98]"
                  >
                    <RotateCcw size={15} />
                    恢复
                  </button>
                </div>
              );
            })}
            {hiddenBackupCount > 0 && (
              <div className="px-4 py-2 text-xs text-slate-500" style={{ backgroundColor: 'var(--glimmer-surface-muted)' }}>
                还有 {hiddenBackupCount} 份更早的快照已收起。
              </div>
            )}
          </div>
        )}
      </DataSection>

      <DataSection title="同步队列" description="这里只显示当前账号对应的待同步操作。队列为空时，不需要处理。">
        <div className="glimmer-card flex flex-col gap-3 rounded-2xl border px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Database size={15} className="text-sky-500" />
              待同步操作：{queueItems.length}
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {activeUserId ? '当前账号队列' : '本地模式队列'}，云端恢复后可以手动重试。
            </p>
          </div>
          <button
            type="button"
            onClick={retrySyncQueue}
            disabled={isRetrying || queueItems.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-apple-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition-colors hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={16} className={isRetrying ? 'animate-spin' : ''} />
            重试当前队列
          </button>
        </div>

        {queueItems.length > 0 && (
          <div className="mt-3 space-y-2">
            {queueItems.map((item) => (
              <div key={item.id} className="glimmer-card rounded-2xl border px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <DataBadge>{item.type}</DataBadge>
                  <DataBadge>{item.action}</DataBadge>
                  <DataBadge>retry {item.retryCount}</DataBadge>
                  <span className="text-xs text-slate-400">{formatDateTime(item.timestamp)}</span>
                </div>
                {item.lastError && (
                  <div className="mt-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs leading-5 text-red-600">
                    {item.lastError}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DataSection>
    </div>
  );
};

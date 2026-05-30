import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Database, Download, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { storage, type Backup } from '../../utils/storage';
import { syncManager } from '../../utils/syncManager';
import { syncQueue, type SyncOperation } from '../../utils/syncQueue';
import { formatDateTime } from '../../utils/date';

type DataSnapshot = ReturnType<typeof storage.getAllData>;

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
  tags: data.tags.length,
  longTermIdeas: data.longTermIdeas.length,
});

const getBackupCounts = (backup: Backup) => ({
  diaries: backup.diaries.length,
  folders: backup.folders.length,
  tasks: backup.tasks?.length ?? 0,
  tags: backup.tags?.length ?? 0,
  longTermIdeas: backup.longTermIdeas?.length ?? 0,
});

const StatCard: React.FC<{ label: string; value: number | string; muted?: string }> = ({ label, value, muted }) => (
  <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 shadow-sm backdrop-blur-sm">
    <div className="text-xs font-medium text-slate-400">{label}</div>
    <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
    {muted && <div className="mt-1 text-xs text-slate-500">{muted}</div>}
  </div>
);

const Section: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({
  title,
  description,
  children,
}) => (
  <section className="rounded-3xl border border-slate-200/80 bg-white/60 p-4 shadow-sm backdrop-blur-xl">
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
      </div>
    </div>
    {children}
  </section>
);

const QueueBadge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
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
    <div className="space-y-5">
      <Section
        title="安全状态"
        description="只展示当前账号或本地模式下的本机数据。云端不可用时，本地数据仍然优先保留。"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sky-900">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {hasLocalData ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
              本地数据
            </div>
            <p className="mt-2 text-xs leading-5 text-sky-700">
              {hasLocalData ? '当前本机有可用数据。' : '当前本机没有检测到主要数据。'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <ShieldCheck size={17} className="text-sky-500" />
              当前账号
            </div>
            <p className="mt-2 truncate text-xs leading-5 text-slate-500">
              {user?.email ?? (isConfigured ? '未登录' : '本地模式 / 云端未启用')}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-emerald-900">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Database size={17} />
              云端不可用时
            </div>
            <p className="mt-2 text-xs leading-5 text-emerald-700">
              本地数据仍可读写；失败的同步会留在当前账号队列里。
            </p>
          </div>
        </div>
      </Section>

      <Section title="本地数据概览">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="日记" value={counts.diaries} />
          <StatCard label="文件夹" value={counts.folders} />
          <StatCard label="任务" value={counts.tasks} />
          <StatCard label="标签" value={counts.tags} />
          <StatCard label="长期想法" value={counts.longTermIdeas} />
          <StatCard label="本地快照" value={backups.length} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-800">完整数据 JSON</div>
            <p className="mt-1 text-xs text-slate-500">导出当前账号/本地模式下的完整本机数据，可用于手动留档。</p>
          </div>
          <button
            type="button"
            onClick={exportFullData}
            className="inline-flex items-center gap-2 rounded-apple-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sky-600 active:scale-[0.98]"
          >
            <Download size={16} />
            导出完整数据
          </button>
        </div>
      </Section>

      <Section
        title="备份与恢复"
        description="这里读取的是应用内部 localStorage 快照。恢复是危险操作，执行前会再次确认。"
      >
        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <StatCard
            label="最近一次快照"
            value={latestBackup ? formatDateTime(latestBackup.timestamp) : '无'}
            muted={latestBackup ? '来自 localStorage 自动快照' : '修改数据后会自动产生快照'}
          />
          <StatCard label="可恢复备份数" value={backups.length} muted="当前最多保留最近的本地快照" />
        </div>
        <div className="space-y-2">
          {sortedBackups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-5 text-center text-sm text-slate-500">
              暂无可恢复备份。
            </div>
          ) : (
            sortedBackups.map((backup) => {
              const backupCounts = getBackupCounts(backup);
              return (
                <div
                  key={backup.timestamp}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/75 px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <Clock3 size={15} className="text-slate-400" />
                      {formatDateTime(backup.timestamp)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <QueueBadge>日记 {backupCounts.diaries}</QueueBadge>
                      <QueueBadge>文件夹 {backupCounts.folders}</QueueBadge>
                      <QueueBadge>任务 {backupCounts.tasks}</QueueBadge>
                      <QueueBadge>标签 {backupCounts.tags}</QueueBadge>
                      <QueueBadge>长期想法 {backupCounts.longTermIdeas}</QueueBadge>
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
            })
          )}
        </div>
      </Section>

      <Section
        title="同步队列"
        description="只显示当前账号对应的待同步操作；不会重试其它账号的队列。"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-800">待同步操作：{queueItems.length}</div>
            <p className="mt-1 text-xs text-slate-500">
              {activeUserId ? '当前账号队列' : '本地模式队列'}，云端不可用时会保留在这里等待重试。
            </p>
          </div>
          <button
            type="button"
            onClick={retrySyncQueue}
            disabled={isRetrying || queueItems.length === 0}
            className="inline-flex items-center gap-2 rounded-apple-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition-colors hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={16} className={isRetrying ? 'animate-spin' : ''} />
            重试当前账号队列
          </button>
        </div>
        {queueItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-5 text-center text-sm text-slate-500">
            当前没有待同步操作。
          </div>
        ) : (
          <div className="space-y-2">
            {queueItems.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200/80 bg-white/75 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <QueueBadge>{item.type}</QueueBadge>
                  <QueueBadge>{item.action}</QueueBadge>
                  <QueueBadge>retry {item.retryCount}</QueueBadge>
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
      </Section>
    </div>
  );
};

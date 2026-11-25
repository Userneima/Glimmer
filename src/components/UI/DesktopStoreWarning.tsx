import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { getUnreadableStoreCopy } from '../../utils/desktopStore';

// 桌面版数据文件读不出来时的提示。原文件已另存一份，这次是从空白开始的，
// 要告诉他发生了什么、去哪里找回，不然他只会看到一个几乎空的 Glimmer。
export const DesktopStoreWarning: React.FC = () => {
  const [copyPath] = useState(getUnreadableStoreCopy);
  const [dismissed, setDismissed] = useState(false);
  if (!copyPath || dismissed) return null;

  return (
    <div
      className="fixed left-1/2 top-3 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800 shadow-sm"
      role="alert"
    >
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium">本机数据文件读不出来，这次是从空白打开的。</p>
        <p className="mt-0.5 break-all">
          原文件已另存为 {copyPath}。最近的自动备份在「文稿 / Glimmer Backups / auto」，可以在「设置 → 常规 → 导入」里恢复；登录云同步后日记也会从云端拉回来。
        </p>
      </div>
      <button onClick={() => setDismissed(true)} className="shrink-0 p-0.5 opacity-60 hover:opacity-100" title="关闭">
        <X size={13} />
      </button>
    </div>
  );
};

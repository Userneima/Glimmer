import React from 'react';

export const LongTermTaskDocumentGuidePanel: React.FC = () => (
  <div className="border-b border-slate-200/60 bg-gradient-to-r from-white/90 via-sky-50/60 to-white/80 px-6 py-3">
    <div className="rounded-apple-lg border border-slate-200/80 bg-white/80 px-4 py-3 text-sm text-slate-600 shadow-sm backdrop-blur-sm">
      <div className="font-semibold text-slate-800">大任务文档入口</div>
      <p className="mt-1 leading-relaxed">
        把长期任务写成任务列表项，把光标放进任务文字里，再点击工具栏里的「打开任务文档」。首次点击会自动创建，之后会复用同一份文档。
      </p>
    </div>
  </div>
);

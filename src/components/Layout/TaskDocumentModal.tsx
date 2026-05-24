import React from 'react';
import { FileText, X } from 'lucide-react';
import { Editor } from '../Editor/Editor';
import type { Diary } from '../../types';

interface TaskDocumentModalProps {
  diary: Diary;
  onClose: () => void;
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
}

export const TaskDocumentModal: React.FC<TaskDocumentModalProps> = ({
  diary,
  onClose,
  onTitleChange,
  onContentChange,
}) => (
  <div className="fixed inset-0 z-[980] flex items-center justify-center p-4 md:p-6">
    <div className="absolute inset-0 bg-slate-900/18 backdrop-blur-sm" onClick={onClose} />
    <div className="relative flex h-[min(820px,calc(100vh-40px))] w-[min(1120px,calc(100vw-40px))] flex-col overflow-hidden rounded-[30px] border border-white/70 bg-white/95 shadow-[0_28px_90px_rgba(15,23,42,0.20)] backdrop-blur-apple">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200/70 bg-gradient-to-r from-sky-50/80 via-white/95 to-white/90 px-6 py-5">
        <div className="min-w-0 flex-1">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-600">
            <FileText size={14} strokeWidth={1.9} />
            任务文档
          </div>
          <input
            value={diary.title}
            onChange={(event) => onTitleChange(event.target.value)}
            className="w-full border-none bg-transparent p-0 text-2xl font-bold tracking-tight text-slate-900 outline-none focus:ring-0"
            placeholder="任务文档标题"
          />
          <p className="mt-2 text-sm text-slate-500">
            从长期置顶日记打开，只记录这个任务如何推进。
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 active:scale-95"
          aria-label="关闭任务文档"
          title="关闭任务文档"
        >
          <X size={20} strokeWidth={2} />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          content={diary.content}
          onChange={onContentChange}
          editable={true}
        />
      </div>
    </div>
  </div>
);

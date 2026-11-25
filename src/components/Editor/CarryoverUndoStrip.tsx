import React from 'react';
import { Undo2, X } from 'lucide-react';
import { t } from '../../i18n';

type CarryoverUndoStripProps = {
  count: number;
  onUndo: () => void;
  onClose: () => void;
};

// 挪完之后留在原处的那条横条。原日记里的事项已经删掉了，点错要能一键还原。
export const CarryoverUndoStrip: React.FC<CarryoverUndoStripProps> = ({ count, onUndo, onClose }) => (
  <div className="border-b px-4 py-2" style={{ borderColor: 'var(--glimmer-border)', background: 'var(--glimmer-surface-header)' }}>
    <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 text-sm">
      <p className="text-primary-600">{t('Carried tasks into this diary', { count })}</p>
      <div className="flex flex-shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onUndo}
          className="inline-flex h-8 items-center gap-1.5 rounded-apple-sm border px-2.5 text-sm font-medium text-primary-600 transition-all hover:bg-primary-50 hover:text-primary-900 active:scale-95"
          style={{ borderColor: 'var(--glimmer-border)' }}
        >
          <Undo2 size={14} strokeWidth={1.75} />
          {t('Undo')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-apple-sm text-primary-500 transition-all hover:bg-primary-50 hover:text-primary-900 active:scale-95"
          title={t('Close')}
          aria-label={t('Close')}
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  </div>
);

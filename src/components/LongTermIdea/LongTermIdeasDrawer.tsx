import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { LongTermIdeaPanel } from './LongTermIdeaPanel';
import { t } from '../../i18n';

interface LongTermIdeasDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToDiary?: (diaryId: string, position?: { from: number; to: number }) => void;
}

export const LongTermIdeasDrawer: React.FC<LongTermIdeasDrawerProps> = ({
  isOpen,
  onClose,
  onNavigateToDiary,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-5">
      <button
        type="button"
        aria-label={t('Close')}
        className="absolute inset-0 bg-primary-900/24 backdrop-blur-md"
        onClick={onClose}
      />

      <div className="glimmer-panel relative flex h-[min(520px,68vh)] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border text-slate-900 shadow-[0_20px_56px_rgba(15,23,42,0.14)] animate-scale-in">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.10),transparent_34%)]" />

        <div className="glimmer-panel-header relative border-b px-5 py-4 md:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1 text-center">
              <h2 className="text-[22px] font-semibold tracking-[-0.04em] text-primary-900 md:text-[24px]">
                {t('Firepit')}
              </h2>
              <p className="mt-1 text-sm text-primary-500">
                从日记里处理可复用线索：保留主题、转成行动，或回到原文继续写。
              </p>
            </div>

            <button
              onClick={onClose}
              className="glimmer-card inline-flex h-10 w-10 items-center justify-center rounded-full border text-primary-400 transition-all duration-200 hover:text-primary-700 active:scale-95"
            >
              <X size={20} strokeWidth={2.1} />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden px-4 py-4 md:px-5 md:py-4">
          <LongTermIdeaPanel onNavigateToDiary={onNavigateToDiary} />
        </div>
      </div>
    </div>,
    document.body,
  );
};

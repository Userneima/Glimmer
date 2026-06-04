import React from 'react';
import { ArrowLeftToLine } from 'lucide-react';
import { t } from '../../i18n';

interface ReturnToLongTermIdeasPanelProps {
  onReturn: () => void;
}

export const ReturnToLongTermIdeasPanel: React.FC<ReturnToLongTermIdeasPanelProps> = ({ onReturn }) => {
  return (
    <div className="glimmer-panel-header border-b px-3 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowLeftToLine size={16} className="text-sky-500" />
          <span className="text-sm font-medium text-primary-700">{t('Viewing from Long-term Ideas')}</span>
        </div>
        <button
          onClick={onReturn}
          className="glimmer-accent-button flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-[0.98]"
        >
          <ArrowLeftToLine size={14} />
          {t('Return to Long-term Ideas')}
        </button>
      </div>
    </div>
  );
};

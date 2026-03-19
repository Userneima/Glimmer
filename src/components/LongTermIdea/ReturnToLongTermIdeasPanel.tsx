import React from 'react';
import { ArrowLeftToLine } from 'lucide-react';
import { t } from '../../i18n';

interface ReturnToLongTermIdeasPanelProps {
  onReturn: () => void;
}

export const ReturnToLongTermIdeasPanel: React.FC<ReturnToLongTermIdeasPanelProps> = ({ onReturn }) => {
  return (
    <div className="p-3 border-b" style={{ backgroundColor: 'rgba(240, 248, 255, 0.8)', borderColor: 'rgba(226, 232, 240, 0.3)' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowLeftToLine size={16} className="text-blue-600" />
          <span className="text-sm font-medium text-gray-700">{t('Viewing from Long-term Ideas')}</span>
        </div>
        <button
          onClick={onReturn}
          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1"
        >
          <ArrowLeftToLine size={14} />
          {t('Return to Long-term Ideas')}
        </button>
      </div>
    </div>
  );
};

import React from 'react';
import { Plus, Tag, Wand2 } from 'lucide-react';
import { t } from '../../i18n';

interface TaskListHeaderProps {
  onBulkSelectMode: () => void;
  onOpenTagManager: () => void;
  onOpenAiPlanModal: () => void;
  onOpenCreateModal: () => void;
}

export const TaskListHeader: React.FC<TaskListHeaderProps> = ({
  onBulkSelectMode,
  onOpenTagManager,
  onOpenAiPlanModal,
  onOpenCreateModal,
}) => {
  return (
    <div
      className="p-4"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
        borderBottom: '1px solid rgba(200, 210, 220, 0.4)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--aurora-primary)' }}>
          {t('Tasks')}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onBulkSelectMode}
            className="p-1.5 rounded-lg transition-colors duration-200"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)', color: 'var(--aurora-secondary)' }}
            title={t('Bulk Select')}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="3" y1="9" x2="21" y2="9"></line>
              <line x1="9" y1="21" x2="9" y2="9"></line>
            </svg>
          </button>
          <button
            onClick={onOpenTagManager}
            className="p-1.5 rounded-lg transition-colors duration-200"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)', color: 'var(--aurora-secondary)' }}
            title={t('Tag Management')}
          >
            <Tag size={16} />
          </button>
          <button
            onClick={onOpenAiPlanModal}
            className="p-1.5 rounded-lg transition-colors duration-200"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)', color: 'var(--aurora-secondary)' }}
            title={t('AI Parse Plans')}
          >
            <Wand2 size={16} />
          </button>
          <button
            onClick={onOpenCreateModal}
            className="p-1.5 text-white rounded-lg transition-all duration-200"
            style={{ background: 'linear-gradient(135deg, var(--aurora-accent), var(--aurora-accent-alt))' }}
            title={t('Create New Task')}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};


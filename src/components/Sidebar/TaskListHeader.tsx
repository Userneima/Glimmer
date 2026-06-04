import React from 'react';
import { Plus, Wand2 } from 'lucide-react';
import { t } from '../../i18n';

interface TaskListHeaderProps {
  onOpenAiPlanModal: () => void;
  onOpenCreateModal: () => void;
}

export const TaskListHeader: React.FC<TaskListHeaderProps> = ({
  onOpenAiPlanModal,
  onOpenCreateModal,
}) => {
  return (
    <div className="glimmer-panel-header p-4 border-b">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--aurora-primary)' }}>
          {t('Tasks')}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenAiPlanModal}
            className="glimmer-icon-button p-1.5 rounded-lg transition-colors duration-200"
            title={t('AI Parse Plans')}
          >
            <Wand2 size={16} />
          </button>
          <button
            onClick={onOpenCreateModal}
            className="glimmer-accent-button p-1.5 rounded-lg transition-all duration-200"
            title={t('Create New Task')}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

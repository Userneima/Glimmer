import React from 'react';
import { t } from '../../i18n';
import type { Tag } from '../../types';

interface TaskBulkToolbarProps {
  selectedTasksCount: number;
  tags: Tag[];
  selectedBulkTag: string | null;
  onChangeSelectedBulkTag: (tagId: string | null) => void;
  onAddTagToTasks: () => void;
  onRemoveTagFromTasks: () => void;
  onCancel: () => void;
  bulkSelectMode: boolean;
}

export const TaskBulkToolbar: React.FC<TaskBulkToolbarProps> = ({
  selectedTasksCount,
  tags,
  selectedBulkTag,
  onChangeSelectedBulkTag,
  onAddTagToTasks,
  onRemoveTagFromTasks,
  onCancel,
  bulkSelectMode,
}) => {
  if (!(selectedTasksCount > 0 || bulkSelectMode)) {
    return null;
  }

  return (
    <div
      className="px-3 py-2"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.6)',
        borderBottom: '1px solid rgba(200, 210, 220, 0.3)',
      }}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm font-medium" style={{ color: 'var(--aurora-primary)' }}>
          {selectedTasksCount > 0 ? `${t('Selected')}: ${selectedTasksCount}` : t('Bulk Select Mode')}
        </span>
        <div className="flex items-center gap-2">
          {selectedTasksCount > 0 && (
            <>
              <select
                value={selectedBulkTag || ''}
                onChange={(e) => onChangeSelectedBulkTag(e.target.value || null)}
                className="px-2 py-1 text-xs border rounded"
              >
                <option value="">{t('Select a tag')}</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
              <button
                onClick={onAddTagToTasks}
                disabled={!selectedBulkTag}
                className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {t('Add Tag')}
              </button>
              <button
                onClick={onRemoveTagFromTasks}
                disabled={!selectedBulkTag}
                className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {t('Remove Tag')}
              </button>
            </>
          )}
          <button
            onClick={onCancel}
            className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
          >
            {t('Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};


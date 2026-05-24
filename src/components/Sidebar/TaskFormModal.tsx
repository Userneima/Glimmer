import React, { useId, useState } from 'react';
import { Calendar as CalendarIcon, Clock } from 'lucide-react';
import type { Tag, TaskType } from '../../types';
import { t } from '../../i18n';
import { Modal } from '../UI/Modal';
import { TagSelector } from '../UI/TagSelector';
import type { TaskFormValues } from '../../utils/taskForm';

type TaskFormModalProps = {
  isOpen: boolean;
  title: string;
  submitLabel: string;
  initialTitle?: string;
  initialNotes?: string;
  initialTaskType?: TaskType;
  initialStartDate?: string;
  initialEndDate?: string;
  initialTags?: string[];
  tags?: Tag[];
  onAddTag?: (name: string, color: string) => Tag;
  onClose: () => void;
  onSubmit: (values: TaskFormValues) => void;
};

const toTimestampRange = (taskType: TaskType, startDate: string, endDate: string) => {
  if (taskType !== 'time-range') {
    return { startDate: undefined, endDate: undefined };
  }

  return {
    startDate: startDate ? new Date(startDate).getTime() : undefined,
    endDate: endDate ? new Date(endDate).setHours(23, 59, 59, 999) : undefined,
  };
};

export const TaskFormModal: React.FC<TaskFormModalProps> = ({
  isOpen,
  title,
  submitLabel,
  initialTitle = '',
  initialNotes = '',
  initialTaskType = 'long-term',
  initialStartDate = '',
  initialEndDate = '',
  initialTags = [],
  tags,
  onAddTag,
  onClose,
  onSubmit,
}) => {
  const taskTypeGroupId = useId();
  const [taskTitle, setTaskTitle] = useState(initialTitle);
  const [notes, setNotes] = useState(initialNotes);
  const [taskType, setTaskType] = useState<TaskType>(initialTaskType);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [selectedTags, setSelectedTags] = useState(initialTags);

  const resetForm = () => {
    setTaskTitle(initialTitle);
    setNotes(initialNotes);
    setTaskType(initialTaskType);
    setStartDate(initialStartDate);
    setEndDate(initialEndDate);
    setSelectedTags(initialTags);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = () => {
    if (!taskTitle.trim()) return;
    const range = toTimestampRange(taskType, startDate, endDate);
    onSubmit({
      title: taskTitle.trim(),
      notes: notes.trim() || undefined,
      taskType,
      ...range,
      tags: selectedTags,
    });
    resetForm();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('Task Title')}
          </label>
          <input
            type="text"
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder={t('Enter task title')}
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('Notes')} <span className="text-gray-400 text-xs">({t('Optional')})</span>
          </label>
          <textarea
            className="w-full border rounded px-3 py-2 text-sm resize-none"
            placeholder={t('Add notes...')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('Task Type')}
          </label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={taskTypeGroupId}
                value="long-term"
                checked={taskType === 'long-term'}
                onChange={(e) => setTaskType(e.target.value as TaskType)}
              />
              <Clock size={16} className="text-gray-600" />
              <span className="text-sm">{t('Long-term task')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={taskTypeGroupId}
                value="time-range"
                checked={taskType === 'time-range'}
                onChange={(e) => setTaskType(e.target.value as TaskType)}
              />
              <CalendarIcon size={16} className="text-orange-500" />
              <span className="text-sm">{t('Time-range task')}</span>
            </label>
          </div>
        </div>

        {taskType === 'time-range' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('Start Date')}
              </label>
              <input
                type="date"
                className="w-full border rounded px-3 py-2 text-sm"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('End Date')}
              </label>
              <input
                type="date"
                className="w-full border rounded px-3 py-2 text-sm"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
              />
            </div>
          </div>
        )}

        {tags && onAddTag && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('Tags')} <span className="text-gray-400 text-xs">({t('Optional')})</span>
            </label>
            <TagSelector
              tags={tags}
              selectedTagIds={selectedTags}
              onTagToggle={(tagId) => {
                setSelectedTags((prev) => (
                  prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
                ));
              }}
              onAddTag={onAddTag}
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            {t('Cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!taskTitle.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};

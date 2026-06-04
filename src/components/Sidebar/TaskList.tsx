import React, { useMemo, useState, useEffect } from 'react';
import { useTasks } from '../../hooks/useTasks';
import { useAppleReminders } from '../../hooks/useAppleReminders';
import { useAiTaskParser } from '../../hooks/useAiTaskParser';
import { t } from '../../i18n';
import { RefreshCw, Trash2, Search, Loader2 } from 'lucide-react';
import { Modal } from '../UI/Modal';
import type { Task } from '../../types';
import type { ParsedPlanItem } from '../../utils/planParser';
import { formatDate, formatTime } from '../../utils/date';
import { TaskListHeader } from './TaskListHeader';
import { TaskItem } from './TaskItem';
import { AppleReminderItem } from './AppleReminderItem';
import { TaskFormModal } from './TaskFormModal';
import { formatDateInput, taskFormValuesToTaskData, type TaskFormValues } from '../../utils/taskForm';

interface TaskListProps {
  onModalStateChange?: (hasModalOpen: boolean) => void;
}

export const TaskList: React.FC<TaskListProps> = ({ onModalStateChange }) => {
  const {
    activeTasks,
    futureTasks,
    completedTasks,
    searchQuery,
    setSearchQuery,
    filterTasksBySearch,
    addTask,
    updateTask,
    sendTaskToReminders,
    toggleComplete,
    deleteTask,
    moveTaskUp,
    moveTaskDown,
  } = useTasks();

  const reminderOptions = useMemo(() => ({ scope: 'all-open' as const }), []);
  const {
    reminders,
    status: remindersStatus,
    loading: remindersLoading,
    error: remindersError,
    refresh: refreshReminders,
    setReminderCompleted,
  } = useAppleReminders(reminderOptions);
  const { parsePlans, loading: aiLoading, error: aiError } = useAiTaskParser();

  const [activeTab, setActiveTab] = useState<'active' | 'future' | 'completed'>('active');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [showAiPlanModal, setShowAiPlanModal] = useState(false);
  const [aiPlanInput, setAiPlanInput] = useState('');
  const [parsedPlans, setParsedPlans] = useState<ParsedPlanItem[]>([]);
  const [aiParseError, setAiParseError] = useState<string | null>(null);
  const [completingReminderId, setCompletingReminderId] = useState<string | null>(null);

  const hasInvalidPlanDates = useMemo(
    () => parsedPlans.some((plan) => !plan.startDate || !plan.endDate),
    [parsedPlans]
  );

  // Notify parent when modal state changes
  useEffect(() => {
    const hasModalOpen = showCreateModal || showEditModal || showAiPlanModal;
    onModalStateChange?.(hasModalOpen);
  }, [showCreateModal, showEditModal, showAiPlanModal, onModalStateChange]);

  const handleEditTask = (task: Task) => {
    setEditingTaskId(task.id);
    setShowEditModal(true);
  };

  const handleCreateTask = (values: TaskFormValues) => {
    addTask(values.title, {
      ...taskFormValuesToTaskData(values, { clearDatesForLongTerm: false }),
      sourceContext: { kind: 'manual' },
    });
    setShowCreateModal(false);
  };

  const handleUpdateTask = (values: TaskFormValues) => {
    if (!editingTaskId) return;
    updateTask(editingTaskId, {
      title: values.title,
      ...taskFormValuesToTaskData(values, { clearDatesForLongTerm: true }),
    });
    setEditingTaskId(null);
    setShowEditModal(false);
  };

  const handleParsePlans = async () => {
    if (!aiPlanInput.trim()) {
      setAiParseError(t('Please enter your plan text'));
      return;
    }

    setAiParseError(null);
    try {
      const plans = await parsePlans(aiPlanInput.trim(), new Date());
      setParsedPlans(plans);
      if (plans.length === 0) {
        setAiParseError(t('No tasks extracted'));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAiParseError(message);
    }
  };

  const handleCreateTasksFromPlans = (sendToReminders = false) => {
    if (parsedPlans.length === 0 || hasInvalidPlanDates) {
      return;
    }

    parsedPlans.forEach((plan) => {
      if (!plan.startDate || !plan.endDate) return;
      const task = addTask(plan.title, {
        notes: plan.notes,
        taskType: 'time-range',
        startDate: plan.startDate,
        endDate: plan.endDate,
        sourceContext: {
          kind: 'ai-generated',
          excerpt: aiPlanInput.trim().slice(0, 500),
        },
      });
      if (sendToReminders) {
        void sendTaskToReminders(task.id, task);
      }
    });

    setAiPlanInput('');
    setParsedPlans([]);
    setAiParseError(null);
    setShowAiPlanModal(false);
  };

  const formatDateRange = (startDate: number | null | undefined, endDate: number | null | undefined) => {
    if (!startDate || !endDate) return '';
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
  };

  const formatCompletedDate = (timestamp: number | null | undefined) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    return isToday ? formatTime(timestamp) : formatDate(timestamp);
  };

  const currentTasks = activeTab === 'active' ? activeTasks : activeTab === 'future' ? futureTasks : completedTasks;
  const searchFilteredTasks = filterTasksBySearch(currentTasks);
  const filteredTasks = searchFilteredTasks;
  const shouldShowReminders = activeTab === 'active';
  const visibleReminders = useMemo(() => {
    if (!shouldShowReminders) return [];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return reminders;
    return reminders.filter((reminder) =>
      reminder.title.toLowerCase().includes(query) ||
      (reminder.notes ?? '').toLowerCase().includes(query) ||
      (reminder.calendarTitle ?? '').toLowerCase().includes(query)
    );
  }, [reminders, searchQuery, shouldShowReminders]);
  const activeItemCount = activeTasks.length + reminders.length;
  const editingTask = editingTaskId
    ? [...activeTasks, ...futureTasks, ...completedTasks].find((task) => task.id === editingTaskId)
    : null;

  const canMoveUp = (taskId: string) => {
    if (activeTab !== 'active') return false;
    // Disable moving when search is active (to avoid confusion)
    if (searchQuery.trim()) return false;
    const index = currentTasks.findIndex(t => t.id === taskId);
    return index > 0;
  };

  const canMoveDown = (taskId: string) => {
    if (activeTab !== 'active') return false;
    // Disable moving when search is active (to avoid confusion)
    if (searchQuery.trim()) return false;
    const index = currentTasks.findIndex(t => t.id === taskId);
    return index < currentTasks.length - 1;
  };

  const handleCompleteReminder = async (reminderExternalId: string) => {
    const reminder = reminders.find((item) => item.externalId === reminderExternalId);
    if (!reminder || completingReminderId) return;
    setCompletingReminderId(reminder.externalId);
    try {
      await setReminderCompleted(reminder, true);
    } finally {
      setCompletingReminderId(null);
    }
  };

  return (
    <div className="glimmer-panel h-full flex flex-col">
      {/* Header - 轻量半透明 */}
      <TaskListHeader
        onOpenAiPlanModal={() => setShowAiPlanModal(true)}
        onOpenCreateModal={() => setShowCreateModal(true)}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        {/* Search Box */}
        <div className="relative mx-3 mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--aurora-muted)' }} />
          <input
            type="text"
            className="glimmer-field w-full rounded-xl px-9 py-2 text-sm transition-colors duration-200 outline-none"
            style={{ color: 'var(--aurora-primary)' }}
            placeholder={t('Search tasks...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

      {/* Tabs - 轻量风格 */}
      <div className="glimmer-panel-header px-3 py-2 border-b">
        <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: 'var(--glimmer-surface-card)' }}>
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${
              activeTab === 'active'
                ? 'shadow-sm'
              : ''
          }`}
          style={activeTab === 'active'
            ? { backgroundColor: 'var(--glimmer-surface-active)', color: 'var(--aurora-accent)' }
            : { color: 'var(--aurora-secondary)' }
          }
        >
          {t('In Progress')} ({activeItemCount})
        </button>
        <button
          onClick={() => setActiveTab('future')}
          className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${
            activeTab === 'future'
              ? 'shadow-sm'
              : ''
          }`}
          style={activeTab === 'future'
            ? { backgroundColor: 'var(--glimmer-surface-active)', color: 'var(--aurora-accent)' }
            : { color: 'var(--aurora-secondary)' }
          }
        >
          {t('Future')} ({futureTasks.length})
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${
            activeTab === 'completed'
              ? 'shadow-sm'
              : ''
          }`}
          style={activeTab === 'completed'
            ? { backgroundColor: 'var(--glimmer-surface-active)', color: 'var(--aurora-accent)' }
            : { color: 'var(--aurora-secondary)' }
          }
        >
          {t('Completed')} ({completedTasks.length})
        </button>
        </div>
      </div>

      {/* Task List - 毛玻璃风 */}
      <div className="flex-1 overflow-auto p-3">
        <ul className="space-y-2">
          {remindersStatus === 'unsupported' && activeTab === 'active' && (
            <li className="glimmer-card rounded-xl border p-3 text-sm text-primary-500">
              {t('Reminders requires the macOS app')}
            </li>
          )}
          {(remindersStatus === 'denied' || remindersStatus === 'restricted') && activeTab === 'active' && (
            <li className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-700">
              {t('Reminders permission denied')}
            </li>
          )}
          {remindersError && activeTab === 'active' && (
            <li className="rounded-xl border border-red-100 bg-red-50 p-2 text-xs text-red-600">
              {remindersError}
            </li>
          )}
          {activeTab === 'active' && remindersStatus === 'authorized' && (
            <li className="glimmer-info-strip flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs">
              <span>{t('Apple reminders are shown with Glimmer tasks')}</span>
              <button
                type="button"
                onClick={() => void refreshReminders(true)}
                className="glimmer-card inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-sky-600 shadow-sm transition-colors hover:text-sky-700"
              >
                <RefreshCw size={12} className={remindersLoading ? 'animate-spin' : ''} />
                {t('Refresh')}
              </button>
            </li>
          )}
          {visibleReminders.map((reminder) => (
            <AppleReminderItem
              key={`reminder-${reminder.externalId}`}
              reminder={reminder}
              completing={completingReminderId === reminder.externalId}
              onComplete={() => void handleCompleteReminder(reminder.externalId)}
            />
          ))}
          {remindersLoading && visibleReminders.length === 0 && activeTab === 'active' && (
            <li className="glimmer-card rounded-xl p-3 text-sm text-primary-400">{t('Loading...')}</li>
          )}
          {filteredTasks.length === 0 && visibleReminders.length === 0 && !remindersLoading ? (
            <li className="glimmer-card text-center text-sm py-8 rounded-xl" style={{ color: 'var(--aurora-muted)' }}>
              {searchQuery ? t('No tasks found') : activeTab === 'active' ? t('No actions yet') : t('No tasks yet')}
            </li>
          ) : (
            filteredTasks.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                isActiveTabCompleted={activeTab === 'completed'}
                canMoveUp={canMoveUp(task.id)}
                canMoveDown={canMoveDown(task.id)}
                onToggleComplete={() => toggleComplete(task.id)}
                onMoveUp={() => moveTaskUp(task.id)}
                onMoveDown={() => moveTaskDown(task.id)}
                onEdit={() => handleEditTask(task)}
                onDelete={() => deleteTask(task.id)}
                onSendToReminders={() => void sendTaskToReminders(task.id)}
                formatDateRange={formatDateRange}
                formatCompletedDate={formatCompletedDate}
              />
            ))
          )}
        </ul>
      </div>

      <TaskFormModal
        key={`create-task-${showCreateModal}`}
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={t('Create New Task')}
        submitLabel={t('Create')}
        onSubmit={handleCreateTask}
      />

        <TaskFormModal
          key={`edit-task-${editingTask?.id ?? 'none'}-${showEditModal}`}
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingTaskId(null);
          }}
          title={t('Edit Task')}
          submitLabel={t('Update')}
          initialTitle={editingTask?.title ?? ''}
          initialNotes={editingTask?.notes ?? ''}
          initialTaskType={editingTask?.taskType ?? 'long-term'}
          initialStartDate={formatDateInput(editingTask?.startDate)}
          initialEndDate={formatDateInput(editingTask?.endDate)}
          onSubmit={handleUpdateTask}
        />

        {/* AI Plan Parse Modal */}
        <Modal
          isOpen={showAiPlanModal}
          onClose={() => setShowAiPlanModal(false)}
          title={t('AI Parse Plans')}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('Plan Text')}
              </label>
              <textarea
                className="w-full border rounded px-3 py-2 text-sm resize-none"
                placeholder={t('Paste your plan text here')}
                value={aiPlanInput}
                onChange={(e) => setAiPlanInput(e.target.value)}
                rows={5}
              />
            </div>

            {(aiParseError || aiError) && (
              <div className="text-sm text-red-600">
                {aiParseError || aiError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={handleParsePlans}
                disabled={aiLoading}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {aiLoading && <Loader2 size={14} className="animate-spin" />}
                {t('Parse Plans')}
              </button>
            </div>

            {parsedPlans.length > 0 && (
              <div className="space-y-3">
                <div className="text-sm font-medium text-gray-700">{t('Parsed Tasks')}</div>
                {parsedPlans.map((plan, index) => (
                  <div key={`${plan.title}-${index}`} className="border rounded p-3 space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 border rounded px-2 py-1 text-sm"
                        value={plan.title}
                        onChange={(e) => {
                          const next = parsedPlans.map((item, idx) =>
                            idx === index ? { ...item, title: e.target.value } : item
                          );
                          setParsedPlans(next);
                        }}
                      />
                      <button
                        onClick={() => {
                          const next = parsedPlans.filter((_, idx) => idx !== index);
                          setParsedPlans(next);
                        }}
                        className="px-2 text-red-600 hover:text-red-700"
                        title={t('Delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        className="border rounded px-2 py-1 text-sm"
                        value={formatDateInput(plan.startDate)}
                        onChange={(e) => {
                          const value = e.target.value ? new Date(e.target.value) : null;
                          const startDate = value ? value.setHours(0, 0, 0, 0) : null;
                          const endDate = value ? new Date(value).setHours(23, 59, 59, 999) : null;
                          const next = parsedPlans.map((item, idx) =>
                            idx === index ? { ...item, startDate, endDate } : item
                          );
                          setParsedPlans(next);
                        }}
                      />
                      <input
                        type="date"
                        className="border rounded px-2 py-1 text-sm"
                        value={formatDateInput(plan.endDate)}
                        onChange={(e) => {
                          const value = e.target.value ? new Date(e.target.value) : null;
                          const endDate = value ? new Date(value).setHours(23, 59, 59, 999) : null;
                          const next = parsedPlans.map((item, idx) =>
                            idx === index ? { ...item, endDate } : item
                          );
                          setParsedPlans(next);
                        }}
                      />
                    </div>
                    <textarea
                      className="w-full border rounded px-2 py-1 text-sm resize-none"
                      placeholder={t('Optional notes')}
                      value={plan.notes || ''}
                      onChange={(e) => {
                        const next = parsedPlans.map((item, idx) =>
                          idx === index ? { ...item, notes: e.target.value } : item
                        );
                        setParsedPlans(next);
                      }}
                      rows={2}
                    />
                    {(!plan.startDate || !plan.endDate) && (
                      <div className="text-xs text-red-600">{t('Please complete dates')}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAiPlanModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={() => handleCreateTasksFromPlans(false)}
                disabled={parsedPlans.length === 0 || hasInvalidPlanDates}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {t('Create Tasks')}
              </button>
              <button
                onClick={() => handleCreateTasksFromPlans(true)}
                disabled={parsedPlans.length === 0 || hasInvalidPlanDates}
                className="px-4 py-2 text-sm bg-sky-600 text-white rounded hover:bg-sky-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {t('Create and Send to Reminders')}
              </button>
            </div>
          </div>
        </Modal>

      </div>
    </div>
  );
};

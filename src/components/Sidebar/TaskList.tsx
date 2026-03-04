import React, { useMemo, useState, useEffect } from 'react';
import { useTasks } from '../../hooks/useTasks';
import { useAiTaskParser } from '../../hooks/useAiTaskParser';
import { t } from '../../i18n';
import { Plus, Trash2, Clock, Calendar as CalendarIcon, Search, ChevronUp, ChevronDown, Wand2, Loader2, Edit, Tag } from 'lucide-react';
import { Modal } from '../UI/Modal';
import { TagSelector } from '../UI/TagSelector';
import { TagManager } from '../UI/TagManager';
import type { Task, TaskType } from '../../types';
import type { ParsedPlanItem } from '../../utils/planParser';

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
    toggleComplete,
    deleteTask,
    moveTaskUp,
    moveTaskDown,
    // Tag related
    tags,
    selectedTags,
    setSelectedTags,
    addTag,
    updateTag,
    deleteTag,
    toggleTagFavorite,
    batchAddTagToTasks,
    batchRemoveTagFromTasks,
    filterTasksByTags,
    clearTagFilters
  } = useTasks();

  const { parsePlans, loading: aiLoading, error: aiError } = useAiTaskParser();

  const [activeTab, setActiveTab] = useState<'active' | 'future' | 'completed'>('active');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskNotes, setNewTaskNotes] = useState('');
  const [newTaskType, setNewTaskType] = useState<TaskType>('long-term');
  const [newTaskStartDate, setNewTaskStartDate] = useState('');
  const [newTaskEndDate, setNewTaskEndDate] = useState('');
  const [showAiPlanModal, setShowAiPlanModal] = useState(false);
  const [aiPlanInput, setAiPlanInput] = useState('');
  const [parsedPlans, setParsedPlans] = useState<ParsedPlanItem[]>([]);
  const [aiParseError, setAiParseError] = useState<string | null>(null);
  const [newTaskTags, setNewTaskTags] = useState<string[]>([]);
  const [showTagManager, setShowTagManager] = useState(false);
  const [showTagFilterDropdown, setShowTagFilterDropdown] = useState(false);
  const [tagFilterSearch, setTagFilterSearch] = useState('');
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [selectedBulkTag, setSelectedBulkTag] = useState<string | null>(null);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);

  const hasInvalidPlanDates = useMemo(
    () => parsedPlans.some((plan) => !plan.startDate || !plan.endDate),
    [parsedPlans]
  );

  // Notify parent when modal state changes
  useEffect(() => {
    const hasModalOpen = showCreateModal || showEditModal || showAiPlanModal;
    onModalStateChange?.(hasModalOpen);
  }, [showCreateModal, showEditModal, showAiPlanModal, onModalStateChange]);

  const handleCreateTask = () => {
    if (!newTaskTitle.trim()) return;

    const taskData: {
      notes?: string;
      taskType: Task['taskType'];
      startDate?: number;
      endDate?: number;
      tags?: string[];
    } = {
      notes: newTaskNotes.trim() || undefined,
      taskType: newTaskType,
      tags: newTaskTags,
    };

    if (newTaskType === 'time-range') {
      if (newTaskStartDate) {
        taskData.startDate = new Date(newTaskStartDate).getTime();
      }
      if (newTaskEndDate) {
        taskData.endDate = new Date(newTaskEndDate).setHours(23, 59, 59, 999);
      }
    }

    addTask(newTaskTitle.trim(), taskData);

    // Reset form
    setNewTaskTitle('');
    setNewTaskNotes('');
    setNewTaskType('long-term');
    setNewTaskStartDate('');
    setNewTaskEndDate('');
    setNewTaskTags([]);
    setShowCreateModal(false);
  };

  const handleEditTask = (task: Task) => {
    setEditingTaskId(task.id);
    setNewTaskTitle(task.title);
    setNewTaskNotes(task.notes || '');
    setNewTaskType(task.taskType);
    setNewTaskStartDate(formatDateInput(task.startDate ?? null));
    setNewTaskEndDate(formatDateInput(task.endDate ?? null));
    setNewTaskTags(task.tags || []);
    setShowEditModal(true);
  };

  const handleUpdateTask = () => {
    if (!editingTaskId || !newTaskTitle.trim()) return;

    const updates: Partial<Task> = {
      title: newTaskTitle.trim(),
      notes: newTaskNotes.trim() || undefined,
      taskType: newTaskType,
      tags: newTaskTags,
    };

    if (newTaskType === 'time-range') {
      if (newTaskStartDate) {
        updates.startDate = new Date(newTaskStartDate).getTime();
      }
      if (newTaskEndDate) {
        updates.endDate = new Date(newTaskEndDate).setHours(23, 59, 59, 999);
      }
    } else {
      // Clear dates for long-term tasks
      updates.startDate = null;
      updates.endDate = null;
    }

    updateTask(editingTaskId, updates);

    // Reset form
    setEditingTaskId(null);
    setNewTaskTitle('');
    setNewTaskNotes('');
    setNewTaskType('long-term');
    setNewTaskStartDate('');
    setNewTaskEndDate('');
    setNewTaskTags([]);
    setShowEditModal(false);
  };

  const formatDateInput = (timestamp: number | null) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

  const handleCreateTasksFromPlans = () => {
    if (parsedPlans.length === 0 || hasInvalidPlanDates) {
      return;
    }

    parsedPlans.forEach((plan) => {
      if (!plan.startDate || !plan.endDate) return;
      addTask(plan.title, {
        notes: plan.notes,
        taskType: 'time-range',
        startDate: plan.startDate,
        endDate: plan.endDate,
      });
    });

    setAiPlanInput('');
    setParsedPlans([]);
    setAiParseError(null);
    setShowAiPlanModal(false);
  };

  const formatDateRange = (startDate: number | null | undefined, endDate: number | null | undefined) => {
    if (!startDate || !endDate) return '';
    const start = new Date(startDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    const end = new Date(endDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    return `${start} - ${end}`;
  };

  const formatCompletedDate = (timestamp: number | null | undefined) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      // 如果是今天，显示具体时间
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else {
      // 否则显示日期
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    }
  };

  const getContrastTextColor = (backgroundColor: string): string => {
    // 简单的对比度计算，返回黑色或白色文字
    const hex = backgroundColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#000000' : '#ffffff';
  };

  const currentTasks = activeTab === 'active' ? activeTasks : activeTab === 'future' ? futureTasks : completedTasks;
  const searchFilteredTasks = filterTasksBySearch(currentTasks);
  const filteredTasks = filterTasksByTags(searchFilteredTasks);

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

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'rgba(255, 255, 255, 0.75)' }}>
      {/* Header - 轻量半透明 */}
      <div className="p-4" style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)', borderBottom: '1px solid rgba(200, 210, 220, 0.4)' }}>
        <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--aurora-primary)' }}>{t('Tasks')}</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setBulkSelectMode(true)}
                className="p-1.5 rounded-lg transition-colors duration-200"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)', color: 'var(--aurora-secondary)' }}
                title={t('Bulk Select')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
              </button>
              <button
                onClick={() => setShowTagManager(true)}
                className="p-1.5 rounded-lg transition-colors duration-200"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)', color: 'var(--aurora-secondary)' }}
                title={t('Tag Management')}
              >
                <Tag size={16} />
              </button>
              <button
                onClick={() => setShowAiPlanModal(true)}
                className="p-1.5 rounded-lg transition-colors duration-200"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)', color: 'var(--aurora-secondary)' }}
                title={t('AI Parse Plans')}
              >
                <Wand2 size={16} />
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="p-1.5 text-white rounded-lg transition-all duration-200"
                style={{ background: 'linear-gradient(135deg, var(--aurora-accent), var(--aurora-accent-alt))' }}
                title={t('Create New Task')}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

        {/* Search Box */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--aurora-muted)' }} />
          <input
            type="text"
            className="w-full rounded-xl px-9 py-2 text-sm transition-colors duration-200 outline-none"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.6)', border: '1px solid rgba(255, 255, 255, 0.3)', color: 'var(--aurora-primary)' }}
            placeholder={t('Search tasks...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Tag Filter */}
        <div className="space-y-2">
          {/* Tag Filter Bar */}
          <div className="flex flex-wrap gap-1">
            {selectedTags.map((tagId) => {
              const tag = tags.find(t => t.id === tagId);
              if (!tag) return null;
              return (
                <span
                  key={tagId}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full"
                  style={{
                    backgroundColor: tag.color,
                    color: getContrastTextColor(tag.color)
                  }}
                >
                  {tag.name}
                  <button
                    onClick={() => setSelectedTags(prev => prev.filter(id => id !== tagId))}
                    className="ml-1 text-xs opacity-80 hover:opacity-100"
                  >
                    ×
                  </button>
                </span>
              );
            })}
            {selectedTags.length > 0 && (
              <button
                onClick={clearTagFilters}
                className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300"
              >
                {t('Clear')}
              </button>
            )}
          </div>

          {/* Tag Filter Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowTagFilterDropdown(!showTagFilterDropdown)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-sm rounded-lg transition-colors duration-200"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.6)', border: '1px solid rgba(255, 255, 255, 0.3)', color: 'var(--aurora-primary)' }}
            >
              <span>
                {t('Filter by tags')}
                {selectedTags.length > 0 && ` (${selectedTags.length})`}
              </span>
              <Tag size={14} style={{ color: 'var(--aurora-muted)' }} />
            </button>

            {showTagFilterDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 p-3 rounded-lg shadow-lg z-10" style={{ backgroundColor: 'rgba(255, 255, 255, 0.95)' }}>
                {/* Tag Search */}
                <div className="relative mb-3">
                  <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--aurora-muted)' }} />
                  <input
                    type="text"
                    className="w-full rounded-lg px-8 py-1.5 text-sm transition-colors duration-200 outline-none"
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.6)', border: '1px solid rgba(255, 255, 255, 0.3)', color: 'var(--aurora-primary)' }}
                    placeholder={t('Search tags...')}
                    value={tagFilterSearch}
                    onChange={(e) => setTagFilterSearch(e.target.value)}
                  />
                </div>

                {/* Tag List */}
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {tags
                    .filter(tag => tag.name.toLowerCase().includes(tagFilterSearch.toLowerCase()))
                    .map((tag) => {
                      const isSelected = selectedTags.includes(tag.id);
                      return (
                        <label
                          key={tag.id}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors duration-200 ${isSelected ? 'bg-blue-100' : 'hover:bg-gray-100'}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              if (isSelected) {
                                setSelectedTags(prev => prev.filter(id => id !== tag.id));
                              } else {
                                setSelectedTags(prev => [...prev, tag.id]);
                              }
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span
                            className="inline-flex items-center px-2 py-0.5 text-xs rounded-full flex-shrink-0"
                            style={{
                              backgroundColor: tag.color,
                              color: getContrastTextColor(tag.color)
                            }}
                          >
                            {tag.name}
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs - 轻量风格 */}
      <div className="px-3 py-2" style={{ backgroundColor: 'rgba(255, 255, 255, 0.4)', borderBottom: '1px solid rgba(200, 210, 220, 0.3)' }}>
        <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: 'rgba(255, 255, 255, 0.6)' }}>
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${
              activeTab === 'active'
                ? 'shadow-sm'
              : ''
          }`}
          style={activeTab === 'active'
            ? { backgroundColor: 'rgba(255, 255, 255, 0.7)', color: 'var(--aurora-accent)' }
            : { color: 'var(--aurora-secondary)' }
          }
        >
          {t('In Progress')} ({activeTasks.length})
        </button>
        <button
          onClick={() => setActiveTab('future')}
          className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${
            activeTab === 'future'
              ? 'shadow-sm'
              : ''
          }`}
          style={activeTab === 'future'
            ? { backgroundColor: 'rgba(255, 255, 255, 0.7)', color: 'var(--aurora-accent)' }
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
            ? { backgroundColor: 'rgba(255, 255, 255, 0.7)', color: 'var(--aurora-accent)' }
            : { color: 'var(--aurora-secondary)' }
          }
        >
          {t('Completed')} ({completedTasks.length})
        </button>
        </div>
      </div>

      {/* Bulk Operations Toolbar */}
      {(selectedTasks.length > 0 || bulkSelectMode) && (
        <div className="px-3 py-2" style={{ backgroundColor: 'rgba(255, 255, 255, 0.6)', borderBottom: '1px solid rgba(200, 210, 220, 0.3)' }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--aurora-primary)' }}>
              {selectedTasks.length > 0 ? `${t('Selected')}: ${selectedTasks.length}` : t('Bulk Select Mode')}
            </span>
            <div className="flex items-center gap-2">
              {selectedTasks.length > 0 && (
                <>
                  <select
                    value={selectedBulkTag || ''}
                    onChange={(e) => setSelectedBulkTag(e.target.value || null)}
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
                    onClick={() => {
                      if (selectedBulkTag) {
                        batchAddTagToTasks(selectedTasks, selectedBulkTag);
                      }
                    }}
                    disabled={!selectedBulkTag}
                    className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {t('Add Tag')}
                  </button>
                  <button
                    onClick={() => {
                      if (selectedBulkTag) {
                        batchRemoveTagFromTasks(selectedTasks, selectedBulkTag);
                      }
                    }}
                    disabled={!selectedBulkTag}
                    className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {t('Remove Tag')}
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  setSelectedTasks([]);
                  setBulkSelectMode(false);
                }}
                className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
              >
                {t('Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task List - 毛玻璃风 */}
      <div className="flex-1 overflow-auto p-3">
        <ul className="space-y-2">
          {filteredTasks.length === 0 ? (
            <li className="text-center text-sm py-8 rounded-xl" style={{ backgroundColor: 'rgba(255, 255, 255, 0.8)', color: 'var(--aurora-muted)' }}>
              {searchQuery ? t('No tasks found') : t('No tasks yet')}
            </li>
          ) : (
            filteredTasks.map(task => (
              <li key={task.id} className="p-3 rounded-xl border transition-colors duration-200" style={{ backgroundColor: 'rgba(255, 255, 255, 0.85)', borderColor: 'rgba(226, 232, 240, 0.6)' }}>
              <div className="flex items-center gap-2">
                {/* 第一行：批量选择 checkbox + 完成状态 checkbox + 标题 + 图标 + 操作按钮 */}
                <div className="task-item flex-1 min-w-0 flex items-center gap-2">
                  {bulkSelectMode && (
                    <input
                      type="checkbox"
                      checked={selectedTasks.includes(task.id)}
                      onChange={() => {
                        if (selectedTasks.includes(task.id)) {
                          setSelectedTasks(prev => prev.filter(id => id !== task.id));
                        } else {
                          setSelectedTasks(prev => [...prev, task.id]);
                        }
                      }}
                      className="w-4 h-4 rounded border-2 border-purple-500 text-purple-600 focus:ring-purple-500 cursor-pointer flex-shrink-0"
                      title={t('Select for bulk operation')}
                    />
                  )}
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => toggleComplete(task.id)}
                    className="w-4 h-4 rounded border-2 border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer flex-shrink-0"
                    title={t('Mark as completed')}
                  />
                  <span className={`task-text text-sm font-medium ${task.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                    {task.title}
                  </span>
                  {task.taskType === 'long-term' ? (
                    <span title={t('Long-term task')}>
                      <Clock size={12} className="text-gray-400 flex-shrink-0" />
                    </span>
                  ) : (
                    <span title={t('Time-range task')}>
                      <CalendarIcon size={12} className="text-orange-500 flex-shrink-0" />
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  {activeTab === 'active' && (
                    <>
                      <button
                        onClick={() => moveTaskUp(task.id)}
                        disabled={!canMoveUp(task.id)}
                        className="text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        title={t('Move Up')}
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        onClick={() => moveTaskDown(task.id)}
                        disabled={!canMoveDown(task.id)}
                        className="text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        title={t('Move Down')}
                      >
                        <ChevronDown size={14} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleEditTask(task)}
                    className="text-blue-500 hover:text-blue-700 flex-shrink-0"
                    title={t('Edit')}
                  >
                    <Edit size={14} />
                  </button>
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="text-red-500 hover:text-red-700 flex-shrink-0"
                    title={t('Delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {/* 第二行：备注和日期范围 */}
              {(task.notes || (task.taskType === 'time-range' && task.startDate && task.endDate) || (task.tags && task.tags.length > 0) || (activeTab === 'completed' && task.completedAt)) && (
                <div className="ml-6 mt-1">
                  {task.notes && (
                    <p className="text-xs text-gray-500 line-clamp-2">{task.notes}</p>
                  )}
                  {task.taskType === 'time-range' && task.startDate && task.endDate && (
                    <p className="text-xs text-orange-600">
                      {formatDateRange(task.startDate, task.endDate)}
                    </p>
                  )}
                  {activeTab === 'completed' && task.completedAt && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      {t('Completed at')} {formatCompletedDate(task.completedAt)}
                    </p>
                  )}
                  {task.tags && task.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {task.tags.slice(0, 2).map((tagId) => {
                        const tag = tags.find(t => t.id === tagId);
                        if (!tag) return null;
                        return (
                          <span
                            key={tagId}
                            className="inline-flex items-center px-2 py-0.5 text-xs rounded-full"
                            style={{
                              backgroundColor: tag.color,
                              color: getContrastTextColor(tag.color)
                            }}
                          >
                            {tag.name}
                          </span>
                        );
                      })}
                      {task.tags.length > 2 && (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-700">
                          +{task.tags.length - 2}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))
        )}
        </ul>
      </div>

      {/* Create Task Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={t('Create New Task')}
      >
          <div className="space-y-4">
            {/* Task Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('Task Title')}
              </label>
              <input
                type="text"
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder={t('Enter task title')}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                autoFocus
              />
            </div>

            {/* Task Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('Notes')} <span className="text-gray-400 text-xs">({t('Optional')})</span>
              </label>
              <textarea
                className="w-full border rounded px-3 py-2 text-sm resize-none"
                placeholder={t('Add notes...')}
                value={newTaskNotes}
                onChange={(e) => setNewTaskNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Task Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('Task Type')}
              </label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="taskType"
                    value="long-term"
                    checked={newTaskType === 'long-term'}
                    onChange={(e) => setNewTaskType(e.target.value as TaskType)}
                  />
                  <Clock size={16} className="text-gray-600" />
                  <span className="text-sm">{t('Long-term task')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="taskType"
                    value="time-range"
                    checked={newTaskType === 'time-range'}
                    onChange={(e) => setNewTaskType(e.target.value as TaskType)}
                  />
                  <CalendarIcon size={16} className="text-orange-500" />
                  <span className="text-sm">{t('Time-range task')}</span>
                </label>
              </div>
            </div>

            {/* Date Range (only for time-range tasks) */}
            {newTaskType === 'time-range' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('Start Date')}
                  </label>
                  <input
                    type="date"
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={newTaskStartDate}
                    onChange={(e) => setNewTaskStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('End Date')}
                  </label>
                  <input
                    type="date"
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={newTaskEndDate}
                    onChange={(e) => setNewTaskEndDate(e.target.value)}
                    min={newTaskStartDate}
                  />
                </div>
              </div>
            )}

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('Tags')} <span className="text-gray-400 text-xs">({t('Optional')})</span>
              </label>
              <TagSelector
                tags={tags}
                selectedTagIds={newTaskTags}
                onTagToggle={(tagId) => {
                  if (newTaskTags.includes(tagId)) {
                    setNewTaskTags(prev => prev.filter(id => id !== tagId));
                  } else {
                    setNewTaskTags(prev => [...prev, tagId]);
                  }
                }}
                onAddTag={addTag}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={handleCreateTask}
                disabled={!newTaskTitle.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {t('Create')}
              </button>
            </div>
          </div>
        </Modal>

        {/* Edit Task Modal */}
        <Modal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingTaskId(null);
            setNewTaskTitle('');
            setNewTaskNotes('');
            setNewTaskType('long-term');
            setNewTaskStartDate('');
            setNewTaskEndDate('');
          }}
          title={t('Edit Task')}
        >
          <div className="space-y-4">
            {/* Task Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('Task Title')}
              </label>
              <input
                type="text"
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder={t('Enter task title')}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                autoFocus
              />
            </div>

            {/* Task Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('Notes')} <span className="text-gray-400 text-xs">({t('Optional')})</span>
              </label>
              <textarea
                className="w-full border rounded px-3 py-2 text-sm resize-none"
                placeholder={t('Add notes...')}
                value={newTaskNotes}
                onChange={(e) => setNewTaskNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Task Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('Task Type')}
              </label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="editTaskType"
                    value="long-term"
                    checked={newTaskType === 'long-term'}
                    onChange={(e) => setNewTaskType(e.target.value as TaskType)}
                  />
                  <Clock size={16} className="text-gray-600" />
                  <span className="text-sm">{t('Long-term task')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="editTaskType"
                    value="time-range"
                    checked={newTaskType === 'time-range'}
                    onChange={(e) => setNewTaskType(e.target.value as TaskType)}
                  />
                  <CalendarIcon size={16} className="text-orange-500" />
                  <span className="text-sm">{t('Time-range task')}</span>
                </label>
              </div>
            </div>

            {/* Date Range (only for time-range tasks) */}
            {newTaskType === 'time-range' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('Start Date')}
                  </label>
                  <input
                    type="date"
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={newTaskStartDate}
                    onChange={(e) => setNewTaskStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('End Date')}
                  </label>
                  <input
                    type="date"
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={newTaskEndDate}
                    onChange={(e) => setNewTaskEndDate(e.target.value)}
                    min={newTaskStartDate}
                  />
                </div>
              </div>
            )}

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('Tags')} <span className="text-gray-400 text-xs">({t('Optional')})</span>
              </label>
              <TagSelector
                tags={tags}
                selectedTagIds={newTaskTags}
                onTagToggle={(tagId) => {
                  if (newTaskTags.includes(tagId)) {
                    setNewTaskTags(prev => prev.filter(id => id !== tagId));
                  } else {
                    setNewTaskTags(prev => [...prev, tagId]);
                  }
                }}
                onAddTag={addTag}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingTaskId(null);
                  setNewTaskTitle('');
                  setNewTaskNotes('');
                  setNewTaskType('long-term');
                  setNewTaskStartDate('');
                  setNewTaskEndDate('');
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={handleUpdateTask}
                disabled={!newTaskTitle.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {t('Update')}
              </button>
            </div>
          </div>
        </Modal>

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
                onClick={handleCreateTasksFromPlans}
                disabled={parsedPlans.length === 0 || hasInvalidPlanDates}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {t('Create Tasks')}
              </button>
            </div>
          </div>
        </Modal>

        {/* Tag Manager Modal */}
        <Modal
          isOpen={showTagManager}
          onClose={() => setShowTagManager(false)}
          title={t('Tag Management')}
        >
          <TagManager
            tags={tags}
            onAddTag={addTag}
            onUpdateTag={updateTag}
            onDeleteTag={deleteTag}
            onToggleFavorite={toggleTagFavorite}
          />
        </Modal>
    </div>
  );
};

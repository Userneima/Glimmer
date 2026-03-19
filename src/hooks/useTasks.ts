import { useCallback, useEffect, useState, useMemo } from 'react';
import { storage } from '../utils/storage';
import type { Task, Tag } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { cloud } from '../utils/cloud';
import { useAuth } from '../context/useAuth';
import { showToast, getErrorMessage } from '../utils/toast';
import { t } from '../i18n';

export function useTasks() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [tasks, setTasks] = useState<Task[]>(() => storage.getTasks());
  const [searchQuery, setSearchQuery] = useState('');
  const [tags, setTags] = useState<Tag[]>(() => storage.getTags());
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  useEffect(() => {
    storage.saveTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    storage.saveTags(tags);
  }, [tags]);

  useEffect(() => {
    let active = true;

    const loadTasks = async () => {
      try {
        if (userId) {
          const remote = await cloud.fetchTasks(userId);
          if (!active) return;
          // Only use remote data if it's not empty, otherwise keep local data
          if (remote && remote.length > 0) {
            // Merge remote data with local tags to preserve tag assignments
            const local = storage.getTasks();
            const localTaskMap = new Map(local.map(t => [t.id, t]));
            const mergedTasks = remote.map(remoteTask => {
              const localTask = localTaskMap.get(remoteTask.id);
              // If local task has tags, merge them into remote task
              if (localTask && localTask.tags && localTask.tags.length > 0) {
                return { ...remoteTask, tags: localTask.tags };
              }
              return remoteTask;
            });
            storage.saveTasks(mergedTasks);
            setTasks(mergedTasks);
          } else {
            // Remote is empty, use local data
            const local = storage.getTasks();
            setTasks(local);
          }
          return;
        }

        const local = storage.getTasks();
        if (!active) return;
        setTasks(local);
      } catch (err) {
        showToast(getErrorMessage(err) || t('Cloud sync failed'));
      }
    };

    void loadTasks();

    return () => {
      active = false;
    };
  }, [userId]);

  const syncTask = useCallback((task: Task) => {
    if (!userId) return;
    void cloud.upsertTask(userId, task).catch((err) => {
      showToast(getErrorMessage(err) || t('Cloud sync failed'));
    });
  }, [userId]);

  const syncTasks = useCallback((items: Task[]) => {
    if (!userId) return;
    void Promise.all(items.map((task) => cloud.upsertTask(userId, task))).catch((err) => {
      showToast(getErrorMessage(err) || t('Cloud sync failed'));
    });
  }, [userId]);

  // Separate active and completed tasks
  const activeTasks = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const todayTimestamp = now.getTime();

    return tasks
      .filter(t => !t.completed)
      .filter(t => {
        // Exclude future tasks (time-range tasks that start after today)
        if (t.taskType === 'time-range' && t.startDate) {
          return t.startDate <= todayTimestamp;
        }
        return true;
      })
      .sort((a, b) => {
        // Sort by order first, then by createdAt
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order;
        }
        if (a.order !== undefined) return -1;
        if (b.order !== undefined) return 1;
        return a.createdAt - b.createdAt;
      });
  }, [tasks]);

  const futureTasks = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const todayTimestamp = now.getTime();

    return tasks
      .filter(t => !t.completed)
      .filter(t => {
        // Only time-range tasks that start after today
        if (t.taskType === 'time-range' && t.startDate) {
          return t.startDate > todayTimestamp;
        }
        return false;
      })
      .sort((a, b) => {
        // Sort by start date for future tasks
        if (a.startDate && b.startDate) {
          return a.startDate - b.startDate;
        }
        return a.createdAt - b.createdAt;
      });
  }, [tasks]);

  const completedTasks = useMemo(() => {
    return tasks
      .filter(t => t.completed)
      .sort((a, b) => {
        // Sort completed tasks by completion date (newest first)
        if (a.completedAt && b.completedAt) {
          return b.completedAt - a.completedAt;
        }
        return b.createdAt - a.createdAt;
      });
  }, [tasks]);

  // Filter tasks by search query
  const filterTasksBySearch = useCallback((taskList: Task[]) => {
    if (!searchQuery.trim()) return taskList;
    const query = searchQuery.toLowerCase();
    return taskList.filter(t =>
      t.title.toLowerCase().includes(query) ||
      (t.notes && t.notes.toLowerCase().includes(query))
    );
  }, [searchQuery]);

  const addTask = useCallback((title: string, opts?: Partial<Task>) => {
    const maxOrder = tasks
      .filter(t => !t.completed)
      .reduce((max, t) => Math.max(max, t.order ?? 0), 0);

    const t: Task = {
      id: uuidv4(),
      title,
      notes: opts?.notes || undefined,
      createdAt: Date.now(),
      dueAt: opts?.dueAt || null,
      completed: false,
      recurring: opts?.recurring || null,
      relatedDiaryId: opts?.relatedDiaryId || null,
      taskType: opts?.taskType || 'long-term',
      startDate: opts?.startDate || null,
      endDate: opts?.endDate || null,
      completedAt: null,
      order: maxOrder + 1,
      tags: opts?.tags || [],
    };
    setTasks(prev => [...prev, t]);
    syncTask(t);
    return t;
  }, [tasks, syncTask]);

  const updateTask = useCallback((id: string, updates: Partial<Task>) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...updates } : t)));
    const target = tasks.find(t => t.id === id);
    if (target) {
      syncTask({ ...target, ...updates });
    }
  }, [tasks, syncTask]);

  const batchUpdateTasks = useCallback((items: Array<{ id: string; updates: Partial<Task> }>) => {
    if (items.length === 0) return;

    setTasks(prev =>
      prev.map(t => {
        const entry = items.find(i => i.id === t.id);
        return entry ? { ...t, ...entry.updates } : t;
      }),
    );

    const toSync: Task[] = [];
    items.forEach(({ id, updates }) => {
      const target = tasks.find(t => t.id === id);
      if (target) {
        toSync.push({ ...target, ...updates });
      }
    });

    if (toSync.length > 0) {
      syncTasks(toSync);
    }
  }, [tasks, syncTasks]);

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    if (userId) {
      void cloud.deleteTask(userId, id).catch((err) => {
        showToast(getErrorMessage(err) || t('Cloud sync failed'));
      });
    }
  }, [userId]);

  const toggleComplete = useCallback((id: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id === id) {
        const newCompleted = !t.completed;
        return {
          ...t,
          completed: newCompleted,
          completedAt: newCompleted ? Date.now() : null,
        };
      }
      return t;
    }));
    const target = tasks.find(t => t.id === id);
    if (target) {
      const newCompleted = !target.completed;
      syncTask({
        ...target,
        completed: newCompleted,
        completedAt: newCompleted ? Date.now() : null,
      });
    }
  }, [tasks, syncTask]);

  // Get tasks for a specific date (only time-range tasks)
  const getTasksForDate = useCallback((date: Date) => {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const startTime = startOfDay.getTime();
    const endTime = endOfDay.getTime();

    return tasks.filter(t => {
      if (t.taskType !== 'time-range') return false;
      if (!t.startDate || !t.endDate) return false;

      // Check if task date range intersects with the given date
      return t.startDate <= endTime && t.endDate >= startTime;
    });
  }, [tasks]);

  // Get tasks for a date range
  const getTasksForDateRange = useCallback((startDate: Date, endDate: Date) => {
    const startTime = new Date(startDate).setHours(0, 0, 0, 0);
    const endTime = new Date(endDate).setHours(23, 59, 59, 999);

    return tasks.filter(t => {
      if (t.taskType !== 'time-range') return false;
      if (!t.startDate || !t.endDate) return false;

      // Check if task date range intersects with the given range
      return t.startDate <= endTime && t.endDate >= startTime;
    });
  }, [tasks]);

  const reload = useCallback(() => {
    setTasks(storage.getTasks());
  }, []);

  // Tag management functions
  const addTag = useCallback((name: string, color: string) => {
    // Check if tag already exists
    const existingTag = tags.find(tag => tag.name.toLowerCase() === name.toLowerCase());
    if (existingTag) {
      showToast(t('Tag already exists'));
      return existingTag;
    }

    const newTag: Tag = {
      id: uuidv4(),
      name,
      color,
      isFavorite: false,
      createdAt: Date.now(),
      usageCount: 0,
    };

    setTags(prev => [...prev, newTag]);
    showToast(t('Tag created successfully'));
    return newTag;
  }, [tags]);

  const updateTag = useCallback((id: string, updates: Partial<Tag>) => {
    setTags(prev => prev.map(tag => 
      tag.id === id ? { ...tag, ...updates } : tag
    ));
    showToast(t('Tag updated successfully'));
  }, []);

  const deleteTag = useCallback((id: string) => {
    // Remove tag from all tasks
    setTasks(prev => prev.map(task => ({
      ...task,
      tags: task.tags.filter(tagId => tagId !== id)
    })));

    // Delete the tag itself
    setTags(prev => prev.filter(tag => tag.id !== id));
    showToast(t('Tag deleted successfully'));
  }, []);

  const toggleTagFavorite = useCallback((id: string) => {
    setTags(prev => prev.map(tag => 
      tag.id === id ? { ...tag, isFavorite: !tag.isFavorite } : tag
    ));
  }, []);

  // Task tag operations
  const addTagToTask = useCallback((taskId: string, tagId: string) => {
    setTasks(prev => prev.map(task => {
      if (task.id === taskId && !task.tags.includes(tagId)) {
        const updatedTask = { ...task, tags: [...task.tags, tagId] };
        syncTask(updatedTask);
        return updatedTask;
      }
      return task;
    }));

    // Update tag usage count
    setTags(prev => prev.map(tag => 
      tag.id === tagId ? { ...tag, usageCount: tag.usageCount + 1 } : tag
    ));
  }, [syncTask]);

  const removeTagFromTask = useCallback((taskId: string, tagId: string) => {
    setTasks(prev => prev.map(task => {
      if (task.id === taskId && task.tags.includes(tagId)) {
        const updatedTask = { ...task, tags: task.tags.filter(id => id !== tagId) };
        syncTask(updatedTask);
        return updatedTask;
      }
      return task;
    }));

    // Update tag usage count
    setTags(prev => prev.map(tag => 
      tag.id === tagId ? { ...tag, usageCount: Math.max(0, tag.usageCount - 1) } : tag
    ));
  }, [syncTask]);

  const batchAddTagToTasks = useCallback((taskIds: string[], tagId: string) => {
    const updatedTasks = tasks.filter(task => taskIds.includes(task.id)).map(task => {
      if (!task.tags.includes(tagId)) {
        return { ...task, tags: [...task.tags, tagId] };
      }
      return task;
    });

    setTasks(prev => prev.map(task => {
      const updatedTask = updatedTasks.find(t => t.id === task.id);
      return updatedTask || task;
    }));

    // Sync updated tasks
    syncTasks(updatedTasks);

    // Update tag usage count
    const addedCount = updatedTasks.length;
    setTags(prev => prev.map(tag => 
      tag.id === tagId ? { ...tag, usageCount: tag.usageCount + addedCount } : tag
    ));

    showToast(t('Tag added to {count} tasks', { count: addedCount }));
  }, [tasks, syncTasks]);

  const batchRemoveTagFromTasks = useCallback((taskIds: string[], tagId: string) => {
    const updatedTasks = tasks.filter(task => taskIds.includes(task.id)).map(task => {
      if (task.tags.includes(tagId)) {
        return { ...task, tags: task.tags.filter(id => id !== tagId) };
      }
      return task;
    });

    setTasks(prev => prev.map(task => {
      const updatedTask = updatedTasks.find(t => t.id === task.id);
      return updatedTask || task;
    }));

    // Sync updated tasks
    syncTasks(updatedTasks);

    // Update tag usage count
    const removedCount = updatedTasks.length;
    setTags(prev => prev.map(tag => 
      tag.id === tagId ? { ...tag, usageCount: Math.max(0, tag.usageCount - removedCount) } : tag
    ));

    showToast(t('Tag removed from {count} tasks', { count: removedCount }));
  }, [tasks, syncTasks]);

  // Tag filtering
  const filterTasksByTags = useCallback((taskList: Task[]) => {
    if (selectedTags.length === 0) return taskList;
    return taskList.filter(task => 
      selectedTags.every(tagId => task.tags.includes(tagId))
    );
  }, [selectedTags]);

  const clearTagFilters = useCallback(() => {
    setSelectedTags([]);
  }, []);

  const moveTaskUp = useCallback((id: string) => {
    setTasks(prev => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const todayTimestamp = now.getTime();

      // Build active tasks list in sorted order
      const activeTasks = prev
        .filter(t => !t.completed)
        .filter(t => {
          if (t.taskType === 'time-range' && t.startDate) {
            return t.startDate <= todayTimestamp;
          }
          return true;
        })
        .sort((a, b) => {
          if (a.order !== undefined && b.order !== undefined) {
            return a.order - b.order;
          }
          if (a.order !== undefined) return -1;
          if (b.order !== undefined) return 1;
          return a.createdAt - b.createdAt;
        });

      const currentIndex = activeTasks.findIndex(t => t.id === id);
      if (currentIndex <= 0) return prev;

      // Swap in the sorted array
      [activeTasks[currentIndex - 1], activeTasks[currentIndex]] = [
        activeTasks[currentIndex],
        activeTasks[currentIndex - 1],
      ];

      // Reassign order values to all active tasks to maintain order
      const updatedActive = activeTasks.map((t, idx) => ({
        ...t,
        order: idx,
      }));

      // Create new tasks array with updated orders
      const taskMapWithNewOrder = new Map(updatedActive.map(t => [t.id, t.order]));
      const newTasks = prev.map(t => {
        const newOrder = taskMapWithNewOrder.get(t.id);
        if (newOrder !== undefined) {
          return { ...t, order: newOrder };
        }
        return t;
      });

      if (userId) {
        syncTasks(newTasks);
      }
      return newTasks;
    });
  }, [syncTasks, userId]);

  const moveTaskDown = useCallback((id: string) => {
    setTasks(prev => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const todayTimestamp = now.getTime();

      // Build active tasks list in sorted order
      const activeTasks = prev
        .filter(t => !t.completed)
        .filter(t => {
          if (t.taskType === 'time-range' && t.startDate) {
            return t.startDate <= todayTimestamp;
          }
          return true;
        })
        .sort((a, b) => {
          if (a.order !== undefined && b.order !== undefined) {
            return a.order - b.order;
          }
          if (a.order !== undefined) return -1;
          if (b.order !== undefined) return 1;
          return a.createdAt - b.createdAt;
        });

      const currentIndex = activeTasks.findIndex(t => t.id === id);
      if (currentIndex >= activeTasks.length - 1) return prev;

      // Swap in the sorted array
      [activeTasks[currentIndex], activeTasks[currentIndex + 1]] = [
        activeTasks[currentIndex + 1],
        activeTasks[currentIndex],
      ];

      // Reassign order values to all active tasks to maintain order
      const updatedActive = activeTasks.map((t, idx) => ({
        ...t,
        order: idx,
      }));

      // Create new tasks array with updated orders
      const taskMapWithNewOrder = new Map(updatedActive.map(t => [t.id, t.order]));
      const newTasks = prev.map(t => {
        const newOrder = taskMapWithNewOrder.get(t.id);
        if (newOrder !== undefined) {
          return { ...t, order: newOrder };
        }
        return t;
      });

      if (userId) {
        syncTasks(newTasks);
      }
      return newTasks;
    });
  }, [syncTasks, userId]);

  return {
    tasks,
    activeTasks,
    futureTasks,
    completedTasks,
    searchQuery,
    setSearchQuery,
    filterTasksBySearch,
    addTask,
    updateTask,
    deleteTask,
    toggleComplete,
    getTasksForDate,
    getTasksForDateRange,
    moveTaskUp,
    moveTaskDown,
    reload,
    // Tag related
    tags,
    selectedTags,
    setSelectedTags,
    addTag,
    updateTag,
    deleteTag,
    toggleTagFavorite,
    addTagToTask,
    removeTagFromTask,
    batchAddTagToTasks,
    batchRemoveTagFromTasks,
    filterTasksByTags,
    clearTagFilters,
    batchUpdateTasks,
  };
}

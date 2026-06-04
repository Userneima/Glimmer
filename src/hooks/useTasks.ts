import { useCallback, useEffect, useState, useMemo } from 'react';
import { storage } from '../utils/storage';
import type { Task } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { cloud } from '../utils/cloud';
import { useAuth } from '../context/useAuth';
import { showToast, getErrorMessage } from '../utils/toast';
import { t } from '../i18n';
import { remindersBridge } from '../utils/remindersBridge';
import type { ExternalTaskLink } from '../types';
import { syncQueue } from '../utils/syncQueue';

export function useTasks() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [tasks, setTasks] = useState<Task[]>(() => storage.getTasks());
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    storage.saveTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    let active = true;

    const loadTasks = async () => {
      try {
        if (userId) {
          const remote = await cloud.fetchTasks(userId);
          if (!active) return;
          const local = storage.getTasks();
          if (remote && remote.length > 0) {
            // Merge remote data with local-only tasks to avoid losing offline work.
            const mergedTaskMap = new Map(local.map(t => [t.id, t]));
            remote.forEach(remoteTask => {
              const localTask = mergedTaskMap.get(remoteTask.id);
              mergedTaskMap.set(remoteTask.id, (
                localTask && localTask.tags && localTask.tags.length > 0
                  ? { ...remoteTask, tags: localTask.tags }
                  : remoteTask
              ));
            });
            const mergedTasks = Array.from(mergedTaskMap.values());
            const localOnlyTasks = local.filter(task => !remote.some(remoteTask => remoteTask.id === task.id));
            if (localOnlyTasks.length > 0) {
              void Promise.all(localOnlyTasks.map(task => cloud.upsertTask(userId, task))).catch((err) => {
                localOnlyTasks.forEach(task => {
                  syncQueue.enqueue({
                    type: 'task',
                    action: 'update',
                    data: task,
                    userId,
                  });
                });
                showToast(getErrorMessage(err) || t('Cloud sync failed'));
              });
            }
            storage.saveTasks(mergedTasks);
            setTasks(mergedTasks);
          } else {
            if (local.length > 0) {
              void Promise.all(local.map(task => cloud.upsertTask(userId, task))).catch((err) => {
                local.forEach(task => {
                  syncQueue.enqueue({
                    type: 'task',
                    action: 'update',
                    data: task,
                    userId,
                  });
                });
                showToast(getErrorMessage(err) || t('Cloud sync failed'));
              });
            }
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

  const syncTask = useCallback((task: Task, action: 'create' | 'update' = 'update') => {
    if (!userId) return;
    void cloud.upsertTask(userId, task).catch((err) => {
      syncQueue.enqueue({
        type: 'task',
        action,
        data: task,
        userId,
      });
      showToast(getErrorMessage(err) || t('Cloud sync failed'));
    });
  }, [userId]);

  const syncTasks = useCallback((items: Task[]) => {
    if (!userId) return;
    void Promise.all(items.map((task) => cloud.upsertTask(userId, task))).catch((err) => {
      items.forEach((task) => {
        syncQueue.enqueue({
          type: 'task',
          action: 'update',
          data: task,
          userId,
        });
      });
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
      externalLinks: opts?.externalLinks || [],
      sourceContext: opts?.sourceContext || { kind: 'manual' },
    };
    setTasks(prev => [...prev, t]);
    syncTask(t, 'create');
    return t;
  }, [tasks, syncTask]);

  const updateTask = useCallback((id: string, updates: Partial<Task>) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...updates } : t)));
    const target = tasks.find(t => t.id === id);
    if (target) {
      syncTask({ ...target, ...updates });
    }
  }, [tasks, syncTask]);

  const sendTaskToReminders = useCallback(async (id: string, taskOverride?: Task) => {
    const target = taskOverride ?? tasks.find(t => t.id === id);
    if (!target) return;

    const setReminderLink = (link: ExternalTaskLink) => {
      const externalLinks = [
        ...(target.externalLinks || []).filter(linkItem => linkItem.provider !== 'apple-reminders'),
        link,
      ];
      setTasks(prev => prev.map(t => (t.id === id ? { ...t, externalLinks } : t)));
      syncTask({ ...target, externalLinks });
    };

    const capability = remindersBridge.getReminderCapability();
    if (!capability.available) {
      setReminderLink({
        provider: 'apple-reminders',
        externalId: '',
        syncedAt: Date.now(),
        status: 'failed',
        lastError: capability.reason || t('Reminders unavailable'),
      });
      showToast(t('Reminders requires the macOS app'), 'info');
      return;
    }

    try {
      let status = await remindersBridge.getReminderAuthorizationStatus();
      if (status === 'not-determined') {
        status = await remindersBridge.requestReminderAccess();
      }

      if (status !== 'authorized') {
        setReminderLink({
          provider: 'apple-reminders',
          externalId: '',
          syncedAt: Date.now(),
          status: 'failed',
          lastError: t('Reminders permission denied'),
        });
        showToast(t('Reminders permission denied'), 'error');
        return;
      }

      const result = await remindersBridge.createReminder({
        title: target.title,
        notes: target.notes,
        dueAt: target.dueAt ?? target.endDate ?? null,
        sourceTaskId: target.id,
        sourceDiaryId: target.sourceContext?.diaryId ?? target.relatedDiaryId ?? null,
        sourceIdeaId: target.sourceContext?.ideaId ?? null,
      });

      setReminderLink({
        provider: 'apple-reminders',
        externalId: result.externalId,
        calendarId: result.calendarId,
        calendarTitle: result.calendarTitle,
        syncedAt: Date.now(),
        status: 'linked',
      });
      showToast(t('Sent to Reminders'));
    } catch (err) {
      const message = getErrorMessage(err) || t('Failed to send to Reminders');
      setReminderLink({
        provider: 'apple-reminders',
        externalId: '',
        syncedAt: Date.now(),
        status: 'failed',
        lastError: message,
      });
      showToast(message, 'error');
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
    const target = tasks.find(t => t.id === id);
    setTasks(prev => prev.filter(t => t.id !== id));
    if (userId) {
      void cloud.deleteTask(userId, id).catch((err) => {
        if (target) {
          syncQueue.enqueue({
            type: 'task',
            action: 'delete',
            data: target,
            userId,
          });
        }
        showToast(getErrorMessage(err) || t('Cloud sync failed'));
      });
    }
  }, [tasks, userId]);

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
    sendTaskToReminders,
    deleteTask,
    toggleComplete,
    getTasksForDate,
    getTasksForDateRange,
    moveTaskUp,
    moveTaskDown,
    reload,
    batchUpdateTasks,
  };
}

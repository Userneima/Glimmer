import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Analytics } from "@vercel/analytics/react";
import { useDiaries } from '../../hooks/useDiaries';
import { useFolders } from '../../hooks/useFolders';
import { useLocalBackup } from '../../hooks/useLocalBackup';
import { useAgentInbox } from '../../hooks/useAgentInbox';
import { FolderTree } from '../Sidebar/FolderTree';
import { DiaryList } from '../Sidebar/DiaryList';
import { Editor } from '../Editor/Editor';
import { DiaryHeader } from '../Editor/DiaryHeader';
import { TaskCarryoverPrompt } from '../Editor/TaskCarryoverPrompt';
import { CarryoverUndoStrip } from '../Editor/CarryoverUndoStrip';
import { DayCalendarStrip } from '../Editor/DayCalendarStrip';
import { LongTermFocusStrip } from '../Editor/LongTermFocusStrip';
import { TrashModal } from '../UI/TrashModal';
import { ExportModal } from '../UI/ExportModal';
import { ImportModal } from '../UI/ImportModal';
import { SettingsModal } from '../UI/SettingsModal';
import { DesktopUpdateNotice } from '../UI/DesktopUpdateNotice';
import { BookOpen, Settings, Menu, X, ChevronLeft, ChevronRight, Upload, Download, Moon, Sun } from 'lucide-react';
import { ToastHost } from '../UI/ToastHost';
import { getDiaryWordCount } from '../../utils/text';
import { atNoon, diaryDay, isSameDay, startOfDay } from '../../utils/date';
import { CloudSyncStatus } from '../UI/CloudSyncStatus';
import { CloudLoginReminder } from '../UI/CloudLoginReminder';
import { DesktopStoreWarning } from '../UI/DesktopStoreWarning';
import { useAuth } from '../../context/useAuth';
import { showToast, getErrorMessage } from '../../utils/toast';
import { syncManager } from '../../utils/syncManager';
import { isLongTermMasterDiary, isSystemDiary } from '../../utils/diarySystem';
import { TEMPLATE_DIARY_ID } from '../../types';
import { DEFAULT_TEMPLATE_DIARY_CONTENT, DEFAULT_TEMPLATE_DIARY_TITLE } from '../../utils/diaryTemplate';
import {
  dismissTaskCarryover,
  getTaskCarryoverSuggestion,
  insertCarryoverTasksIntoContent,
  removeCarryoverTasksFromContent,
  undismissTaskCarryover,
  stampCarriedTasks,
  takeCarriedItemsFromContent,
  isSameTaskContent,
  type CarryoverTask,
} from '../../utils/diaryTaskCarryover';
import { DesktopLeftSidebar } from './DesktopLeftSidebar';
import { planMonthFolder } from '../../utils/monthFolder';

import { t } from '../../i18n';

type AppLayoutProps = {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

export const AppLayout: React.FC<AppLayoutProps> = ({ theme, onToggleTheme }) => {
  const { user, signOut, isConfigured, requestSignIn, localUserId } = useAuth();
  // 本地数据的归属跟着存储层走：云端连不上时仍然是这个账号的数据。
  // 备份必须用它，否则未登录时会备份到空的匿名空间，把有效备份挤掉。
  const localDataUserId = user?.id ?? localUserId;
  const {
    diaries,
    allDiaries,
    currentDiary,
    currentDiaryId,
    searchQuery,
    createDiary,
    updateDiary,
    deleteDiary,
    trashedDiaries,
    trashRetentionDays,
    restoreDiary,
    purgeDiary,
    emptyTrash,
    moveDiary,
    setCurrentDiaryId,
    searchDiaries,
    importDiaries,
    pullDiariesFromCloud,
    reloadDiariesFromStorage,
  } = useDiaries();

  const { folders, createFolder, updateFolder, deleteFolder, importFolders } = useFolders();

  // Get the latest folder based on createdAt or updatedAt (if available)
  const latestFolderId = useMemo(() => {
    if (!folders || folders.length === 0) return null;
    // Sort folders by createdAt in descending order
    const sortedFolders = [...folders].sort((a, b) => {
      // Use createdAt as primary sort key
      const createdAtDiff = b.createdAt - a.createdAt;
      if (createdAtDiff !== 0) return createdAtDiff;
      
      // If createdAt is the same, use id as fallback (newer id typically means newer folder)
      return b.id.localeCompare(a.id);
    });
    return sortedFolders[0]?.id || null;
  }, [folders]);

  // Initialize selectedFolderId to latest folder when creating new diary
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(() => {
    // Initial value will be updated when folders are loaded
    return null;
  });
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportModalInitialType, setExportModalInitialType] = useState<'current' | 'all'>('all');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLeftSidebarExpanded, setIsLeftSidebarExpanded] = useState(false);
  const [isLeftSidebarPinned, setIsLeftSidebarPinned] = useState(false);
  const [isDiaryListCollapsed, setIsDiaryListCollapsed] = useState(() => {
    try {
      return localStorage.getItem('diary-list-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const toggleDiaryListCollapsed = useCallback(() => {
    setIsDiaryListCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('diary-list-collapsed', String(next));
      } catch (err) {
        console.warn('Failed to persist diary list collapsed state', err);
      }
      return next;
    });
  }, []);
  const [, forceCarryoverRefresh] = useState(0);
  const { runMajorLocalBackup, scheduleMajorLocalBackup } = useLocalBackup(localDataUserId);
  // Claude 的改动单从这里进来，规则见 utils/agentChanges.ts。
  useAgentInbox(allDiaries, currentDiaryId, updateDiary);
  
  // Long-term idea navigation
  const [showTrash, setShowTrash] = useState(false);
  const [highlightRange, setHighlightRange] = useState<{ from: number; to: number } | undefined>(undefined);

  // 左侧选中哪个文件夹：
  // - 刚打开时，选当前这篇日记所在的文件夹（没有就选最新建的那个）；只选这一次。
  // - 之后完全听他的：选了「所有日记」就一直是所有日记，改名、新建文件夹都不会把选中状态挪走。
  // - 只有选中的文件夹被删掉了，才退回「所有日记」。
  const folderSelectionInitializedRef = useRef(false);
  useEffect(() => {
    if (!folders || folders.length === 0) return;
    const timer = window.setTimeout(() => {
      if (!folderSelectionInitializedRef.current) {
        folderSelectionInitializedRef.current = true;
        const currentFolderId = currentDiary?.folderId;
        const initial = currentFolderId && folders.some((folder) => folder.id === currentFolderId)
          ? currentFolderId
          : latestFolderId;
        setSelectedFolderId((prev) => prev ?? initial ?? null);
        return;
      }
      setSelectedFolderId((prev) => (prev && !folders.some((folder) => folder.id === prev) ? null : prev));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [folders, latestFolderId, currentDiary?.folderId]);

  // 移动端相关状态
  const [isMobile, setIsMobile] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'editor' | 'diaryList'>('editor');

  const handleSelectDiary = useCallback((
    diaryId: string,
    options?: {
      highlightRange?: { from: number; to: number };
    },
  ) => {
    setHighlightRange(options?.highlightRange);
    setCurrentDiaryId(diaryId);
  }, [setCurrentDiaryId]);

  const openExportModal = useCallback((initialType: 'current' | 'all' = 'all') => {
    setExportModalInitialType(initialType);
    setIsExportModalOpen(true);
  }, []);

  // 检测屏幕宽度变化
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    // 监听侧边栏打开事件
    const handleOpenSidebar = () => {
      setIsSidebarOpen(true);
    };

    // 初始化
    handleResize();

    window.addEventListener('resize', handleResize);
    window.addEventListener('openSidebar', handleOpenSidebar);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('openSidebar', handleOpenSidebar);
    };
  }, []);

  const handleRetrySync = useCallback(() => {
    void syncManager.processQueue((success, error) => {
      if (!success && error) {
        showToast(error);
      }
    }).then(() => pullDiariesFromCloud({ force: true }));
  }, [pullDiariesFromCloud]);

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      if (currentDiary && isLongTermMasterDiary(currentDiary)) return;
      if (currentDiaryId) {
        updateDiary(currentDiaryId, { title: newTitle });
      }
    },
    [currentDiary, currentDiaryId, updateDiary]
  );

  const handleContentChange = useCallback(
    (newContent: string) => {
      if (currentDiaryId) {
        updateDiary(currentDiaryId, { content: newContent });
      }
    },
    [currentDiaryId, updateDiary]
  );

  const handleCreateDiary = (day?: number) => {
    const targetDay = atNoon(day ?? Date.now());

    // 补写时这一天已经有日记就打开它，不再新建第二篇。正常新建（不传日期）不动这个规则。
    if (day !== undefined) {
      const existing = diaries.find((diary) => (
        !isSystemDiary(diary) && isSameDay(diaryDay(diary).getTime(), targetDay)
      ));
      if (existing) {
        handleSelectDiary(existing.id);
        showToast(t('A diary already exists for that day. Opened it.'));
        return;
      }
    }

    const plan = planMonthFolder(folders, targetDay);
    const options = day === undefined
      ? undefined
      : {
          createdAt: targetDay,
          // 补已经过完的日子时只留流水账；选的是今天就跟正常新建一样。
          skipTodayPlan: targetDay < startOfDay(Date.now()),
        };

    if (plan.kind === 'none') {
      createDiary(selectedFolderId, options);
      return;
    }
    const folderId = plan.kind === 'existing' ? plan.folderId : createFolder(plan.name, plan.parentId).id;
    createDiary(folderId, options);
    // 切到那个月份文件夹，刚建的日记就在中间列表里，不会像被藏起来一样。
    setSelectedFolderId(folderId);
  };

  // 模板日记不在列表里，打开它之前记下正在看的那篇，点「完成」时回去。
  const templateReturnIdRef = useRef<string | null>(null);
  // 恢复默认是在同一篇里整体换正文，编辑器按 key 重建才能显示新内容。
  const [templateEditorVersion, setTemplateEditorVersion] = useState(0);

  const handleOpenTemplateDiary = useCallback(() => {
    if (currentDiaryId !== TEMPLATE_DIARY_ID) {
      templateReturnIdRef.current = currentDiaryId;
    }
    setCurrentDiaryId(TEMPLATE_DIARY_ID);
    if (isMobile) {
      setCurrentView('editor');
    }
  }, [currentDiaryId, isMobile, setCurrentDiaryId]);

  const handleFinishTemplateDiary = useCallback(() => {
    const returnId = templateReturnIdRef.current;
    templateReturnIdRef.current = null;
    const candidates = allDiaries.filter((diary) => !isSystemDiary(diary));
    if (returnId && allDiaries.some((diary) => diary.id === returnId && !diary.isTemplateDiary)) {
      setCurrentDiaryId(returnId);
      return;
    }
    const latest = [...candidates].sort((a, b) => b.createdAt - a.createdAt)[0];
    setCurrentDiaryId(latest ? latest.id : null);
  }, [allDiaries, setCurrentDiaryId]);

  const handleResetTemplateDiary = useCallback(() => {
    if (!window.confirm(t('Restore the default template? Your changes to the template will be lost. Diaries you have already written stay the same.'))) {
      return;
    }
    updateDiary(TEMPLATE_DIARY_ID, {
      title: DEFAULT_TEMPLATE_DIARY_TITLE,
      content: DEFAULT_TEMPLATE_DIARY_CONTENT,
    });
    setTemplateEditorVersion((version) => version + 1);
  }, [updateDiary]);

  // 每篇日记顶部的「长期在做」从这篇文档里读，点它就跳过来改。
  const longTermDiary = useMemo(() => allDiaries.find(isLongTermMasterDiary), [allDiaries]);
  const handleOpenLongTermDiary = useCallback(() => {
    if (longTermDiary) handleSelectDiary(longTermDiary.id);
  }, [handleSelectDiary, longTermDiary]);

  const canMoveDiaryToFolder = useCallback((id: string) => {
    const target = allDiaries.find((diary) => diary.id === id);
    return !target || !isSystemDiary(target);
  }, [allDiaries]);

  const handleCreateFolder = (name: string, parentId: string | null) => {
    createFolder(name, parentId);
    scheduleMajorLocalBackup(500);
  };

  // 恢复的日记回到它原来的文件夹。直接打开它、左侧切到那个文件夹，
  // 不然正看着别的文件夹时，恢复完列表里看不到，像是没恢复成功。
  const handleRestoreDiary = (id: string) => {
    const restored = restoreDiary(id);
    if (!restored) return;
    setSelectedFolderId(restored.folderId ?? null);
    setCurrentDiaryId(restored.id);
    const folderName = folders.find((folder) => folder.id === restored.folderId)?.name;
    showToast(
      folderName
        ? `已恢复「${restored.title || t('Untitled')}」，放回了「${folderName}」`
        : `已恢复「${restored.title || t('Untitled')}」`,
      'success',
    );
  };

  // 删文件夹会在存储里清掉里面日记的归属，日记列表的状态也要跟着刷新。
  const handleDeleteFolder = (id: string) => {
    deleteFolder(id);
    reloadDiariesFromStorage();
  };

  const handleUpdateFolder = (id: string, name: string) => {
    updateFolder(id, { name });
    scheduleMajorLocalBackup(500);
  };

  const visibleDiaries = useMemo(
    () => diaries.filter((diary) => !diary.isTemplateDiary),
    [diaries]
  );

  const diaryContent = currentDiary?.content ?? '';
  const wordCount = getDiaryWordCount(diaryContent);
  const taskCarryoverSuggestion = getTaskCarryoverSuggestion(allDiaries, currentDiary);

  // 最近一次挪移的现场，撤销时用。只在挪进去的那篇日记上显示撤销条，关掉或刷新后不再能撤销。
  const [lastCarryover, setLastCarryover] = useState<{
    targetId: string;
    sourceId: string;
    tasks: CarryoverTask[];
    sourceBefore: string;
    sourceAfter: string;
    signature: string;
  } | null>(null);

  const handleAcceptTaskCarryover = useCallback(() => {
    if (!currentDiary || !taskCarryoverSuggestion) return;

    const carried = stampCarriedTasks(taskCarryoverSuggestion.tasks);
    const nextContent = insertCarryoverTasksIntoContent(currentDiary.content, carried);
    const nextSourceContent = removeCarryoverTasksFromContent(
      taskCarryoverSuggestion.sourceDiary.content,
      taskCarryoverSuggestion.tasks,
    );
    updateDiary(currentDiary.id, { content: nextContent });
    if (nextSourceContent !== taskCarryoverSuggestion.sourceDiary.content) {
      updateDiary(taskCarryoverSuggestion.sourceDiary.id, { content: nextSourceContent });
    }
    dismissTaskCarryover(taskCarryoverSuggestion.signature);
    setLastCarryover({
      targetId: currentDiary.id,
      sourceId: taskCarryoverSuggestion.sourceDiary.id,
      tasks: carried,
      sourceBefore: taskCarryoverSuggestion.sourceDiary.content,
      sourceAfter: nextSourceContent,
      signature: taskCarryoverSuggestion.signature,
    });
    forceCarryoverRefresh((value) => value + 1);
    scheduleMajorLocalBackup(500);
  }, [currentDiary, scheduleMajorLocalBackup, taskCarryoverSuggestion, updateDiary]);

  // 撤销时把挪过来的条目带着它们现在的样子送回原日记：挪过去之后改的字、勾选、
  // 加的子项都不丢。挪完之后在这篇里新写的其他内容也不受影响。
  const handleUndoTaskCarryover = useCallback(() => {
    if (!lastCarryover) return;
    const target = allDiaries.find((diary) => diary.id === lastCarryover.targetId);
    const source = allDiaries.find((diary) => diary.id === lastCarryover.sourceId);
    if (!target) {
      setLastCarryover(null);
      return;
    }

    const carryIds = lastCarryover.tasks.map((task) => task.carryId).filter((id): id is string => Boolean(id));
    const { content: nextTarget, items } = takeCarriedItemsFromContent(target.content, carryIds);
    if (items.length > 0) updateDiary(target.id, { content: nextTarget });

    if (source && items.length > 0) {
      // 条目一个都没动过、原日记也没动过，就原样换回挪之前的原日记，位置也回到原处。
      // 否则把条目现在的版本补回原日记的「今日计划」，被他删掉的那几条不再补回。
      const untouched = items.length === lastCarryover.tasks.length && items.every((item) => {
        const original = lastCarryover.tasks.find((task) => task.carryId === item.carryId);
        return original ? isSameTaskContent(original.html, item.html) : false;
      });
      const nextSource = untouched && source.content === lastCarryover.sourceAfter
        ? lastCarryover.sourceBefore
        : insertCarryoverTasksIntoContent(source.content, items.map((item) => ({ id: item.carryId, text: '', html: item.html })));
      if (nextSource !== source.content) updateDiary(source.id, { content: nextSource });
    }

    undismissTaskCarryover(lastCarryover.signature);
    setLastCarryover(null);
    forceCarryoverRefresh((value) => value + 1);
    scheduleMajorLocalBackup(500);
  }, [allDiaries, lastCarryover, scheduleMajorLocalBackup, updateDiary]);

  const handleDismissTaskCarryover = useCallback(() => {
    if (!taskCarryoverSuggestion) return;
    dismissTaskCarryover(taskCarryoverSuggestion.signature);
    forceCarryoverRefresh((value) => value + 1);
  }, [taskCarryoverSuggestion]);

  const handleOpenTaskCarryoverSource = useCallback(() => {
    if (!taskCarryoverSuggestion) return;
    handleSelectDiary(taskCarryoverSuggestion.sourceDiary.id);
    setSelectedFolderId(null);
    if (isMobile) {
      setCurrentView('editor');
    }
  }, [handleSelectDiary, isMobile, taskCarryoverSuggestion]);

  const handleLogout = async () => {
    try {
      await runMajorLocalBackup();
      await signOut();
      showToast(t('Logged out successfully'));
    } catch (err) {
      showToast(getErrorMessage(err) || t('Sign out failed.'));
    }
  };

  return (
    <div className="h-full">
      {import.meta.env.PROD ? <Analytics /> : null}
      {/* 手机上侧栏打开时不显示，免得挡住侧栏底部的登录按钮。 */}
      <CloudLoginReminder hidden={isMobile && isSidebarOpen} />
      <DesktopStoreWarning />
      {/* 桌面端布局 */}
      {!isMobile && (
        <div className="flex h-full">
          <DesktopLeftSidebar
            isPinned={isLeftSidebarPinned}
            isExpanded={isLeftSidebarExpanded}
            folders={folders}
            trashCount={trashedDiaries.length}
            onOpenTrash={() => setShowTrash(true)}
            selectedFolderId={selectedFolderId}
            showCloudStatus={isConfigured}
            userEmail={user?.email ?? null}
            onSignIn={requestSignIn}
            onExpandChange={setIsLeftSidebarExpanded}
            onPinnedChange={setIsLeftSidebarPinned}
            onCreateFolder={handleCreateFolder}
            onUpdateFolder={handleUpdateFolder}
            onDeleteFolder={handleDeleteFolder}
            onMoveDiary={moveDiary}
            canMoveDiary={canMoveDiaryToFolder}
            onSelectFolder={setSelectedFolderId}
            onRetrySync={handleRetrySync}
            onOpenSettings={() => setIsSettingsOpen(true)}
            theme={theme}
            onToggleTheme={onToggleTheme}
          />

          {/* 中间日记列表 - 毛玻璃材质 */}
          {!isDiaryListCollapsed && (
            <div className="w-80 flex-shrink-0">
              <DiaryList
                diaries={visibleDiaries}
                currentDiaryId={currentDiaryId}
                onSelectDiary={handleSelectDiary}
                onCreateDiary={handleCreateDiary}
                onDeleteDiary={deleteDiary}
                onMoveDiary={moveDiary}
                searchQuery={searchQuery}
                onSearch={searchDiaries}
                selectedFolderId={selectedFolderId}
                folders={folders}
              />
            </div>
          )}

          {/* 日记列表折叠手柄 */}
          <button
            onClick={toggleDiaryListCollapsed}
            className="group flex w-4 flex-shrink-0 items-center justify-center border-l transition-colors"
            style={{ borderColor: 'var(--glimmer-border)', background: 'transparent' }}
            title={isDiaryListCollapsed ? t('Expand diary list') : t('Collapse diary list')}
            aria-label={isDiaryListCollapsed ? t('Expand diary list') : t('Collapse diary list')}
          >
            {isDiaryListCollapsed ? (
              <ChevronRight size={13} strokeWidth={2} className="text-primary-300 transition-colors group-hover:text-primary-600" />
            ) : (
              <ChevronLeft size={13} strokeWidth={2} className="text-primary-300 transition-colors group-hover:text-primary-600" />
            )}
          </button>

          {/* 右侧编辑器区域 - 毛玻璃材质 */}
          <div className="glimmer-panel flex-1 flex min-w-0 border-l">
            <div className="flex min-w-0 flex-1 flex-col">
            {currentDiary ? (
              <>
                <DiaryHeader
                  diary={currentDiary}
                  wordCount={wordCount}
                  onTitleChange={handleTitleChange}
                  onExport={() => openExportModal('current')}
                  onFinishTemplate={handleFinishTemplateDiary}
                  onResetTemplate={handleResetTemplateDiary}
                />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  {longTermDiary && !isSystemDiary(currentDiary) ? (
                    <LongTermFocusStrip
                      sourceHtml={longTermDiary.content}
                      onOpenSource={handleOpenLongTermDiary}
                    />
                  ) : null}
                  <DayCalendarStrip diary={currentDiary} />
                  {lastCarryover && lastCarryover.targetId === currentDiary.id ? (
                    <CarryoverUndoStrip
                      count={lastCarryover.tasks.length}
                      onUndo={handleUndoTaskCarryover}
                      onClose={() => setLastCarryover(null)}
                    />
                  ) : null}
                  {taskCarryoverSuggestion ? (
                    <TaskCarryoverPrompt
                      suggestion={taskCarryoverSuggestion}
                      targetDate={diaryDay(currentDiary).getTime()}
                      onAccept={handleAcceptTaskCarryover}
                      onDismiss={handleDismissTaskCarryover}
                      onOpenSource={handleOpenTaskCarryoverSource}
                    />
                  ) : null}
                  <div className="min-h-0 flex-1">
                    {/* key 换日记就重建编辑器：撤销栈属于某一篇日记，不能跨篇共享，
                        否则 Ctrl+Z 会把上一篇的正文搬进来。 */}
                    <Editor
                      key={currentDiary.isTemplateDiary ? `${currentDiary.id}:${templateEditorVersion}` : currentDiary.id}
                      content={diaryContent}
                      onChange={handleContentChange}
                      editable={true}
                      highlightRange={highlightRange}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="glimmer-empty-view flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-apple-xl bg-primary-100 mb-6">
                    <BookOpen size={40} className="text-primary-400" strokeWidth={1.25} />
                  </div>
                  <p className="text-xl font-semibold text-primary-900 mb-2 tracking-tight">{t('No diary selected')}</p>
                  <p className="text-sm text-primary-500 mb-6">
                    {t('Select a diary from the list or create a new one')}
                  </p>
                    <div className="flex gap-3 justify-center">
                      <button
                        onClick={() => setIsImportModalOpen(true)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-b from-semantic-success to-green-600 text-white rounded-apple font-medium shadow-apple hover:shadow-apple-lg transition-all duration-200 active:scale-[0.97]"
                        title={t('Import files (JSON/MD/HTML/TXT/DOCX/PDF)')}
                        aria-label={t('Import files')}
                      >
                        <Upload size={18} strokeWidth={1.75} />
                        {t('Import')}
                      </button>
                      <button
                        onClick={() => openExportModal('all')}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-b from-accent-500 to-accent-600 text-white rounded-apple font-medium shadow-apple hover:shadow-apple-lg transition-all duration-200 active:scale-[0.97]"
                        title={t('Export all diaries')}
                        aria-label={t('Export all diaries')}
                      >
                        <Download size={18} strokeWidth={1.75} />
                        {t('Export All Diaries')}
                      </button>
                    </div>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      {/* 移动端布局 */}
      {isMobile && (
        <div className="h-full flex flex-col">
          {/* 移动端导航栏 */}
          <div className="glimmer-panel-header sticky top-0 z-50 backdrop-blur-sm border-b px-4 py-3 flex items-center justify-between">
            {currentView === 'editor' ? (
              <button
                onClick={() => setCurrentView('diaryList')}
                className="p-2 rounded-lg text-primary-600 hover:bg-primary-50 transition-colors"
                aria-label={t('Open diary list')}
              >
                <Menu size={20} />
              </button>
            ) : (
              <button
                onClick={() => setCurrentView('editor')}
                className="p-2 rounded-lg text-primary-600 hover:bg-primary-50 transition-colors"
                aria-label={t('Back to editor')}
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <h1 className="text-lg font-semibold text-primary-900">{t('Glimmer')}</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={onToggleTheme}
                className="p-2 rounded-lg text-primary-600 hover:bg-primary-50 transition-colors"
                title={theme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode')}
                aria-label={theme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode')}
              >
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 rounded-lg text-primary-600 hover:bg-primary-50 transition-colors"
                title={t('Settings')}
                aria-label={t('Settings')}
              >
                <Settings size={20} />
              </button>
            </div>
          </div>

          {/* 主内容区 */}
          <div className="flex-1 overflow-auto">
            {currentView === 'editor' ? (
              <div className="glimmer-panel min-h-full flex flex-col">
                {currentDiary ? (
                  <>
                    <DiaryHeader
                      diary={currentDiary}
                      wordCount={wordCount}
                      isMobile
                      onTitleChange={handleTitleChange}
                      onExport={() => openExportModal('current')}
                      onFinishTemplate={handleFinishTemplateDiary}
                      onResetTemplate={handleResetTemplateDiary}
                    />
                    
                    {/* 编辑器内容：手机上标题、提示条和正文在外层一起滚，见 Editor 的 scrollWithPage */}
                    <div className="flex flex-1 flex-col">
                      {longTermDiary && !isSystemDiary(currentDiary) ? (
                        <LongTermFocusStrip
                          sourceHtml={longTermDiary.content}
                          onOpenSource={handleOpenLongTermDiary}
                        />
                      ) : null}
                      <DayCalendarStrip diary={currentDiary} />
                      {lastCarryover && lastCarryover.targetId === currentDiary.id ? (
                        <CarryoverUndoStrip
                          count={lastCarryover.tasks.length}
                          onUndo={handleUndoTaskCarryover}
                          onClose={() => setLastCarryover(null)}
                        />
                      ) : null}
                      {taskCarryoverSuggestion ? (
                        <TaskCarryoverPrompt
                          suggestion={taskCarryoverSuggestion}
                          targetDate={diaryDay(currentDiary).getTime()}
                          onAccept={handleAcceptTaskCarryover}
                          onDismiss={handleDismissTaskCarryover}
                          onOpenSource={handleOpenTaskCarryoverSource}
                        />
                      ) : null}
                      <div className="flex-1">
                        <Editor
                          key={currentDiary.isTemplateDiary ? `${currentDiary.id}:${templateEditorVersion}` : currentDiary.id}
                          content={diaryContent}
                          onChange={handleContentChange}
                          editable={true}
                          scrollWithPage
                        />
                      </div>
                    </div>
                    
                  </>
                ) : (
                  <div className="glimmer-empty-view flex-1 flex flex-col items-center justify-center p-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-apple-lg bg-primary-100 mb-4">
                      <BookOpen size={32} className="text-primary-400" strokeWidth={1.25} />
                    </div>
                    <p className="text-lg font-semibold text-primary-900 mb-2 text-center">{t('No diary selected')}</p>
                    <p className="text-sm text-primary-500 mb-6 text-center">
                      {t('Select a diary from the list or create a new one')}
                    </p>
                    <div className="flex flex-col gap-3 w-full max-w-sm">
                      <button
                        onClick={() => setIsImportModalOpen(true)}
                        className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-b from-semantic-success to-green-600 text-white rounded-apple font-medium shadow-apple hover:shadow-apple-lg transition-all duration-200 active:scale-[0.97] w-full"
                      >
                        <Upload size={18} strokeWidth={1.75} />
                        {t('Import')}
                      </button>
                      <button
                        onClick={() => openExportModal('all')}
                        className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-b from-accent-500 to-accent-600 text-white rounded-apple font-medium shadow-apple hover:shadow-apple-lg transition-all duration-200 active:scale-[0.97] w-full"
                      >
                        <Download size={18} strokeWidth={1.75} />
                        {t('Export All Diaries')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col">

                
                {/* 日记列表内容 */}
                <div className="flex-1 overflow-auto">
                  <DiaryList
                    diaries={visibleDiaries}
                    currentDiaryId={currentDiaryId}
                    onSelectDiary={(id) => {
                      handleSelectDiary(id);
                      setCurrentView('editor');
                    }}
                    onCreateDiary={handleCreateDiary}
                    onDeleteDiary={deleteDiary}
                    onMoveDiary={moveDiary}
                    searchQuery={searchQuery}
                    onSearch={searchDiaries}
                    selectedFolderId={selectedFolderId}
                    folders={folders}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 移动端侧边栏 */}
      {isMobile && isSidebarOpen && (
        <div className="fixed inset-0 z-50">
          {/* 遮罩层 */}
          <div 
            className="absolute inset-0 bg-black/30"
            onClick={() => setIsSidebarOpen(false)}
          />
          
          {/* 侧边栏内容 */}
          <div className="glimmer-panel absolute left-0 top-0 bottom-0 w-64 backdrop-blur-sm border-r flex flex-col">
            {/* 侧边栏头部 */}
            <div className="glimmer-panel-header p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-primary-900">{t('Menu')}</h3>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-1.5 rounded-lg text-primary-600 hover:bg-primary-50 transition-colors"
                aria-label={t('Close')}
              >
                <X size={18} />
              </button>
            </div>
            
            {/* 侧边栏内容 */}
            <div className="min-h-0 flex-1 overflow-auto">
              <FolderTree
                folders={folders}
                onCreateFolder={handleCreateFolder}
                onUpdateFolder={handleUpdateFolder}
                onDeleteFolder={handleDeleteFolder}
                onMoveDiary={moveDiary}
                canMoveDiary={canMoveDiaryToFolder}
                selectedFolderId={selectedFolderId}
                trashCount={trashedDiaries.length}
                onOpenTrash={() => setShowTrash(true)}
                onSelectFolder={(id) => {
                  setSelectedFolderId(id);
                  setIsSidebarOpen(false);
                }}
              />
            </div>
            
            {/* 侧边栏底部 - 云同步状态 */}
            {isConfigured && (
              <div className="border-t p-3" style={{ borderColor: 'var(--glimmer-border)' }}>
                <CloudSyncStatus
                  userEmail={user?.email ?? null}
                  onRetry={handleRetrySync}
                  onSignIn={requestSignIn}
                />
              </div>
            )}
          </div>
        </div>
      )}

      <TrashModal
        isOpen={showTrash}
        onClose={() => setShowTrash(false)}
        trashedDiaries={trashedDiaries}
        liveDiaries={allDiaries}
        retentionDays={trashRetentionDays}
        onRestore={handleRestoreDiary}
        onPurge={purgeDiary}
        onEmpty={emptyTrash}
        onDelete={deleteDiary}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        diaries={visibleDiaries}
        currentDiary={currentDiary}
        initialExportType={exportModalInitialType}
      />

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportDiaries={(d, opts) => {
          importDiaries(d, opts);
          window.setTimeout(() => {
            void runMajorLocalBackup();
          }, 1000);
        }}
        onImportFolders={(f, opts) => {
          importFolders(f, opts);
          window.setTimeout(() => {
            void runMajorLocalBackup();
          }, 1000);
        }}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onImport={() => setIsImportModalOpen(true)}
        onExport={() => openExportModal('all')}
        onRetrySync={handleRetrySync}
        onLogout={handleLogout}
        onOpenTemplate={handleOpenTemplateDiary}
      />

      <ToastHost />
      <DesktopUpdateNotice />
    </div>
  );
};

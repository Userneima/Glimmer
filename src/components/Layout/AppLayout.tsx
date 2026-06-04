import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Analytics } from "@vercel/analytics/react";
import { useDiaries } from '../../hooks/useDiaries';
import { useFolders } from '../../hooks/useFolders';
import { useLocalBackup } from '../../hooks/useLocalBackup';
import { FolderTree } from '../Sidebar/FolderTree';
import { DiaryList } from '../Sidebar/DiaryList';
import { Editor } from '../Editor/Editor';
import { DiaryHeader } from '../Editor/DiaryHeader';
import { TableOfContents } from '../Editor/TableOfContents';
import { TaskCarryoverPrompt } from '../Editor/TaskCarryoverPrompt';
import { ResizablePanel } from '../UI/ResizablePanel';
import { ExportModal } from '../UI/ExportModal';
import { ImportModal } from '../UI/ImportModal';
import { SettingsModal } from '../UI/SettingsModal';
import { DesktopUpdateNotice } from '../UI/DesktopUpdateNotice';
import { BookOpen, Settings, Lock, LockOpen, List, FileText, Menu, X, ChevronLeft, Upload, Download, Moon, Sun } from 'lucide-react';
import { TaskList } from '../Sidebar/TaskList';
import { ToastHost } from '../UI/ToastHost';
import { getDiaryWordCount } from '../../utils/text';
import { CloudSyncStatus } from '../UI/CloudSyncStatus';
import { useAuth } from '../../context/useAuth';
import { showToast, getErrorMessage } from '../../utils/toast';
import { syncManager } from '../../utils/syncManager';
import { ReturnToLongTermIdeasPanel } from '../LongTermIdea/ReturnToLongTermIdeasPanel';
import { LongTermIdeasDrawer } from '../LongTermIdea/LongTermIdeasDrawer';
import { TEMPLATE_DIARY_ID } from '../../types';
import { preloadAppleReminders } from '../../hooks/useAppleReminders';
import { applyEditorHeadingSettings } from '../../utils/editorHeadingSettings';
import { isLongTermMasterDiary, isSystemDiary } from '../../utils/diarySystem';
import {
  dismissTaskCarryover,
  getTaskCarryoverSuggestion,
  insertCarryoverTasksIntoContent,
  markCarryoverTasksAsCarried,
} from '../../utils/diaryTaskCarryover';
import { DesktopLeftSidebar, type LeftPanelView } from './DesktopLeftSidebar';
import { useReviewDataSync } from '../../hooks/useReviewDataSync';

import { t } from '../../i18n';

type AppLayoutProps = {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

export const AppLayout: React.FC<AppLayoutProps> = ({ theme, onToggleTheme }) => {
  const { user, signOut, isConfigured } = useAuth();
  const activeUserId = user?.id ?? null;
  const {
    diaries,
    allDiaries,
    currentDiary,
    currentDiaryId,
    searchQuery,
    createDiary,
    updateDiary,
    deleteDiary,
    moveDiary,
    setCurrentDiaryId,
    searchDiaries,
    importDiaries,
    pullDiariesFromCloud,
  } = useDiaries();

  const { folders, createFolder, updateFolder, deleteFolder, importFolders } = useFolders();
  useReviewDataSync(activeUserId, isConfigured);

  useEffect(() => {
    applyEditorHeadingSettings();
  }, []);

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
  const [leftPanelView, setLeftPanelView] = useState<LeftPanelView>('folders');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLeftSidebarExpanded, setIsLeftSidebarExpanded] = useState(false);
  const [isLeftSidebarPinned, setIsLeftSidebarPinned] = useState(false);
  const [showTableOfContents, ] = useState(false);
  const [isTocPinned, setIsTocPinned] = useState(false);
  const clampTocWidth = useCallback((value: number) => Math.max(200, Math.min(600, value)), []);
  const [tocPanelWidth, setTocPanelWidth] = useState(() => {
    try {
      const stored = Number(localStorage.getItem('toc-panel-width'));
      return Number.isFinite(stored) ? clampTocWidth(stored) : 288;
    } catch (err) {
      console.warn('Failed to read TOC width', err);
      return 288;
    }
  });
  const [isTocHovering, setIsTocHovering] = useState(false);
  const [hasTaskListModalOpen, setHasTaskListModalOpen] = useState(false);
  const [, forceCarryoverRefresh] = useState(0);
  const { runMajorLocalBackup, scheduleMajorLocalBackup } = useLocalBackup(activeUserId);
  
  // Long-term idea navigation
  const [navigatingFromIdea, setNavigatingFromIdea] = useState(false);
  const [highlightRange, setHighlightRange] = useState<{ from: number; to: number } | undefined>(undefined);
  const [isLongTermIdeasOpen, setIsLongTermIdeasOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void preloadAppleReminders({
        userId: activeUserId,
        syncCloud: isConfigured,
      });
    }, 800);

    return () => window.clearTimeout(timer);
  }, [activeUserId, isConfigured]);

  // Auto-select latest folder when folders change
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (folders && folders.length > 0 && latestFolderId) {
        // Only update if currently not selected or no folder is selected
        setSelectedFolderId(prev => {
          // If no folder is selected or the previous selection is no longer valid, select the latest
          if (!prev || !folders.some(f => f.id === prev)) {
            return latestFolderId;
          }
          return prev;
        });
      } else if (folders && folders.length === 0) {
        setSelectedFolderId(null);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [folders, latestFolderId]);

  // 移动端相关状态
  const [isMobile, setIsMobile] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'editor' | 'diaryList'>('editor');

  const handleSelectDiary = useCallback((
    diaryId: string,
    options?: {
      highlightRange?: { from: number; to: number };
      fromLongTermIdea?: boolean;
    },
  ) => {
    setHighlightRange(options?.highlightRange);
    setNavigatingFromIdea(Boolean(options?.fromLongTermIdea));
    setCurrentDiaryId(diaryId);
  }, [setCurrentDiaryId]);

  const openExportModal = useCallback((initialType: 'current' | 'all' = 'all') => {
    setExportModalInitialType(initialType);
    setIsExportModalOpen(true);
  }, []);

  const handleReturnToLongTermIdeas = useCallback(() => {
    setNavigatingFromIdea(false);
    setHighlightRange(undefined);
    setIsLongTermIdeasOpen(true);
  }, []);

  const handleNavigateToDiary = useCallback((diaryId: string, position?: { from: number; to: number }) => {
    setIsLongTermIdeasOpen(false);
    handleSelectDiary(diaryId, {
      highlightRange: position,
      fromLongTermIdea: true,
    });
    if (isMobile) {
      setCurrentView('editor');
    }
    // 清除筛选状态，确保日记列表能正常显示
    setSelectedFolderId(null);
  }, [handleSelectDiary, isMobile]);

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

  const handleCreateDiary = () => {
    createDiary(selectedFolderId);
  };

  const handleOpenTemplateDiary = useCallback(() => {
    setCurrentDiaryId(TEMPLATE_DIARY_ID);
    setSelectedFolderId(null);
    if (isMobile) {
      setCurrentView('editor');
    }
  }, [isMobile, setCurrentDiaryId]);

  const canMoveDiaryToFolder = useCallback((id: string) => {
    const target = allDiaries.find((diary) => diary.id === id);
    return !target || !isSystemDiary(target);
  }, [allDiaries]);

  const handleCreateFolder = (name: string, parentId: string | null) => {
    createFolder(name, parentId);
    scheduleMajorLocalBackup(500);
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

  const handleAcceptTaskCarryover = useCallback(() => {
    if (!currentDiary || !taskCarryoverSuggestion) return;
    const nextContent = insertCarryoverTasksIntoContent(currentDiary.content, taskCarryoverSuggestion.tasks);
    const nextSourceContent = markCarryoverTasksAsCarried(
      taskCarryoverSuggestion.sourceDiary.content,
      taskCarryoverSuggestion.tasks,
      currentDiary.id,
    );
    updateDiary(currentDiary.id, { content: nextContent });
    if (nextSourceContent !== taskCarryoverSuggestion.sourceDiary.content) {
      updateDiary(taskCarryoverSuggestion.sourceDiary.id, { content: nextSourceContent });
    }
    dismissTaskCarryover(taskCarryoverSuggestion.signature);
    forceCarryoverRefresh((value) => value + 1);
    scheduleMajorLocalBackup(500);
  }, [currentDiary, scheduleMajorLocalBackup, taskCarryoverSuggestion, updateDiary]);

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

  const handleSwitchAccount = async () => {
    try {
      await runMajorLocalBackup();
      await signOut();
      showToast(t('Switched account. Please sign in again.'));
    } catch (err) {
      showToast(getErrorMessage(err) || t('Sign out failed.'));
    }
  };

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
    <div className="h-screen">
      {import.meta.env.PROD ? <Analytics /> : null}
      {/* 桌面端布局 */}
      {!isMobile && (
        <div className="flex h-full">
          <DesktopLeftSidebar
            isPinned={isLeftSidebarPinned}
            isExpanded={isLeftSidebarExpanded}
            hasTaskListModalOpen={hasTaskListModalOpen}
            leftPanelView={leftPanelView}
            folders={folders}
            selectedFolderId={selectedFolderId}
            showCloudStatus={isConfigured && Boolean(user)}
            userEmail={user?.email ?? null}
            onExpandChange={setIsLeftSidebarExpanded}
            onPinnedChange={setIsLeftSidebarPinned}
            onPanelViewChange={setLeftPanelView}
            onCreateFolder={handleCreateFolder}
            onUpdateFolder={handleUpdateFolder}
            onDeleteFolder={deleteFolder}
            onMoveDiary={moveDiary}
            canMoveDiary={canMoveDiaryToFolder}
            onSelectFolder={setSelectedFolderId}
            onTaskModalStateChange={setHasTaskListModalOpen}
            onRetrySync={handleRetrySync}
            onSwitchAccount={handleSwitchAccount}
            onLogout={handleLogout}
            onOpenLongTermIdeas={() => setIsLongTermIdeasOpen(true)}
            onOpenTemplateDiary={handleOpenTemplateDiary}
            onOpenSettings={() => setIsSettingsOpen(true)}
            theme={theme}
            onToggleTheme={onToggleTheme}
          />

          {/* 中间日记列表 - 毛玻璃材质 */}
          <div className="w-80 flex-shrink-0">
            <DiaryList
              diaries={visibleDiaries}
              currentDiaryId={currentDiaryId}
              onSelectDiary={handleSelectDiary}
              onCreateDiary={handleCreateDiary}
              onOpenTemplateDiary={handleOpenTemplateDiary}
              onDeleteDiary={deleteDiary}
              onMoveDiary={moveDiary}
              searchQuery={searchQuery}
              onSearch={searchDiaries}
              selectedFolderId={selectedFolderId}
              folders={folders}
            />
          </div>

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
                />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  {navigatingFromIdea && (
                    <ReturnToLongTermIdeasPanel onReturn={handleReturnToLongTermIdeas} />
                  )}
                  {taskCarryoverSuggestion ? (
                    <TaskCarryoverPrompt
                      suggestion={taskCarryoverSuggestion}
                      targetDate={currentDiary.createdAt}
                      onAccept={handleAcceptTaskCarryover}
                      onDismiss={handleDismissTaskCarryover}
                      onOpenSource={handleOpenTaskCarryoverSource}
                    />
                  ) : null}
                  <div className="min-h-0 flex-1">
                    <Editor
                      content={diaryContent}
                      onChange={handleContentChange}
                      editable={true}
                      highlightRange={highlightRange}
                      contentRightPanel={
                        showTableOfContents ? (
                          isTocPinned ? (
                            <ResizablePanel
                              isOpen={true}
                              side="right"
                              minWidth={200}
                              maxWidth={600}
                              defaultWidth={tocPanelWidth}
                              persistKey="toc-panel-width"
                              onWidthChange={(value) => setTocPanelWidth(clampTocWidth(value))}
                              className="glimmer-panel border-l"
                            >
                              <TableOfContents
                                content={diaryContent}
                                headerAction={
                                  <div className="flex items-center gap-1">
                                    <button
                                      className="p-1.5 rounded-apple-sm hover:bg-primary-100 text-primary-500 hover:text-primary-900 transition-all duration-200 active:scale-95"
                                      title="文档"
                                      aria-label="文档"
                                    >
                                      <FileText size={14} strokeWidth={1.75} />
                                    </button>
                                    <button
                                      onClick={() => setIsTocPinned(false)}
                                      className="p-1.5 rounded-apple-sm hover:bg-primary-100 text-primary-500 hover:text-primary-900 transition-all duration-200 active:scale-95"
                                      title={t('Unpin')}
                                      aria-label={t('Unpin')}
                                    >
                                      <Lock size={14} strokeWidth={1.75} />
                                    </button>
                                  </div>
                                }
                              />
                            </ResizablePanel>
                          ) : (
                            <div
                              className="glimmer-panel group h-full flex-shrink-0 relative border-l transition-all duration-300 ease-apple overflow-hidden"
                              style={{ width: isTocHovering ? `${tocPanelWidth}px` : '40px' }}
                              onMouseEnter={() => setIsTocHovering(true)}
                              onMouseLeave={() => setIsTocHovering(false)}
                            >
                              {/* Collapsed state: show icon */}
                              <div className="absolute inset-0 flex items-center justify-center opacity-100 group-hover:opacity-0 pointer-events-none transition-opacity">
                                <List size={16} className="text-primary-400" strokeWidth={1.75} />
                              </div>

                              {/* Expanded state on hover */}
                              <div className="h-full opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                <TableOfContents
                                  content={diaryContent}
                                  headerAction={
                                  <div className="flex items-center gap-1">
                                    <button
                                      className="p-1.5 rounded-apple-sm hover:bg-primary-100 text-primary-500 hover:text-primary-900 transition-all duration-200 active:scale-95"
                                      title="文档"
                                      aria-label="文档"
                                    >
                                      <FileText size={14} strokeWidth={1.75} />
                                    </button>
                                    <button
                                      onClick={() => setIsTocPinned(true)}
                                      className="p-1.5 rounded-apple-sm hover:bg-primary-100 text-primary-500 hover:text-primary-900 transition-all duration-200 active:scale-95"
                                      title={t('Pin')}
                                      aria-label={t('Pin')}
                                    >
                                      <LockOpen size={14} strokeWidth={1.75} />
                                    </button>
                                  </div>
                                }
                                />
                              </div>
                            </div>
                          )
                        ) : null
                      }
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
                onClick={() => setIsLongTermIdeasOpen(true)}
                className="p-2 rounded-lg text-primary-600 hover:bg-primary-50 transition-colors"
                title={t('Long-term Ideas')}
                aria-label={t('Long-term Ideas')}
              >
                <BookOpen size={20} />
              </button>
              <button
                onClick={handleOpenTemplateDiary}
                className="p-2 rounded-lg text-primary-600 hover:bg-primary-50 transition-colors"
                title={t('Diary Template')}
                aria-label={t('Diary Template')}
              >
                <FileText size={20} />
              </button>
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
              <div className="glimmer-panel h-full flex flex-col">
                {currentDiary ? (
                  <>
                    <DiaryHeader
                      diary={currentDiary}
                      wordCount={wordCount}
                      isMobile
                      onTitleChange={handleTitleChange}
                      onExport={() => openExportModal('current')}
                    />
                    
                    {/* 编辑器内容 */}
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                      {taskCarryoverSuggestion ? (
                        <TaskCarryoverPrompt
                          suggestion={taskCarryoverSuggestion}
                          targetDate={currentDiary.createdAt}
                          onAccept={handleAcceptTaskCarryover}
                          onDismiss={handleDismissTaskCarryover}
                          onOpenSource={handleOpenTaskCarryoverSource}
                        />
                      ) : null}
                      <div className="min-h-0 flex-1">
                        <Editor
                          content={diaryContent}
                          onChange={handleContentChange}
                          editable={true}
                        />
                      </div>
                    </div>
                    
                    {/* 移动端目录面板 */}
                    {isMobile && showTableOfContents && (
                      <div className="glimmer-panel fixed bottom-0 left-0 right-0 backdrop-blur-sm border-t shadow-lg z-40">
                        <div className="max-h-64 overflow-auto">
                          <TableOfContents 
                    content={diaryContent} 
                    headerAction={
                      <button
                        className="p-1.5 rounded-apple-sm hover:bg-primary-100 text-primary-500 hover:text-primary-900 transition-all duration-200 active:scale-95"
                        title="文档"
                        aria-label="文档"
                      >
                        <FileText size={14} strokeWidth={1.75} />
                      </button>
                    }
                  />
                        </div>
                      </div>
                    )}
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
                    onOpenTemplateDiary={handleOpenTemplateDiary}
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
            
            {/* 侧边栏选项卡 */}
            <div className="flex border-b" style={{ borderColor: 'var(--glimmer-border)' }}>
              <button
                onClick={() => setLeftPanelView('folders')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  leftPanelView === 'folders' ? 'text-accent-500 border-b-2 border-accent-500' : 'text-primary-600 hover:bg-primary-50'
                }`}
              >
                {t('Folders')}
              </button>
              <button
                onClick={() => setLeftPanelView('tasks')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  leftPanelView === 'tasks' ? 'text-accent-500 border-b-2 border-accent-500' : 'text-primary-600 hover:bg-primary-50'
                }`}
              >
                {t('Tasks')}
              </button>
            </div>
            
            {/* 侧边栏内容 */}
            <div className="min-h-0 flex-1 overflow-auto">
              {leftPanelView === 'folders' ? (
                <FolderTree
                  folders={folders}
                  onCreateFolder={handleCreateFolder}
                  onUpdateFolder={handleUpdateFolder}
                  onDeleteFolder={deleteFolder}
                  onMoveDiary={moveDiary}
                  canMoveDiary={canMoveDiaryToFolder}
                  selectedFolderId={selectedFolderId}
                  onSelectFolder={(id) => {
                    setSelectedFolderId(id);
                    setIsSidebarOpen(false);
                  }}
                />
              ) : (
                <TaskList onModalStateChange={setHasTaskListModalOpen} />
              )}
            </div>
            
            {/* 侧边栏底部 - 云同步状态 */}
            {isConfigured && user && (
              <div className="border-t p-3" style={{ borderColor: 'var(--glimmer-border)' }}>
                <CloudSyncStatus
                  userEmail={user.email ?? null}
                  onRetry={handleRetrySync}
                  onSwitchAccount={handleSwitchAccount}
                  onLogout={handleLogout}
                />
              </div>
            )}
          </div>
        </div>
      )}

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
      />

      <ToastHost />
      <DesktopUpdateNotice />

      <LongTermIdeasDrawer
        isOpen={isLongTermIdeasOpen}
        onClose={() => setIsLongTermIdeasOpen(false)}
        onNavigateToDiary={handleNavigateToDiary}
      />
    </div>
  );
};

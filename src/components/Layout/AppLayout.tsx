import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Analytics } from "@vercel/analytics/react";
import { useDiaries } from '../../hooks/useDiaries';
import { useFolders } from '../../hooks/useFolders';
import { FolderTree } from '../Sidebar/FolderTree';
import { TagPanel } from '../Sidebar/TagPanel';
import { CalendarView } from '../Sidebar/CalendarView';
import { DiaryList } from '../Sidebar/DiaryList';
import { Editor } from '../Editor/Editor';
import { TableOfContents } from '../Editor/TableOfContents';
import { ResizablePanel } from '../UI/ResizablePanel';
import { Input } from '../UI/Input';
import { TagInput } from '../UI/TagInput';
import { ExportModal } from '../UI/ExportModal';
import { ImportModal } from '../UI/ImportModal';
import { SettingsModal } from '../UI/SettingsModal';
import { BookOpen, Tag as TagIcon, Folder as FolderIcon, Calendar as CalendarIcon, Settings, ListChecks, Lock, LockOpen, List, FileText, Menu, X, ChevronLeft, Upload, Download, Zap } from 'lucide-react';
import { TaskList } from '../Sidebar/TaskList';
import { AnalysisPanel } from '../Analysis/AnalysisPanel';
import { ToastHost } from '../UI/ToastHost';
import { getDiaryWordCount } from '../../utils/text';
import { CloudSyncStatus } from '../UI/CloudSyncStatus';
import { useAuth } from '../../context/useAuth';
import { showToast, getErrorMessage } from '../../utils/toast';
import { syncManager } from '../../utils/syncManager';
import { ReturnToLongTermIdeasPanel } from '../LongTermIdea/ReturnToLongTermIdeasPanel';

import { t } from '../../i18n';

export const AppLayout: React.FC = () => {
  const { user, signOut, isConfigured } = useAuth();
  const {
    diaries,
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
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [leftPanelView, setLeftPanelView] = useState<'folders' | 'tags' | 'calendar' | 'tasks'>('folders');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
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
  
  // Long-term idea navigation
  const [navigatingFromIdea, setNavigatingFromIdea] = useState(false);
  const [highlightRange, setHighlightRange] = useState<{ from: number; to: number } | undefined>(undefined);
  
  // Auto-select latest folder when folders change
  useEffect(() => {
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
  }, [folders, latestFolderId]);
  
  // 移动端相关状态
  const [isMobile, setIsMobile] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'editor' | 'diaryList'>('editor');

  const handleReturnToLongTermIdeas = useCallback(() => {
    setNavigatingFromIdea(false);
    setHighlightRange(undefined);
    setCurrentDiaryId(null); // Return to diary list
  }, []);

  const handleNavigateToDiary = useCallback((diaryId: string, position?: { from: number; to: number }) => {
    setNavigatingFromIdea(true);
    if (position) {
      setHighlightRange(position);
    }
    setCurrentDiaryId(diaryId);
    if (isMobile) {
      setCurrentView('editor');
    }
    // 清除筛选状态，确保日记列表能正常显示
    setSelectedFolderId(null);
  }, [isMobile]);

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
    });
  }, []);

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      if (currentDiaryId) {
        updateDiary(currentDiaryId, { title: newTitle });
      }
    },
    [currentDiaryId, updateDiary]
  );

  const handleContentChange = useCallback(
    (newContent: string) => {
      if (currentDiaryId) {
        updateDiary(currentDiaryId, { content: newContent });
      }
    },
    [currentDiaryId, updateDiary]
  );

  const handleAppendToDiary = useCallback(
    (content: string) => {
      if (currentDiaryId && currentDiary) {
        const newContent = currentDiary.content + content;
        updateDiary(currentDiaryId, { content: newContent });
      }
    },
    [currentDiaryId, currentDiary, updateDiary]
  );

  const handleCreateDiary = () => {
    createDiary(selectedFolderId);
  };

  const handleCreateDiaryForDate = (date: Date) => {
    const newDiary = createDiary(selectedFolderId);
    // 更新日记的创建时间为选中的日期
    if (newDiary) {
      updateDiary(newDiary.id, {
        createdAt: date.getTime(),
        updatedAt: date.getTime()
      });
    }
    return newDiary;
  };

  const handleChangeDiaryDate = (id: string, date: Date) => {
    updateDiary(id, { createdAt: date.getTime() });
  }; 

  const handleCreateFolder = (name: string, parentId: string | null) => {
    createFolder(name, parentId);
  };

  const handleUpdateFolder = (id: string, name: string) => {
    updateFolder(id, { name });
  };

  const handleSelectTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleClearTags = () => {
    setSelectedTags([]);
  };

  const handleRenameTag = (oldTag: string, newTag: string) => {
    diaries.forEach(diary => {
      if (diary.tags.includes(oldTag)) {
        const newTags = diary.tags.map(t => (t === oldTag ? newTag : t));
        updateDiary(diary.id, { tags: newTags });
      }
    });
  };

  const handleMergeTags = (tags: string[], newTag: string) => {
    diaries.forEach(diary => {
      const hasTags = diary.tags.some(t => tags.includes(t));
      if (hasTags) {
        const newTags = [...diary.tags.filter(t => !tags.includes(t)), newTag];
        updateDiary(diary.id, { tags: Array.from(new Set(newTags)) });
      }
    });
  };

  const handleDeleteTag = (tag: string) => {
    diaries.forEach(diary => {
      if (diary.tags.includes(tag)) {
        const newTags = diary.tags.filter(t => t !== tag);
        updateDiary(diary.id, { tags: newTags });
      }
    });
  };

  // Filter diaries by selected tags
  const filteredDiaries = selectedTags.length > 0
    ? diaries.filter(diary => selectedTags.every(tag => diary.tags.includes(tag)))
    : diaries;

  const diaryTitle = currentDiary?.title ?? '';
  const diaryContent = currentDiary?.content ?? '';

  const wordCount = getDiaryWordCount(diaryContent);

  const handleSwitchAccount = async () => {
    try {
      await signOut();
      showToast(t('Switched account. Please sign in again.'));
    } catch (err) {
      showToast(getErrorMessage(err) || t('Sign out failed.'));
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      showToast(t('Logged out successfully'));
    } catch (err) {
      showToast(getErrorMessage(err) || t('Sign out failed.'));
    }
  };

  return (
    <div className="h-screen">
      <Analytics />
      {/* 桌面端布局 */}
      {!isMobile && (
        <div className="flex h-full">
          {/* 左侧边栏 - 毛玻璃材质 */}
          <div
            className={`flex-shrink-0 flex flex-col overflow-hidden border-r border-slate-200/60 ${
              isLeftSidebarPinned || isLeftSidebarExpanded ? 'w-64' : 'w-12'
            }`}
            style={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.75)',
              transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              willChange: 'width'
            }}
            onMouseEnter={() => !isLeftSidebarPinned && setIsLeftSidebarExpanded(true)}
            onMouseLeave={() => {
              // Don't collapse if focus is on a modal element or if TaskList has modal open
              if (hasTaskListModalOpen) return;
              const activeElement = document.activeElement;
              const isModalFocused = activeElement && (activeElement.closest('.fixed') || activeElement.closest('[role="dialog"]'));
              if (!isLeftSidebarPinned && !isModalFocused) {
                setIsLeftSidebarExpanded(false);
              }
            }}
          >
            {/* Sidebar Header Tabs - 强调色 */}
            <div
            className={`flex ${
                isLeftSidebarPinned || isLeftSidebarExpanded
                  ? 'flex-row'
                  : 'flex-col'
              }`}
            style={{ backgroundColor: 'rgba(241, 245, 249, 0.9)' }}
            >
              <button
                onClick={() => setLeftPanelView('folders')}
                className={`flex items-center justify-center gap-1.5 font-medium transition-all duration-200 ease-apple ${
                  isLeftSidebarPinned || isLeftSidebarExpanded
                    ? 'flex-1 py-3 text-xs whitespace-nowrap'
                    : 'flex-col w-12 h-12'
                }`}
                style={{
                  color: leftPanelView === 'folders' ? 'var(--aurora-accent)' : 'var(--aurora-secondary)',
                  backgroundColor: leftPanelView === 'folders' ? 'rgba(14, 165, 233, 0.15)' : 'transparent',
                  borderBottom: leftPanelView === 'folders' && (isLeftSidebarPinned || isLeftSidebarExpanded) ? '2px solid var(--aurora-accent)' : 'none',
                  borderRight: leftPanelView === 'folders' && !(isLeftSidebarPinned || isLeftSidebarExpanded) ? '2px solid var(--aurora-accent)' : 'none'
                }}
              >
                <FolderIcon size={14} />
                {(isLeftSidebarPinned || isLeftSidebarExpanded) && t('Folders')}
              </button>
              <button
                onClick={() => setLeftPanelView('tags')}
                className={`flex items-center justify-center gap-1.5 font-medium transition-all duration-200 ease-apple ${
                  isLeftSidebarPinned || isLeftSidebarExpanded
                    ? 'flex-1 py-3 text-xs whitespace-nowrap'
                    : 'flex-col w-12 h-12'
                }`}
                style={{
                  color: leftPanelView === 'tags' ? 'var(--aurora-accent)' : 'var(--aurora-secondary)',
                  backgroundColor: leftPanelView === 'tags' ? 'rgba(14, 165, 233, 0.15)' : 'transparent',
                  borderBottom: leftPanelView === 'tags' && (isLeftSidebarPinned || isLeftSidebarExpanded) ? '2px solid var(--aurora-accent)' : 'none',
                  borderRight: leftPanelView === 'tags' && !(isLeftSidebarPinned || isLeftSidebarExpanded) ? '2px solid var(--aurora-accent)' : 'none'
                }}
              >
                <TagIcon size={14} />
                {(isLeftSidebarPinned || isLeftSidebarExpanded) && t('Tags')}
              </button>
              <button
                onClick={() => setLeftPanelView('calendar')}
                className={`flex items-center justify-center gap-1.5 font-medium transition-all duration-200 ease-apple ${
                  isLeftSidebarPinned || isLeftSidebarExpanded
                    ? 'flex-1 py-3 text-xs whitespace-nowrap'
                    : 'flex-col w-12 h-12'
                }`}
                style={{
                  color: leftPanelView === 'calendar' ? 'var(--aurora-accent)' : 'var(--aurora-secondary)',
                  backgroundColor: leftPanelView === 'calendar' ? 'rgba(14, 165, 233, 0.15)' : 'transparent',
                  borderBottom: leftPanelView === 'calendar' && (isLeftSidebarPinned || isLeftSidebarExpanded) ? '2px solid var(--aurora-accent)' : 'none',
                  borderRight: leftPanelView === 'calendar' && !(isLeftSidebarPinned || isLeftSidebarExpanded) ? '2px solid var(--aurora-accent)' : 'none'
                }}
              >
                <CalendarIcon size={14} />
                {(isLeftSidebarPinned || isLeftSidebarExpanded) && t('Calendar')}
              </button>
              <button
                onClick={() => setLeftPanelView('tasks')}
                className={`flex items-center justify-center gap-1.5 font-medium transition-all duration-200 ease-apple ${
                  isLeftSidebarPinned || isLeftSidebarExpanded
                    ? 'flex-1 py-3 text-xs whitespace-nowrap'
                    : 'flex-col w-12 h-12'
                }`}
                style={{
                  color: leftPanelView === 'tasks' ? 'var(--aurora-accent)' : 'var(--aurora-secondary)',
                  backgroundColor: leftPanelView === 'tasks' ? 'rgba(14, 165, 233, 0.15)' : 'transparent',
                  borderBottom: leftPanelView === 'tasks' && (isLeftSidebarPinned || isLeftSidebarExpanded) ? '2px solid var(--aurora-accent)' : 'none',
                  borderRight: leftPanelView === 'tasks' && !(isLeftSidebarPinned || isLeftSidebarExpanded) ? '2px solid var(--aurora-accent)' : 'none'
                }}
              >
                <ListChecks size={14} />
                {(isLeftSidebarPinned || isLeftSidebarExpanded) && t('Tasks')}
              </button>
            </div>

            {/* Sidebar Content */}
            {(isLeftSidebarPinned || isLeftSidebarExpanded) && (
              <div className="flex-1 overflow-hidden">
                {leftPanelView === 'folders' ? (
                  <FolderTree
                    folders={folders}
                    onCreateFolder={handleCreateFolder}
                    onUpdateFolder={handleUpdateFolder}
                    onDeleteFolder={deleteFolder}
                    onMoveDiary={moveDiary}
                    selectedFolderId={selectedFolderId}
                    onSelectFolder={setSelectedFolderId}
                  />
                ) : leftPanelView === 'tags' ? (
                  <TagPanel
                    diaries={diaries}
                    selectedTags={selectedTags}
                    onSelectTag={handleSelectTag}
                    onClearTags={handleClearTags}
                    onRenameTag={handleRenameTag}
                    onMergeTags={handleMergeTags}
                    onDeleteTag={handleDeleteTag}
                  />
                ) : leftPanelView === 'calendar' ? (
                  <CalendarView
                    diaries={diaries}
                    onSelectDiary={setCurrentDiaryId}
                    onCreateDiary={handleCreateDiaryForDate}
                    onChangeDiaryDate={handleChangeDiaryDate}
                  />
                ) : (
                  <TaskList onModalStateChange={setHasTaskListModalOpen} />
                )}
              </div>
            )}

            {/* Bottom Section - Always Visible */}
            <div
              className={`mt-auto ${
                isLeftSidebarPinned || isLeftSidebarExpanded
                  ? 'border-t border-slate-200/40'
                  : ''
              }`}
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)' }}
            >
              {/* Cloud Sync Status - Expanded View */}
              {(isLeftSidebarPinned || isLeftSidebarExpanded) && isConfigured && user && (
                <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(200, 210, 220, 0.3)' }}>
                  <CloudSyncStatus
                    userEmail={user.email ?? null}
                    onRetry={handleRetrySync}
                    onSwitchAccount={handleSwitchAccount}
                    onLogout={handleLogout}
                  />
                </div>
              )}
              
              {/* Cloud Sync Status and Settings - Collapsed View (Icon Only) */}
              {!(isLeftSidebarPinned || isLeftSidebarExpanded) && (
                <div className="flex flex-col items-center gap-2 py-2">
                  {isConfigured && user && (
                    <CloudSyncStatus
                      userEmail={user.email ?? null}
                      onRetry={handleRetrySync}
                      onSwitchAccount={handleSwitchAccount}
                      onLogout={handleLogout}
                      compact
                    />
                  )}
                  <button
                    onClick={() => setIsSettingsOpen(true)}
                    className="p-2 rounded-xl transition-all duration-200 active:scale-95"
                    style={{
                      color: 'var(--aurora-secondary)',
                      backgroundColor: 'transparent'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(14, 165, 233, 0.15)';
                      e.currentTarget.style.color = 'var(--aurora-accent)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--aurora-secondary)';
                    }}
                    title={t('Settings')}
                  >
                    <Settings size={16} />
                  </button>
                </div>
              )}
              
              {/* Settings and Pin/Unpin Buttons - 弥散光强调色 */}
              {(isLeftSidebarPinned || isLeftSidebarExpanded) && (
                <div className="p-2 flex justify-between items-center">
                  <button
                    onClick={() => setIsSettingsOpen(true)}
                    className="p-2 rounded-xl transition-all duration-200 active:scale-95"
                    style={{
                      color: 'var(--aurora-secondary)',
                      backgroundColor: 'transparent'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(14, 165, 233, 0.15)';
                      e.currentTarget.style.color = 'var(--aurora-accent)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--aurora-secondary)';
                    }}
                    title={t('Settings')}
                  >
                    <Settings size={16} />
                  </button>
                  <button
                    onClick={() => setIsLeftSidebarPinned(!isLeftSidebarPinned)}
                    className="p-2 rounded-xl transition-all duration-200 active:scale-95"
                    style={{
                      color: 'var(--aurora-secondary)',
                      backgroundColor: 'transparent'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(14, 165, 233, 0.15)';
                      e.currentTarget.style.color = 'var(--aurora-accent)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--aurora-secondary)';
                    }}
                    title={isLeftSidebarPinned ? t('Unpin') : t('Pin')}
                  >
                    {isLeftSidebarPinned ? <Lock size={16} /> : <LockOpen size={16} />}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 中间日记列表 - 毛玻璃材质 */}
          <div className="w-80 flex-shrink-0">
            <DiaryList
              diaries={filteredDiaries}
              currentDiaryId={currentDiaryId}
              onSelectDiary={setCurrentDiaryId}
              onCreateDiary={handleCreateDiary}
              onDeleteDiary={deleteDiary}
              onMoveDiary={moveDiary}
              searchQuery={searchQuery}
              onSearch={searchDiaries}
              selectedFolderId={selectedFolderId}
              folders={folders}
              onNavigateToDiary={handleNavigateToDiary}
            />
          </div>

          {/* 右侧编辑器区域 - 毛玻璃材质 */}
          <div className="flex-1 flex flex-col border-l border-slate-200/60" style={{ backgroundColor: 'rgba(255, 255, 255, 0.75)' }}>
            {currentDiary ? (
              <>
                {/* 编辑器头部 */}
                <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)', borderBottom: '1px solid rgba(200, 210, 220, 0.4)' }} className="flex flex-col gap-4 p-4">
                  {/* 标题和 AI 分析按钮 */}
                  <div className="flex items-center justify-between">
                    <Input
                      value={diaryTitle}
                      onChange={(e) => handleTitleChange(e.target.value)}
                      placeholder={t('Untitled')}
                      variant="minimal"
                      className="text-2xl font-bold border-none focus:ring-0 px-0 flex-1 min-w-0 tracking-tight"
                      style={{ color: 'var(--aurora-primary)' }}
                    />
                    <button
                      onClick={() => setIsAnalysisOpen(true)}
                      className="p-2.5 text-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 active:scale-95 ml-3 z-10"
                      style={{ background: 'linear-gradient(135deg, var(--aurora-accent) 0%, var(--aurora-accent-alt) 100%)' }}
                      title={t('Analyze')}
                    >
                      <Zap size={18} strokeWidth={2} />
                    </button>
                  </div>
                  
                  {/* 标签输入框 */}
                  <div className="flex items-center">
                    <div className="flex-1">
                      <TagInput
                        tags={currentDiary.tags}
                        onChange={(tags) => updateDiary(currentDiaryId!, { tags })}
                        placeholder={t('Add tags (press Enter)...')}
                      />
                    </div>
                  </div>
                  
                  {/* 字数和最后编辑时间 */}
                  <div className="flex items-center gap-4 text-sm text-primary-500">
                    <span className="text-primary-300">•</span>
                    <span className="font-medium">{wordCount} {t('words')}</span>
                    <span className="text-primary-300">•</span>
                    <span>
                      {t('Last edited:')} {new Date(currentDiary.updatedAt).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden flex flex-col">
                  {navigatingFromIdea && (
                    <ReturnToLongTermIdeasPanel onReturn={handleReturnToLongTermIdeas} />
                  )}
                  <Editor
                    content={diaryContent}
                    onChange={handleContentChange}
                    editable={true}
                    diaryId={currentDiaryId || undefined}
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
                            className="border-l border-slate-200/60 bg-gradient-to-l from-slate-50/90 to-white/80"
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
                            className="group h-full flex-shrink-0 relative border-l border-slate-200/60 bg-gradient-to-l from-slate-100/60 to-blue-50/40 transition-all duration-300 ease-apple overflow-hidden"
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
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
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
                        onClick={() => setIsExportModalOpen(true)}
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
      )}

      {/* 移动端布局 */}
      {isMobile && (
        <div className="h-full flex flex-col">
          {/* 移动端导航栏 */}
          <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-slate-200 px-4 py-3 flex items-center justify-between">
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
            <h1 className="text-lg font-semibold text-primary-900">{t('Diary App')}</h1>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-lg text-primary-600 hover:bg-primary-50 transition-colors"
              title={t('Settings')}
              aria-label={t('Settings')}
            >
              <Settings size={20} />
            </button>
          </div>

          {/* 主内容区 */}
          <div className="flex-1 overflow-auto">
            {currentView === 'editor' ? (
              <div className="h-full flex flex-col" style={{ backgroundColor: 'rgba(255, 255, 255, 0.75)' }}>
                {currentDiary ? (
                  <>
                    {/* 编辑器头部 - 移动端优化 */}
                    <div className="p-4" style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)', borderBottom: '1px solid rgba(200, 210, 220, 0.4)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <Input
                          value={diaryTitle}
                          onChange={(e) => handleTitleChange(e.target.value)}
                          placeholder={t('Untitled')}
                          variant="minimal"
                          className="text-xl font-bold border-none focus:ring-0 px-0 flex-1"
                          style={{ color: 'var(--aurora-primary)' }}
                        />
                        <button
                          onClick={() => setIsAnalysisOpen(true)}
                          className="p-2 text-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 active:scale-95 ml-3"
                          style={{ background: 'linear-gradient(135deg, var(--aurora-accent) 0%, var(--aurora-accent-alt) 100%)' }}
                          title={t('Analyze')}
                        >
                          <Zap size={18} strokeWidth={2} />
                        </button>
                      </div>
                      <TagInput
                        tags={currentDiary.tags}
                        onChange={(tags) => updateDiary(currentDiaryId!, { tags })}
                        placeholder={t('Add tags...')}
                        className="mb-3"
                      />
                      <div className="flex items-center gap-3 text-sm text-primary-500 flex-wrap">
                        <span className="text-primary-300">•</span>
                        <span className="font-medium">{wordCount} {t('words')}</span>
                        <span className="text-primary-300">•</span>
                        <span className="truncate">
                          {t('Last edited:')} {new Date(currentDiary.updatedAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    
                    {/* 编辑器内容 */}
                    <div className="flex-1 overflow-auto">
                      <Editor
                        content={diaryContent}
                        onChange={handleContentChange}
                        editable={true}
                      />
                    </div>
                    
                    {/* 移动端目录面板 */}
                    {isMobile && showTableOfContents && (
                      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-slate-200 shadow-lg z-40">
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
                  <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
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
                        onClick={() => setIsExportModalOpen(true)}
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
                    diaries={filteredDiaries}
                    currentDiaryId={currentDiaryId}
                    onSelectDiary={(id) => {
                      setCurrentDiaryId(id);
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
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-white/95 backdrop-blur-sm border-r border-slate-200 flex flex-col">
            {/* 侧边栏头部 */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
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
            <div className="flex border-b border-slate-200">
              <button
                onClick={() => setLeftPanelView('folders')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  leftPanelView === 'folders' ? 'text-accent-500 border-b-2 border-accent-500' : 'text-primary-600 hover:bg-primary-50'
                }`}
              >
                {t('Folders')}
              </button>
              <button
                onClick={() => setLeftPanelView('tags')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  leftPanelView === 'tags' ? 'text-accent-500 border-b-2 border-accent-500' : 'text-primary-600 hover:bg-primary-50'
                }`}
              >
                {t('Tags')}
              </button>
              <button
                onClick={() => setLeftPanelView('calendar')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  leftPanelView === 'calendar' ? 'text-accent-500 border-b-2 border-accent-500' : 'text-primary-600 hover:bg-primary-50'
                }`}
              >
                {t('Calendar')}
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
            <div className="flex-1 overflow-auto">
              {leftPanelView === 'folders' ? (
                <FolderTree
                  folders={folders}
                  onCreateFolder={handleCreateFolder}
                  onUpdateFolder={handleUpdateFolder}
                  onDeleteFolder={deleteFolder}
                  onMoveDiary={moveDiary}
                  selectedFolderId={selectedFolderId}
                  onSelectFolder={(id) => {
                    setSelectedFolderId(id);
                    setIsSidebarOpen(false);
                  }}
                />
              ) : leftPanelView === 'tags' ? (
                <TagPanel
                  diaries={diaries}
                  selectedTags={selectedTags}
                  onSelectTag={handleSelectTag}
                  onClearTags={handleClearTags}
                  onRenameTag={handleRenameTag}
                  onMergeTags={handleMergeTags}
                  onDeleteTag={handleDeleteTag}
                />
              ) : leftPanelView === 'calendar' ? (
                <CalendarView
                  diaries={diaries}
                  onSelectDiary={(id) => {
                    setCurrentDiaryId(id);
                    setCurrentView('editor');
                    setIsSidebarOpen(false);
                  }}
                  onCreateDiary={(date) => {
                    const newDiary = handleCreateDiaryForDate(date);
                    if (newDiary) {
                      setCurrentDiaryId(newDiary.id);
                      setCurrentView('editor');
                      setIsSidebarOpen(false);
                    }
                  }}
                  onChangeDiaryDate={handleChangeDiaryDate}
                />
              ) : (
                <TaskList onModalStateChange={setHasTaskListModalOpen} />
              )}
            </div>
            
            {/* 侧边栏底部 - 云同步状态 */}
            {isConfigured && user && (
              <div className="border-t border-slate-200 p-3">
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

      {/* 模态框 */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        diaries={diaries}
        currentDiary={currentDiary}
      />

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportDiaries={(d, opts) => importDiaries(d, opts)}
        onImportFolders={(f, opts) => importFolders(f, opts)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onImport={() => setIsImportModalOpen(true)}
        onExport={() => setIsExportModalOpen(true)}
        onRetrySync={handleRetrySync}
      />

      <AnalysisPanel
        isOpen={isAnalysisOpen}
        diaryId={currentDiaryId}
        diaryContent={diaryContent}
        onClose={() => setIsAnalysisOpen(false)}
        onAppendToDiary={handleAppendToDiary}
        onUpdateDiary={updateDiary}
      />

      <ToastHost />
    </div>
  );
};

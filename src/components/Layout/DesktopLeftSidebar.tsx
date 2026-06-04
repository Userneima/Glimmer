import React from 'react';
import {
  BookOpen,
  FileText,
  Folder as FolderIcon,
  ListChecks,
  Lock,
  LockOpen,
  Moon,
  Settings,
  Sun,
} from 'lucide-react';
import type { Folder } from '../../types';
import { t } from '../../i18n';
import { FolderTree } from '../Sidebar/FolderTree';
import { TaskList } from '../Sidebar/TaskList';
import { CloudSyncStatus } from '../UI/CloudSyncStatus';

export type LeftPanelView = 'folders' | 'tasks';

type DesktopLeftSidebarProps = {
  isPinned: boolean;
  isExpanded: boolean;
  hasTaskListModalOpen: boolean;
  leftPanelView: LeftPanelView;
  folders: Folder[];
  selectedFolderId: string | null;
  showCloudStatus: boolean;
  userEmail: string | null;
  onExpandChange: (expanded: boolean) => void;
  onPinnedChange: (pinned: boolean) => void;
  onPanelViewChange: (view: LeftPanelView) => void;
  onCreateFolder: (name: string, parentId: string | null) => void;
  onUpdateFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveDiary: (diaryId: string, folderId: string | null) => void;
  canMoveDiary?: (diaryId: string) => boolean;
  onSelectFolder: (folderId: string | null) => void;
  onTaskModalStateChange: (hasModalOpen: boolean) => void;
  onRetrySync: () => void;
  onSwitchAccount: () => void;
  onLogout: () => void;
  onOpenLongTermIdeas: () => void;
  onOpenTemplateDiary: () => void;
  onOpenSettings: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

const sidebarTabs = [
  { key: 'folders', label: t('Folders'), icon: FolderIcon },
  { key: 'tasks', label: t('Tasks'), icon: ListChecks },
] as const;

const iconButtonStyle = {
  color: 'var(--aurora-secondary)',
  backgroundColor: 'transparent',
};

const handleIconEnter = (event: React.MouseEvent<HTMLButtonElement>) => {
  event.currentTarget.style.backgroundColor = 'var(--glimmer-surface-active)';
  event.currentTarget.style.color = 'var(--aurora-accent)';
};

const handleIconLeave = (event: React.MouseEvent<HTMLButtonElement>) => {
  event.currentTarget.style.backgroundColor = 'transparent';
  event.currentTarget.style.color = 'var(--aurora-secondary)';
};

export const DesktopLeftSidebar: React.FC<DesktopLeftSidebarProps> = ({
  isPinned,
  isExpanded,
  hasTaskListModalOpen,
  leftPanelView,
  folders,
  selectedFolderId,
  showCloudStatus,
  userEmail,
  onExpandChange,
  onPinnedChange,
  onPanelViewChange,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onMoveDiary,
  canMoveDiary,
  onSelectFolder,
  onTaskModalStateChange,
  onRetrySync,
  onSwitchAccount,
  onLogout,
  onOpenLongTermIdeas,
  onOpenTemplateDiary,
  onOpenSettings,
  theme,
  onToggleTheme,
}) => {
  const isOpen = isPinned || isExpanded;

  return (
    <div
      className={`glimmer-panel flex-shrink-0 flex flex-col overflow-hidden border-r ${
        isOpen ? 'w-64' : 'w-12'
      }`}
      style={{
        transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        willChange: 'width',
      }}
      onMouseEnter={() => !isPinned && onExpandChange(true)}
      onMouseLeave={() => {
        if (hasTaskListModalOpen) return;
        const activeElement = document.activeElement;
        const isModalFocused = activeElement && (activeElement.closest('.fixed') || activeElement.closest('[role="dialog"]'));
        if (!isPinned && !isModalFocused) {
          onExpandChange(false);
        }
      }}
    >
      <div
        className={`glimmer-panel-header ${isOpen ? 'px-3 py-3' : 'flex flex-col'}`}
      >
        {isOpen ? (
          <div className="grid grid-cols-2 gap-1">
            {sidebarTabs.map(({ key, label, icon: Icon }) => {
              const isActive = leftPanelView === key;
              return (
                <button
                  key={key}
                  onClick={() => onPanelViewChange(key)}
                  className={`flex h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium transition-all duration-200 ease-apple ${
                    isActive ? 'shadow-sm' : ''
                  }`}
                  style={{
                    color: isActive ? 'var(--aurora-accent)' : 'var(--aurora-secondary)',
                    backgroundColor: isActive ? 'var(--glimmer-surface-active)' : 'transparent',
                    boxShadow: isActive ? 'inset 0 -2px 0 var(--aurora-accent)' : 'none',
                  }}
                >
                  <Icon size={15} />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          sidebarTabs.map(({ key, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onPanelViewChange(key)}
              className="flex-col w-12 h-12 flex items-center justify-center gap-1.5 font-medium transition-all duration-200 ease-apple"
              style={{
                color: leftPanelView === key ? 'var(--aurora-accent)' : 'var(--aurora-secondary)',
                backgroundColor: leftPanelView === key ? 'var(--glimmer-surface-active)' : 'transparent',
                borderRight: leftPanelView === key ? '2px solid var(--aurora-accent)' : 'none',
              }}
            >
              <Icon size={14} />
            </button>
          ))
        )}
      </div>

      {isOpen && (
        <div className="min-h-0 flex-1 overflow-hidden">
          {leftPanelView === 'folders' ? (
            <FolderTree
              folders={folders}
              onCreateFolder={onCreateFolder}
              onUpdateFolder={onUpdateFolder}
              onDeleteFolder={onDeleteFolder}
              onMoveDiary={onMoveDiary}
              canMoveDiary={canMoveDiary}
              selectedFolderId={selectedFolderId}
              onSelectFolder={onSelectFolder}
            />
          ) : (
            <TaskList onModalStateChange={onTaskModalStateChange} />
          )}
        </div>
      )}

      <div
        className={`glimmer-panel-header mt-auto ${isOpen ? 'border-t' : ''}`}
      >
        {isOpen && showCloudStatus && (
          <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--glimmer-border)' }}>
            <CloudSyncStatus
              userEmail={userEmail}
              onRetry={onRetrySync}
              onSwitchAccount={onSwitchAccount}
              onLogout={onLogout}
            />
          </div>
        )}

        {!isOpen && (
          <div className="flex flex-col items-center gap-2 py-2">
            {showCloudStatus && (
              <CloudSyncStatus
                userEmail={userEmail}
                onRetry={onRetrySync}
                onSwitchAccount={onSwitchAccount}
                onLogout={onLogout}
                compact
              />
            )}
            <button
              onClick={onOpenLongTermIdeas}
              className="p-2 rounded-xl transition-all duration-200 active:scale-95"
              style={iconButtonStyle}
              onMouseEnter={handleIconEnter}
              onMouseLeave={handleIconLeave}
              title={t('Long-term Ideas')}
            >
              <BookOpen size={16} />
            </button>
            <button
              onClick={onOpenTemplateDiary}
              className="p-2 rounded-xl transition-all duration-200 active:scale-95"
              style={iconButtonStyle}
              onMouseEnter={handleIconEnter}
              onMouseLeave={handleIconLeave}
              title={t('Diary Template')}
            >
              <FileText size={16} />
            </button>
            <button
              onClick={onToggleTheme}
              className="p-2 rounded-xl transition-all duration-200 active:scale-95"
              style={iconButtonStyle}
              onMouseEnter={handleIconEnter}
              onMouseLeave={handleIconLeave}
              title={theme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode')}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-xl transition-all duration-200 active:scale-95"
              style={iconButtonStyle}
              onMouseEnter={handleIconEnter}
              onMouseLeave={handleIconLeave}
              title={t('Settings')}
            >
              <Settings size={16} />
            </button>
          </div>
        )}

        {isOpen && (
          <div className="p-2 flex justify-between items-center">
            <button
              onClick={onOpenLongTermIdeas}
              className="p-2 rounded-xl transition-all duration-200 active:scale-95"
              style={iconButtonStyle}
              onMouseEnter={handleIconEnter}
              onMouseLeave={handleIconLeave}
              title={t('Long-term Ideas')}
            >
              <BookOpen size={16} />
            </button>
            <button
              onClick={onOpenTemplateDiary}
              className="p-2 rounded-xl transition-all duration-200 active:scale-95"
              style={iconButtonStyle}
              onMouseEnter={handleIconEnter}
              onMouseLeave={handleIconLeave}
              title={t('Diary Template')}
            >
              <FileText size={16} />
            </button>
            <button
              onClick={onToggleTheme}
              className="p-2 rounded-xl transition-all duration-200 active:scale-95"
              style={iconButtonStyle}
              onMouseEnter={handleIconEnter}
              onMouseLeave={handleIconLeave}
              title={theme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode')}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-xl transition-all duration-200 active:scale-95"
              style={iconButtonStyle}
              onMouseEnter={handleIconEnter}
              onMouseLeave={handleIconLeave}
              title={t('Settings')}
            >
              <Settings size={16} />
            </button>
            <button
              onClick={() => onPinnedChange(!isPinned)}
              className="p-2 rounded-xl transition-all duration-200 active:scale-95"
              style={iconButtonStyle}
              onMouseEnter={handleIconEnter}
              onMouseLeave={handleIconLeave}
              title={isPinned ? t('Unpin') : t('Pin')}
            >
              {isPinned ? <Lock size={16} /> : <LockOpen size={16} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

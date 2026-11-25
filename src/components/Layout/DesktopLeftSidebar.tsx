import React from 'react';
import {
  Folder as FolderIcon,
  Lock,
  LockOpen,
  Moon,
  Settings,
  Sun,
} from 'lucide-react';
import type { Folder } from '../../types';
import { t } from '../../i18n';
import { FolderTree } from '../Sidebar/FolderTree';
import { CloudSyncStatus } from '../UI/CloudSyncStatus';

type DesktopLeftSidebarProps = {
  isPinned: boolean;
  isExpanded: boolean;
  folders: Folder[];
  selectedFolderId: string | null;
  trashCount: number;
  onOpenTrash: () => void;
  showCloudStatus: boolean;
  userEmail: string | null;
  onSignIn: () => void;
  onExpandChange: (expanded: boolean) => void;
  onPinnedChange: (pinned: boolean) => void;
  onCreateFolder: (name: string, parentId: string | null) => void;
  onUpdateFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveDiary: (diaryId: string, folderId: string | null) => void;
  canMoveDiary?: (diaryId: string) => boolean;
  onSelectFolder: (folderId: string | null) => void;
  onRetrySync: () => void;
  onOpenSettings: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

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
  folders,
  selectedFolderId,
  trashCount,
  onOpenTrash,
  showCloudStatus,
  userEmail,
  onSignIn,
  onExpandChange,
  onPinnedChange,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onMoveDiary,
  canMoveDiary,
  onSelectFolder,
  onRetrySync,
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
        const activeElement = document.activeElement;
        const isModalFocused = activeElement && (activeElement.closest('.fixed') || activeElement.closest('[role="dialog"]'));
        if (!isPinned && !isModalFocused) {
          onExpandChange(false);
        }
      }}
    >
      {/* 收起时留一个文件夹图标，提示这里能展开；展开后文件夹树自带标题，不再需要标签页。 */}
      {!isOpen && (
        <div className="glimmer-panel-header flex flex-col">
          <button
            onClick={() => onExpandChange(true)}
            className="w-12 h-12 flex items-center justify-center"
            style={{ color: 'var(--aurora-accent)' }}
            title={t('Folders')}
          >
            <FolderIcon size={14} />
          </button>
        </div>
      )}

      {isOpen && (
        <div className="min-h-0 flex-1 overflow-hidden">
          <FolderTree
            folders={folders}
            onCreateFolder={onCreateFolder}
            onUpdateFolder={onUpdateFolder}
            onDeleteFolder={onDeleteFolder}
            onMoveDiary={onMoveDiary}
            canMoveDiary={canMoveDiary}
            selectedFolderId={selectedFolderId}
            onSelectFolder={onSelectFolder}
            trashCount={trashCount}
            onOpenTrash={onOpenTrash}
          />
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
              onSignIn={onSignIn}
            />
          </div>
        )}

        {!isOpen && (
          <div className="flex flex-col items-center gap-2 py-2">
            {showCloudStatus && (
              <CloudSyncStatus
                userEmail={userEmail}
                onRetry={onRetrySync}
                onSignIn={onSignIn}
                compact
              />
            )}
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

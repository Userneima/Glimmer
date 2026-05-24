import React from 'react';
import {
  BookOpen,
  Calendar as CalendarIcon,
  FileText,
  Folder as FolderIcon,
  ListChecks,
  Lock,
  LockOpen,
  Settings,
  Tag as TagIcon,
} from 'lucide-react';
import type { Diary, Folder } from '../../types';
import type { DiaryTagMergeSuggestion } from '../../utils/diaryTags';
import { t } from '../../i18n';
import { CalendarView } from '../Sidebar/CalendarView';
import { FolderTree } from '../Sidebar/FolderTree';
import { TagPanel } from '../Sidebar/TagPanel';
import { TaskList } from '../Sidebar/TaskList';
import { CloudSyncStatus } from '../UI/CloudSyncStatus';

export type LeftPanelView = 'folders' | 'tags' | 'calendar' | 'tasks';

type DesktopLeftSidebarProps = {
  isPinned: boolean;
  isExpanded: boolean;
  hasTaskListModalOpen: boolean;
  leftPanelView: LeftPanelView;
  folders: Folder[];
  visibleDiaries: Diary[];
  selectedFolderId: string | null;
  selectedTags: string[];
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
  onSelectTag: (tag: string) => void;
  onClearTags: () => void;
  onRenameTag: (oldTag: string, newTag: string) => void;
  onMergeTags: (tags: string[], newTag: string) => void;
  onApplyTagMergeSuggestions: (suggestions: DiaryTagMergeSuggestion[]) => void;
  onDeleteTag: (tag: string) => void;
  onSelectDiary: (id: string) => void;
  onCreateDiary: (date: Date) => void;
  onChangeDiaryDate: (id: string, date: Date) => void;
  onTaskModalStateChange: (hasModalOpen: boolean) => void;
  onRetrySync: () => void;
  onSwitchAccount: () => void;
  onLogout: () => void;
  onOpenLongTermIdeas: () => void;
  onOpenTemplateDiary: () => void;
  onOpenSettings: () => void;
};

const sidebarTabs = [
  { key: 'folders', label: t('Folders'), icon: FolderIcon },
  { key: 'tags', label: t('Tags'), icon: TagIcon },
  { key: 'calendar', label: t('Calendar'), icon: CalendarIcon },
  { key: 'tasks', label: t('Tasks'), icon: ListChecks },
] as const;

const iconButtonStyle = {
  color: 'var(--aurora-secondary)',
  backgroundColor: 'transparent',
};

const handleIconEnter = (event: React.MouseEvent<HTMLButtonElement>) => {
  event.currentTarget.style.backgroundColor = 'rgba(14, 165, 233, 0.15)';
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
  visibleDiaries,
  selectedFolderId,
  selectedTags,
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
  onSelectTag,
  onClearTags,
  onRenameTag,
  onMergeTags,
  onApplyTagMergeSuggestions,
  onDeleteTag,
  onSelectDiary,
  onCreateDiary,
  onChangeDiaryDate,
  onTaskModalStateChange,
  onRetrySync,
  onSwitchAccount,
  onLogout,
  onOpenLongTermIdeas,
  onOpenTemplateDiary,
  onOpenSettings,
}) => {
  const isOpen = isPinned || isExpanded;

  return (
    <div
      className={`flex-shrink-0 flex flex-col overflow-hidden border-r border-slate-200/60 ${
        isOpen ? 'w-64' : 'w-12'
      }`}
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.75)',
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
        className={isOpen ? 'px-3 py-3' : 'flex flex-col'}
        style={{ backgroundColor: 'rgba(241, 245, 249, 0.72)' }}
      >
        {isOpen ? (
          <div className="grid grid-cols-4 gap-1">
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
                    backgroundColor: isActive ? 'rgba(14, 165, 233, 0.11)' : 'transparent',
                    boxShadow: isActive ? 'inset 0 -2px 0 rgba(14, 165, 233, 0.55)' : 'none',
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
                backgroundColor: leftPanelView === key ? 'rgba(14, 165, 233, 0.15)' : 'transparent',
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
          ) : leftPanelView === 'tags' ? (
            <TagPanel
              diaries={visibleDiaries}
              selectedTags={selectedTags}
              onSelectTag={onSelectTag}
              onClearTags={onClearTags}
              onRenameTag={onRenameTag}
              onMergeTags={onMergeTags}
              onApplyTagMergeSuggestions={onApplyTagMergeSuggestions}
              onDeleteTag={onDeleteTag}
            />
          ) : leftPanelView === 'calendar' ? (
            <CalendarView
              diaries={visibleDiaries}
              onSelectDiary={onSelectDiary}
              onCreateDiary={onCreateDiary}
              onChangeDiaryDate={onChangeDiaryDate}
            />
          ) : (
            <TaskList onModalStateChange={onTaskModalStateChange} />
          )}
        </div>
      )}

      <div
        className={`mt-auto ${isOpen ? 'border-t border-slate-200/40' : ''}`}
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)' }}
      >
        {isOpen && showCloudStatus && (
          <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(200, 210, 220, 0.3)' }}>
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

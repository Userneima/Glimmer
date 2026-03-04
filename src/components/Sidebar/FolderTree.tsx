import React, { useState, useMemo } from 'react';
import { Folder as FolderIcon, FolderPlus, Edit2, Trash2 } from 'lucide-react';
import type { Folder } from '../../types';
import { Button } from '../UI/Button';
import { Modal } from '../UI/Modal';
import { Input } from '../UI/Input';
import { t } from '../../i18n';
import { showToast } from '../../utils/toast';

interface FolderTreeProps {
  folders: Folder[];
  onCreateFolder: (name: string, parentId: string | null) => void;
  onUpdateFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveDiary: (diaryId: string, folderId: string | null) => void;
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
}

export const FolderTree: React.FC<FolderTreeProps> = ({
  folders,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onMoveDiary,
  selectedFolderId,
  onSelectFolder,
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  const getDraggedDiaryId = (e: React.DragEvent): string | null => {
    const diaryId = e.dataTransfer.getData('application/x-diary-id');
    return diaryId || null;
  };

  const handleDropToFolder = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    const diaryId = getDraggedDiaryId(e);
    if (!diaryId) {
      setDragOverTarget(null);
      return;
    }
    onMoveDiary(diaryId, folderId);
    showToast(t('Diary moved successfully'), 'success');
    setDragOverTarget(null);
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim(), null);
      setNewFolderName('');
      setIsCreateModalOpen(false);
    }
  };

  const handleEditFolder = () => {
    if (editingFolder && newFolderName.trim()) {
      onUpdateFolder(editingFolder.id, newFolderName.trim());
      setNewFolderName('');
      setEditingFolder(null);
      setIsEditModalOpen(false);
    }
  };

  const handleDeleteFolder = () => {
    if (deletingFolderId) {
      onDeleteFolder(deletingFolderId);
      setDeletingFolderId(null);
      setIsDeleteModalOpen(false);
    }
  };

  const openEditModal = (folder: Folder) => {
    setEditingFolder(folder);
    setNewFolderName(folder.name);
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (folderId: string) => {
    setDeletingFolderId(folderId);
    setIsDeleteModalOpen(true);
  };



  // Sort root folders by createdAt in descending order (latest first)
  const rootFolders = useMemo(() => {
    const root = folders.filter(f => !f.parentId);
    return root.sort((a, b) => {
      const createdAtDiff = b.createdAt - a.createdAt;
      if (createdAtDiff !== 0) return createdAtDiff;
      return b.id.localeCompare(a.id);
    });
  }, [folders]);

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'rgba(255, 255, 255, 0.75)' }}>
      {/* 标题区 - 毛玻璃风 */}
      <div className="p-4" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.2)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--aurora-primary)' }}>{t('Folders')}</h2>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="p-1.5 rounded-xl transition-all duration-200"
            style={{ color: 'var(--aurora-accent)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(14, 165, 233, 0.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            title={t('New Folder')}
          >
            <FolderPlus size={18} />
          </button>
        </div>
        {/* 全部日记按钮 - 毛玻璃卡片 */}
        <button
          onClick={() => onSelectFolder(null)}
          className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors duration-200 border border-slate-200/60 ${
            dragOverTarget === 'all' ? 'shadow-sm' : ''
          }`}
          style={{
            backgroundColor: selectedFolderId === null ? 'rgba(14, 165, 233, 0.15)' : 'rgba(255, 255, 255, 0.4)',
            color: selectedFolderId === null ? 'var(--aurora-accent)' : 'var(--aurora-primary)',
            borderColor: selectedFolderId === null ? 'var(--aurora-accent)' : 'rgba(255, 255, 255, 0.3)'
          }}
          onMouseEnter={(e) => {
            if (selectedFolderId !== null) {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
            }
          }}
          onMouseLeave={(e) => {
            if (selectedFolderId !== null) {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverTarget('all');
          }}
          onDragLeave={() => setDragOverTarget(null)}
          onDrop={(e) => handleDropToFolder(e, null)}
        >
          {t('All Diaries')}
        </button>
      </div>

      {/* 文件夹列表区 - 毛玻璃风 */}
      <div className="flex-1 overflow-y-auto p-3">
        {rootFolders.map(folder => (
          <div key={folder.id} className="mb-1.5">
            <div
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-colors duration-200 group border border-slate-200/60 ${
                dragOverTarget === folder.id ? 'shadow-sm' : ''
              }`}
              style={{
                backgroundColor: selectedFolderId === folder.id ? 'rgba(14, 165, 233, 0.15)' : 'rgba(255, 255, 255, 0.4)',
                color: selectedFolderId === folder.id ? 'var(--aurora-accent)' : 'var(--aurora-primary)',
                borderColor: selectedFolderId === folder.id ? 'var(--aurora-accent)' : 'rgba(255, 255, 255, 0.3)'
              }}
              onMouseEnter={(e) => {
                if (selectedFolderId !== folder.id) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedFolderId !== folder.id) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverTarget(folder.id);
              }}
              onDragLeave={() => setDragOverTarget(null)}
              onDrop={(e) => handleDropToFolder(e, folder.id)}
            >
              <div
                className="flex items-center flex-1"
                onClick={() => onSelectFolder(folder.id)}
              >
                <FolderIcon size={16} className="mr-2" />
                <span className="text-sm font-medium truncate">{folder.name}</span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditModal(folder);
                  }}
                  className="p-1.5 hover:bg-white/50 rounded-lg transition-all duration-200"
                  title={t('Edit')}
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openDeleteModal(folder.id);
                  }}
                  className="p-1.5 hover:bg-red-100/50 text-red-500 rounded-lg transition-all duration-200"
                  title={t('Delete')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setNewFolderName('');
        }}
        title={t('Create New Folder')}
      >
        <Input
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          placeholder={t('Folder name')}
          onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
          autoFocus
        />
        <div className="flex gap-2 mt-4">
          <Button onClick={handleCreateFolder} className="flex-1">
            {t('Create')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setIsCreateModalOpen(false);
              setNewFolderName('');
            }}
            className="flex-1"
          >
            {t('Cancel')}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingFolder(null);
          setNewFolderName('');
        }}
        title={t('Rename Folder')}
      >
        <Input
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          placeholder={t('Folder name')}
          onKeyPress={(e) => e.key === 'Enter' && handleEditFolder()}
          autoFocus
        />
        <div className="flex gap-2 mt-4">
          <Button onClick={handleEditFolder} className="flex-1">
            {t('Save')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setIsEditModalOpen(false);
              setEditingFolder(null);
              setNewFolderName('');
            }}
            className="flex-1"
          >
            {t('Cancel')}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeletingFolderId(null);
        }}
        title={t('Delete Folder')}
      >
        <p className="text-slate-600 mb-4 leading-relaxed">
          {t('Are you sure you want to delete this folder? Diaries in this folder will be moved to "All Diaries".')}
        </p>
        <div className="flex gap-2">
          <Button variant="danger" onClick={handleDeleteFolder} className="flex-1">
            {t('Delete')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setIsDeleteModalOpen(false);
              setDeletingFolderId(null);
            }}
            className="flex-1"
          >
            {t('Cancel')}
          </Button>
        </div>
      </Modal>
    </div>
  );
};

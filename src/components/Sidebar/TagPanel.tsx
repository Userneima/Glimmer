import React, { useState } from 'react';
import { Tag, X, Edit2, Palette } from 'lucide-react';
import type { Diary } from '../../types';
import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';
import { Input } from '../UI/Input';
import { t } from '../../i18n';

interface TagPanelProps {
  diaries: Diary[];
  selectedTags: string[];
  onSelectTag: (tag: string) => void;
  onClearTags: () => void;
  onRenameTag: (oldTag: string, newTag: string) => void;
  onMergeTags: (tags: string[], newTag: string) => void;
  onDeleteTag: (tag: string) => void;
}

interface TagStats {
  name: string;
  count: number;
  color: string;
}

export const TagPanel: React.FC<TagPanelProps> = ({
  diaries,
  selectedTags,
  onSelectTag,
  onClearTags,
  onRenameTag,
  onMergeTags,
  onDeleteTag,
}) => {
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isColorModalOpen, setIsColorModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<string>('');
  const [newTagName, setNewTagName] = useState('');
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([]);
  const [customColors, setCustomColors] = useState<Record<string, string>>({});
  const [deletingTag, setDeletingTag] = useState<string>('');

  const getDefaultTagColor = (tag: string) => {
    const colors = [
      'bg-blue-100 text-blue-700 border-blue-200',
      'bg-green-100 text-green-700 border-green-200',
      'bg-purple-100 text-purple-700 border-purple-200',
      'bg-pink-100 text-pink-700 border-pink-200',
      'bg-yellow-100 text-yellow-700 border-yellow-200',
      'bg-indigo-100 text-indigo-700 border-indigo-200',
      'bg-red-100 text-red-700 border-red-200',
      'bg-orange-100 text-orange-700 border-orange-200',
    ];
    const index = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[index % colors.length];
  };

  // 统计所有标签
  const tagStats: TagStats[] = React.useMemo(() => {
    const tagMap = new Map<string, number>();
    diaries.forEach(diary => {
      diary.tags.forEach(tag => {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      });
    });

    return Array.from(tagMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        color: customColors[name] || getDefaultTagColor(name),
      }))
      .sort((a, b) => b.count - a.count);
  }, [diaries, customColors]);

  const handleRename = () => {
    if (newTagName.trim() && editingTag) {
      onRenameTag(editingTag, newTagName.trim().toLowerCase());
      setIsRenameModalOpen(false);
      setEditingTag('');
      setNewTagName('');
    }
  };

  const handleMerge = () => {
    if (newTagName.trim() && selectedForMerge.length > 1) {
      onMergeTags(selectedForMerge, newTagName.trim().toLowerCase());
      setIsMergeModalOpen(false);
      setSelectedForMerge([]);
      setNewTagName('');
    }
  };

  const openRenameModal = (tag: string) => {
    setEditingTag(tag);
    setNewTagName(tag);
    setIsRenameModalOpen(true);
  };

  const openMergeModal = () => {
    setIsMergeModalOpen(true);
  };

  const openDeleteModal = (tag: string) => {
    setDeletingTag(tag);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteTag = () => {
    if (!deletingTag) {
      return;
    }
    onDeleteTag(deletingTag);
    setDeletingTag('');
    setIsDeleteModalOpen(false);
  };

  const toggleMergeSelection = (tag: string) => {
    setSelectedForMerge(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const colorOptions = [
    { name: 'Blue', class: 'bg-blue-100 text-blue-700 border-blue-200' },
    { name: 'Green', class: 'bg-green-100 text-green-700 border-green-200' },
    { name: 'Purple', class: 'bg-purple-100 text-purple-700 border-purple-200' },
    { name: 'Pink', class: 'bg-pink-100 text-pink-700 border-pink-200' },
    { name: 'Yellow', class: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    { name: 'Indigo', class: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    { name: 'Red', class: 'bg-red-100 text-red-700 border-red-200' },
    { name: 'Orange', class: 'bg-orange-100 text-orange-700 border-orange-200' },
  ];

  const handleColorChange = (tag: string, color: string) => {
    setCustomColors(prev => ({ ...prev, [tag]: color }));
    setIsColorModalOpen(false);
    setEditingTag('');
  };

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'rgba(255, 255, 255, 0.75)' }}>
      {/* 标题区 - 轻量风格 */}
      <div className="p-4" style={{ borderBottom: '1px solid rgba(200, 210, 220, 0.4)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--aurora-primary)' }}>
            <Tag size={20} />
            {t('Tags')}
          </h2>
          {selectedTags.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearTags}
              className="text-sm"
            >
              {t('Clear')}
            </Button>
          )}
        </div>
        {tagStats.length > 0 && (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={openMergeModal}
              className="flex-1 text-xs"
            >
              {t('Merge')}
            </Button>
          </div>
        )}
      </div>

      {/* 标签列表区 - 毛玻璃风 */}
      <div className="flex-1 overflow-y-auto p-4">
        {tagStats.length === 0 ? (
          <div className="text-center py-8 rounded-xl" style={{ backgroundColor: 'rgba(255, 255, 255, 0.8)', color: 'var(--aurora-muted)' }}>
            <Tag size={48} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('No tags yet')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tagStats.map(({ name, count, color }) => (
              <div
                key={name}
                className={`group flex items-center justify-between p-2 rounded-xl border cursor-pointer transition-colors ${color} ${
                  selectedTags.includes(name)
                    ? 'ring-2 ring-offset-1 ring-[var(--aurora-accent)]'
                    : 'hover:shadow-sm'
                }`}
                onClick={() => onSelectTag(name)}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="font-medium truncate">{name}</span>
                  <span className="text-xs opacity-70">({count})</span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingTag(name);
                      setIsColorModalOpen(true);
                    }}
                    className="p-1 hover:bg-white/50 rounded"
                    title={t('Change color')}
                  >
                    <Palette size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openRenameModal(name);
                    }}
                    className="p-1 hover:bg-white/50 rounded"
                    title={t('Rename')}
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openDeleteModal(name);
                    }}
                    className="p-1 hover:bg-white/50 rounded"
                    title={t('Delete')}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rename Modal */}
      <Modal
        isOpen={isRenameModalOpen}
        onClose={() => {
          setIsRenameModalOpen(false);
          setEditingTag('');
          setNewTagName('');
        }}
        title={t('Rename Tag')}
      >
        <Input
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          placeholder={t('New tag name')}
          onKeyPress={(e) => e.key === 'Enter' && handleRename()}
          autoFocus
        />
        <div className="flex gap-2 mt-4">
          <Button onClick={handleRename} className="flex-1">
            {t('Rename')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setIsRenameModalOpen(false);
              setEditingTag('');
              setNewTagName('');
            }}
            className="flex-1"
          >
            {t('Cancel')}
          </Button>
        </div>
      </Modal>

      {/* Delete Tag Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeletingTag('');
        }}
        title={t('Delete Tag')}
      >
        <p className="text-gray-600 mb-4">
          {t('Delete tag confirm').replace('{tag}', deletingTag)}
        </p>
        <div className="flex gap-2">
          <Button variant="danger" onClick={handleDeleteTag} className="flex-1">
            {t('Delete')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setIsDeleteModalOpen(false);
              setDeletingTag('');
            }}
            className="flex-1"
          >
            {t('Cancel')}
          </Button>
        </div>
      </Modal>

      {/* Merge Modal */}
      <Modal
        isOpen={isMergeModalOpen}
        onClose={() => {
          setIsMergeModalOpen(false);
          setSelectedForMerge([]);
          setNewTagName('');
        }}
        title={t('Merge Tags')}
      >
        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-3">
            {t('Select tags to merge (minimum 2):')}
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {tagStats.map(({ name, color }) => (
              <label
                key={name}
                className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                  selectedForMerge.includes(name) ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedForMerge.includes(name)}
                  onChange={() => toggleMergeSelection(name)}
                  className="rounded"
                />
                <span className={`px-2 py-1 rounded text-sm ${color}`}>{name}</span>
              </label>
            ))}
          </div>
        </div>
        <Input
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          placeholder={t('New merged tag name')}
          onKeyPress={(e) => e.key === 'Enter' && handleMerge()}
        />
        <div className="flex gap-2 mt-4">
          <Button
            onClick={handleMerge}
            disabled={selectedForMerge.length < 2 || !newTagName.trim()}
            className="flex-1"
          >
            {t('Merge')} ({selectedForMerge.length})
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setIsMergeModalOpen(false);
              setSelectedForMerge([]);
              setNewTagName('');
            }}
            className="flex-1"
          >
            {t('Cancel')}
          </Button>
        </div>
      </Modal>

      {/* Color Modal */}
      <Modal
        isOpen={isColorModalOpen}
        onClose={() => {
          setIsColorModalOpen(false);
          setEditingTag('');
        }}
        title={t('Choose Tag Color')}
      >
        <div className="grid grid-cols-2 gap-2">
          {colorOptions.map(({ name, class: colorClass }) => (
            <button
              key={name}
              onClick={() => handleColorChange(editingTag, colorClass)}
              className={`p-3 rounded-lg border-2 ${colorClass} hover:shadow-md transition-shadow`}
            >
              {name}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
};

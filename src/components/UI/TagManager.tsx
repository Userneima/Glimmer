import React, { useState, useMemo } from 'react';
import { t } from '../../i18n';
import type { Tag } from '../../types';
import { Plus, Edit, Trash2, Star, StarOff, Search } from 'lucide-react';

interface TagManagerProps {
  tags: Tag[];
  onAddTag: (name: string, color: string) => void;
  onUpdateTag: (id: string, updates: Partial<Tag>) => void;
  onDeleteTag: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

const PRESET_COLORS = [
  '#ef4444', // red-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#3b82f6', // blue-500
  '#8b5cf6', // purple-500
  '#ec4899', // pink-500
  '#6366f1', // indigo-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
  '#84cc16', // lime-500
];

export const TagManager: React.FC<TagManagerProps> = ({
  tags,
  onAddTag,
  onUpdateTag,
  onDeleteTag,
  onToggleFavorite,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]);
  const [searchQuery, setSearchQuery] = useState('');

  const sortedTags = useMemo(() => {
    const filtered = tags.filter(tag => 
      tag.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return filtered.sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      if (a.usageCount !== b.usageCount) return b.usageCount - a.usageCount;
      return a.name.localeCompare(b.name);
    });
  }, [tags, searchQuery]);

  const handleAddTag = () => {
    if (newTagName.trim()) {
      onAddTag(newTagName.trim(), newTagColor);
      setNewTagName('');
      setNewTagColor(PRESET_COLORS[0]);
      setShowAddModal(false);
    }
  };

  const handleEditTag = () => {
    if (editingTag && newTagName.trim()) {
      onUpdateTag(editingTag.id, {
        name: newTagName.trim(),
        color: newTagColor,
      });
      setEditingTag(null);
      setNewTagName('');
      setNewTagColor(PRESET_COLORS[0]);
      setShowEditModal(false);
    }
  };

  const handleEditClick = (tag: Tag) => {
    setEditingTag(tag);
    setNewTagName(tag.name);
    setNewTagColor(tag.color);
    setShowEditModal(true);
  };

  const handleDeleteClick = (tagId: string) => {
    if (confirm(t('Are you sure you want to delete this tag?'))) {
      onDeleteTag(tagId);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{t('Tags')}</h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600"
        >
          <Plus size={16} />
          {t('Add Tag')}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder={t('Search tags...')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border rounded-md text-sm"
        />
      </div>

      {/* Tags List */}
      {sortedTags.length === 0 ? (
        <div className="text-gray-500 text-sm text-center py-4">
          {searchQuery ? t('No tags found') : t('No tags yet')}
        </div>
      ) : (
        <div className="space-y-2">
          {sortedTags.map((tag) => (
            <div key={tag.id} className="flex items-center justify-between p-3 border rounded-md hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <div>
                  <div className="font-medium">{tag.name}</div>
                  <div className="text-xs text-gray-500">
                    {t('Used in {count} tasks', { count: tag.usageCount })}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onToggleFavorite(tag.id)}
                  className={`p-1 rounded hover:bg-gray-100 ${
                    tag.isFavorite ? 'text-yellow-500' : 'text-gray-400'
                  }`}
                  title={tag.isFavorite ? t('Remove from favorites') : t('Add to favorites')}
                >
                  {tag.isFavorite ? <Star size={16} /> : <StarOff size={16} />}
                </button>
                <button
                  onClick={() => handleEditClick(tag)}
                  className="p-1 rounded hover:bg-gray-100 text-blue-500"
                  title={t('Edit')}
                >
                  <Edit size={16} />
                </button>
                <button
                  onClick={() => handleDeleteClick(tag.id)}
                  className="p-1 rounded hover:bg-gray-100 text-red-500"
                  title={t('Delete')}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Tag Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium mb-4">{t('Add New Tag')}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('Tag Name')}
                </label>
                <input
                  type="text"
                  placeholder={t('Enter tag name')}
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('Tag Color')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewTagColor(color)}
                      className={`w-6 h-6 rounded-full border-2 ${
                        newTagColor === color ? 'border-black' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border rounded-md text-sm hover:bg-gray-50"
                >
                  {t('Cancel')}
                </button>
                <button
                  onClick={handleAddTag}
                  disabled={!newTagName.trim()}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('Create')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Tag Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium mb-4">{t('Edit Tag')}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('Tag Name')}
                </label>
                <input
                  type="text"
                  placeholder={t('Enter tag name')}
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('Tag Color')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewTagColor(color)}
                      className={`w-6 h-6 rounded-full border-2 ${
                        newTagColor === color ? 'border-black' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border rounded-md text-sm hover:bg-gray-50"
                >
                  {t('Cancel')}
                </button>
                <button
                  onClick={handleEditTag}
                  disabled={!newTagName.trim()}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('Save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

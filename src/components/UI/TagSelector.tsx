import React, { useState, useMemo } from 'react';
import { t } from '../../i18n';
import type { Tag } from '../../types';
import { Plus, Search, X } from 'lucide-react';

const getContrastTextColor = (backgroundColor: string): string => {
  // 简单的对比度计算，返回黑色或白色文字
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? '#000000' : '#ffffff';
};

interface TagSelectorProps {
  tags: Tag[];
  selectedTagIds: string[];
  onTagToggle: (tagId: string) => void;
  onAddTag?: (name: string, color: string) => void;
}

const PRESET_COLORS = [
  '#ef4444', // red-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#3b82f6', // blue-500
  '#8b5cf6', // purple-500
];

export const TagSelector: React.FC<TagSelectorProps> = ({
  tags,
  selectedTagIds,
  onTagToggle,
  onAddTag,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
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
    if (newTagName.trim() && onAddTag) {
      onAddTag(newTagName.trim(), newTagColor);
      setNewTagName('');
      setNewTagColor(PRESET_COLORS[0]);
      setShowAddModal(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Tag Selection */}
      <div className="flex flex-wrap gap-2">
        {selectedTagIds.map((tagId) => {
          const tag = tags.find(t => t.id === tagId);
          if (!tag) return null;
          return (
            <span
              key={tagId}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm"
              style={{
                backgroundColor: tag.color,
                color: getContrastTextColor(tag.color),
              }}
            >
              {tag.name}
              <button
                onClick={() => onTagToggle(tagId)}
                className="hover:opacity-80"
                title={t('Remove tag')}
              >
                <X size={12} />
              </button>
            </span>
          );
        })}
      </div>

      {/* Tag List */}
      <div className="space-y-2">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={t('Search tags...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border rounded-md text-sm"
          />
        </div>

        {/* Tags */}
        <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto p-1">
          {sortedTags.length === 0 ? (
            <div className="col-span-2 text-gray-500 text-sm text-center py-4">
              {searchQuery ? t('No tags found') : t('No tags yet')}
            </div>
          ) : (
            sortedTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => onTagToggle(tag.id)}
                className={`flex items-center gap-2 p-2 rounded-md text-left text-sm transition-colors ${
                  selectedTagIds.includes(tag.id)
                    ? 'bg-blue-100 text-blue-700'
                    : 'hover:bg-gray-100'
                }`}
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="flex-1 truncate">{tag.name}</span>
                {tag.isFavorite && (
                  <span className="text-yellow-500 text-xs">★</span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Add New Tag */}
        {onAddTag && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 w-full p-2 border border-dashed rounded-md text-sm text-gray-500 hover:text-gray-700 hover:border-gray-400"
          >
            <Plus size={14} />
            {t('Add new tag')}
          </button>
        )}
      </div>

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
    </div>
  );
};

import React, { useState } from 'react';
import { Tag, X, Edit2, Palette } from 'lucide-react';
import type { Diary } from '../../types';
import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';
import { Input } from '../UI/Input';
import { t } from '../../i18n';
import {
  getDiaryTagStats,
  normalizeDiaryTag,
  suggestEventSpecificDiaryTags,
  suggestDiaryTagMerges,
  type DiaryTagDeleteSuggestion,
  type DiaryTagMergeSuggestion,
  type DiaryTagColors,
} from '../../utils/diaryTags';
import { storage } from '../../utils/storage';

interface TagPanelProps {
  diaries: Diary[];
  selectedTags: string[];
  onSelectTag: (tag: string) => void;
  onClearTags: () => void;
  onRenameTag: (oldTag: string, newTag: string) => void;
  onMergeTags: (tags: string[], newTag: string) => void;
  onApplyTagMergeSuggestions: (suggestions: DiaryTagMergeSuggestion[]) => void;
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
  onApplyTagMergeSuggestions,
  onDeleteTag,
}) => {
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isCleanupModalOpen, setIsCleanupModalOpen] = useState(false);
  const [isColorModalOpen, setIsColorModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<string>('');
  const [newTagName, setNewTagName] = useState('');
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([]);
  const [selectedCleanupTargets, setSelectedCleanupTargets] = useState<string[]>([]);
  const [selectedEventTags, setSelectedEventTags] = useState<string[]>([]);
  const [customColors, setCustomColors] = useState<DiaryTagColors>(() => storage.getDiaryTagColors());
  const [deletingTag, setDeletingTag] = useState<string>('');

  // 统计所有标签
  const tagStats: TagStats[] = React.useMemo(() => {
    return getDiaryTagStats(diaries, customColors);
  }, [diaries, customColors]);

  const cleanupSuggestions = React.useMemo(() => {
    return suggestDiaryTagMerges(tagStats);
  }, [tagStats]);

  const eventTagSuggestions: DiaryTagDeleteSuggestion[] = React.useMemo(() => {
    return suggestEventSpecificDiaryTags(tagStats);
  }, [tagStats]);

  const persistColors = (nextColors: DiaryTagColors) => {
    setCustomColors(nextColors);
    storage.saveDiaryTagColors(nextColors);
  };

  const handleRename = () => {
    const normalizedNewName = normalizeDiaryTag(newTagName);
    if (normalizedNewName && editingTag) {
      const normalizedOldName = normalizeDiaryTag(editingTag);
      onRenameTag(normalizedOldName, normalizedNewName);
      if (normalizedOldName !== normalizedNewName && customColors[normalizedOldName]) {
        const nextColors = { ...customColors };
        nextColors[normalizedNewName] = nextColors[normalizedOldName];
        delete nextColors[normalizedOldName];
        persistColors(nextColors);
      }
      setIsRenameModalOpen(false);
      setEditingTag('');
      setNewTagName('');
    }
  };

  const handleMerge = () => {
    const normalizedNewName = normalizeDiaryTag(newTagName);
    if (normalizedNewName && selectedForMerge.length > 1) {
      const normalizedSources = selectedForMerge.map(normalizeDiaryTag).filter(Boolean);
      onMergeTags(normalizedSources, normalizedNewName);
      const nextColors = { ...customColors };
      const inheritedColor = nextColors[normalizedNewName] || normalizedSources.map(tag => nextColors[tag]).find(Boolean);
      normalizedSources.forEach(tag => {
        delete nextColors[tag];
      });
      if (inheritedColor) {
        nextColors[normalizedNewName] = inheritedColor;
      }
      persistColors(nextColors);
      setIsCleanupModalOpen(false);
      setSelectedForMerge([]);
      setNewTagName('');
    }
  };

  const openRenameModal = (tag: string) => {
    setEditingTag(tag);
    setNewTagName(tag);
    setIsRenameModalOpen(true);
  };

  const openCleanupModal = () => {
    setSelectedCleanupTargets(cleanupSuggestions.map((suggestion) => suggestion.targetTag));
    setSelectedEventTags(eventTagSuggestions.map((suggestion) => suggestion.tag));
    setIsCleanupModalOpen(true);
  };

  const openDeleteModal = (tag: string) => {
    setDeletingTag(tag);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteTag = () => {
    if (!deletingTag) {
      return;
    }
    const normalizedTag = normalizeDiaryTag(deletingTag);
    onDeleteTag(normalizedTag);
    if (customColors[normalizedTag]) {
      const nextColors = { ...customColors };
      delete nextColors[normalizedTag];
      persistColors(nextColors);
    }
    setDeletingTag('');
    setIsDeleteModalOpen(false);
  };

  const toggleMergeSelection = (tag: string) => {
    setSelectedForMerge(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const toggleCleanupSuggestion = (targetTag: string) => {
    setSelectedCleanupTargets(prev =>
      prev.includes(targetTag) ? prev.filter(tag => tag !== targetTag) : [...prev, targetTag]
    );
  };

  const toggleEventTagSuggestion = (tag: string) => {
    setSelectedEventTags(prev =>
      prev.includes(tag) ? prev.filter(item => item !== tag) : [...prev, tag]
    );
  };

  const handleApplyCleanup = () => {
    const selectedSuggestions = cleanupSuggestions.filter((suggestion) => (
      selectedCleanupTargets.includes(suggestion.targetTag)
    ));
    const selectedMergeTags = new Set(selectedSuggestions.flatMap((suggestion) => (
      suggestion.tags.map(normalizeDiaryTag)
    )));
    const normalizedEventTags = selectedEventTags
      .map(normalizeDiaryTag)
      .filter((tag) => tag && !selectedMergeTags.has(tag));
    if (selectedSuggestions.length === 0 && normalizedEventTags.length === 0) return;

    if (selectedSuggestions.length > 0) {
      onApplyTagMergeSuggestions(selectedSuggestions);
    }
    normalizedEventTags.forEach(onDeleteTag);

    const nextColors = { ...customColors };
    selectedSuggestions.forEach(({ tags, targetTag }) => {
      const inheritedColor = nextColors[targetTag] || tags.map(tag => nextColors[tag]).find(Boolean);
      tags.forEach((tag) => {
        if (tag !== targetTag) delete nextColors[tag];
      });
      if (inheritedColor) nextColors[targetTag] = inheritedColor;
    });
    normalizedEventTags.forEach((tag) => {
      delete nextColors[tag];
    });
    persistColors(nextColors);
    setIsCleanupModalOpen(false);
    setSelectedCleanupTargets([]);
    setSelectedEventTags([]);
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
    const normalizedTag = normalizeDiaryTag(tag);
    if (normalizedTag) {
      persistColors({ ...customColors, [normalizedTag]: color });
    }
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
              onClick={openCleanupModal}
              className="flex-1 text-xs"
            >
              {t('Clean up')}
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

      {/* Cleanup Modal */}
      <Modal
        isOpen={isCleanupModalOpen}
        onClose={() => {
          setIsCleanupModalOpen(false);
          setSelectedCleanupTargets([]);
          setSelectedEventTags([]);
          setSelectedForMerge([]);
          setNewTagName('');
        }}
        title={t('Organize Tags')}
      >
        <div className="space-y-5">
          <section>
            <h3 className="text-sm font-semibold text-gray-800">{t('Similar tags')}</h3>
            {cleanupSuggestions.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">{t('No similar tags found')}</p>
            ) : (
              <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                {cleanupSuggestions.map((suggestion) => (
                  <label
                    key={suggestion.targetTag}
                    className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white/80 p-3"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCleanupTargets.includes(suggestion.targetTag)}
                      onChange={() => toggleCleanupSuggestion(suggestion.targetTag)}
                      className="mt-1 rounded"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-800">
                        {suggestion.tags.join(' / ')} → {suggestion.targetTag}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {t('Suggested merge target')}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-800">{t('Event-only tags')}</h3>
            {eventTagSuggestions.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">{t('No event-only tags found')}</p>
            ) : (
              <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                {eventTagSuggestions.map((suggestion) => (
                  <label
                    key={suggestion.tag}
                    className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50/60 p-3"
                  >
                    <input
                      type="checkbox"
                      checked={selectedEventTags.includes(suggestion.tag)}
                      onChange={() => toggleEventTagSuggestion(suggestion.tag)}
                      className="mt-1 rounded"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-800">{suggestion.tag}</div>
                      <div className="mt-1 text-xs text-gray-500">{suggestion.reason}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-800">{t('Manual merge')}</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
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
            <div className="mt-3 flex gap-2">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder={t('New merged tag name')}
                onKeyPress={(e) => e.key === 'Enter' && handleMerge()}
              />
              <Button
                onClick={handleMerge}
                disabled={selectedForMerge.length < 2 || !newTagName.trim()}
              >
                {t('Merge')}
              </Button>
            </div>
          </section>
        </div>
        <div className="flex gap-2 mt-4">
          <Button
            onClick={handleApplyCleanup}
            disabled={selectedCleanupTargets.length === 0 && selectedEventTags.length === 0}
            className="flex-1"
          >
            {t('Apply cleanup')} ({selectedCleanupTargets.length + selectedEventTags.length})
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setIsCleanupModalOpen(false);
              setSelectedCleanupTargets([]);
              setSelectedEventTags([]);
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

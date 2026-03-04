import React, { useState } from 'react';
import { useLongTermIdeas } from '../../hooks/useLongTermIdeas';
import { t } from '../../i18n';
import { Pin, ChevronDown, ChevronUp, Trash2, Edit3, ExternalLink, Clock, AlertTriangle, FileText } from 'lucide-react';
import { Modal } from '../UI/Modal';
import { showToast } from '../../utils/toast';
import type { LongTermIdeaProgress, LongTermIdea } from '../../types';

interface LongTermIdeaPanelProps {
  onNavigateToDiary?: (diaryId: string, position?: { from: number; to: number }) => void;
}

const progressLabels: Record<LongTermIdeaProgress, string> = {
  'not-started': '未开始',
  'in-progress': '进行中',
  'pending-review': '待核对',
  'completed': '已完成',
};

const progressColors: Record<LongTermIdeaProgress, string> = {
  'not-started': 'bg-gray-100 text-gray-700',
  'in-progress': 'bg-blue-100 text-blue-700',
  'pending-review': 'bg-yellow-100 text-yellow-700',
  'completed': 'bg-green-100 text-green-700',
};

export const LongTermIdeaPanel: React.FC<LongTermIdeaPanelProps> = ({ onNavigateToDiary }) => {
  const {
    filteredIdeas,
    updateProgress,
    deleteIdea,
    accessIdea,
    updateIdea,
    selectedProgressFilter,
    setProgressFilter,
  } = useLongTermIdeas();

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);
  const [editingIdea, setEditingIdea] = useState<LongTermIdea | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editNote, setEditNote] = useState('');
  const [showFilter, setShowFilter] = useState(false);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleEdit = (idea: LongTermIdea) => {
    setEditingIdea(idea);
    setEditTitle(idea.title);
    setEditContent(idea.content);
    setEditNote(idea.note || '');
  };

  const handleUpdateIdea = () => {
    if (!editingIdea) return;
    
    if (!editTitle.trim()) {
      showToast(t('Title cannot be empty'), 'error');
      return;
    }

    updateIdea(editingIdea.id, {
      title: editTitle.trim(),
      content: editContent,
      note: editNote.trim() || undefined,
    });

    setEditingIdea(null);
    setEditTitle('');
    setEditContent('');
    setEditNote('');
    showToast(t('Long-term idea updated'));
  };

  const handleJumpToDiary = (idea: any) => {
    accessIdea(idea.id);
    if (idea.originalDeleted) {
      showToast(t('Original diary has been deleted'), 'error');
      return;
    }
    if (onNavigateToDiary) {
      onNavigateToDiary(idea.originalDiaryId, idea.originalPosition);
    }
  };

  const handleProgressChange = (ideaId: string, progress: LongTermIdeaProgress) => {
    updateProgress(ideaId, progress);
  };

  const handleDelete = (ideaId: string) => {
    if (confirm(t('Are you sure you want to delete this long-term idea?'))) {
      deleteIdea(ideaId);
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const progressOptions: LongTermIdeaProgress[] = ['not-started', 'in-progress', 'pending-review', 'completed'];

  if (filteredIdeas.length === 0 && !selectedProgressFilter) {
    return (
      <div className="mb-4 p-4 rounded-xl border" style={{ backgroundColor: 'rgba(255, 255, 255, 0.6)', borderColor: 'rgba(226, 232, 240, 0.5)' }}>
        <div className="flex items-center gap-2 text-gray-500">
          <Pin size={16} />
          <span className="text-sm">{t('No long-term ideas yet')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border overflow-hidden" style={{ backgroundColor: 'rgba(255, 255, 255, 0.8)', borderColor: 'rgba(226, 232, 240, 0.5)' }}>
      {/* Panel Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer"
        style={{ backgroundColor: 'rgba(240, 248, 255, 0.5)', borderBottom: '1px solid rgba(226, 232, 240, 0.3)' }}
        onClick={() => setIsPanelExpanded(!isPanelExpanded)}
      >
        <div className="flex items-center gap-2">
          <Pin size={18} className="text-blue-600" />
          <h3 className="font-semibold text-gray-800">{t('Long-term Ideas')}</h3>
          {filteredIdeas.length > 0 && (
            <span className="text-xs text-gray-500">({filteredIdeas.length})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isPanelExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* Panel Content */}
      {isPanelExpanded && (
        <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
          {/* Progress Filter Toggle */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowFilter(!showFilter)}
              className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800 transition-colors"
            >
              <span>{t('Filter by progress')}</span>
              {showFilter ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {selectedProgressFilter && (
              <button
                onClick={() => {
                  setProgressFilter(null);
                  setShowFilter(false);
                }}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                {t('Clear')} ×
              </button>
            )}
          </div>

          {/* Progress Filter */}
          {showFilter && (
            <div className="flex items-center gap-2 flex-wrap pb-2">
              <button
                onClick={() => setProgressFilter(null)}
                className={`px-2 py-1 text-xs rounded transition-colors ${!selectedProgressFilter ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {t('All')}
              </button>
              {progressOptions.map(progress => (
                <button
                  key={progress}
                  onClick={() => setProgressFilter(progress)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${selectedProgressFilter === progress ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {progressLabels[progress]}
                </button>
              ))}
            </div>
          )}

          {/* Ideas List */}
          <div className="space-y-2">
            {filteredIdeas.map(idea => (
              <div
                key={idea.id}
                className="border rounded-lg overflow-hidden transition-colors"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.7)', borderColor: 'rgba(226, 232, 240, 0.4)' }}
              >
                {/* Idea Header */}
                <div className="flex items-start justify-between p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-800 truncate">{idea.title}</span>
                      {idea.originalDeleted && (
                        <span className="text-xs text-orange-600 flex items-center gap-1">
                          <AlertTriangle size={12} />
                          {t('Original diary deleted')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${progressColors[idea.progress]}`}>
                        {progressLabels[idea.progress]}
                      </span>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock size={12} />
                        {t('From')}: {formatDate(idea.createdAt)}
                      </span>
                      {idea.lastEditedAt && (
                        <span className="text-xs text-gray-500">
                          {t('Last edited')}: {formatDate(idea.lastEditedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleExpand(idea.id)}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    {expandedIds.has(idea.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {/* Idea Details */}
                {expandedIds.has(idea.id) && (
                  <div className="px-3 pb-3 space-y-3 border-t" style={{ borderColor: 'rgba(226, 232, 240, 0.3)' }}>
                    {/* Content Preview */}
                    <div className="mt-2">
                      <div className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-3">
                        {idea.content}
                      </div>
                    </div>

                    {/* Note */}
                    {idea.note && (
                      <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                        <span className="font-medium">{t('Note')}:</span> {idea.note}
                      </div>
                    )}

                    {/* Progress Selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600">{t('Progress status')}:</span>
                      <select
                        value={idea.progress}
                        onChange={(e) => handleProgressChange(idea.id, e.target.value as LongTermIdeaProgress)}
                        className="text-xs border rounded px-2 py-1"
                      >
                        {progressOptions.map(p => (
                          <option key={p} value={p}>{progressLabels[p]}</option>
                        ))}
                      </select>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={() => handleJumpToDiary(idea)}
                        disabled={idea.originalDeleted}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                      >
                        <ExternalLink size={14} />
                        {t('Jump to original')}
                      </button>
                      {!idea.originalDeleted && (
                        <button
                          onClick={() => handleEdit(idea)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                        >
                          <Edit3 size={14} />
                          {t('Edit')}
                        </button>
                      )}
                      {idea.originalDeleted && (
                        <button
                          onClick={() => {}}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                        >
                          <FileText size={14} />
                          {t('Convert to note')}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(idea.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 bg-red-50 rounded hover:bg-red-100"
                      >
                        <Trash2 size={14} />
                        {t('Delete')}
                      </button>
                    </div>

                    {/* Versions */}
                    {idea.versions.length > 1 && (
                      <div className="text-xs text-gray-500 pt-2 border-t" style={{ borderColor: 'rgba(226, 232, 240, 0.2)' }}>
                        {t('Version history')}: {idea.versions.length} {t('versions')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Edit Modal */}
      <Modal
        isOpen={!!editingIdea}
        onClose={() => {
          setEditingIdea(null);
          setEditTitle('');
          setEditContent('');
          setEditNote('');
        }}
        title={t('Edit Long-term Idea')}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('Title')}
            </label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 text-sm"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder={t('Enter title')}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('Content')}
            </label>
            <textarea
              className="w-full border rounded px-3 py-2 text-sm resize-none"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={6}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('Note')} <span className="text-gray-400 text-xs">({t('Optional')})</span>
            </label>
            <textarea
              className="w-full border rounded px-3 py-2 text-sm resize-none"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              rows={3}
              placeholder={t('Add notes...')}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => {
                setEditingIdea(null);
                setEditTitle('');
                setEditContent('');
                setEditNote('');
              }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              {t('Cancel')}
            </button>
            <button
              onClick={handleUpdateIdea}
              disabled={!editTitle.trim()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {t('Update')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

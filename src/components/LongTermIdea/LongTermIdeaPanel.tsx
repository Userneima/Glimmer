import React, { useState } from 'react';
import { useLongTermIdeas } from '../../hooks/useLongTermIdeas';
import { t } from '../../i18n';
import { ChevronDown, ChevronUp, Trash2, Edit3, ExternalLink, Clock, AlertTriangle, Plus } from 'lucide-react';
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
    addIdea,
    deleteIdea,
    accessIdea,
    updateIdea,
  } = useLongTermIdeas();

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingIdea, setEditingIdea] = useState<LongTermIdea | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editNote, setEditNote] = useState('');

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

  const resetForm = () => {
    setEditingIdea(null);
    setIsCreating(false);
    setEditTitle('');
    setEditContent('');
    setEditNote('');
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

    resetForm();
    showToast(t('Long-term idea updated'));
  };

  const handleCreateIdea = () => {
    if (!editTitle.trim()) {
      showToast(t('Title cannot be empty'), 'error');
      return;
    }

    addIdea(editTitle.trim(), editContent);
    resetForm();
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

  const handleDelete = (ideaId: string) => {
    if (confirm(t('Are you sure you want to delete this long-term idea?'))) {
      deleteIdea(ideaId);
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const visibleIdeas = filteredIdeas;

  const createButton = (
    <button
      onClick={() => {
        resetForm();
        setIsCreating(true);
      }}
      className="flex items-center gap-1.5 px-3 py-2 text-sm text-white rounded-lg hover:opacity-90 transition-opacity active:scale-95"
      style={{ background: 'linear-gradient(135deg, var(--aurora-accent) 0%, var(--aurora-accent-alt) 100%)' }}
    >
      <Plus size={16} />
      {t('New Spark')}
    </button>
  );

  if (visibleIdeas.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <p className="text-sm text-gray-500">{t('No long-term ideas yet')}</p>
        {createButton}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end mb-2">
        {createButton}
      </div>
      {visibleIdeas.map(idea => (
        <div
          key={idea.id}
          className="border rounded-lg overflow-hidden transition-colors cursor-pointer hover:bg-slate-50"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderColor: 'rgba(226, 232, 240, 0.6)' }}
          onClick={() => toggleExpand(idea.id)}
        >
          <div className="flex items-start justify-between p-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-gray-800 truncate">
                  {idea.title || t('Untitled')}
                </span>
                {idea.originalDeleted && (
                  <span className="text-xs text-orange-600 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    {t('Original diary deleted')}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 mb-1 line-clamp-2">
                {idea.content}
              </p>
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <span className={`px-2 py-0.5 rounded-full ${progressColors[idea.progress]}`}>
                  {progressLabels[idea.progress]}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  {t('From')}: {formatDate(idea.createdAt)}
                </span>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(idea.id);
              }}
              className="p-1 hover:bg-gray-100 rounded"
            >
              {expandedIds.has(idea.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          {expandedIds.has(idea.id) && (
            <div className="px-3 pb-3 space-y-3 border-t" style={{ borderColor: 'rgba(226, 232, 240, 0.3)' }}>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => handleJumpToDiary(idea)}
                  disabled={idea.originalDeleted}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  <ExternalLink size={14} />
                  {t('Jump to original')}
                </button>
                <button
                  onClick={() => handleEdit(idea)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  <Edit3 size={14} />
                  {t('Edit')}
                </button>
                <button
                  onClick={() => handleDelete(idea.id)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 bg-red-50 rounded hover:bg-red-100"
                >
                  <Trash2 size={14} />
                  {t('Delete')}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Edit / Create Modal */}
      <Modal
        isOpen={!!editingIdea || isCreating}
        onClose={resetForm}
        title={isCreating ? t('New Spark') : t('Edit Long-term Idea')}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('Title')}
            </label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder={t('Spark title...')}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('Content')}
            </label>
            <textarea
              className="w-full border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={6}
            />
          </div>

          {!isCreating && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('Note')} <span className="text-gray-400 text-xs">({t('Optional')})</span>
              </label>
              <textarea
                className="w-full border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                rows={3}
                placeholder={t('Add notes...')}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={resetForm}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              {t('Cancel')}
            </button>
            <button
              onClick={isCreating ? handleCreateIdea : handleUpdateIdea}
              disabled={!editTitle.trim()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isCreating ? t('Create') : t('Update')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

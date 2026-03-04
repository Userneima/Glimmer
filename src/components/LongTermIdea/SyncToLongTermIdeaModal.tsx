import React, { useState } from 'react';
import { t } from '../../i18n';
import { X } from 'lucide-react';

interface SyncToLongTermIdeaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (note: string, syncFullText: boolean) => void;
  hasSelection: boolean;
}

export const SyncToLongTermIdeaModal: React.FC<SyncToLongTermIdeaModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  hasSelection,
}) => {
  const [note, setNote] = useState('');

  if (!isOpen) return null;

  const handleSubmit = () => {
    onConfirm(note, !hasSelection); // 如果没有选中内容，则同步全文
    setNote('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">{t('Sync to Long-term Idea')}</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-2">
              {hasSelection ? t('Sync selected') : t('Sync full text')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('Sync note')} <span className="text-gray-400 text-xs">({t('Optional')})</span>
            </label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t('Enter sync note (optional)')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              {t('Cancel')}
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              {t('Confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

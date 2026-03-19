import React from 'react';
import { Modal } from './Modal';
import { Upload, Download, RefreshCw } from 'lucide-react';
import { t } from '../../i18n';
import { AiSettingsModal } from './AiSettingsModal';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: () => void;
  onExport: () => void;
  onRetrySync: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onImport,
  onExport,
  onRetrySync,
}) => {
  const [activeTab, setActiveTab] = React.useState<'general' | 'ai'>('general');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('Settings')}>
      <div className="space-y-6">
        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex-1 py-2 px-4 text-sm font-medium transition-colors ${
              activeTab === 'general' 
                ? 'text-accent-500 border-b-2 border-accent-500' 
                : 'text-primary-600 hover:bg-primary-50'
            }`}
          >
            {t('General')}
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`flex-1 py-2 px-4 text-sm font-medium transition-colors ${
              activeTab === 'ai' 
                ? 'text-accent-500 border-b-2 border-accent-500' 
                : 'text-primary-600 hover:bg-primary-50'
            }`}
          >
            {t('AI Settings')}
          </button>
        </div>

        {/* General Settings */}
        {activeTab === 'general' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-700">{t('Data Management')}</h3>
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => {
                    onImport();
                    onClose();
                  }}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-primary-50 transition-colors w-full"
                >
                  <div className="p-2 rounded-lg bg-semantic-success/10 text-semantic-success flex-shrink-0">
                    <Upload size={20} />
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    <h4 className="font-medium text-slate-800 mb-1">{t('Import diaries and folders')}</h4>
                    <p className="text-sm text-slate-500">{t('Import from JSON, MD, HTML, TXT, DOCX, PDF')}</p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    onExport();
                    onClose();
                  }}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-primary-50 transition-colors w-full"
                >
                  <div className="p-2 rounded-lg bg-accent-50 text-accent-500 flex-shrink-0">
                    <Download size={20} />
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    <h4 className="font-medium text-slate-800 mb-1">{t('Export diaries')}</h4>
                    <p className="text-sm text-slate-500">{t('Export to JSON, MD, HTML, DOCX, PDF')}</p>
                  </div>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-700">{t('Cloud Sync')}</h3>
              <button
                  onClick={onRetrySync}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-primary-50 transition-colors w-full"
                >
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-600 flex-shrink-0">
                    <RefreshCw size={20} />
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    <h4 className="font-medium text-slate-800 mb-1">{t('Manual sync')}</h4>
                    <p className="text-sm text-slate-500">{t('Sync data with cloud storage')}</p>
                  </div>
                </button>
            </div>
          </div>
        )}

        {/* AI Settings */}
        {activeTab === 'ai' && (
          <div>
            <AiSettingsModal onClose={() => setActiveTab('general')} />
          </div>
        )}
      </div>
    </Modal>
  );
};
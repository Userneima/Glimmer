import React from 'react';
import { Modal } from './Modal';
import { Upload, Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { t } from '../../i18n';
import { AiSettingsModal } from './AiSettingsModal';
import { DataSafetyPanel } from './DataSafetyPanel';
import {
  getEditorHeadingSettings,
  resetEditorHeadingSettings,
  saveEditorHeadingSettings,
  type EditorHeadingSettings,
} from '../../utils/editorHeadingSettings';

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
  const [activeTab, setActiveTab] = React.useState<'general' | 'data' | 'ai'>('general');
  const [headingSettings, setHeadingSettings] = React.useState<EditorHeadingSettings>(() => getEditorHeadingSettings());

  const updateHeadingSize = (key: keyof EditorHeadingSettings, value: number) => {
    setHeadingSettings((prev) => saveEditorHeadingSettings({ ...prev, [key]: value }));
  };

  const handleResetHeadingSize = () => {
    setHeadingSettings(resetEditorHeadingSettings());
  };

  const headingControls: Array<{ key: keyof EditorHeadingSettings; label: string; min: number; max: number }> = [
    { key: 'h1', label: '标题 1', min: 1.35, max: 2.4 },
    { key: 'h2', label: '标题 2', min: 1.15, max: 2 },
    { key: 'h3', label: '标题 3', min: 1, max: 1.7 },
    { key: 'h4', label: '标题 4', min: 0.95, max: 1.45 },
    { key: 'h5', label: '标题 5', min: 0.9, max: 1.25 },
    { key: 'h6', label: '标题 6', min: 0.85, max: 1.15 },
  ];

  const renderHeadingSlider = (key: keyof EditorHeadingSettings, label: string, min: number, max: number) => (
    <label className="block rounded-xl border border-slate-200/80 bg-white/70 px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-600">
          {headingSettings[key].toFixed(2)}x
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step="0.05"
        value={headingSettings[key]}
        onChange={(event) => updateHeadingSize(key, Number(event.target.value))}
        className="w-full accent-sky-500"
      />
    </label>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('Settings')} maxWidth="4xl">
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
            onClick={() => setActiveTab('data')}
            className={`flex-1 py-2 px-4 text-sm font-medium transition-colors ${
              activeTab === 'data'
                ? 'text-accent-500 border-b-2 border-accent-500'
                : 'text-primary-600 hover:bg-primary-50'
            }`}
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <ShieldCheck size={15} />
              数据安全
            </span>
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

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">编辑器标题字号</h3>
                  <p className="mt-1 text-xs text-slate-500">影响正文里的 H1-H6，不影响页面标题。</p>
                </div>
                <button
                  type="button"
                  onClick={handleResetHeadingSize}
                  className="shrink-0 rounded-apple-sm border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                >
                  恢复默认
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {headingControls.map(({ key, label, min, max }) => renderHeadingSlider(key, label, min, max))}
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-sky-50/35 to-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Preview</span>
                  <span className="text-xs text-slate-400">正文标题预览</span>
                </div>
                <div className="rounded-xl border border-white/70 bg-white/80 px-5 py-4 text-slate-900">
                  <div
                    className="font-bold tracking-[-0.025em] text-slate-900"
                    style={{ fontSize: `${headingSettings.h1}em`, lineHeight: 1.18 }}
                  >
                    标题 1：长期任务复盘
                  </div>
                  <p className="mt-2 text-sm leading-7 text-slate-500">
                    这里是一段普通正文，用来对比标题和正文之间的比例。
                  </p>
                  <div
                    className="mt-4 font-semibold tracking-[-0.02em] text-slate-900"
                    style={{ fontSize: `${headingSettings.h2}em`, lineHeight: 1.24 }}
                  >
                    标题 2：当前阶段
                  </div>
                  <p className="mt-2 text-sm leading-7 text-slate-500">
                    标题不应该抢走整页注意力，只需要帮助你快速定位结构。
                  </p>
                  <div
                    className="mt-4 font-semibold tracking-[-0.015em] text-slate-900"
                    style={{ fontSize: `${headingSettings.h3}em`, lineHeight: 1.3 }}
                  >
                    标题 3：明天只做什么
                  </div>
                  <p className="mt-2 text-sm leading-7 text-slate-500">
                    这个层级适合日记里的小节，不宜比正文大太多。
                  </p>
                  <div
                    className="mt-4 font-semibold text-slate-900"
                    style={{ fontSize: `${headingSettings.h4}em`, lineHeight: 1.34 }}
                  >
                    标题 4：执行细节
                  </div>
                  <div
                    className="mt-3 font-semibold text-slate-700"
                    style={{ fontSize: `${headingSettings.h5}em`, lineHeight: 1.38 }}
                  >
                    标题 5：检查点
                  </div>
                  <div
                    className="mt-3 font-semibold text-slate-500"
                    style={{ fontSize: `${headingSettings.h6}em`, lineHeight: 1.42 }}
                  >
                    标题 6：备注
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'data' && <DataSafetyPanel />}

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

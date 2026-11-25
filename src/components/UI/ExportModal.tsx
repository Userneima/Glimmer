import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Code, FileJson, FileType, File, Check, FolderOpen, Files } from 'lucide-react';
import { ActionMenu } from './ActionMenu';
import type { Diary } from '../../types';
import { Modal } from '../UI/Modal';
import { t } from '../../i18n';
import { storage } from '../../utils/storage';
import { ModalFooter } from './ModalFooter';
import { showToast } from '../../utils/toast';
import {
  type ExportFileMode,
  type ExportFormat,
  buildExportEntries,
  saveBlobWithPicker,
  saveExportEntries,
} from '../../utils/export';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  diaries: Diary[];
  currentDiary: Diary | null;
  initialExportType?: 'current' | 'all';
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  diaries,
  currentDiary,
  initialExportType = 'current',
}) => {
  const [exportType, setExportType] = useState<'current' | 'all'>(initialExportType);
  const [fileMode, setFileMode] = useState<ExportFileMode>('combined');
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setExportType(initialExportType);
    setFileMode(initialExportType === 'all' ? 'combined' : 'combined');
  }, [initialExportType, isOpen]);

  const diariesToExport = useMemo(
    () => (exportType === 'current' && currentDiary ? [currentDiary] : diaries),
    [currentDiary, diaries, exportType]
  );

  const isSingleDiaryExport = exportType === 'current';
  const effectiveFileMode: ExportFileMode = isSingleDiaryExport ? 'combined' : fileMode;

  const getFormatButtonClass = (targetFormat: ExportFormat) =>
    `p-3 border rounded-lg flex flex-col items-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
      format === targetFormat
        ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
        : 'hover:bg-gray-50 text-gray-700'
    }`;

  const exportAllData = async (formatOverride?: 'json' | 'markdown' | 'html') => {
    try {
      const targetFormat = formatOverride ?? 'json';
      if (targetFormat === 'json') {
        const all = storage.getAllData();
        await saveBlobWithPicker({
          filename: `all_data_${Date.now()}.json`,
          blob: new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' }),
        });
      } else {
        const all = storage.getAllData();
        const allDiaries = all.diaries ?? diaries;
        const entries = await buildExportEntries(allDiaries, targetFormat, 'combined');
        await saveExportEntries(entries);
      }
      showToast(t('Export completed'), 'success');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      console.error('exportAllData failed', err);
      showToast(t('Export failed. Please try again.'), 'error');
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      if (diariesToExport.length === 0) {
        showToast(t('No diaries to export'), 'error');
        return;
      }

      const entries = await buildExportEntries(diariesToExport, format, effectiveFileMode);
      const saveMode = await saveExportEntries(entries);

      if (entries.length > 1) {
        showToast(
          saveMode === 'directory'
            ? t('Exported multiple diary files to selected folder')
            : t('Exported multiple diary files as downloads'),
          'success'
        );
      } else {
        showToast(t('Export completed'), 'success');
      }

      onClose();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      console.error('Export error:', error);
      showToast(t('Export failed. Please try again.'), 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('Export Diaries')}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('Export Scope')}
          </label>
          <div className="space-y-2">
            <label
              className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors relative ${
                exportType === 'current'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                  : 'hover:bg-gray-50'
              } ${!currentDiary ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                type="radio"
                value="current"
                checked={exportType === 'current'}
                onChange={(e) => setExportType(e.target.value as 'current')}
                disabled={!currentDiary}
                className="accent-blue-600"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{t('Current Diary')}</div>
                <div className="text-sm text-gray-500 truncate">
                  {currentDiary ? currentDiary.title : t('No diary selected')}
                </div>
              </div>
              {exportType === 'current' && <Check size={16} className="text-blue-600 ml-2" />}
            </label>
            <label
              className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors relative ${
                exportType === 'all'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                  : 'hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                value="all"
                checked={exportType === 'all'}
                onChange={(e) => setExportType(e.target.value as 'all')}
                className="accent-blue-600"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{t('All Diaries')}</div>
                <div className="text-sm text-gray-500">
                  {t('Export all')} {diaries.length} {t('Diaries')}
                </div>
              </div>
              {exportType === 'all' && <Check size={16} className="text-blue-600 ml-2" />}
            </label>
          </div>
        </div>

        {exportType === 'all' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('Export File Layout')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFileMode('combined')}
                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                  fileMode === 'combined'
                    ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                    : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                <Files size={18} className="mt-0.5" />
                <div>
                  <div className="font-medium">{t('Single Combined File')}</div>
                  <div className="text-xs text-gray-500">{t('Export all diaries into one file')}</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setFileMode('separate')}
                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                  fileMode === 'separate'
                    ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                    : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                <FolderOpen size={18} className="mt-0.5" />
                <div>
                  <div className="font-medium">{t('Multiple Separate Files')}</div>
                  <div className="text-xs text-gray-500">{t('Export each diary as its own file')}</div>
                </div>
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('Export Format')}
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setFormat('markdown')}
              role="button"
              aria-pressed={format === 'markdown'}
              className={getFormatButtonClass('markdown')}
            >
              <FileText size={24} />
              <span className="text-sm font-medium">{t('Markdown')}</span>
            </button>
            <button
              onClick={() => setFormat('html')}
              role="button"
              aria-pressed={format === 'html'}
              className={getFormatButtonClass('html')}
            >
              <Code size={24} />
              <span className="text-sm font-medium">{t('HTML')}</span>
            </button>
            <button
              onClick={() => setFormat('json')}
              role="button"
              aria-pressed={format === 'json'}
              className={getFormatButtonClass('json')}
            >
              <FileJson size={24} />
              <span className="text-sm font-medium">{t('JSON')}</span>
            </button>
            <button
              onClick={() => setFormat('docx')}
              role="button"
              aria-pressed={format === 'docx'}
              className={getFormatButtonClass('docx')}
            >
              <FileType size={24} />
              <span className="text-sm font-medium">{t('Word')}</span>
            </button>
            <button
              onClick={() => setFormat('pdf')}
              role="button"
              aria-pressed={format === 'pdf'}
              className={getFormatButtonClass('pdf')}
            >
              <File size={24} />
              <span className="text-sm font-medium">{t('PDF')}</span>
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {exportType === 'all' && effectiveFileMode === 'separate'
              ? t('When supported, you can pick a folder for separate diary files.')
              : t('When supported, you can choose where to save the exported file.')}
          </p>
        </div>

        <div className="flex gap-2 pt-4 items-center">
          <ModalFooter
            primaryLabel={isExporting ? t('Exporting...') : t('Export')}
            primaryOnClick={handleExport}
            primaryDisabled={isExporting}
            secondaryLabel={t('Cancel')}
            secondaryOnClick={onClose}
          >
            <div className="ml-1">
              <ActionMenu
                items={[
                  {
                    label: t('Export All Data'),
                    children: [
                      { label: 'JSON', onClick: () => void exportAllData('json') },
                      { label: t('Markdown'), onClick: () => void exportAllData('markdown') },
                      { label: t('HTML'), onClick: () => void exportAllData('html') },
                    ],
                  },
                ]}
              />
            </div>
          </ModalFooter>
        </div>
      </div>
    </Modal>
  );
};

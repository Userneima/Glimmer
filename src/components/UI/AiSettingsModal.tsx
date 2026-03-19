import React, { useState } from 'react';
import { storage } from '../../utils/storage';
import { t } from '../../i18n';

interface Props {
  onClose: () => void;
}

export const AiSettingsModal: React.FC<Props> = ({ onClose }) => {
  const [initialSettings] = useState(() => storage.getAiSettings());
  const [dsKey, setDsKey] = useState(initialSettings.deepseekKey || '');
  const [dsBase, setDsBase] = useState(initialSettings.deepseekBaseUrl || 'https://api.deepseek.com');
  const [dsModel, setDsModel] = useState(initialSettings.deepseekModel || 'deepseek-chat');

  const save = () => {
    storage.saveAiSettings({
      deepseekKey: dsKey || null,
      deepseekBaseUrl: dsBase || null,
      deepseekModel: dsModel || null,
    });
    onClose();
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-base text-gray-600 mb-1">{t('DeepSeek API Key')}</label>
        <input
          className="w-full border rounded px-2 py-2 text-sm"
          placeholder={t('Paste your DeepSeek API Key (OpenAI-compatible)')}
          value={dsKey}
          onChange={(e) => setDsKey(e.target.value)}
        />
        <p className="text-xs text-gray-500 mt-1">{t('If provided, DeepSeek will be used preferentially for analysis.')}</p>
      </div>

      <div>
        <label className="block text-base text-gray-600 mb-1">{t('DeepSeek Base URL')}</label>
        <input
          className="w-full border rounded px-2 py-2 text-sm"
          placeholder={t('DeepSeek base URL (e.g., https://api.deepseek.com)')}
          value={dsBase}
          onChange={(e) => setDsBase(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-base text-gray-600 mb-1">{t('DeepSeek Model')}</label>
        <select className="w-full border rounded px-2 py-2 text-sm" value={dsModel} onChange={(e) => setDsModel(e.target.value)}>
          <option value="deepseek-chat">deepseek-chat (non-reasoning)</option>
          <option value="deepseek-reasoner">deepseek-reasoner (reasoning)</option>
        </select>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded border">{t('Cancel')}</button>
        <button onClick={save} className="px-4 py-2 rounded bg-blue-600 text-white">{t('Save')}</button>
      </div>
    </div>
  );
};

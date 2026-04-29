import React, { useEffect, useState } from 'react';
import { storage, type AiSettings } from '../../utils/storage';
import { t } from '../../i18n';
import { useAuth } from '../../context/useAuth';
import { cloud } from '../../utils/cloud';
import { showToast, getErrorMessage } from '../../utils/toast';

interface Props {
  onClose: () => void;
}

export const AiSettingsModal: React.FC<Props> = ({ onClose }) => {
  const { user, isConfigured } = useAuth();
  const [initialSettings] = useState(() => storage.getAiSettings());
  const [dsKey, setDsKey] = useState(initialSettings.deepseekKey || '');
  const [dsBase, setDsBase] = useState(initialSettings.deepseekBaseUrl || 'https://api.deepseek.com');
  const [dsModel, setDsModel] = useState(initialSettings.deepseekModel || 'deepseek-chat');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const settings = storage.getAiSettings();
    setDsKey(settings.deepseekKey || '');
    setDsBase(settings.deepseekBaseUrl || 'https://api.deepseek.com');
    setDsModel(settings.deepseekModel || 'deepseek-chat');
  }, [user?.id]);

  const save = async () => {
    const nextSettings: AiSettings = {
      deepseekKey: dsKey || null,
      deepseekBaseUrl: dsBase || null,
      deepseekModel: dsModel || null,
    };
    storage.saveAiSettings(nextSettings);

    if (user?.id && isConfigured) {
      setSaving(true);
      try {
        await cloud.upsertAiSettings(user.id, nextSettings);
        showToast(t('AI settings saved to your account'), 'success');
      } catch (err) {
        showToast(getErrorMessage(err) || t('Failed to save AI settings to cloud'));
      } finally {
        setSaving(false);
      }
    } else {
      showToast(t('AI settings saved locally'), 'success');
    }

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
        <p className="text-xs text-gray-500 mt-1">
          {user?.id && isConfigured ? t('This key is bound to your internal account and synced through Supabase.') : t('If provided, DeepSeek will be used preferentially for analysis.')}
        </p>
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
        <button onClick={() => void save()} disabled={saving} className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50">
          {saving ? t('Saving...') : t('Save')}
        </button>
      </div>
    </div>
  );
};

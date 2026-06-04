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
        <label className="mb-1.5 block text-sm font-medium text-primary-700">{t('DeepSeek API Key')}</label>
        <input
          type="password"
          className="glimmer-field w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all duration-200 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
          placeholder={t('Paste your DeepSeek API Key (OpenAI-compatible)')}
          value={dsKey}
          onChange={(e) => setDsKey(e.target.value)}
        />
        <p className="mt-1.5 text-xs leading-5 text-primary-500">
          {user?.id && isConfigured ? t('This key is bound to your internal account and synced through Supabase.') : t('If provided, DeepSeek will be used preferentially for analysis.')}
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-primary-700">{t('DeepSeek Base URL')}</label>
        <input
          className="glimmer-field w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all duration-200 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
          placeholder={t('DeepSeek base URL (e.g., https://api.deepseek.com)')}
          value={dsBase}
          onChange={(e) => setDsBase(e.target.value)}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-primary-700">{t('DeepSeek Model')}</label>
        <select
          className="glimmer-field w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all duration-200 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
          value={dsModel}
          onChange={(e) => setDsModel(e.target.value)}
        >
          <option value="deepseek-chat">deepseek-chat (non-reasoning)</option>
          <option value="deepseek-reasoner">deepseek-reasoner (reasoning)</option>
        </select>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="glimmer-card rounded-xl border px-4 py-2 text-sm font-medium text-primary-700 transition-colors">{t('Cancel')}</button>
        <button onClick={() => void save()} disabled={saving} className="glimmer-accent-button rounded-xl px-4 py-2 text-sm font-medium shadow-sm disabled:opacity-50">
          {saving ? t('Saving...') : t('Save')}
        </button>
      </div>
    </div>
  );
};

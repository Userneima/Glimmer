import React from 'react';
import { Download, FileText, LogIn, LogOut, RefreshCw, Settings2, ShieldCheck, Upload, UserRound } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { t } from '../../i18n';
import { DataSafetyPanel } from './DataSafetyPanel';
import { Modal } from './Modal';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: () => void;
  onExport: () => void;
  onRetrySync: () => void;
  onLogout: () => void;
  onOpenTemplate: () => void;
}

type SettingsTab = 'general' | 'data' | 'account';

type SettingsNavItem = {
  id: SettingsTab;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
};

const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  {
    id: 'general',
    label: '常规',
    description: '数据、模板与同步',
    icon: Settings2,
  },
  {
    id: 'data',
    label: '数据安全',
    description: '备份、恢复与队列',
    icon: ShieldCheck,
  },
  {
    id: 'account',
    label: '账号',
    description: '登录与退出',
    icon: UserRound,
  },
];

const SettingsSection: React.FC<{ title: string; description: string; children: React.ReactNode }> = ({
  title,
  description,
  children,
}) => (
  <section className="space-y-3">
    <div>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </div>
    {children}
  </section>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onImport,
  onExport,
  onRetrySync,
  onLogout,
  onOpenTemplate,
}) => {
  const [activeTab, setActiveTab] = React.useState<SettingsTab>('general');
  const { user, isConfigured, requestSignIn } = useAuth();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('Settings')} maxWidth="4xl">
      <div className="grid min-h-[520px] gap-5 md:grid-cols-[190px_1fr]">
        <nav className="glimmer-card rounded-2xl border p-1.5">
          <div className="grid grid-cols-3 gap-1 md:grid-cols-1">
            {SETTINGS_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-center transition-all active:scale-[0.98] md:flex-row md:items-start md:gap-3 md:px-3 md:text-left ${
                    isActive
                      ? 'glimmer-card-active text-sky-700 shadow-sm'
                      : 'text-slate-500 hover:bg-[var(--glimmer-surface-card-hover)] hover:text-slate-800'
                  }`}
                >
                  <span
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      isActive ? 'glimmer-info-strip text-sky-600' : 'glimmer-card text-slate-400'
                    }`}
                  >
                    <Icon size={16} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold md:text-sm">{item.label}</span>
                    <span className="mt-0.5 hidden text-xs leading-4 text-slate-400 md:block">{item.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="min-w-0">
          {activeTab === 'general' && (
            <div className="space-y-6">
              <SettingsSection
                title={t('Data Management')}
                description="导入的内容会写进这台电脑；登录了云同步的话，也会同步到云端。导出只生成文件。"
              >
                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={() => {
                      onImport();
                      onClose();
                    }}
                    className="glimmer-action-row flex items-center gap-4 rounded-2xl p-4 text-left transition-colors"
                  >
                    <div className="glimmer-action-icon-success flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl">
                      <Upload size={19} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-medium text-slate-800">{t('Import diaries and folders')}</h4>
                      <p className="mt-1 text-sm leading-5 text-slate-500">{t('Import from JSON, MD, HTML, TXT, DOCX, PDF')}</p>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      onExport();
                      onClose();
                    }}
                    className="glimmer-action-row flex items-center gap-4 rounded-2xl p-4 text-left transition-colors"
                  >
                    <div className="glimmer-action-icon flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl">
                      <Download size={19} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-medium text-slate-800">{t('Export diaries')}</h4>
                      <p className="mt-1 text-sm leading-5 text-slate-500">{t('Export to JSON, MD, HTML, DOCX, PDF')}</p>
                    </div>
                  </button>
                </div>
              </SettingsSection>

              <SettingsSection
                title="新日记模板"
                description="每次新建日记都会复制这份模板的标题和正文。改动只影响之后新建的日记；登录云同步时，其他设备也会用这份模板。"
              >
                <button
                  onClick={() => {
                    onClose();
                    onOpenTemplate();
                  }}
                  className="glimmer-action-row flex w-full items-center gap-4 rounded-2xl p-4 text-left transition-colors"
                >
                  <div className="glimmer-action-icon flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl">
                    <FileText size={19} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-medium text-slate-800">编辑模板</h4>
                    <p className="mt-1 text-sm leading-5 text-slate-500">在编辑器里打开模板</p>
                  </div>
                </button>
              </SettingsSection>

              <SettingsSection
                title={t('Cloud Sync')}
                description="手动同步只重试当前账号相关数据，适合网络恢复后使用。"
              >
                <button
                  onClick={onRetrySync}
                  className="glimmer-action-row flex w-full items-center gap-4 rounded-2xl p-4 text-left transition-colors"
                >
                  <div className="glimmer-action-icon flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl">
                    <RefreshCw size={19} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-medium text-slate-800">{t('Manual sync')}</h4>
                    <p className="mt-1 text-sm leading-5 text-slate-500">{t('Sync data with cloud storage')}</p>
                  </div>
                </button>
              </SettingsSection>
            </div>
          )}

          {activeTab === 'data' && <DataSafetyPanel />}

          {activeTab === 'account' && (
            <SettingsSection
              title="云同步账号"
              description="登录后日记会同步到云端。退出登录不会删掉这台电脑上的日记。"
            >
              {!isConfigured ? (
                <p className="text-sm text-slate-500">这个版本没有配置云同步。</p>
              ) : user ? (
                <div className="glimmer-card flex flex-col gap-3 rounded-2xl border px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500">当前账号</div>
                    <div className="mt-0.5 truncate text-sm font-medium text-slate-800">{user.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onLogout();
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-apple-lg border px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    <LogOut size={15} />
                    {t('Log out')}
                  </button>
                </div>
              ) : (
                <div className="glimmer-card flex flex-col gap-3 rounded-2xl border px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm text-slate-600">还没有登录，日记只存在这台电脑上。</div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      requestSignIn();
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-apple-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sky-600"
                  >
                    <LogIn size={15} />
                    {t('Sign in')}
                  </button>
                </div>
              )}
            </SettingsSection>
          )}
        </div>
      </div>
    </Modal>
  );
};

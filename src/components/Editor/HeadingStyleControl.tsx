import React from 'react';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { t } from '../../i18n';
import {
  EDITOR_HEADING_SIZE_LIMITS,
  getEditorHeadingSettings,
  resetEditorHeadingSettings,
  saveEditorHeadingSettings,
  type EditorHeadingSettings,
} from '../../utils/editorHeadingSettings';

type HeadingKey = keyof EditorHeadingSettings;

const HEADING_KEYS: HeadingKey[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

export const HeadingStyleControl: React.FC = () => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [settings, setSettings] = React.useState<EditorHeadingSettings>(() => getEditorHeadingSettings());
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const updateHeadingSize = (key: HeadingKey, value: number) => {
    setSettings((prev) => saveEditorHeadingSettings({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setSettings(resetEditorHeadingSettings());
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        title={t('Heading style')}
        aria-expanded={isOpen}
        className="flex h-10 w-10 items-center justify-center rounded-lg p-2 transition-colors duration-200 active:scale-95"
        style={{
          backgroundColor: isOpen ? 'var(--glimmer-surface-active)' : 'transparent',
          color: isOpen ? 'var(--aurora-accent)' : 'var(--aurora-secondary)',
        }}
        onMouseEnter={(event) => {
          if (isOpen) return;
          event.currentTarget.style.backgroundColor = 'var(--glimmer-surface-card-hover)';
          event.currentTarget.style.color = 'var(--aurora-accent)';
        }}
        onMouseLeave={(event) => {
          if (isOpen) return;
          event.currentTarget.style.backgroundColor = 'transparent';
          event.currentTarget.style.color = 'var(--aurora-secondary)';
        }}
      >
        <SlidersHorizontal size={18} strokeWidth={1.75} />
      </button>

      {isOpen && (
        <div
          className="fixed inset-x-3 bottom-4 z-50 max-h-[78vh] overflow-auto rounded-2xl border p-4 shadow-xl backdrop-blur-xl md:absolute md:bottom-auto md:left-0 md:right-auto md:top-[calc(100%+0.5rem)] md:w-[360px]"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: 'var(--glimmer-border)',
            boxShadow: '0 20px 55px rgba(15, 23, 42, 0.16)',
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-800">{t('Heading style')}</div>
              <div className="mt-0.5 text-xs text-slate-500">{t('Adjust body heading sizes')}</div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-apple-sm border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 active:scale-[0.98]"
            >
              <RotateCcw size={13} strokeWidth={1.8} />
              {t('Reset defaults')}
            </button>
          </div>

          <div className="space-y-2.5">
            {HEADING_KEYS.map((key, index) => {
              const limits = EDITOR_HEADING_SIZE_LIMITS[key];
              const level = index + 1;
              return (
                <label
                  key={key}
                  className="grid grid-cols-[2.75rem_1fr_3.5rem] items-center gap-3 rounded-xl border border-slate-200/75 bg-white/75 px-3 py-2.5"
                >
                  <span className="text-sm font-semibold text-slate-700">H{level}</span>
                  <input
                    type="range"
                    min={limits.min}
                    max={limits.max}
                    step="0.05"
                    value={settings[key]}
                    onChange={(event) => updateHeadingSize(key, Number(event.target.value))}
                    className="min-w-0 accent-sky-500"
                    aria-label={t(`Heading ${level}`)}
                  />
                  <span className="justify-self-end rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold tabular-nums text-sky-600">
                    {settings[key].toFixed(2)}x
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

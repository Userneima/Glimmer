export type EditorHeadingSettings = {
  h1: number;
  h2: number;
  h3: number;
  h4: number;
  h5: number;
  h6: number;
};

const STORAGE_KEY = 'glimmer-editor-heading-settings';

export const DEFAULT_EDITOR_HEADING_SETTINGS: EditorHeadingSettings = {
  h1: 1.85,
  h2: 1.45,
  h3: 1.18,
  h4: 1.08,
  h5: 1,
  h6: 0.94,
};

const HEADING_SIZE_LIMITS: Record<keyof EditorHeadingSettings, { min: number; max: number }> = {
  h1: { min: 1.35, max: 2.4 },
  h2: { min: 1.15, max: 2 },
  h3: { min: 1, max: 1.7 },
  h4: { min: 0.95, max: 1.45 },
  h5: { min: 0.9, max: 1.25 },
  h6: { min: 0.85, max: 1.15 },
};

const clampHeadingSize = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
};

export const getEditorHeadingSettings = (): EditorHeadingSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_EDITOR_HEADING_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<EditorHeadingSettings>;
    return {
      h1: clampHeadingSize(parsed.h1, DEFAULT_EDITOR_HEADING_SETTINGS.h1, HEADING_SIZE_LIMITS.h1.min, HEADING_SIZE_LIMITS.h1.max),
      h2: clampHeadingSize(parsed.h2, DEFAULT_EDITOR_HEADING_SETTINGS.h2, HEADING_SIZE_LIMITS.h2.min, HEADING_SIZE_LIMITS.h2.max),
      h3: clampHeadingSize(parsed.h3, DEFAULT_EDITOR_HEADING_SETTINGS.h3, HEADING_SIZE_LIMITS.h3.min, HEADING_SIZE_LIMITS.h3.max),
      h4: clampHeadingSize(parsed.h4, DEFAULT_EDITOR_HEADING_SETTINGS.h4, HEADING_SIZE_LIMITS.h4.min, HEADING_SIZE_LIMITS.h4.max),
      h5: clampHeadingSize(parsed.h5, DEFAULT_EDITOR_HEADING_SETTINGS.h5, HEADING_SIZE_LIMITS.h5.min, HEADING_SIZE_LIMITS.h5.max),
      h6: clampHeadingSize(parsed.h6, DEFAULT_EDITOR_HEADING_SETTINGS.h6, HEADING_SIZE_LIMITS.h6.min, HEADING_SIZE_LIMITS.h6.max),
    };
  } catch (err) {
    console.warn('Failed to read editor heading settings', err);
    return DEFAULT_EDITOR_HEADING_SETTINGS;
  }
};

export const applyEditorHeadingSettings = (settings = getEditorHeadingSettings()) => {
  const root = document.documentElement;
  root.style.setProperty('--editor-heading-1-size', `${settings.h1}em`);
  root.style.setProperty('--editor-heading-2-size', `${settings.h2}em`);
  root.style.setProperty('--editor-heading-3-size', `${settings.h3}em`);
  root.style.setProperty('--editor-heading-4-size', `${settings.h4}em`);
  root.style.setProperty('--editor-heading-5-size', `${settings.h5}em`);
  root.style.setProperty('--editor-heading-6-size', `${settings.h6}em`);
};

export const saveEditorHeadingSettings = (settings: EditorHeadingSettings) => {
  const normalized = {
    h1: clampHeadingSize(settings.h1, DEFAULT_EDITOR_HEADING_SETTINGS.h1, HEADING_SIZE_LIMITS.h1.min, HEADING_SIZE_LIMITS.h1.max),
    h2: clampHeadingSize(settings.h2, DEFAULT_EDITOR_HEADING_SETTINGS.h2, HEADING_SIZE_LIMITS.h2.min, HEADING_SIZE_LIMITS.h2.max),
    h3: clampHeadingSize(settings.h3, DEFAULT_EDITOR_HEADING_SETTINGS.h3, HEADING_SIZE_LIMITS.h3.min, HEADING_SIZE_LIMITS.h3.max),
    h4: clampHeadingSize(settings.h4, DEFAULT_EDITOR_HEADING_SETTINGS.h4, HEADING_SIZE_LIMITS.h4.min, HEADING_SIZE_LIMITS.h4.max),
    h5: clampHeadingSize(settings.h5, DEFAULT_EDITOR_HEADING_SETTINGS.h5, HEADING_SIZE_LIMITS.h5.min, HEADING_SIZE_LIMITS.h5.max),
    h6: clampHeadingSize(settings.h6, DEFAULT_EDITOR_HEADING_SETTINGS.h6, HEADING_SIZE_LIMITS.h6.min, HEADING_SIZE_LIMITS.h6.max),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  applyEditorHeadingSettings(normalized);
  return normalized;
};

export const resetEditorHeadingSettings = () => {
  localStorage.removeItem(STORAGE_KEY);
  applyEditorHeadingSettings(DEFAULT_EDITOR_HEADING_SETTINGS);
  return DEFAULT_EDITOR_HEADING_SETTINGS;
};

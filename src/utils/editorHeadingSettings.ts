export type EditorHeadingSettings = {
  h1: number;
  h2: number;
  h3: number;
};

const STORAGE_KEY = 'glimmer-editor-heading-settings';

export const DEFAULT_EDITOR_HEADING_SETTINGS: EditorHeadingSettings = {
  h1: 1.85,
  h2: 1.45,
  h3: 1.18,
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
      h1: clampHeadingSize(parsed.h1, DEFAULT_EDITOR_HEADING_SETTINGS.h1, 1.35, 2.4),
      h2: clampHeadingSize(parsed.h2, DEFAULT_EDITOR_HEADING_SETTINGS.h2, 1.15, 2),
      h3: clampHeadingSize(parsed.h3, DEFAULT_EDITOR_HEADING_SETTINGS.h3, 1, 1.7),
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
};

export const saveEditorHeadingSettings = (settings: EditorHeadingSettings) => {
  const normalized = {
    h1: clampHeadingSize(settings.h1, DEFAULT_EDITOR_HEADING_SETTINGS.h1, 1.35, 2.4),
    h2: clampHeadingSize(settings.h2, DEFAULT_EDITOR_HEADING_SETTINGS.h2, 1.15, 2),
    h3: clampHeadingSize(settings.h3, DEFAULT_EDITOR_HEADING_SETTINGS.h3, 1, 1.7),
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

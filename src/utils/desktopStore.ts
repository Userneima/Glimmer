import { invoke } from '@tauri-apps/api/core';

type DesktopStoreEntries = Record<string, string>;

const DATA_KEY_PREFIXES = [
  'diaries',
  'folders',
  'tasks',
  'tags',
  'diary_tag_colors',
  'analyses',
  'auto_analysis_state',
  'diary_insights',
  'review_digests',
  'long_term_ideas',
  'ai_settings',
  'sync_queue',
  'sync_history',
];

const BACKUP_KEY_PREFIX = 'diaries_backups';
const SUPABASE_AUTH_KEY_PATTERN = /^sb-.+-auth-token$/;

let active = false;
let ready = false;
let entries: DesktopStoreEntries = {};
let writeTimer: number | null = null;

export const isTauriRuntime = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const shouldMoveToDesktopStore = (key: string) => {
  if (key === BACKUP_KEY_PREFIX || key.startsWith(`${BACKUP_KEY_PREFIX}-`)) return false;
  return DATA_KEY_PREFIXES.some((prefix) => key === prefix || key.startsWith(`${prefix}-`));
};

const isSupabaseAuthKey = (key: string) => SUPABASE_AUTH_KEY_PATTERN.test(key);

const collectLocalStorageKeys = () => {
  const keys: string[] = [];
  if (typeof localStorage === 'undefined') return keys;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key) keys.push(key);
  }
  return keys;
};

const removeInBrowserBackups = () => {
  if (typeof localStorage === 'undefined') return;
  collectLocalStorageKeys()
    .filter((key) => key === BACKUP_KEY_PREFIX || key.startsWith(`${BACKUP_KEY_PREFIX}-`))
    .forEach((key) => localStorage.removeItem(key));
};

const restoreAuthTokensToLocalStorage = () => {
  if (typeof localStorage === 'undefined') return;
  Object.entries(entries).forEach(([key, value]) => {
    if (!isSupabaseAuthKey(key)) return;
    if (!value.trim()) return;
    const current = localStorage.getItem(key);
    if (current == null || !current.trim()) {
      localStorage.setItem(key, value);
    }
  });
};

const persistNow = async () => {
  if (!active) return;
  await invoke('write_desktop_store', {
    payload: {
      entries,
    },
  });
};

const schedulePersist = () => {
  if (!active || typeof window === 'undefined') return;
  if (writeTimer !== null) {
    window.clearTimeout(writeTimer);
  }
  writeTimer = window.setTimeout(() => {
    writeTimer = null;
    void persistNow().catch((err) => {
      console.warn('[desktop-store] Failed to persist store', err);
    });
  }, 120);
};

export const hydrateDesktopStore = async () => {
  if (!isTauriRuntime()) {
    ready = true;
    return;
  }

  try {
    entries = await invoke<DesktopStoreEntries>('read_desktop_store');
    active = true;

    let changed = false;
    const migratedKeys: string[] = [];
    collectLocalStorageKeys().forEach((key) => {
      const isAuthKey = isSupabaseAuthKey(key);
      if (!shouldMoveToDesktopStore(key) && !isAuthKey) return;
      const value = localStorage.getItem(key);
      if (value == null) return;
      if (isAuthKey && !value.trim()) return;
      if ((isAuthKey && entries[key] !== value) || (!isAuthKey && entries[key] == null)) {
        entries[key] = value;
        changed = true;
      }
      if (!isAuthKey) {
        migratedKeys.push(key);
      }
    });

    removeInBrowserBackups();
    restoreAuthTokensToLocalStorage();
    if (changed) {
      await persistNow();
    }
    migratedKeys.forEach((key) => localStorage.removeItem(key));
  } catch (err) {
    active = false;
    console.warn('[desktop-store] Falling back to localStorage', err);
  } finally {
    ready = true;
  }
};

export const isDesktopStoreActive = () => active && ready;

export const getDesktopStoreItem = (key: string): string | null => {
  if (!isDesktopStoreActive()) return null;
  return entries[key] ?? null;
};

export const setDesktopStoreItem = (key: string, value: string) => {
  if (!isDesktopStoreActive()) return false;
  entries[key] = value;
  schedulePersist();
  return true;
};

export const removeDesktopStoreItem = (key: string) => {
  if (!isDesktopStoreActive()) return false;
  delete entries[key];
  schedulePersist();
  return true;
};

export const rememberDesktopAuthTokens = async () => {
  if (!isDesktopStoreActive() || typeof localStorage === 'undefined') return false;

  let changed = false;
  collectLocalStorageKeys()
    .filter(isSupabaseAuthKey)
    .forEach((key) => {
      const value = localStorage.getItem(key);
      if (value != null && value.trim() && entries[key] !== value) {
        entries[key] = value;
        changed = true;
      }
    });

  if (changed) {
    await persistNow();
  }
  return changed;
};

export const forgetDesktopAuthTokens = async () => {
  if (!isDesktopStoreActive()) return false;

  const authKeys = Object.keys(entries).filter(isSupabaseAuthKey);
  if (authKeys.length === 0) return false;
  authKeys.forEach((key) => {
    delete entries[key];
  });
  await persistNow();
  return true;
};

export const flushDesktopStore = () => persistNow();

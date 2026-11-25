import { useCallback, useEffect, useState } from 'react';

const NIGHT_START_HOUR = 18;
const DAY_START_HOUR = 6;
const THEME_OVERRIDE_KEY = 'glimmer-theme-override';

export type GlimmerTheme = 'light' | 'dark';

const getTimeTheme = (date = new Date()) => {
  const hour = date.getHours();
  return hour >= NIGHT_START_HOUR || hour < DAY_START_HOUR ? 'dark' : 'light';
};

const getStoredTheme = (): GlimmerTheme | null => {
  try {
    const stored = localStorage.getItem(THEME_OVERRIDE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
};

const applyTheme = (theme: GlimmerTheme) => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
};

export const useAutoTimeTheme = () => {
  const [theme, setTheme] = useState<GlimmerTheme>(() => getStoredTheme() ?? getTimeTheme());

  useEffect(() => {
    const syncTheme = () => {
      const nextTheme = getStoredTheme() ?? getTimeTheme();
      applyTheme(nextTheme);
      setTheme(nextTheme);
    };

    syncTheme();
    const intervalId = window.setInterval(syncTheme, 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => {
      const nextTheme: GlimmerTheme = currentTheme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(THEME_OVERRIDE_KEY, nextTheme);
      } catch (err) {
        console.warn('Failed to save theme override', err);
      }
      applyTheme(nextTheme);
      return nextTheme;
    });
  }, []);

  return { theme, toggleTheme };
};

'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { catalogs, TranslationKey } from '@/i18n/catalogs';

export type UiLocale = 'en' | 'es';
export type ThemePreference = 'light' | 'dark' | 'system';

const LOCALE_KEY = 'meetpulse-ui-locale';
const THEME_KEY = 'meetpulse-theme';

function systemLocale(): UiLocale {
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
}

function resolveTheme(theme: ThemePreference): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

type UiPreferencesContextValue = {
  locale: UiLocale;
  setLocale: (locale: UiLocale) => void;
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  resolvedTheme: 'light' | 'dark';
  t: (key: TranslationKey) => string;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};

const UiPreferencesContext = createContext<UiPreferencesContextValue | null>(null);

export function UiPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<UiLocale>('en');
  const [theme, setThemeState] = useState<ThemePreference>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const storedLocale = window.localStorage.getItem(LOCALE_KEY);
    const storedTheme = window.localStorage.getItem(THEME_KEY);
    setLocaleState(storedLocale === 'es' || storedLocale === 'en' ? storedLocale : systemLocale());
    setThemeState(storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system' ? storedTheme : 'system');
  }, []);

  useEffect(() => {
    const apply = () => {
      const next = resolveTheme(theme);
      setResolvedTheme(next);
      document.documentElement.classList.toggle('dark', next === 'dark');
      document.documentElement.dataset.theme = next;
      document.documentElement.style.colorScheme = next;
    };
    apply();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: UiLocale) => {
    window.localStorage.setItem(LOCALE_KEY, next);
    setLocaleState(next);
  }, []);

  const setTheme = useCallback((next: ThemePreference) => {
    window.localStorage.setItem(THEME_KEY, next);
    setThemeState(next);
  }, []);

  const value = useMemo<UiPreferencesContextValue>(() => ({
    locale,
    setLocale,
    theme,
    setTheme,
    resolvedTheme,
    t: key => catalogs[locale][key],
    formatDate: (value, options) => new Intl.DateTimeFormat(locale, options).format(new Date(value)),
    formatNumber: (value, options) => new Intl.NumberFormat(locale, options).format(value),
  }), [locale, resolvedTheme, setLocale, setTheme, theme]);

  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
}

export function useUiPreferences() {
  const context = useContext(UiPreferencesContext);
  if (!context) throw new Error('useUiPreferences must be used within UiPreferencesProvider');
  return context;
}

export function useTranslation() {
  const { locale, t, formatDate, formatNumber } = useUiPreferences();
  return { locale, t, formatDate, formatNumber };
}

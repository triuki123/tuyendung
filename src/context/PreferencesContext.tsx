'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Language } from '@/lib/i18n';
import { LIGHT_THEME_ENABLED } from '@/lib/config/featureFlags';

export type Theme = 'light' | 'dark' | 'auto';

interface Preferences {
  language: Language;
  theme: Theme;
}

interface PreferencesContextType {
  preferences: Preferences;
  setLanguage: (lang: Language) => Promise<void>;
  setTheme: (theme: Theme) => Promise<void>;
  isLoading: boolean;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);
const recruitmentFocus = process.env.NEXT_PUBLIC_RECRUITMENT_FOCUS === 'true';

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>({
    language: 'vi',
    theme: recruitmentFocus ? 'light' : 'dark',
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (recruitmentFocus) {
      applyTheme('light');
      setIsLoading(false);
      return;
    }
    // Áp ngay theme đã lưu (đồng bộ với script chống-nháy) trước khi gọi DB
    const stored = (() => { try { return localStorage.getItem('assetflow_theme') as Theme | null; } catch { return null; } })();
    const initial: Theme = stored ?? 'dark';
    setPreferences(prev => ({ ...prev, theme: initial }));
    applyTheme(initial);
    loadPreferences();
  }, []);

  useEffect(() => {
    if (recruitmentFocus) return;
    const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;
    if (userId) {
      loadPreferences();
    }
  }, []);

  const loadPreferences = async () => {
    try {
      const userId = typeof window !== 'undefined' ? (() => {
        const currentUser = localStorage.getItem('currentUser') || localStorage.getItem('assetflow_auth');
        if (currentUser) {
          try {
            const user = JSON.parse(currentUser);
            return user.id;
          } catch {
            return null;
          }
        }
        return null;
      })() : null;
      if (!userId) {
        setIsLoading(false);
        return;
      }

      const response = await fetch(`/api/users/${userId}`);
      if (response.ok) {
        const user = await response.json();
        const newPrefs: Preferences = {
          language: user.preferred_language || 'vi',
          theme: user.preferred_theme || 'dark',
        };
        setPreferences(newPrefs);
        applyTheme(newPrefs.theme);
      }
    } catch (error) {
      console.error('Failed to load preferences:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setLanguage = async (lang: Language) => {
    const userId = typeof window !== 'undefined' ? (() => {
      const currentUser = localStorage.getItem('currentUser') || localStorage.getItem('assetflow_auth');
      if (currentUser) {
        try {
          const user = JSON.parse(currentUser);
          return user.id;
        } catch {
          return null;
        }
      }
      return null;
    })() : null;
    if (!userId) return;

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferred_language: lang }),
      });

      if (response.ok) {
        setPreferences(prev => ({ ...prev, language: lang }));
      }
    } catch (error) {
      console.error('Failed to update language:', error);
    }
  };

  const setTheme = async (theme: Theme) => {
    // Áp ngay (optimistic) — đổi giao diện tức thì kể cả khi chưa đăng nhập / DB lỗi
    setPreferences(prev => ({ ...prev, theme }));
    applyTheme(theme);

    const userId = typeof window !== 'undefined' ? (() => {
      const currentUser = localStorage.getItem('currentUser') || localStorage.getItem('assetflow_auth');
      if (currentUser) {
        try {
          const user = JSON.parse(currentUser);
          return user.id;
        } catch {
          return null;
        }
      }
      return null;
    })() : null;
    if (!userId) return; // chưa đăng nhập: giữ lựa chọn ở localStorage

    try {
      await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferred_theme: theme }),
      });
    } catch (error) {
      console.error('Failed to persist theme:', error);
    }
  };

  return (
    <PreferencesContext.Provider value={{ preferences, setLanguage, setTheme, isLoading }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within PreferencesProvider');
  }
  return context;
}

/**
 * Áp theme: tối là MẶC ĐỊNH (:root). Chỉ thêm class `.light` khi cần sáng.
 * Ghi localStorage để script chống-nháy trong layout áp ngay lần tải sau.
 */
function applyTheme(theme: Theme) {
  if (typeof window === 'undefined') return;

  const html = document.documentElement;
  // Cờ tắt ⇒ luôn dark (light bị khoá ở product); shim CSS không bao giờ kích hoạt.
  const isLight = recruitmentFocus || (
    LIGHT_THEME_ENABLED &&
    (theme === 'light' ||
      (theme === 'auto' && window.matchMedia('(prefers-color-scheme: light)').matches)));

  html.classList.toggle('light', isLight);
  html.classList.remove('dark'); // dọn class legacy (không còn dùng)
  html.style.setProperty('--theme', isLight ? 'light' : 'dark');

  try { localStorage.setItem('assetflow_theme', theme); } catch { /* noop */ }
}

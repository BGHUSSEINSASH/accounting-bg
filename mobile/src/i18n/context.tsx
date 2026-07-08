import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ar from './ar';
import en from './en';

type Language = 'ar' | 'en';

interface I18nContextType {
  lang: Language;
  t: (key: string) => string;
  setLang: (lang: Language) => void;
  isRtl: boolean;
}

const translations: Record<Language, Record<string, string>> = { ar, en };

const I18nContext = createContext<I18nContextType>({
  lang: 'ar',
  t: (key) => key,
  setLang: () => {},
  isRtl: true,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>('ar');

  useEffect(() => {
    AsyncStorage.getItem('language').then((saved) => {
      if (saved === 'en' || saved === 'ar') setLangState(saved);
    });
  }, []);

  const setLang = useCallback((l: Language) => {
    setLangState(l);
    AsyncStorage.setItem('language', l);
  }, []);

  const t = useCallback((key: string): string => {
    return translations[lang][key] || translations['ar'][key] || key;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, t, setLang, isRtl: lang === 'ar' }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}

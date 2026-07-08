import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import { getLanguage, setLanguage as setAppLang, subscribe } from '../store/appStore';
import ar from './ar';
import en from './en';
import ku from './ku';

type Language = 'ar' | 'en' | 'ku';

interface I18nContextType {
  lang: Language;
  t: (key: string) => string;
  setLang: (lang: Language) => void;
  dir: 'rtl' | 'ltr';
}

const translations: Record<Language, Record<string, string>> = { ar, en, ku };

const I18nContext = createContext<I18nContextType>({
  lang: 'ar',
  t: (key: string) => key,
  setLang: () => {},
  dir: 'rtl',
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(getLanguage());

  useEffect(() => subscribe(() => setLangState(getLanguage())), []);

  const setLang = useCallback((l: Language) => {
    setAppLang(l);
  }, []);

  const t = useCallback((key: string): string => {
    return translations[lang][key] || translations['en'][key] || translations['ar'][key] || key;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, t, setLang, dir: lang === 'en' ? 'ltr' : 'rtl' }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}

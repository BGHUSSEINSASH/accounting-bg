import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

type Theme = 'light' | 'dark';
type Language = 'ar' | 'en' | 'ku';

interface Currency {
  code: string;
  name: string;
  symbol: string;
  exchange_rate: number;
  is_base: number;
}

let globalTheme: Theme = (localStorage.getItem('theme') as Theme) || 'light';
let globalLang: Language = (localStorage.getItem('language') as Language) || 'ar';
let globalCurrency = localStorage.getItem('currency') || 'IQD';
let globalSymbol = 'د.ع';
let listeners: Array<() => void> = [];

function notify() { listeners.forEach(fn => fn()); }

export function getTheme(): Theme { return globalTheme; }
export function getLanguage(): Language { return globalLang; }
export function getDefaultCurrency(): string { return globalCurrency; }
export function getCurrencySymbol(): string { return globalSymbol; }

export function setTheme(t: Theme) {
  globalTheme = t;
  localStorage.setItem('theme', t);
  document.documentElement.classList.toggle('dark', t === 'dark');
  notify();
}

export function toggleTheme() {
  setTheme(globalTheme === 'dark' ? 'light' : 'dark');
}

export function setLanguage(l: Language) {
  globalLang = l;
  localStorage.setItem('language', l);
  document.documentElement.setAttribute('lang', l);
  document.documentElement.setAttribute('dir', l === 'en' ? 'ltr' : 'rtl');
  notify();
}

export function setDefaultCurrency(code: string) {
  globalCurrency = code;
  localStorage.setItem('currency', code);
  // Fetch the symbol from the currencies list or use defaults
  const symbols: Record<string, string> = {
    IQD: 'د.ع', SAR: 'ر.س', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ',
    EGP: 'ج.م', KWD: 'د.ك', QAR: 'ر.ق', BHD: 'د.ب', OMR: 'ر.ع',
  };
  globalSymbol = symbols[code] || code;
  notify();
}

export function subscribe(fn: () => void) {
  listeners.push(fn);
  return () => { listeners = listeners.filter(f => f !== fn); };
}

export function useTheme() {
  const [, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick(t => t + 1)), []);
  return { theme: globalTheme, toggleTheme, setTheme, isDark: globalTheme === 'dark' };
}

export function useLanguage() {
  const [, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick(t => t + 1)), []);
  return { language: globalLang, setLanguage, isRtl: globalLang !== 'en' };
}

export function useCurrency() {
  const [, setTick] = useState(0);
  useEffect(() => {
    api.get('/settings').then(({ data }) => {
      const settingsObj = data as Record<string, string>;
      const currCode = settingsObj['default_currency'];
      if (currCode) setDefaultCurrency(currCode);
    }).catch(() => {});
    return subscribe(() => setTick(t => t + 1));
  }, []);
  return { currency: globalCurrency, symbol: globalSymbol, setDefaultCurrency };
}

export function useApp() {
  const theme = useTheme();
  const lang = useLanguage();
  const curr = useCurrency();
  return { ...theme, ...lang, ...curr };
}

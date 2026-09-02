/**
 * خدمة العملات للتطبيق المحمول — تجلب العملات من الخادم وتنسق المبالغ
 */
import api from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  exchange_rate: number;
  is_base: number;
}

let currencies: Currency[] = [];
let defaultCurrency = 'IQD';
let loaded = false;

const FALLBACK: Currency[] = [
  { code: 'IQD', name: 'الدينار العراقي', symbol: 'د.ع', exchange_rate: 1, is_base: 1 },
  { code: 'USD', name: 'الدولار الأمريكي', symbol: '$', exchange_rate: 1450, is_base: 0 },
  { code: 'EUR', name: 'اليورو', symbol: '€', exchange_rate: 1580, is_base: 0 },
  { code: 'SAR', name: 'الريال السعودي', symbol: 'ر.س', exchange_rate: 385, is_base: 0 },
  { code: 'AED', name: 'الدرهم الإماراتي', symbol: 'د.إ', exchange_rate: 395, is_base: 0 },
];

export async function loadCurrencies(): Promise<void> {
  if (loaded) return;
  try {
    const res = await api.get('/accounting-advanced/currencies');
    currencies = (res.data.value || res.data || []).filter((c: any) => c.is_active);
    if (currencies.length === 0) currencies = FALLBACK;
    const settings = await api.get('/settings');
    defaultCurrency = settings.data?.default_currency || 'IQD';
  } catch {
    // بدون اتصال: استخدم آخر نسخة محفوظة أو الافتراضي
    try {
      const saved = await AsyncStorage.getItem('currencies_cache');
      if (saved) currencies = JSON.parse(saved);
    } catch { /* ignore */ }
    if (currencies.length === 0) currencies = FALLBACK;
  }
  try { await AsyncStorage.setItem('currencies_cache', JSON.stringify(currencies)); } catch { /* ignore */ }
  loaded = true;
}

export function getSymbol(code?: string): string {
  const target = code || defaultCurrency;
  return currencies.find(c => c.code === target)?.symbol || target;
}

export function formatMoney(amount: number, code?: string): string {
  const target = code || defaultCurrency;
  const symbol = getSymbol(target);
  const decimals = target === 'IQD' ? 0 : (target === 'KWD' || target === 'BHD' || target === 'OMR') ? 3 : 2;
  return `${(amount ?? 0).toFixed(decimals)} ${symbol}`;
}

export function getDefaultCurrency(): string {
  return defaultCurrency;
}

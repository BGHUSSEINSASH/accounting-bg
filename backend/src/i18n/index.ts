import en from './en.json';
import ar from './ar.json';

const translations: Record<string, Record<string, string>> = { en, ar };

let currentLang: string = 'ar';

export function setLanguage(lang: string): void {
  currentLang = lang;
}

export function getLanguage(): string {
  return currentLang;
}

export function t(key: string, lang?: string): string {
  const locale = lang || currentLang;
  return translations[locale]?.[key] || translations['en']?.[key] || key;
}

export function translateMessage(message: string, lang: string): string {
  const translations_map = translations[lang] || translations['en'] || {};
  for (const [key, value] of Object.entries(translations_map)) {
    if (message.toLowerCase().includes(value.toLowerCase())) {
      return message.replace(
        new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
        translations[lang === 'ar' ? 'en' : 'ar']?.[key] || value
      );
    }
  }
  return message;
}

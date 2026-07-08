import { useTranslation } from '../../i18n/context';
import { Languages } from 'lucide-react';

export default function LanguageSwitcher() {
  const { lang, setLang } = useTranslation();

  return (
    <button
      onClick={() => setLang(lang === 'ar' ? 'en' : lang === 'en' ? 'ku' : 'ar')}
      className="flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-gray-100 transition-colors"
      title={lang === 'ar' ? 'English' : lang === 'en' ? 'Kurdish' : 'العربية'}
    >
      <Languages className="w-4 h-4" />
      <span className="text-xs font-medium">{lang === 'ar' ? 'EN' : lang === 'en' ? 'KU' : 'AR'}</span>
    </button>
  );
}

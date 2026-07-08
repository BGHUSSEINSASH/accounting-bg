import { Printer } from 'lucide-react';
import { useTranslation } from '../../i18n/context';

interface PrintButtonProps {
  label?: string;
  className?: string;
}

export default function PrintButton({ label, className = '' }: PrintButtonProps) {
  const { t } = useTranslation();
  return (
    <button
      onClick={() => window.print()}
      className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors ${className}`}
    >
      <Printer className="w-4 h-4" />
      {label || t('common.print')}
    </button>
  );
}

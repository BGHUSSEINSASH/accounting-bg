import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

interface Crumb {
  label: string;
  path?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-4">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronLeft className="w-3 h-3" />}
          {item.path ? (
            <Link to={item.path} className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-900 dark:text-gray-100 font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useTranslation } from '../../i18n/context';

interface Column {
  key: string;
  label: string;
  render?: (value: any, row: any) => React.ReactNode;
  sortable?: boolean;
}

interface DataTableProps {
  columns: Column[];
  data: any[];
  loading?: boolean;
  searchable?: boolean;
  searchValue?: string;
  onSearch?: (value: string) => void;
  page?: number;
  total?: number;
  limit?: number;
  onPageChange?: (page: number) => void;
}

export default function DataTable({ columns, data, loading, searchable, searchValue, onSearch, page = 1, total = 0, limit = 20, onPageChange }: DataTableProps) {
  const { t } = useTranslation();
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="card">
      {searchable && (
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input type="text" value={searchValue || ''} onChange={(e) => onSearch?.(e.target.value)} placeholder={t('common.search')} className="input-field pr-10" />
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="table-header">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-8 text-gray-500 dark:text-gray-400">{t('common.loading')}</td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-8 text-gray-500 dark:text-gray-400">{t('common.no_data')}</td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr key={row.id || i} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  {columns.map((col) => (
                    <td key={col.key} className="table-cell">
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.total')} {total}</p>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => onPageChange?.(page - 1)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
              <ChevronRight className="w-4 h-4 dark:text-gray-400" />
            </button>
            <span className="text-sm dark:text-gray-300">{page} {t('pagination.of')} {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => onPageChange?.(page + 1)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
              <ChevronLeft className="w-4 h-4 dark:text-gray-400" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

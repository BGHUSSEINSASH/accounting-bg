import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import { formatCurrency } from '../../utils/format';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useTranslation } from '../../i18n/context';

export default function IncomeStatementPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/accounts/income-statement');
        setData(res.data);
      } catch {
        setError(true);
        toast.error(t('error.load'));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="text-center py-8">{t('common.loading')}</div>;
  if (error || !data) return <div className="text-center py-8 text-red-500">{t('error.load')}</div>;

  return (
    <div>
      <PageHeader title={t('income_statement.title')} subtitle={`${t('common.from')} ${data.from} ${t('common.to')} ${data.to}`} actions={<PrintButton />} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-green-600"><TrendingUp className="w-5 h-5" /> {t('income_statement.revenue')}</h3>
          <div className="space-y-2">
            {data.income.map((a: any) => (
              <div key={a.id} className="flex justify-between py-2 border-b border-gray-50">
                <span>{a.name}</span>
                <span className="font-mono">{formatCurrency(Math.abs(a.balance))}</span>
              </div>
            ))}
            <div className="flex justify-between pt-3 font-bold text-green-600">
              <span>{t('income_statement.total_revenue')}</span>
              <span>{formatCurrency(data.total_income)}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-red-600"><TrendingDown className="w-5 h-5" /> {t('income_statement.expenses')}</h3>
          <div className="space-y-2">
            {data.expense.map((a: any) => (
              <div key={a.id} className="flex justify-between py-2 border-b border-gray-50">
                <span>{a.name}</span>
                <span className="font-mono">{formatCurrency(Math.abs(a.balance))}</span>
              </div>
            ))}
            <div className="flex justify-between pt-3 font-bold text-red-600">
              <span>{t('income_statement.total_expenses')}</span>
              <span>{formatCurrency(data.total_expense)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-6">
        <div className="flex justify-between items-center text-xl">
          <span className="font-bold">{t('income_statement.net_profit')}</span>
          <span className={`font-bold font-mono ${data.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(data.net_profit)}
          </span>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import { formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function BalanceSheetPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/accounts/balance-sheet');
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
      <PageHeader title={t('balance_sheet.title')} actions={<PrintButton />} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card"><h3 className="font-semibold mb-4 text-blue-600">{t('balance_sheet.assets')}</h3>
          {data.assets.filter((a: any) => a.level >= 2).map((a: any) => (
            <div key={a.id} className="flex justify-between py-2 border-b border-gray-50"><span>{a.name}</span><span className="font-mono">{formatCurrency(Math.abs(a.balance))}</span></div>
          ))}
          <div className="flex justify-between pt-3 font-bold text-blue-600"><span>{t('balance_sheet.total_assets')}</span><span>{formatCurrency(data.total_assets)}</span></div>
        </div>
        <div className="card"><h3 className="font-semibold mb-4 text-red-600">{t('balance_sheet.liabilities')}</h3>
          {data.liabilities.filter((a: any) => a.level >= 2).map((a: any) => (
            <div key={a.id} className="flex justify-between py-2 border-b border-gray-50"><span>{a.name}</span><span className="font-mono">{formatCurrency(Math.abs(a.balance))}</span></div>
          ))}
          <div className="flex justify-between pt-3 font-bold text-red-600"><span>{t('balance_sheet.total_liabilities')}</span><span>{formatCurrency(data.total_liabilities)}</span></div>
        </div>
        <div className="card"><h3 className="font-semibold mb-4 text-green-600">{t('balance_sheet.equity')}</h3>
          {data.equity.filter((a: any) => a.level >= 2).map((a: any) => (
            <div key={a.id} className="flex justify-between py-2 border-b border-gray-50"><span>{a.name}</span><span className="font-mono">{formatCurrency(Math.abs(a.balance))}</span></div>
          ))}
          <div className="flex justify-between pt-3 font-bold text-green-600"><span>{t('balance_sheet.total_equity')}</span><span>{formatCurrency(data.total_equity)}</span></div>
        </div>
      </div>
      <div className="card mt-6">
        <div className="flex justify-between items-center"><span className="font-bold">{t('balance_sheet.total_liabilities_equity')}</span><span className="font-bold font-mono text-lg">{formatCurrency(data.total_liabilities_equity)}</span></div>
      </div>
    </div>
  );
}

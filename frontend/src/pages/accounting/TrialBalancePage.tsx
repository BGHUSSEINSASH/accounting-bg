import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import { formatCurrency } from '../../utils/format';
import { ACCOUNT_TYPES } from '../../utils/constants';
import { useTranslation } from '../../i18n/context';

export default function TrialBalancePage() {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/accounts/trial-balance');
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
      <PageHeader title={t('trial_balance.title')} subtitle={`${t('trial_balance.as_of')} ${data.as_of}`} actions={<PrintButton />} />
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">{t('trial_balance.account_code')}</th>
                <th className="table-header">{t('trial_balance.account_name')}</th>
                <th className="table-header">{t('trial_balance.type')}</th>
                <th className="table-header text-left">{t('trial_balance.debit')}</th>
                <th className="table-header text-left">{t('trial_balance.credit')}</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((a: any) => (
                a.debit_balance !== 0 || a.credit_balance !== 0 ? (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="table-cell">{a.code}</td>
                    <td className="table-cell">{a.name}</td>
                    <td className="table-cell"><span className="badge badge-info">{ACCOUNT_TYPES.find(tp => tp.value === a.type)?.label}</span></td>
                    <td className="table-cell text-left font-mono">{a.debit_balance > 0 ? formatCurrency(a.debit_balance) : '-'}</td>
                    <td className="table-cell text-left font-mono">{a.credit_balance > 0 ? formatCurrency(a.credit_balance) : '-'}</td>
                  </tr>
                ) : null
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-bold">
                <td colSpan={3} className="table-cell text-left">{t('trial_balance.total')}</td>
                <td className="table-cell text-left">{formatCurrency(data.total_debit)}</td>
                <td className="table-cell text-left">{formatCurrency(data.total_credit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

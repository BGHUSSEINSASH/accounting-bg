import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import StatCard from '../../components/ui/StatCard';
import { formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function CashFlowPage() {
  const { t } = useTranslation();
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  useEffect(() => { fetchData(); }, [from, to]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [salesRes, expensesRes] = await Promise.all([
        api.get(`/sales?from=${from}&to=${to}`),
        api.get(`/expenses?from=${from}&to=${to}`),
      ]);
      const sales = salesRes.data.invoices || salesRes.data.data || salesRes.data || [];
      const expenses = expensesRes.data.expenses || expensesRes.data.data || expensesRes.data || [];
      const totalRevenue = sales.reduce((sum: number, inv: any) => sum + Number(inv.total || inv.subtotal || 0), 0);
      const totalExpenses = expenses.reduce((sum: number, exp: any) => sum + Number(exp.amount || 0), 0);
      const netOperating = totalRevenue - totalExpenses;
      setData({ totalRevenue, totalExpenses, netOperating, sales, expenses });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.load'));
    } finally { setLoading(false); }
  };

  return (
    <div>
      <Breadcrumbs items={[{ label: t('nav.accounting'), path: '/accounting' }, { label: t('cash_flow.title') }]} />
      <PageHeader title={t('cash_flow.title')} actions={<PrintButton />} />

      <div className="flex items-center gap-4 mb-6">
        <div><label className="block text-sm font-medium mb-1">{t('cash_flow.from_date')}</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input-field" /></div>
        <div><label className="block text-sm font-medium mb-1">{t('cash_flow.to_date')}</label><input type="date" value={to} onChange={e => setTo(e.target.value)} className="input-field" /></div>
        <button onClick={fetchData} className="btn-secondary mt-auto flex items-center gap-2"><RefreshCw className="w-4 h-4" /> {t('cash_flow.refresh')}</button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">{t('common.loading')}</div>
      ) : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <StatCard title={t('cash_flow.total_revenue')} value={formatCurrency(data.totalRevenue)} icon={<TrendingUp className="w-6 h-6" />} color="green" />
            <StatCard title={t('cash_flow.total_expenses')} value={formatCurrency(data.totalExpenses)} icon={<TrendingDown className="w-6 h-6" />} color="red" />
            <StatCard title={t('cash_flow.net_operating')} value={formatCurrency(data.netOperating)} icon={<DollarSign className="w-6 h-6" />} color={data.netOperating >= 0 ? 'green' : 'red'} />
          </div>

          <div className="card">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-green-600"><TrendingUp className="w-5 h-5" /> {t('cash_flow.operating')}</h3>
            <div className="space-y-3 pr-4">
              <div className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-gray-700">{t('cash_flow.revenue')}</span>
                <span className="font-mono font-medium text-green-600">{formatCurrency(data.totalRevenue)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-gray-700">{t('cash_flow.expenses')}</span>
                <span className="font-mono font-medium text-red-600">({formatCurrency(data.totalExpenses)})</span>
              </div>
              <div className="flex justify-between py-3 border-t-2 border-gray-200">
                <span className="font-bold text-lg">{t('cash_flow.net_operating_label')}</span>
                <span className={`font-bold font-mono text-lg ${data.netOperating >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(data.netOperating)}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-blue-600"><RefreshCw className="w-5 h-5" /> {t('cash_flow.investing')}</h3>
            <div className="space-y-3 pr-4">
              <div className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-gray-700">{t('cash_flow.purchase_assets')}</span>
                <span className="font-mono text-gray-400">{formatCurrency(0)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-gray-700">{t('cash_flow.sale_assets')}</span>
                <span className="font-mono text-gray-400">{formatCurrency(0)}</span>
              </div>
              <div className="flex justify-between py-3 border-t-2 border-gray-200">
                <span className="font-bold">{t('cash_flow.net_investing')}</span>
                <span className="font-bold font-mono text-gray-400">{formatCurrency(0)}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-purple-600"><DollarSign className="w-5 h-5" /> {t('cash_flow.financing')}</h3>
            <div className="space-y-3 pr-4">
              <div className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-gray-700">{t('cash_flow.loans')}</span>
                <span className="font-mono text-gray-400">{formatCurrency(0)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-gray-700">{t('cash_flow.capital_increase')}</span>
                <span className="font-mono text-gray-400">{formatCurrency(0)}</span>
              </div>
              <div className="flex justify-between py-3 border-t-2 border-gray-200">
                <span className="font-bold">{t('cash_flow.net_financing')}</span>
                <span className="font-bold font-mono text-gray-400">{formatCurrency(0)}</span>
              </div>
            </div>
          </div>

          <div className="card bg-gray-50 border-2 border-gray-200">
            <div className="flex justify-between items-center">
              <span className="text-xl font-bold">{t('cash_flow.total')}</span>
              <span className={`text-xl font-bold font-mono ${data.netOperating >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(data.netOperating)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">{t('common.no_results')}</div>
      )}
    </div>
  );
}

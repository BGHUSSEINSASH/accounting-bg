import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import { formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function ProfitReportPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/profit').then(r => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-8">{t('common.loading')}</div>;
  if (!data) return <div className="text-center py-8">{t('profit_report.no_data')}</div>;

  const chartData = data.data?.slice(-30) || [];

  return (
    <div>
      <PageHeader title={t('reports.profit')} actions={<PrintButton />} />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card"><div className="p-3 rounded-xl bg-blue-50 text-blue-600"><DollarSign className="w-6 h-6" /></div><div><p className="text-sm text-gray-500">{t('profit_report.revenue')}</p><p className="text-2xl font-bold">{formatCurrency(data.total_revenue)}</p></div></div>
        <div className="stat-card"><div className="p-3 rounded-xl bg-red-50 text-red-600"><TrendingDown className="w-6 h-6" /></div><div><p className="text-sm text-gray-500">{t('profit_report.costs')}</p><p className="text-2xl font-bold">{formatCurrency(data.total_cost)}</p></div></div>
        <div className="stat-card"><div className="p-3 rounded-xl bg-green-50 text-green-600"><TrendingUp className="w-6 h-6" /></div><div><p className="text-sm text-gray-500">{t('profit_report.net_profit')}</p><p className="text-2xl font-bold">{formatCurrency(data.total_profit)}</p></div></div>
      </div>

      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold">{t('profit_report.profit_margin')}</h3>
          <span className="text-2xl font-bold text-green-600">{data.profit_margin?.toFixed(1)}%</span>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="invoice_number" />
              <YAxis />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Bar dataKey="revenue" fill="#3b82f6" name={t('profit_report.revenue')} />
              <Bar dataKey="cost" fill="#ef4444" name={t('profit_report.costs')} />
              <Bar dataKey="profit" fill="#10b981" name={t('profit_report.net_profit')} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import { formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function SalesReportPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<any[]>([]);
  const [topClients, setTopClients] = useState<any[]>([]);
  const [topItems, setTopItems] = useState<any[]>([]);
  const [period, setPeriod] = useState({ from: '', to: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchReports(); }, []);

  const fetchReports = async () => {
    try {
      const params = new URLSearchParams();
      if (period.from) params.append('from', period.from);
      if (period.to) params.append('to', period.to);
      const [salesRes, clientsRes, itemsRes] = await Promise.all([
        api.get(`/reports/sales?${params}&group_by=day`),
        api.get(`/reports/top-clients?${params}&limit=5`),
        api.get(`/reports/top-items?${params}&limit=5`),
      ]);
      setData(salesRes.data.data);
      setTopClients(clientsRes.data);
      setTopItems(itemsRes.data);
    } finally { setLoading(false); }
  };

  return (
    <div>
      <PageHeader title={t('reports.sales')} actions={<PrintButton />} />
      
      <div className="flex gap-3 mb-6">
        <input type="date" value={period.from} onChange={e => setPeriod({ ...period, from: e.target.value })} className="input-field w-40" />
        <input type="date" value={period.to} onChange={e => setPeriod({ ...period, to: e.target.value })} className="input-field w-40" />
        <button onClick={fetchReports} className="btn-primary">{t('sales_report.update')}</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2">
          <h3 className="font-semibold mb-4">{t('sales_report.period_sales')}</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Line type="monotone" dataKey="total_sales" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name={t('reports.sales')} />
                <Line type="monotone" dataKey="total_collected" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name={t('sales_report.total_collected')} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card">
            <h3 className="font-semibold mb-4">{t('sales_report.top_clients')}</h3>
            <div className="space-y-3">
              {topClients.map((c: any, i: number) => (
                <div key={c.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">{i + 1}</span><span className="text-sm">{c.name}</span></div>
                  <span className="text-sm font-mono">{formatCurrency(c.total_purchases)}</span>
                </div>
              ))}
              {topClients.length === 0 && <p className="text-sm text-gray-400">{t('sales_report.no_data')}</p>}
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-4">{t('sales_report.top_items')}</h3>
            <div className="space-y-3">
              {topItems.map((i: any, idx: number) => (
                <div key={i.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">{idx + 1}</span><span className="text-sm">{i.name}</span></div>
                  <span className="text-sm">{i.total_qty} {t('sales_report.unit')}</span>
                </div>
              ))}
              {topItems.length === 0 && <p className="text-sm text-gray-400">{t('sales_report.no_data')}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { FileDown, TrendingUp, DollarSign, CreditCard, FileText } from 'lucide-react';
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
  const [exporting, setExporting] = useState(false);

  useEffect(() => { fetchReports(); }, []);

  const fetchReports = async () => {
    setLoading(true);
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

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get('/reports/export/sales');
      const rows: any[] = res.data;
      if (!rows.length) return;
      const headers = Object.keys(rows[0]);
      const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${r[h] ?? ''}"`).join(','))].join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales-report-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  // Compute summary from data
  const totalSales = data.reduce((s, d) => s + Number(d.total_sales || 0), 0);
  const totalPaid = data.reduce((s, d) => s + Number(d.total_collected || 0), 0);
  const totalRemaining = data.reduce((s, d) => s + Number(d.total_remaining || 0), 0);
  const invoiceCount = data.reduce((s, d) => s + Number(d.invoice_count || 0), 0);

  const summaryCards = [
    { label: t('sales_report.total_sales') || 'إجمالي المبيعات', value: formatCurrency(totalSales), icon: TrendingUp, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
    { label: t('sales_report.total_collected') || 'إجمالي المحصّل', value: formatCurrency(totalPaid), icon: DollarSign, color: 'text-green-600 bg-green-50 dark:bg-green-900/20' },
    { label: t('sales_report.total_remaining') || 'إجمالي المتبقي', value: formatCurrency(totalRemaining), icon: CreditCard, color: 'text-red-600 bg-red-50 dark:bg-red-900/20' },
    { label: t('sales_report.invoice_count') || 'عدد الفواتير', value: invoiceCount, icon: FileText, color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20' },
  ];

  return (
    <div>
      <PageHeader
        title={t('reports.sales')}
        actions={
          <div className="flex gap-2">
            <button onClick={handleExport} disabled={exporting} className="btn-secondary flex items-center gap-2 text-sm">
              <FileDown className="w-4 h-4" />
              {exporting ? t('common.loading') : (t('common.export') || 'تصدير Excel')}
            </button>
            <PrintButton />
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input type="date" value={period.from} onChange={e => setPeriod({ ...period, from: e.target.value })} className="input-field w-40" />
        <input type="date" value={period.to} onChange={e => setPeriod({ ...period, to: e.target.value })} className="input-field w-40" />
        <button onClick={fetchReports} className="btn-primary">{t('sales_report.update')}</button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {summaryCards.map((card) => (
          <div key={card.label} className="card flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${card.color}`}>
              <card.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{card.label}</p>
              <p className="text-base font-bold dark:text-white">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-10">{t('common.loading')}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Daily Trend Chart */}
          <div className="card lg:col-span-2">
            <h3 className="font-semibold mb-4 dark:text-white">{t('sales_report.period_sales')}</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Line type="monotone" dataKey="total_sales" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name={t('reports.sales')} />
                  <Line type="monotone" dataKey="total_collected" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name={t('sales_report.total_collected')} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-6">
            {/* Top 5 Clients */}
            <div className="card">
              <h3 className="font-semibold mb-4 dark:text-white">{t('sales_report.top_clients')}</h3>
              <div className="space-y-3">
                {topClients.map((c: any, i: number) => (
                  <div key={c.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                      <span className="text-sm dark:text-gray-200 truncate max-w-[120px]">{c.name}</span>
                    </div>
                    <span className="text-sm font-mono dark:text-gray-200">{formatCurrency(c.total_purchases)}</span>
                  </div>
                ))}
                {topClients.length === 0 && <p className="text-sm text-gray-400">{t('sales_report.no_data')}</p>}
              </div>
            </div>

            {/* Top 5 Items */}
            <div className="card">
              <h3 className="font-semibold mb-4 dark:text-white">{t('sales_report.top_items')}</h3>
              <div className="space-y-3">
                {topItems.map((item: any, idx: number) => (
                  <div key={item.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                      <span className="text-sm dark:text-gray-200 truncate max-w-[120px]">{item.name}</span>
                    </div>
                    <span className="text-sm dark:text-gray-200">{item.total_qty} {t('sales_report.unit')}</span>
                  </div>
                ))}
                {topItems.length === 0 && <p className="text-sm text-gray-400">{t('sales_report.no_data')}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

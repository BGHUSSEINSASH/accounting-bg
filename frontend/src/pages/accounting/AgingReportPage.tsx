import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Phone, MessageCircle, RefreshCw, ChevronDown, ChevronUp, Printer } from 'lucide-react';
import api from '../../services/api';
import { formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

interface AgingClient {
  client_id: number;
  client_name: string;
  phone: string;
  current: number;
  days_30: number;
  days_60: number;
  days_90: number;
  over_90: number;
  total: number;
  invoices?: AgingInvoice[];
}

interface AgingInvoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  total: number;
  remaining_amount: number;
  days_overdue: number;
  payment_status: string;
}

export default function AgingReportPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<AgingClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedClient, setExpandedClient] = useState<number | null>(null);
  const [summary, setSummary] = useState({ current: 0, days_30: 0, days_60: 0, days_90: 0, over_90: 0, total: 0 });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Build aging from unpaid invoices
      const res = await api.get('/sales/invoices?limit=500&payment_status=unpaid,partial');
      const invoices: any[] = res.data?.invoices || res.data || [];
      const today = new Date();

      const clientMap: Record<number, AgingClient> = {};

      for (const inv of invoices) {
        if (!inv.client_id) continue;
        const daysOverdue = Math.floor((today.getTime() - new Date(inv.invoice_date).getTime()) / (1000 * 60 * 60 * 24));
        const remaining = Number(inv.remaining_amount) || 0;

        if (!clientMap[inv.client_id]) {
          clientMap[inv.client_id] = {
            client_id: inv.client_id,
            client_name: inv.client_name || '-',
            phone: inv.client_phone || '',
            current: 0, days_30: 0, days_60: 0, days_90: 0, over_90: 0, total: 0,
            invoices: [],
          };
        }
        const c = clientMap[inv.client_id];
        c.total += remaining;
        if (daysOverdue <= 0) c.current += remaining;
        else if (daysOverdue <= 30) c.days_30 += remaining;
        else if (daysOverdue <= 60) c.days_60 += remaining;
        else if (daysOverdue <= 90) c.days_90 += remaining;
        else c.over_90 += remaining;

        c.invoices!.push({
          id: inv.id,
          invoice_number: inv.invoice_number,
          invoice_date: inv.invoice_date,
          total: Number(inv.total) || 0,
          remaining_amount: remaining,
          days_overdue: daysOverdue,
          payment_status: inv.payment_status,
        });
      }

      const agingData = Object.values(clientMap).sort((a, b) => b.over_90 - a.over_90 || b.total - a.total);
      setData(agingData);

      // Summary
      const sum = agingData.reduce((acc, c) => ({
        current: acc.current + c.current,
        days_30: acc.days_30 + c.days_30,
        days_60: acc.days_60 + c.days_60,
        days_90: acc.days_90 + c.days_90,
        over_90: acc.over_90 + c.over_90,
        total: acc.total + c.total,
      }), { current: 0, days_30: 0, days_60: 0, days_90: 0, over_90: 0, total: 0 });
      setSummary(sum);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const sendWhatsApp = (phone: string, clientName: string, amount: number) => {
    const msg = encodeURIComponent(`السلام عليكم ${clientName}،\nنرجو التكرم بتسوية المبلغ المستحق: ${formatCurrency(amount)}\nشكراً لتعاملكم معنا`);
    window.open(`https://wa.me/${phone.replace(/\D/g, '')}?text=${msg}`, '_blank');
  };

  const cols = [
    { key: 'current', label: t('aging.current'), color: 'text-green-700 bg-green-50' },
    { key: 'days_30', label: t('aging.days_30'), color: 'text-yellow-700 bg-yellow-50' },
    { key: 'days_60', label: t('aging.days_60'), color: 'text-orange-700 bg-orange-50' },
    { key: 'days_90', label: t('aging.days_90'), color: 'text-red-600 bg-red-50' },
    { key: 'over_90', label: t('aging.over_90'), color: 'text-red-800 bg-red-100 font-bold' },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .aging-print-area, .aging-print-area * { visibility: visible; }
          .aging-print-area { position: absolute; inset: 0; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
      <div className="aging-print-area space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t('aging.title')}</h1>
        <button onClick={fetchData} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm transition-colors">
          <RefreshCw className="w-4 h-4" />
          تحديث
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm transition-colors print:hidden dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        >
          <Printer className="w-4 h-4" />
          طباعة
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[...cols, { key: 'total', label: 'الإجمالي', color: 'text-gray-900 bg-gray-100 font-bold' }].map(col => (
          <div key={col.key} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-500 mb-1">{col.label}</p>
            <p className={`text-sm font-bold px-2 py-1 rounded-lg inline-block ${col.color}`}>
              {formatCurrency((summary as any)[col.key])}
            </p>
          </div>
        ))}
      </div>

      {/* Overdue Alert */}
      {summary.over_90 > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-sm text-red-700 font-medium">
            تنبيه: إجمالي الذمم المتأخرة أكثر من 90 يوم: <span className="font-bold">{formatCurrency(summary.over_90)}</span>
          </p>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-start p-4 text-xs font-semibold text-gray-500 uppercase">{t('aging.client')}</th>
                {cols.map(c => (
                  <th key={c.key} className="text-start p-4 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{c.label}</th>
                ))}
                <th className="text-start p-4 text-xs font-semibold text-gray-500 uppercase">{t('aging.total')}</th>
                <th className="text-start p-4 text-xs font-semibold text-gray-500 uppercase">{t('aging.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p>لا توجد ذمم متأخرة</p>
                  </td>
                </tr>
              ) : data.map((client) => (
                <>
                  <tr
                    key={client.client_id}
                    className={`hover:bg-gray-50 transition-colors cursor-pointer ${client.over_90 > 0 ? 'bg-red-50/30' : ''}`}
                    onClick={() => setExpandedClient(expandedClient === client.client_id ? null : client.client_id)}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {expandedClient === client.client_id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{client.client_name}</p>
                          {client.phone && <p className="text-xs text-gray-400">{client.phone}</p>}
                        </div>
                      </div>
                    </td>
                    {cols.map(col => (
                      <td key={col.key} className="p-4">
                        {(client as any)[col.key] > 0 ? (
                          <span className={`text-sm font-medium px-2 py-0.5 rounded-lg ${col.color}`}>
                            {formatCurrency((client as any)[col.key])}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-sm">—</span>
                        )}
                      </td>
                    ))}
                    <td className="p-4">
                      <span className="text-sm font-bold text-gray-900">{formatCurrency(client.total)}</span>
                    </td>
                    <td className="p-4" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        {client.phone && (
                          <>
                            <a href={`tel:${client.phone}`} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors" title={t('aging.call')}>
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                            <button
                              onClick={() => sendWhatsApp(client.phone, client.client_name, client.total)}
                              className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                              title={t('aging.send_reminder')}
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded invoices */}
                  {expandedClient === client.client_id && client.invoices && (
                    <tr key={`${client.client_id}-expanded`}>
                      <td colSpan={8} className="p-0">
                        <div className="bg-gray-50 border-t border-b border-gray-100 px-8 py-4">
                          <p className="text-xs font-semibold text-gray-500 uppercase mb-3">الفواتير المفتوحة</p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-gray-400">
                                  <th className="text-start pb-2">رقم الفاتورة</th>
                                  <th className="text-start pb-2">التاريخ</th>
                                  <th className="text-start pb-2">المجموع</th>
                                  <th className="text-start pb-2">المتبقي</th>
                                  <th className="text-start pb-2">الأيام</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {client.invoices.sort((a, b) => b.days_overdue - a.days_overdue).map(inv => (
                                  <tr key={inv.id} className="hover:bg-white">
                                    <td className="py-2">
                                      <Link to={`/sales/invoices/${inv.id}`} className="text-primary-600 hover:underline font-medium">{inv.invoice_number}</Link>
                                    </td>
                                    <td className="py-2 text-gray-500">{inv.invoice_date}</td>
                                    <td className="py-2">{formatCurrency(inv.total)}</td>
                                    <td className="py-2 font-semibold text-red-600">{formatCurrency(inv.remaining_amount)}</td>
                                    <td className="py-2">
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                        inv.days_overdue > 90 ? 'bg-red-100 text-red-700' :
                                        inv.days_overdue > 60 ? 'bg-orange-100 text-orange-700' :
                                        inv.days_overdue > 30 ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-green-100 text-green-700'
                                      }`}>
                                        {inv.days_overdue > 0 ? `${inv.days_overdue} يوم` : 'حالي'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}

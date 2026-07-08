import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowRight, CreditCard, FileText, Phone, MapPin, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/format';

export default function ClientHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'invoices' | 'payments' | 'overview'>('overview');

  useEffect(() => {
    if (id) fetchClient();
  }, [id]);

  const fetchClient = async () => {
    try {
      const res = await api.get(`/clients/${id}/overview`);
      setClient(res.data);
    } catch { toast.error('فشل تحميل بيانات العميل'); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;
  if (!client) return <div className="text-center p-8 text-gray-500">العميل غير موجود</div>;

  const paymentPct = client.total_sales > 0 ? Math.round(client.total_paid / client.total_sales * 100) : 0;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/sales/clients" className="text-gray-400 hover:text-gray-600"><ArrowRight className="w-5 h-5" /></Link>
        <h1 className="text-2xl font-bold">سجل العميل: {client.name}</h1>
      </div>

      {/* بطاقة الملخص */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-4 border-r-4 border-blue-500">
          <p className="text-sm text-gray-500">إجمالي المبيعات</p>
          <p className="text-xl font-bold text-blue-600">{formatCurrency(client.total_sales || 0)}</p>
        </div>
        <div className="card p-4 border-r-4 border-green-500">
          <p className="text-sm text-gray-500">إجمالي المدفوع</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(client.total_paid || 0)}</p>
        </div>
        <div className="card p-4 border-r-4 border-red-500">
          <p className="text-sm text-gray-500">الرصيد المتبقي</p>
          <p className="text-xl font-bold text-red-600">{formatCurrency(client.current_balance || 0)}</p>
        </div>
        <div className="card p-4 border-r-4 border-purple-500">
          <p className="text-sm text-gray-500">نسبة السداد</p>
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold text-purple-600">{paymentPct}%</p>
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div className="bg-purple-500 h-2 rounded-full" style={{width:`${paymentPct}%`}} />
            </div>
          </div>
        </div>
      </div>

      {/* معلومات العميل */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-4 lg:col-span-1">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><FileText className="w-4 h-4" /> معلومات العميل</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-gray-600"><span className="font-medium w-20">الكود:</span>{client.code}</div>
            {client.phone && <div className="flex items-center gap-2 text-gray-600"><Phone className="w-3 h-3" />{client.phone}</div>}
            {client.email && <div className="flex items-center gap-2 text-gray-600"><span>📧</span>{client.email}</div>}
            {client.city && <div className="flex items-center gap-2 text-gray-600"><MapPin className="w-3 h-3" />{client.city}</div>}
            {client.tax_number && <div className="flex items-center gap-2 text-gray-600"><span className="font-medium w-20">ضريبي:</span>{client.tax_number}</div>}
            <div className="flex items-center gap-2 text-gray-600"><span className="font-medium w-20">الحد:</span>{formatCurrency(client.credit_limit || 0)}</div>
          </div>
        </div>

        {/* رسم الأداء */}
        <div className="card p-4 lg:col-span-2">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4" /> نظرة عامة</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{client.invoices?.length || 0}</p>
              <p className="text-xs text-gray-500">فاتورة</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{client.payments?.length || 0}</p>
              <p className="text-xs text-gray-500">دفعة</p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <p className="text-2xl font-bold text-red-600">{formatCurrency(client.current_balance || 0)}</p>
              <p className="text-xs text-gray-500">متأخر</p>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-lg">
              <p className="text-2xl font-bold text-purple-600">{client.total_sales > 0 ? formatCurrency(client.total_sales / Math.max(client.invoices?.length || 1, 1)) : 0}</p>
              <p className="text-xs text-gray-500">متوسط الفاتورة</p>
            </div>
          </div>
        </div>
      </div>

      {/* التبويبات */}
      <div className="flex gap-4 border-b mb-4">
        {[{key:'overview',label:'حالة الفواتير'},{key:'invoices',label:'الفواتير'},{key:'payments',label:'المدفوعات'}].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2 border-b-2 text-sm transition-colors ${activeTab === tab.key ? 'border-primary-600 text-primary-600 font-medium' : 'border-transparent text-gray-500'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'invoices' && (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead><tr className="bg-gray-50 text-sm text-gray-600">
              <th className="text-right p-3">رقم الفاتورة</th><th className="text-right p-3">التاريخ</th>
              <th className="text-right p-3">الإجمالي</th><th className="text-right p-3">المدفوع</th>
              <th className="text-right p-3">المتبقي</th><th className="text-right p-3">الحالة</th>
            </tr></thead>
            <tbody>
              {!client.invoices?.length ? <tr><td colSpan={6} className="text-center p-8 text-gray-400">لا توجد فواتير</td></tr> :
              client.invoices.map((inv: any) => (
                <tr key={inv.id} className="border-t hover:bg-gray-50">
                  <td className="p-3"><Link to={`/sales/invoices`} className="text-primary-600 hover:underline">{inv.invoice_number}</Link></td>
                  <td className="p-3">{formatDate(inv.invoice_date)}</td>
                  <td className="p-3 font-medium">{formatCurrency(inv.total)}</td>
                  <td className="p-3 text-green-600">{formatCurrency(inv.paid_amount)}</td>
                  <td className="p-3 text-red-600">{formatCurrency(inv.remaining_amount)}</td>
                  <td className="p-3">
                    <span className={`badge ${inv.payment_status === 'paid' ? 'badge-success' : inv.payment_status === 'partial' ? 'badge-warning' : 'badge-error'}`}>
                      {inv.payment_status === 'paid' ? 'مسدد' : inv.payment_status === 'partial' ? 'جزئي' : 'غير مسدد'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead><tr className="bg-gray-50 text-sm text-gray-600">
              <th className="text-right p-3">التاريخ</th><th className="text-right p-3">الفاتورة</th>
              <th className="text-right p-3">المبلغ</th><th className="text-right p-3">طريقة الدفع</th>
            </tr></thead>
            <tbody>
              {!client.payments?.length ? <tr><td colSpan={4} className="text-center p-8 text-gray-400">لا توجد مدفوعات</td></tr> :
              client.payments.map((p: any) => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="p-3">{formatDate(p.payment_date)}</td>
                  <td className="p-3 text-gray-500">{p.invoice_number || '-'}</td>
                  <td className="p-3 font-medium text-green-600">{formatCurrency(p.amount)}</td>
                  <td className="p-3">{p.payment_method === 'cash' ? 'نقدي' : p.payment_method === 'transfer' ? 'تحويل' : p.payment_method || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead><tr className="bg-gray-50 text-sm text-gray-600">
              <th className="text-right p-3">رقم الفاتورة</th><th className="text-right p-3">التاريخ</th>
              <th className="text-right p-3">الإجمالي</th><th className="text-right p-3">الحالة</th>
              <th className="text-right p-3">أيام متأخرة</th>
            </tr></thead>
            <tbody>
              {!client.invoices?.length ? <tr><td colSpan={5} className="text-center p-8 text-gray-400">لا توجد فواتير</td></tr> :
              client.invoices.filter((inv: any) => inv.payment_status !== 'paid').map((inv: any) => {
                const daysDiff = Math.floor((Date.now() - new Date(inv.invoice_date).getTime()) / 86400000);
                return (
                  <tr key={inv.id} className="border-t hover:bg-gray-50">
                    <td className="p-3">{inv.invoice_number}</td>
                    <td className="p-3">{formatDate(inv.invoice_date)}</td>
                    <td className="p-3 font-medium">{formatCurrency(inv.remaining_amount)}</td>
                    <td className="p-3"><span className={`badge ${inv.payment_status === 'partial' ? 'badge-warning' : 'badge-error'}`}>{inv.payment_status === 'partial' ? 'جزئي' : 'غير مسدد'}</span></td>
                    <td className="p-3"><span className={daysDiff > 30 ? 'text-red-600 font-bold' : 'text-gray-600'}>{daysDiff} يوم</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

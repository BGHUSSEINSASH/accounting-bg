import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Printer, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import { formatCurrency } from '../../utils/format';

interface RevenueRow { code: string; name: string; amount: number; }
interface ExpenseRow { code: string; name: string; category: string; amount: number; }
interface Summary {
  total_revenue: number;
  cogs: number;
  gross_profit: number;
  gross_margin: number;
  operating_expenses: number;
  operating_profit: number;
  net_profit: number;
  net_margin: number;
}
interface Comparison {
  prev_revenue: number;
  prev_net_profit: number;
  revenue_change: number | null;
  profit_change: number | null;
}
interface ReportData {
  period: { from: string | null; to: string | null };
  revenues: RevenueRow[];
  expenses: ExpenseRow[];
  summary: Summary;
  comparison: Comparison;
}

function getMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const to = now.toISOString().split('T')[0];
  return { from, to };
}

function SectionTable({ title, rows, color }: { title: string; rows: { name: string; amount: number }[]; color: string }) {
  return (
    <div className="mb-4">
      <h4 className={`text-sm font-bold mb-2 ${color}`}>{title}</h4>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 py-2">لا توجد بيانات</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-0">
                <td className="py-1.5 text-gray-700">{r.name}</td>
                <td className={`py-1.5 text-left font-medium ${r.amount >= 0 ? 'text-gray-900' : 'text-rose-600'}`}>
                  {formatCurrency(r.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SummaryRow({ label, value, bold, highlight }: { label: string; value: number; bold?: boolean; highlight?: 'green' | 'red' | 'blue' }) {
  const colorMap = { green: 'text-emerald-700', red: 'text-rose-700', blue: 'text-blue-700' };
  const color = highlight ? colorMap[highlight] : 'text-gray-900';
  return (
    <div className={`flex justify-between items-center py-2 ${bold ? 'border-t border-gray-200 mt-1' : ''}`}>
      <span className={`text-sm ${bold ? 'font-bold ' + color : 'text-gray-600'}`}>{label}</span>
      <span className={`text-sm ${bold ? 'font-bold text-lg ' + color : 'font-medium text-gray-800'}`}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}

function ChangeChip({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-gray-400">—</span>;
  const positive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {positive ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

export default function ProfitReportPage() {
  const defaultRange = getMonthRange();
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await api.get(`/reports/income-statement-detailed?${params}`);
      setData(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'حدث خطأ في جلب البيانات');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { fetchReport(); }, []);

  const handlePrint = () => window.print();

  const revenueRows = (data?.revenues || []).map(r => ({ name: r.name, amount: Number(r.amount) }));
  const cogsRows = (data?.expenses || []).filter(e => e.category === 'cost_of_goods').map(e => ({ name: e.name, amount: Number(e.amount) }));
  const opExpRows = (data?.expenses || []).filter(e => e.category === 'expense').map(e => ({ name: e.name, amount: Number(e.amount) }));
  const s = data?.summary;

  return (
    <div dir="rtl" className="space-y-6">
      <PageHeader
        title="تقرير الأرباح والخسائر"
        actions={
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-gray-700 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-800 transition-colors print:hidden"
          >
            <Printer className="w-4 h-4" />
            طباعة
          </button>
        }
      />

      {/* Date Range Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">من تاريخ</label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">إلى تاريخ</label>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>
          <button
            onClick={fetchReport}
            disabled={loading}
            className="flex items-center gap-2 bg-primary-600 text-white px-5 py-2 rounded-lg text-sm hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4 text-sm">{error}</div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full" />
        </div>
      )}

      {!loading && data && (
        <>
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-blue-50 p-2.5 rounded-lg">
                  <DollarSign className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-sm text-gray-500 font-medium">إجمالي الإيرادات</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(s?.total_revenue ?? 0)}</p>
              <div className="mt-1">
                <ChangeChip value={data.comparison.revenue_change} />
                <span className="text-xs text-gray-400 mr-1">مقارنة بالفترة السابقة</span>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-emerald-50 p-2.5 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
                <span className="text-sm text-gray-500 font-medium">المجمل</span>
              </div>
              <p className={`text-2xl font-bold ${(s?.gross_profit ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {formatCurrency(s?.gross_profit ?? 0)}
              </p>
              <p className="text-xs text-gray-400 mt-1">هامش: {(s?.gross_margin ?? 0).toFixed(1)}%</p>
            </div>

            <div className={`rounded-xl shadow-sm border p-5 ${(s?.net_profit ?? 0) >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2.5 rounded-lg ${(s?.net_profit ?? 0) >= 0 ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                  {(s?.net_profit ?? 0) >= 0
                    ? <TrendingUp className="w-5 h-5 text-emerald-700" />
                    : <TrendingDown className="w-5 h-5 text-rose-700" />}
                </div>
                <span className={`text-sm font-medium ${(s?.net_profit ?? 0) >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                  صافي {(s?.net_profit ?? 0) >= 0 ? 'الربح' : 'الخسارة'}
                </span>
              </div>
              <p className={`text-2xl font-bold ${(s?.net_profit ?? 0) >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                {formatCurrency(s?.net_profit ?? 0)}
              </p>
              <div className="mt-1">
                <ChangeChip value={data.comparison.profit_change} />
                <span className={`text-xs mr-1 ${(s?.net_profit ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  هامش: {(s?.net_margin ?? 0).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Detailed Report */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-bold text-gray-900 mb-4 text-base border-b border-gray-100 pb-2">الإيرادات</h3>
              <SectionTable title="إيرادات المبيعات" rows={revenueRows} color="text-emerald-700" />
              <div className="border-t border-gray-200 pt-2 mt-2">
                <SummaryRow label="إجمالي الإيرادات" value={s?.total_revenue ?? 0} bold highlight="green" />
              </div>
            </div>

            {/* Expenses Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-bold text-gray-900 mb-4 text-base border-b border-gray-100 pb-2">التكاليف والمصروفات</h3>
              <SectionTable title="تكلفة البضاعة المباعة (COGS)" rows={cogsRows} color="text-amber-700" />
              <SectionTable title="المصروفات التشغيلية" rows={opExpRows} color="text-rose-700" />
            </div>
          </div>

          {/* P&L Summary */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-bold text-gray-900 mb-4 text-base border-b border-gray-100 pb-2">
              ملخص قائمة الدخل — {from} إلى {to}
            </h3>
            <div className="max-w-md">
              <SummaryRow label="الإيرادات" value={s?.total_revenue ?? 0} />
              <SummaryRow label="تكلفة البضاعة المباعة" value={-(s?.cogs ?? 0)} />
              <SummaryRow label="مجمل الربح" value={s?.gross_profit ?? 0} bold highlight={(s?.gross_profit ?? 0) >= 0 ? 'green' : 'red'} />
              <SummaryRow label="المصروفات التشغيلية" value={-(s?.operating_expenses ?? 0)} />
              <SummaryRow
                label={`صافي ${(s?.net_profit ?? 0) >= 0 ? 'الربح' : 'الخسارة'}`}
                value={s?.net_profit ?? 0}
                bold
                highlight={(s?.net_profit ?? 0) >= 0 ? 'green' : 'red'}
              />
            </div>
          </div>
        </>
      )}

      {!loading && !data && !error && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>اضغط "تحديث" لعرض التقرير</p>
        </div>
      )}
    </div>
  );
}

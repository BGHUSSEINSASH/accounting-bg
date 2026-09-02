import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign, TrendingUp, Users, Package, Clock, AlertTriangle, Stethoscope,
  ArrowUp, ArrowDown, FileText, ShoppingCart, Plus, UserCheck, BarChart3,
  Activity, CreditCard, Calendar, PhoneCall, AlertCircle
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend, AreaChart, Area } from 'recharts';
import api from '../../services/api';
import { DashboardStats } from '../../types';
import { formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

const iconColors = [
  { from: 'from-blue-500', to: 'to-blue-600', bg: 'bg-blue-50', text: 'text-blue-600' },
  { from: 'from-emerald-500', to: 'to-emerald-600', bg: 'bg-emerald-50', text: 'text-emerald-600' },
  { from: 'from-purple-500', to: 'to-purple-600', bg: 'bg-purple-50', text: 'text-purple-600' },
  { from: 'from-amber-500', to: 'to-amber-600', bg: 'bg-amber-50', text: 'text-amber-600' },
  { from: 'from-cyan-500', to: 'to-cyan-600', bg: 'bg-cyan-50', text: 'text-cyan-600' },
  { from: 'from-rose-500', to: 'to-rose-600', bg: 'bg-rose-50', text: 'text-rose-600' },
  { from: 'from-indigo-500', to: 'to-indigo-600', bg: 'bg-indigo-50', text: 'text-indigo-600' },
];

function DashboardStatCard({ title, value, icon, colorIndex, subtitle }: any) {
  const colors = iconColors[colorIndex % iconColors.length];
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
      <div className="flex items-start justify-between">
        <div className={`${colors.bg} p-3 rounded-lg`}>
          <div className={`bg-gradient-to-br ${colors.from} ${colors.to} p-2 rounded-lg text-white shadow-sm`}>
            {icon}
          </div>
        </div>
        {subtitle && (
          <span className={`flex items-center gap-1 text-xs font-medium ${colors.text}`}>
            <ArrowUp className="w-3 h-3" />
            {subtitle}
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500 mt-1">{title}</p>
      </div>
    </div>
  );
}

function CustomChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-100 p-3">
      <p className="text-sm font-medium text-gray-600 mb-1">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <p key={idx} className="text-sm font-bold" style={{ color: entry.color }}>
          {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const styles: Record<string, string> = {
    paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    partial: 'bg-amber-50 text-amber-700 border-amber-200',
    unpaid: 'bg-rose-50 text-rose-700 border-rose-200',
  };
  const labels: Record<string, string> = {
    paid: t('common.paid'), partial: t('common.partial'), unpaid: t('common.unpaid'),
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status] || styles.unpaid}`}>
      {labels[status] || status}
    </span>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [monthlySales, setMonthlySales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();
  const [salesTrend, setSalesTrend] = useState<any[]>([]);
  const [yearlyComparison, setYearlyComparison] = useState<{currentYear: any[], lastYear: any[]}>({currentYear: [], lastYear: []});
  const [predictive, setPredictive] = useState<any>(null);
  const [alerts, setAlerts] = useState<any>({lowStock: [], pendingInvoices: []});

  const quickActions = [
    { label: t('sales.new'), icon: FileText, to: '/sales/new', color: 'bg-blue-500 hover:bg-blue-600' },
    { label: t('purchases.new'), icon: ShoppingCart, to: '/inventory/purchases', color: 'bg-emerald-500 hover:bg-emerald-600' },
    { label: t('accounting.expenses'), icon: Plus, to: '/expenses', color: 'bg-amber-500 hover:bg-amber-600' },
    { label: t('attendance.sign_in'), icon: UserCheck, to: '/attendance/check-in', color: 'bg-purple-500 hover:bg-purple-600' },
  ];

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, salesRes, monthlyRes, trendRes, yearlyRes, predRes, alertRes] = await Promise.all([
          api.get('/dashboard/stats'),
          api.get('/dashboard/recent-sales'),
          api.get('/dashboard/monthly-sales'),
          api.get('/dashboard/sales-trend'),
          api.get('/dashboard/yearly-comparison'),
          api.get('/dashboard/predictive'),
          api.get('/dashboard/alerts'),
        ]);
        setStats(statsRes.data);
        setRecentSales(salesRes.data);
        setMonthlySales(monthlyRes.data);
        setSalesTrend(trendRes.data);
        setYearlyComparison(yearlyRes.data);
        setPredictive(predRes.data);
        setAlerts(alertRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardStatCard title={t('dashboard.today_sales')} value={formatCurrency(stats?.today_sales || 0)} icon={<DollarSign className="w-5 h-5" />} colorIndex={0} subtitle={`${stats?.today_sales_count || 0} ${t('sales.invoice')}`} />
        <DashboardStatCard title={t('dashboard.monthly_sales')} value={formatCurrency(stats?.month_sales || 0)} icon={<TrendingUp className="w-5 h-5" />} colorIndex={1} subtitle={`${stats?.month_sales_count || 0} ${t('sales.invoice')}`} />
        <DashboardStatCard title={t('dashboard.total_clients')} value={stats?.total_clients || 0} icon={<Users className="w-5 h-5" />} colorIndex={2} />
        <DashboardStatCard title={t('dashboard.total_items')} value={stats?.total_items || 0} icon={<Package className="w-5 h-5" />} colorIndex={3} subtitle={`${stats?.low_stock_items || 0} ${t('dashboard.low_stock')}`} />
        <DashboardStatCard title={t('attendance.today')} value={stats?.today_attendance || 0} icon={<Clock className="w-5 h-5" />} colorIndex={4} subtitle={t('hr.employees')} />
        <DashboardStatCard title={t('dashboard.pending_orders')} value={stats?.pending_invoices || 0} icon={<AlertTriangle className="w-5 h-5" />} colorIndex={5} subtitle={formatCurrency(stats?.pending_amount || 0)} />
        <DashboardStatCard title={t('doctors.title')} value={stats?.active_doctors || 0} icon={<Stethoscope className="w-5 h-5" />} colorIndex={6} />
      </div>

      {/* Overdue Receivables Alert */}
      {(stats as any)?.overdue_count > 0 && (
        <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-red-100 p-2.5 rounded-lg">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-red-800 text-lg">{t('dashboard.overdue_receivables')}</h3>
                <p className="text-sm text-red-600 mt-0.5">
                  {(stats as any).overdue_count} {t('dashboard.overdue_count')} — {formatCurrency((stats as any).overdue_amount)}
                </p>
              </div>
            </div>
            <Link to="/accounting/aging" className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
              {t('dashboard.view_report')}
            </Link>
          </div>
          {(stats as any)?.overdue_top?.length > 0 && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(stats as any).overdue_top.map((client: any, idx: number) => (
                <div key={idx} className="bg-white/80 rounded-lg p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{client.client_name}</p>
                    <p className="text-xs text-gray-500">{client.invoice_count} فاتورة</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold text-red-700">{formatCurrency(client.total_overdue)}</span>
                    {client.phone && (
                      <a href={`tel:${client.phone}`} className="p-1.5 bg-green-100 rounded-lg hover:bg-green-200 transition-colors" title="اتصال">
                        <PhoneCall className="w-3.5 h-3.5 text-green-700" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.to}
              to={action.to}
              className="group flex items-center gap-3 bg-white rounded-xl shadow-sm border border-gray-100 p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
            >
              <div className={`${action.color} p-2.5 rounded-lg text-white shadow-sm transition-transform duration-200 group-hover:scale-110`}>
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{action.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Sales Trend Chart - Last 30 Days */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-900">آخر 30 يوم مبيعات</h3>
          <Activity className="w-5 h-5 text-gray-400" />
        </div>
        {salesTrend.length > 0 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesTrend}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{fill: '#9ca3af', fontSize: 11}} angle={-45} textAnchor="end" height={60} />
                <YAxis tick={{fill: '#9ca3af', fontSize: 11}} />
                <Tooltip />
                <Area type="monotone" dataKey="total" stroke="#3b82f6" fill="url(#colorSales)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-72 flex items-center justify-center text-gray-400">
            <BarChart3 className="w-12 h-12 mb-3" />
            <p className="text-sm">{t('common.no_data')}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Yearly Comparison */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-gray-900">مقارنة سنوية</h3>
            <Calendar className="w-5 h-5 text-gray-400" />
          </div>
          {yearlyComparison.currentYear.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearlyComparison.currentYear.map((m: any, i: number) => ({
                  month: m.month,
                  current: m.total,
                  last: yearlyComparison.lastYear[i]?.total || 0
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="month" tick={{fill: '#9ca3af', fontSize: 11}} />
                  <YAxis tick={{fill: '#9ca3af', fontSize: 11}} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="current" name="هذه السنة" fill="#3b82f6" radius={[4,4,0,0]} />
                  <Bar dataKey="last" name="السنة الماضية" fill="#94a3b8" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-gray-400">
              <BarChart3 className="w-12 h-12 mb-3" />
              <p className="text-sm">{t('common.no_data')}</p>
            </div>
          )}
        </div>

        {/* Predictive Analytics */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-gray-900">التحليل التنبؤي</h3>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          {predictive ? (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
                <p className="text-sm opacity-80">المبيعات المتوقعة الشهر القادم</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(predictive.prediction || 0)}</p>
              </div>
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                <Activity className="w-5 h-5 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">معدل النمو</p>
                  <p className={`text-lg font-bold ${predictive.growthRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {predictive.growthRate >= 0 ? '+' : ''}{predictive.growthRate?.toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="text-xs text-gray-400">مستوى الثقة: {predictive.confidence === 'high' ? 'عالٍ' : 'متوسط'}</div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400">
              <TrendingUp className="w-12 h-12 mb-3" />
              <p className="text-sm">{t('common.no_data')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Alerts Section */}
      {(alerts.lowStock.length > 0 || alerts.pendingInvoices.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {alerts.lowStock.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-red-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <h3 className="font-semibold text-red-700">مخزون منخفض</h3>
              </div>
              <div className="space-y-2">
                {alerts.lowStock.map((item: any) => (
                  <div key={item.id} className="flex justify-between items-center p-2 bg-red-50 rounded-lg">
                    <span className="text-sm text-gray-700">{item.name}</span>
                    <span className="text-sm font-bold text-red-600">{item.quantity} / {item.min_quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {alerts.pendingInvoices.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-amber-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="w-5 h-5 text-amber-500" />
                <h3 className="font-semibold text-amber-700">فواتير غير مدفوعة</h3>
              </div>
              <div className="space-y-2">
                {alerts.pendingInvoices.map((inv: any) => (
                  <div key={inv.id} className="flex justify-between items-center p-2 bg-amber-50 rounded-lg">
                    <span className="text-sm text-gray-700">{inv.invoice_number}</span>
                    <span className="text-sm font-bold text-amber-600">{formatCurrency(inv.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Charts & Recent Sales */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Sales Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-gray-900">{t('dashboard.sales_chart')}</h3>
            <BarChart3 className="w-5 h-5 text-gray-400" />
          </div>
          {monthlySales.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySales} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <Tooltip content={<CustomChartTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }} />
                  <Bar dataKey="total" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex flex-col items-center justify-center text-gray-400">
              <BarChart3 className="w-12 h-12 mb-3" />
              <p className="text-sm">{t('common.no_data')}</p>
            </div>
          )}
        </div>

        {/* Recent Sales */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-gray-900">{t('dashboard.recent_sales')}</h3>
            {recentSales.length > 0 && (
              <Link to="/sales/invoices" className="text-xs text-primary-600 hover:text-primary-700 font-medium">{t('common.all')}</Link>
            )}
          </div>
          {recentSales.length > 0 ? (
            <div className="space-y-3">
              {recentSales.map((sale: any, idx: number) => (
                <Link
                  key={sale.id}
                  to={`/sales/invoices`}
                  className="block p-4 rounded-xl border border-gray-100 transition-all duration-200 hover:border-primary-100 hover:bg-primary-50/30 hover:shadow-sm"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-gray-900">{sale.invoice_number}</span>
                    <StatusBadge status={sale.payment_status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      {sale.client_name || t('common.no_data')}
                    </span>
                    <span className="text-sm font-bold text-primary-600">{formatCurrency(sale.total)}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <ShoppingCart className="w-12 h-12 mb-3" />
              <p className="text-sm">{t('common.no_data')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

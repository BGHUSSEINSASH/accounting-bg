import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, ShoppingCart, Package,
  Stethoscope, Clock, BarChart3, Building2, UserCircle,
  LogOut, Menu, ChevronDown, X, Wallet,
  Receipt, TrendingUp, Settings, Moon, Sun,
  Store, Shield, Bell,
} from 'lucide-react';
import { authStore } from '../../store/authStore';
import { useApp, toggleTheme } from '../../store/appStore';
import { useTranslation } from '../../i18n/context';
import { flushSyncQueue, getPendingSyncCount, subscribeSyncQueue } from '../../services/syncQueue';

export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  const location = useLocation();
  const navigate = useNavigate();
  const user = authStore.getUser();
  const { isDark, language, setLanguage, isRtl, symbol } = useApp();
  const { t } = useTranslation();
  const [pendingSyncCount, setPendingSyncCount] = useState(getPendingSyncCount());

  useEffect(() => subscribeSyncQueue(() => setPendingSyncCount(getPendingSyncCount())), []);

  const menuItems = [
    { path: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, roles: ['admin','manager','accountant','sales_rep','employee'] },
    { path: '/pos', label: t('sales.pos'), icon: Store, roles: ['admin','manager','sales_rep'] },
    {
      label: t('nav.accounting'), icon: Wallet, roles: ['admin','manager','accountant'],
      children: [
        { path: '/accounting/chart', label: t('accounting.chart_of_accounts') },
        { path: '/accounting/journal', label: t('accounting.journal_entries') },
        { path: '/accounting/trial-balance', label: t('accounting.trial_balance') },
        { path: '/accounting/income-statement', label: t('accounting.income_statement') },
        { path: '/accounting/balance-sheet', label: t('accounting.balance_sheet') },
        { path: '/accounting/aging', label: t('aging.title') },
        { path: '/accounting/fixed-assets', label: t('accounting.fixed_assets') },
        { path: '/accounting/budgets', label: t('accounting.budgets') },
        { path: '/accounting/bank-reconciliation', label: t('accounting.bank_reconciliation') },
        { path: '/accounting/bank-accounts', label: t('accounting.bank_accounts') },
        { path: '/accounting/cash-flow', label: t('accounting.cash_flow') },
        { path: '/accounting/tax', label: t('accounting.tax_report') },
        { path: '/accounting/statements', label: t('account_statement.title') },
        { path: '/accounting/installments', label: t('installments.title') },
        { path: '/accounting/cost-centers', label: t('nav.cost_centers') },
      ]
    },
    {
      label: t('nav.sales'), icon: ShoppingCart, roles: ['admin','manager','sales_rep'],
      children: [
        { path: '/sales/invoices', label: t('sales.invoice') },
        { path: '/sales/new', label: t('sales.new') },
        { path: '/sales/quotations', label: t('sales.quotations') },
        { path: '/sales/credit-notes', label: t('sales.credit_notes') },
        { path: '/sales/clients', label: t('nav.clients') },
        { path: '/sales/suppliers', label: t('nav.suppliers') },
        { path: '/sales/client-classifications', label: t('sales.client_classifications') },
        { path: '/sales/client-payments', label: t('sales.payments') },
        { path: '/sales/map', label: t('sales.sales_map') },
        { path: '/sales/targets', label: t('nav.sales_targets') },
        { path: '/sales/discount-policies', label: t('nav.discount_policies') },
      ]
    },
    {
      label: t('nav.inventory'), icon: Package, roles: ['admin','manager','accountant'],
      children: [
        { path: '/inventory/items', label: t('inventory.items') },
        { path: '/inventory/warehouses', label: t('inventory.warehouses') },
        { path: '/inventory/purchases', label: t('purchases.invoice') },
        { path: '/inventory/purchase-orders', label: t('purchases.orders') },
        { path: '/inventory/debit-notes', label: t('purchases.debit_notes') },
        { path: '/inventory/inventory-counts', label: t('inventory.counts') },
        { path: '/inventory/low-stock', label: t('inventory.low_stock') },
        { path: '/inventory/expiry-alerts', label: t('expiry.title') },
        { path: '/inventory/transfers', label: t('nav.inventory_transfers') },
      ]
    },
    { path: '/doctors', label: t('doctors.title'), icon: Stethoscope, roles: ['admin','manager','sales_rep'] },
    {
      label: t('nav.attendance'), icon: Clock, roles: ['admin','manager','employee'],
      children: [
        { path: '/attendance/today', label: t('attendance.today') },
        { path: '/attendance/records', label: t('attendance.records') },
        { path: '/attendance/check-in', label: t('attendance.sign_in') },
        { path: '/attendance/shifts', label: t('attendance.shifts') },
        { path: '/attendance/map', label: t('employee_map.title') },
      ]
    },
    {
      label: t('nav.reports'), icon: BarChart3, roles: ['admin','manager','accountant'],
      children: [
        { path: '/reports/sales', label: t('reports.sales') },
        { path: '/reports/profit', label: t('reports.profit') },
        { path: '/reports/attendance', label: t('reports.attendance') },
        { path: '/reports/budget', label: t('reports.budget') },
        { path: '/reports/tax', label: t('reports.tax') },
        { path: '/reports/custom', label: t('reports.custom') },
        { path: '/reports/pdf', label: t('reports.pdf') },
      ]
    },
    { path: '/expenses', label: t('accounting.expenses'), icon: Receipt, roles: ['admin','manager','accountant'] },
    { path: '/notifications', label: t('nav.notifications'), icon: Bell, roles: ['admin','manager','accountant','sales_rep','employee'] },
    {
      label: t('nav.hr'), icon: Users, roles: ['admin','manager'],
      children: [
        { path: '/hr/employees', label: t('hr.employees') },
        { path: '/hr/contracts', label: t('hr.contracts') },
        { path: '/hr/loans', label: t('hr.loans') },
        { path: '/hr/leaves', label: t('hr.leaves') },
        { path: '/hr/payroll', label: t('hr.payroll') },
        { path: '/hr/kpis', label: t('hr.kpis') },
      ]
    },
    { path: '/settings', label: t('nav.settings'), icon: Settings, roles: ['admin'] },
    {
      label: t('nav.admin'), icon: Shield, roles: ['admin'],
      children: [
        { path: '/admin/permissions', label: t('admin.permissions') },
        { path: '/admin/activity-log', label: t('admin.activity_log') },
        { path: '/admin/backup', label: t('admin.backup') },
        { path: '/admin/companies', label: t('admin.companies') },
        { path: '/admin/email', label: t('admin.email_config') },
        { path: '/admin/login-history', label: t('admin.login_history') },
      ]
    },
  ];

  const toggleMenu = (label: string) => {
    setExpandedMenus(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (path: string) => location.pathname === path;
  const isChildActive = (children: { path: string }[]) => children.some(c => location.pathname === c.path);

  const handleLogout = () => {
    authStore.clearAuth();
    navigate('/login');
  };

  const filteredMenu = menuItems.filter(item => {
    if (!user) return false;
    return item.roles.includes(user.role);
  });

  const roleLabel: Record<string, string> = {
    admin: t('admin.title'),
    manager: 'Manager',
    accountant: t('accounting.accountant'),
    sales_rep: 'Sales Rep',
    employee: t('hr.employees'),
    '': '',
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 right-0 z-50 w-64 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 transform transition-transform duration-200 ease-in-out ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'} lg:translate-x-0 lg:static lg:inset-auto`}>
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary-600" />
            <span className="font-bold text-lg dark:text-white">{t('auth.login_title')}</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-4 space-y-1 overflow-y-auto h-[calc(100vh-4rem)]">
          {filteredMenu.map((item: any) => {
            if ('children' in item && item.children) {
              const open = expandedMenus[item.label] ?? isChildActive(item.children);
              return (
                  <div key={item.label}>
                    <button onClick={() => toggleMenu(item.label)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${isChildActive(item.children) ? 'bg-primary-50 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                      <item.icon className="w-5 h-5" />
                      <span className="flex-1 text-right">{item.label}</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {open && (
                      <div className="mr-8 mt-1 space-y-1">
                        {item.children.map((child: any) => (
                          <Link key={child.path} to={child.path} onClick={() => setSidebarOpen(false)} className={`block px-3 py-2 rounded-lg text-sm transition-colors ${isActive(child.path) ? 'bg-primary-50 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 font-medium' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <Link key={item.path} to={item.path!} onClick={() => setSidebarOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive(item.path!) ? 'bg-primary-50 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
          })}
        </nav>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/20 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 lg:px-6">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <Menu className="w-5 h-5 dark:text-white" />
          </button>

          <div className="flex items-center gap-3 mr-auto">
            <div className="text-left">
              <p className="text-sm font-medium dark:text-white">{user?.full_name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{roleLabel[user?.role || ''] || user?.role}</p>
            </div>
            <div className="w-9 h-9 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center">
              <UserCircle className="w-6 h-6 text-primary-600 dark:text-primary-300" />
            </div>
            <button onClick={() => toggleTheme()} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400" title={isRtl ? 'تغيير الوضع' : 'Toggle theme'}>
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <div className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg">
              {symbol}
            </div>
            {pendingSyncCount > 0 && (
              <button onClick={() => void flushSyncQueue()} className="px-2 py-1 text-xs font-medium rounded-lg border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:bg-amber-900/20" title="مزامنة العمليات المحلية">
                {pendingSyncCount} مزامنة
              </button>
            )}
            <button onClick={() => setLanguage(language === 'ar' ? 'en' : language === 'en' ? 'ku' : 'ar')} className="px-2 py-1 text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600" title={language === 'ar' ? 'English' : language === 'en' ? 'Kurdish' : 'العربية'}>
              {language === 'ar' ? 'EN' : language === 'en' ? 'KU' : 'AR'}
            </button>
            <button onClick={handleLogout} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/50 rounded-lg text-red-500 dark:text-red-400" title={t('auth.logout')}>
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

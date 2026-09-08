import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, ShoppingCart, Package,
  Stethoscope, Clock, BarChart3, Building2, UserCircle,
  LogOut, Menu, ChevronDown, X, Wallet,
  Receipt, Settings, Moon, Sun,
  Store, Shield, Bell, ChevronRight,
} from 'lucide-react';
import { authStore } from '../../store/authStore';
import { useApp, toggleTheme } from '../../store/appStore';
import { useTranslation } from '../../i18n/context';
import { flushSyncQueue, getPendingSyncCount, subscribeSyncQueue } from '../../services/syncQueue';

// ─── types ────────────────────────────────────────────────────────────────────

interface ChildItem { path: string; label: string }
interface MenuItem {
  path?: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
  children?: ChildItem[];
}

// ─── NavItem (leaf) ───────────────────────────────────────────────────────────

function NavLeaf({
  item,
  active,
  onNavigate,
}: {
  item: { path: string; label: string; icon: React.ComponentType<{ className?: string }> };
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      className={`
        group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium
        transition-all duration-150
        ${active
          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-gray-100'
        }
      `}
    >
      <item.icon className={`w-[18px] h-[18px] flex-shrink-0 ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300'}`} />
      <span className="truncate">{item.label}</span>
      {active && <span className="mr-auto w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />}
    </Link>
  );
}

// ─── NavGroup (expandable) ────────────────────────────────────────────────────

function NavGroup({
  item,
  childActive,
  expanded,
  onToggle,
  onNavigate,
  currentPath,
}: {
  item: MenuItem;
  childActive: boolean;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  currentPath: string;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className={`
          w-full group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium
          transition-all duration-150
          ${childActive
            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-gray-100'
          }
        `}
      >
        <item.icon className={`w-[18px] h-[18px] flex-shrink-0 ${childActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300'}`} />
        <span className="flex-1 text-right truncate">{item.label}</span>
        <ChevronDown
          className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180 text-indigo-500' : 'text-gray-400'}`}
        />
      </button>

      {expanded && (
        <div className="mt-1 mr-[30px] space-y-0.5 border-r-2 border-indigo-100 dark:border-indigo-800/50 pr-2">
          {(item.children ?? []).map(child => {
            const isChildActive = currentPath === child.path || currentPath.startsWith(child.path + '/');
            return (
              <Link
                key={child.path}
                to={child.path}
                onClick={onNavigate}
                className={`
                  flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm
                  transition-all duration-150
                  ${isChildActive
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 font-medium'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:text-gray-800 dark:hover:text-gray-200'
                  }
                `}
              >
                {isChildActive && <ChevronRight className="w-3 h-3 flex-shrink-0 text-indigo-500" />}
                <span>{child.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Sidebar content (no hooks — pure rendering) ──────────────────────────────

function SidebarNav({
  filteredMenu,
  expandedMenus,
  toggleMenu,
  location,
  setSidebarOpen,
  title,
}: {
  filteredMenu: MenuItem[];
  expandedMenus: Record<string, boolean>;
  toggleMenu: (label: string) => void;
  location: { pathname: string };
  setSidebarOpen: (v: boolean) => void;
  title: string;
}) {
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');
  const isChildActive = (children: ChildItem[]) => children.some(c => location.pathname === c.path || location.pathname.startsWith(c.path + '/'));

  return (
    <>
      {/* Brand */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 dark:border-gray-700/50 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm text-gray-900 dark:text-white truncate leading-tight">{title}</p>
            <p className="text-[10px] text-indigo-500 dark:text-indigo-400 font-medium">نظام محاسبي</p>
          </div>
        </div>
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {filteredMenu.map((item) => {
          if (item.children && item.children.length > 0) {
            const childActive = isChildActive(item.children);
            const expanded = expandedMenus[item.label] !== undefined
              ? expandedMenus[item.label]
              : childActive;
            return (
              <NavGroup
                key={item.label}
                item={item}
                childActive={childActive}
                expanded={expanded}
                onToggle={() => toggleMenu(item.label)}
                onNavigate={() => setSidebarOpen(false)}
                currentPath={location.pathname}
              />
            );
          }
          return (
            <NavLeaf
              key={item.path}
              item={item as { path: string; label: string; icon: React.ComponentType<{ className?: string }> }}
              active={isActive(item.path!)}
              onNavigate={() => setSidebarOpen(false)}
            />
          );
        })}
      </nav>

      {/* Footer */}
      <div className="flex-shrink-0 px-3 pb-3">
        <div className="h-px bg-gray-100 dark:bg-gray-700/50 mb-3" />
        <p className="text-[10px] text-center text-gray-400 dark:text-gray-600">
          النظام المحاسبي المتكامل v1.0
        </p>
      </div>
    </>
  );
}

// ─── Main Layout ──────────────────────────────────────────────────────────────

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

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  const menuItems: MenuItem[] = [
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
        { path: '/accounting/settlements', label: t('settlements.title') },
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

  const filteredMenu = menuItems.filter(item => user && item.roles.includes(user.role));

  const toggleMenu = (label: string) =>
    setExpandedMenus(prev => ({ ...prev, [label]: !prev[label] }));

  const handleLogout = () => { authStore.clearAuth(); navigate('/login'); };

  const roleLabel: Record<string, string> = {
    admin: t('admin.title'),
    manager: 'Manager',
    accountant: t('accounting.accountant'),
    sales_rep: 'Sales Rep',
    employee: t('hr.employees'),
    '': '',
  };

  const sidebarProps = {
    filteredMenu,
    expandedMenus,
    toggleMenu,
    location,
    setSidebarOpen,
    title: t('auth.login_title'),
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden" style={{ direction: 'rtl' }}>

      {/* ── DESKTOP SIDEBAR ─────────────────────────────── */}
      <aside
        className="hidden lg:flex flex-col h-full bg-white dark:bg-gray-800 shadow-sm"
        style={{ width: '260px', minWidth: '260px', borderLeft: '1px solid rgba(0,0,0,0.06)' }}
      >
        <SidebarNav {...sidebarProps} />
      </aside>

      {/* ── MOBILE OVERLAY ──────────────────────────────── */}
      <div
        className={`fixed inset-0 z-40 lg:hidden transition-opacity duration-200 ${sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
        onClick={() => setSidebarOpen(false)}
      />

      {/* ── MOBILE SIDEBAR ──────────────────────────────── */}
      <aside
        className={`
          fixed top-0 right-0 bottom-0 z-50 lg:hidden flex flex-col
          bg-white dark:bg-gray-800 shadow-2xl
          transition-transform duration-300 ease-out
          ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        style={{ width: '280px', borderLeft: '1px solid rgba(0,0,0,0.06)' }}
      >
        <SidebarNav {...sidebarProps} />
      </aside>

      {/* ── MAIN CONTENT ────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── TOP HEADER ─────────────────────────────────── */}
        <header
          className="flex-shrink-0 bg-white dark:bg-gray-800 flex items-center justify-between px-4 gap-2"
          style={{ height: '60px', borderBottom: '1px solid rgba(0,0,0,0.06)', direction: 'rtl' }}
        >
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors flex-shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Page title — empty spacer on desktop */}
          <div className="hidden lg:block flex-1" />

          {/* Controls */}
          <div className="flex items-center gap-1.5">

            {/* Pending sync badge */}
            {pendingSyncCount > 0 && (
              <button
                onClick={() => void flushSyncQueue()}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/50 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                {pendingSyncCount}
              </button>
            )}

            {/* Language */}
            <button
              onClick={() => setLanguage(language === 'ar' ? 'en' : language === 'en' ? 'ku' : 'ar')}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-xs font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 transition-colors"
            >
              {language === 'ar' ? 'EN' : language === 'en' ? 'KU' : 'AR'}
            </button>

            {/* Currency chip */}
            <span className="hidden sm:flex items-center px-2.5 h-9 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl">
              {symbol}
            </span>

            {/* Theme toggle */}
            <button
              onClick={() => toggleTheme()}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
            >
              {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
            </button>

            {/* Divider */}
            <div className="w-px h-6 bg-gray-200 dark:bg-gray-600 mx-0.5" />

            {/* User */}
            <div className="flex items-center gap-2 pl-1">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-tight">{user?.full_name}</p>
                <p className="text-[11px] text-indigo-500 dark:text-indigo-400 leading-tight">{roleLabel[user?.role || ''] || user?.role}</p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                <UserCircle className="w-5 h-5 text-white" />
              </div>
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-gray-200 dark:bg-gray-600 mx-0.5" />

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
              title={t('auth.logout')}
            >
              <LogOut className="w-[18px] h-[18px]" />
            </button>
          </div>
        </header>

        {/* ── PAGE CONTENT ─────────────────────────────────── */}
        <main
          className="flex-1 overflow-y-auto"
          style={{ direction: isRtl ? 'rtl' : 'ltr' }}
        >
          <div className="p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

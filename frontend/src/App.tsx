import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { authStore } from './store/authStore';
import Layout from './components/ui/Layout';
import LoginPage from './pages/auth/LoginPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import LoadingScreen from './components/ui/LoadingScreen';

const ChartOfAccountsPage = lazy(() => import('./pages/accounting/ChartOfAccountsPage'));
const JournalEntriesPage = lazy(() => import('./pages/accounting/JournalEntriesPage'));
const TrialBalancePage = lazy(() => import('./pages/accounting/TrialBalancePage'));
const IncomeStatementPage = lazy(() => import('./pages/accounting/IncomeStatementPage'));
const BalanceSheetPage = lazy(() => import('./pages/accounting/BalanceSheetPage'));
const AgingReportPage = lazy(() => import('./pages/accounting/AgingReportPage'));

const SalesInvoicesPage = lazy(() => import('./pages/sales/SalesInvoicesPage'));
const NewSalePage = lazy(() => import('./pages/sales/NewSalePage'));
const ClientsPage = lazy(() => import('./pages/clients/ClientsPage'));
const SuppliersPage = lazy(() => import('./pages/clients/SuppliersPage'));
const SalesMapPage = lazy(() => import('./pages/sales/SalesMapPage'));

const ItemsPage = lazy(() => import('./pages/inventory/ItemsPage'));
const PurchasesPage = lazy(() => import('./pages/inventory/PurchasesPage'));
const LowStockPage = lazy(() => import('./pages/inventory/LowStockPage'));

const DoctorsPage = lazy(() => import('./pages/doctors/DoctorsPage'));

const TodayAttendancePage = lazy(() => import('./pages/attendance/TodayAttendancePage'));
const AttendanceRecordsPage = lazy(() => import('./pages/attendance/AttendanceRecordsPage'));
const CheckInPage = lazy(() => import('./pages/attendance/CheckInPage'));

const SalesReportPage = lazy(() => import('./pages/reports/SalesReportPage'));
const ProfitReportPage = lazy(() => import('./pages/reports/ProfitReportPage'));
const AttendanceReportPage = lazy(() => import('./pages/reports/AttendanceReportPage'));

const ExpensesPage = lazy(() => import('./pages/accounting/ExpensesPage'));
const FixedAssetsPage = lazy(() => import('./pages/accounting/FixedAssetsPage'));
const BudgetsPage = lazy(() => import('./pages/accounting/BudgetsPage'));
const BankReconciliationPage = lazy(() => import('./pages/accounting/BankReconciliationPage'));
const BankAccountsPage = lazy(() => import('./pages/accounting/BankAccountsPage'));
const CashFlowPage = lazy(() => import('./pages/accounting/CashFlowPage'));
const TaxReportPage = lazy(() => import('./pages/accounting/TaxReportPage'));

// POS
const POSPage = lazy(() => import('./pages/sales/POSPage'));

// Quotations
const QuotationsPage = lazy(() => import('./pages/sales/QuotationsPage'));
const CreditNotesPage = lazy(() => import('./pages/sales/CreditNotesPage'));
const ClientClassificationsPage = lazy(() => import('./pages/sales/ClientClassificationsPage'));
const ClientPaymentsPage = lazy(() => import('./pages/sales/ClientPaymentsPage'));
const SalesTargetsPage = lazy(() => import('./pages/sales/SalesTargetsPage'));
const DiscountPoliciesPage = lazy(() => import('./pages/sales/DiscountPoliciesPage'));
const InventoryTransferPage = lazy(() => import('./pages/inventory/InventoryTransferPage'));
const ClientHistoryPage = lazy(() => import('./pages/clients/ClientHistoryPage'));

// HR
const EmployeesPage = lazy(() => import('./pages/hr/EmployeesPage'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));
const LeavesPage = lazy(() => import('./pages/hr/LeavesPage'));
const PayrollPage = lazy(() => import('./pages/hr/PayrollPage'));
const ContractsPage = lazy(() => import('./pages/hr/ContractsPage'));
const LoansPage = lazy(() => import('./pages/hr/LoansPage'));
const KPIsPage = lazy(() => import('./pages/hr/KPIsPage'));
const ShiftsPage = lazy(() => import('./pages/attendance/ShiftsPage'));
const EmployeeMapPage = lazy(() => import('./pages/attendance/EmployeeMapPage'));

// Inventory
const WarehousesPage = lazy(() => import('./pages/inventory/WarehousesPage'));
const PurchaseOrdersPage = lazy(() => import('./pages/inventory/PurchaseOrdersPage'));
const DebitNotesPage = lazy(() => import('./pages/inventory/DebitNotesPage'));
const InventoryCountsPage = lazy(() => import('./pages/inventory/InventoryCountsPage'));
const ExpiryAlertsPage = lazy(() => import('./pages/inventory/ExpiryAlertsPage'));

// Accounting new pages
const AccountStatementPage = lazy(() => import('./pages/accounting/AccountStatementPage'));
const InstallmentsPage = lazy(() => import('./pages/accounting/InstallmentsPage'));
const CostCentersPage = lazy(() => import('./pages/accounting/CostCentersPage'));

// Admin
const PermissionsPage = lazy(() => import('./pages/admin/PermissionsPage'));
const ActivityLogPage = lazy(() => import('./pages/admin/ActivityLogPage'));
const BackupPage = lazy(() => import('./pages/admin/BackupPage'));
const CompaniesPage = lazy(() => import('./pages/admin/CompaniesPage'));
const EmailConfigPage = lazy(() => import('./pages/admin/EmailConfigPage'));
const LoginHistoryPage = lazy(() => import('./pages/admin/LoginHistoryPage'));

// Reports
const BudgetReportPage = lazy(() => import('./pages/reports/BudgetReportPage'));
const CustomReportsPage = lazy(() => import('./pages/reports/CustomReportsPage'));
const PDFReportsPage = lazy(() => import('./pages/reports/PDFReportsPage'));

// Notifications
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));

// Tax reports
const TaxReportsPage = lazy(() => import('./pages/reports/TaxReportsPage'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!authStore.isAuthenticated()) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" toastOptions={{ duration: 3000, style: { fontFamily: 'Cairo, sans-serif' } }} />
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/login" element={authStore.isAuthenticated() ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/pos" element={<ProtectedRoute><POSPage /></ProtectedRoute>} />

          {/* Accounting */}
          <Route path="/accounting/chart" element={<ProtectedRoute><ChartOfAccountsPage /></ProtectedRoute>} />
          <Route path="/accounting/journal" element={<ProtectedRoute><JournalEntriesPage /></ProtectedRoute>} />
          <Route path="/accounting/trial-balance" element={<ProtectedRoute><TrialBalancePage /></ProtectedRoute>} />
          <Route path="/accounting/income-statement" element={<ProtectedRoute><IncomeStatementPage /></ProtectedRoute>} />
          <Route path="/accounting/balance-sheet" element={<ProtectedRoute><BalanceSheetPage /></ProtectedRoute>} />
          <Route path="/accounting/aging" element={<ProtectedRoute><AgingReportPage /></ProtectedRoute>} />
          <Route path="/accounting/fixed-assets" element={<ProtectedRoute><FixedAssetsPage /></ProtectedRoute>} />
          <Route path="/accounting/budgets" element={<ProtectedRoute><BudgetsPage /></ProtectedRoute>} />
          <Route path="/accounting/bank-reconciliation" element={<ProtectedRoute><BankReconciliationPage /></ProtectedRoute>} />
          <Route path="/accounting/bank-accounts" element={<ProtectedRoute><BankAccountsPage /></ProtectedRoute>} />
          <Route path="/accounting/cash-flow" element={<ProtectedRoute><CashFlowPage /></ProtectedRoute>} />
          <Route path="/accounting/tax" element={<ProtectedRoute><TaxReportPage /></ProtectedRoute>} />
          <Route path="/accounting/statements" element={<ProtectedRoute><AccountStatementPage /></ProtectedRoute>} />
          <Route path="/accounting/installments" element={<ProtectedRoute><InstallmentsPage /></ProtectedRoute>} />
          <Route path="/accounting/cost-centers" element={<ProtectedRoute><CostCentersPage /></ProtectedRoute>} />

          {/* Sales */}
          <Route path="/sales/invoices" element={<ProtectedRoute><SalesInvoicesPage /></ProtectedRoute>} />
          <Route path="/sales/new" element={<ProtectedRoute><NewSalePage /></ProtectedRoute>} />
          <Route path="/sales/quotations" element={<ProtectedRoute><QuotationsPage /></ProtectedRoute>} />
          <Route path="/sales/credit-notes" element={<ProtectedRoute><CreditNotesPage /></ProtectedRoute>} />
          <Route path="/sales/clients" element={<ProtectedRoute><ClientsPage /></ProtectedRoute>} />
          <Route path="/sales/suppliers" element={<ProtectedRoute><SuppliersPage /></ProtectedRoute>} />
          <Route path="/sales/client-classifications" element={<ProtectedRoute><ClientClassificationsPage /></ProtectedRoute>} />
          <Route path="/sales/client-payments" element={<ProtectedRoute><ClientPaymentsPage /></ProtectedRoute>} />
          <Route path="/sales/map" element={<ProtectedRoute><SalesMapPage /></ProtectedRoute>} />
          <Route path="/sales/targets" element={<ProtectedRoute><SalesTargetsPage /></ProtectedRoute>} />
          <Route path="/sales/discount-policies" element={<ProtectedRoute><DiscountPoliciesPage /></ProtectedRoute>} />
          <Route path="/sales/clients/:id/history" element={<ProtectedRoute><ClientHistoryPage /></ProtectedRoute>} />

          {/* Inventory */}
          <Route path="/inventory/items" element={<ProtectedRoute><ItemsPage /></ProtectedRoute>} />
          <Route path="/inventory/warehouses" element={<ProtectedRoute><WarehousesPage /></ProtectedRoute>} />
          <Route path="/inventory/purchases" element={<ProtectedRoute><PurchasesPage /></ProtectedRoute>} />
          <Route path="/inventory/purchase-orders" element={<ProtectedRoute><PurchaseOrdersPage /></ProtectedRoute>} />
          <Route path="/inventory/debit-notes" element={<ProtectedRoute><DebitNotesPage /></ProtectedRoute>} />
          <Route path="/inventory/inventory-counts" element={<ProtectedRoute><InventoryCountsPage /></ProtectedRoute>} />
          <Route path="/inventory/low-stock" element={<ProtectedRoute><LowStockPage /></ProtectedRoute>} />
          <Route path="/inventory/expiry-alerts" element={<ProtectedRoute><ExpiryAlertsPage /></ProtectedRoute>} />
          <Route path="/inventory/transfers" element={<ProtectedRoute><InventoryTransferPage /></ProtectedRoute>} />

          {/* Doctors */}
          <Route path="/doctors" element={<ProtectedRoute><DoctorsPage /></ProtectedRoute>} />

          {/* Attendance */}
          <Route path="/attendance/today" element={<ProtectedRoute><TodayAttendancePage /></ProtectedRoute>} />
          <Route path="/attendance/records" element={<ProtectedRoute><AttendanceRecordsPage /></ProtectedRoute>} />
          <Route path="/attendance/check-in" element={<ProtectedRoute><CheckInPage /></ProtectedRoute>} />
          <Route path="/attendance/shifts" element={<ProtectedRoute><ShiftsPage /></ProtectedRoute>} />
          <Route path="/attendance/map" element={<ProtectedRoute><EmployeeMapPage /></ProtectedRoute>} />

          {/* Reports */}
          <Route path="/reports/sales" element={<ProtectedRoute><SalesReportPage /></ProtectedRoute>} />
          <Route path="/reports/profit" element={<ProtectedRoute><ProfitReportPage /></ProtectedRoute>} />
          <Route path="/reports/attendance" element={<ProtectedRoute><AttendanceReportPage /></ProtectedRoute>} />
          <Route path="/reports/budget" element={<ProtectedRoute><BudgetReportPage /></ProtectedRoute>} />
          <Route path="/reports/tax" element={<ProtectedRoute><TaxReportsPage /></ProtectedRoute>} />
          <Route path="/reports/custom" element={<ProtectedRoute><CustomReportsPage /></ProtectedRoute>} />
          <Route path="/reports/pdf" element={<ProtectedRoute><PDFReportsPage /></ProtectedRoute>} />

          {/* Expenses */}
          <Route path="/expenses" element={<ProtectedRoute><ExpensesPage /></ProtectedRoute>} />

          {/* HR */}
          <Route path="/hr/employees" element={<ProtectedRoute><EmployeesPage /></ProtectedRoute>} />
          <Route path="/hr/contracts" element={<ProtectedRoute><ContractsPage /></ProtectedRoute>} />
          <Route path="/hr/loans" element={<ProtectedRoute><LoansPage /></ProtectedRoute>} />
          <Route path="/hr/leaves" element={<ProtectedRoute><LeavesPage /></ProtectedRoute>} />
          <Route path="/hr/payroll" element={<ProtectedRoute><PayrollPage /></ProtectedRoute>} />
          <Route path="/hr/kpis" element={<ProtectedRoute><KPIsPage /></ProtectedRoute>} />

          {/* Notifications */}
          <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />

          {/* Admin */}
          <Route path="/admin/permissions" element={<ProtectedRoute><PermissionsPage /></ProtectedRoute>} />
          <Route path="/admin/activity-log" element={<ProtectedRoute><ActivityLogPage /></ProtectedRoute>} />
          <Route path="/admin/backup" element={<ProtectedRoute><BackupPage /></ProtectedRoute>} />
          <Route path="/admin/companies" element={<ProtectedRoute><CompaniesPage /></ProtectedRoute>} />
          <Route path="/admin/email" element={<ProtectedRoute><EmailConfigPage /></ProtectedRoute>} />
          <Route path="/admin/login-history" element={<ProtectedRoute><LoginHistoryPage /></ProtectedRoute>} />

          {/* Settings */}
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;

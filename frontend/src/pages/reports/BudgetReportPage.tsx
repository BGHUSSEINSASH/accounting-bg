import { useState, useEffect } from 'react';
import { Printer, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import { formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function BudgetReportPage() {
  const { t } = useTranslation();
  const [budgets, setBudgets] = useState<any[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState('');
  const [reportData, setReportData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get('/budgets').then(r => {
      const data = r.data.budgets || r.data.data || r.data;
      setBudgets(Array.isArray(data) ? data : []);
    }).catch(() => toast.error(t('error.load')))
    .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedBudgetId) { setReportData([]); return; }
    setLoadingReport(true);
    api.get(`/budgets/${selectedBudgetId}/report`).then(r => {
      const data = r.data.report || r.data.data || r.data;
      setReportData(Array.isArray(data) ? data : []);
    }).catch(() => { setReportData([]); toast.error(t('error.load')); })
    .finally(() => setLoadingReport(false));
  }, [selectedBudgetId]);

  const handlePrint = () => window.print();

  const totalBudget = reportData.reduce((s, r) => s + (r.budget_amount || 0), 0);
  const totalActual = reportData.reduce((s, r) => s + (r.actual_amount || 0), 0);
  const totalVariance = totalActual - totalBudget;

  return (
    <div>
      <Breadcrumbs items={[{ label: t('reports.title'), path: '/reports' }, { label: t('reports.budget') }]} />
      <PageHeader title={t('reports.budget')} actions={
        <>{reportData.length > 0 && (
          <button onClick={handlePrint} className="btn-primary flex items-center gap-2"><Printer className="w-4 h-4" /> {t('common.print')}</button>
        )}<PrintButton /></>
      } />

      <div className="mb-6">
        <label className="block text-sm font-medium mb-1">{t('budget_report.select')}</label>
        <select value={selectedBudgetId} onChange={e => setSelectedBudgetId(e.target.value)} className="select-field w-80">
          <option value="">{t('budget_report.select_placeholder')}</option>
          {budgets.map((b: any) => <option key={b.id} value={b.id}>{b.name} ({b.fiscal_year})</option>)}
        </select>
      </div>

      {!selectedBudgetId && (
        <div className="card text-center py-12">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">{t('budget_report.select_prompt')}</p>
        </div>
      )}

      {loadingReport && (
        <div className="text-center py-8 text-gray-500">{t('common.loading')}</div>
      )}

      {selectedBudgetId && !loadingReport && reportData.length === 0 && (
        <div className="card text-center py-8">
          <p className="text-gray-500">{t('budget_report.no_data')}</p>
        </div>
      )}

      {selectedBudgetId && !loadingReport && reportData.length > 0 && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="table-header">{t('budget_report.account_code')}</th>
                <th className="table-header">{t('budget_report.account_name')}</th>
                <th className="table-header text-left">{t('budget_report.budget_amount')}</th>
                <th className="table-header text-left">{t('budget_report.actual_amount')}</th>
                <th className="table-header text-left">{t('budget_report.variance')}</th>
                <th className="table-header text-left">{t('budget_report.variance_percent')}</th>
              </tr>
            </thead>
            <tbody>
              {reportData.map((r: any, i: number) => {
                const variance = (r.actual_amount || 0) - (r.budget_amount || 0);
                const variancePercent = r.budget_amount ? (variance / r.budget_amount) * 100 : 0;
                return (
                  <tr key={i} className="hover:bg-gray-50 border-b border-gray-100">
                    <td className="table-cell text-gray-500 font-mono">{r.account_code || '-'}</td>
                    <td className="table-cell font-medium">{r.account_name || '-'}</td>
                    <td className="table-cell text-left font-mono">{formatCurrency(r.budget_amount || 0)}</td>
                    <td className="table-cell text-left font-mono">{formatCurrency(r.actual_amount || 0)}</td>
                    <td className={`table-cell text-left font-mono ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{variance >= 0 ? '+' : ''}{formatCurrency(variance)}</td>
                    <td className={`table-cell text-left font-mono ${variancePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{variancePercent >= 0 ? '+' : ''}{variancePercent.toFixed(2)}%</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-bold">
                <td colSpan={2} className="table-cell text-gray-700">{t('budget_report.total')}</td>
                <td className="table-cell text-left font-mono">{formatCurrency(totalBudget)}</td>
                <td className="table-cell text-left font-mono">{formatCurrency(totalActual)}</td>
                <td className={`table-cell text-left font-mono ${totalVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{totalVariance >= 0 ? '+' : ''}{formatCurrency(totalVariance)}</td>
                <td className="table-cell text-left"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

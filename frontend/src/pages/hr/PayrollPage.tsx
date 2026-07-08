import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Link } from 'react-router-dom';
import { DollarSign, Users, TrendingUp, Calendar, Clock, Calculator } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { useTranslation } from '../../i18n/context';
import PrintButton from '../../components/ui/PrintButton';
import { formatCurrency } from '../../utils/format';
import toast from 'react-hot-toast';

interface PayrollRecord {
  id: number;
  full_name: string;
  salary: number;
  allowances: number;
  deductions: number;
  net_salary: number;
  month: string;
  status: string;
}

interface PayrollCalcItem {
  employee_id: number;
  employee_name: string;
  basic_salary: number;
  housing_allowance: number;
  transportation_allowance: number;
  overtime: number;
  insurance_deduction: number;
  attendance_deductions: number;
  gross: number;
  total_deductions: number;
  net_salary: number;
}

interface PayrollCalcResult {
  month: number;
  year: number;
  employees: PayrollCalcItem[];
  total: number;
}

export default function PayrollPage() {
  const { t } = useTranslation();
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [calcResult, setCalcResult] = useState<PayrollCalcResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  useEffect(() => { loadPayroll(); }, []);

  const loadPayroll = async () => {
    try {
      const m = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      const { data } = await api.get(`/payroll?month=${m}`);
      setRecords(data);
    } catch {
      setRecords([]);
    } finally { setLoading(false); }
  };

  const handleCalculate = async () => {
    setCalculating(true);
    try {
      const { data } = await api.post('/payroll-calculate/calculate', { month: selectedMonth, year: selectedYear });
      setCalcResult(data);
      toast.success(t('payroll.generated'));
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('payroll.generate_error'));
    } finally { setCalculating(false); }
  };

  if (loading) return <CardSkeleton count={3} />;

  const totalSalary = records.reduce((s, r) => s + r.net_salary, 0);

  const calcColumns = [
    { key: 'employee_name', label: t('payroll.employee'), render: (v: string) => <Link to={'/hr/employees'} className="hover:text-primary-600 transition-colors">{v}</Link> },
    { key: 'basic_salary', label: t('payroll.basic_salary'), render: (v: number) => formatCurrency(v || 0) },
    { key: 'housing_allowance', label: t('payroll.housing_allowance'), render: (v: number) => formatCurrency(v || 0) },
    { key: 'transportation_allowance', label: t('payroll.transportation_allowance'), render: (v: number) => formatCurrency(v || 0) },
    { key: 'overtime', label: t('payroll.overtime'), render: (v: number) => formatCurrency(v || 0) },
    { key: 'gross', label: t('payroll.gross'), render: (v: number) => <span className="font-medium">{formatCurrency(v || 0)}</span> },
    { key: 'insurance_deduction', label: t('payroll.insurance'), render: (v: number) => formatCurrency(v || 0) },
    { key: 'attendance_deductions', label: t('payroll.attendance_deductions'), render: (v: number) => formatCurrency(v || 0) },
    { key: 'total_deductions', label: t('payroll.total_deductions'), render: (v: number) => <span className="text-red-600">{formatCurrency(v || 0)}</span> },
    { key: 'net_salary', label: t('payroll.net_salary'), render: (v: number) => <span className="font-bold text-green-600">{formatCurrency(v || 0)}</span> },
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: t('nav.hr') }, { label: t('hr.payroll') }]} />
      <PageHeader title={t('payroll.title')} subtitle={t('payroll.subtitle')} actions={
        <><PrintButton /></>
      } />

      <div className="card p-4 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <Calendar className="w-5 h-5 text-gray-500" />
          <div className="flex items-center gap-2">
            <select className="input-field w-32" value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{t('payroll.month')} {i + 1}</option>
              ))}
            </select>
            <select className="input-field w-28" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
              {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <button onClick={handleCalculate} disabled={calculating} className="btn-primary flex items-center gap-2">
            <Calculator className="w-4 h-4" /> {calculating ? t('common.saving') : t('payroll.calculate')}
          </button>
          {calcResult && (
            <div className="mr-auto flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              <span className="text-lg font-bold">{formatCurrency(calcResult.total || 0)}</span>
              <span className="text-sm text-gray-500">{t('payroll.total_net')}</span>
            </div>
          )}
        </div>
      </div>

      {calcResult ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Clock className="w-4 h-4" />
            <span>{t('payroll.month')}: {calcResult.month}/{calcResult.year}</span>
            <Users className="w-4 h-4 mr-2" />
            <span>{calcResult.employees.length} {t('payroll.employee')}</span>
          </div>
          <DataTable columns={calcColumns} data={calcResult.employees} />
        </div>
      ) : (
        <div className="card p-4">
          <DataTable
            columns={[
              { key: 'full_name', label: t('payroll.employee'), render: (v: string) => <Link to={'/hr/employees'} className="hover:text-primary-600 transition-colors">{v}</Link> },
              { key: 'salary', label: t('payroll.basic_salary'), render: (v) => formatCurrency(v || 0) },
              { key: 'allowances', label: t('payroll.allowances'), render: (v) => formatCurrency(v || 0) },
              { key: 'deductions', label: t('payroll.deductions'), render: (v) => formatCurrency(v || 0) },
              { key: 'net_salary', label: t('payroll.net_salary'), render: (v) => <span className="font-bold text-green-600">{formatCurrency(v || 0)}</span> },
              { key: 'status', label: t('common.status'), render: (v) => v === 'paid' ? <span className="badge badge-success">{t('payroll.paid')}</span> : <span className="badge badge-warning">{t('payroll.pending')}</span> },
            ]}
            data={records}
          />
        </div>
      )}
    </div>
  );
}

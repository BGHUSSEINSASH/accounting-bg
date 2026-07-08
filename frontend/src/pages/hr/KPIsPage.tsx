import { useState, useEffect } from 'react';
import api from '../../services/api';
import { BarChart3, Plus, Pencil } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { useTranslation } from '../../i18n/context';
import toast from 'react-hot-toast';

interface KPI {
  id: number;
  employee_id: number;
  kpi_name: string;
  kpi_type: string;
  target_value: number;
  actual_value: number;
  weight: number;
  evaluation_period: string;
  period_start: string;
  period_end: string;
  notes: string;
}

interface Employee {
  id: number;
  full_name: string;
}

export default function KPIsPage() {
  const { t } = useTranslation();
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<number | ''>('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    employee_id: '', kpi_name: '', kpi_type: 'percentage', target_value: '',
    weight: '1', evaluation_period: 'monthly', period_start: '', period_end: '', notes: ''
  });
  const [editValue, setEditValue] = useState<{ id: number; value: string } | null>(null);

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    if (selectedEmployee) loadKpis();
  }, [selectedEmployee]);

  const loadEmployees = async () => {
    try {
      const { data } = await api.get('/auth/users');
      setEmployees(data);
      setLoading(false);
    } catch { setLoading(false); }
  };

  const loadKpis = async () => {
    try {
      const { data } = await api.get(`/employee-kpis/${selectedEmployee}`);
      setKpis(data);
    } catch { setKpis([]); }
  };

  const handleSubmit = async () => {
    try {
      await api.post('/employee-kpis', {
        ...form,
        employee_id: Number(form.employee_id),
        target_value: Number(form.target_value),
        weight: Number(form.weight)
      });
      toast.success(t('kpis.created'));
      setShowModal(false);
      setForm({ employee_id: '', kpi_name: '', kpi_type: 'percentage', target_value: '', weight: '1', evaluation_period: 'monthly', period_start: '', period_end: '', notes: '' });
      loadKpis();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.save'));
    }
  };

  const handleUpdateActual = async () => {
    if (!editValue) return;
    try {
      await api.put(`/employee-kpis/${editValue.id}`, { actual_value: Number(editValue.value) });
      toast.success(t('kpis.updated'));
      setEditValue(null);
      loadKpis();
    } catch { toast.error(t('error.save')); }
  };

  if (loading) return <CardSkeleton count={3} />;

  const selectedEmployeeData = employees.find(e => e.id === selectedEmployee);

  return (
    <div>
      <Breadcrumbs items={[{ label: t('nav.hr') }, { label: t('hr.kpis') }]} />
      <PageHeader title={t('kpis.title')} subtitle={t('kpis.subtitle')} />

      <div className="flex items-center gap-4 mb-6">
        <select className="input-field w-64" value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value ? Number(e.target.value) : '' as any)}>
          <option value="">{t('kpis.select_employee')}</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.full_name}</option>
          ))}
        </select>
        {selectedEmployee && (
          <button onClick={() => { setForm({ ...form, employee_id: String(selectedEmployee) }); setShowModal(true); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> {t('kpis.add')}
          </button>
        )}
      </div>

      {selectedEmployee ? (
        <DataTable
          columns={[
            { key: 'kpi_name', label: t('kpis.name') },
            { key: 'kpi_type', label: t('kpis.type'), render: (v) => t(`kpis.type_${v}`) || v },
            { key: 'target_value', label: t('kpis.target'), render: (v) => (v as number)?.toLocaleString() },
            { key: 'actual_value', label: t('kpis.actual'), render: (v, row) => (
              <div className="flex items-center gap-2">
                <span>{(v as number)?.toLocaleString()}</span>
                <button onClick={() => setEditValue({ id: (row as KPI).id, value: String(v) })} className="p-1 hover:bg-gray-100 rounded">
                  <Pencil className="w-3.5 h-3.5 text-gray-500" />
                </button>
              </div>
            )},
            { key: 'weight', label: t('kpis.weight') },
            { key: 'progress', label: t('kpis.progress'), render: (_v, row) => {
              const kpi = row as KPI;
              const pct = kpi.target_value > 0 ? Math.min(100, Math.round((kpi.actual_value / kpi.target_value) * 100)) : 0;
              const color = pct >= 100 ? 'bg-green-500' : pct >= 70 ? 'bg-blue-500' : 'bg-yellow-500';
              return (
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div className={`${color} h-2 rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs">{pct}%</span>
                </div>
              );
            }},
            { key: 'evaluation_period', label: t('kpis.period'), render: (v) => t(`kpis.period_${v}`) || v },
            { key: 'period_start', label: t('kpis.period_start') },
            { key: 'period_end', label: t('kpis.period_end') },
          ]}
          data={kpis}
        />
      ) : (
        <div className="card p-12 text-center text-gray-500">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('kpis.select_employee')}</p>
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={t('kpis.add_title')}>
        <div className="space-y-3">
          <input className="input-field w-full" placeholder={t('kpis.name')} value={form.kpi_name} onChange={e => setForm({...form, kpi_name: e.target.value})} />
          <select className="input-field w-full" value={form.kpi_type} onChange={e => setForm({...form, kpi_type: e.target.value})}>
            <option value="percentage">{t('kpis.type_percentage')}</option>
            <option value="number">{t('kpis.type_number')}</option>
            <option value="currency">{t('kpis.type_currency')}</option>
          </select>
          <input className="input-field w-full" type="number" placeholder={t('kpis.target')} value={form.target_value} onChange={e => setForm({...form, target_value: e.target.value})} />
          <input className="input-field w-full" type="number" step="0.1" placeholder={t('kpis.weight')} value={form.weight} onChange={e => setForm({...form, weight: e.target.value})} />
          <select className="input-field w-full" value={form.evaluation_period} onChange={e => setForm({...form, evaluation_period: e.target.value})}>
            <option value="monthly">{t('kpis.period_monthly')}</option>
            <option value="quarterly">{t('kpis.period_quarterly')}</option>
            <option value="yearly">{t('kpis.period_yearly')}</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input className="input-field" type="date" value={form.period_start} onChange={e => setForm({...form, period_start: e.target.value})} />
            <input className="input-field" type="date" value={form.period_end} onChange={e => setForm({...form, period_end: e.target.value})} />
          </div>
          <textarea className="input-field w-full" placeholder={t('common.notes')} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowModal(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button onClick={handleSubmit} className="btn-primary">{t('common.add')}</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!editValue} onClose={() => setEditValue(null)} title={t('kpis.edit_value')}>
        <div className="space-y-3">
          <input className="input-field w-full" type="number" placeholder={t('kpis.enter_value')} value={editValue?.value || ''} onChange={e => setEditValue(prev => prev ? {...prev, value: e.target.value} : null)} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditValue(null)} className="btn-secondary">{t('common.cancel')}</button>
            <button onClick={handleUpdateActual} className="btn-primary">{t('common.update')}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

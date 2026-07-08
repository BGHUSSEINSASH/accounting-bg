import { useState, useEffect } from 'react';
import { Calendar, CreditCard, CheckCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import PrintButton from '../../components/ui/PrintButton';
import { formatDate, formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function InstallmentsPage() {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [payPlanId, setPayPlanId] = useState<number | null>(null);
  const [payForm, setPayForm] = useState({ payment_method: 'cash', amount: '', notes: '' });

  useEffect(() => {
    setLoading(true);
    api.get('/sales/invoices').then(res => {
      const invoices = res.data?.invoices || res.data || [];
      const plansData = invoices.filter((inv: any) => inv.payment_method === 'credit' && inv.remaining_amount > 0)
        .map((inv: any) => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          client_name: inv.client_name || t('common.client'),
          total: inv.total,
          paid_amount: inv.paid_amount || 0,
          remaining: inv.remaining_amount || inv.total,
          status: inv.payment_status === 'paid' ? 'completed' : 'active',
        }));
      setPlans(plansData);
      setLoading(false);
    }).catch(() => { setLoading(false); });
  }, []);

  const loadSchedule = (plan: any) => {
    setSelectedPlan(plan);
    const totalInstallments = 6;
    const installAmount = plan.remaining / totalInstallments;
    const scheduleData = Array.from({ length: totalInstallments }, (_, i) => {
      const due = new Date();
      due.setDate(due.getDate() + (i + 1) * 30);
      return {
        id: i + 1,
        due_date: due.toISOString(),
        amount: installAmount,
        status: i === 0 ? 'paid' : 'pending',
        paid_date: i === 0 ? new Date().toISOString() : null,
      };
    });
    setSchedule(scheduleData);
    setShowSchedule(true);
  };

  const recordPayment = async () => {
    if (!payPlanId || !payForm.amount) return;
    try {
      await api.post('/client-payments', {
        client_id: selectedPlan?.id,
        amount: Number(payForm.amount),
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: payForm.payment_method,
        notes: payForm.notes,
      });
      toast.success(t('common.success'));
      setShowPayment(false);
      setPayForm({ payment_method: 'cash', amount: '', notes: '' });
    } catch { toast.error(t('error.save')); }
  };

  const columns = [
    { key: 'client_name', label: t('common.client') },
    { key: 'invoice_number', label: t('common.invoice_number') },
    { key: 'total', label: t('common.total'), render: (v: number) => formatCurrency(v) },
    { key: 'paid_amount', label: t('common.paid'), render: (v: number) => formatCurrency(v || 0) },
    { key: 'remaining', label: t('pos.remaining'), render: (v: number) => <span className="text-red-600 font-medium">{formatCurrency(v)}</span> },
    { key: 'status', label: t('common.status'), render: (v: string) => v === 'completed' ? <span className="badge-success">{t('installments.completed')}</span> : <span className="badge-warning">{t('installments.active')}</span> },
    { key: 'actions', label: t('common.actions'), render: (_: any, row: any) => (
      <div className="flex gap-1">
        <button onClick={() => loadSchedule(row)} className="text-blue-600 hover:text-blue-800 text-sm">{t('common.view')}</button>
        {row.status !== 'completed' && (
          <button onClick={() => { setPayPlanId(row.id); setSelectedPlan(row); setShowPayment(true); }} className="text-green-600 hover:text-green-800 text-sm">{t('common.pay')}</button>
        )}
      </div>
    )},
  ];

  const scheduleColumns: { key: string; label: string; render?: (v: any) => any }[] = [
    { key: 'id', label: '#' },
    { key: 'due_date', label: t('installments.due_date'), render: (v: any) => formatDate(v) },
    { key: 'amount', label: t('common.amount'), render: (v: any) => formatCurrency(v) },
    { key: 'paid_date', label: t('installments.paid_date'), render: (v: any) => v ? formatDate(v) : '-' },
    { key: 'status', label: t('common.status'), render: (v: any) => v === 'paid' ? <span className="badge-success"><CheckCircle2 className="w-3 h-3 inline ml-1" />{t('common.paid')}</span> : <span className="badge-warning"><AlertCircle className="w-3 h-3 inline ml-1" />{t('installments.pending')}</span> },
  ];

  return (
    <div>
      <PageHeader title={t('installments.title')} subtitle={t('installments.subtitle')} actions={<PrintButton />} />

      <DataTable columns={columns} data={plans} loading={loading} searchable />

      <Modal isOpen={showSchedule} onClose={() => setShowSchedule(false)} title={`${t('installments.payment_schedule')} - ${selectedPlan?.invoice_number || ''}`} size="lg">
        <div className="mb-4 grid grid-cols-3 gap-4">
          <div><span className="text-sm text-gray-500">{t('common.client')}</span><p className="font-medium">{selectedPlan?.client_name}</p></div>
          <div><span className="text-sm text-gray-500">{t('common.total')}</span><p className="font-medium">{formatCurrency(selectedPlan?.total || 0)}</p></div>
          <div><span className="text-sm text-gray-500">{t('pos.remaining')}</span><p className="font-medium text-red-600">{formatCurrency(selectedPlan?.remaining || 0)}</p></div>
        </div>
        <table className="w-full">
          <thead>
            <tr>
              {scheduleColumns.map(col => <th key={col.key} className="table-header">{col.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {schedule.map((row: any) => (
              <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                {scheduleColumns.map(col => (
                  <td key={col.key} className="table-cell">{col.render ? col.render(row[col.key] as any) : row[col.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>

      <Modal isOpen={showPayment} onClose={() => setShowPayment(false)} title={t('payment.new_title')}>
        <form onSubmit={e => { e.preventDefault(); recordPayment(); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-200">{t('payment.amount')}</label>
            <input type="number" step="0.01" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} required className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-200">{t('payment.method')}</label>
            <select value={payForm.payment_method} onChange={e => setPayForm({ ...payForm, payment_method: e.target.value })} className="input-field">
              <option value="cash">{t('payment.cash')}</option>
              <option value="card">{t('payment.card')}</option>
              <option value="transfer">{t('payment.transfer')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-200">{t('common.notes')}</label>
            <input type="text" value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} className="input-field" />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowPayment(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('payment.pay')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

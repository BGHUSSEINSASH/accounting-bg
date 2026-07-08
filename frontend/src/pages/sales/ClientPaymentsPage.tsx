import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import Modal from '../../components/ui/Modal';
import DataTable from '../../components/ui/DataTable';
import { formatDate, formatCurrency, getStatusText } from '../../utils/format';
import { PAYMENT_METHODS } from '../../utils/constants';
import { useTranslation } from '../../i18n/context';

export default function ClientPaymentsPage() {
  const { t } = useTranslation();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [clientFilter, setClientFilter] = useState('');
  const [clients, setClients] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [unpaidInvoices, setUnpaidInvoices] = useState<any[]>([]);
  const [form, setForm] = useState({
    client_id: '',
    invoice_id: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash',
    reference_number: '',
    notes: '',
  });

  useEffect(() => {
    fetchPayments();
    api.get('/clients/all').then(r => setClients(r.data)).catch(() => {});
  }, [page]);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '20' });
      if (clientFilter) params.append('client_id', clientFilter);
      const res = await api.get(`/client-payments?${params}`);
      setPayments(res.data.payments || res.data);
      setTotal(res.data.total || 0);
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.load'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!loading) { setPage(1); fetchPayments(); }
  }, [clientFilter]);

  useEffect(() => {
    if (form.client_id) {
      api.get('/sales?payment_status=unpaid')
        .then(r => {
          const invoices = r.data.invoices || r.data;
          setUnpaidInvoices(invoices.filter((inv: any) => inv.client_id === parseInt(form.client_id)));
        })
        .catch(() => setUnpaidInvoices([]));
    } else {
      setUnpaidInvoices([]);
    }
  }, [form.client_id]);

  const handleInvoiceChange = (invoiceId: string) => {
    const invoice = unpaidInvoices.find(inv => inv.id === parseInt(invoiceId));
    const remaining = invoice ? (invoice.total - (invoice.paid_amount || 0)) : 0;
    setForm({ ...form, invoice_id: invoiceId, amount: remaining.toString() });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/client-payments', {
        client_id: form.client_id ? parseInt(form.client_id) : null,
        sales_invoice_id: form.invoice_id ? parseInt(form.invoice_id) : null,
        amount: parseFloat(form.amount) || 0,
        payment_date: form.payment_date,
        payment_method: form.payment_method,
        reference_number: form.reference_number || undefined,
        notes: form.notes || undefined,
      });
      toast.success(t('payment.recorded'));
      setShowAddModal(false);
      setForm({
        client_id: '', invoice_id: '', amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'cash', reference_number: '', notes: '',
      });
      setUnpaidInvoices([]);
      fetchPayments();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.save'));
    }
  };

  const columns = [
    { key: 'payment_date', label: t('payment.date'), render: (v: string) => formatDate(v) },
    { key: 'client_name', label: t('payment.client'), render: (v: string) => <Link to={'/sales/clients'} className="hover:text-primary-600 transition-colors">{v || '-'}</Link> },
    { key: 'invoice_number', label: t('payment.invoice_number'), render: (v: string) => <Link to={`/sales/invoices`} className="hover:text-primary-600 transition-colors">{v || '-'}</Link> },
    { key: 'amount', label: t('payment.amount'), render: (v: number) => <span className="font-mono">{formatCurrency(v)}</span> },
    { key: 'payment_method', label: t('payment.method'), render: (v: string) => getStatusText(v) },
    { key: 'reference_number', label: t('payment.reference') },
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: t('nav.sales'), path: '/sales' }, { label: t('payment.title') }]} />
      <PageHeader title={t('payment.title')} actions={<><button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('payment.new')}</button><PrintButton /></>} />

      <div className="mb-4">
        <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="select-field w-48">
          <option value="">{t('payment.all_clients')}</option>
          {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={payments}
        loading={loading}
        page={page}
        total={total}
        limit={20}
        onPageChange={setPage}
      />

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title={t('payment.new_title')} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('payment.client')} *</label>
              <select value={form.client_id} onChange={e => { setForm({ ...form, client_id: e.target.value, invoice_id: '', amount: '' }); }} className="select-field" required>
                <option value="">{t('payment.select_client')}</option>
                {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('payment.invoice_number')}</label>
              <select value={form.invoice_id} onChange={e => handleInvoiceChange(e.target.value)} className="select-field" disabled={!form.client_id}>
                <option value="">{t('payment.select_invoice')}</option>
                {unpaidInvoices.map((inv: any) => {
                  const remaining = inv.total - (inv.paid_amount || 0);
                  return <option key={inv.id} value={inv.id}>{inv.invoice_number} - {formatCurrency(remaining)}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('payment.amount')} *</label>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('payment.date')} *</label>
              <input type="date" value={form.payment_date} onChange={e => setForm({ ...form, payment_date: e.target.value })} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('payment.method')} *</label>
              <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })} className="select-field" required>
                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('payment.reference')}</label>
              <input type="text" value={form.reference_number} onChange={e => setForm({ ...form, reference_number: e.target.value })} className="input-field" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('payment.notes')}</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-field" rows={2} />
          </div>
          <button type="submit" className="btn-primary w-full">{t('payment.pay')}</button>
        </form>
      </Modal>
    </div>
  );
}

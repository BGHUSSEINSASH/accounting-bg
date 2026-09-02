import { useState, useEffect } from 'react';
import { CheckCircle2, CreditCard, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import { formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

interface Client {
  id: number;
  name: string;
  phone: string;
  current_balance: number;
}

interface Invoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  total: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: string;
}

interface Allocation {
  invoice_id: number;
  invoice_number: string;
  remaining_before: number;
  allocated: number;
  remaining_after: number;
}

export default function SettlementsPage() {
  const { t } = useTranslation();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [preview, setPreview] = useState<Allocation[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const res = await api.get('/clients?has_balance=1&limit=500');
      const all: Client[] = res.data?.clients || res.data || [];
      // Only clients with outstanding balance
      setClients(all.filter((c) => Number(c.current_balance) > 0));
    } catch {
      toast.error('فشل تحميل قائمة العملاء');
    } finally {
      setLoadingClients(false);
    }
  };

  const fetchClientInvoices = async (clientId: number) => {
    setLoadingInvoices(true);
    try {
      const res = await api.get(`/sales/invoices?client_id=${clientId}&payment_status=partial,unpaid&limit=200`);
      const invs: Invoice[] = res.data?.invoices || res.data || [];
      // FIFO: sort by date ascending
      setInvoices(invs.filter((i) => Number(i.remaining_amount) > 0).sort((a, b) => a.invoice_date.localeCompare(b.invoice_date)));
    } catch {
      toast.error('فشل تحميل فواتير العميل');
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleClientChange = (id: number) => {
    setSelectedClientId(id);
    setPaymentAmount('');
    setPreview([]);
    setShowPreview(false);
    fetchClientInvoices(id);
  };

  const computePreview = () => {
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      toast.error('أدخل مبلغاً صحيحاً');
      return;
    }
    let remaining = amount;
    const allocs: Allocation[] = [];
    for (const inv of invoices) {
      if (remaining <= 0) break;
      const invRemaining = Number(inv.remaining_amount);
      const allocated = Math.min(remaining, invRemaining);
      allocs.push({
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        remaining_before: invRemaining,
        allocated,
        remaining_after: invRemaining - allocated,
      });
      remaining -= allocated;
    }
    setPreview(allocs);
    setShowPreview(true);
  };

  const handleConfirm = async () => {
    if (!selectedClientId || preview.length === 0) return;
    setSubmitting(true);
    try {
      await api.post('/client-payments', {
        client_id: selectedClientId,
        amount: parseFloat(paymentAmount),
        payment_method: paymentMethod,
        notes,
        allocations: preview,
      });
      toast.success('تمت التسوية بنجاح');
      setShowPreview(false);
      setPaymentAmount('');
      setPreview([]);
      setNotes('');
      fetchClients();
      fetchClientInvoices(selectedClientId);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'فشلت التسوية');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  return (
    <div>
      <PageHeader title={t('settlements.title')} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Client Selection */}
        <div className="card">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary-600" />
            {t('settlements.select_client')}
          </h3>

          {loadingClients ? (
            <p className="text-sm text-gray-400">{t('common.loading')}</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {clients.length === 0 && (
                <p className="text-sm text-gray-400">{t('common.no_data')}</p>
              )}
              {clients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleClientChange(c.id)}
                  className={`w-full text-start px-3 py-2.5 rounded-lg border transition-colors ${
                    selectedClientId === c.id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <p className="text-sm font-medium dark:text-white">{c.name}</p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                    {t('common.balance')}: {formatCurrency(c.current_balance)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Payment Form */}
        <div className="lg:col-span-2 space-y-4">
          {selectedClient && (
            <div className="card border-l-4 border-primary-500">
              <h3 className="font-semibold mb-4 dark:text-white">{selectedClient.name}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('settlements.payment_amount')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(e) => { setPaymentAmount(e.target.value); setPreview([]); setShowPreview(false); }}
                    className="input-field w-full"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('sales.payment_method')}
                  </label>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="input-field w-full">
                    <option value="cash">{t('sales.cash')}</option>
                    <option value="bank_transfer">{t('sales.bank_transfer')}</option>
                    <option value="check">{t('sales.check')}</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('common.notes')}
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="input-field w-full"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={computePreview}
                  disabled={!paymentAmount}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  {t('settlements.preview')}
                </button>
              </div>
            </div>
          )}

          {/* Invoices Table */}
          {selectedClient && (
            <div className="card">
              <h3 className="font-semibold mb-4 dark:text-white">{t('sales.invoice')} - {t('common.balance')}</h3>
              {loadingInvoices ? (
                <p className="text-sm text-gray-400">{t('common.loading')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-start py-2 px-3 text-gray-500 dark:text-gray-400">{t('settlements.invoice')}</th>
                        <th className="text-start py-2 px-3 text-gray-500 dark:text-gray-400">{t('common.date')}</th>
                        <th className="text-start py-2 px-3 text-gray-500 dark:text-gray-400">{t('common.total')}</th>
                        <th className="text-start py-2 px-3 text-gray-500 dark:text-gray-400">{t('common.balance')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className="py-2 px-3 font-mono text-primary-600">{inv.invoice_number}</td>
                          <td className="py-2 px-3 text-gray-600 dark:text-gray-300">{inv.invoice_date}</td>
                          <td className="py-2 px-3">{formatCurrency(inv.total)}</td>
                          <td className="py-2 px-3 text-red-600 dark:text-red-400 font-medium">{formatCurrency(inv.remaining_amount)}</td>
                        </tr>
                      ))}
                      {invoices.length === 0 && (
                        <tr><td colSpan={4} className="py-4 text-center text-gray-400">{t('common.no_data')}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      <Modal isOpen={showPreview} onClose={() => setShowPreview(false)} title={t('settlements.preview')} size="lg">
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
              {t('settlements.payment_amount')}: <span className="font-bold">{formatCurrency(parseFloat(paymentAmount) || 0)}</span>
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">{selectedClient?.name}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-start py-2 px-3 text-gray-500">{t('settlements.invoice')}</th>
                  <th className="text-start py-2 px-3 text-gray-500">{t('common.balance')}</th>
                  <th className="text-start py-2 px-3 text-gray-500">{t('settlements.allocated')}</th>
                  <th className="text-start py-2 px-3 text-gray-500">{t('common.balance')} بعد</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p) => (
                  <tr key={p.invoice_id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2 px-3 font-mono text-primary-600">{p.invoice_number}</td>
                    <td className="py-2 px-3">{formatCurrency(p.remaining_before)}</td>
                    <td className="py-2 px-3 text-green-600 dark:text-green-400 font-medium">{formatCurrency(p.allocated)}</td>
                    <td className="py-2 px-3 text-red-600 dark:text-red-400">{formatCurrency(p.remaining_after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowPreview(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="btn-primary flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {submitting ? t('common.loading') : t('settlements.confirm')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

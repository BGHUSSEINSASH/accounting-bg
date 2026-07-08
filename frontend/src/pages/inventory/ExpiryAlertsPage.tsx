import { useState, useEffect } from 'react';
import { Calendar, AlertTriangle, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import PrintButton from '../../components/ui/PrintButton';
import { formatDate, formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function ExpiryAlertsPage() {
  const { t } = useTranslation();
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ item_id: '', batch_number: '', quantity: '', expiry_date: '', purchase_price: '' });

  const loadBatches = () => {
    setLoading(true);
    api.get('/expiry-alerts?days=365').then(res => { setBatches(res.data || []); setLoading(false); });
  };

  useEffect(() => {
    loadBatches();
    api.get('/items').then(res => setItems(res.data || []));
  }, []);

  const getDaysUntilExpiry = (expiryDate: string) => {
    const now = new Date();
    const exp = new Date(expiryDate);
    return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getRowClass = (expiryDate: string) => {
    const days = getDaysUntilExpiry(expiryDate);
    if (days <= 0) return 'bg-red-100 dark:bg-red-900/30';
    if (days <= 7) return 'bg-red-50 dark:bg-red-900/20';
    if (days <= 30) return 'bg-yellow-50 dark:bg-yellow-900/20';
    return '';
  };

  const getStatusBadge = (expiryDate: string) => {
    const days = getDaysUntilExpiry(expiryDate);
    if (days <= 0) return <span className="badge-danger">{t('expiry.expired')}</span>;
    if (days <= 7) return <span className="badge-danger">{days} {t('expiry.days')}</span>;
    if (days <= 30) return <span className="badge-warning">{days} {t('expiry.days')}</span>;
    return <span className="badge-success">{days} {t('expiry.days')}</span>;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/expiry-alerts', {
        item_id: Number(form.item_id),
        batch_number: form.batch_number,
        quantity: Number(form.quantity),
        expiry_date: form.expiry_date,
        purchase_price: Number(form.purchase_price) || 0,
      });
      toast.success(t('common.success'));
      setShowModal(false);
      setForm({ item_id: '', batch_number: '', quantity: '', expiry_date: '', purchase_price: '' });
      loadBatches();
    } catch { toast.error(t('error.save')); }
  };

  const columns = [
    { key: 'item_code', label: t('common.code'), render: (_: any, row: any) => row.item_code },
    { key: 'item_name', label: t('common.name'), render: (_: any, row: any) => row.item_name },
    { key: 'batch_number', label: t('expiry.batch_number') },
    { key: 'quantity', label: t('common.quantity') },
    { key: 'expiry_date', label: t('expiry.expiry_date'), render: (v: string) => formatDate(v) },
    { key: 'status', label: t('common.status'), render: (_: any, row: any) => getStatusBadge(row.expiry_date) },
    { key: 'purchase_price', label: t('items.purchase_price'), render: (v: number) => v ? formatCurrency(v) : '-' },
  ];

  return (
    <div>
      <PageHeader
        title={t('expiry.title')}
        subtitle={t('expiry.subtitle')}
        actions={
          <div className="flex gap-2">
            <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-1.5">
              <Package className="w-4 h-4" /> {t('expiry.add_batch')}
            </button>
            <PrintButton />
          </div>
        }
      />
      <DataTable columns={columns} data={batches} loading={loading} searchable />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={t('expiry.add_batch')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-200">{t('common.item')}</label>
            <select value={form.item_id} onChange={e => setForm({ ...form, item_id: e.target.value })} required className="input-field">
              <option value="">{t('common.select')}</option>
              {items.map((item: any) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-200">{t('expiry.batch_number')}</label>
            <input type="text" value={form.batch_number} onChange={e => setForm({ ...form, batch_number: e.target.value })} required className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-200">{t('common.quantity')}</label>
            <input type="number" step="0.001" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} required className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-200">{t('expiry.expiry_date')}</label>
            <input type="date" value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} required className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-200">{t('items.purchase_price')}</label>
            <input type="number" step="0.01" value={form.purchase_price} onChange={e => setForm({ ...form, purchase_price: e.target.value })} className="input-field" />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

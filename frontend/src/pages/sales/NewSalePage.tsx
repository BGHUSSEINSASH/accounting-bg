import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import BarcodeScanner from '../../components/ui/BarcodeScanner';
import { formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function NewSalePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [clients, setClients] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [salesReps, setSalesReps] = useState<any[]>([]);
  const [form, setForm] = useState({
    client_id: '', invoice_date: new Date().toISOString().split('T')[0], sales_rep_id: '',
    discount: 0, tax: 0, paid_amount: 0, payment_method: 'cash', notes: '', doctor_id: ''
  });
  const [invoiceItems, setInvoiceItems] = useState([{ item_id: '', quantity: 1, unit_price: 0, discount: 0 }]);
  const [loading, setLoading] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/clients/all'),
      api.get('/items/all'),
      api.get('/doctors/all'),
      api.get('/auth/users'),
    ]).then(([c, i, d, u]) => {
      setClients(c.data);
      setItems(i.data);
      setDoctors(d.data);
      setSalesReps(u.data.filter((x: any) => x.role === 'sales_rep'));
    }).catch((err: any) => {
      toast.error(err.response?.data?.error || t('error.load'));
    });
  }, []);

  const [itemSearch, setItemSearch] = useState('');
  const addItem = () => setInvoiceItems([...invoiceItems, { item_id: '', quantity: 1, unit_price: 0, discount: 0 }]);
  const removeItem = (idx: number) => invoiceItems.length > 1 && setInvoiceItems(invoiceItems.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...invoiceItems];
    (updated[idx] as any)[field] = value;
    if (field === 'item_id') {
      const item = items.find(i => i.id === parseInt(value));
      if (item) {
        updated[idx] = { ...updated[idx], unit_price: item.selling_price };
      }
    }
    setInvoiceItems(updated);
  };
  const filteredItems = itemSearch ? items.filter((i: any) => i.name.toLowerCase().includes(itemSearch.toLowerCase())) : items;

  const handleBarcodeScan = async (barcode: string) => {
    setBarcodeLoading(true);
    try {
      const res = await api.get(`/barcode/lookup/${encodeURIComponent(barcode)}`);
      const item = res.data;
      const existingItem = items.find((i: any) => i.id === item.id);
      if (existingItem) {
        const emptyIdx = invoiceItems.findIndex(it => !it.item_id);
        if (emptyIdx >= 0) {
          updateItem(emptyIdx, 'item_id', String(item.id));
          updateItem(emptyIdx, 'unit_price', item.selling_price);
          updateItem(emptyIdx, 'quantity', 1);
        } else {
          setInvoiceItems(prev => [...prev, { item_id: String(item.id), quantity: 1, unit_price: item.selling_price, discount: 0 }]);
        }
        toast.success(`تم إضافة ${item.name}`);
      } else {
        toast.error('المنتج غير موجود في القائمة');
      }
    } catch {
      toast.error('الباركود غير موجود');
    } finally {
      setBarcodeLoading(false);
    }
  };

  const subtotal = invoiceItems.reduce((sum, it) => sum + (it.quantity * it.unit_price), 0);
  const discountAmount = subtotal * (Number(form.discount) / 100);
  const taxAmount = (subtotal - discountAmount) * (Number(form.tax) / 100);
  const total = subtotal - discountAmount + taxAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const items = invoiceItems.map(it => ({
        item_id: parseInt(it.item_id), quantity: it.quantity, unit_price: it.unit_price, discount: it.discount
      }));
      await api.post('/sales', {
        ...form,
        client_id: form.client_id ? parseInt(form.client_id) : null,
        sales_rep_id: form.sales_rep_id ? parseInt(form.sales_rep_id) : null,
        doctor_id: form.doctor_id ? parseInt(form.doctor_id) : null,
        paid_amount: parseFloat(form.paid_amount.toString()),
        items
      });
      navigate('/sales/invoices');
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('error.save'));
    } finally { setLoading(false); }
  };

  return (
    <div>
      <PageHeader title={t('sales.new')} actions={<PrintButton />} />
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="card lg:col-span-2">
              <h3 className="font-semibold mb-4">{t('sales.invoice_items')}</h3>
              <div className="mb-4">
                <BarcodeScanner onScan={handleBarcodeScan} />
                {barcodeLoading && <p className="text-xs text-blue-500 mt-1">جاري البحث...</p>}
              </div>
              <div className="mb-2"><input type="text" value={itemSearch} onChange={e => setItemSearch(e.target.value)} placeholder={t('common.search') + '...'} className="input-field text-xs" /></div>
              <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr><th className="table-header">{t('common.item')}</th><th className="table-header">{t('common.quantity')}</th><th className="table-header">{t('common.price')}</th><th className="table-header">{t('common.discount')}</th><th className="table-header text-left">{t('common.total')}</th><th className="table-header"></th></tr></thead>
                <tbody>
                  {invoiceItems.map((it, idx) => (
                    <tr key={idx}>
                      <td className="table-cell">
                        <select value={it.item_id} onChange={e => updateItem(idx, 'item_id', e.target.value)} className="select-field text-xs" required>
                          <option value="">{t('sales.select_item')}</option>
                          {filteredItems.map((i: any) => <option key={i.id} value={i.id}>{i.name} ({i.current_quantity} {t('sales.available')})</option>)}
                        </select>
                      </td>
                      <td className="table-cell"><input type="number" min={1} value={it.quantity} onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)} className="input-field text-xs w-20" required /></td>
                      <td className="table-cell"><input type="number" step="0.01" value={it.unit_price} onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)} className="input-field text-xs w-24" required /></td>
                      <td className="table-cell"><input type="number" step="0.01" value={it.discount} onChange={e => updateItem(idx, 'discount', parseFloat(e.target.value) || 0)} className="input-field text-xs w-20" /></td>
                      <td className="table-cell text-left font-mono">{formatCurrency(it.quantity * it.unit_price)}</td>
                      <td className="table-cell">{invoiceItems.length > 1 && <button type="button" onClick={() => removeItem(idx)} className="text-red-500"><Trash2 className="w-4 h-4" /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={addItem} className="btn-secondary text-sm mt-3 flex items-center gap-1"><Plus className="w-4 h-4" /> {t('sales.add_item')}</button>
          </div>

          <div className="space-y-6">
            <div className="card">
              <h3 className="font-semibold mb-4">{t('sales.invoice_info')}</h3>
              <div className="space-y-3">
                <div><label className="block text-xs font-medium mb-1">{t('common.date')}</label><input type="date" value={form.invoice_date} onChange={e => setForm({ ...form, invoice_date: e.target.value })} className="input-field text-sm" required /></div>
                <div><label className="block text-xs font-medium mb-1">{t('sales.client')}</label><select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} className="select-field text-sm"><option value="">{t('sales.cash_client')}</option>{clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div><label className="block text-xs font-medium mb-1">{t('sales.sales_rep')}</label><select value={form.sales_rep_id} onChange={e => setForm({ ...form, sales_rep_id: e.target.value })} className="select-field text-sm"><option value="">{t('common.select')}</option>{salesReps.map((u: any) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></div>
                <div><label className="block text-xs font-medium mb-1">{t('sales.doctor_optional')}</label><select value={form.doctor_id} onChange={e => setForm({ ...form, doctor_id: e.target.value })} className="select-field text-sm"><option value="">{t('sales.no_doctor')}</option>{doctors.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
              </div>
            </div>

            <div className="card">
              <h3 className="font-semibold mb-4">{t('sales.payments_section')}</h3>
              <div className="space-y-3">
                <div className="flex justify-between"><span>{t('sales.subtotal')}</span><span className="font-mono">{formatCurrency(subtotal)}</span></div>
                <div className="flex items-center gap-2"><span className="text-sm">{t('sales.discount_percent')}</span><input type="number" value={form.discount} onChange={e => setForm({ ...form, discount: Number(e.target.value) })} className="input-field text-sm w-20" /></div>
                <div className="flex items-center gap-2"><span className="text-sm">{t('sales.tax_percent')}</span><input type="number" value={form.tax} onChange={e => setForm({ ...form, tax: Number(e.target.value) })} className="input-field text-sm w-20" /></div>
                <div className="flex justify-between font-bold text-lg border-t pt-2"><span>{t('common.total')}</span><span className="text-primary-600">{formatCurrency(total)}</span></div>
                <div><label className="block text-xs font-medium mb-1">{t('sales.paid')}</label><input type="number" step="0.01" value={form.paid_amount} onChange={e => setForm({ ...form, paid_amount: Number(e.target.value) })} className="input-field text-sm" /></div>
                <div><label className="block text-xs font-medium mb-1">{t('common.payment_method')}</label><select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })} className="select-field text-sm"><option value="cash">{t('payment.cash')}</option><option value="card">{t('payment.card')}</option><option value="credit">{t('payment.credit')}</option><option value="transfer">{t('payment.transfer')}</option></select></div>
                <div><label className="block text-xs font-medium mb-1">{t('common.notes')}</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-field text-sm" rows={2} /></div>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3">{loading ? t('sales.saving') : t('sales.save_invoice')}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

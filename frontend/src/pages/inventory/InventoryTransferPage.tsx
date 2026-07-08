import { useState, useEffect } from 'react';
import { ArrowRightLeft, Plus, Check, X, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import { formatDate } from '../../utils/format';

export default function InventoryTransferPage() {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState({ from_warehouse_id: '', to_warehouse_id: '', transfer_date: new Date().toISOString().split('T')[0], notes: '', items: [{ item_id: '', quantity: 1, notes: '' }] });

  useEffect(() => { fetchData(); }, [page]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tRes, wRes, iRes] = await Promise.all([
        api.get(`/inventory-transfers?page=${page}&limit=20`),
        api.get('/warehouses'),
        api.get('/items/all'),
      ]);
      setTransfers(tRes.data.transfers || []);
      setTotal(tRes.data.total || 0);
      setWarehouses(wRes.data?.warehouses || wRes.data || []);
      setItems(iRes.data || []);
    } catch { toast.error('فشل تحميل البيانات'); }
    finally { setLoading(false); }
  };

  const addItem = () => setForm({...form, items: [...form.items, { item_id: '', quantity: 1, notes: '' }]});
  const removeItem = (i: number) => setForm({...form, items: form.items.filter((_, idx) => idx !== i)});
  const updateItem = (i: number, field: string, value: any) => {
    const updated = [...form.items];
    updated[i] = {...updated[i], [field]: value};
    setForm({...form, items: updated});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const validItems = form.items.filter(it => it.item_id && it.quantity > 0);
      if (validItems.length === 0) return toast.error('يجب إضافة أصناف');
      await api.post('/inventory-transfers', {...form, items: validItems.map(it => ({...it, quantity: parseFloat(String(it.quantity)), item_id: parseInt(it.item_id)}))});
      toast.success('تم إنشاء طلب التحويل');
      setShowModal(false);
      setForm({ from_warehouse_id: '', to_warehouse_id: '', transfer_date: new Date().toISOString().split('T')[0], notes: '', items: [{ item_id: '', quantity: 1, notes: '' }] });
      fetchData();
    } catch (err: any) { toast.error(err.response?.data?.error || 'فشل الحفظ'); }
  };

  const completeTransfer = async (id: number) => {
    try {
      await api.post(`/inventory-transfers/${id}/complete`);
      toast.success('تم إتمام التحويل بنجاح');
      fetchData();
    } catch (err: any) { toast.error(err.response?.data?.error || 'فشل التنفيذ'); }
  };

  const cancelTransfer = async (id: number) => {
    try {
      await api.post(`/inventory-transfers/${id}/cancel`);
      toast.success('تم الإلغاء');
      fetchData();
    } catch { toast.error('فشل الإلغاء'); }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, {cls: string, label: string}> = {
      pending: {cls: 'badge-warning', label: 'معلق'},
      completed: {cls: 'badge-success', label: 'مكتمل'},
      cancelled: {cls: 'badge-error', label: 'ملغي'},
    };
    const s = map[status] || {cls: 'badge-info', label: status};
    return <span className={`badge ${s.cls}`}>{s.label}</span>;
  };

  return (
    <div>
      <PageHeader title="تحويلات المخزون" actions={
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> تحويل جديد
        </button>
      } />

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead><tr className="bg-gray-50 text-sm text-gray-600">
            <th className="text-right p-3">رقم التحويل</th>
            <th className="text-right p-3">التاريخ</th>
            <th className="text-right p-3">من مستودع</th>
            <th className="text-right p-3">إلى مستودع</th>
            <th className="text-right p-3">الحالة</th>
            <th className="p-3">إجراءات</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="text-center p-8 text-gray-400">جاري التحميل...</td></tr> :
            transfers.length === 0 ? <tr><td colSpan={6} className="text-center p-8 text-gray-400"><ArrowRightLeft className="w-8 h-8 mx-auto mb-2 text-gray-300" /><p>لا توجد تحويلات</p></td></tr> :
            transfers.map((t: any) => (
              <tr key={t.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-medium text-primary-600">{t.transfer_number}</td>
                <td className="p-3">{formatDate(t.transfer_date)}</td>
                <td className="p-3">{t.from_warehouse_name}</td>
                <td className="p-3">{t.to_warehouse_name}</td>
                <td className="p-3">{statusBadge(t.status)}</td>
                <td className="p-3">
                  {t.status === 'pending' && (
                    <div className="flex gap-2">
                      <button onClick={() => completeTransfer(t.id)} className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-600 rounded text-xs hover:bg-green-100" title="اعتماد وتنفيذ">
                        <Check className="w-3 h-3" /> تنفيذ
                      </button>
                      <button onClick={() => cancelTransfer(t.id)} className="flex items-center gap-1 px-2 py-1 bg-red-50 text-red-500 rounded text-xs hover:bg-red-100" title="إلغاء">
                        <X className="w-3 h-3" /> إلغاء
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} total={total} limit={20} onPageChange={setPage} />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="تحويل مخزون جديد" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">من مستودع *</label>
              <select className="input-field" required value={form.from_warehouse_id} onChange={e => setForm({...form, from_warehouse_id: e.target.value})}>
                <option value="">اختر...</option>
                {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></div>
            <div><label className="label">إلى مستودع *</label>
              <select className="input-field" required value={form.to_warehouse_id} onChange={e => setForm({...form, to_warehouse_id: e.target.value})}>
                <option value="">اختر...</option>
                {warehouses.filter(w => w.id !== parseInt(form.from_warehouse_id)).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></div>
            <div><label className="label">تاريخ التحويل</label>
              <input type="date" className="input-field" value={form.transfer_date} onChange={e => setForm({...form, transfer_date: e.target.value})} /></div>
            <div><label className="label">ملاحظات</label>
              <input className="input-field" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="label mb-0">الأصناف *</label>
              <button type="button" onClick={addItem} className="text-primary-600 text-sm flex items-center gap-1 hover:underline">
                <Plus className="w-3 h-3" /> إضافة صنف
              </button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {form.items.map((item, i) => (
                <div key={i} className="flex gap-2 items-center bg-gray-50 p-2 rounded-lg">
                  <select className="input-field flex-1 text-sm" required value={item.item_id} onChange={e => updateItem(i, 'item_id', e.target.value)}>
                    <option value="">اختر صنف...</option>
                    {items.map((it: any) => <option key={it.id} value={it.id}>{it.name} ({it.code}) - متاح: {it.current_quantity}</option>)}
                  </select>
                  <input type="number" min="0.01" step="0.01" className="input-field w-24 text-sm" placeholder="الكمية" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} />
                  {form.items.length > 1 && <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">إلغاء</button>
            <button type="submit" className="btn-primary flex items-center gap-2"><Package className="w-4 h-4" /> إنشاء التحويل</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

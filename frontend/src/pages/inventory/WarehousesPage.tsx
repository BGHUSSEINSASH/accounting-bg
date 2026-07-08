import { useState, useEffect, Fragment } from 'react';
import { Plus, Edit2, Trash2, ChevronDown, ChevronLeft, Package, ArrowRightLeft } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { useTranslation } from '../../i18n/context';

export default function WarehousesPage() {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWarehouse, setSelectedWarehouse] = useState<any>(null);
  const [warehouseItems, setWarehouseItems] = useState<any[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', location: '', phone: '' });
  const [showItemModal, setShowItemModal] = useState(false);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [itemForm, setItemForm] = useState({ item_id: '', quantity: 1 });
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [allWarehouses, setAllWarehouses] = useState<any[]>([]);
  const [transferForm, setTransferForm] = useState({ to_warehouse_id: '', item_id: '', quantity: 1 });
  const [confirmDelete, setConfirmDelete] = useState<{id: number; type: 'warehouse' | 'item'} | null>(null);

  useEffect(() => { fetchWarehouses(); }, []);

  const fetchWarehouses = async () => {
    try {
      const res = await api.get('/warehouses');
      setWarehouses(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('warehouses.title'));
    } finally {
      setLoading(false);
    }
  };

  const toggleWarehouse = async (wh: any) => {
    if (selectedWarehouse?.id === wh.id) {
      setSelectedWarehouse(null);
      setWarehouseItems([]);
      return;
    }
    setSelectedWarehouse(wh);
    setItemsLoading(true);
    try {
      const res = await api.get(`/warehouses/${wh.id}/items`);
      setWarehouseItems(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('warehouses.title'));
    } finally {
      setItemsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/warehouses/${editing.id}`, form);
        toast.success(t('common.save'));
      } else {
        await api.post('/warehouses', form);
        toast.success(t('common.save'));
      }
      setShowModal(false);
      setEditing(null);
      setForm({ name: '', location: '', phone: '' });
      fetchWarehouses();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('common.save'));
    }
  };

  const handleEdit = (wh: any) => {
    setEditing(wh);
    setForm({ name: wh.name, location: wh.location || '', phone: wh.phone || '' });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/warehouses/${id}`);
      toast.success(t('common.save'));
      if (selectedWarehouse?.id === id) { setSelectedWarehouse(null); setWarehouseItems([]); }
      fetchWarehouses();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('common.save'));
    }
  };

  const openAddItemModal = async (wh: any) => {
    setSelectedWarehouse(wh);
    setItemForm({ item_id: '', quantity: 1 });
    if (allItems.length === 0) {
      try { const res = await api.get('/items/all'); setAllItems(res.data); } catch {}
    }
    setShowItemModal(true);
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/warehouses/${selectedWarehouse.id}/items`, { item_id: parseInt(itemForm.item_id), quantity: itemForm.quantity });
      toast.success(t('common.save'));
      setShowItemModal(false);
      const res = await api.get(`/warehouses/${selectedWarehouse.id}/items`);
      setWarehouseItems(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('common.save'));
    }
  };

  const handleRemoveItem = async (itemId: number) => {
    try {
      await api.delete(`/warehouses/${selectedWarehouse.id}/items/${itemId}`);
      toast.success(t('common.save'));
      const res = await api.get(`/warehouses/${selectedWarehouse.id}/items`);
      setWarehouseItems(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('common.save'));
    }
  };

  const openTransferModal = async () => {
    try {
      const res = await api.get('/warehouses');
      setAllWarehouses(res.data.filter((w: any) => w.id !== selectedWarehouse.id));
    } catch {}
    setTransferForm({ to_warehouse_id: '', item_id: '', quantity: 1 });
    setShowTransferModal(true);
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/warehouses/${selectedWarehouse.id}/transfer`, {
        to_warehouse_id: parseInt(transferForm.to_warehouse_id),
        item_id: parseInt(transferForm.item_id),
        quantity: transferForm.quantity,
      });
      toast.success(t('common.save'));
      setShowTransferModal(false);
      const res = await api.get(`/warehouses/${selectedWarehouse.id}/items`);
      setWarehouseItems(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('common.save'));
    }
  };

  return (
    <div>
      <Breadcrumbs items={[{ label: t('inventory.items'), path: '/inventory' }, { label: t('warehouses.breadcrumb') }]} />
      <PageHeader title={t('warehouses.title')} actions={<><button onClick={() => { setEditing(null); setForm({ name: '', location: '', phone: '' }); setShowModal(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('warehouses.add')}</button><PrintButton /></>} />

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header"></th>
                <th className="table-header">{t('common.code')}</th>
                <th className="table-header">{t('common.name')}</th>
                <th className="table-header">{t('warehouses.location')}</th>
                <th className="table-header">{t('warehouses.phone')}</th>
                <th className="table-header"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-500">{t('common.loading')}</td></tr>
              ) : warehouses.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-500">{t('warehouses.no_warehouses')}</td></tr>
              ) : (
                warehouses.map((wh: any) => (
                  <Fragment key={wh.id}>
                    <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => toggleWarehouse(wh)}>
                      <td className="table-cell w-10">
                        {selectedWarehouse?.id === wh.id ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronLeft className="w-4 h-4 text-gray-400" />}
                      </td>
                      <td className="table-cell text-gray-500">{wh.code}</td>
                      <td className="table-cell font-medium">{wh.name}</td>
                      <td className="table-cell">{wh.location || '-'}</td>
                      <td className="table-cell" dir="ltr">{wh.phone || '-'}</td>
                      <td className="table-cell">
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => handleEdit(wh)} className="p-1 hover:bg-gray-100 rounded"><Edit2 className="w-4 h-4 text-blue-500" /></button>
                          <button onClick={() => setConfirmDelete({id: wh.id, type: 'warehouse'})} className="p-1 hover:bg-gray-100 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button>
                        </div>
                      </td>
                    </tr>
                    {selectedWarehouse?.id === wh.id && (
                      <tr>
                        <td colSpan={6} className="p-4 bg-gray-50">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-semibold text-sm flex items-center gap-2"><Package className="w-4 h-4" /> {t('warehouses.warehouse_items')}</h4>
                            <div className="flex gap-2">
                              <button onClick={() => openAddItemModal(wh)} className="btn-secondary text-xs flex items-center gap-1"><Plus className="w-3 h-3" /> {t('warehouses.add_item')}</button>
                              <button onClick={() => { setSelectedWarehouse(wh); openTransferModal(); }} className="btn-secondary text-xs flex items-center gap-1"><ArrowRightLeft className="w-3 h-3" /> {t('warehouses.transfer')}</button>
                            </div>
                          </div>
                          {itemsLoading ? (
                            <p className="text-sm text-gray-500 text-center py-4">{t('common.loading')}</p>
                          ) : warehouseItems.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-4">{t('warehouses.no_items')}</p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-right py-2 px-2 font-medium text-gray-600">{t('warehouses.item_name')}</th>
                                  <th className="text-right py-2 px-2 font-medium text-gray-600">{t('warehouses.item_code')}</th>
                                  <th className="text-right py-2 px-2 font-medium text-gray-600">{t('inventory.stock')}</th>
                                  <th className="py-2 px-2"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {warehouseItems.map((wi: any) => (
                                  <tr key={wi.id} className="border-b border-gray-200 last:border-0">
                                    <td className="py-2 px-2">{wi.item_name}</td>
                                    <td className="py-2 px-2 text-gray-500">{wi.item_code}</td>
                                    <td className="py-2 px-2 font-mono">{wi.quantity}</td>
                                    <td className="py-2 px-2">
                                      <button onClick={() => setConfirmDelete({id: wi.item_id || wi.id, type: 'item'})} className="p-1 hover:bg-gray-200 rounded"><Trash2 className="w-3 h-3 text-red-500" /></button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? t('warehouses.edit') : t('warehouses.add')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">{t('common.name')} *</label><input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" required /></div>
          <div><label className="block text-sm font-medium mb-1">{t('warehouses.location')}</label><input type="text" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="input-field" /></div>
          <div><label className="block text-sm font-medium mb-1">{t('warehouses.phone')}</label><input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-field" /></div>
          <button type="submit" className="btn-primary w-full">{editing ? t('common.update') : t('common.add')}</button>
        </form>
      </Modal>

      <Modal isOpen={showItemModal} onClose={() => setShowItemModal(false)} title={t('warehouses.add_item')}>
        <form onSubmit={handleAddItem} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">{t('common.name')} *</label><select value={itemForm.item_id} onChange={e => setItemForm({ ...itemForm, item_id: e.target.value })} className="select-field" required><option value="">{t('warehouses.select_item')}</option>{allItems.map((i: any) => <option key={i.id} value={i.id}>{i.name} ({i.code})</option>)}</select></div>
          <div><label className="block text-sm font-medium mb-1">{t('inventory.stock')} *</label><input type="number" min={1} value={itemForm.quantity} onChange={e => setItemForm({ ...itemForm, quantity: parseInt(e.target.value) || 0 })} className="input-field" required /></div>
          <button type="submit" className="btn-primary w-full">{t('common.add')}</button>
        </form>
      </Modal>

      <Modal isOpen={showTransferModal} onClose={() => setShowTransferModal(false)} title={t('warehouses.transfer_items')} size="lg">
        <form onSubmit={handleTransfer} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">{t('warehouses.transfer_to')} *</label><select value={transferForm.to_warehouse_id} onChange={e => setTransferForm({ ...transferForm, to_warehouse_id: e.target.value })} className="select-field" required><option value="">{t('warehouses.select_target')}</option>{allWarehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          <div><label className="block text-sm font-medium mb-1">{t('common.name')} *</label><select value={transferForm.item_id} onChange={e => setTransferForm({ ...transferForm, item_id: e.target.value })} className="select-field" required><option value="">{t('warehouses.select_item')}</option>{warehouseItems.filter((wi: any) => wi.quantity > 0).map((wi: any) => <option key={wi.id} value={wi.item_id || wi.id}>{wi.item_name} ({t('warehouses.available')}: {wi.quantity})</option>)}</select></div>
          <div><label className="block text-sm font-medium mb-1">{t('inventory.stock')} *</label><input type="number" min={1} value={transferForm.quantity} onChange={e => setTransferForm({ ...transferForm, quantity: parseInt(e.target.value) || 0 })} className="input-field" required /></div>
          <button type="submit" className="btn-primary w-full">{t('warehouses.transfer')}</button>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete?.type === 'warehouse') handleDelete(confirmDelete.id);
          else if (confirmDelete?.type === 'item') handleRemoveItem(confirmDelete.id);
          setConfirmDelete(null);
        }}
        title={t('common.confirm_title')}
        message={confirmDelete?.type === 'warehouse' ? t('warehouses.confirm_delete_warehouse') : t('warehouses.confirm_remove_item')}
        variant="danger"
      />
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Edit2, Trash2, Printer } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import InvoicePrintModal from '../../components/printing/InvoicePrintModal';
import { formatDate, formatCurrency, getStatusBadgeClass, getStatusText } from '../../utils/format';
import { PAYMENT_STATUS } from '../../utils/constants';
import { useTranslation } from '../../i18n/context';

export default function SalesInvoicesPage() {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [printInvoice, setPrintInvoice] = useState<any>(null);

  useEffect(() => { fetchInvoices(); }, [page, filterStatus]);

  const fetchInvoices = async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString(), limit: '20' });
    if (filterStatus) params.append('payment_status', filterStatus);
    if (search) params.append('search', search);
    const res = await api.get(`/sales?${params}`);
    setInvoices(res.data.invoices);
    setTotal(res.data.total);
    setLoading(false);
  };

  const handleDelete = async (id: number) => {
    await api.delete(`/sales/${id}`);
    fetchInvoices();
  };

  const handlePrint = async (id: number) => {
    try {
      const res = await api.get(`/sales/${id}/print`);
      setPrintInvoice(res.data);
    } catch { } // silent fail if print endpoint not available
  };

  return (
    <div>
      <PageHeader title={t('sales.title')} actions={<><Link to="/sales/new" className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('sales.new_invoice')}</Link><PrintButton /></>} />

      <div className="card">
        <div className="flex gap-3 mb-4">
          <div className="flex-1"><input type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setPage(1); fetchInvoices(); } }} placeholder={t('common.search')} className="input-field" /></div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="select-field w-40">
            <option value="">{t('sales.all')}</option>
            {PAYMENT_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="table-header">{t('sales.invoice_number')}</th><th className="table-header">{t('common.date')}</th><th className="table-header">{t('sales.client')}</th><th className="table-header">{t('sales.sales_rep')}</th><th className="table-header text-left">{t('common.total')}</th><th className="table-header text-left">{t('sales.paid')}</th><th className="table-header">{t('payment.method')}</th><th className="table-header">{t('common.status')}</th><th className="table-header"></th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-8">{t('common.loading')}</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-500">{t('sales.no_invoices')}</td></tr>
              ) : invoices.map((inv: any) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium"><Link to={`/sales/new?id=${inv.id}`} className="hover:text-primary-600 transition-colors">{inv.invoice_number}</Link></td>
                  <td className="table-cell">{formatDate(inv.invoice_date)}</td>
                  <td className="table-cell"><Link to={'/sales/clients'} className="hover:text-primary-600 transition-colors">{inv.client_name || t('payment.cash')}</Link></td>
                  <td className="table-cell">{inv.sales_rep_name || '-'}</td>
                  <td className="table-cell text-left font-mono">{formatCurrency(inv.total)}</td>
                  <td className="table-cell text-left font-mono">{formatCurrency(inv.paid_amount)}</td>
                  <td className="table-cell">{inv.payment_method ? getStatusText(inv.payment_method) : '-'}</td>
                  <td className="table-cell"><span className={`badge ${getStatusBadgeClass(inv.payment_status)}`}>{getStatusText(inv.payment_status)}</span></td>
                  <td className="table-cell">
                    <div className="flex gap-1 items-center justify-end">
                      <button onClick={() => handlePrint(inv.id)} className="p-1 hover:bg-gray-100 rounded" title={t('common.print')}><Printer className="w-4 h-4 text-gray-500" /></button>
                      <Link to={`/sales/new?id=${inv.id}`} className="p-1 hover:bg-gray-100 rounded inline-block"><Edit2 className="w-4 h-4 text-blue-500" /></Link>
                      <button onClick={() => setConfirmDelete(inv.id)} className="p-1 hover:bg-gray-100 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination page={page} total={total} limit={20} onPageChange={setPage} />
      </div>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { handleDelete(confirmDelete!); setConfirmDelete(null); }}
        title={t('sales.delete_title')}
        message={t('sales.delete_message')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />
      <InvoicePrintModal
        isOpen={printInvoice !== null}
        onClose={() => setPrintInvoice(null)}
        data={printInvoice}
        type="sales"
      />
    </div>
  );
}

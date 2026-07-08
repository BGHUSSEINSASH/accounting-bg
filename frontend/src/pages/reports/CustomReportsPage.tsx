import { useState, useCallback } from 'react';
import { Play, Download, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import DataTable from '../../components/ui/DataTable';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import { formatDate } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

const reportTypes = (t: (key: string) => string) => [
  { value: 'sales', label: t('nav.sales') },
  { value: 'purchases', label: t('nav.purchases') },
  { value: 'items', label: t('inventory.items') },
  { value: 'clients', label: t('nav.clients') },
  { value: 'attendance', label: t('nav.attendance') },
];

export default function CustomReportsPage() {
  const { t } = useTranslation();
  const [reportType, setReportType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const getColumns = useCallback(() => {
    switch (reportType) {
      case 'sales':
        return [
          { key: 'invoice_number', label: t('tax_report.subtotal'), render: (v: string) => <span className="font-medium">{v || '-'}</span> },
          { key: 'invoice_date', label: t('common.date'), render: (v: string) => v ? formatDate(v) : '-' },
          { key: 'client_name', label: t('nav.clients') },
          { key: 'total', label: t('common.total') },
        ];
      case 'purchases':
        return [
          { key: 'invoice_number', label: t('tax_report.subtotal'), render: (v: string) => <span className="font-medium">{v || '-'}</span> },
          { key: 'invoice_date', label: t('common.date'), render: (v: string) => v ? formatDate(v) : '-' },
          { key: 'supplier_name', label: t('nav.suppliers') },
          { key: 'total', label: t('common.total') },
        ];
      case 'items':
        return [
          { key: 'code', label: t('common.code') },
          { key: 'name', label: t('common.name') },
          { key: 'category', label: t('inventory.categories') },
          { key: 'current_quantity', label: t('inventory.stock') },
          { key: 'purchase_price', label: t('items.purchase_price') },
          { key: 'selling_price', label: t('items.selling_price') },
        ];
      case 'clients':
        return [
          { key: 'code', label: t('common.code') },
          { key: 'name', label: t('common.name') },
          { key: 'phone', label: t('common.phone') },
          { key: 'city', label: t('clients.city') },
          { key: 'current_balance', label: t('clients.balance') },
        ];
      case 'attendance':
        return [
          { key: 'full_name', label: t('attendance.employee') },
          { key: 'date', label: t('common.date'), render: (v: string) => v ? formatDate(v) : '-' },
          { key: 'check_in_time', label: t('attendance.check_in_time') },
          { key: 'check_out_time', label: t('attendance.check_out_time') },
          { key: 'status', label: t('common.status') },
        ];
      default:
        return [];
    }
  }, [reportType]);

  const handleRun = async () => {
    if (!reportType) { toast.error(t('custom_report.type_required')); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.append('from', from);
      if (to) params.append('to', to);
      const res = await api.get(`/reports/export/${reportType}?${params}`);
      const result = res.data.data || res.data.report || res.data.results || res.data;
      setData(Array.isArray(result) ? result : []);
      if (!result || (Array.isArray(result) && result.length === 0)) toast(t('custom_report.no_results'));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.load'));
    } finally { setLoading(false); }
  };

  const handleExport = async () => {
    if (!reportType || data.length === 0) { toast.error(t('custom_report.no_results')); return; }
    setExporting(true);
    try {
      const params = new URLSearchParams({ type: reportType, format: 'csv' });
      if (from) params.append('from', from);
      if (to) params.append('to', to);
      const res = await api.get(`/reports/export/${reportType}?${params}`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportType}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t('common.export'));
    } catch {
      try {
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${reportType}-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(t('common.export'));
      } catch { toast.error(t('error.save')); }
    } finally { setExporting(false); }
  };

  return (
    <div>
      <Breadcrumbs items={[{ label: t('reports.title'), path: '/reports' }, { label: t('reports.custom') }]} />
      <PageHeader title={t('reports.custom')} actions={<PrintButton />} />

      <div className="card">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">{t('custom_report.type')}</label>
            <select value={reportType} onChange={e => { setReportType(e.target.value); setData([]); }} className="select-field w-48">
              <option value="">{t('custom_report.select_type')}</option>
              {reportTypes(t).map(rt => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('custom_report.from')}</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('custom_report.to')}</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input-field" />
          </div>
          <button onClick={handleRun} disabled={!reportType || loading} className="btn-primary flex items-center gap-2">
            <Play className="w-4 h-4" /> {loading ? t('custom_report.running') : t('custom_report.run')}
          </button>
        </div>
      </div>

      {data.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">{t('custom_report.results_count')}: {data.length}</p>
            <button onClick={handleExport} disabled={exporting} className="btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" /> {exporting ? t('custom_report.exporting') : t('custom_report.export_excel')}
            </button>
          </div>
          <DataTable columns={getColumns()} data={data} loading={false} />
        </div>
      )}

      {reportType && !loading && data.length === 0 && (
        <div className="card text-center py-12 mt-6">
          <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">{t('custom_report.run_prompt')}</p>
        </div>
      )}
    </div>
  );
}

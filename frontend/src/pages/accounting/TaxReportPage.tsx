import { useState, useEffect } from 'react';
import { Printer, DollarSign, TrendingUp, TrendingDown, Calculator, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import DataTable from '../../components/ui/DataTable';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import PageHeader from '../../components/ui/PageHeader';
import PrintButton from '../../components/ui/PrintButton';
import StatCard from '../../components/ui/StatCard';
import { formatDate, formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/context';

export default function TaxReportPage() {
  const { t } = useTranslation();
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [loading, setLoading] = useState(false);
  const [sales, setSales] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [summary, setSummary] = useState({ totalSales: 0, outputVat: 0, totalPurchases: 0, inputVat: 0, netVat: 0 });

  useEffect(() => { fetchData(); }, [from, to]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [salesRes, purchasesRes] = await Promise.all([
        api.get(`/sales?from=${from}&to=${to}`),
        api.get(`/purchases?from=${from}&to=${to}`),
      ]);
      const salesData = salesRes.data.sales || salesRes.data.invoices || salesRes.data.data || salesRes.data || [];
      const purchasesData = purchasesRes.data.purchases || purchasesRes.data.invoices || purchasesRes.data.data || purchasesRes.data || [];
      setSales(Array.isArray(salesData) ? salesData : []);
      setPurchases(Array.isArray(purchasesData) ? purchasesData : []);
      const totalSales = (Array.isArray(salesData) ? salesData : []).reduce((s: number, i: any) => s + Number(i.total || i.subtotal || 0), 0);
      const outputVat = (Array.isArray(salesData) ? salesData : []).reduce((s: number, i: any) => s + Number(i.tax || i.vat || 0), 0);
      const totalPurchases = (Array.isArray(purchasesData) ? purchasesData : []).reduce((s: number, i: any) => s + Number(i.total || i.subtotal || 0), 0);
      const inputVat = (Array.isArray(purchasesData) ? purchasesData : []).reduce((s: number, i: any) => s + Number(i.tax || i.vat || 0), 0);
      setSummary({ totalSales, outputVat, totalPurchases, inputVat, netVat: outputVat - inputVat });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('error.load'));
    } finally { setLoading(false); }
  };

  const handlePrint = () => window.print();

  const saleColumns = [
    { key: 'invoice_number', label: t('common.invoice_number'), render: (v: string) => <span className="font-medium">{v || '-'}</span> },
    { key: 'invoice_date', label: t('common.date'), render: (v: string) => v ? formatDate(v) : '-' },
    { key: 'client_name', label: t('common.client') },
    { key: 'subtotal', label: t('tax_report.subtotal'), render: (v: number) => <span className="font-mono">{formatCurrency(v || 0)}</span> },
    { key: 'tax', label: t('tax_report.tax'), render: (_: any, row: any) => <span className="font-mono text-red-600">{formatCurrency(row.tax || row.vat || 0)}</span> },
    { key: 'total', label: t('tax_report.total_with_tax'), render: (v: number) => <span className="font-mono font-bold">{formatCurrency(v || 0)}</span> },
  ];

  const purchaseColumns = [
    { key: 'invoice_number', label: t('common.invoice_number'), render: (v: string) => <span className="font-medium">{v || '-'}</span> },
    { key: 'invoice_date', label: t('common.date'), render: (v: string) => v ? formatDate(v) : '-' },
    { key: 'supplier_name', label: t('common.supplier') },
    { key: 'subtotal', label: t('tax_report.subtotal'), render: (v: number) => <span className="font-mono">{formatCurrency(v || 0)}</span> },
    { key: 'tax', label: t('tax_report.tax'), render: (_: any, row: any) => <span className="font-mono text-red-600">{formatCurrency(row.tax || row.vat || 0)}</span> },
    { key: 'total', label: t('tax_report.total_with_tax'), render: (v: number) => <span className="font-mono font-bold">{formatCurrency(v || 0)}</span> },
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: t('nav.accounting'), path: '/accounting' }, { label: t('tax_report.title') }]} />
      <PageHeader title={t('tax_report.title')} actions={
        <><button onClick={handlePrint} className="btn-primary flex items-center gap-2"><Printer className="w-4 h-4" /> {t('tax_report.print')}</button><PrintButton /></>
      } />

      <div className="flex items-center gap-4 mb-6">
        <div><label className="block text-sm font-medium mb-1">{t('common.from')}</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input-field" /></div>
        <div><label className="block text-sm font-medium mb-1">{t('common.to')}</label><input type="date" value={to} onChange={e => setTo(e.target.value)} className="input-field" /></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard title={t('tax_report.total_sales')} value={formatCurrency(summary.totalSales)} icon={<TrendingUp className="w-6 h-6" />} color="green" />
        <StatCard title={t('tax_report.sales_vat')} value={formatCurrency(summary.outputVat)} icon={<DollarSign className="w-6 h-6" />} color="primary" />
        <StatCard title={t('tax_report.total_purchases')} value={formatCurrency(summary.totalPurchases)} icon={<TrendingDown className="w-6 h-6" />} color="red" />
        <StatCard title={t('tax_report.purchases_vat')} value={formatCurrency(summary.inputVat)} icon={<Calculator className="w-6 h-6" />} color="yellow" />
        <StatCard title={t('tax_report.net_vat')} value={formatCurrency(summary.netVat)} icon={<FileText className="w-6 h-6" />} color={summary.netVat >= 0 ? 'green' : 'red'} subtitle={summary.netVat >= 0 ? t('tax_report.owed') : t('tax_report.refundable')} />
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">{t('common.loading')}</div>
      ) : (
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold mb-3 text-lg text-green-600">{t('tax_report.sales_invoices')}</h3>
            <DataTable columns={saleColumns} data={sales} loading={false} />
          </div>
          <div>
            <h3 className="font-semibold mb-3 text-lg text-red-600">{t('tax_report.purchase_invoices')}</h3>
            <DataTable columns={purchaseColumns} data={purchases} loading={false} />
          </div>
        </div>
      )}
    </div>
  );
}
